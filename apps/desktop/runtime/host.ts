import { appendFileSync, mkdirSync, statSync, truncateSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { seedDemoData } from "../../../scripts/demo-seed-data.js";
import {
  describeDatabaseError,
  listRestaurants,
  migrate,
  testConnection,
  type FriendlyError,
} from "./database.js";
import {
  findPostgresBinDirectory,
  recreateLocalDatabase,
  startLocalPostgres,
  type LocalPostgres,
} from "./local-postgres.js";
import {
  describeDatabaseUrl,
  parseCommand,
  type ConnectionSettings,
  type RestaurantDraft,
  type RuntimeCommand,
  type RuntimeOutput,
  type RuntimeState,
  type SampleRestaurant,
  type StartupStep,
  type WorkspaceUrls,
} from "./protocol.js";
import { startRecoveryInbox } from "./recovery-inbox.js";
import { startServiceProcess, type ServiceProcess } from "./service-process.js";
import {
  allocatePorts,
  loadOrCreateSecrets,
  loadSample,
  loadSettings,
  resolveDataPaths,
  saveSample,
  saveSettings,
  settingsFor,
  type DesktopSecrets,
  type DesktopSettings,
} from "./settings.js";
import { startWebAppServer } from "./web-server.js";

const SAMPLE_BUSINESS_CODE = "dar-nedjma-demo";

const dataRoot = process.env.MISE_DATA_DIR;
if (!dataRoot) {
  process.stderr.write("MISE_DATA_DIR is required.\n");
  process.exit(2);
}

const resourcesRoot =
  process.env.MISE_RESOURCES_DIR ?? dirname(fileURLToPath(import.meta.url));
const paths = resolveDataPaths(dataRoot);
mkdirSync(dirname(paths.logFile), { recursive: true });
try {
  if (statSync(paths.logFile).size > 5_000_000) {
    truncateSync(paths.logFile, 0);
  }
} catch {
  // No log yet.
}

function log(line: string): void {
  appendFileSync(paths.logFile, `${new Date().toISOString()} ${line}\n`);
}

// When the desktop shell dies, stdout becomes a broken pipe. Writing to it
// must never crash the host before it has stopped PostgreSQL.
let stdoutOpen = true;
process.stdout.on("error", () => {
  stdoutOpen = false;
});

function emit(output: RuntimeOutput): void {
  if (!stdoutOpen) {
    return;
  }
  try {
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch {
    stdoutOpen = false;
  }
}

interface Closeable {
  readonly close: () => Promise<void>;
}

let settings: DesktopSettings | undefined;
let secrets: DesktopSecrets;
let localPostgres: LocalPostgres | undefined;
let databaseUrl: string | undefined;
let services: ServiceProcess[] = [];
let servers: Closeable[] = [];
let state: RuntimeState = { phase: "starting", dataDirectory: paths.root };

function setState(next: Omit<RuntimeState, "dataDirectory">): void {
  // Recovery messages survive phase changes until the runtime restarts.
  state = {
    ...next,
    ...(state.recovery ? { recovery: state.recovery } : {}),
    dataDirectory: paths.root,
  };
  emit({ event: "state", state });
}

function urlsFor(current: DesktopSettings): WorkspaceUrls {
  return {
    staff: `http://127.0.0.1:${String(current.ports.staff)}`,
    admin: `http://127.0.0.1:${String(current.ports.admin)}`,
    guest: `http://127.0.0.1:${String(current.ports.guest)}`,
  };
}

function databaseLabel(connection: ConnectionSettings): string {
  return connection.mode === "local"
    ? "On this computer"
    : describeDatabaseUrl(connection.databaseUrl);
}

class StartupError extends Error {
  public constructor(public readonly friendly: FriendlyError) {
    super(friendly.title);
  }
}

function serviceEnvironment(
  current: DesktopSettings,
  url: string,
): NodeJS.ProcessEnv {
  const urls = urlsFor(current);
  return {
    ...process.env,
    NODE_ENV: "development",
    LOG_LEVEL: "warn",
    API_HOST: "127.0.0.1",
    API_PORT: String(current.ports.api),
    TRUST_PROXY: "false",
    DATABASE_URL: url,
    SESSION_SECRET: secrets.sessionSecret,
    BOOTSTRAP_SECRET: secrets.bootstrapSecret,
    SUPPORT_ACCESS_SECRET: secrets.supportAccessSecret,
    GUEST_ACCESS_SECRET: secrets.guestAccessSecret,
    SESSION_COOKIE_SECURE: "false",
    WEB_ORIGIN: urls.admin,
    STAFF_WEB_ORIGIN: urls.staff,
    CUSTOMER_WEB_ORIGIN: urls.guest,
    RECOVERY_DELIVERY_URL: `http://127.0.0.1:${String(current.ports.recovery)}/deliver`,
    RECOVERY_DELIVERY_SECRET: secrets.recoveryDeliverySecret,
    WORKER_ID: `mise-desktop-${
      hostname()
        .replace(/[^\w-]/g, "")
        .slice(0, 60) || "host"
    }`,
    WORKER_METRICS_HOST: "",
  };
}

async function startServices(current: DesktopSettings, url: string) {
  const urls = urlsFor(current);
  const env = serviceEnvironment(current, url);
  servers.push(
    await startRecoveryInbox({
      port: current.ports.recovery,
      secret: secrets.recoveryDeliverySecret,
      staffOrigin: urls.staff,
      onMessage: (message) => {
        log(`[recovery] reset link issued for ${message.businessCode}`);
        state = {
          ...state,
          recovery: [message, ...(state.recovery ?? [])].slice(0, 5),
        };
        emit({ event: "state", state });
      },
    }),
  );
  const api = await startServiceProcess({
    label: "API",
    entry: join(resourcesRoot, "api.mjs"),
    env,
    log,
  });
  services.push(api);
  const worker = await startServiceProcess({
    label: "background worker",
    entry: join(resourcesRoot, "worker.mjs"),
    env,
    log,
  });
  services.push(worker);
  for (const [name, port] of [
    ["staff", current.ports.staff],
    ["admin", current.ports.admin],
    ["guest", current.ports.guest],
  ] as const) {
    servers.push(
      await startWebAppServer({
        root: join(resourcesRoot, "web", name),
        port,
        apiPort: current.ports.api,
        origins: { ...urls },
      }),
    );
  }
  for (const service of services) {
    const watched = service;
    void watched.exited.then(() => {
      if (services.includes(watched) && state.phase !== "stopping") {
        log(`[host] ${watched.label} exited unexpectedly`);
        void stopServices().then(() => {
          setState({
            phase: "error",
            mode: current.connection.mode,
            databaseLabel: databaseLabel(current.connection),
            error: {
              title: `The ${watched.label} stopped unexpectedly`,
              detail:
                "Restart MISE services to continue. The runtime log in the data folder has the details.",
            },
          });
        });
      }
    });
  }
}

async function stopServices(): Promise<void> {
  const running = services;
  services = [];
  await Promise.all(running.map((service) => service.stop()));
  const open = servers;
  servers = [];
  await Promise.all(open.map((server) => server.close()));
}

async function stopEverything(): Promise<void> {
  await stopServices();
  const cluster = localPostgres;
  localPostgres = undefined;
  databaseUrl = undefined;
  await cluster?.stop();
}

async function step<T>(
  current: DesktopSettings,
  name: StartupStep,
  work: () => Promise<T>,
): Promise<T> {
  setState({
    phase: "starting",
    step: name,
    mode: current.connection.mode,
    databaseLabel: databaseLabel(current.connection),
  });
  return work();
}

async function openDatabase(current: DesktopSettings): Promise<string> {
  if (current.connection.mode === "server") {
    const url = current.connection.databaseUrl;
    try {
      await testConnection(url);
    } catch (error: unknown) {
      throw new StartupError(describeDatabaseError(error, url));
    }
    return url;
  }
  const binDirectory = findPostgresBinDirectory(resourcesRoot);
  if (!binDirectory) {
    throw new StartupError({
      title: "PostgreSQL is missing from this installation",
      detail:
        "Reinstall MISE, or connect to a PostgreSQL server instead of storing data on this computer.",
    });
  }
  try {
    localPostgres = await startLocalPostgres({
      binDirectory,
      clusterDirectory: paths.clusterDirectory,
      port: current.ports.postgres,
      password: secrets.localDatabasePassword,
      log,
    });
  } catch (error: unknown) {
    throw new StartupError({
      title: "The local database did not start",
      detail: error instanceof Error ? error.message : "See the runtime log.",
    });
  }
  return localPostgres.databaseUrl;
}

async function publishReadyState(current: DesktopSettings): Promise<void> {
  if (!databaseUrl) {
    return;
  }
  const restaurants = await listRestaurants(databaseUrl);
  const sample = await loadSample(paths);
  setState({
    phase: restaurants.length === 0 ? "welcome" : "ready",
    mode: current.connection.mode,
    databaseLabel: databaseLabel(current.connection),
    urls: urlsFor(current),
    restaurants,
    ...(sample &&
    restaurants.some((item) => item.businessCode === sample.businessCode)
      ? { sample }
      : {}),
  });
}

async function boot(current: DesktopSettings): Promise<void> {
  try {
    databaseUrl = await step(current, "database", () => openDatabase(current));
    const url = databaseUrl;
    await step(current, "migrations", async () => {
      try {
        await migrate(url, join(resourcesRoot, "migrations"));
      } catch (error: unknown) {
        log(`[host] migration failed: ${String(error)}`);
        throw new StartupError(describeDatabaseError(error, url));
      }
    });
    await step(current, "services", () => startServices(current, url));
    await publishReadyState(current);
  } catch (error: unknown) {
    log(
      `[host] startup failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
    );
    await stopEverything().catch(() => undefined);
    setState({
      phase: "error",
      mode: current.connection.mode,
      databaseLabel: databaseLabel(current.connection),
      error:
        error instanceof StartupError
          ? error.friendly
          : {
              title: "MISE could not start",
              detail:
                error instanceof Error ? error.message : "See the runtime log.",
            },
    });
  }
}

function requireReady(current: DesktopSettings | undefined): DesktopSettings {
  if (!current || !databaseUrl || services.length === 0) {
    throw new Error("MISE is not running yet. Wait for startup to finish.");
  }
  return current;
}

async function createRestaurant(draft: RestaurantDraft): Promise<void> {
  const current = requireReady(settings);
  const days = [0, 1, 2, 3, 4, 5, 6];
  const response = await fetch(
    `http://127.0.0.1:${String(current.ports.api)}/api/v1/platform/tenants`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bootstrap-secret": secrets.bootstrapSecret,
      },
      body: JSON.stringify({
        businessCode: draft.businessCode,
        businessName: draft.businessName,
        restaurantName: draft.restaurantName,
        branch: {
          name: draft.branchName,
          address: {
            line1: draft.addressLine,
            city: draft.city,
            countryCode: draft.countryCode,
          },
          contact: { phone: draft.phone },
          timeZone: draft.timeZone,
          currency: draft.currency,
          openingHours: days.map((dayOfWeek) => ({
            dayOfWeek,
            opensAt: draft.opensAt,
            closesAt: draft.closesAt,
          })),
        },
        owner: {
          displayName: draft.ownerName,
          email: draft.ownerEmail,
          password: draft.ownerPassword,
        },
      }),
    },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; detail?: string; code?: string };
    };
    if (response.status === 409) {
      throw new Error(
        "That business code is already used. Pick a different one.",
      );
    }
    throw new Error(
      body.error?.detail ??
        body.error?.message ??
        `The restaurant was not created (HTTP ${String(response.status)}).`,
    );
  }
  await publishReadyState(current);
}

