import { describe, expect, it } from "vitest";
import { createSetupReloadGuard } from "./useSetupReadinessData.js";

describe("setup readiness reload guard", () => {
  it("aborts stale reloads and cancels the active load on cleanup", () => {
    const guard = createSetupReloadGuard();
    const first = guard.begin();
    const second = guard.begin();

    expect(first.signal.aborted).toBe(true);
    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);

    guard.cancel();

    expect(second.signal.aborted).toBe(true);
    expect(guard.isCurrent(second)).toBe(false);
  });
});
