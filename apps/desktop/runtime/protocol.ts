import { z } from "zod";

/**
 * Line-delimited JSON protocol between the Tauri shell (Rust) and the Node
 * runtime host. The shell writes one command per line to the host's stdin;
 * the host writes one response or event per line to stdout. Nothing else is
 * ever written to stdout — logs go to the runtime log file.
 */

export const databaseUrlSchema = z
  .string()
  .trim()
  .min(1, "Enter a connection URL.")
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return (
          (url.protocol === "postgresql:" || url.protocol === "postgres:") &&
          url.hostname.length > 0 &&
          url.pathname.length > 1
        );
      } catch {
        return false;
      }
    },
    {
      message:
        "Use the form postgresql://user:password@host:5432/database (the database name is required).",
    },
  )
  .transform((value) => value.replace(/^postgres:/, "postgresql:"));

export const connectionSettingsSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("local") }),
  z.object({ mode: z.literal("server"), databaseUrl: databaseUrlSchema }),
]);

export type ConnectionSettings = z.infer<typeof connectionSettingsSchema>;

const localTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const restaurantDraftSchema = z.object({
  businessName: z.string().trim().min(1).max(160),
  businessCode: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]+$/),
  restaurantName: z.string().trim().min(1).max(160),
  branchName: z.string().trim().min(1).max(160),
  addressLine: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(120),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  phone: z.string().trim().min(5).max(32),
  timeZone: z.string().min(1).max(100),
  currency: z.string().regex(/^[A-Z]{3}$/),
  opensAt: localTime,
  closesAt: localTime,
  ownerName: z.string().trim().min(1).max(160),
  ownerEmail: z.email().max(320),
  ownerPassword: z
    .string()
    .min(12)
    .max(128)
    .refine((password) => /[a-z]/.test(password) && /[A-Z]/.test(password))
    .refine((password) => /\d/.test(password)),
});

export type RestaurantDraft = z.infer<typeof restaurantDraftSchema>;

export const commandSchema = z.discriminatedUnion("type", [
  z.object({ id: z.number().int(), type: z.literal("status") }),
  z.object({
    id: z.number().int(),
    type: z.literal("configure"),
    settings: connectionSettingsSchema,
  }),
  z.object({
    id: z.number().int(),
    type: z.literal("testConnection"),
    databaseUrl: databaseUrlSchema,
  }),
  z.object({
    id: z.number().int(),
    type: z.literal("createRestaurant"),
    restaurant: restaurantDraftSchema,
  }),
  z.object({ id: z.number().int(), type: z.literal("loadSample") }),
  z.object({ id: z.number().int(), type: z.literal("retry") }),
  z.object({ id: z.number().int(), type: z.literal("resetLocalData") }),
  z.object({ id: z.number().int(), type: z.literal("shutdown") }),
]);

export type RuntimeCommand = z.infer<typeof commandSchema>;

export type RuntimePhase =
  "setup" | "starting" | "welcome" | "ready" | "error" | "stopping";

export type StartupStep = "database" | "migrations" | "services";

export interface WorkspaceUrls {
  readonly staff: string;
  readonly admin: string;
  readonly guest: string;
}

export interface SampleRestaurant {
  readonly businessCode: string;
  readonly restaurantName: string;
  readonly branchName: string;
  readonly password: string;
  readonly roles: readonly {
    readonly label: string;
    readonly displayName: string;
    readonly email: string;
    readonly workspace: "staff" | "admin";
  }[];
  readonly tableUrl?: string;
  readonly tableCode?: string;
}

export interface RestaurantSummary {
  readonly businessCode: string;
  readonly name: string;
  readonly branches: number;
}

export interface RecoveryMessage {
  readonly email: string;
  readonly businessCode: string;
  readonly url: string;
  readonly expiresAtUtc: string;
}

export interface RuntimeState {
  readonly phase: RuntimePhase;
  readonly step?: StartupStep;
  readonly mode?: ConnectionSettings["mode"];
  /** Where the data lives, never including credentials. */
  readonly databaseLabel?: string;
  readonly urls?: WorkspaceUrls;
  readonly restaurants?: readonly RestaurantSummary[];
  readonly sample?: SampleRestaurant;
  readonly recovery?: readonly RecoveryMessage[];
  readonly error?: { readonly title: string; readonly detail: string };
  readonly dataDirectory: string;
}

export type RuntimeOutput =
  | { readonly id: number; readonly ok: true; readonly result: unknown }
  | {
      readonly id: number;
      readonly ok: false;
      readonly error: { readonly message: string };
    }
  | { readonly event: "state"; readonly state: RuntimeState };

export function parseCommand(
  line: string,
): { ok: true; command: RuntimeCommand } | { ok: false; id?: number } {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return { ok: false };
  }
  const parsed = commandSchema.safeParse(raw);
  if (parsed.success) {
    return { ok: true, command: parsed.data };
  }
  const id =
    typeof raw === "object" && raw !== null && "id" in raw
      ? Number(raw.id)
      : Number.NaN;
  return Number.isInteger(id) ? { ok: false, id } : { ok: false };
}

/** Describes a database URL for display without leaking its password. */
export function describeDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const port = url.port || "5432";
  return `${url.hostname}:${port}${url.pathname}`;
}
