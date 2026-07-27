import { z } from "zod";

export const integrationEventEnvelopeSchema = z.object({
  event_id: z.uuid(),
  event_type: z.string().min(1).max(160),
  schema_version: z.int().positive(),
  business_account_id: z.uuid(),
  restaurant_id: z.uuid().optional(),
  branch_id: z.uuid().optional(),
  aggregate_id: z.uuid(),
  aggregate_version: z.int().positive(),
  occurred_at_utc: z.iso.datetime({ offset: true }),
  correlation_id: z.uuid(),
  causation_id: z.uuid(),
  actor_id: z.uuid().optional(),
  trace_context: z.string().max(1_000).optional(),
  payload: z.record(z.string(), z.unknown()),
});

export type IntegrationEventEnvelope = z.infer<
  typeof integrationEventEnvelopeSchema
>;