async function loadSampleRestaurant(): Promise<void> {
  const current = requireReady(settings);
  if (!databaseUrl) {
    return;
  }
  // The sample is its own business, so it can sit beside real restaurants;
  // it is only refused when it is already there.
  if (
    (await listRestaurants(databaseUrl)).some(
      (restaurant) => restaurant.businessCode === SAMPLE_BUSINESS_CODE,
    )
  ) {
    throw new Error("The sample restaurant is already in this database.");
  }
  const result = await seedDemoData({
    connectionString: databaseUrl,
    password: secrets.samplePassword,
    sessionSecret: secrets.sessionSecret,
    guestAccessSecret: secrets.guestAccessSecret,
    customerWebOrigin: urlsFor(current).guest,
  });
  const table = result.customerUrls[0];
  const sample: SampleRestaurant = {
    businessCode: result.businessCode,
    restaurantName: result.restaurantName,
    branchName: result.branchName,
    password: secrets.samplePassword,
    roles: result.roles.map((role) => ({
      label: role.label,
      displayName: role.displayName,
      email: role.email,
      workspace: role.target === "administration" ? "admin" : "staff",
    })),
    ...(table ? { tableUrl: table.url, tableCode: table.tableCode } : {}),
  };
  await saveSample(paths, sample);
  await publishReadyState(current);
}

