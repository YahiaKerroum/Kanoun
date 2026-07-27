CREATE SCHEMA "menu";
--> statement-breakpoint
CREATE SCHEMA "tables";
--> statement-breakpoint
CREATE SCHEMA "ordering";
--> statement-breakpoint
CREATE TABLE "menu"."menus" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "restaurant_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "created_at_utc" timestamp with time zone NOT NULL,
  "updated_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "menu_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "menus_tenant_id_unique" UNIQUE ("business_account_id", "id"),
  CONSTRAINT "menu_restaurant_fk" FOREIGN KEY ("business_account_id", "restaurant_id")
    REFERENCES "restaurant"."restaurants"("business_account_id", "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "menu_restaurant_uidx" ON "menu"."menus" ("business_account_id", "restaurant_id");
--> statement-breakpoint
CREATE TABLE "menu"."categories" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "restaurant_id" uuid NOT NULL,
  "name" varchar(160) NOT NULL,
  "display_order" integer NOT NULL DEFAULT 0,
  "status" varchar(24) NOT NULL,
  "version" integer NOT NULL,
  "created_at_utc" timestamp with time zone NOT NULL,
  "updated_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "category_status_supported" CHECK ("status" in ('active', 'inactive')),
  CONSTRAINT "category_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "category_display_order_nonnegative" CHECK ("display_order" >= 0),
  CONSTRAINT "categories_tenant_id_unique" UNIQUE ("business_account_id", "id"),
  CONSTRAINT "category_restaurant_fk" FOREIGN KEY ("business_account_id", "restaurant_id")
    REFERENCES "restaurant"."restaurants"("business_account_id", "id")
);
--> statement-breakpoint
CREATE INDEX "categories_restaurant_order_idx" ON "menu"."categories" ("business_account_id", "restaurant_id", "status", "display_order");
--> statement-breakpoint
CREATE TABLE "menu"."dishes" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "restaurant_id" uuid NOT NULL,
  "category_id" uuid NOT NULL,
  "name" varchar(160) NOT NULL,
  "description" varchar(1000),
  "image_url" varchar(2048),
  "base_price_amount" numeric(12, 2) NOT NULL,
  "base_price_currency" char(3) NOT NULL,
  "status" varchar(24) NOT NULL,
  "available" boolean NOT NULL DEFAULT true,
  "display_order" integer NOT NULL DEFAULT 0,
  "version" integer NOT NULL,
  "created_at_utc" timestamp with time zone NOT NULL,
  "updated_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "dish_status_supported" CHECK ("status" in ('active', 'inactive')),
  CONSTRAINT "dish_base_price_nonnegative" CHECK ("base_price_amount" >= 0),
  CONSTRAINT "dish_currency_format" CHECK ("base_price_currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "dish_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "dish_display_order_nonnegative" CHECK ("display_order" >= 0),
  CONSTRAINT "dishes_tenant_id_unique" UNIQUE ("business_account_id", "id"),
  CONSTRAINT "dish_category_fk" FOREIGN KEY ("business_account_id", "category_id")
    REFERENCES "menu"."categories"("business_account_id", "id"),
  CONSTRAINT "dish_restaurant_fk" FOREIGN KEY ("business_account_id", "restaurant_id")
    REFERENCES "restaurant"."restaurants"("business_account_id", "id")
);
--> statement-breakpoint
CREATE INDEX "dishes_category_order_idx" ON "menu"."dishes" ("business_account_id", "category_id", "status", "display_order");
--> statement-breakpoint
CREATE INDEX "dishes_restaurant_idx" ON "menu"."dishes" ("business_account_id", "restaurant_id", "status");
--> statement-breakpoint
CREATE TABLE "menu"."option_groups" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "dish_id" uuid NOT NULL,
  "name" varchar(160) NOT NULL,
  "selection_type" varchar(16) NOT NULL,
  "is_required" boolean NOT NULL DEFAULT false,
  "minimum_selections" integer NOT NULL,
  "maximum_selections" integer NOT NULL,
  "display_order" integer NOT NULL DEFAULT 0,
  "version" integer NOT NULL,
  "created_at_utc" timestamp with time zone NOT NULL,
  "updated_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "option_group_selection_type_supported" CHECK ("selection_type" in ('single', 'multiple')),
  CONSTRAINT "option_group_minimum_nonnegative" CHECK ("minimum_selections" >= 0),
  CONSTRAINT "option_group_maximum_positive" CHECK ("maximum_selections" >= 1),
  CONSTRAINT "option_group_minimum_le_maximum" CHECK ("minimum_selections" <= "maximum_selections"),
  CONSTRAINT "option_group_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "option_groups_tenant_id_unique" UNIQUE ("business_account_id", "id"),
  CONSTRAINT "option_group_dish_fk" FOREIGN KEY ("business_account_id", "dish_id")
    REFERENCES "menu"."dishes"("business_account_id", "id")
);
--> statement-breakpoint
CREATE INDEX "option_groups_dish_idx" ON "menu"."option_groups" ("business_account_id", "dish_id", "display_order");
--> statement-breakpoint
CREATE TABLE "menu"."options" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "option_group_id" uuid NOT NULL,
  "name" varchar(160) NOT NULL,
  "price_delta_amount" numeric(12, 2) NOT NULL DEFAULT 0,
  "price_delta_currency" char(3) NOT NULL,
  "display_order" integer NOT NULL DEFAULT 0,
  "status" varchar(24) NOT NULL,
  "version" integer NOT NULL,
  "created_at_utc" timestamp with time zone NOT NULL,
  "updated_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "option_status_supported" CHECK ("status" in ('active', 'inactive')),
  CONSTRAINT "option_currency_format" CHECK ("price_delta_currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "option_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "options_tenant_id_unique" UNIQUE ("business_account_id", "id"),
  CONSTRAINT "option_group_fk" FOREIGN KEY ("business_account_id", "option_group_id")
    REFERENCES "menu"."option_groups"("business_account_id", "id")
);
--> statement-breakpoint
CREATE INDEX "options_group_idx" ON "menu"."options" ("business_account_id", "option_group_id", "display_order");
--> statement-breakpoint
CREATE TABLE "menu"."branch_dish_overrides" (
  "business_account_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "dish_id" uuid NOT NULL,
  "price_amount" numeric(12, 2),
  "price_currency" char(3),
  "available" boolean,
  "visible" boolean NOT NULL DEFAULT true,
  "version" integer NOT NULL,
  "created_at_utc" timestamp with time zone NOT NULL,
  "updated_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "branch_dish_override_pk" PRIMARY KEY ("business_account_id", "branch_id", "dish_id"),
  CONSTRAINT "branch_dish_override_price_nonnegative" CHECK ("price_amount" IS NULL OR "price_amount" >= 0),
  CONSTRAINT "branch_dish_override_currency_format" CHECK ("price_currency" IS NULL OR "price_currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "branch_dish_override_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "branch_dish_override_branch_fk" FOREIGN KEY ("business_account_id", "branch_id")
    REFERENCES "restaurant"."branches"("business_account_id", "id"),
  CONSTRAINT "branch_dish_override_dish_fk" FOREIGN KEY ("business_account_id", "dish_id")
    REFERENCES "menu"."dishes"("business_account_id", "id")
);
--> statement-breakpoint
CREATE TABLE "tables"."tables" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "code" varchar(32) NOT NULL,
  "area" varchar(120),
  "status" varchar(24) NOT NULL,
  "out_of_service" boolean NOT NULL DEFAULT false,
  "version" integer NOT NULL,
  "created_at_utc" timestamp with time zone NOT NULL,
  "updated_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "table_status_supported" CHECK ("status" in ('active', 'inactive')),
  CONSTRAINT "table_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "tables_tenant_id_unique" UNIQUE ("business_account_id", "id"),
  CONSTRAINT "table_branch_fk" FOREIGN KEY ("business_account_id", "branch_id")
    REFERENCES "restaurant"."branches"("business_account_id", "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "table_branch_code_uidx" ON "tables"."tables" ("business_account_id", "branch_id", "code");
--> statement-breakpoint
CREATE INDEX "tables_branch_status_idx" ON "tables"."tables" ("business_account_id", "branch_id", "status");
--> statement-breakpoint
CREATE TABLE "tables"."table_qr_codes" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "table_id" uuid,
  "token_hash" char(64) NOT NULL,
  "kind" varchar(16) NOT NULL,
  "status" varchar(16) NOT NULL,
  "created_at_utc" timestamp with time zone NOT NULL,
  "revoked_at_utc" timestamp with time zone,
  "revoked_reason" varchar(160),
  CONSTRAINT "qr_kind_supported" CHECK ("kind" in ('table', 'branch')),
  CONSTRAINT "qr_status_supported" CHECK ("status" in ('active', 'revoked')),
  CONSTRAINT "qr_kind_table_consistency" CHECK (
    ("kind" = 'table' AND "table_id" IS NOT NULL) OR
    ("kind" = 'branch' AND "table_id" IS NULL)
  ),
  CONSTRAINT "qr_branch_fk" FOREIGN KEY ("business_account_id", "branch_id")
    REFERENCES "restaurant"."branches"("business_account_id", "id"),
  CONSTRAINT "qr_table_fk" FOREIGN KEY ("business_account_id", "table_id")
    REFERENCES "tables"."tables"("business_account_id", "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "qr_token_uidx" ON "tables"."table_qr_codes" ("token_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX "qr_active_table_uidx" ON "tables"."table_qr_codes" ("business_account_id", "table_id") WHERE "status" = 'active' AND "table_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "qr_active_branch_uidx" ON "tables"."table_qr_codes" ("business_account_id", "branch_id") WHERE "status" = 'active' AND "table_id" IS NULL;
--> statement-breakpoint
CREATE TABLE "tables"."table_sessions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "table_id" uuid NOT NULL,
  "status" varchar(16) NOT NULL,
  "opened_at_utc" timestamp with time zone NOT NULL,
  "closed_at_utc" timestamp with time zone,
  CONSTRAINT "table_session_status_supported" CHECK ("status" in ('open', 'closed')),
  CONSTRAINT "table_session_branch_fk" FOREIGN KEY ("business_account_id", "branch_id")
    REFERENCES "restaurant"."branches"("business_account_id", "id"),
  CONSTRAINT "table_session_table_fk" FOREIGN KEY ("business_account_id", "table_id")
    REFERENCES "tables"."tables"("business_account_id", "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "table_session_open_uidx" ON "tables"."table_sessions" ("business_account_id", "table_id") WHERE "status" = 'open';
--> statement-breakpoint
CREATE TABLE "ordering"."customer_sessions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "restaurant_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "table_id" uuid,
  "token_hash" char(64) NOT NULL,
  "display_name" varchar(100),
  "created_at_utc" timestamp with time zone NOT NULL,
  "last_seen_at_utc" timestamp with time zone NOT NULL,
  "expires_at_utc" timestamp with time zone NOT NULL,
  "revoked_at_utc" timestamp with time zone,
  CONSTRAINT "customer_session_expiry_after_creation" CHECK ("expires_at_utc" > "created_at_utc"),
  CONSTRAINT "customer_session_restaurant_fk" FOREIGN KEY ("business_account_id", "restaurant_id")
    REFERENCES "restaurant"."restaurants"("business_account_id", "id"),
  CONSTRAINT "customer_session_branch_fk" FOREIGN KEY ("business_account_id", "branch_id")
    REFERENCES "restaurant"."branches"("business_account_id", "id"),
  CONSTRAINT "customer_session_table_fk" FOREIGN KEY ("business_account_id", "table_id")
    REFERENCES "tables"."tables"("business_account_id", "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_session_token_uidx" ON "ordering"."customer_sessions" ("token_hash");
--> statement-breakpoint
CREATE INDEX "customer_session_branch_active_idx" ON "ordering"."customer_sessions" ("business_account_id", "branch_id", "expires_at_utc") WHERE "revoked_at_utc" IS NULL;
