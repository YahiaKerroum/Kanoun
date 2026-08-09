import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { setupApi } from "./setup-readiness-api.js";

describe("setup API cancellation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("propagates caller cancellation to fetch with an actionable error", async () => {
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
    });
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) => {
        requestSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const caller = new AbortController();

    const request = setupApi(
      "/api/v1/staff/restaurants",
      z.object({ items: z.array(z.object({ id: z.string() })) }),
      { signal: caller.signal },
    );
    caller.abort();

    await expect(request).rejects.toMatchObject({
      name: "SetupApiError",
      status: 408,
    });
    expect(requestSignal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