async function resetLocalData(): Promise<void> {
  const current = requireReady(settings);
  if (current.connection.mode !== "local" || !localPostgres || !databaseUrl) {
    throw new Error("Only data stored on this computer can be erased here.");
  }
  const url = databaseUrl;
  const adminUrl = localPostgres.adminUrl;
  await stopServices();
  setState({
    phase: "starting",
    step: "migrations",
    mode: "local",
    databaseLabel: databaseLabel(current.connection),
  });
  await recreateLocalDatabase(adminUrl);
  await saveSample(paths, undefined);
  await migrate(url, join(resourcesRoot, "migrations"));
  await step(current, "services", () => startServices(current, url));
  await publishReadyState(current);
}

async function configure(connection: ConnectionSettings): Promise<void> {
  if (connection.mode === "server") {
    try {
      await testConnection(connection.databaseUrl);
    } catch (error: unknown) {
      const friendly = describeDatabaseError(error, connection.databaseUrl);
      throw new Error(`${friendly.title}. ${friendly.detail}`, {
        cause: error,
      });
    }
  }
  await stopEverything();
  const ports = settings?.ports ?? (await allocatePorts());
  settings = settingsFor(connection, ports);
  await saveSettings(paths, settings);
  void boot(settings);
}

let shuttingDown = false;

