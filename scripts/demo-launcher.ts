import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { URL } from "node:url";
import { fileURLToPath } from "node:url";
import type {
  DemoRoleCredential,
  DemoRoleKey,
  DemoSeedResult,
} from "./demo-types.js";

const sharedDesignSystem = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "apps",
    "web",
    "design-system.css",
  ),
  "utf8",
);

export interface DemoLauncherOptions {
  readonly result: DemoSeedResult;
  readonly apiOrigin: string;
  readonly adminOrigin: string;
  readonly staffOrigin: string;
  readonly recoveryOrigin: string;
  readonly host: string;
  readonly port: number;
}

export interface DemoLauncherManifest {
  readonly label: "Local synthetic demo";
  readonly businessCode: string;
  readonly restaurantName: string;
  readonly branchName: string;
  readonly roles: readonly {
    readonly key: DemoRoleKey;
    readonly label: string;
    readonly target: DemoRoleCredential["target"];
    readonly launchPath: string;
  }[];
  readonly customerUrls: DemoSeedResult["customerUrls"];
}

export interface DemoLauncher {
  readonly origin: string;
  readonly manifest: DemoLauncherManifest;
  close(): Promise<void>;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function send(
  response: ServerResponse,
  statusCode: number,
  contentType: string,
  body: string,
): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", contentType);
  response.setHeader("cache-control", "no-store");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("x-content-type-options", "nosniff");
  response.end(body);
}

function roleFor(
  result: DemoSeedResult,
  key: DemoRoleKey,
): DemoRoleCredential | undefined {
  return result.roles.find((role) => role.key === key);
}

function targetOrigin(
  role: DemoRoleCredential,
  options: DemoLauncherOptions,
): string {
  return role.target === "administration"
    ? options.adminOrigin
    : options.staffOrigin;
}

