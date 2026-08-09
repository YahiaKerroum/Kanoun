import { describe, expect, it } from "vitest";
import {
  buildReadiness,
  draftFromBranch,
  hoursFromDraft,
  readinessFeatureIds,
  type Branch,
  type FeatureResult,
  type SetupData,
} from "./setup-readiness-model.js";

const restaurantId = "00000000-0000-0000-0000-000000000001";
const secondRestaurantId = "00000000-0000-0000-0000-000000000008";
const branchId = "00000000-0000-0000-0000-000000000002";

const enabledFeatureValues = readinessFeatureIds.reduce<
  FeatureResult["configuration"]["values"]
>((values, featureId) => ({ ...values, [featureId]: "enabled" }), {});

const featureResult: FeatureResult = {
  configuration: { version: 1, values: enabledFeatureValues },
  catalog: [],
};

const branch: Branch = {
  id: branchId,
  restaurantId,
  name: "Central",
  address: { line1: "1 Main Street", city: "Algiers", countryCode: "DZ" },
  contact: { email: "central@example.test" },
  timeZone: "Africa/Algiers",
  currency: "DZD",
  status: "active",
  serviceStatus: "open",
  version: 1,
  openingHours: [{ dayOfWeek: 1, opensAt: "09:00", closesAt: "22:00" }],
};

const baseData: SetupData = {
  restaurants: [
    { id: restaurantId, name: "Central Kitchen", status: "active", version: 1 },
  ],
  branches: [branch],
  employees: [
    {
      id: "00000000-0000-0000-0000-000000000003",
      restaurantId,
      status: "active",
      branchIds: [branchId],
    },
  ],
  employeeVisibleRestaurantIds: [restaurantId],
  categories: [
    { id: "00000000-0000-0000-0000-000000000004", status: "active" },
  ],
  dishes: [
    {
      id: "00000000-0000-0000-0000-000000000005",
      status: "active",
      available: true,
    },
  ],
  tables: [{ id: "00000000-0000-0000-0000-000000000006", status: "active" }],
  qrCodes: [
    {
      id: "00000000-0000-0000-0000-000000000007",
      tableId: "00000000-0000-0000-0000-000000000006",
      kind: "table",
      status: "active",
    },
  ],
  features: featureResult,
  restaurantFeatures: featureResult,
};

function item(data: SetupData, id: string, selectedBranch: Branch = branch) {
  const result = buildReadiness(data, selectedBranch).find(
    (readinessItem) => readinessItem.id === id,
  );
  if (!result) throw new Error(`Missing readiness item: ${id}`);
  return result;
}

describe("guided setup readiness model", () => {
  it("marks the configured core prerequisites ready and browse QR optional", () => {
    expect(item(baseData, "restaurant").status).toBe("ready");
    expect(item(baseData, "branch").status).toBe("ready");
    expect(item(baseData, "hours").status).toBe("ready");
    expect(item(baseData, "service").status).toBe("ready");
    expect(item(baseData, "workforce").status).toBe("ready");
    expect(item(baseData, "features").status).toBe("ready");
    expect(item(baseData, "menu").status).toBe("ready");
    expect(item(baseData, "tables").status).toBe("ready");
    expect(item(baseData, "browse-qr").status).toBe("attention");
  });

  it("keeps menu attention until categories and visible dishes exist", () => {
    expect(item({ ...baseData, categories: [] }, "menu")).toMatchObject({
      id: "menu",
      status: "attention",
      href: "/menu",
    });
    expect(item({ ...baseData, dishes: [] }, "menu")).toMatchObject({
      id: "menu",
      status: "attention",
      href: "/menu",
    });
    expect(
      item(
        {
          ...baseData,
          dishes: [
            {
              id: "00000000-0000-0000-0000-000000000005",
              status: "active",
              available: false,
            },
          ],
        },
        "menu",
      ),
    ).toMatchObject({ id: "menu", status: "attention", href: "/menu" });
    expect(item(baseData, "menu").status).toBe("ready");
  });

  it("keeps table ordering attention until an active table QR exists", () => {
    expect(item({ ...baseData, tables: [] }, "tables")).toMatchObject({
      id: "tables",
      status: "attention",
      href: "/tables",
    });
    const noActiveQr = item(
      {
        ...baseData,
        qrCodes: [
          {
            id: "00000000-0000-0000-0000-000000000007",
            tableId: "00000000-0000-0000-0000-000000000006",
            kind: "table",
            status: "revoked",
          },
        ],
      },
      "tables",
    );
    expect(noActiveQr).toMatchObject({
      id: "tables",
      status: "attention",
      href: "/tables",
    });
    expect(item(baseData, "tables").status).toBe("ready");
  });

  it("blocks workforce readiness when employee scope is unavailable", () => {
    const workforce = item(
      { ...baseData, employees: [], employeeVisibleRestaurantIds: [] },
      "workforce",
    );
    expect(workforce.status).toBe("blocked");
    expect(workforce).toMatchObject({
      id: "workforce",
      status: "blocked",
      href: "/employees",
    });
  });

  it("requires an open active branch for service readiness", () => {
    const service = item(
      { ...baseData, branches: [{ ...branch, serviceStatus: "closed" }] },
      "service",
      { ...branch, serviceStatus: "closed" },
    );
    expect(service).toMatchObject({
      id: "service",
      status: "attention",
      href: "#branch-editor",
    });
  });

  it("blocks missing feature configuration instead of claiming readiness", () => {
    expect(
      item(
        { ...baseData, features: null, restaurantFeatures: null },
        "features",
      ).status,
    ).toBe("blocked");
  });

  it("keeps restaurant readiness aligned when the selected restaurant has no branch", () => {
    const readiness = buildReadiness(
      {
        ...baseData,
        restaurants: [
          ...baseData.restaurants,
          {
            id: secondRestaurantId,
            name: "Second Kitchen",
            status: "active",
            version: 1,
          },
        ],
        branches: [],
      },
      undefined,
      secondRestaurantId,
    );

    expect(readiness.find((item) => item.id === "restaurant")).toMatchObject({
      id: "restaurant",
      status: "ready",
      detail: "Second Kitchen · active",
    });
    expect(readiness.find((item) => item.id === "branch")).toMatchObject({
      id: "branch",
      status: "attention",
      href: "#branch-editor",
    });
  });

  it("round-trips split opening periods without dropping a same-day period", () => {
    const splitOpeningHours = [
      { dayOfWeek: 1, opensAt: "09:00", closesAt: "12:00" },
      { dayOfWeek: 1, opensAt: "13:00", closesAt: "22:00" },
    ];
    const draft = draftFromBranch({
      ...branch,
      openingHours: splitOpeningHours,
    });

    expect(draft.hours[1]?.periods).toEqual([
      { opensAt: "09:00", closesAt: "12:00" },
      { opensAt: "13:00", closesAt: "22:00" },
    ]);
    expect(hoursFromDraft(draft.hours)).toEqual(splitOpeningHours);
  });
});
