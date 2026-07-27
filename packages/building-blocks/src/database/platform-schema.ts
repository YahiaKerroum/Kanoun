import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const platformSchema = pgSchema("platform");

export const outboxMessages = platformSchema.table(
  "outbox_messages",
  {
    eventId: uuid("event_id").primaryKey(),
    eventType: varchar("event_type", { length: 160 }).notNull(),
    schemaVersion: integer("schema_version").notNull(),
    businessAccountId: uuid("business_account_id").notNull(),
    restaurantId: uuid("restaurant_id"),
    branchId: uuid("branch_id"),
    aggregateId: uuid("aggregate_id").notNull(),
    aggregateVersion: integer("aggregate_version").notNull(),
    occurredAtUtc: timestamp("occurred_at_utc", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    correlationId: uuid("correlation_id").notNull(),
    causationId: uuid("causation_id").notNull(),
    actorId: uuid("actor_id"),
    traceContext: text("trace_context"),
    payload: jsonb("payload").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAtUtc: timestamp("next_attempt_at_utc", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    claimedBy: varchar("claimed_by", { length: 160 }),
    claimedUntilUtc: timestamp("claimed_until_utc", {
      mode: "date",
      withTimezone: true,
    }),
    processedAtUtc: timestamp("processed_at_utc", {
      mode: "date",
      withTimezone: true,
    }),
    quarantinedAtUtc: timestamp("quarantined_at_utc", {
      mode: "date",
      withTimezone: true,
    }),
    lastErrorCode: varchar("last_error_code", { length: 160 }),
  },
  (table) => [
    check("outbox_schema_version_positive", sql`${table.schemaVersion} >= 1`),
    check(
      "outbox_aggregate_version_positive",
      sql`${table.aggregateVersion} >= 1`,
    ),
    check("outbox_attempt_count_nonnegative", sql`${table.attemptCount} >= 0`),
    index("outbox_worker_claim_idx").on(
      table.processedAtUtc,
      table.nextAttemptAtUtc,
    ),
    index("outbox_aggregate_order_idx").on(
      table.businessAccountId,
      table.aggregateId,
      table.aggregateVersion,
    ),
  ],
);

export const inboxCheckpoints = platformSchema.table(
  "inbox_checkpoints",
  {
    eventId: uuid("event_id").notNull(),
    handlerName: varchar("handler_name", { length: 160 }).notNull(),
    processedAtUtc: timestamp("processed_at_utc", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    resultHash: varchar("result_hash", { length: 64 }),
  },
  (table) => [
    uniqueIndex("inbox_event_handler_uidx").on(
      table.eventId,
      table.handlerName,
    ),
  ],
);

export const idempotencyRecords = platformSchema.table(
  "idempotency_records",
  {
    id: uuid("id").primaryKey(),
    businessAccountId: uuid("business_account_id").notNull(),
    actorScope: varchar("actor_scope", { length: 160 }).notNull(),
    operation: varchar("operation", { length: 160 }).notNull(),
    idempotencyKeyHash: varchar("idempotency_key_hash", {
      length: 64,
    }).notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    status: varchar("status", { length: 24 }).notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    createdAtUtc: timestamp("created_at_utc", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    expiresAtUtc: timestamp("expires_at_utc", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    check(
      "idempotency_status_supported",
      sql`${table.status} in ('pending', 'completed', 'failed')`,
    ),
    check(
      "idempotency_expiry_after_creation",
      sql`${table.expiresAtUtc} > ${table.createdAtUtc}`,
    ),
    uniqueIndex("idempotency_scope_key_uidx").on(
      table.businessAccountId,
      table.actorScope,
      table.operation,
      table.idempotencyKeyHash,
    ),
    index("idempotency_expiry_idx").on(table.expiresAtUtc),
  ],
);
