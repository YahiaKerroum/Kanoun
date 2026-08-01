import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createDatabasePool } from "./pool.js";
import {
  PostgresOutboxProcessor,
  type OutboxEvent,
  type OutboxEventHandler,
} from "./outbox-processor.js";

const connectionString = process.env.TEST_DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase("PostgreSQL outbox processor", () => {
  if (!connectionString) return;

  const pool = createDatabasePool({
    connectionString,
    applicationName: "rms-slice-008-outbox-test",
    maximumConnections: 8,
  });
  const eventIds: string[] = [];

  async function insertEvent(input: {
    businessAccountId: string;
    aggregateId: string;
    aggregateVersion: number;
    occurredAtUtc: Date;
  }): Promise<string> {
    const eventId = randomUUID();
    eventIds.push(eventId);
    await pool.query(
      `
        insert into platform.outbox_messages (
          event_id, event_type, schema_version, business_account_id,
          aggregate_id, aggregate_version, occurred_at_utc, correlation_id,
          causation_id, payload, next_attempt_at_utc
        )
        values ($1, 'test.slice008.v1', 1, $2, $3, $4, $5, $6, $6, '{}'::jsonb, $5)
      `,
      [
        eventId,
        input.businessAccountId,
        input.aggregateId,
        input.aggregateVersion,
        input.occurredAtUtc,
        randomUUID(),
      ],
    );
    return eventId;
  }

  afterEach(async () => {
    if (eventIds.length === 0) return;
    await pool.query(
      "delete from platform.inbox_checkpoints where event_id = any($1::uuid[])",
      [eventIds],
    );
    await pool.query(
      "delete from platform.outbox_messages where event_id = any($1::uuid[])",
      [eventIds],
    );
    eventIds.length = 0;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("processes one aggregate in version order and replays one event idempotently", async () => {
    const tenantId = randomUUID();
    const aggregateId = randomUUID();
    const handled: number[] = [];
    const handler: OutboxEventHandler = {
      name: `test.ordering.${randomUUID()}`,
      supports: () => true,
      handle: (_transaction, event) => {
        handled.push(event.aggregateVersion);
        return Promise.resolve();
      },
    };
    const firstId = await insertEvent({
      businessAccountId: tenantId,
      aggregateId,
      aggregateVersion: 1,
      occurredAtUtc: new Date("2026-07-29T10:00:00.000Z"),
    });
    await insertEvent({
      businessAccountId: tenantId,
      aggregateId,
      aggregateVersion: 2,
      occurredAtUtc: new Date("2026-07-29T09:00:00.000Z"),
    });
    const processor = new PostgresOutboxProcessor(pool, {
      workerId: `worker-${randomUUID()}`,
      businessAccountId: tenantId,
      handlers: [handler],
    });

    await expect(processor.processNext()).resolves.toBe("processed");
    await expect(processor.processNext()).resolves.toBe("processed");
    expect(handled).toEqual([1, 2]);

    await expect(processor.replayEvent(firstId)).resolves.toBe(true);
    await expect(processor.processNext()).resolves.toBe("processed");
    expect(handled).toEqual([1, 2, 1]);
    const checkpoint = await pool.query<{ count: number }>(
      `
        select count(*)::integer as count
        from platform.inbox_checkpoints
        where event_id = $1 and handler_name = $2
      `,
      [firstId, handler.name],
    );
    expect(checkpoint.rows[0]?.count).toBe(1);
  });

  it("retries, quarantines poison work, blocks its successor, and resumes after replay", async () => {
    const tenantId = randomUUID();
    const aggregateId = randomUUID();
    let now = new Date("2026-07-29T11:00:00.000Z");
    let fail = true;
    const handled: string[] = [];
    const quarantineEvidence: {
      readonly eventId: string;
      readonly businessAccountId: string;
      readonly aggregateId: string;
      readonly attemptCount: number;
      readonly failureCode: string;
    }[] = [];
    const handler: OutboxEventHandler = {
      name: `test.poison.${randomUUID()}`,
      supports: () => true,
      handle: (_transaction, event: OutboxEvent) => {
        if (fail && event.aggregateVersion === 1) {
          throw new Error("poison");
        }
        handled.push(event.eventId);
        return Promise.resolve();
      },
    };
    const poisonId = await insertEvent({
      businessAccountId: tenantId,
      aggregateId,
      aggregateVersion: 1,
      occurredAtUtc: now,
    });
    const successorId = await insertEvent({
      businessAccountId: tenantId,
      aggregateId,
      aggregateVersion: 2,
      occurredAtUtc: new Date(now.getTime() + 1),
    });
    const processor = new PostgresOutboxProcessor(pool, {
      workerId: `worker-${randomUUID()}`,
      businessAccountId: tenantId,
      handlers: [handler],
      maximumAttempts: 2,
      now: () => now,
      onQuarantined: (evidence) => {
        quarantineEvidence.push(evidence);
      },
    });

    await expect(processor.processNext()).resolves.toBe("retry_scheduled");
    now = new Date(now.getTime() + 5_000);
    await expect(processor.processNext()).resolves.toBe("quarantined");
    await expect(processor.processNext()).resolves.toBe("idle");
    expect(quarantineEvidence).toEqual([
      expect.objectContaining({
        eventId: poisonId,
        businessAccountId: tenantId,
        aggregateId,
        attemptCount: 2,
        failureCode: "Error",
      }),
    ]);

    fail = false;
    await expect(processor.replayQuarantined(poisonId)).resolves.toBe(true);
    await expect(processor.processNext()).resolves.toBe("processed");
    await expect(processor.processNext()).resolves.toBe("processed");
    expect(handled).toEqual([poisonId, successorId]);
  });

  it("lets competing workers claim distinct events exactly once", async () => {
    const tenantId = randomUUID();
    const handled: string[] = [];
    const handler: OutboxEventHandler = {
      name: `test.concurrent.${randomUUID()}`,
      supports: () => true,
      handle: async (_transaction, event) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        handled.push(event.eventId);
      },
    };
    await insertEvent({
      businessAccountId: tenantId,
      aggregateId: randomUUID(),
      aggregateVersion: 1,
      occurredAtUtc: new Date("2026-07-29T12:00:00.000Z"),
    });
    await insertEvent({
      businessAccountId: tenantId,
      aggregateId: randomUUID(),
      aggregateVersion: 1,
      occurredAtUtc: new Date("2026-07-29T12:00:00.001Z"),
    });
    const createProcessor = () =>
      new PostgresOutboxProcessor(pool, {
        workerId: `worker-${randomUUID()}`,
        businessAccountId: tenantId,
        handlers: [handler],
      });

    await expect(
      Promise.all([
        createProcessor().processNext(),
        createProcessor().processNext(),
      ]),
    ).resolves.toEqual(["processed", "processed"]);
    expect(new Set(handled).size).toBe(2);
  });
});
