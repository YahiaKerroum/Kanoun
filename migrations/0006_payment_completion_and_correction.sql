CREATE SCHEMA "payments";
--> statement-breakpoint
UPDATE "identity"."permission_templates"
SET
  "permission_keys" = "permission_keys" || '["orders.complete_unpaid"]'::jsonb,
  "version" = "version" + 1
WHERE "template_key" = 'administrator'
  AND NOT ("permission_keys" @> '["orders.complete_unpaid"]'::jsonb);
--> statement-breakpoint
WITH "administrator_candidates" AS (
  SELECT
    e."business_account_id",
    e."id" AS "employee_id",
    e."restaurant_id",
    u."id" AS "user_id"
  FROM "restaurant"."employees" e
  INNER JOIN "identity"."users" u
    ON u."business_account_id" = e."business_account_id"
    AND u."employee_id" = e."id"
  WHERE NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'restaurant.view',
      'restaurant.edit',
      'branches.view',
      'branches.manage',
      'features.manage',
      'employees.view',
      'employees.manage',
      'employees.manage_permissions',
      'menu.view',
      'menu.manage',
      'menu.manage_prices',
      'menu.manage_availability',
      'qr.manage',
      'tables.view',
      'tables.manage',
      'tables.assign',
      'tables.close_session',
      'orders.view',
      'orders.create',
      'orders.accept',
      'orders.reject',
      'orders.modify',
      'orders.cancel',
      'orders.serve',
      'orders.complete',
      'kitchen.view',
      'kitchen.update',
      'payments.view',
      'payments.record',
      'payments.refund',
      'reports.view',
      'reports.view_cross_branch',
      'audit.view'
    ]::text[]) required("permission_key")
    WHERE NOT EXISTS (
      SELECT 1
      FROM "identity"."permission_grants" pg
      WHERE pg."business_account_id" = e."business_account_id"
        AND pg."employee_id" = e."id"
        AND pg."permission_key" = required."permission_key"
        AND pg."restaurant_id" = e."restaurant_id"
        AND pg."branch_id" IS NULL
        AND pg."revoked_at_utc" IS NULL
    )
  )
)
INSERT INTO "identity"."permission_grants" (
  "id",
  "business_account_id",
  "employee_id",
  "permission_key",
  "restaurant_id",
  "branch_id",
  "granted_by_user_id",
  "granted_at_utc"
)
SELECT
  gen_random_uuid(),
  candidate."business_account_id",
  candidate."employee_id",
  'orders.complete_unpaid',
  candidate."restaurant_id",
  NULL,
  candidate."user_id",
  transaction_timestamp()
FROM "administrator_candidates" candidate
WHERE NOT EXISTS (
  SELECT 1
  FROM "identity"."permission_grants" existing
  WHERE existing."business_account_id" = candidate."business_account_id"
    AND existing."employee_id" = candidate."employee_id"
    AND existing."permission_key" = 'orders.complete_unpaid'
    AND existing."restaurant_id" = candidate."restaurant_id"
    AND existing."branch_id" IS NULL
    AND existing."revoked_at_utc" IS NULL
);
--> statement-breakpoint
UPDATE "identity"."employee_permission_sets" permission_set
SET
  "version" = "version" + 1,
  "updated_at_utc" = transaction_timestamp()
WHERE EXISTS (
  SELECT 1
  FROM "identity"."permission_grants" grant_row
  WHERE grant_row."business_account_id" = permission_set."business_account_id"
    AND grant_row."employee_id" = permission_set."employee_id"
    AND grant_row."permission_key" = 'orders.complete_unpaid'
    AND grant_row."granted_at_utc" = transaction_timestamp()
    AND grant_row."revoked_at_utc" IS NULL
);
--> statement-breakpoint
ALTER TABLE "ordering"."orders"
  ADD COLUMN "current_item_revision" integer NOT NULL DEFAULT 1,
  ADD COLUMN "completed_at_utc" timestamp with time zone,
  ADD COLUMN "completed_by_user_id" uuid,
  ADD COLUMN "completed_by_employee_id" uuid,
  ADD COLUMN "unpaid_completion_reason" varchar(500),
  ADD COLUMN "cancelled_at_utc" timestamp with time zone,
  ADD COLUMN "cancelled_by_user_id" uuid,
  ADD COLUMN "cancelled_by_employee_id" uuid,
  ADD COLUMN "cancellation_reason" varchar(500);
