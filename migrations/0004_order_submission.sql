CREATE SCHEMA "kitchen";
--> statement-breakpoint
ALTER TABLE "tables"."table_sessions"
  ADD COLUMN "configuration_version_id" uuid,
  ADD COLUMN "configuration_version" integer,
  ADD COLUMN "version" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "tables"."table_sessions"
  ADD CONSTRAINT "table_session_version_positive" CHECK ("version" >= 1),
  ADD CONSTRAINT "table_session_configuration_consistency" CHECK (
    ("configuration_version_id" IS NULL AND "configuration_version" IS NULL) OR
    ("configuration_version_id" IS NOT NULL AND "configuration_version" >= 1)
  ),
  ADD CONSTRAINT "table_sessions_tenant_id_unique" UNIQUE ("business_account_id", "id");
--> statement-breakpoint
ALTER TABLE "ordering"."customer_sessions"
  ADD COLUMN "csrf_token_hash" char(64),
  ADD COLUMN "table_session_id" uuid;
--> statement-breakpoint
ALTER TABLE "ordering"."customer_sessions"
  ADD CONSTRAINT "customer_sessions_tenant_id_unique" UNIQUE ("business_account_id", "id"),
  ADD CONSTRAINT "customer_session_table_session_fk"
  FOREIGN KEY ("business_account_id", "table_session_id")
  REFERENCES "tables"."table_sessions"("business_account_id", "id");