async function shutdown(): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  setState({ phase: "stopping" });
  await stopEverything().catch((error: unknown) => {
    log(`[host] shutdown error: ${String(error)}`);
  });
  log("[host] stopped");
}

async function handle(command: RuntimeCommand): Promise<unknown> {
  switch (command.type) {
    case "status":
      return state;
    case "configure":
      await configure(command.settings);
      return null;
    case "testConnection":
      try {
        return { serverVersion: await testConnection(command.databaseUrl) };
      } catch (error: unknown) {
        const friendly = describeDatabaseError(error, command.databaseUrl);
        throw new Error(`${friendly.title}. ${friendly.detail}`, {
          cause: error,
        });
      }
    case "createRestaurant":
      await createRestaurant(command.restaurant);
      return null;
    case "loadSample":
      await loadSampleRestaurant();
      return null;
    case "retry":
      if (settings) {
        await stopEverything();
        void boot(settings);
      }
      return null;
    case "resetLocalData":
      await resetLocalData();
      return null;
    case "shutdown":
      await shutdown();
      return null;
  }
}

// Commands run one at a time; a status query never waits behind a long one.
let queue: Promise<unknown> = Promise.resolve();

function dispatch(line: string): void {
  const parsed = parseCommand(line);
  if (!parsed.ok) {
    if (parsed.id !== undefined) {
      emit({
        id: parsed.id,
        ok: false,
        error: { message: "The request was not understood." },
      });
    }
    return;
  }
  const { command } = parsed;
  const run = async (): Promise<void> => {
    try {
      emit({ id: command.id, ok: true, result: await handle(command) });
    } catch (error: unknown) {
      log(`[host] ${command.type} failed: ${String(error)}`);
      emit({
        id: command.id,
        ok: false,
        error: {
          message:
            error instanceof Error ? error.message : "Something went wrong.",
        },
      });
    }
    if (command.type === "shutdown") {
      process.exit(0);
    }
  };
  if (command.type === "status") {
    void run();
  } else {
    queue = queue.then(run);
  }
}

// Last line of defence: whatever goes wrong, try to leave nothing running.
process.on("uncaughtException", (error) => {
  log(`[host] unexpected error: ${error.stack ?? error.message}`);
  void shutdown().finally(() => process.exit(1));
});

async function main(): Promise<void> {
  log(`[host] starting; resources at ${resourcesRoot}`);
  secrets = await loadOrCreateSecrets(paths);
  settings = await loadSettings(paths);
  const input = createInterface({ input: process.stdin });
  input.on("line", dispatch);
  // If the desktop shell disappears without asking, still stop cleanly so
  // PostgreSQL is never left running.
  input.on("close", () => {
    void shutdown().then(() => process.exit(0));
  });
  if (settings) {
    void boot(settings);
  } else {
    setState({ phase: "setup" });
  }
}

void main();
