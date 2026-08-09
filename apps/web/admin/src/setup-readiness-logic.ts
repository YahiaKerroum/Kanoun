import { readinessFeatureIds } from "./setup-readiness-types.js";
import type {
  Branch,
  ReadinessItem,
  ReadinessStatus,
  SetupData,
} from "./setup-readiness-types.js";

export function buildReadiness(
  data: SetupData,
  branch: Branch | undefined,
  selectedRestaurantId?: string,
): readonly ReadinessItem[] {
  const restaurant = branch
    ? data.restaurants.find((item) => item.id === branch.restaurantId)
    : (data.restaurants.find((item) => item.id === selectedRestaurantId) ??
      data.restaurants[0]);
  const employeesVisible = Boolean(
    branch && data.employeeVisibleRestaurantIds.includes(branch.restaurantId),
  );
  const employees = branch
    ? data.employees.filter(
        (employee) =>
          employee.branchIds.includes(branch.id) &&
          employee.status === "active",
      )
    : [];
  const featureValues = {
    ...(data.restaurantFeatures?.configuration.values ?? {}),
    ...(data.features?.configuration.values ?? {}),
  };
  const missingFeatures = readinessFeatureIds.filter(
    (featureId) => featureValues[featureId] === undefined,
  );
  const disabledDependencies = data.features?.catalog.some((feature) =>
    feature.dependsOn.some(
      (dependency) => featureValues[dependency] === "disabled",
    ),
  );
  const menuStatus: ReadinessStatus =
    data.categories.length === 0 || data.dishes.length === 0
      ? "attention"
      : data.dishes.some((dish) => dish.status === "active" && dish.available)
        ? "ready"
        : "attention";
  const menuDetail =
    data.categories.length === 0
      ? "No menu categories exist yet."
      : data.dishes.length === 0
        ? "Categories exist, but no dishes have been added."
        : menuStatus === "ready"
          ? `${data.categories.length} categories and visible dishes are available.`
          : "Dishes exist, but none are active and available for guests.";
  const qrStatus: ReadinessStatus =
    data.tables.length === 0
      ? "attention"
      : data.qrCodes.some((qr) => qr.kind === "table" && qr.status === "active")
        ? "ready"
        : "attention";
  const qrDetail =
    data.tables.length === 0
      ? "Create at least one table before issuing table-ordering QR codes."
      : qrStatus === "ready"
        ? "At least one active table-ordering QR is available."
        : "Tables exist, but no active table-ordering QR is available.";
  return [
    {
      id: "restaurant",
      title: "Restaurant identity and status",
      status:
        restaurant &&
        restaurant.name.trim().length > 0 &&
        restaurant.status === "active"
          ? "ready"
          : "attention",
      detail: restaurant
        ? `${restaurant.name} · ${restaurant.status}`
        : "Create a restaurant before configuring a branch.",
      href: "#restaurant-editor",
    },
    {
      id: "branch",
      title: "Branch identity and service context",
      status:
        branch &&
        branch.name.trim().length > 0 &&
        Boolean(
          branch.address?.line1 &&
          branch.address.city &&
          branch.address.countryCode,
        ) &&
        Boolean(
          branch.contact &&
          [branch.contact.email, branch.contact.phone].some((value) =>
            Boolean(value),
          ),
        ) &&
        branch.status === "active"
          ? "ready"
          : "attention",
      detail: branch
        ? `${branch.name} · ${branch.timeZone} · ${branch.currency}`
        : "Create a branch and add its address, contact, time zone, and currency.",
      href: "#branch-editor",
    },
    {
      id: "hours",
      title: "Opening hours",
      status: branch && branch.openingHours.length > 0 ? "ready" : "attention",
      detail: branch
        ? branch.openingHours.length > 0
          ? `Hours are evaluated in ${branch.timeZone}. Overnight periods are supported.`
          : "No opening periods are configured."
        : "Opening hours follow the selected branch time zone.",
      href: "#hours-editor",
    },
    {
      id: "service",
      title: "Service status",
      status:
        branch?.serviceStatus === "open" && branch.status === "active"
          ? "ready"
          : "attention",
      detail: branch
        ? `Service is ${branch.serviceStatus.replaceAll("_", " ")}. New orders follow the server-side status and hours guards.`
        : "Select a branch to review service status.",
      href: "#branch-editor",
    },
    {
      id: "workforce",
      title: "Workforce access",
      status: !employeesVisible
        ? "blocked"
        : employees.length > 0
          ? "ready"
          : "attention",
      detail: !employeesVisible
        ? "Workforce access is unavailable for this permission scope. Ask an administrator with employees.view to review branch assignments."
        : employees.length > 0
          ? `${employees.length} active branch-assigned profile${employees.length === 1 ? "" : "s"} found.`
          : "Add an active branch-assigned employee profile, then invite login access in Workforce.",
      href: "/employees",
    },
    {
      id: "features",
      title: "Approved MVP features",
      status:
        data.features &&
        data.restaurantFeatures &&
        missingFeatures.length === 0 &&
        !disabledDependencies
          ? "ready"
          : "blocked",
      detail:
        !data.features || !data.restaurantFeatures
          ? "Feature configuration is unavailable for the current permission scope."
          : missingFeatures.length > 0
            ? `Missing persisted values for ${missingFeatures.join(", ")}.`
            : disabledDependencies
              ? "A configured feature depends on a disabled prerequisite."
              : `Restaurant v${data.restaurantFeatures.configuration.version} · branch v${data.features.configuration.version}`,
      href: "/features",
    },
    {
      id: "menu",
      title: "Menu visibility",
      status: menuStatus,
      detail: menuDetail,
      href: "/menu",
    },
    {
      id: "tables",
      title: "Tables and ordering QR",
      status: qrStatus,
      detail: qrDetail,
      href: "/tables",
    },
    {
      id: "browse-qr",
      title: "Branch browse-only QR",
      status: data.qrCodes.some(
        (qr) => qr.kind === "branch" && qr.status === "active",
      )
        ? "ready"
        : "attention",
      detail: data.qrCodes.some(
        (qr) => qr.kind === "branch" && qr.status === "active",
      )
        ? "An active branch QR is available for browse-only guest access."
        : "Optional: issue a branch QR for browse-only access from Tables & QR.",
      href: "/tables",
    },
  ];
}