--> statement-breakpoint
CREATE TABLE "ordering"."branch_order_sequences" (
  "business_account_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "last_value" bigint NOT NULL,
  CONSTRAINT "branch_order_sequence_pk" PRIMARY KEY ("business_account_id", "branch_id"),
  CONSTRAINT "branch_order_sequence_value_nonnegative" CHECK ("last_value" >= 0),
  CONSTRAINT "branch_order_sequence_branch_fk" FOREIGN KEY ("business_account_id", "branch_id")
    REFERENCES "restaurant"."branches"("business_account_id", "id")
);
--> statement-breakpoint
CREATE TABLE "ordering"."orders" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "restaurant_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "table_session_id" uuid NOT NULL,
  "reference" varchar(32) NOT NULL,
  "creator_type" varchar(16) NOT NULL,
  "customer_session_id" uuid,
  "created_by_user_id" uuid,
  "created_by_employee_id" uuid,
  "customer_display_name" varchar(100),
  "configuration_version_id" uuid NOT NULL,
  "configuration_version" integer NOT NULL,
  "approval_state" varchar(24) NOT NULL,
  "fulfilment_state" varchar(24) NOT NULL,
  "financial_state" varchar(24) NOT NULL,
  "closure_state" varchar(24) NOT NULL,
  "customer_safe_status_reason" varchar(500),
  "total_amount" numeric(12, 2) NOT NULL,
  "currency" char(3) NOT NULL,
  "version" integer NOT NULL,
  "submitted_at_utc" timestamp with time zone NOT NULL,
  "accepted_at_utc" timestamp with time zone NOT NULL,
  "updated_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "order_creator_type_supported" CHECK ("creator_type" in ('guest', 'staff')),
  CONSTRAINT "order_creator_consistency" CHECK (
    ("creator_type" = 'guest' AND "customer_session_id" IS NOT NULL
      AND "created_by_user_id" IS NULL AND "created_by_employee_id" IS NULL) OR
    ("creator_type" = 'staff' AND "customer_session_id" IS NULL
      AND "created_by_user_id" IS NOT NULL AND "created_by_employee_id" IS NOT NULL)
  ),
  CONSTRAINT "order_approval_state_supported" CHECK ("approval_state" in ('submitted', 'accepted', 'rejected')),
  CONSTRAINT "order_fulfilment_state_supported" CHECK ("fulfilment_state" in ('not_started', 'preparing', 'ready', 'served')),
  CONSTRAINT "order_financial_state_supported" CHECK ("financial_state" in ('unpaid', 'paid', 'partially_refunded', 'refunded')),
  CONSTRAINT "order_closure_state_supported" CHECK ("closure_state" in ('active', 'completed', 'cancelled')),
  CONSTRAINT "order_total_nonnegative" CHECK ("total_amount" >= 0),
  CONSTRAINT "order_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "order_configuration_version_positive" CHECK ("configuration_version" >= 1),
  CONSTRAINT "order_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "orders_tenant_id_unique" UNIQUE ("business_account_id", "id"),
  CONSTRAINT "order_restaurant_fk" FOREIGN KEY ("business_account_id", "restaurant_id")
    REFERENCES "restaurant"."restaurants"("business_account_id", "id"),
  CONSTRAINT "order_branch_fk" FOREIGN KEY ("business_account_id", "branch_id")
    REFERENCES "restaurant"."branches"("business_account_id", "id"),
  CONSTRAINT "order_table_session_fk" FOREIGN KEY ("business_account_id", "table_session_id")
    REFERENCES "tables"."table_sessions"("business_account_id", "id"),
  CONSTRAINT "order_customer_session_fk" FOREIGN KEY ("business_account_id", "customer_session_id")
    REFERENCES "ordering"."customer_sessions"("business_account_id", "id"),
  CONSTRAINT "order_created_by_user_fk" FOREIGN KEY ("business_account_id", "created_by_user_id")
    REFERENCES "identity"."users"("business_account_id", "id"),
  CONSTRAINT "order_created_by_employee_fk" FOREIGN KEY ("business_account_id", "created_by_employee_id")
    REFERENCES "restaurant"."employees"("business_account_id", "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "order_branch_reference_uidx"
  ON "ordering"."orders" ("business_account_id", "branch_id", "reference");
--> statement-breakpoint
CREATE INDEX "orders_branch_active_time_idx"
  ON "ordering"."orders" ("business_account_id", "branch_id", "closure_state", "submitted_at_utc" DESC);
--> statement-breakpoint
CREATE INDEX "orders_guest_time_idx"
  ON "ordering"."orders" ("business_account_id", "customer_session_id", "submitted_at_utc" DESC);
--> statement-breakpoint
CREATE INDEX "orders_table_session_idx"
  ON "ordering"."orders" ("business_account_id", "table_session_id", "submitted_at_utc");
--> statement-breakpoint
CREATE TABLE "ordering"."order_items" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "position" integer NOT NULL,
  "source_dish_id" uuid NOT NULL,
  "source_menu_version" integer NOT NULL,
  "dish_name" varchar(160) NOT NULL,
  "base_price_amount" numeric(12, 2) NOT NULL,
  "unit_price_amount" numeric(12, 2) NOT NULL,
  "currency" char(3) NOT NULL,
  "quantity" integer NOT NULL,
  "selected_options" jsonb NOT NULL,
  "note" varchar(500),
  "tax_inclusive" boolean NOT NULL,
  "line_total_amount" numeric(12, 2) NOT NULL,
  "created_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "order_item_position_nonnegative" CHECK ("position" >= 0),
  CONSTRAINT "order_item_menu_version_positive" CHECK ("source_menu_version" >= 1),
  CONSTRAINT "order_item_base_price_nonnegative" CHECK ("base_price_amount" >= 0),
  CONSTRAINT "order_item_unit_price_nonnegative" CHECK ("unit_price_amount" >= 0),
  CONSTRAINT "order_item_quantity_positive" CHECK ("quantity" >= 1),
  CONSTRAINT "order_item_line_total_nonnegative" CHECK ("line_total_amount" >= 0),
  CONSTRAINT "order_item_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "order_item_options_array" CHECK (jsonb_typeof("selected_options") = 'array'),
  CONSTRAINT "order_items_tenant_id_unique" UNIQUE ("business_account_id", "id"),
  CONSTRAINT "order_item_order_fk" FOREIGN KEY ("business_account_id", "order_id")
    REFERENCES "ordering"."orders"("business_account_id", "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "order_item_position_uidx"
  ON "ordering"."order_items" ("business_account_id", "order_id", "position");
--> statement-breakpoint
CREATE TABLE "ordering"."cancellation_requests" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "customer_session_id" uuid NOT NULL,
  "reason" varchar(500) NOT NULL,
  "status" varchar(24) NOT NULL,
  "created_at_utc" timestamp with time zone NOT NULL,
  "resolved_at_utc" timestamp with time zone,
  CONSTRAINT "cancellation_request_status_supported" CHECK ("status" in ('open', 'resolved')),
  CONSTRAINT "cancellation_request_reason_present" CHECK (length(trim("reason")) >= 1),
  CONSTRAINT "cancellation_request_order_fk" FOREIGN KEY ("business_account_id", "order_id")
    REFERENCES "ordering"."orders"("business_account_id", "id"),
  CONSTRAINT "cancellation_request_customer_session_fk" FOREIGN KEY ("business_account_id", "customer_session_id")
    REFERENCES "ordering"."customer_sessions"("business_account_id", "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cancellation_request_open_order_uidx"
  ON "ordering"."cancellation_requests" ("business_account_id", "order_id")
  WHERE "status" = 'open';
--> statement-breakpoint
CREATE TABLE "kitchen"."work_items" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "order_item_id" uuid NOT NULL,
  "order_reference" varchar(32) NOT NULL,
  "item_name" varchar(160) NOT NULL,
  "quantity" integer NOT NULL,
  "note" varchar(500),
  "state" varchar(24) NOT NULL,
  "version" integer NOT NULL,
  "queued_at_utc" timestamp with time zone NOT NULL,
  "updated_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "kitchen_work_state_supported" CHECK ("state" in ('queued', 'preparing', 'ready', 'cancelled')),
  CONSTRAINT "kitchen_work_quantity_positive" CHECK ("quantity" >= 1),
  CONSTRAINT "kitchen_work_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "kitchen_work_order_fk" FOREIGN KEY ("business_account_id", "order_id")
    REFERENCES "ordering"."orders"("business_account_id", "id"),
  CONSTRAINT "kitchen_work_order_item_fk" FOREIGN KEY ("business_account_id", "order_item_id")
    REFERENCES "ordering"."order_items"("business_account_id", "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "kitchen_work_order_item_uidx"
  ON "kitchen"."work_items" ("business_account_id", "order_item_id");
--> statement-breakpoint
CREATE INDEX "kitchen_work_branch_state_time_idx"
  ON "kitchen"."work_items" ("business_account_id", "branch_id", "state", "queued_at_utc");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "ordering"."reject_order_item_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'submitted order items are append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "order_items_append_only"
BEFORE UPDATE OR DELETE ON "ordering"."order_items"
FOR EACH ROW EXECUTE FUNCTION "ordering"."reject_order_item_mutation"();
