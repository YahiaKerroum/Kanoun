import { z } from "zod";

const moneySchema = z.object({
  amount: z.string().regex(/^-?[0-9]+(?:\.[0-9]{1,2})?$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

const optionSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  priceDelta: moneySchema,
});

const optionGroupSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  minimum: z.number().int().nonnegative(),
  maximum: z.number().int().positive(),
  options: z.array(optionSchema),
});

const dishSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullish(),
  unitPrice: moneySchema,
  available: z.boolean(),
  optionGroups: z.array(optionGroupSchema).default([]),
});

export const menuSchema = z.object({
  version: z.string(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  categories: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      dishes: z.array(dishSchema),
    }),
  ),
});

export const guestSessionSchema = z.object({
  branchId: z.uuid(),
  tableId: z.uuid().nullable(),
  tableCode: z.string().nullable(),
  expiresAt: z.iso.datetime(),
  csrfToken: z.string().min(32),
});

const problemSchema = z.object({
  code: z.string().optional(),
  title: z.string(),
  detail: z.string().optional(),
  currentVersion: z.number().int().positive().optional(),
});

export type CustomerMenu = z.infer<typeof menuSchema>;
export type GuestSession = z.infer<typeof guestSessionSchema>;

export const orderSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  version: z.number().int().positive(),
  branchId: z.uuid(),
  tableSessionId: z.uuid(),
  tableId: z.uuid(),
  tableCode: z.string(),
  creatorType: z.enum(["guest", "staff"]),
  createdByEmployeeId: z.uuid().nullable(),
  customerName: z.string().nullable(),
  approval: z.enum(["submitted", "accepted", "rejected"]),
  fulfilment: z.enum(["not_started", "preparing", "ready", "served"]),
  financial: z.enum(["unpaid", "paid", "partially_refunded", "refunded"]),
  closure: z.enum(["active", "completed", "cancelled"]),
  customerSafeStatusReason: z.string().nullable(),
  total: moneySchema,
  submittedAt: z.iso.datetime(),
  acceptedAt: z.iso.datetime(),
  cancellationRequested: z.boolean(),
  items: z.array(
    z.object({
      id: z.uuid(),
      dishId: z.uuid(),
      menuVersion: z.string(),
      name: z.string(),
      quantity: z.number().int().positive(),
      basePrice: moneySchema,
      unitPrice: moneySchema,
      selectedOptions: z.array(
        z.object({
          groupId: z.uuid(),
          groupName: z.string(),
          optionId: z.uuid(),
          optionName: z.string(),
          priceDelta: moneySchema,
        }),
      ),
      note: z.string().nullable(),
      taxInclusive: z.boolean(),
      total: moneySchema,
    }),
  ),
});

const cancellationRequestSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  status: z.enum(["open", "resolved"]),
  reason: z.string(),
  createdAt: z.iso.datetime(),
});

export type GuestOrder = z.infer<typeof orderSchema>;

export class CustomerRequestError extends Error {
  public constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly currentVersion?: number,
  ) {
    super(message);
    this.name = "CustomerRequestError";
  }
}

async function errorFor(response: Response): Promise<CustomerRequestError> {
  const body = problemSchema.safeParse(
    await response.json().catch(() => undefined),
  );
  return new CustomerRequestError(
    response.status,
    body.success
      ? (body.data.detail ?? body.data.title)
      : "The request could not be completed.",
    body.success ? body.data.code : undefined,
    body.success ? body.data.currentVersion : undefined,
  );
}

async function parsedJson<Output>(
  response: Response,
  schema: z.ZodType<Output>,
): Promise<Output> {
  if (!response.ok) {
    throw await errorFor(response);
  }
  return schema.parse(await response.json());
}

export async function exchangeQrToken(token: string): Promise<GuestSession> {
  const response = await fetch(
    `/api/v1/public/qr/${encodeURIComponent(token)}/session`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    },
  );
  return parsedJson(response, guestSessionSchema);
}

export async function getGuestMenu(): Promise<CustomerMenu> {
  const response = await fetch("/api/v1/public/menu", {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  return parsedJson(response, menuSchema);
}

export async function submitGuestOrder(
  session: GuestSession,
  input: {
    readonly menuVersion: string;
    readonly customerName?: string | undefined;
    readonly items: readonly {
      readonly dishId: string;
      readonly quantity: number;
      readonly optionIds: readonly string[];
      readonly note?: string | undefined;
    }[];
  },
  idempotencyKey: string,
): Promise<GuestOrder> {
  const response = await fetch("/api/v1/public/orders", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-csrf-token": session.csrfToken,
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(input),
  });
  return parsedJson(response, orderSchema);
}

export async function getGuestOrder(orderId: string): Promise<GuestOrder> {
  const response = await fetch(
    `/api/v1/public/orders/${encodeURIComponent(orderId)}`,
    {
      credentials: "same-origin",
      headers: { accept: "application/json" },
    },
  );
  return parsedJson(response, orderSchema);
}

export async function requestGuestCancellation(
  session: GuestSession,
  orderId: string,
  reason: string,
  idempotencyKey: string,
): Promise<void> {
  const response = await fetch(
    `/api/v1/public/orders/${encodeURIComponent(orderId)}/cancellation-requests`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-csrf-token": session.csrfToken,
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({ reason }),
    },
  );
  await parsedJson(response, cancellationRequestSchema);
}
