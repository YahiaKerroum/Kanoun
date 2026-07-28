import {
  StrictMode,
  useEffect,
  useMemo,
  useState,
  type SyntheticEvent,
} from "react";
import { createRoot } from "react-dom/client";
import { z } from "zod";
import {
  MenuTablesAdministration,
  type MenuTablesPermissions,
} from "./MenuTablesAdministration.js";
import "./styles.css";

const permissionGrantSchema = z.object({
  permissionKey: z.string(),
  restaurantId: z.uuid().optional(),
  branchId: z.uuid().optional(),
});
const sessionSchema = z.object({
  employeeId: z.uuid(),
  activeBranchId: z.uuid().nullable(),
  authorizedBranchIds: z.array(z.uuid()),
  grants: z.array(permissionGrantSchema),
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
const employeeSchema = z.object({
  id: z.uuid(),
  restaurantId: z.uuid(),
  displayName: z.string(),
  email: z.email(),
  status: z.enum(["active", "inactive"]),
  version: z.number().int().positive(),
  branchIds: z.array(z.uuid()),
});
const permissionSetSchema = z.object({
  employeeId: z.uuid(),
  version: z.number().int().positive(),
  grants: z.array(permissionGrantSchema),
});
const permissionDefinitionSchema = z.object({
  key: z.string(),
  id: z.string(),
  module: z.string(),
  scope: z.enum(["platform", "restaurant", "branch"]),
  risk: z.enum(["low", "medium", "high", "critical"]),
});
const templateSchema = z.object({
  key: z.enum(["administrator", "general_staff", "cashier", "kitchen_staff"]),
  displayName: z.string(),
  permissionKeys: z.array(z.string()),
  version: z.number(),
});
const templatesResultSchema = z.object({
  items: z.array(templateSchema),
  catalog: z.array(permissionDefinitionSchema),
});
const featureConfigurationSchema = z.object({
  id: z.uuid(),
  branchId: z.uuid().optional(),
  version: z.number().int().positive(),
  values: z.record(
    z.string(),
    z.enum(["enabled", "disabled", "automatic", "unavailable"]),
  ),
  createdAtUtc: z.coerce.date(),
});
const featureDefinitionSchema = z.object({
  id: z.string(),
  key: z.string(),
  kind: z.enum([
    "core_module",
    "optional_module",
    "capability",
    "strategy",
    "integration",
  ]),
  scope: z.enum(["platform", "restaurant", "branch"]),
  mvp: z.boolean(),
  defaultState: z.enum(["enabled", "disabled", "automatic", "unavailable"]),
  dependsOn: z.array(z.string()),
  mutableInMvp: z.boolean(),
  disablePolicy: z.string().optional(),
});
const featureResultSchema = z.object({
  configuration: featureConfigurationSchema,
  catalog: z.array(featureDefinitionSchema),
});

type Session = z.infer<typeof sessionSchema>;
type Restaurant = z.infer<typeof restaurantSchema>;
type Branch = z.infer<typeof branchSchema>;
type Employee = z.infer<typeof employeeSchema>;
type PermissionSet = z.infer<typeof permissionSetSchema>;
type PermissionDefinition = z.infer<typeof permissionDefinitionSchema>;
type Template = z.infer<typeof templateSchema>;
type FeatureResult = z.infer<typeof featureResultSchema>;

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
  if (init?.method) headers.set("x-csrf-token", csrfToken());
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers,
  });
  if (!response.ok) {
    const problem = z
      .object({ title: z.string(), detail: z.string().nullable().optional() })
      .safeParse(await response.json().catch(() => undefined));
    throw new Error(
      problem.success
        ? (problem.data.detail ?? problem.data.title)
        : response.status === 401
          ? "Sign in required"
          : "Request failed. Refresh and try again.",
    );
  }
  return schema.parse(await response.json());
}

function grantId(grant: z.infer<typeof permissionGrantSchema>) {
  return `${grant.permissionKey}:${grant.restaurantId ?? "*"}:${grant.branchId ?? "*"}`;
}

interface Workspace {
  readonly session: Session;
  readonly restaurants: Restaurant[];
  readonly branches: Branch[];
  readonly employees: Employee[];
  readonly templates: Template[];
  readonly permissionCatalog: PermissionDefinition[];
  readonly features: FeatureResult | null;
  readonly restaurantFeatures: FeatureResult | null;
  readonly activeBranchId: string | null;
}

