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
      ? "Add a table before creating table QR codes."
      : qrStatus === "ready"
        ? "Guests can order by scanning a table QR code."
        : "Tables are set up, but none has a QR code guests can order from yet.";
  return [
    {
      id: "restaurant",
      title: "Restaurant details",
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
      title: "Branch details",
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
        : "Add a branch with its address, phone or email, time zone, and currency.",
      href: "#branch-editor",
    },
    {
      id: "hours",
      title: "Opening hours",
      status: branch && branch.openingHours.length > 0 ? "ready" : "attention",
      detail: branch
        ? branch.openingHours.length > 0
          ? `Times are in ${branch.timeZone}. A branch can stay open past midnight.`
          : "No opening hours yet."
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
        ? `Service is ${branch.serviceStatus.replaceAll("_", " ")}. Guests can only order while the branch is open and within its hours.`
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
        ? "Your account can't see the team. Ask the owner to check who is assigned to this branch."
        : employees.length > 0
          ? `${employees.length} active staff member${employees.length === 1 ? "" : "s"} in this branch.`
          : "Add your team under Staff, then send each person an invitation to sign in.",
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
          ? "Your account can't see which features are turned on."
          : missingFeatures.length > 0
            ? `Choose on or off for: ${missingFeatures.join(", ")}.`
            : disabledDependencies
              ? "A feature that's on needs another feature that's off. Check Features."
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
        ? "Guests can browse the menu from the branch QR code."
        : "Optional: create a branch QR code so guests can browse the menu, under Tables & QR.",
      href: "/tables",
    },
  ];
}