--> statement-breakpoint
ALTER TABLE "ordering"."orders"
  ADD CONSTRAINT "order_item_revision_positive"
    CHECK ("current_item_revision" >= 1),
  ADD CONSTRAINT "order_unpaid_completion_reason_present"
    CHECK (
      "unpaid_completion_reason" IS NULL
      OR length(trim("unpaid_completion_reason")) >= 1
    ),
  ADD CONSTRAINT "order_completion_actor_consistency" CHECK (
    ("closure_state" <> 'completed'
      AND "completed_at_utc" IS NULL
      AND "completed_by_user_id" IS NULL
      AND "completed_by_employee_id" IS NULL
      AND "unpaid_completion_reason" IS NULL)
    OR
    ("closure_state" = 'completed'
      AND "completed_at_utc" IS NOT NULL
      AND "completed_by_user_id" IS NOT NULL
      AND "completed_by_employee_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "order_cancellation_actor_consistency" CHECK (
    ("closure_state" <> 'cancelled'
      AND "cancelled_at_utc" IS NULL
      AND "cancelled_by_user_id" IS NULL
      AND "cancelled_by_employee_id" IS NULL
      AND "cancellation_reason" IS NULL)
    OR
    ("closure_state" = 'cancelled'
      AND "cancelled_at_utc" IS NOT NULL
      AND "cancelled_by_user_id" IS NOT NULL
      AND "cancelled_by_employee_id" IS NOT NULL
      AND length(trim("cancellation_reason")) >= 1)
  ),
  ADD CONSTRAINT "order_completed_by_user_fk"
    FOREIGN KEY ("business_account_id", "completed_by_user_id")
    REFERENCES "identity"."users"("business_account_id", "id"),
  ADD CONSTRAINT "order_completed_by_employee_fk"
    FOREIGN KEY ("business_account_id", "completed_by_employee_id")
    REFERENCES "restaurant"."employees"("business_account_id", "id"),
  ADD CONSTRAINT "order_cancelled_by_user_fk"
    FOREIGN KEY ("business_account_id", "cancelled_by_user_id")
    REFERENCES "identity"."users"("business_account_id", "id"),
  ADD CONSTRAINT "order_cancelled_by_employee_fk"
    FOREIGN KEY ("business_account_id", "cancelled_by_employee_id")
    REFERENCES "restaurant"."employees"("business_account_id", "id");
--> statement-breakpoint
ALTER TABLE "ordering"."order_items"
  ADD COLUMN "revision" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "ordering"."order_items"
  ADD CONSTRAINT "order_item_revision_supported" CHECK ("revision" >= 1);
--> statement-breakpoint
DROP INDEX "ordering"."order_item_position_uidx";
--> statement-breakpoint
CREATE UNIQUE INDEX "order_item_revision_position_uidx"
  ON "ordering"."order_items"
  ("business_account_id", "order_id", "revision", "position");
--> statement-breakpoint
CREATE TABLE "ordering"."order_corrections" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "restaurant_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "revision" integer NOT NULL,
  "reason" varchar(500) NOT NULL,
  "before_total_amount" numeric(12, 2) NOT NULL,
  "after_total_amount" numeric(12, 2) NOT NULL,
  "currency" char(3) NOT NULL,
  "before_items" jsonb NOT NULL,
  "after_items" jsonb NOT NULL,
  "corrected_at_utc" timestamp with time zone NOT NULL,
  "corrected_by_user_id" uuid NOT NULL,
  "corrected_by_employee_id" uuid NOT NULL,
  CONSTRAINT "order_correction_revision_positive" CHECK ("revision" >= 2),
  CONSTRAINT "order_correction_reason_present"
    CHECK (length(trim("reason")) >= 1),
  CONSTRAINT "order_correction_before_total_nonnegative"
    CHECK ("before_total_amount" >= 0),
  CONSTRAINT "order_correction_after_total_nonnegative"
    CHECK ("after_total_amount" >= 0),
  CONSTRAINT "order_correction_currency_format"
    CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "order_correction_before_items_array"
    CHECK (jsonb_typeof("before_items") = 'array'),
  CONSTRAINT "order_correction_after_items_array"
    CHECK (jsonb_typeof("after_items") = 'array'),
  CONSTRAINT "order_correction_tenant_id_unique"
    UNIQUE ("business_account_id", "id"),
  CONSTRAINT "order_correction_order_fk"
    FOREIGN KEY ("business_account_id", "order_id")
    REFERENCES "ordering"."orders"("business_account_id", "id"),
  CONSTRAINT "order_correction_user_fk"
    FOREIGN KEY ("business_account_id", "corrected_by_user_id")
    REFERENCES "identity"."users"("business_account_id", "id"),
  CONSTRAINT "order_correction_employee_fk"
    FOREIGN KEY ("business_account_id", "corrected_by_employee_id")
    REFERENCES "restaurant"."employees"("business_account_id", "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "order_correction_revision_uidx"
  ON "ordering"."order_corrections"
  ("business_account_id", "order_id", "revision");
--> statement-breakpoint
CREATE TABLE "ordering"."bill_requests" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "restaurant_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "requested_by_guest_session_id" uuid,
  "status" varchar(24) NOT NULL,
  "requested_at_utc" timestamp with time zone NOT NULL,
  "resolved_at_utc" timestamp with time zone,
  "resolved_by_user_id" uuid,
  CONSTRAINT "bill_request_status_supported"
    CHECK ("status" in ('open', 'resolved')),
  CONSTRAINT "bill_request_resolution_consistency" CHECK (
    ("status" = 'open'
      AND "resolved_at_utc" IS NULL
      AND "resolved_by_user_id" IS NULL)
    OR
    ("status" = 'resolved' AND "resolved_at_utc" IS NOT NULL)
  ),
  CONSTRAINT "bill_request_tenant_id_unique"
    UNIQUE ("business_account_id", "id"),
  CONSTRAINT "bill_request_order_fk"
    FOREIGN KEY ("business_account_id", "order_id")
    REFERENCES "ordering"."orders"("business_account_id", "id"),
  CONSTRAINT "bill_request_guest_session_fk"
    FOREIGN KEY ("business_account_id", "requested_by_guest_session_id")
    REFERENCES "ordering"."customer_sessions"("business_account_id", "id"),
  CONSTRAINT "bill_request_resolved_by_user_fk"
    FOREIGN KEY ("business_account_id", "resolved_by_user_id")
    REFERENCES "identity"."users"("business_account_id", "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "bill_request_open_order_uidx"
  ON "ordering"."bill_requests" ("business_account_id", "order_id")
  WHERE "status" = 'open';
--> statement-breakpoint
CREATE INDEX "bill_request_branch_status_time_idx"
  ON "ordering"."bill_requests"
  ("business_account_id", "branch_id", "status", "requested_at_utc");
--> statement-breakpoint
CREATE TABLE "tables"."table_session_movements" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "table_session_id" uuid NOT NULL,
  "from_table_id" uuid NOT NULL,
  "to_table_id" uuid NOT NULL,
  "moved_at_utc" timestamp with time zone NOT NULL,
  "moved_by_user_id" uuid NOT NULL,
  "moved_by_employee_id" uuid NOT NULL,
  "session_version" integer NOT NULL,
  CONSTRAINT "table_session_movement_distinct_tables"
    CHECK ("from_table_id" <> "to_table_id"),
  CONSTRAINT "table_session_movement_version_positive"
    CHECK ("session_version" >= 2),
  CONSTRAINT "table_session_movement_session_fk"
    FOREIGN KEY ("business_account_id", "table_session_id")
    REFERENCES "tables"."table_sessions"("business_account_id", "id"),
  CONSTRAINT "table_session_movement_from_table_fk"
    FOREIGN KEY ("business_account_id", "from_table_id")
    REFERENCES "tables"."tables"("business_account_id", "id"),
  CONSTRAINT "table_session_movement_to_table_fk"
    FOREIGN KEY ("business_account_id", "to_table_id")
    REFERENCES "tables"."tables"("business_account_id", "id"),
  CONSTRAINT "table_session_movement_user_fk"
    FOREIGN KEY ("business_account_id", "moved_by_user_id")
    REFERENCES "identity"."users"("business_account_id", "id"),
  CONSTRAINT "table_session_movement_employee_fk"
    FOREIGN KEY ("business_account_id", "moved_by_employee_id")
    REFERENCES "restaurant"."employees"("business_account_id", "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "table_session_movement_session_version_uidx"
  ON "tables"."table_session_movements"
  ("business_account_id", "table_session_id", "session_version");
--> statement-breakpoint
CREATE INDEX "table_session_movement_session_time_idx"
  ON "tables"."table_session_movements"
  ("business_account_id", "table_session_id", "moved_at_utc");
--> statement-breakpoint
CREATE TABLE "payments"."payments" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "restaurant_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "currency" char(3) NOT NULL,
  "method" varchar(16) NOT NULL,
  "external_reference" varchar(100),
  "recorded_at_utc" timestamp with time zone NOT NULL,
  "recorded_by_user_id" uuid NOT NULL,
  "recorded_by_employee_id" uuid NOT NULL,
  CONSTRAINT "payment_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "payment_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "payment_method_supported" CHECK ("method" in ('cash', 'card')),
  CONSTRAINT "payment_tenant_id_unique"
    UNIQUE ("business_account_id", "id"),
  CONSTRAINT "payment_order_currency_unique"
    UNIQUE ("business_account_id", "id", "order_id", "currency"),
  CONSTRAINT "payment_order_fk"
    FOREIGN KEY ("business_account_id", "order_id")
    REFERENCES "ordering"."orders"("business_account_id", "id"),
  CONSTRAINT "payment_user_fk"
    FOREIGN KEY ("business_account_id", "recorded_by_user_id")
    REFERENCES "identity"."users"("business_account_id", "id"),
  CONSTRAINT "payment_employee_fk"
    FOREIGN KEY ("business_account_id", "recorded_by_employee_id")
    REFERENCES "restaurant"."employees"("business_account_id", "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_one_per_order_uidx"
  ON "payments"."payments" ("business_account_id", "order_id");
--> statement-breakpoint
CREATE INDEX "payment_branch_time_idx"
  ON "payments"."payments"
  ("business_account_id", "branch_id", "recorded_at_utc");
--> statement-breakpoint
CREATE TABLE "payments"."refunds" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "restaurant_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "payment_id" uuid NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "currency" char(3) NOT NULL,
  "reason" varchar(500) NOT NULL,
  "refunded_at_utc" timestamp with time zone NOT NULL,
  "refunded_by_user_id" uuid NOT NULL,
  "refunded_by_employee_id" uuid NOT NULL,
  "source" varchar(24) NOT NULL,
  CONSTRAINT "refund_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "refund_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "refund_reason_present" CHECK (length(trim("reason")) >= 1),
  CONSTRAINT "refund_source_supported"
    CHECK ("source" in ('manual', 'order_cancellation')),
  CONSTRAINT "refund_tenant_id_unique"
    UNIQUE ("business_account_id", "id"),
  CONSTRAINT "refund_order_fk"
    FOREIGN KEY ("business_account_id", "order_id")
    REFERENCES "ordering"."orders"("business_account_id", "id"),
  CONSTRAINT "refund_payment_fk"
    FOREIGN KEY ("business_account_id", "payment_id", "order_id", "currency")
    REFERENCES "payments"."payments"
      ("business_account_id", "id", "order_id", "currency"),
  CONSTRAINT "refund_user_fk"
    FOREIGN KEY ("business_account_id", "refunded_by_user_id")
    REFERENCES "identity"."users"("business_account_id", "id"),
  CONSTRAINT "refund_employee_fk"
    FOREIGN KEY ("business_account_id", "refunded_by_employee_id")
    REFERENCES "restaurant"."employees"("business_account_id", "id")
);
--> statement-breakpoint
CREATE INDEX "refund_payment_time_idx"
  ON "payments"."refunds"
  ("business_account_id", "payment_id", "refunded_at_utc");
--> statement-breakpoint
ALTER TABLE "kitchen"."work_items"
  ADD COLUMN "change_kind" varchar(24) NOT NULL DEFAULT 'new',
  ADD COLUMN "correction_id" uuid,
  ADD COLUMN "cancelled_at_utc" timestamp with time zone,
  ADD COLUMN "cancelled_by_user_id" uuid,
  ADD COLUMN "cancelled_by_employee_id" uuid,
  ADD COLUMN "cancellation_reason" varchar(500);
--> statement-breakpoint
ALTER TABLE "kitchen"."work_items"
  ADD CONSTRAINT "kitchen_work_change_kind_supported"
    CHECK ("change_kind" in ('new', 'corrected')),
  ADD CONSTRAINT "kitchen_work_correction_consistency" CHECK (
    ("change_kind" = 'new' AND "correction_id" IS NULL)
    OR
    ("change_kind" = 'corrected' AND "correction_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "kitchen_work_cancellation_consistency" CHECK (
    ("state" <> 'cancelled'
      AND "cancelled_at_utc" IS NULL
      AND "cancelled_by_user_id" IS NULL
      AND "cancelled_by_employee_id" IS NULL
      AND "cancellation_reason" IS NULL)
    OR
    ("state" = 'cancelled'
      AND "cancelled_at_utc" IS NOT NULL
      AND "cancellation_reason" IS NOT NULL)
  ),
  ADD CONSTRAINT "kitchen_work_correction_fk"
    FOREIGN KEY ("business_account_id", "correction_id")
    REFERENCES "ordering"."order_corrections"("business_account_id", "id"),
  ADD CONSTRAINT "kitchen_work_cancelled_by_user_fk"
    FOREIGN KEY ("business_account_id", "cancelled_by_user_id")
    REFERENCES "identity"."users"("business_account_id", "id"),
  ADD CONSTRAINT "kitchen_work_cancelled_by_employee_fk"
    FOREIGN KEY ("business_account_id", "cancelled_by_employee_id")
    REFERENCES "restaurant"."employees"("business_account_id", "id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "ordering"."reject_append_only_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ordering history is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "order_corrections_append_only"
BEFORE UPDATE OR DELETE ON "ordering"."order_corrections"
FOR EACH ROW EXECUTE FUNCTION "ordering"."reject_append_only_mutation"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "tables"."reject_movement_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'table-session movement history is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "table_session_movements_append_only"
BEFORE UPDATE OR DELETE ON "tables"."table_session_movements"
FOR EACH ROW EXECUTE FUNCTION "tables"."reject_movement_mutation"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "payments"."reject_ledger_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'payment ledger is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "payments_append_only"
BEFORE UPDATE OR DELETE ON "payments"."payments"
FOR EACH ROW EXECUTE FUNCTION "payments"."reject_ledger_mutation"();
--> statement-breakpoint
CREATE TRIGGER "refunds_append_only"
BEFORE UPDATE OR DELETE ON "payments"."refunds"
FOR EACH ROW EXECUTE FUNCTION "payments"."reject_ledger_mutation"();