async function loginRole(
  role: DemoRoleCredential,
  options: DemoLauncherOptions,
): Promise<readonly string[]> {
  const response = await fetch(
    new URL("/api/v1/auth/login", options.apiOrigin),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        businessCode: options.result.businessCode,
        email: role.email,
        password: role.password,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Role login was rejected with status ${response.status}.`);
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length === 0) {
    throw new Error("Role login did not return a session cookie.");
  }
  return cookies;
}

function launcherManifest(result: DemoSeedResult): DemoLauncherManifest {
  return {
    label: "Local synthetic demo",
    businessCode: result.businessCode,
    restaurantName: result.restaurantName,
    branchName: result.branchName,
    roles: result.roles.map((role) => ({
      key: role.key,
      label: role.label,
      target: role.target,
      launchPath: `/launch/${role.key}`,
    })),
    customerUrls: result.customerUrls,
  };
}

function page(options: DemoLauncherOptions): string {
  const { result } = options;
  const roleCards = result.roles
    .map(
      (role) => `
        <li class="role-card">
          <div class="role-mark" aria-hidden="true">${escapeHtml(role.label.slice(0, 1))}</div>
          <div class="role-copy">
            <span class="role-label">${escapeHtml(role.label)}</span>
            <strong>${escapeHtml(role.displayName)}</strong>
            <code>${escapeHtml(role.email)}</code>
          </div>
          <a class="button button-small" href="/launch/${encodeURIComponent(role.key)}">Open ${escapeHtml(role.target)}</a>
        </li>`,
    )
    .join("");
  const customerLinks = result.customerUrls
    .map(
      (customerUrl) => `
        <li><a href="${escapeHtml(customerUrl.url)}" rel="noreferrer" target="_blank">Table ${escapeHtml(customerUrl.tableCode)} menu <span aria-hidden="true">↗</span></a></li>`,
    )
    .join("");
  const scenarioItems = result.scenario
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#ffb300" />
    <meta name="description" content="Local synthetic MISE demo launcher" />
    <title>MISE · Local demo launcher</title>
    <style>
      ${sharedDesignSystem}
      * { box-sizing: border-box; }
      body { margin: 0; min-width: 320px; background: var(--brand-fill); color: var(--text); font: 15px/1.55 "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif; }
      .shell { width: min(1180px, 100%); margin: 0 auto; }
      .masthead { display: grid; grid-template-columns: 1.2fr .8fr; gap: 28px; padding: clamp(28px, 6vw, 72px); background: radial-gradient(circle at 90% 10%, rgba(255,255,255,.42), transparent 36%), var(--brand-fill); }
      .eyebrow, .role-label { margin: 0; color: var(--brand-700); font-size: 11px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
      h1, h2, h3 { margin: 0; font-family: "Bricolage Grotesque", "Arial Narrow", ui-sans-serif, sans-serif; letter-spacing: -.035em; line-height: 1.02; }
      h1 { max-width: 620px; margin-top: 12px; font-size: clamp(3rem, 8vw, 6.5rem); }
      h2 { font-size: clamp(1.5rem, 3vw, 2.25rem); }
      h3 { font-size: 1.2rem; }
      .lede { max-width: 610px; margin: 20px 0 0; color: #49330b; font-size: clamp(1rem, 2vw, 1.2rem); }
      .status-panel { align-self: end; padding: 20px; border: 1px solid rgba(110,71,0,.2); border-radius: 18px; background: rgba(255,255,255,.55); }
      .status-panel strong { display: block; margin-top: 4px; font-size: 1.4rem; }
      .status-panel code, .role-copy code, .password-value { overflow-wrap: anywhere; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: .86rem; }
      .status-line { display: flex; align-items: center; gap: 9px; color: var(--success); font-size: .78rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
      .status-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--success); box-shadow: 0 0 0 5px rgba(30,122,71,.15); }
      .content { display: grid; grid-template-columns: 1.15fr .85fr; gap: 1px; background: var(--line); }
      section { padding: 34px; background: var(--surface); }
      .section-heading { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin-bottom: 18px; }
      .section-heading p { margin: 0 0 5px; color: var(--muted); font-size: .9rem; }
      .role-list, .scenario-list, .customer-list { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
      .role-card { display: grid; grid-template-columns: 42px 1fr auto; align-items: center; gap: 13px; min-height: 82px; padding: 12px; border: 1px solid var(--line); border-radius: 14px; background: var(--canvas); }
      .role-mark { display: grid; width: 42px; height: 42px; place-items: center; border-radius: 12px; background: var(--brand-100); color: var(--brand-700); font-family: Georgia, serif; font-size: 1.25rem; }
      .role-copy { display: grid; gap: 1px; min-width: 0; }
      .role-copy strong { font-size: 1rem; }
      .role-copy code { color: var(--muted); }
      .button { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; padding: 10px 16px; border: 1px solid var(--brand-700); border-radius: 10px; background: var(--brand-fill); color: var(--brand-700); font-weight: 800; text-decoration: none; transition: background-color 180ms ease, border-color 180ms ease, color 180ms ease, box-shadow 180ms ease, transform 180ms ease; }
      .button:hover { background: #ffc43d; }
      .button:active, .copy-button:active { transform: translateY(1px); }
      .button:focus-visible, a:focus-visible, button:focus-visible { outline: 3px solid #1e1b14; outline-offset: 3px; }
      .button-small { min-height: 44px; padding: 8px 11px; font-size: .78rem; }
      .credential { margin-top: 20px; padding: 16px; border-radius: 14px; background: var(--brand-100); }
      .credential-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 9px; }
      .password-value { flex: 1 1 220px; padding: 9px 11px; border: 1px solid #dfc789; border-radius: 8px; background: rgba(255,255,255,.72); }
      .copy-button { min-height: 44px; padding: 8px 12px; border: 1px solid var(--brand-700); border-radius: 9px; background: var(--surface); color: var(--brand-700); cursor: pointer; font: inherit; font-weight: 800; transition: background-color 180ms ease, border-color 180ms ease, color 180ms ease, box-shadow 180ms ease, opacity 180ms ease, transform 180ms ease; }
      .copy-button:hover { background: #fffaf0; }
      .copy-button:disabled { cursor: not-allowed; opacity: .56; }
      .warning { margin: 0 0 20px; padding: 14px 16px; border-left: 4px solid var(--danger); background: #fff1ef; color: #6a241f; }
      .warning strong { display: block; color: var(--danger); }
      .customer-list a { display: flex; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--line); color: var(--brand-700); font-weight: 800; text-decoration: none; }
      .scenario-list { counter-reset: scenario; }
      .scenario-list li { display: grid; grid-template-columns: 26px 1fr; gap: 10px; align-items: start; color: var(--muted); }
      .scenario-list li::before { counter-increment: scenario; content: counter(scenario); display: grid; width: 24px; height: 24px; place-items: center; border-radius: 50%; background: var(--brand-100); color: var(--brand-700); font-size: .75rem; font-weight: 800; }
      .footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; padding: 22px 34px; background: var(--text); color: #f5ecdc; font-size: .86rem; }
      .footer code { color: var(--brand-fill); }
      @media (max-width: 820px) { .masthead, .content { grid-template-columns: 1fr; } section { padding: 26px 20px; } .footer { padding: 20px; } }
      @media (max-width: 560px) { .role-card { grid-template-columns: 38px 1fr; } .role-mark { width: 38px; height: 38px; } .role-card .button { grid-column: 2; justify-self: start; } }
      @media (prefers-reduced-motion: reduce) { .button, .copy-button { transition: none; } .button:active, .copy-button:active { transform: none; } }
    </style>
  </head>
  <body>
    <main class="mise-stage">
      <div class="shell mise-shell">
        <header class="masthead">
          <div>
            <p class="eyebrow">MISE · Local synthetic demo</p>
            <h1>See the whole service floor.</h1>
            <p class="lede">A disposable Dar Nedjma workspace with realistic operating data, four ready identities, and a real table-ordering entry point.</p>
          </div>
          <div class="status-panel">
            <div class="status-line"><span class="status-dot" aria-hidden="true"></span> Demo environment ready</div>
            <strong>${escapeHtml(result.restaurantName)}</strong>
            <span>${escapeHtml(result.branchName)} branch · <code>${escapeHtml(result.businessCode)}</code></span>
          </div>
        </header>
        <div class="content">
          <section aria-labelledby="roles-title">
            <div class="section-heading">
              <div><p>Open a focused browser tab</p><h2 id="roles-title">Role entry points</h2></div>
              <span class="eyebrow">4 identities</span>
            </div>
            <ul class="role-list">${roleCards}</ul>
            <div class="credential">
              <p class="eyebrow">Run-scoped password</p>
              <div class="credential-row">
                <input id="demo-password" class="password-value" type="password" readonly placeholder="Hidden until reveal" aria-label="Run-scoped password" />
                <button class="copy-button" type="button" id="reveal-password">Reveal password</button>
                <button class="copy-button" type="button" id="copy-password" disabled>Copy password</button>
                <span id="copy-status" role="status" aria-live="polite"></span>
              </div>
              <p style="margin: 10px 0 0; color: var(--muted); font-size: .86rem;">This password is generated for this local run. It is not a production credential.</p>
            </div>
          </section>
          <section aria-labelledby="scenario-title">
            <p class="eyebrow">Start here</p>
            <h2 id="scenario-title">Golden scenario</h2>
            <ol class="scenario-list" style="margin-top: 20px;">${scenarioItems}</ol>
            <div style="height: 28px;"></div>
            <p class="eyebrow">Guest entry</p>
            <h3 style="margin-top: 6px;">Customer table menus</h3>
            <ul class="customer-list" style="margin-top: 8px;">${customerLinks}</ul>
            <div style="height: 28px;"></div>
            <p class="eyebrow">Safe local recovery</p>
            <h3 style="margin-top: 6px;">Loopback recovery inbox</h3>
            <p style="color: var(--muted);">Recovery requests are accepted generically. In this synthetic run, the configured delivery substitute is available only on loopback.</p>
            <p><a class="button button-small" href="${escapeHtml(options.recoveryOrigin)}" target="_blank" rel="noreferrer">Open recovery inbox <span aria-hidden="true">↗</span></a></p>
          </section>
        </div>
        <section style="background: var(--canvas);" aria-labelledby="safety-title">
          <div class="warning"><strong id="safety-title">Local-only safety boundary</strong>Use separate browser contexts for each role. Reset by stopping this run and starting <code>corepack pnpm dev:demo</code> again; the isolated demo database is preserved when you stop.</div>
          <div class="section-heading" style="margin-bottom: 0;">
            <div><p>Automation helper</p><h3>Open isolated contexts</h3></div>
            <code>corepack pnpm demo:contexts</code>
          </div>
        </section>
        <footer class="footer"><span>Loopback only · synthetic data · no public signup</span><span>Launcher origin <code>127.0.0.1:${options.port}</code></span></footer>
      </div>
    </main>
    <script>
      const password = document.querySelector('#demo-password');
      const revealButton = document.querySelector('#reveal-password');
      const copyButton = document.querySelector('#copy-password');
      const status = document.querySelector('#copy-status');
      revealButton?.addEventListener('click', async () => {
        if (!(password instanceof HTMLInputElement) || !(revealButton instanceof HTMLButtonElement) || !(copyButton instanceof HTMLButtonElement) || !(status instanceof HTMLElement)) return;
        if (password.type === 'text') {
          password.type = 'password';
          revealButton.textContent = 'Reveal password';
          copyButton.disabled = true;
          status.textContent = '';
          return;
        }
        const response = await fetch('/password', { cache: 'no-store' });
        if (!response.ok) { status.textContent = 'Unavailable'; return; }
        const data = await response.json();
        password.value = data.password;
        password.type = 'text';
        revealButton.textContent = 'Hide password';
        copyButton.disabled = false;
        status.textContent = 'Revealed locally';
      });
      copyButton?.addEventListener('click', async () => {
        if (!(password instanceof HTMLInputElement) || !(status instanceof HTMLElement)) return;
        await navigator.clipboard.writeText(password.value);
        status.textContent = 'Copied';
        window.setTimeout(() => { status.textContent = ''; }, 1600);
      });
    </script>
  </body>
</html>`;
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: DemoLauncherOptions,
  manifest: DemoLauncherManifest,
  sessions: Map<DemoRoleKey, readonly string[]>,
): Promise<void> {
  const requestUrl = new URL(
    request.url ?? "/",
    `http://${options.host}:${options.port}`,
  );
  if (request.method !== "GET") {
    send(response, 405, "text/plain; charset=utf-8", "Method not allowed");
    return;
  }
  if (requestUrl.pathname === "/health/live") {
    send(response, 200, "text/plain; charset=utf-8", "ok");
    return;
  }
  if (requestUrl.pathname === "/manifest") {
    send(
      response,
      200,
      "application/json; charset=utf-8",
      JSON.stringify(manifest),
    );
    return;
  }
  if (requestUrl.pathname === "/password") {
    send(
      response,
      200,
      "application/json; charset=utf-8",
      JSON.stringify({ password: options.result.roles[0]?.password ?? "" }),
    );
    return;
  }
  if (requestUrl.pathname === "/") {
    response.setHeader(
      "content-security-policy",
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self';",
    );
    send(response, 200, "text/html; charset=utf-8", page(options));
    return;
  }
  const launchMatch = /^\/launch\/([a-z-]+)$/.exec(requestUrl.pathname);
  if (launchMatch) {
    const role = roleFor(options.result, launchMatch[1] as DemoRoleKey);
    if (!role) {
      send(response, 404, "text/plain; charset=utf-8", "Unknown demo role");
      return;
    }
    try {
      const cookies =
        sessions.get(role.key) ?? (await loginRole(role, options));
      sessions.set(role.key, cookies);
      response.statusCode = 302;
      response.setHeader("cache-control", "no-store");
      response.setHeader("referrer-policy", "no-referrer");
      response.setHeader("set-cookie", cookies);
      response.setHeader("location", targetOrigin(role, options));
      response.end();
    } catch {
      send(
        response,
        502,
        "text/plain; charset=utf-8",
        "Role entry is unavailable. Confirm the local API is ready and restart the demo.",
      );
    }
    return;
  }
  send(response, 404, "text/plain; charset=utf-8", "Not found");
}

export async function startDemoLauncher(
  options: DemoLauncherOptions,
): Promise<DemoLauncher> {
  const manifest = launcherManifest(options.result);
  const sessions = new Map<DemoRoleKey, readonly string[]>();
  const server = createServer((request, response) => {
    void handleRequest(request, response, options, manifest, sessions);
  });
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(options.port, options.host);
  });
  return {
    origin: `http://${options.host}:${options.port}`,
    manifest,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
