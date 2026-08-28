import { describe, expect, it } from "vitest";
import { WindowRegistry, type RoleWindowHandle } from "./window-registry.js";

function testHandle(
  id: number,
  overrides: Partial<RoleWindowHandle> = {},
): RoleWindowHandle & { closed: boolean; focused: boolean } {
  const handle = {
    id,
    roleKey: "kitchen",
    label: `Window ${String(id)}`,
    closed: false,
    focused: false,
    close(): void {
      handle.closed = true;
    },
    focus(): void {
      handle.focused = true;
    },
    ...overrides,
  };
  return handle;
}

describe("WindowRegistry", () => {
  it("lists nothing when empty", () => {
    const registry = new WindowRegistry();

    expect(registry.list()).toEqual([]);
  });

  it("lists every registered window", () => {
    const registry = new WindowRegistry();
    const first = testHandle(1);
    const second = testHandle(2);

    registry.register(first);
    registry.register(second);

    expect(registry.list()).toHaveLength(2);
    expect(registry.list().map((handle) => handle.id)).toEqual([1, 2]);
  });

  it("removes a window on unregister", () => {
    const registry = new WindowRegistry();
    registry.register(testHandle(1));
    registry.register(testHandle(2));

    registry.unregister(1);

    expect(registry.list().map((handle) => handle.id)).toEqual([2]);
  });

  it("closes and forgets every window on closeAll", () => {
    const registry = new WindowRegistry();
    const first = testHandle(1);
    const second = testHandle(2);
    registry.register(first);
    registry.register(second);

    registry.closeAll();

    expect(first.closed).toBe(true);
    expect(second.closed).toBe(true);
    expect(registry.list()).toEqual([]);
  });
});
