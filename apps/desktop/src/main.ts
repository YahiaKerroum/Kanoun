import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow, dialog, Menu, Tray, nativeImage } from "electron";
import { DESKTOP_CONTROL_PORT } from "./shared/desktop-config.js";
import {
  ensureDesktopDirectories,
  resolveDesktopPaths,
} from "./shared/desktop-paths.js";
import { loadOrCreateDesktopSecrets } from "./shared/desktop-secrets.js";
import { parseReadyLine } from "./shared/orchestrator-protocol.js";
import { performDemoDataReset } from "./reset-demo-data.js";
import { buildTrayMenuTemplate } from "./tray-menu.js";
import { WindowRegistry, type RoleWindowHandle } from "./window-registry.js";

// A second launch while an instance is already running must never proceed:
// it would spawn its own orchestrator against the same control port/secret,
// and either instance's quit could tear down the other's backend. Exit
// immediately, before any orchestrator/window setup below runs.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// A minimal 1x1 PNG, used as a functional placeholder tray icon so packaging
// does not depend on a binary asset file. Swap for a real icon later.
const trayIconDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const repositoryRoot = app.isPackaged
  ? join(process.resourcesPath, "app-bundle")
  : join(app.getAppPath(), "..", "..");
const orchestratorEntry = join(
  repositoryRoot,
  "scripts",
  "desktop-orchestrator.ts",
);

let homeWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let orchestratorChild: ChildProcess | undefined;
let launcherOrigin: string | undefined;
let controlSecret = "";
const windowRegistry = new WindowRegistry();
let nextWindowId = 1;
let quitting = false;

