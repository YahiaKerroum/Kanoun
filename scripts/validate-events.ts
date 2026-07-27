import { readFile } from "node:fs/promises";
import process from "node:process";
import { parse } from "yaml";
import { z } from "zod";

const eventSchema = z.object({
  type: z.string().regex(/^[a-z][a-z0-9_.]+\.v[1-9][0-9]*$/),
  owner: z.string().min(1),
  aggregate: z.string().min(1),
  consumers: z.array(z.string().min(1)).min(1),
});

const catalogSchema = z.object({
  document: z.object({
    id: z.literal("EVENT-CATALOG"),
    status: z.literal("approved"),
  }),
  delivery: z.object({
    mode: z.literal("at_least_once"),
    ordering: z.literal("per_aggregate"),
    transport_mvp: z.literal("postgresql_outbox"),
  }),
  envelope: z.object({
    required: z.array(z.string().min(1)).min(1),
  }),
  events: z.record(z.string().regex(/^EVT-[A-Z0-9-]+$/), eventSchema),
});

const source = await readFile("docs/contracts/events.yaml", "utf8");
const catalog = catalogSchema.parse(parse(source));
const eventTypes = Object.values(catalog.events).map((event) => event.type);

if (new Set(eventTypes).size !== eventTypes.length) {
  throw new Error("Event contract contains duplicate event type values.");
}

const requiredEnvelopeFields = new Set(catalog.envelope.required);
const expectedEnvelopeFields = [
  "event_id",
  "event_type",
  "schema_version",
  "business_account_id",
  "aggregate_id",
  "aggregate_version",
  "occurred_at_utc",
  "correlation_id",
  "causation_id",
  "payload",
];

for (const field of expectedEnvelopeFields) {
  if (!requiredEnvelopeFields.has(field)) {
    throw new Error(`Event envelope is missing required field: ${field}`);
  }
}

process.stdout.write(
  `Validated ${eventTypes.length} integration event contracts.\n`,
);
