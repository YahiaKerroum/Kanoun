import { describe, expect, it } from "vitest";
import {
  chooseStaffLanding,
  safeStaffReturnPath,
  staffPathForSection,
  staffSectionForPath,
} from "./staff-navigation.js";

const serviceFeatures = ["ordering", "kitchen", "payments", "reporting"];

describe("staff operational navigation", () => {
  it("maps every local destination to a stable path", () => {
    expect(staffSectionForPath("/orders")).toBe("Orders");
    expect(staffSectionForPath("/kitchen")).toBe("Kitchen");
    expect(staffSectionForPath("/payments")).toBe("Payments");
    expect(staffPathForSection("Reports")).toBe("/reports");
    expect(staffSectionForPath("/not-a-workspace")).toBeNull();
  });

  it("chooses deterministic landings from permissions and features", () => {
    expect(
      chooseStaffLanding(
        ["orders.view", "kitchen.view"],
        ["ordering", "kitchen"],
      ),
    ).toBe("Kitchen");
    expect(
      chooseStaffLanding(
        ["orders.view", "orders.create", "orders.complete", "payments.view"],
        ["ordering", "payments"],
      ),
    ).toBe("Payments");
    expect(chooseStaffLanding(["orders.view"], ["ordering"])).toBe("Orders");
    expect(chooseStaffLanding(["reports.view"], ["reporting"])).toBe("Reports");
    expect(
      chooseStaffLanding(
        ["orders.view", "kitchen.view", "payments.view"],
        serviceFeatures,
      ),
    ).toBe("Home");
  });

  it("rejects unsafe return targets while preserving route state", () => {
    expect(safeStaffReturnPath("/orders?order=trusted")).toBe(
      "/orders?order=trusted",
    );
    expect(safeStaffReturnPath("https://evil.example/orders")).toBe("/");
    expect(safeStaffReturnPath("//evil.example/orders")).toBe("/");
    expect(safeStaffReturnPath("/unknown")).toBe("/");
    expect(safeStaffReturnPath("/payments#ledger")).toBe("/payments#ledger");
  });
});