function refreshTrayMenu(): void {
  if (!tray) {
    return;
  }
  tray.setContextMenu(
    Menu.buildFromTemplate(
      buildTrayMenuTemplate(windowRegistry.list(), {
        openHome: openHomeWindow,
        resetDemoData: () => {
          handleResetDemoData().catch((error: unknown) => {
            process.stderr.write(
              `Reset demo data failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
            );
          });
        },
        quit: () => app.quit(),
      }),
    ),
  );
}

function openHomeWindow(): void {
  if (!launcherOrigin) {
    return;
  }
  if (homeWindow && !homeWindow.isDestroyed()) {
    homeWindow.loadURL(launcherOrigin).catch(() => undefined);
    homeWindow.focus();
    return;
  }
  const window = new BrowserWindow({
    width: 1180,
    height: 820,
    title: "MISE Desktop",
  });
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(({ url, frameName }) => {
    openRoleWindow(url, frameName);
    return { action: "deny" };
  });
  window.on("closed", () => {
    if (homeWindow === window) {
      homeWindow = undefined;
    }
  });
  homeWindow = window;
  window.loadURL(launcherOrigin).catch(() => undefined);
}

function openRoleWindow(url: string, frameName?: string): void {
  const id = nextWindowId;
  nextWindowId += 1;
  const label = frameName && frameName !== "_blank" ? frameName : url;
  const roleWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    title: label,
    webPreferences: { partition: `role-${String(id)}` },
  });
  roleWindow.setMenuBarVisibility(false);
  const handle: RoleWindowHandle = {
    id,
    roleKey: label,
    label,
    close: () => roleWindow.close(),
    focus: () => roleWindow.focus(),
  };
  windowRegistry.register(handle);
  roleWindow.on("closed", () => {
    windowRegistry.unregister(id);
    refreshTrayMenu();
  });
  roleWindow.loadURL(url).catch(() => undefined);
  refreshTrayMenu();
}

async function handleResetDemoData(): Promise<void> {
  await performDemoDataReset({
    closeRoleWindows: () => windowRegistry.closeAll(),
    requestReset: async () => {
      const response = await fetch(
        `http://127.0.0.1:${String(DESKTOP_CONTROL_PORT)}/reset`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${controlSecret}` },
        },
      );
      if (!response.ok) {
        throw new Error(
          `Reset demo data failed with status ${String(response.status)}.`,
        );
      }
    },
    reopenHomeWindow: () => {
      homeWindow?.close();
      homeWindow = undefined;
      openHomeWindow();
    },
  });
  refreshTrayMenu();
}

async function startOrchestrator(): Promise<void> {
  const paths = resolveDesktopPaths(app.getPath("appData"));
  await ensureDesktopDirectories(paths);
  const secrets = await loadOrCreateDesktopSecrets(paths.secretsFile);
  controlSecret = secrets.controlSecret;
  const log = createWriteStream(paths.logFile, { flags: "a" });
  const child = spawn(
    process.execPath,
    ["--import", "tsx", orchestratorEntry],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        // Electron's own binary is process.execPath; this flag makes it run
        // as plain Node instead of launching another GUI process. Descendant
        // processes (api/worker/vite preview) inherit it because
        // scripts/desktop-orchestrator.ts's runtimeEnvironment() spreads
        // ...process.env into their env too.
        ELECTRON_RUN_AS_NODE: "1",
        MISE_DESKTOP_APP_DATA_DIR: app.getPath("appData"),
        MISE_DESKTOP_REPOSITORY_ROOT: repositoryRoot,
      },
      windowsHide: true,
    },
  );
  orchestratorChild = child;
  let partial = "";
  let readyOnce = false;
  let recentOutput = "";
  const trackOutput = (chunk: Buffer): void => {
    recentOutput = (recentOutput + chunk.toString("utf8")).slice(-4_000);
  };
  child.stdout.on("data", (chunk: Buffer) => {
    log.write(chunk);
    trackOutput(chunk);
    partial += chunk.toString("utf8");
    const lines = partial.split(/\r?\n/);
    partial = lines.pop() ?? "";
    for (const line of lines) {
      const ready = parseReadyLine(line);
      if (ready) {
        readyOnce = true;
        launcherOrigin = ready.launcherOrigin;
        openHomeWindow();
      }
    }
  });
  child.stderr.on("data", (chunk: Buffer) => {
    log.write(chunk);
    trackOutput(chunk);
  });
  child.once("error", (error) => {
    if (quitting) {
      return;
    }
    dialog.showErrorBox(
      "MISE Desktop could not start the demo",
      `The demo environment process failed to launch: ${error.message}\n\nFull log: ${paths.logFile}`,
    );
  });
  child.once("exit", (code, signal) => {
    if (quitting) {
      return;
    }
    if (!readyOnce || (code !== 0 && signal === null)) {
      dialog.showErrorBox(
        "MISE Desktop could not start the demo",
        `The demo environment stopped unexpectedly (${signal ? `signal ${signal}` : `exit code ${String(code)}`}).\n\n${recentOutput.trim()}\n\nFull log: ${paths.logFile}`,
      );
    }
  });
}

app
  .whenReady()
  .then(() => {
    tray = new Tray(nativeImage.createFromDataURL(trayIconDataUrl));
    tray.setToolTip("MISE Desktop");
    refreshTrayMenu();
    startOrchestrator().catch((error: unknown) => {
      process.stderr.write(
        `Failed to start the desktop orchestrator: ${error instanceof Error ? error.message : "unknown error"}\n`,
      );
    });
  })
  .catch(() => undefined);

app.on("window-all-closed", () => {
  // Intentionally do not quit: the orchestrator (and the demo it runs) keep
  // running via the tray, so a tester can reopen the home window later.
});

app.on("second-instance", () => {
  if (homeWindow && !homeWindow.isDestroyed()) {
    if (homeWindow.isMinimized()) {
      homeWindow.restore();
    }
    homeWindow.focus();
  } else {
    openHomeWindow();
  }
});

app.on("before-quit", (event) => {
  if (quitting) {
    return;
  }
  quitting = true;
  event.preventDefault();
  shutdownOrchestrator()
    .catch(() => undefined)
    .finally(() => app.quit());
});

async function shutdownOrchestrator(): Promise<void> {
  const child = orchestratorChild;
  if (!child) {
    return;
  }
  const exited = new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
  });
  try {
    await fetch(`http://127.0.0.1:${String(DESKTOP_CONTROL_PORT)}/shutdown`, {
      method: "POST",
      headers: { authorization: `Bearer ${controlSecret}` },
    });
  } catch {
    // The orchestrator may already be unreachable; fall through to the
    // timeout below and force-terminate it if it never exits on its own.
  }
  await Promise.race([
    exited,
    new Promise<void>((resolve) => setTimeout(resolve, 8_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    if (process.platform === "win32" && child.pid) {
      const { execFile } = await import("node:child_process");
      await new Promise<void>((resolve) => {
        execFile("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], () =>
          resolve(),
        );
      });
    } else {
      child.kill();
    }
  }
}
