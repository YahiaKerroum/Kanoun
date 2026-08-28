import { describe, expect, it } from "vitest";
import { encodeReadyLine, parseReadyLine } from "./orchestrator-protocol.js";

describe("encodeReadyLine / parseReadyLine", () => {
  it("round-trips a ready message", () => {
    const encoded = encodeReadyLine({
      launcherOrigin: "http://127.0.0.1:4170",
    });

    const parsed = parseReadyLine(encoded);

    expect(parsed).toEqual({ launcherOrigin: "http://127.0.0.1:4170" });
  });

  it("returns null for a line without the ready prefix", () => {
    expect(parseReadyLine("[demo:api] listening on 3000")).toBeNull();
  });

  it("returns null for a ready-prefixed line with malformed JSON", () => {
    expect(parseReadyLine("MISE_DESKTOP_READY {not json")).toBeNull();
  });

  it("returns null for a ready-prefixed line missing launcherOrigin", () => {
    expect(parseReadyLine("MISE_DESKTOP_READY {}")).toBeNull();
  });

  it("returns null when launcherOrigin is not a string", () => {
    expect(
      parseReadyLine('MISE_DESKTOP_READY {"launcherOrigin":5}'),
    ).toBeNull();
  });
});
