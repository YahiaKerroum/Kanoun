import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { integrationEventEnvelopeSchema } from "./integration-event-envelope.js";

describe("integration event envelope", () => {
  it("accepts the approved required envelope fields", () => {
    const id = randomUUID();
    const result = integrationEventEnvelopeSchema.safeParse({
      event_id: randomUUID(),
      event_type: "ordering.order_submitted.v1",
      schema_version: 1,
      business_account_id: randomUUID(),
      aggregate_id: randomUUID(),
      aggregate_version: 1,
      occurred_at_utc: new Date().toISOString(),
      correlation_id: id,
      causation_id: id,
      payload: {},
    });

    expect(result.success).toBe(true);
  });

  it("rejects an unscoped event", () => {
    const result = integrationEventEnvelopeSchema.safeParse({
      event_id: randomUUID(),
      event_type: "ordering.order_submitted.v1",
      schema_version: 1,
      aggregate_id: randomUUID(),
      aggregate_version: 1,
      occurred_at_utc: new Date().toISOString(),
      correlation_id: randomUUID(),
      causation_id: randomUUID(),
      payload: {},
    });

    expect(result.success).toBe(false);
  });
});
