if (
  import.meta.env.DEV &&
  import.meta.env.VITE_DISABLE_REACT_DIAGNOSTICS !== "true"
) {
  void import("react-grab");
}

import {
  StrictMode,
  useEffect,
  useMemo,
  useState,
  type SyntheticEvent,
} from "react";
import { createRoot } from "react-dom/client";
import { z } from "zod";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import {
  MenuTablesAdministration,
  type MenuTablesPermissions,
} from "./MenuTablesAdministration.js";
import { SetupReadinessAdministration } from "./SetupReadinessAdministration.js";
import { InsightsAdministration } from "./InsightsAdministration.js";
import {
  AdministrationNavigation,
  administrationPages,
  type AdministrationPage,
  useAdministrationPage,
} from "./AdminNavigation.js";
import { AdminAuthRoutes } from "./AuthRoutes.js";
import { authRouteForPath, replaceLocation } from "./auth-navigation.js";
import { startReactDiagnostics } from "./react-diagnostics.js";
import {
  actionButtonVariants,
  sectionContainerVariants,
  staggerContainerVariants,
  fadeUpItemVariants,
} from "./motion.js";
import "./styles.css";

await startReactDiagnostics();

const permissionGrantSchema = z.object({
  permissionKey: z.string(),
  restaurantId: z.uuid().optional(),
  branchId: z.uuid().optional(),
});

function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}
const sessionSchema = z.object({
  employeeId: z.uuid(),
  activeBranchId: z.uuid().nullable(),
  authorizedBranchIds: z.array(z.uuid()),
  grants: z.array(permissionGrantSchema),
  expiresAt: z.iso.datetime(),
  profile: z
    .object({
      employee: z.object({
        id: z.uuid(),
        displayName: z.string().min(1),
        email: z.email(),
      }),
      restaurant: z.object({ id: z.uuid(), name: z.string().min(1) }),
      activeBranch: z
        .object({ id: z.uuid(), name: z.string().min(1) })
        .nullable(),
    })
    .optional(),
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
  active: z.boolean(),
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

const responsibilityLabels: readonly [string, readonly string[]][] = [
  [
    "Restaurant administration",
    ["restaurant.", "branches.", "features.", "employees."],
  ],
  ["Orders", ["orders."]],
  ["Kitchen flow", ["kitchen."]],
  ["Payments", ["payments."]],
  ["Menu and tables", ["menu.", "tables.", "qr."]],
  ["Reports and audit", ["reports.", "audit."]],
];

function responsibilitiesFor(session: Session): readonly string[] {
  return responsibilityLabels
    .filter(([, prefixes]) =>
      session.grants.some((grant) =>
        prefixes.some((prefix) => grant.permissionKey.startsWith(prefix)),
      ),
    )
    .map(([label]) => label);
}

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
    throw new ApiRequestError(
      response.status,
      problem.success
        ? (problem.data.detail ?? problem.data.title)
        : response.status === 401
          ? "Sign in required"
          : "Request failed. Refresh and try again.",
    );
  }
  return schema.parse(
    response.status === 204 ? undefined : await response.json(),
  );
}

