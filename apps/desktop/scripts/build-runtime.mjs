// Assembles everything the Tauri shell ships next to its Node sidecar:
//
//   build/runtime/host.mjs, api.mjs, worker.mjs   esbuild bundles
//   build/runtime/node_modules/argon2 (+ deps)     native module, not bundleable
//   build/runtime/migrations/                      versioned SQL migrations
//   build/runtime/web/{staff,admin,guest}/         built React apps
//   build/runtime/postgresql/                      bundled PostgreSQL (optional)
//   src-tauri/binaries/mise-node-<triple>.exe      the Node runtime itself
//
// Bundling with esbuild (instead of copying the pnpm node_modules tree) is
// what makes the result relocatable: pnpm's symlinked layout is what broke
// the previous Electron packaging.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(desktopRoot, "..", "..");
const output = join(desktopRoot, "build", "runtime");

function step(message) {
  process.stdout.write(`• ${message}\n`);
}

// Keep the (large, slow-to-copy) PostgreSQL folder between builds.
for (const entry of [
  "host.mjs",
  "api.mjs",
  "worker.mjs",
  "node_modules",
  "migrations",
  "web",
]) {
  rmSync(join(output, entry), { recursive: true, force: true });
}
mkdirSync(output, { recursive: true });

step("Bundling the runtime host, API, and worker");
await build({
  entryPoints: {
    host: join(desktopRoot, "runtime", "host.ts"),
    api: join(desktopRoot, "runtime", "api-entry.ts"),
    worker: join(desktopRoot, "runtime", "worker-entry.ts"),
  },
  outdir: output,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  tsconfig: join(repositoryRoot, "tsconfig.base.json"),
  external: ["argon2", "pg-native"],
  legalComments: "none",
  logLevel: "warning",
  // CommonJS dependencies (express, pg, pino, ...) call require() and read
  // __dirname; give the ESM bundle both.
  banner: {
    js: [
      'import { createRequire as __miseCreateRequire } from "node:module";',
      'import { fileURLToPath as __miseFileURLToPath } from "node:url";',
      'import { dirname as __miseDirname } from "node:path";',
      "const require = __miseCreateRequire(import.meta.url);",
      "const __filename = __miseFileURLToPath(import.meta.url);",
      "const __dirname = __miseDirname(__filename);",
    ].join("\n"),
  },
});

step("Copying the argon2 native module");
const modulesRequire = createRequire(
  join(repositoryRoot, "packages", "modules", "package.json"),
);
const argon2Root = realpathSync(
  dirname(modulesRequire.resolve("argon2/package.json")),
);
const argon2Require = createRequire(join(argon2Root, "package.json"));
const nodeModules = join(output, "node_modules");
const platformPrebuild = `${process.platform}-${process.arch}`;
cpSync(argon2Root, join(nodeModules, "argon2"), {
  recursive: true,
  dereference: true,
  filter: (source) => {
    const relative = source.slice(argon2Root.length).replaceAll("\\", "/");
    if (relative.startsWith("/node_modules")) return false;
    if (relative.startsWith("/prebuilds/")) {
      return relative.startsWith(`/prebuilds/${platformPrebuild}`);
    }
    return (
      !/\.(cpp|gyp|map)$/.test(relative) && !relative.startsWith("/argon2/")
    );
  },
});
for (const dependency of ["@phc/format", "node-gyp-build"]) {
  const root = realpathSync(
    dirname(argon2Require.resolve(`${dependency}/package.json`)),
  );
  cpSync(root, join(nodeModules, dependency), {
    recursive: true,
    dereference: true,
  });
}

step("Copying database migrations");
cpSync(join(repositoryRoot, "migrations"), join(output, "migrations"), {
  recursive: true,
});

step("Copying the staff, administration, and guest web apps");
for (const [source, target] of [
  ["staff", "staff"],
  ["admin", "admin"],
  ["customer", "guest"],
]) {
  const dist = join(repositoryRoot, "apps", "web", source, "dist");
  if (!existsSync(join(dist, "index.html"))) {
    throw new Error(
      `apps/web/${source} has not been built. Run "corepack pnpm build" first.`,
    );
  }
  cpSync(dist, join(output, "web", target), { recursive: true });
}

const vendoredPostgres = join(desktopRoot, "vendor", "postgresql");
const bundledPostgres = join(output, "postgresql");
if (existsSync(join(vendoredPostgres, "bin"))) {
  // initdb fails late and cryptically without these; fail the build instead.
  for (const required of [
    "bin/initdb.exe",
    "bin/pg_ctl.exe",
    "bin/postgres.exe",
    "lib/plpgsql.dll",
    "share/timezonesets",
    "share/timezone",
    "share/extension",
  ]) {
    if (!existsSync(join(vendoredPostgres, required))) {
      throw new Error(
        `vendor/postgresql is incomplete: ${required} is missing. See vendor/postgresql/README.md.`,
      );
    }
  }
  const marker = join(bundledPostgres, ".complete");
  if (!existsSync(marker)) {
    step("Copying the bundled PostgreSQL binaries (first build only)");
    rmSync(bundledPostgres, { recursive: true, force: true });
    for (const folder of ["bin", "lib", "share"]) {
      cpSync(join(vendoredPostgres, folder), join(bundledPostgres, folder), {
        recursive: true,
        // pgAdmin/StackBuilder ship in the same zip; Kanoun needs neither.
        filter: (source) => {
          const path = source.replaceAll("\\", "/");
          return (
            !/\/(wx[^/]*\.dll|stackbuilder\.exe|pgAdmin[^/]*)$/i.test(path) &&
            !/\/share\/(doc|locale)(\/|$)/i.test(path)
          );
        },
      });
    }
    writeFileSync(marker, "");
  }
} else {
  mkdirSync(bundledPostgres, { recursive: true });
  step(
    "No vendored PostgreSQL found (see vendor/postgresql/README.md); local mode will use a system PostgreSQL 18 install.",
  );
}

step("Preparing the Node sidecar");
const triple = execFileSync("rustc", ["--print", "host-tuple"], {
  encoding: "utf8",
}).trim();
const extension = process.platform === "win32" ? ".exe" : "";
const sidecar = join(
  desktopRoot,
  "src-tauri",
  "binaries",
  `mise-node-${triple}${extension}`,
);
mkdirSync(dirname(sidecar), { recursive: true });
if (
  !existsSync(sidecar) ||
  statSync(sidecar).size !== statSync(process.execPath).size
) {
  cpSync(process.execPath, sidecar);
}
step(`Runtime ready in ${output} (Node ${process.version})`);
