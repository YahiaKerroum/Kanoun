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
});

const problemSchema = z.object({
  title: z.string(),
  detail: z.string().optional(),
});

export type CustomerMenu = z.infer<typeof menuSchema>;
export type GuestSession = z.infer<typeof guestSessionSchema>;

export class CustomerRequestError extends Error {
  public constructor(
    public readonly status: number,
    message: string,
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
