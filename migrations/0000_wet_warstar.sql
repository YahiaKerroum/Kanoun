CREATE SCHEMA "platform";
--> statement-breakpoint
CREATE TABLE "platform"."idempotency_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_account_id" uuid NOT NULL,
	"actor_scope" varchar(160) NOT NULL,
	"operation" varchar(160) NOT NULL,
	"idempotency_key_hash" varchar(64) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"status" varchar(24) NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at_utc" timestamp with time zone NOT NULL,
	"expires_at_utc" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_status_supported" CHECK ("platform"."idempotency_records"."status" in ('pending', 'completed', 'failed')),
	CONSTRAINT "idempotency_expiry_after_creation" CHECK ("platform"."idempotency_records"."expires_at_utc" > "platform"."idempotency_records"."created_at_utc")
);
--> statement-breakpoint
CREATE TABLE "platform"."inbox_checkpoints" (
	"event_id" uuid NOT NULL,
	"handler_name" varchar(160) NOT NULL,
	"processed_at_utc" timestamp with time zone NOT NULL,
	"result_hash" varchar(64)
);
--> statement-breakpoint
CREATE TABLE "platform"."outbox_messages" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"event_type" varchar(160) NOT NULL,
	"schema_version" integer NOT NULL,
	"business_account_id" uuid NOT NULL,
	"restaurant_id" uuid,
	"branch_id" uuid,
	"aggregate_id" uuid NOT NULL,
	"aggregate_version" integer NOT NULL,
	"occurred_at_utc" timestamp with time zone NOT NULL,
	"correlation_id" uuid NOT NULL,
	"causation_id" uuid NOT NULL,
	"actor_id" uuid,
	"trace_context" text,
	"payload" jsonb NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at_utc" timestamp with time zone NOT NULL,
	"claimed_by" varchar(160),
	"claimed_until_utc" timestamp with time zone,
	"processed_at_utc" timestamp with time zone,
	"quarantined_at_utc" timestamp with time zone,
	"last_error_code" varchar(160),
	CONSTRAINT "outbox_schema_version_positive" CHECK ("platform"."outbox_messages"."schema_version" >= 1),
	CONSTRAINT "outbox_aggregate_version_positive" CHECK ("platform"."outbox_messages"."aggregate_version" >= 1),
	CONSTRAINT "outbox_attempt_count_nonnegative" CHECK ("platform"."outbox_messages"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_scope_key_uidx" ON "platform"."idempotency_records" USING btree ("business_account_id","actor_scope","operation","idempotency_key_hash");--> statement-breakpoint
CREATE INDEX "idempotency_expiry_idx" ON "platform"."idempotency_records" USING btree ("expires_at_utc");--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_event_handler_uidx" ON "platform"."inbox_checkpoints" USING btree ("event_id","handler_name");--> statement-breakpoint
CREATE INDEX "outbox_worker_claim_idx" ON "platform"."outbox_messages" USING btree ("processed_at_utc","next_attempt_at_utc");--> statement-breakpoint
CREATE INDEX "outbox_aggregate_order_idx" ON "platform"."outbox_messages" USING btree ("business_account_id","aggregate_id","aggregate_version");