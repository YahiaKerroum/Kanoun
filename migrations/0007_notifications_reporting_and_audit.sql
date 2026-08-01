CREATE SCHEMA "notifications";
--> statement-breakpoint
CREATE SCHEMA "reporting";
--> statement-breakpoint
CREATE TABLE "identity"."permission_template_states" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "restaurant_id" uuid NOT NULL,
  "template_key" varchar(64) NOT NULL,
  "active" boolean NOT NULL,
  "version" integer NOT NULL,
  "updated_by_user_id" uuid NOT NULL,
  "reason" varchar(500) NOT NULL,
  "updated_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "permission_template_state_scope_unique"
    UNIQUE ("business_account_id", "restaurant_id", "template_key"),
  CONSTRAINT "permission_template_state_version_positive"
    CHECK ("version" >= 1),
  CONSTRAINT "permission_template_state_tenant_fk"
    FOREIGN KEY ("business_account_id")
    REFERENCES "restaurant"."business_accounts"("id"),
  CONSTRAINT "permission_template_state_restaurant_fk"
    FOREIGN KEY ("business_account_id", "restaurant_id")
    REFERENCES "restaurant"."restaurants"("business_account_id", "id"),
  CONSTRAINT "permission_template_state_template_fk"
    FOREIGN KEY ("template_key")
    REFERENCES "identity"."permission_templates"("template_key"),
  CONSTRAINT "permission_template_state_user_fk"
    FOREIGN KEY ("business_account_id", "updated_by_user_id")
    REFERENCES "identity"."users"("business_account_id", "id")
);
--> statement-breakpoint
CREATE TABLE "notifications"."inbox_items" (
  "id" uuid PRIMARY KEY NOT NULL,
  "event_id" uuid NOT NULL,
  "business_account_id" uuid NOT NULL,
  "restaurant_id" uuid NOT NULL,
  "branch_id" uuid,
  "recipient_user_id" uuid NOT NULL,
  "notification_type" varchar(64) NOT NULL,
  "group_key" varchar(160) NOT NULL,
  "required_permission" varchar(100) NOT NULL,
  "source_event_type" varchar(160) NOT NULL,
  "source_aggregate_id" uuid NOT NULL,
  "title" varchar(160) NOT NULL,
  "body" varchar(500) NOT NULL,
  "task_state" varchar(24) NOT NULL DEFAULT 'unhandled',
  "read_at_utc" timestamp with time zone,
  "acknowledged_at_utc" timestamp with time zone,
  "occurred_at_utc" timestamp with time zone NOT NULL,
  "created_at_utc" timestamp with time zone NOT NULL,
  "expires_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "notification_type_supported" CHECK (
    "notification_type" in (
      'new_order',
      'order_change',
      'ready_order',
      'bill_request',
      'payment_or_refund',
      'configuration_or_permission_change'
    )
  ),
  CONSTRAINT "notification_task_state_supported" CHECK (
    "task_state" in ('unhandled', 'handled')
  ),
  CONSTRAINT "notification_ack_consistent" CHECK (
    "acknowledged_at_utc" IS NULL OR (
      "task_state" = 'handled' AND "read_at_utc" IS NOT NULL
    )
  ),
  CONSTRAINT "notification_expiry_after_creation" CHECK (
    "expires_at_utc" = "created_at_utc" + interval '30 days'
  ),
  CONSTRAINT "notification_tenant_id_unique"
    UNIQUE ("business_account_id", "id"),
  CONSTRAINT "notification_user_fk"
    FOREIGN KEY ("business_account_id", "recipient_user_id")
    REFERENCES "identity"."users"("business_account_id", "id"),
  CONSTRAINT "notification_restaurant_fk"
    FOREIGN KEY ("business_account_id", "restaurant_id")
    REFERENCES "restaurant"."restaurants"("business_account_id", "id"),
  CONSTRAINT "notification_branch_fk"
    FOREIGN KEY ("business_account_id", "branch_id")
    REFERENCES "restaurant"."branches"("business_account_id", "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "notification_event_recipient_uidx"
  ON "notifications"."inbox_items"
  ("business_account_id", "event_id", "recipient_user_id");
--> statement-breakpoint
CREATE INDEX "notification_recipient_inbox_idx"
  ON "notifications"."inbox_items"
  ("business_account_id", "recipient_user_id", "task_state", "created_at_utc" DESC);
--> statement-breakpoint
CREATE INDEX "notification_recipient_group_idx"
  ON "notifications"."inbox_items"
  ("business_account_id", "recipient_user_id", "group_key", "created_at_utc" DESC);
--> statement-breakpoint
CREATE INDEX "notification_retention_idx"
  ON "notifications"."inbox_items" ("expires_at_utc");
--> statement-breakpoint
CREATE TABLE "notifications"."delivery_attempts" (
  "id" uuid PRIMARY KEY NOT NULL,
  "event_id" uuid NOT NULL,
  "business_account_id" uuid NOT NULL,
  "restaurant_id" uuid NOT NULL,
  "branch_id" uuid,
  "recipient_user_id" uuid,
  "notification_type" varchar(64) NOT NULL,
  "required_permission" varchar(100) NOT NULL,
  "outcome" varchar(32) NOT NULL,
  "reason" varchar(500),
  "attempted_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "notification_delivery_outcome_supported" CHECK (
    "outcome" in ('inbox_created', 'duplicate_suppressed', 'no_eligible_recipient')
  ),
  CONSTRAINT "notification_delivery_user_fk"
    FOREIGN KEY ("business_account_id", "recipient_user_id")
    REFERENCES "identity"."users"("business_account_id", "id"),
  CONSTRAINT "notification_delivery_restaurant_fk"
    FOREIGN KEY ("business_account_id", "restaurant_id")
    REFERENCES "restaurant"."restaurants"("business_account_id", "id"),
  CONSTRAINT "notification_delivery_branch_fk"
    FOREIGN KEY ("business_account_id", "branch_id")
    REFERENCES "restaurant"."branches"("business_account_id", "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "notification_delivery_recipient_uidx"
  ON "notifications"."delivery_attempts"
  ("business_account_id", "event_id", "recipient_user_id")
  WHERE "recipient_user_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "notification_delivery_gap_uidx"
  ON "notifications"."delivery_attempts" ("business_account_id", "event_id")
  WHERE "recipient_user_id" IS NULL;
--> statement-breakpoint
CREATE INDEX "notification_delivery_gap_branch_idx"
  ON "notifications"."delivery_attempts"
  ("business_account_id", "branch_id", "attempted_at_utc" DESC)
  WHERE "outcome" = 'no_eligible_recipient';
--> statement-breakpoint
CREATE TABLE "reporting"."branch_catalog" (
  "business_account_id" uuid NOT NULL,
  "restaurant_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "restaurant_name" varchar(160) NOT NULL,
  "branch_name" varchar(160) NOT NULL,
  "time_zone" varchar(100) NOT NULL,
  "currency" char(3) NOT NULL,
  "branch_status" varchar(24) NOT NULL,
  "updated_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "reporting_branch_catalog_pk"
    PRIMARY KEY ("business_account_id", "branch_id"),
  CONSTRAINT "reporting_branch_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "reporting_branch_restaurant_fk"
    FOREIGN KEY ("business_account_id", "restaurant_id")
    REFERENCES "restaurant"."restaurants"("business_account_id", "id"),
  CONSTRAINT "reporting_branch_fk"
    FOREIGN KEY ("business_account_id", "branch_id")
    REFERENCES "restaurant"."branches"("business_account_id", "id")
);
--> statement-breakpoint
CREATE TABLE "reporting"."order_projections" (
  "business_account_id" uuid NOT NULL,
  "restaurant_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "order_reference" varchar(32) NOT NULL,
  "table_id" uuid NOT NULL,
  "approval_state" varchar(24) NOT NULL,
  "fulfilment_state" varchar(24) NOT NULL,
  "financial_state" varchar(24) NOT NULL,
  "closure_state" varchar(24) NOT NULL,
  "total_amount" numeric(12, 2) NOT NULL,
  "currency" char(3) NOT NULL,
  "created_by_employee_id" uuid,
  "submitted_at_utc" timestamp with time zone NOT NULL,
  "updated_at_utc" timestamp with time zone NOT NULL,
  "open_bill_request" boolean NOT NULL DEFAULT false,
  "open_cancellation_request" boolean NOT NULL DEFAULT false,
  CONSTRAINT "reporting_order_projection_pk"
    PRIMARY KEY ("business_account_id", "order_id"),
  CONSTRAINT "reporting_order_total_nonnegative" CHECK ("total_amount" >= 0),
  CONSTRAINT "reporting_order_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "reporting_order_source_fk"
    FOREIGN KEY ("business_account_id", "order_id")
    REFERENCES "ordering"."orders"("business_account_id", "id")
);
--> statement-breakpoint
CREATE INDEX "reporting_order_branch_state_idx"
  ON "reporting"."order_projections"
  ("business_account_id", "branch_id", "closure_state", "submitted_at_utc" DESC);
--> statement-breakpoint
CREATE TABLE "reporting"."table_session_projections" (
  "business_account_id" uuid NOT NULL,
  "restaurant_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "table_session_id" uuid NOT NULL,
  "table_id" uuid NOT NULL,
  "state" varchar(16) NOT NULL,
  "opened_at_utc" timestamp with time zone NOT NULL,
  "closed_at_utc" timestamp with time zone,
  "updated_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "reporting_table_session_projection_pk"
    PRIMARY KEY ("business_account_id", "table_session_id"),
  CONSTRAINT "reporting_table_session_state_supported"
    CHECK ("state" in ('open', 'closed')),
  CONSTRAINT "reporting_table_session_source_fk"
    FOREIGN KEY ("business_account_id", "table_session_id")
    REFERENCES "tables"."table_sessions"("business_account_id", "id")
);
--> statement-breakpoint
CREATE INDEX "reporting_table_session_branch_state_idx"
  ON "reporting"."table_session_projections"
  ("business_account_id", "branch_id", "state");
--> statement-breakpoint
CREATE TABLE "reporting"."kitchen_item_projections" (
  "business_account_id" uuid NOT NULL,
  "restaurant_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "work_item_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "order_reference" varchar(32) NOT NULL,
  "item_name" varchar(200) NOT NULL,
  "state" varchar(24) NOT NULL,
  "queued_at_utc" timestamp with time zone NOT NULL,
  "started_at_utc" timestamp with time zone,
  "ready_at_utc" timestamp with time zone,
  "updated_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "reporting_kitchen_item_projection_pk"
    PRIMARY KEY ("business_account_id", "work_item_id"),
  CONSTRAINT "reporting_kitchen_item_state_supported"
    CHECK ("state" in ('queued', 'preparing', 'ready', 'cancelled')),
  CONSTRAINT "reporting_kitchen_item_order_fk"
    FOREIGN KEY ("business_account_id", "order_id")
    REFERENCES "ordering"."orders"("business_account_id", "id")
);
--> statement-breakpoint
CREATE INDEX "reporting_kitchen_branch_state_idx"
  ON "reporting"."kitchen_item_projections"
  ("business_account_id", "branch_id", "state", "queued_at_utc");
--> statement-breakpoint
CREATE TABLE "reporting"."sales_order_projections" (
  "business_account_id" uuid NOT NULL,
  "restaurant_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "order_reference" varchar(32) NOT NULL,
  "business_date" date NOT NULL,
  "currency" char(3) NOT NULL,
  "gross_amount" numeric(12, 2) NOT NULL,
  "cancelled_amount" numeric(12, 2) NOT NULL DEFAULT 0,
  "paid_amount" numeric(12, 2) NOT NULL DEFAULT 0,
  "refunded_amount" numeric(12, 2) NOT NULL DEFAULT 0,
  "payment_method" varchar(16),
  "order_state" varchar(24) NOT NULL,
  "submitted_at_utc" timestamp with time zone NOT NULL,
  "updated_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "reporting_sales_order_projection_pk"
    PRIMARY KEY ("business_account_id", "order_id"),
  CONSTRAINT "reporting_sales_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "reporting_sales_amounts_nonnegative" CHECK (
    "gross_amount" >= 0 AND "cancelled_amount" >= 0
    AND "paid_amount" >= 0 AND "refunded_amount" >= 0
  ),
  CONSTRAINT "reporting_sales_payment_method_supported" CHECK (
    "payment_method" IS NULL OR "payment_method" in ('cash', 'card')
  ),
  CONSTRAINT "reporting_sales_order_state_supported" CHECK (
    "order_state" in ('active', 'completed', 'cancelled')
  ),
  CONSTRAINT "reporting_sales_order_source_fk"
    FOREIGN KEY ("business_account_id", "order_id")
    REFERENCES "ordering"."orders"("business_account_id", "id")
);
--> statement-breakpoint
CREATE INDEX "reporting_sales_scope_date_idx"
  ON "reporting"."sales_order_projections"
  ("business_account_id", "restaurant_id", "branch_id", "business_date", "currency");
--> statement-breakpoint
CREATE TABLE "reporting"."projection_checkpoints" (
  "handler_name" varchar(160) NOT NULL,
  "business_account_id" uuid NOT NULL,
  "last_event_id" uuid NOT NULL,
  "last_occurred_at_utc" timestamp with time zone NOT NULL,
  "processed_count" bigint NOT NULL,
  "status" varchar(24) NOT NULL,
  "updated_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "reporting_projection_checkpoint_pk"
    PRIMARY KEY ("handler_name", "business_account_id"),
  CONSTRAINT "reporting_projection_processed_nonnegative" CHECK ("processed_count" >= 0),
  CONSTRAINT "reporting_projection_status_supported"
    CHECK ("status" in ('current', 'rebuilding', 'failed'))
);
--> statement-breakpoint
CREATE INDEX "reporting_projection_status_idx"
  ON "reporting"."projection_checkpoints" ("status", "updated_at_utc");
--> statement-breakpoint
INSERT INTO "reporting"."branch_catalog" (
  "business_account_id", "restaurant_id", "branch_id", "restaurant_name",
  "branch_name", "time_zone", "currency", "branch_status", "updated_at_utc"
)
SELECT
  b."business_account_id", b."restaurant_id", b."id", r."name", b."name",
  b."time_zone", b."currency", b."status", b."updated_at_utc"
FROM "restaurant"."branches" b
JOIN "restaurant"."restaurants" r
  ON r."business_account_id" = b."business_account_id"
 AND r."id" = b."restaurant_id";
--> statement-breakpoint
INSERT INTO "reporting"."order_projections" (
  "business_account_id", "restaurant_id", "branch_id", "order_id",
  "order_reference", "table_id", "approval_state", "fulfilment_state",
  "financial_state", "closure_state", "total_amount", "currency",
  "created_by_employee_id", "submitted_at_utc", "updated_at_utc",
  "open_bill_request", "open_cancellation_request"
)
SELECT
  o."business_account_id", o."restaurant_id", o."branch_id", o."id",
  o."reference", ts."table_id", o."approval_state", o."fulfilment_state",
  o."financial_state", o."closure_state", o."total_amount", o."currency",
  o."created_by_employee_id", o."submitted_at_utc", o."updated_at_utc",
  EXISTS (
    SELECT 1 FROM "ordering"."bill_requests" br
    WHERE br."business_account_id" = o."business_account_id"
      AND br."order_id" = o."id" AND br."status" = 'open'
  ),
  EXISTS (
    SELECT 1 FROM "ordering"."cancellation_requests" cr
    WHERE cr."business_account_id" = o."business_account_id"
      AND cr."order_id" = o."id" AND cr."status" = 'open'
  )
FROM "ordering"."orders" o
JOIN "tables"."table_sessions" ts
  ON ts."business_account_id" = o."business_account_id"
 AND ts."id" = o."table_session_id";
--> statement-breakpoint
INSERT INTO "reporting"."table_session_projections" (
  "business_account_id", "restaurant_id", "branch_id", "table_session_id",
  "table_id", "state", "opened_at_utc", "closed_at_utc", "updated_at_utc"
)
SELECT
  ts."business_account_id", b."restaurant_id", ts."branch_id", ts."id",
  ts."table_id", ts."status", ts."opened_at_utc", ts."closed_at_utc",
  COALESCE(ts."closed_at_utc", ts."opened_at_utc")
FROM "tables"."table_sessions" ts
JOIN "restaurant"."branches" b
  ON b."business_account_id" = ts."business_account_id"
 AND b."id" = ts."branch_id";
--> statement-breakpoint
INSERT INTO "reporting"."kitchen_item_projections" (
  "business_account_id", "restaurant_id", "branch_id", "work_item_id",
  "order_id", "order_reference", "item_name", "state", "queued_at_utc",
  "started_at_utc", "ready_at_utc", "updated_at_utc"
)
SELECT
  wi."business_account_id", o."restaurant_id", wi."branch_id", wi."id",
  wi."order_id", wi."order_reference", wi."item_name", wi."state",
  wi."queued_at_utc", wi."started_at_utc", wi."ready_at_utc",
  COALESCE(wi."ready_at_utc", wi."started_at_utc", wi."queued_at_utc")
FROM "kitchen"."work_items" wi
JOIN "ordering"."orders" o
  ON o."business_account_id" = wi."business_account_id"
 AND o."id" = wi."order_id";
--> statement-breakpoint
INSERT INTO "reporting"."sales_order_projections" (
  "business_account_id", "restaurant_id", "branch_id", "order_id",
  "order_reference", "business_date", "currency", "gross_amount",
  "cancelled_amount", "paid_amount", "refunded_amount", "payment_method",
  "order_state", "submitted_at_utc", "updated_at_utc"
)
SELECT
  o."business_account_id", o."restaurant_id", o."branch_id", o."id",
  o."reference",
  (o."submitted_at_utc" AT TIME ZONE b."time_zone")::date,
  o."currency", o."total_amount",
  CASE WHEN o."closure_state" = 'cancelled' THEN o."total_amount" ELSE 0 END,
  COALESCE(p."amount", 0),
  COALESCE((
    SELECT sum(rf."amount") FROM "payments"."refunds" rf
    WHERE rf."business_account_id" = o."business_account_id"
      AND rf."order_id" = o."id"
  ), 0),
  p."method", o."closure_state", o."submitted_at_utc", o."updated_at_utc"
FROM "ordering"."orders" o
JOIN "restaurant"."branches" b
  ON b."business_account_id" = o."business_account_id"
 AND b."id" = o."branch_id"
LEFT JOIN "payments"."payments" p
  ON p."business_account_id" = o."business_account_id"
 AND p."order_id" = o."id";
--> statement-breakpoint
CREATE INDEX "audit_tenant_branch_time_idx"
  ON "audit"."audit_events"
  ("business_account_id", "branch_id", "occurred_at_utc" DESC);
--> statement-breakpoint
CREATE INDEX "audit_tenant_actor_time_idx"
  ON "audit"."audit_events"
  ("business_account_id", "actor_user_id", "occurred_at_utc" DESC);
--> statement-breakpoint
CREATE INDEX "audit_tenant_action_target_idx"
  ON "audit"."audit_events"
  ("business_account_id", "action", "target_type", "target_id");
--> statement-breakpoint
CREATE INDEX "outbox_ready_claim_idx"
  ON "platform"."outbox_messages"
  ("next_attempt_at_utc", "claimed_until_utc", "occurred_at_utc", "event_id")
  WHERE "processed_at_utc" IS NULL AND "quarantined_at_utc" IS NULL;
--> statement-breakpoint
CREATE INDEX "outbox_quarantine_idx"
  ON "platform"."outbox_messages"
  ("quarantined_at_utc", "business_account_id", "aggregate_id")
  WHERE "quarantined_at_utc" IS NOT NULL;
