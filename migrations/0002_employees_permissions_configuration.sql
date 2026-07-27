CREATE TABLE "identity"."employee_permission_sets" (
  "business_account_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "updated_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "employee_permission_set_pk" PRIMARY KEY ("business_account_id", "employee_id"),
  CONSTRAINT "employee_permission_set_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "employee_permission_set_employee_fk" FOREIGN KEY ("business_account_id", "employee_id")
    REFERENCES "restaurant"."employees"("business_account_id", "id")
);
--> statement-breakpoint
INSERT INTO "identity"."employee_permission_sets" (
  "business_account_id", "employee_id", "version", "updated_at_utc"
)
SELECT "business_account_id", "id", 1, "updated_at_utc"
FROM "restaurant"."employees";
--> statement-breakpoint
CREATE TABLE "identity"."permission_templates" (
  "template_key" varchar(64) PRIMARY KEY NOT NULL,
  "display_name" varchar(120) NOT NULL,
  "permission_keys" jsonb NOT NULL,
  "version" integer NOT NULL,
  "active" boolean NOT NULL,
  "created_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "permission_template_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "permission_template_grants_array" CHECK (jsonb_typeof("permission_keys") = 'array')
);
--> statement-breakpoint
INSERT INTO "identity"."permission_templates" (
  "template_key", "display_name", "permission_keys", "version", "active", "created_at_utc"
) VALUES
  (
    'administrator',
    'Administrator',
    '["restaurant.view","restaurant.edit","branches.view","branches.manage","features.manage","employees.view","employees.manage","employees.manage_permissions","menu.view","menu.manage","menu.manage_prices","menu.manage_availability","qr.manage","tables.view","tables.manage","tables.assign","tables.close_session","orders.view","orders.create","orders.accept","orders.reject","orders.modify","orders.cancel","orders.serve","orders.complete","kitchen.view","kitchen.update","payments.view","payments.record","payments.refund","reports.view","reports.view_cross_branch","audit.view"]'::jsonb,
    1,
    true,
    now()
  ),
  (
    'general_staff',
    'General Staff',
    '["menu.view","tables.view","tables.assign","orders.view","orders.create","orders.serve","kitchen.view","kitchen.update"]'::jsonb,
    1,
    true,
    now()
  ),
  (
    'cashier',
    'Cashier',
    '["tables.view","orders.view","orders.create","orders.complete","payments.view","payments.record"]'::jsonb,
    1,
    true,
    now()
  ),
  (
    'kitchen_staff',
    'Kitchen Staff',
    '["orders.view","kitchen.view","kitchen.update"]'::jsonb,
    1,
    true,
    now()
  );
--> statement-breakpoint
CREATE TABLE "identity"."support_access_grants" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "operator_id" uuid NOT NULL,
  "approver_id" uuid NOT NULL,
  "approval_reference" varchar(160) NOT NULL,
  "reason" varchar(500) NOT NULL,
  "scope" jsonb NOT NULL,
  "token_hash" char(64) NOT NULL,
  "created_at_utc" timestamp with time zone NOT NULL,
  "expires_at_utc" timestamp with time zone NOT NULL,
  "revoked_at_utc" timestamp with time zone,
  "revoked_by_operator_id" uuid,
  "revocation_reason" varchar(500),
  CONSTRAINT "support_access_tenant_fk" FOREIGN KEY ("business_account_id")
    REFERENCES "restaurant"."business_accounts"("id"),
  CONSTRAINT "support_access_distinct_approver" CHECK ("operator_id" <> "approver_id"),
  CONSTRAINT "support_access_approval_reference_length" CHECK (length(trim("approval_reference")) >= 8),
  CONSTRAINT "support_access_reason_length" CHECK (length(trim("reason")) >= 8),
  CONSTRAINT "support_access_scope_object" CHECK (jsonb_typeof("scope") = 'object'),
  CONSTRAINT "support_access_expiry_after_creation" CHECK ("expires_at_utc" > "created_at_utc"),
  CONSTRAINT "support_access_maximum_duration" CHECK ("expires_at_utc" <= "created_at_utc" + interval '4 hours')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "support_access_token_uidx"
  ON "identity"."support_access_grants" ("token_hash");
--> statement-breakpoint
CREATE INDEX "support_access_tenant_active_idx"
  ON "identity"."support_access_grants" ("business_account_id", "expires_at_utc")
  WHERE "revoked_at_utc" IS NULL;
--> statement-breakpoint
CREATE TABLE "restaurant"."feature_configuration_versions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "restaurant_id" uuid NOT NULL,
  "branch_id" uuid,
  "version" integer NOT NULL,
  "configuration" jsonb NOT NULL,
  "created_by_user_id" uuid,
  "reason" varchar(500),
  "created_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "feature_configuration_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "feature_configuration_object" CHECK (jsonb_typeof("configuration") = 'object'),
  CONSTRAINT "feature_configuration_restaurant_fk" FOREIGN KEY ("business_account_id", "restaurant_id")
    REFERENCES "restaurant"."restaurants"("business_account_id", "id"),
  CONSTRAINT "feature_configuration_branch_fk" FOREIGN KEY ("business_account_id", "branch_id")
    REFERENCES "restaurant"."branches"("business_account_id", "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "feature_configuration_scope_version_uidx"
  ON "restaurant"."feature_configuration_versions" (
    "business_account_id",
    "restaurant_id",
    coalesce("branch_id", '00000000-0000-0000-0000-000000000000'::uuid),
    "version"
  );
--> statement-breakpoint
CREATE INDEX "feature_configuration_current_idx"
  ON "restaurant"."feature_configuration_versions" (
    "business_account_id",
    "restaurant_id",
    "branch_id",
    "version" DESC
  );
--> statement-breakpoint
INSERT INTO "restaurant"."feature_configuration_versions" (
  "id",
  "business_account_id",
  "restaurant_id",
  "version",
  "configuration",
  "created_at_utc"
)
SELECT
  gen_random_uuid(),
  r."business_account_id",
  r."id",
  1,
  '{
    "CFG-001":"enabled",
    "CFG-002":"enabled",
    "CFG-003":"enabled",
    "CFG-014":"enabled",
    "CFG-018":"unavailable"
  }'::jsonb,
  r."created_at_utc"
FROM "restaurant"."restaurants" r;
--> statement-breakpoint
INSERT INTO "restaurant"."feature_configuration_versions" (
  "id",
  "business_account_id",
  "restaurant_id",
  "branch_id",
  "version",
  "configuration",
  "created_at_utc"
)
SELECT
  gen_random_uuid(),
  b."business_account_id",
  b."restaurant_id",
  b."id",
  1,
  '{
    "CFG-004":"enabled",
    "CFG-005":"enabled",
    "CFG-006":"enabled",
    "CFG-007":"enabled",
    "CFG-008":"automatic",
    "CFG-009":"disabled",
    "CFG-010":"disabled",
    "CFG-011":"enabled",
    "CFG-013":"enabled",
    "CFG-016":"unavailable",
    "CFG-017":"unavailable",
    "CFG-019":"disabled"
  }'::jsonb,
  b."created_at_utc"
FROM "restaurant"."branches" b;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "restaurant"."reject_configuration_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'feature configuration versions are append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "feature_configuration_versions_append_only"
BEFORE UPDATE OR DELETE ON "restaurant"."feature_configuration_versions"
FOR EACH ROW EXECUTE FUNCTION "restaurant"."reject_configuration_mutation"();
