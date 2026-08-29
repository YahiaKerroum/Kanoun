import { describe, expect, it } from "vitest";
import { buildTrayMenuTemplate, type TrayMenuActions } from "./tray-menu.js";
import type { RoleWindowHandle } from "./window-registry.js";

function noopActions(
  overrides: Partial<TrayMenuActions> = {},
): TrayMenuActions {
  return {
    openHome: () => undefined,
    resetDemoData: () => undefined,
    quit: () => undefined,
    ...overrides,
  };
}

function testHandle(
  overrides: Partial<RoleWindowHandle> = {},
): RoleWindowHandle {
  return {
    id: 1,
    roleKey: "kitchen",
    label: "Kitchen staff",
    close: () => undefined,
    focus: () => undefined,
    ...overrides,
  };
}

describe("buildTrayMenuTemplate", () => {
  it("shows a disabled placeholder when no role windows are open", () => {
    const template = buildTrayMenuTemplate([], noopActions());

    const placeholder = template.find(
      (item) => item.label === "No role windows open",
    );

    expect(placeholder).toBeDefined();
    expect(placeholder?.enabled).toBe(false);
  });

  it("lists each open role window by its label", () => {
    const template = buildTrayMenuTemplate([testHandle()], noopActions());

    expect(template.some((item) => item.label === "Kitchen staff")).toBe(true);
  });

  it("focuses the matching window when its menu item is clicked", () => {
    let focused = false;
    const handle = testHandle({ focus: () => (focused = true) });

    const template = buildTrayMenuTemplate([handle], noopActions());
    const item = template.find((entry) => entry.label === "Kitchen staff");
    (item?.click as (() => void) | undefined)?.();

    expect(focused).toBe(true);
  });

  it("invokes resetDemoData when the reset item is clicked", () => {
    let resetCalled = false;
    const actions = noopActions({ resetDemoData: () => (resetCalled = true) });

    const template = buildTrayMenuTemplate([], actions);
    const item = template.find((entry) => entry.label === "Reset demo data");
    (item?.click as (() => void) | undefined)?.();

    expect(resetCalled).toBe(true);
  });

  it("invokes quit when the quit item is clicked", () => {
    let quitCalled = false;
    const actions = noopActions({ quit: () => (quitCalled = true) });

    const template = buildTrayMenuTemplate([], actions);
    const item = template.find((entry) => entry.label === "Quit");
    (item?.click as (() => void) | undefined)?.();

    expect(quitCalled).toBe(true);
  });
});