class ApiRequestError extends Error {
  public constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function optionalApi<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<T | null> {
  try {
    return await api(path, schema);
  } catch (error) {
    if (
      error instanceof ApiRequestError &&
      (error.status === 403 || error.status === 404)
    ) {
      return null;
    }
    throw error;
  }
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
  const { page: requestedPage, navigate } = useAdministrationPage();
  const [locationPath, setLocationPath] = useState(
    () => window.location.pathname,
  );
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
  const [templateReason, setTemplateReason] = useState("");
  const [branchDraftIds, setBranchDraftIds] = useState<Set<string>>(new Set());
  const [employeeReason, setEmployeeReason] = useState("");
  const [invitationLink, setInvitationLink] = useState("");
  const [invitationExpiry, setInvitationExpiry] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [replacementEmployeeId, setReplacementEmployeeId] = useState("");
  const [removeCurrentAdministrator, setRemoveCurrentAdministrator] =
    useState(true);
  const [logoutState, setLogoutState] = useState<"idle" | "pending">("idle");
  const [logoutMessage, setLogoutMessage] = useState("");
  const authRoute = authRouteForPath(locationPath);

  useEffect(() => {
    const synchronizeLocation = () => setLocationPath(window.location.pathname);
    window.addEventListener("popstate", synchronizeLocation);
    return () => window.removeEventListener("popstate", synchronizeLocation);
  }, []);

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
          optionalApi(
            `/api/v1/staff/employees?restaurantId=${restaurant.id}`,
            z.object({ items: z.array(employeeSchema) }),
          ),
        ),
      )
    ).flatMap((result) => result?.items ?? []);
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
    if (authRoute) return;
    void loadWorkspace().catch(() => setState({ kind: "signed-out" }));
  }, [authRoute]);

  async function signOut() {
    setLogoutState("pending");
    setLogoutMessage("Signing out…");
    try {
      await api("/api/v1/auth/logout", z.undefined(), { method: "POST" });
      replaceLocation("/auth/sign-in?notice=signed-out");
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        replaceLocation("/auth/sign-in?notice=session-ended");
      } else {
        setLogoutMessage(
          error instanceof ApiRequestError && error.status === 403
            ? "Sign-out could not be verified. Your session remains active."
            : "Sign-out could not be confirmed. Your session remains active.",
        );
      }
    } finally {
      setLogoutState("idle");
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
          displayName: formText(data, "displayName"),
          email: formText(data, "email"),
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
    const employee =
      state.kind === "ready"
        ? state.employees.find((item) => item.id === employeeId)
        : undefined;
    setBranchDraftIds(new Set(employee?.branchIds ?? []));
    setInvitationLink("");
    setInvitationExpiry("");
    setCopyMessage("");
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

  useEffect(() => {
    if (!selectedEmployee) return;
    setBranchDraftIds(new Set(selectedEmployee.branchIds));
    setReplacementEmployeeId((current) =>
      current && current !== selectedEmployee.id
        ? current
        : state.kind === "ready"
          ? (state.employees.find(
              (employee) =>
                employee.id !== selectedEmployee.id &&
                employee.status === "active",
            )?.id ?? "")
          : "",
    );
  }, [selectedEmployee, state]);

  async function updateSelectedEmployee(
    event: SyntheticEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (state.kind !== "ready" || !selectedEmployee) return;
    const data = new FormData(event.currentTarget);
    const displayName = formText(data, "displayName").trim();
    const email = formText(data, "email").trim();
    if (!displayName || !email) {
      setMessage("Display name and work email are required.");
      return;
    }
    setMessage("Saving employee profile…");
    try {
      const result = await api(
        `/api/v1/staff/employees/${selectedEmployee.id}`,
        employeeSchema,
        {
          method: "PATCH",
          headers: { "if-match": `"${selectedEmployee.version}"` },
          body: JSON.stringify({ displayName, email }),
        },
      );
      setState((current) =>
        current.kind === "ready"
          ? {
              ...current,
              employees: current.employees.map((employee) =>
                employee.id === result.id ? result : employee,
              ),
            }
          : current,
      );
      setMessage(
        "Employee profile saved. Any email change applies to future invitations.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Employee profile could not be saved.",
      );
    }
  }

  async function reactivateSelectedEmployee() {
    if (
      state.kind !== "ready" ||
      !selectedEmployee ||
      selectedEmployee.status === "active"
    )
      return;
    setMessage("Reactivating employee profile…");
    try {
      const result = await api(
        `/api/v1/staff/employees/${selectedEmployee.id}`,
        employeeSchema,
        {
          method: "PATCH",
          headers: { "if-match": `"${selectedEmployee.version}"` },
          body: JSON.stringify({ status: "active" }),
        },
      );
      setState((current) =>
        current.kind === "ready"
          ? {
              ...current,
              employees: current.employees.map((employee) =>
                employee.id === result.id ? result : employee,
              ),
            }
          : current,
      );
      setMessage(
        "Employee reactivated. Credentials remain separate until a new invitation is accepted.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Employee reactivation failed.",
      );
    }
  }

  async function replaceSelectedEmployeeBranches() {
    if (state.kind !== "ready" || !selectedEmployee) return;
    const reason = employeeReason.trim();
    const branchIds = [...branchDraftIds];
    if (reason.length < 8) {
      setMessage("Enter a branch-scope reason of at least 8 characters.");
      return;
    }
    if (branchIds.length === 0) {
      setMessage("Assign at least one branch before saving employee access.");
      return;
    }
    if (
      !window.confirm(
        "Replace this employee’s branch access and end affected sessions?",
      )
    )
      return;
    setMessage("Updating branch access…");
    try {
      const result = await api(
        `/api/v1/staff/employees/${selectedEmployee.id}/branches`,
        employeeSchema,
        {
          method: "PUT",
          headers: { "if-match": `"${selectedEmployee.version}"` },
          body: JSON.stringify({ branchIds, reason }),
        },
      );
      setState((current) =>
        current.kind === "ready"
          ? {
              ...current,
              employees: current.employees.map((employee) =>
                employee.id === result.id ? result : employee,
              ),
            }
          : current,
      );
      setEmployeeReason("");
      setMessage("Branch access replaced. Affected sessions were ended.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Branch access could not be updated.",
      );
    }
  }

  async function inviteSelectedEmployee() {
    if (state.kind !== "ready" || !selectedEmployee) return;
    if (selectedEmployee.status !== "active") {
      setMessage(
        "Reactivate the employee profile before creating an invitation.",
      );
      return;
    }
    setMessage("Creating one-time invitation…");
    setInvitationLink("");
    setCopyMessage("");
    try {
      const result = await api(
        `/api/v1/staff/employees/${selectedEmployee.id}/invitations`,
        z.object({
          invitationToken: z.string().min(32),
          expiresAt: z.iso.datetime(),
        }),
        { method: "POST" },
      );
      const link = new URL("/invite/accept", window.location.origin);
      link.searchParams.set("token", result.invitationToken);
      setInvitationLink(link.toString());
      setInvitationExpiry(result.expiresAt);
      setMessage(
        "Invitation created. Copy this one-time URL now; it is held in memory only.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Invitation could not be created.",
      );
    }
  }

  async function copyInvitationLink() {
    if (!invitationLink) return;
    try {
      await navigator.clipboard.writeText(invitationLink);
      setCopyMessage("Invitation URL copied.");
    } catch {
      setCopyMessage(
        "Copy was unavailable. Select the URL and copy it manually.",
      );
    }
  }

  async function deactivateSelectedEmployee() {
    if (state.kind !== "ready" || !selectedEmployee) return;
    const reason = employeeReason.trim();
    if (reason.length < 8) {
      setMessage(
        "Enter an explicit deactivation reason of at least 8 characters.",
      );
      return;
    }
    if (
      !window.confirm(
        "Deactivate this employee and revoke all of their active sessions?",
      )
    )
      return;
    setMessage("Deactivating employee…");
    try {
      await api(
        `/api/v1/staff/employees/${selectedEmployee.id}/deactivation`,
        z.undefined(),
        {
          method: "POST",
          body: JSON.stringify({
            expectedVersion: selectedEmployee.version,
            reason,
          }),
        },
      );
      await loadWorkspace(state.activeBranchId ?? undefined);
      setEmployeeReason("");
      setMessage("Employee deactivated and active sessions revoked.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Employee deactivation failed.",
      );
    }
  }

  async function removeSelectedAdministrator() {
    if (state.kind !== "ready" || !selectedEmployee) return;
    const reason = employeeReason.trim();
    if (reason.length < 8) {
      setMessage(
        "Enter an administrator-change reason of at least 8 characters.",
      );
      return;
    }
    if (
      !window.confirm(
        "Remove administrator access and revoke this administrator’s sessions?",
      )
    )
      return;
    setMessage("Removing administrator access…");
    try {
      await api(
        `/api/v1/staff/administrators/${selectedEmployee.id}/removal`,
        z.undefined(),
        { method: "POST", body: JSON.stringify({ reason }) },
      );
      await loadWorkspace(state.activeBranchId ?? undefined);
      setEmployeeReason("");
      setMessage(
        "Administrator access removed. The server preserved the final-administrator guard.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Administrator removal failed.",
      );
    }
  }

  async function transferAdministrator() {
    if (state.kind !== "ready" || !replacementEmployeeId) return;
    const reason = employeeReason.trim();
    if (reason.length < 8) {
      setMessage(
        "Enter an administrator-transfer reason of at least 8 characters.",
      );
      return;
    }
    if (
      !window.confirm(
        "Activate the replacement administrator before completing this transfer?",
      )
    )
      return;
    setMessage("Transferring administrator access…");
    try {
      await api("/api/v1/staff/administrators/transfer", z.undefined(), {
        method: "POST",
        body: JSON.stringify({
          replacementEmployeeId,
          removeCurrentAdministrator,
          reason,
        }),
      });
      if (removeCurrentAdministrator) {
        replaceLocation("/auth/sign-in?notice=session-ended");
      } else {
        await loadWorkspace(state.activeBranchId ?? undefined);
        setEmployeeReason("");
        setMessage("Replacement administrator activated and transfer audited.");
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Administrator transfer failed.",
      );
    }
  }
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
    if (!template.active) {
      setMessage("This predefined template is inactive for future use.");
      return;
    }
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

  async function deactivateTemplate(template: Template) {
    if (state.kind !== "ready" || !template.active) return;
    const reason = templateReason.trim();
    if (reason.length < 8) {
      setMessage(
        "Enter a template-deactivation reason of at least 8 characters.",
      );
      return;
    }
    if (
      !window.confirm(
        `Deactivate ${template.displayName} for future use? Existing copied grants will not change.`,
      )
    )
      return;
    setMessage(`Deactivating ${template.displayName}…`);
    try {
      const result = await api(
        `/api/v1/staff/permission-templates/${template.key}/deactivation`,
        templateSchema,
        {
          method: "POST",
          body: JSON.stringify({
            expectedVersion: template.version,
            reason,
          }),
        },
      );
      setState((current) =>
        current.kind === "ready"
          ? {
              ...current,
              templates: current.templates.map((item) =>
                item.key === result.key ? result : item,
              ),
            }
          : current,
      );
      setTemplateReason("");
      setMessage(
        `${result.displayName} is inactive. Existing employee grants are unchanged.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Template deactivation failed.",
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
                reason: formText(data, "reason"),
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
                reason: formText(data, "reason"),
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

  if (authRoute) return <AdminAuthRoutes route={authRoute} />;

  if (state.kind === "loading")
    return (
      <MotionConfig reducedMotion="user">
        <motion.main
          className="loading-state"
          aria-live="polite"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
          Verifying session…
        </motion.main>
      </MotionConfig>
    );
  if (state.kind === "signed-out") return <AdminAuthRoutes route="sign-in" />;

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
  const canViewReports = activePermissionKeys.has("reports.view");
  const canViewAudit = activePermissionKeys.has("audit.view");
  const canManageFeatures = activePermissionKeys.has("features.manage");
  const canViewEmployees = activePermissionKeys.has("employees.view");
  const canViewSetup =
    activePermissionKeys.has("restaurant.view") &&
    activePermissionKeys.has("branches.view");
  const canEditRestaurants = activePermissionKeys.has("restaurant.edit");
  const canManageBranches = activePermissionKeys.has("branches.manage");
  const canManagePermissions = activePermissionKeys.has(
    "employees.manage_permissions",
  );
  const canViewTenantAudit = state.session.grants.some(
    (grant) =>
      grant.permissionKey === "audit.view" &&
      grant.restaurantId === undefined &&
      grant.branchId === undefined,
  );
  const persistedFeatureValues = {
    ...(state.restaurantFeatures?.configuration.values ?? {}),
    ...(state.features?.configuration.values ?? {}),
  };
  const pageAvailability: Readonly<Record<AdministrationPage, boolean>> = {
    setup: canViewSetup,
    context: canViewSetup,
    employees: canViewEmployees,
    permissions: canManagePermissions,
    menu:
      menuTablesPermissions.menuView ||
      menuTablesPermissions.menuManage ||
      menuTablesPermissions.menuManagePrices ||
      menuTablesPermissions.menuManageAvailability,
    tables:
      menuTablesPermissions.tablesView ||
      menuTablesPermissions.tablesManage ||
      menuTablesPermissions.qrManage,
    insights: canViewReports || canViewAudit || canManageFeatures,
    features: canManageFeatures,
  };
  const availableNavigation = administrationPages.filter(
    (item) => pageAvailability[item.id],
  );
  const activePage = pageAvailability[requestedPage]
    ? requestedPage
    : "context";
  const activePageLabel =
    administrationPages.find((item) => item.id === activePage)?.label ??
    "Context";
  const activeRestaurant = state.restaurants.find(
    (restaurant) => restaurant.id === activeBranch?.restaurantId,
  );
  const profile = state.session.profile ?? {
    employee: {
      id: state.session.employeeId,
      displayName: "Administration account",
      email: "",
    },
    restaurant: {
      id:
        activeRestaurant?.id ??
        state.restaurants[0]?.id ??
        state.session.employeeId,
      name: activeRestaurant?.name ?? "Current restaurant",
    },
    activeBranch: activeBranch
      ? { id: activeBranch.id, name: activeBranch.name }
      : null,
  };
  const responsibilities = responsibilitiesFor(state.session);
  const staffOrigin =
    import.meta.env.VITE_STAFF_WEB_ORIGIN ?? "http://127.0.0.1:5173";
  const hasCoreSetup = Boolean(
    activeRestaurant?.status === "active" &&
    activeBranch?.status === "active" &&
    activeBranch.serviceStatus === "open" &&
    activeBranch.openingHours.length > 0 &&
    state.features &&
    state.restaurantFeatures &&
    state.employees.some(
      (employee) =>
        employee.status === "active" &&
        employee.branchIds.includes(activeBranch.id),
    ),
  );
  const canUseStaffWorkspace = (
    branch: { readonly id: string; readonly restaurantId: string } | undefined,
  ): boolean =>
    Boolean(
      branch &&
      state.session.authorizedBranchIds.includes(branch.id) &&
      state.session.grants.some(
        (grant) =>
          ["orders.", "kitchen.", "payments.", "menu.", "tables."].some(
            (prefix) => grant.permissionKey.startsWith(prefix),
          ) &&
          (!grant.restaurantId || grant.restaurantId === branch.restaurantId) &&
          (!grant.branchId || grant.branchId === branch.id),
      ),
    );
  const canOpenStaff = hasCoreSetup && canUseStaffWorkspace(activeBranch);

  return (
    <MotionConfig reducedMotion="user">
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
          <details className="account-context">
            <summary>
              <span className="account-context__avatar" aria-hidden="true">
                {profile.employee.displayName.slice(0, 1).toUpperCase()}
              </span>
              <span>{profile.employee.displayName}</span>
            </summary>
            <div className="account-context__panel">
              <strong>{profile.restaurant.name}</strong>
              <span>{profile.activeBranch?.name ?? "No active branch"}</span>
              {profile.employee.email ? (
                <span>{profile.employee.email}</span>
              ) : null}
              <span className="account-context__label">
                Effective responsibilities
              </span>
              <ul>
                {responsibilities.length > 0 ? (
                  responsibilities.map((item) => <li key={item}>{item}</li>)
                ) : (
                  <li>Assigned administration access</li>
                )}
              </ul>
              {canOpenStaff ? (
                <a href={`${staffOrigin}/`}>Open staff workspace</a>
              ) : null}
              <button
                type="button"
                onClick={() => void signOut()}
                disabled={logoutState === "pending"}
              >
                {logoutState === "pending" ? "Signing out…" : "Sign out"}
              </button>
              <p
                className="account-context__message"
                role="status"
                aria-live="polite"
              >
                {logoutMessage}
              </p>
            </div>
          </details>
        </header>
        <main className="setup-workspace" id="main-content" tabIndex={-1}>
          <AdministrationNavigation
            activePage={activePage}
            items={availableNavigation}
            onNavigate={navigate}
          />
          <section className="setup-content" tabIndex={-1}>
            <div className="workspace-heading">
              <div>
                <p className="eyebrow">Tenant-scoped administration</p>
                <h2>{activePageLabel}</h2>
              </div>
              <span
                className={`service-state service-state--${activeBranch?.serviceStatus ?? "closed"}`}
              >
                {activeBranch
                  ? `${activeBranch.name} · ${activeBranch.serviceStatus.replaceAll("_", " ")}`
                  : "No branch selected"}
              </span>
            </div>
            <p className="status-line" role="status" aria-live="polite">
              {message}
            </p>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activePage}
                variants={sectionContainerVariants}
                initial="initial"
                animate="enter"
                exit="exit"
              >
                {activePage === "setup" ? (
                  <SetupReadinessAdministration
                    initialBranchId={state.activeBranchId}
                    staffOrigin={staffOrigin}
                    canUseStaffWorkspace={canUseStaffWorkspace}
                    canEditRestaurants={canEditRestaurants}
                    canManageBranches={canManageBranches}
                    canViewEmployees={canViewEmployees}
                  />
                ) : null}

                {activePage === "context" ? (
                  <section
                    className="admin-section"
                    aria-labelledby="context-title"
                  >
                    <div className="section-heading">
                      <div>
                        <p className="eyebrow">Verified administration scope</p>
                        <h3 id="context-title">Current context</h3>
                      </div>
                      <span>{profile.employee.displayName}</span>
                    </div>
                    <motion.ul
                      className="context-summary-grid"
                      variants={staggerContainerVariants}
                      initial="initial"
                      animate="enter"
                    >
                      {[
                        {
                          label: "Restaurant",
                          value: activeRestaurant?.name ?? "Not selected",
                        },
                        {
                          label: "Branch",
                          value: activeBranch?.name ?? "Not selected",
                        },
                        {
                          label: "Employee profiles",
                          value: String(state.employees.length),
                        },
                        {
                          label: "Effective permissions",
                          value: String(activePermissionKeys.size),
                        },
                      ].map((item) => (
                        <motion.li
                          className="context-stat"
                          key={item.label}
                          variants={fadeUpItemVariants}
                        >
                          <strong>{item.label}</strong>
                          <span>{item.value}</span>
                        </motion.li>
                      ))}
                    </motion.ul>
                  </section>
                ) : null}

                {activePage === "employees" ? (
                  <section className="admin-section">
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
                        <input
                          name="email"
                          type="email"
                          maxLength={320}
                          required
                        />
                      </label>
                      <motion.button
                        type="submit"
                        disabled={!activeBranch}
                        variants={actionButtonVariants}
                        initial="rest"
                        whileHover="hover"
                        whileTap="tap"
                      >
                        Add employee
                      </motion.button>
                      <p>
                        Creates a profile for the active branch. Login
                        credentials are added separately through an invitation.
                      </p>
                    </form>
                    <motion.ul
                      className="employee-list"
                      aria-label="Employee profiles"
                      variants={staggerContainerVariants}
                      initial="initial"
                      animate="enter"
                    >
                      {state.employees.map((employee) => (
                        <motion.li
                          key={employee.id}
                          variants={fadeUpItemVariants}
                        >
                          <motion.button
                            type="button"
                            className={
                              selectedEmployeeId === employee.id
                                ? "is-selected"
                                : ""
                            }
                            onClick={() => void selectEmployee(employee.id)}
                            variants={actionButtonVariants}
                            initial="rest"
                            whileHover="hover"
                            whileTap="tap"
                          >
                            <span className="employee-list__identity">
                              <span
                                className="account-context__avatar"
                                aria-hidden="true"
                              >
                                {employee.displayName.slice(0, 1).toUpperCase()}
                              </span>
                              <span>
                                <strong>{employee.displayName}</strong>
                                <small>{employee.email}</small>
                              </span>
                            </span>
                            <span className="employee-meta">
                              {employee.status} · {employee.branchIds.length}{" "}
                              branch
                              {employee.branchIds.length === 1 ? "" : "es"}
                            </span>
                          </motion.button>
                        </motion.li>
                      ))}
                    </motion.ul>
                    {selectedEmployee ? (
                      <div
                        className="employee-lifecycle"
                        aria-labelledby="employee-lifecycle-title"
                      >
                        <div className="section-heading">
                          <div>
                            <p className="eyebrow">Selected employee</p>
                            <h4 id="employee-lifecycle-title">
                              Profile and access lifecycle
                            </h4>
                          </div>
                          <span>
                            {selectedEmployee.status} · version{" "}
                            {selectedEmployee.version}
                          </span>
                        </div>
                        <form
                          key={selectedEmployee.id}
                          className="record-editor"
                          onSubmit={(event) =>
                            void updateSelectedEmployee(event)
                          }
                        >
                          <label>
                            Display name
                            <input
                              name="displayName"
                              defaultValue={selectedEmployee.displayName}
                              maxLength={160}
                              required
                            />
                          </label>
                          <label>
                            Work email
                            <input
                              name="email"
                              type="email"
                              defaultValue={selectedEmployee.email}
                              maxLength={320}
                              required
                            />
                          </label>
                          <button type="submit">Save profile</button>
                        </form>
                        <div className="lifecycle-block">
                          <div className="lifecycle-block__heading">
                            <div>
                              <strong>Replace branch access</strong>
                              <small>
                                Changing scope ends this employee’s active
                                sessions.
                              </small>
                            </div>
                            <span>{branchDraftIds.size} selected</span>
                          </div>
                          <div className="branch-check-grid">
                            {state.branches
                              .filter(
                                (branch) =>
                                  branch.restaurantId ===
                                  selectedEmployee.restaurantId,
                              )
                              .map((branch) => (
                                <label key={branch.id}>
                                  <input
                                    type="checkbox"
                                    checked={branchDraftIds.has(branch.id)}
                                    onChange={(event) =>
                                      setBranchDraftIds((current) => {
                                        const next = new Set(current);
                                        if (event.currentTarget.checked)
                                          next.add(branch.id);
                                        else next.delete(branch.id);
                                        return next;
                                      })
                                    }
                                  />
                                  {branch.name} · {branch.status}
                                </label>
                              ))}
                          </div>
                          <label className="reason-field">
                            Reason for employee access change
                            <input
                              value={employeeReason}
                              minLength={8}
                              maxLength={500}
                              onChange={(event) =>
                                setEmployeeReason(event.currentTarget.value)
                              }
                              placeholder="Explain the operational change"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              void replaceSelectedEmployeeBranches()
                            }
                          >
                            Save branch access
                          </button>
                        </div>
                        <div className="lifecycle-block lifecycle-block--actions">
                          <div className="lifecycle-block__heading">
                            <div>
                              <strong>Login invitation</strong>
                              <small>
                                Creates credentials only after the employee
                                accepts the one-time URL.
                              </small>
                            </div>
                            <span>{selectedEmployee.status}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => void inviteSelectedEmployee()}
                            disabled={selectedEmployee.status !== "active"}
                          >
                            Create invitation URL
                          </button>
                          {invitationLink ? (
                            <div className="invitation-output">
                              <label>
                                One-time invitation URL
                                <input
                                  value={invitationLink}
                                  readOnly
                                  aria-describedby="invitation-expiry"
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => void copyInvitationLink()}
                              >
                                Copy URL
                              </button>
                              <span id="invitation-expiry">
                                Expires{" "}
                                {new Date(invitationExpiry).toLocaleString()}
                              </span>
                              <p role="status" aria-live="polite">
                                {copyMessage}
                              </p>
                            </div>
                          ) : null}
                        </div>
                        <div className="lifecycle-block lifecycle-block--actions">
                          <div className="lifecycle-block__heading">
                            <div>
                              <strong>Employee status</strong>
                              <small>
                                Deactivation requires a reason, confirmation,
                                and atomically revokes sessions.
                              </small>
                            </div>
                            <span>{selectedEmployee.status}</span>
                          </div>
                          {selectedEmployee.status === "active" ? (
                            <button
                              type="button"
                              onClick={() => void deactivateSelectedEmployee()}
                            >
                              Deactivate employee
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void reactivateSelectedEmployee()}
                            >
                              Reactivate employee
                            </button>
                          )}
                        </div>
                        {canManagePermissions ? (
                          <div className="lifecycle-block lifecycle-block--critical">
                            <div className="lifecycle-block__heading">
                              <div>
                                <strong>Administrator protection</strong>
                                <small>
                                  Recent authentication and the
                                  final-administrator guard are enforced by the
                                  server.
                                </small>
                              </div>
                            </div>
                            <div className="record-editor record-editor--compact">
                              <button
                                type="button"
                                onClick={() =>
                                  void removeSelectedAdministrator()
                                }
                              >
                                Remove administrator access
                              </button>
                              <label>
                                Replacement administrator
                                <select
                                  value={replacementEmployeeId}
                                  onChange={(event) =>
                                    setReplacementEmployeeId(
                                      event.currentTarget.value,
                                    )
                                  }
                                >
                                  <option value="">
                                    Select an active employee
                                  </option>
                                  {state.employees
                                    .filter(
                                      (employee) =>
                                        employee.id !== selectedEmployee.id &&
                                        employee.status === "active",
                                    )
                                    .map((employee) => (
                                      <option
                                        key={employee.id}
                                        value={employee.id}
                                      >
                                        {employee.displayName}
                                      </option>
                                    ))}
                                </select>
                              </label>
                              <label className="checkbox-line">
                                <input
                                  type="checkbox"
                                  checked={removeCurrentAdministrator}
                                  onChange={(event) =>
                                    setRemoveCurrentAdministrator(
                                      event.currentTarget.checked,
                                    )
                                  }
                                />
                                Remove my current administrator access after
                                replacement
                              </label>
                              <button
                                type="button"
                                onClick={() => void transferAdministrator()}
                                disabled={!replacementEmployeeId}
                              >
                                Transfer administrator access
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {activePage === "permissions" ? (
                  <section className="admin-section">
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
                        Select an employee to review independently scoped
                        permissions.
                      </p>
                    ) : (
                      <>
                        <div
                          className="template-actions"
                          aria-label="Permission templates"
                        >
                          {state.templates.map((template) => (
                            <div className="template-action" key={template.key}>
                              <span>
                                <strong>{template.displayName}</strong>
                                <small>
                                  {template.active
                                    ? `Version ${template.version} · available`
                                    : `Version ${template.version} · inactive`}
                                </small>
                              </span>
                              <motion.button
                                type="button"
                                disabled={!template.active}
                                onClick={() => void applyTemplate(template)}
                                variants={actionButtonVariants}
                                initial="rest"
                                whileHover="hover"
                                whileTap="tap"
                              >
                                Apply
                              </motion.button>
                              <motion.button
                                type="button"
                                disabled={!template.active}
                                onClick={() =>
                                  void deactivateTemplate(template)
                                }
                                variants={actionButtonVariants}
                                initial="rest"
                                whileHover="hover"
                                whileTap="tap"
                              >
                                Deactivate
                              </motion.button>
                            </div>
                          ))}
                        </div>
                        <label className="reason-field">
                          Reason for template deactivation
                          <input
                            value={templateReason}
                            minLength={8}
                            maxLength={500}
                            onChange={(event) =>
                              setTemplateReason(event.currentTarget.value)
                            }
                            placeholder="Describe why future template use must stop"
                          />
                        </label>
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
                                        {selectedEmployee.branchIds.map(
                                          (branchId) => {
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
                                                  checked={draftGrantIds.has(
                                                    id,
                                                  )}
                                                  onChange={(event) =>
                                                    toggleGrant(
                                                      id,
                                                      event.target.checked,
                                                    )
                                                  }
                                                />
                                                {branch?.name ??
                                                  "Assigned branch"}
                                              </label>
                                            );
                                          },
                                        )}
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
                                            grantFor(
                                              definition,
                                              selectedEmployee,
                                            ),
                                          ),
                                        )}
                                        onChange={(event) =>
                                          toggleGrant(
                                            grantId(
                                              grantFor(
                                                definition,
                                                selectedEmployee,
                                              ),
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
                        <motion.button
                          className="primary-action"
                          type="button"
                          onClick={() => void savePermissions()}
                          variants={actionButtonVariants}
                          initial="rest"
                          whileHover="hover"
                          whileTap="tap"
                        >
                          Save permission set
                        </motion.button>
                      </>
                    )}
                  </section>
                ) : null}

                {activeBranch &&
                (activePage === "menu" || activePage === "tables") ? (
                  <div
                    className={`administration-route administration-route--${activePage}`}
                  >
                    <MenuTablesAdministration
                      key={`${activeBranch.id}-${activePage}`}
                      branch={activeBranch}
                      permissions={menuTablesPermissions}
                      features={{
                        menu: persistedFeatureValues["CFG-003"] !== "disabled",
                        qrMenu:
                          persistedFeatureValues["CFG-004"] !== "disabled",
                        tables:
                          persistedFeatureValues["CFG-006"] !== "disabled",
                      }}
                    />
                  </div>
                ) : null}

                {activePage === "insights" ? (
                  <InsightsAdministration
                    restaurants={state.restaurants}
                    branches={state.branches}
                    activeBranchId={state.activeBranchId}
                    canViewReports={canViewReports}
                    canViewCrossBranch={activePermissionKeys.has(
                      "reports.view_cross_branch",
                    )}
                    canViewAudit={canViewAudit}
                    canViewTenantAudit={canViewTenantAudit}
                    canManageFeatures={canManageFeatures}
                  />
                ) : null}

                {activePage === "features" ? (
                  <section className="admin-section">
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
                                <strong>
                                  {feature.key.replaceAll("_", " ")}
                                </strong>
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
                      <motion.button
                        className="primary-action"
                        type="submit"
                        variants={actionButtonVariants}
                        initial="rest"
                        whileHover="hover"
                        whileTap="tap"
                      >
                        Save feature version
                      </motion.button>
                    </form>
                  </section>
                ) : null}
              </motion.div>
            </AnimatePresence>
          </section>
        </main>
      </div>
    </MotionConfig>
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