function App() {
  const [state, setState] = useState<
    | { readonly kind: "loading" }
    | { readonly kind: "signed-out" }
    | ({ readonly kind: "ready" } & Workspace)
  >({ kind: "loading" });
  const [message, setMessage] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>();
  const [permissionSet, setPermissionSet] = useState<PermissionSet>();
  const [draftGrantIds, setDraftGrantIds] = useState<Set<string>>(new Set());
  const [featureDraft, setFeatureDraft] = useState<Record<string, string>>({});

  async function loadWorkspace(preferredBranchId?: string) {
    const session = await api("/api/v1/auth/session", sessionSchema);
    const [restaurants, branches, templates] = await Promise.all([
      api(
        "/api/v1/staff/restaurants",
        z.object({ items: z.array(restaurantSchema) }),
      ),
      api("/api/v1/staff/branches", z.object({ items: z.array(branchSchema) })),
      api("/api/v1/staff/permission-templates", templatesResultSchema),
    ]);
    const employees = (
      await Promise.all(
        restaurants.items.map((restaurant) =>
          api(
            `/api/v1/staff/employees?restaurantId=${restaurant.id}`,
            z.object({ items: z.array(employeeSchema) }),
          ),
        ),
      )
    ).flatMap((result) => result.items);
    const activeBranchId =
      preferredBranchId ??
      session.activeBranchId ??
      branches.items[0]?.id ??
      null;
    const activeBranch = branches.items.find(
      (branch) => branch.id === activeBranchId,
    );
    const [features, restaurantFeatures] = activeBranch
      ? await Promise.all([
          api(
            `/api/v1/staff/branches/${activeBranch.id}/features`,
            featureResultSchema,
          ),
          api(
            `/api/v1/staff/restaurants/${activeBranch.restaurantId}/features`,
            featureResultSchema,
          ),
        ])
      : [null, null];
    setFeatureDraft({
      ...(restaurantFeatures?.configuration.values ?? {}),
      ...(features?.configuration.values ?? {}),
    });
    setState({
      kind: "ready",
      session,
      restaurants: restaurants.items,
      branches: branches.items,
      employees,
      templates: templates.items,
      permissionCatalog: templates.catalog,
      features,
      restaurantFeatures,
      activeBranchId,
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
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Sign-in failed. Check the business code and credentials.",
      );
    }
  }

  async function switchBranch(branchId: string) {
    setMessage("Switching branch…");
    try {
      await api(
        "/api/v1/staff/session/branch",
        z.object({ activeBranchId: z.uuid() }),
        { method: "POST", body: JSON.stringify({ branchId }) },
      );
      await loadWorkspace(branchId);
      setMessage("Branch context updated.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Branch switch failed.",
      );
    }
  }

  async function createEmployee(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind !== "ready" || !state.activeBranchId) return;
    const branch = state.branches.find(
      (item) => item.id === state.activeBranchId,
    );
    if (!branch) return;
    const data = new FormData(event.currentTarget);
    setMessage("Creating employee…");
    try {
      await api("/api/v1/staff/employees", employeeSchema, {
        method: "POST",
        body: JSON.stringify({
          restaurantId: branch.restaurantId,
          displayName: data.get("displayName"),
          email: data.get("email"),
          branchIds: [branch.id],
        }),
      });
      event.currentTarget.reset();
      await loadWorkspace(state.activeBranchId);
      setMessage("Employee profile created without automatic login access.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Employee creation failed.",
      );
    }
  }

  async function selectEmployee(employeeId: string) {
    setSelectedEmployeeId(employeeId);
    setMessage("Loading permissions…");
    try {
      const result = await api(
        `/api/v1/staff/employees/${employeeId}/permissions`,
        permissionSetSchema,
      );
      setPermissionSet(result);
      setDraftGrantIds(new Set(result.grants.map(grantId)));
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Permissions unavailable.",
      );
    }
  }

  const selectedEmployee =
    state.kind === "ready"
      ? state.employees.find((employee) => employee.id === selectedEmployeeId)
      : undefined;
  const delegableDefinitions = useMemo(() => {
    if (state.kind !== "ready") return [];
    const actorKeys = new Set(
      state.session.grants.map((grant) => grant.permissionKey),
    );
    return state.permissionCatalog.filter(
      (definition) =>
        definition.scope !== "platform" && actorKeys.has(definition.key),
    );
  }, [state]);

  function grantFor(
    definition: PermissionDefinition,
    employee: Employee,
    branchId?: string,
  ) {
    return {
      permissionKey: definition.key,
      restaurantId: employee.restaurantId,
      ...(branchId ? { branchId } : {}),
    };
  }

  function toggleGrant(id: string, checked: boolean) {
    setDraftGrantIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function savePermissions() {
    if (state.kind !== "ready" || !selectedEmployee || !permissionSet) return;
    const grants = delegableDefinitions.flatMap((definition) => {
      if (definition.scope === "branch") {
        return selectedEmployee.branchIds
          .map((branchId) => grantFor(definition, selectedEmployee, branchId))
          .filter((grant) => draftGrantIds.has(grantId(grant)));
      }
      const grant = grantFor(definition, selectedEmployee);
      return draftGrantIds.has(grantId(grant)) ? [grant] : [];
    });
    if (
      !window.confirm(
        "Apply this permission set and end the employee’s active sessions?",
      )
    )
      return;
    setMessage("Saving permissions…");
    try {
      const result = await api(
        `/api/v1/staff/employees/${selectedEmployee.id}/permissions`,
        permissionSetSchema,
        {
          method: "PUT",
          body: JSON.stringify({
            expectedVersion: permissionSet.version,
            grants,
            reason: "Administrator confirmed permission update",
          }),
        },
      );
      setPermissionSet(result);
      setDraftGrantIds(new Set(result.grants.map(grantId)));
      setMessage("Permissions saved. Affected sessions were ended.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Permission update failed.",
      );
    }
  }

  async function applyTemplate(template: Template) {
    if (!selectedEmployee || !permissionSet) return;
    if (
      !window.confirm(
        `Copy ${template.displayName} permissions to this employee? Existing custom grants remain.`,
      )
    )
      return;
    setMessage(`Applying ${template.displayName}…`);
    try {
      const result = await api(
        `/api/v1/staff/employees/${selectedEmployee.id}/permission-template`,
        permissionSetSchema,
        {
          method: "POST",
          body: JSON.stringify({
            templateKey: template.key,
            expectedVersion: permissionSet.version,
            reason: `Apply ${template.displayName} permission template`,
          }),
        },
      );
      setPermissionSet(result);
      setDraftGrantIds(new Set(result.grants.map(grantId)));
      setMessage(
        `${template.displayName} copied. Future template changes will not alter this employee.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Template application failed.",
      );
    }
  }

  async function saveFeatures(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      state.kind !== "ready" ||
      !state.features ||
      !state.restaurantFeatures ||
      !state.activeBranchId
    )
      return;
    const branch = state.branches.find(
      (item) => item.id === state.activeBranchId,
    );
    if (!branch) return;
    const branchChanges = Object.fromEntries(
      Object.entries(featureDraft).filter(
        ([key, value]) =>
          state.features?.configuration.values[key] !== undefined &&
          state.features.configuration.values[key] !== value,
      ),
    );
    const restaurantChanges = Object.fromEntries(
      Object.entries(featureDraft).filter(
        ([key, value]) =>
          state.restaurantFeatures?.configuration.values[key] !== undefined &&
          state.restaurantFeatures.configuration.values[key] !== value,
      ),
    );
    if (
      Object.keys(branchChanges).length === 0 &&
      Object.keys(restaurantChanges).length === 0
    ) {
      setMessage("No feature changes to save.");
      return;
    }
    const hasDisable = [
      ...Object.values(branchChanges),
      ...Object.values(restaurantChanges),
    ].includes("disabled");
    const confirmed =
      !hasDisable ||
      window.confirm(
        "Disabled capabilities stop new work but preserve data and supported in-flight completion. Continue?",
      );
    if (!confirmed) return;
    const data = new FormData(event.currentTarget);
    setMessage("Saving feature configuration…");
    try {
      const commands: Promise<unknown>[] = [];
      if (Object.keys(branchChanges).length > 0) {
        commands.push(
          api(
            `/api/v1/staff/branches/${state.activeBranchId}/features`,
            featureConfigurationSchema,
            {
              method: "PATCH",
              headers: {
                "if-match": `"${state.features.configuration.version}"`,
              },
              body: JSON.stringify({
                changes: branchChanges,
                confirmAffectedWorkflows: confirmed,
                reason: data.get("reason"),
              }),
            },
          ),
        );
      }
      if (Object.keys(restaurantChanges).length > 0) {
        commands.push(
          api(
            `/api/v1/staff/restaurants/${branch.restaurantId}/features`,
            featureConfigurationSchema,
            {
              method: "PATCH",
              headers: {
                "if-match": `"${state.restaurantFeatures.configuration.version}"`,
              },
              body: JSON.stringify({
                changes: restaurantChanges,
                confirmAffectedWorkflows: confirmed,
                reason: data.get("reason"),
              }),
            },
          ),
        );
      }
      await Promise.all(commands);
      await loadWorkspace(state.activeBranchId);
      setMessage("A new immutable feature configuration version was saved.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Feature update failed.",
      );
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
            Restaurant access starts with verified scope.
          </h1>
          <span>
            Employee, permission, branch, and feature changes are tenant-scoped,
            versioned, and audited by the server.
          </span>
        </section>
        <form className="sign-in-form" onSubmit={(event) => void signIn(event)}>
          <p className="eyebrow">Protected access</p>
          <h2>Sign in to administration</h2>
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
  const groupedPermissions = delegableDefinitions.reduce<
    Record<string, PermissionDefinition[]>
  >((groups, definition) => {
    (groups[definition.module] ??= []).push(definition);
    return groups;
  }, {});
  const configurableFeatures =
    state.features?.catalog.filter(
      (feature) =>
        (feature.scope === "branch" || feature.scope === "restaurant") &&
        feature.mvp,
    ) ?? [];
  const activePermissionKeys = new Set(
    state.session.grants
      .filter(
        (grant) =>
          (!grant.restaurantId ||
            grant.restaurantId === activeBranch?.restaurantId) &&
          (!grant.branchId || grant.branchId === activeBranch?.id),
      )
      .map((grant) => grant.permissionKey),
  );
  const menuTablesPermissions: MenuTablesPermissions = {
    menuView: activePermissionKeys.has("menu.view"),
    menuManage: activePermissionKeys.has("menu.manage"),
    menuManagePrices: activePermissionKeys.has("menu.manage_prices"),
    menuManageAvailability: activePermissionKeys.has(
      "menu.manage_availability",
    ),
    tablesView: activePermissionKeys.has("tables.view"),
    tablesManage: activePermissionKeys.has("tables.manage"),
    qrManage: activePermissionKeys.has("qr.manage"),
  };
  const persistedFeatureValues = {
    ...(state.restaurantFeatures?.configuration.values ?? {}),
    ...(state.features?.configuration.values ?? {}),
  };

  return (
    <div className="admin-stage">
      <a className="skip-link" href="#main-content">
        Skip to administration content
      </a>
      <header>
        <div className="brand-mark" aria-hidden="true">
          M
        </div>
        <div>
          <p>MISE administration</p>
          <h1>People &amp; configuration</h1>
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
      <main className="setup-workspace" id="main-content" tabIndex={-1}>
        <nav aria-label="Administration sections">
          <a href="#context">Context</a>
          <a href="#employees">Employees</a>
          <a href="#permissions">Permissions</a>
          <a href="#menu">Menu</a>
          <a href="#tables">Tables &amp; QR</a>
          <a href="#features">Features</a>
        </nav>
        <section className="setup-content">
          <div className="workspace-heading" id="context">
            <div>
              <p className="eyebrow">Tenant-scoped administration</p>
              <h2>{activeBranch?.name ?? "Select a branch"}</h2>
            </div>
            <span
              className={`service-state service-state--${activeBranch?.serviceStatus ?? "closed"}`}
            >
              {activeBranch?.serviceStatus.replaceAll("_", " ") ??
                "No branch selected"}
            </span>
          </div>
          <p className="status-line" role="status" aria-live="polite">
            {message}
          </p>

          <section id="employees" className="admin-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Employee profiles</p>
                <h3>Workforce</h3>
              </div>
              <span>{state.employees.length} profiles</span>
            </div>
            <form
              className="inline-form"
              onSubmit={(event) => void createEmployee(event)}
            >
              <label>
                Display name
                <input name="displayName" maxLength={160} required />
              </label>
              <label>
                Work email
                <input name="email" type="email" maxLength={320} required />
              </label>
              <button type="submit" disabled={!activeBranch}>
                Add employee
              </button>
              <p>
                Creates a profile for the active branch. Login credentials are
                added separately through an invitation.
              </p>
            </form>
            <ul className="employee-list" aria-label="Employee profiles">
              {state.employees.map((employee) => (
                <li key={employee.id}>
                  <button
                    type="button"
                    className={
                      selectedEmployeeId === employee.id ? "is-selected" : ""
                    }
                    onClick={() => void selectEmployee(employee.id)}
                  >
                    <span>
                      <strong>{employee.displayName}</strong>
                      <small>{employee.email}</small>
                    </span>
                    <span className="employee-meta">
                      {employee.status} · {employee.branchIds.length} branch
                      {employee.branchIds.length === 1 ? "" : "es"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section id="permissions" className="admin-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Grants only · copy on apply</p>
                <h3>Permissions</h3>
              </div>
              <span>
                {selectedEmployee
                  ? selectedEmployee.displayName
                  : "Select an employee"}
              </span>
            </div>
            {!selectedEmployee || !permissionSet ? (
              <p className="empty-state">
                Select an employee to review independently scoped permissions.
              </p>
            ) : (
              <>
                <div
                  className="template-actions"
                  aria-label="Permission templates"
                >
                  {state.templates.map((template) => (
                    <button
                      type="button"
                      key={template.key}
                      onClick={() => void applyTemplate(template)}
                    >
                      Apply {template.displayName}
                    </button>
                  ))}
                </div>
                <div className="permission-groups">
                  {Object.entries(groupedPermissions).map(
                    ([module, definitions]) => (
                      <fieldset key={module}>
                        <legend>{module.replaceAll("_", " ")}</legend>
                        {definitions.map((definition) =>
                          definition.scope === "branch" ? (
                            <div
                              className="permission-row"
                              key={definition.key}
                            >
                              <strong>{definition.key}</strong>
                              <div>
                                {selectedEmployee.branchIds.map((branchId) => {
                                  const grant = grantFor(
                                    definition,
                                    selectedEmployee,
                                    branchId,
                                  );
                                  const branch = state.branches.find(
                                    (item) => item.id === branchId,
                                  );
                                  const id = grantId(grant);
                                  return (
                                    <label key={branchId}>
                                      <input
                                        type="checkbox"
                                        checked={draftGrantIds.has(id)}
                                        onChange={(event) =>
                                          toggleGrant(id, event.target.checked)
                                        }
                                      />
                                      {branch?.name ?? "Assigned branch"}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <label
                              className="permission-row"
                              key={definition.key}
                            >
                              <input
                                type="checkbox"
                                checked={draftGrantIds.has(
                                  grantId(
                                    grantFor(definition, selectedEmployee),
                                  ),
                                )}
                                onChange={(event) =>
                                  toggleGrant(
                                    grantId(
                                      grantFor(definition, selectedEmployee),
                                    ),
                                    event.target.checked,
                                  )
                                }
                              />
                              <span>
                                <strong>{definition.key}</strong>
                                <small>{definition.risk} risk</small>
                              </span>
                            </label>
                          ),
                        )}
                      </fieldset>
                    ),
                  )}
                </div>
                <button
                  className="primary-action"
                  type="button"
                  onClick={() => void savePermissions()}
                >
                  Save permission set
                </button>
              </>
            )}
          </section>

          {activeBranch ? (
            <MenuTablesAdministration
              key={activeBranch.id}
              branch={activeBranch}
              permissions={menuTablesPermissions}
              features={{
                menu: persistedFeatureValues["CFG-003"] !== "disabled",
                qrMenu: persistedFeatureValues["CFG-004"] !== "disabled",
                tables: persistedFeatureValues["CFG-006"] !== "disabled",
              }}
            />
          ) : null}

          <section id="features" className="admin-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Immutable versioned settings</p>
                <h3>Branch features</h3>
              </div>
              <span>
                Branch v{state.features?.configuration.version ?? "—"} ·
                Restaurant v
                {state.restaurantFeatures?.configuration.version ?? "—"}
              </span>
            </div>
            <form onSubmit={(event) => void saveFeatures(event)}>
              <ul className="feature-list">
                {configurableFeatures.map((feature) => {
                  const value =
                    featureDraft[feature.id] ?? feature.defaultState;
                  return (
                    <li key={feature.id}>
                      <div>
                        <strong>{feature.key.replaceAll("_", " ")}</strong>
                        <small>
                          {feature.id}
                          {feature.dependsOn.length
                            ? ` · requires ${feature.dependsOn.join(", ")}`
                            : ""}
                        </small>
                      </div>
                      {feature.mutableInMvp ? (
                        <label className="feature-toggle">
                          <input
                            type="checkbox"
                            checked={value === "enabled"}
                            onChange={(event) =>
                              setFeatureDraft((current) => ({
                                ...current,
                                [feature.id]: event.target.checked
                                  ? "enabled"
                                  : "disabled",
                              }))
                            }
                          />
                          {value}
                        </label>
                      ) : (
                        <span className="fixed-value">
                          {value} · fixed in MVP
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <label className="reason-field">
                Reason for feature change
                <input
                  name="reason"
                  minLength={8}
                  maxLength={500}
                  required
                  placeholder="Describe the operational reason"
                />
              </label>
              <button className="primary-action" type="submit">
                Save feature version
              </button>
            </form>
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
