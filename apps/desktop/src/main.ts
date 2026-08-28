import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow, Menu, Tray, nativeImage } from "electron";
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

// A minimal 1x1 PNG, used as a functional placeholder tray icon so packaging
// does not depend on a binary asset file. Swap for a real icon later.
const trayIconDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const repositoryRoot = app.isPackaged
  ? join(process.resourcesPath, "app-bundle")
  : join(app.getAppPath(), "..", "..");
const orchestratorEntry = join(repositoryRoot, "scripts", "desktop-orchestrator.ts");

let homeWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let orchestratorChild: ChildProcess | undefined;
let launcherOrigin: string | undefined;
let controlSecret = "";
const windowRegistry = new WindowRegistry();
let nextWindowId = 1;

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
  const window = new BrowserWindow({ width: 1180, height: 820, title: "MISE Desktop" });
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(({ url }) => {
    openRoleWindow(url);
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

function openRoleWindow(url: string): void {
  const id = nextWindowId;
  nextWindowId += 1;
  const roleWindow = new BrowserWindow({ width: 1180, height: 820, title: url });
  roleWindow.setMenuBarVisibility(false);
  const handle: RoleWindowHandle = {
    id,
    roleKey: url,
    label: url,
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
        throw new Error(`Reset demo data failed with status ${String(response.status)}.`);
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
  const child = spawn(process.execPath, ["--import", "tsx", orchestratorEntry], {
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
  });
  orchestratorChild = child;
  let partial = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    log.write(chunk);
    partial += chunk.toString("utf8");
    const lines = partial.split(/\r?\n/);
    partial = lines.pop() ?? "";
    for (const line of lines) {
      const ready = parseReadyLine(line);
      if (ready) {
        launcherOrigin = ready.launcherOrigin;
        openHomeWindow();
      }
    }
  });
  child.stderr?.on("data", (chunk: Buffer) => log.write(chunk));
}

app.whenReady().then(() => {
  tray = new Tray(nativeImage.createFromDataURL(trayIconDataUrl));
  tray.setToolTip("MISE Desktop");
  refreshTrayMenu();
  startOrchestrator().catch((error: unknown) => {
    process.stderr.write(
      `Failed to start the desktop orchestrator: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
  });
}).catch(() => undefined);

app.on("window-all-closed", () => {
  // Intentionally do not quit: the orchestrator (and the demo it runs) keep
  // running via the tray, so a tester can reopen the home window later.
});

app.on("before-quit", () => {
  orchestratorChild?.kill();
});
