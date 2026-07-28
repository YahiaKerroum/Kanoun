ALTER TABLE "kitchen"."work_items"
  ADD COLUMN "table_id" uuid,
  ADD COLUMN "table_code" varchar(80),
  ADD COLUMN "selected_options" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "started_at_utc" timestamp with time zone,
  ADD COLUMN "started_by_user_id" uuid,
  ADD COLUMN "started_by_employee_id" uuid,
  ADD COLUMN "ready_at_utc" timestamp with time zone,
  ADD COLUMN "ready_by_user_id" uuid,
  ADD COLUMN "ready_by_employee_id" uuid;
--> statement-breakpoint
UPDATE "kitchen"."work_items" wi
SET
  "table_id" = ts."table_id",
  "table_code" = t."code",
  "selected_options" = oi."selected_options"
FROM "ordering"."orders" o
INNER JOIN "tables"."table_sessions" ts
  ON ts."business_account_id" = o."business_account_id"
  AND ts."id" = o."table_session_id"
INNER JOIN "tables"."tables" t
  ON t."business_account_id" = ts."business_account_id"
  AND t."id" = ts."table_id"
INNER JOIN "ordering"."order_items" oi
  ON oi."business_account_id" = o."business_account_id"
  AND oi."order_id" = o."id"
WHERE wi."business_account_id" = o."business_account_id"
  AND wi."order_id" = o."id"
  AND wi."order_item_id" = oi."id";
--> statement-breakpoint
ALTER TABLE "kitchen"."work_items"
  ALTER COLUMN "table_id" SET NOT NULL,
  ALTER COLUMN "table_code" SET NOT NULL,
  ADD CONSTRAINT "kitchen_work_table_fk"
    FOREIGN KEY ("business_account_id", "table_id")
    REFERENCES "tables"."tables"("business_account_id", "id"),
  ADD CONSTRAINT "kitchen_work_started_actor_consistency" CHECK (
    ("state" = 'queued' AND "started_at_utc" IS NULL
      AND "started_by_user_id" IS NULL AND "started_by_employee_id" IS NULL)
    OR
    ("state" IN ('preparing', 'ready') AND "started_at_utc" IS NOT NULL
      AND "started_by_user_id" IS NOT NULL AND "started_by_employee_id" IS NOT NULL)
    OR
    ("state" = 'cancelled')
  ),
  ADD CONSTRAINT "kitchen_work_ready_actor_consistency" CHECK (
    ("state" IN ('queued', 'preparing') AND "ready_at_utc" IS NULL
      AND "ready_by_user_id" IS NULL AND "ready_by_employee_id" IS NULL)
    OR
    ("state" = 'ready' AND "ready_at_utc" IS NOT NULL
      AND "ready_by_user_id" IS NOT NULL AND "ready_by_employee_id" IS NOT NULL)
    OR
    ("state" = 'cancelled')
  ),
  ADD CONSTRAINT "kitchen_work_started_by_user_fk"
    FOREIGN KEY ("business_account_id", "started_by_user_id")
    REFERENCES "identity"."users"("business_account_id", "id"),
  ADD CONSTRAINT "kitchen_work_started_by_employee_fk"
    FOREIGN KEY ("business_account_id", "started_by_employee_id")
    REFERENCES "restaurant"."employees"("business_account_id", "id"),
  ADD CONSTRAINT "kitchen_work_ready_by_user_fk"
    FOREIGN KEY ("business_account_id", "ready_by_user_id")
    REFERENCES "identity"."users"("business_account_id", "id"),
  ADD CONSTRAINT "kitchen_work_ready_by_employee_fk"
    FOREIGN KEY ("business_account_id", "ready_by_employee_id")
    REFERENCES "restaurant"."employees"("business_account_id", "id");
--> statement-breakpoint
ALTER TABLE "ordering"."orders"
  ADD COLUMN "preparing_at_utc" timestamp with time zone,
  ADD COLUMN "ready_at_utc" timestamp with time zone,
  ADD COLUMN "served_at_utc" timestamp with time zone,
  ADD COLUMN "served_by_user_id" uuid,
  ADD COLUMN "served_by_employee_id" uuid,
  ADD CONSTRAINT "order_served_actor_consistency" CHECK (
    ("fulfilment_state" <> 'served' AND "served_at_utc" IS NULL
      AND "served_by_user_id" IS NULL AND "served_by_employee_id" IS NULL)
    OR
    ("fulfilment_state" = 'served' AND "served_at_utc" IS NOT NULL
      AND "served_by_user_id" IS NOT NULL AND "served_by_employee_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "order_served_by_user_fk"
    FOREIGN KEY ("business_account_id", "served_by_user_id")
    REFERENCES "identity"."users"("business_account_id", "id"),
  ADD CONSTRAINT "order_served_by_employee_fk"
    FOREIGN KEY ("business_account_id", "served_by_employee_id")
    REFERENCES "restaurant"."employees"("business_account_id", "id");
--> statement-breakpoint
CREATE INDEX "kitchen_work_branch_order_state_idx"
  ON "kitchen"."work_items"
  ("business_account_id", "branch_id", "order_id", "state", "queued_at_utc");
