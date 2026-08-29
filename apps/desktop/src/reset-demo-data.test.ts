import { describe, expect, it } from "vitest";
import { performDemoDataReset } from "./reset-demo-data.js";

describe("performDemoDataReset", () => {
  it("closes role windows, then requests the reset, then reopens the home window, in order", async () => {
    const calls: string[] = [];

    await performDemoDataReset({
      closeRoleWindows: () => calls.push("close"),
      requestReset: () => {
        calls.push("request");
        return Promise.resolve();
      },
      reopenHomeWindow: () => calls.push("reopen"),
    });

    expect(calls).toEqual(["close", "request", "reopen"]);
  });

  it("does not reopen the home window when the reset request fails", async () => {
    const calls: string[] = [];

    await expect(
      performDemoDataReset({
        closeRoleWindows: () => calls.push("close"),
        requestReset: () => {
          calls.push("request");
          return Promise.reject(new Error("reset failed"));
        },
        reopenHomeWindow: () => calls.push("reopen"),
      }),
    ).rejects.toThrow("reset failed");

    expect(calls).toEqual(["close", "request"]);
  });
});
