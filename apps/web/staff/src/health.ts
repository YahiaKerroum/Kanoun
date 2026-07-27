import { z } from "zod";

const readinessSchema = z.object({
  status: z.literal("ready"),
  dependencies: z.object({
    database: z.literal("available"),
  }),
});

export type Readiness =
  | { readonly kind: "checking" }
  | { readonly kind: "ready"; readonly checkedAt: Date }
  | {
      readonly kind: "unavailable";
      readonly checkedAt: Date;
      readonly reason: string;
    };

export async function checkApiReadiness(
  signal: AbortSignal,
): Promise<Readiness> {
  try {
    const response = await fetch("/health/ready", {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
    });

    if (!response.ok) {
      return {
        kind: "unavailable",
        checkedAt: new Date(),
        reason: "API or database is not ready",
      };
    }

    readinessSchema.parse(await response.json());
    return { kind: "ready", checkedAt: new Date() };
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    return {
      kind: "unavailable",
      checkedAt: new Date(),
      reason: "No verified API connection",
    };
  }
}
