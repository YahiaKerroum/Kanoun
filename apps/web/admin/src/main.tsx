import { StrictMode, useEffect, useState, type SyntheticEvent } from "react";
import { createRoot } from "react-dom/client";
import { z } from "zod";
import "./styles.css";

const sessionSchema = z.object({
  employeeId: z.uuid(),
  activeBranchId: z.uuid().nullable(),
  expiresAt: z.iso.datetime(),
});
const restaurantSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  status: z.enum(["active", "inactive"]),
  version: z.number().int(),
});
const branchSchema = z.object({
  id: z.uuid(),
  restaurantId: z.uuid(),
  name: z.string(),
  timeZone: z.string(),
  currency: z.string(),
  status: z.enum(["active", "inactive"]),
  serviceStatus: z.enum(["open", "closed", "temporarily_unavailable"]),
  version: z.number().int(),
  openingHours: z.array(
    z.object({
      dayOfWeek: z.number(),
      opensAt: z.string(),
      closesAt: z.string(),
    }),
  ),
});
type Restaurant = z.infer<typeof restaurantSchema>;
type Branch = z.infer<typeof branchSchema>;

function csrfToken() {
  return (
    document.cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith("rms_csrf="))
      ?.slice(9) ?? ""
  );
}
async function api<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  if (init?.method) {
    headers.set("x-csrf-token", csrfToken());
  }
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers,
  });
  if (!response.ok)
    throw new Error(
      response.status === 401 ? "Sign in required" : "Request failed",
    );
  return schema.parse(await response.json());
}

function App() {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "signed-out" }
    | {
        kind: "ready";
        restaurants: Restaurant[];
        branches: Branch[];
        activeBranchId: string | null;
      }
  >({ kind: "loading" });
  const [message, setMessage] = useState("");

  async function loadWorkspace() {
    const session = await api("/api/v1/auth/session", sessionSchema);
    const [restaurants, branches] = await Promise.all([
      api(
        "/api/v1/staff/restaurants",
        z.object({ items: z.array(restaurantSchema) }),
      ),
      api("/api/v1/staff/branches", z.object({ items: z.array(branchSchema) })),
    ]);
    setState({
      kind: "ready",
      restaurants: restaurants.items,
      branches: branches.items,
      activeBranchId: session.activeBranchId,
    });
  }
  useEffect(() => {
    void loadWorkspace().catch(() => setState({ kind: "signed-out" }));
  }, []);

  async function signIn(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Signing in…");
    const data = new FormData(event.currentTarget);
    try {
      await api("/api/v1/auth/login", sessionSchema, {
        method: "POST",
        body: JSON.stringify({
          businessCode: data.get("businessCode"),
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      await loadWorkspace();
      setMessage("");
    } catch {
      setMessage("Sign-in failed. Check the business code and credentials.");
    }
  }
  async function switchBranch(branchId: string) {
    setMessage("Switching branch…");
    try {
      await api(
        "/api/v1/staff/session/branch",
        z.object({ activeBranchId: z.uuid() }),
        {
          method: "POST",
          body: JSON.stringify({ branchId }),
        },
      );
      setState((current) =>
        current.kind === "ready"
          ? { ...current, activeBranchId: branchId }
          : current,
      );
      setMessage("Branch context updated.");
    } catch {
      setMessage("Branch switch failed. Refresh and try again.");
    }
  }

  if (state.kind === "loading")
    return (
      <main className="loading-state" aria-live="polite">
        Verifying session…
      </main>
    );
  if (state.kind === "signed-out")
    return (
      <main className="sign-in-stage">
        <section className="brand-panel" aria-labelledby="brand-title">
          <p>MISE · ADMINISTRATION</p>
          <h1 id="brand-title">
            Restaurant setup starts with a protected owner.
          </h1>
          <span>
            Tenant and branch access is resolved by the server, never by a
            browser-supplied tenant identifier.
          </span>
        </section>
        <form className="sign-in-form" onSubmit={(event) => void signIn(event)}>
          <p className="eyebrow">Protected access</p>
          <h2>Sign in to setup</h2>
          <label>
            Business code
            <input name="businessCode" autoComplete="organization" required />
          </label>
          <label>
            Email
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit">Continue</button>
          <p className="form-status" role="status">
            {message}
          </p>
        </form>
      </main>
    );

  const activeBranch = state.branches.find(
    (branch) => branch.id === state.activeBranchId,
  );
  return (
    <div className="admin-stage">
      <header>
        <div className="brand-mark">M</div>
        <div>
          <p>MISE administration</p>
          <h1>Restaurant setup</h1>
        </div>
        <label className="branch-picker">
          Active branch
          <select
            value={state.activeBranchId ?? ""}
            onChange={(event) => void switchBranch(event.target.value)}
          >
            <option value="" disabled>
              Select a branch
            </option>
            {state.branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
      </header>
      <main className="setup-workspace">
        <nav aria-label="Administration sections">
          <a href="#restaurants">Restaurants</a>
          <a href="#branches">Branches</a>
          <span>Employees · next slice</span>
          <span>Features · next slice</span>
        </nav>
        <section className="setup-content">
          <div className="workspace-heading">
            <div>
              <p className="eyebrow">Tenant-scoped configuration</p>
              <h2>Operating context</h2>
            </div>
            <span
              className={`service-state service-state--${activeBranch?.serviceStatus ?? "closed"}`}
            >
              {activeBranch?.serviceStatus.replaceAll("_", " ") ??
                "No branch selected"}
            </span>
          </div>
          <p className="status-line" role="status">
            {message}
          </p>
          <section id="restaurants" className="data-section">
            <h3>Restaurants</h3>
            <ul>
              {state.restaurants.map((restaurant) => (
                <li key={restaurant.id}>
                  <strong>{restaurant.name}</strong>
                  <span>
                    {restaurant.status} · version {restaurant.version}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section id="branches" className="data-section">
            <h3>Assigned branches</h3>
            <ul>
              {state.branches.map((branch) => (
                <li key={branch.id}>
                  <strong>{branch.name}</strong>
                  <span>
                    {branch.timeZone} · {branch.currency} ·{" "}
                    {branch.openingHours.length} operating periods
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </section>
      </main>
    </div>
  );
}
const root = document.querySelector("#root");
if (!root)
  throw new Error("Administration application root element is missing.");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
