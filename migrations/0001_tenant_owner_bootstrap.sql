CREATE SCHEMA "restaurant";
--> statement-breakpoint
CREATE SCHEMA "identity";
--> statement-breakpoint
CREATE SCHEMA "audit";
--> statement-breakpoint
CREATE TABLE "restaurant"."business_accounts" (
  "id" uuid PRIMARY KEY NOT NULL,
  "code" varchar(64) NOT NULL,
  "name" varchar(160) NOT NULL,
  "status" varchar(24) NOT NULL,
  "version" integer NOT NULL,
  "created_at_utc" timestamp with time zone NOT NULL,
  "updated_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "business_account_code_format" CHECK ("code" ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
  CONSTRAINT "business_account_status_supported" CHECK ("status" in ('active', 'inactive')),
  CONSTRAINT "business_account_version_positive" CHECK ("version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "restaurant"."restaurants" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "name" varchar(160) NOT NULL,
  "status" varchar(24) NOT NULL,
  "branding" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "version" integer NOT NULL,
  "created_at_utc" timestamp with time zone NOT NULL,
  "updated_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "restaurant_status_supported" CHECK ("status" in ('active', 'inactive')),
  CONSTRAINT "restaurant_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "restaurants_tenant_id_unique" UNIQUE ("business_account_id", "id"),
  CONSTRAINT "restaurant_business_account_fk" FOREIGN KEY ("business_account_id")
    REFERENCES "restaurant"."business_accounts"("id")
);
--> statement-breakpoint
CREATE TABLE "restaurant"."branches" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "restaurant_id" uuid NOT NULL,
  "name" varchar(160) NOT NULL,
  "address" jsonb NOT NULL,
  "contact" jsonb NOT NULL,
  "time_zone" varchar(100) NOT NULL,
  "currency" char(3) NOT NULL,
  "status" varchar(24) NOT NULL,
  "service_status" varchar(32) NOT NULL,
  "allow_order_override" boolean NOT NULL DEFAULT false,
  "version" integer NOT NULL,
  "created_at_utc" timestamp with time zone NOT NULL,
  "updated_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "branch_status_supported" CHECK ("status" in ('active', 'inactive')),
  CONSTRAINT "branch_service_status_supported" CHECK ("service_status" in ('open', 'closed', 'temporarily_unavailable')),
  CONSTRAINT "branch_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "branch_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "branches_tenant_id_unique" UNIQUE ("business_account_id", "id"),
  CONSTRAINT "branch_restaurant_fk" FOREIGN KEY ("business_account_id", "restaurant_id")
    REFERENCES "restaurant"."restaurants"("business_account_id", "id")
);
--> statement-breakpoint
CREATE TABLE "restaurant"."branch_hours" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "day_of_week" smallint NOT NULL,
  "opens_at_local" time without time zone NOT NULL,
  "closes_at_local" time without time zone NOT NULL,
  "created_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "branch_hours_day_supported" CHECK ("day_of_week" BETWEEN 0 AND 6),
  CONSTRAINT "branch_hours_nonzero_period" CHECK ("opens_at_local" <> "closes_at_local"),
  CONSTRAINT "branch_hours_branch_fk" FOREIGN KEY ("business_account_id", "branch_id")
    REFERENCES "restaurant"."branches"("business_account_id", "id")
);
--> statement-breakpoint
CREATE TABLE "restaurant"."branch_closures" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "closure_date" date NOT NULL,
  "reason" varchar(500) NOT NULL,
  "created_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "branch_closure_branch_fk" FOREIGN KEY ("business_account_id", "branch_id")
    REFERENCES "restaurant"."branches"("business_account_id", "id")
);
--> statement-breakpoint
CREATE TABLE "restaurant"."employees" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "restaurant_id" uuid NOT NULL,
  "display_name" varchar(160) NOT NULL,
  "email" varchar(320) NOT NULL,
  "status" varchar(24) NOT NULL,
  "version" integer NOT NULL,
  "created_at_utc" timestamp with time zone NOT NULL,
  "updated_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "employee_status_supported" CHECK ("status" in ('active', 'inactive')),
  CONSTRAINT "employee_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "employees_tenant_id_unique" UNIQUE ("business_account_id", "id"),
  CONSTRAINT "employee_restaurant_fk" FOREIGN KEY ("business_account_id", "restaurant_id")
    REFERENCES "restaurant"."restaurants"("business_account_id", "id")
);
--> statement-breakpoint
CREATE TABLE "restaurant"."employee_branch_access" (
  "business_account_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "created_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "employee_branch_employee_fk" FOREIGN KEY ("business_account_id", "employee_id")
    REFERENCES "restaurant"."employees"("business_account_id", "id"),
  CONSTRAINT "employee_branch_branch_fk" FOREIGN KEY ("business_account_id", "branch_id")
    REFERENCES "restaurant"."branches"("business_account_id", "id")
);
--> statement-breakpoint
CREATE TABLE "identity"."users" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "email_normalized" varchar(320) NOT NULL,
  "password_hash" text,
  "status" varchar(24) NOT NULL,
  "verified_at_utc" timestamp with time zone,
  "credential_version" integer NOT NULL,
  "created_at_utc" timestamp with time zone NOT NULL,
  "updated_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "user_status_supported" CHECK ("status" in ('invited', 'active', 'disabled')),
  CONSTRAINT "user_credential_version_positive" CHECK ("credential_version" >= 1),
  CONSTRAINT "active_user_has_password" CHECK ("status" <> 'active' OR "password_hash" IS NOT NULL),
  CONSTRAINT "users_tenant_id_unique" UNIQUE ("business_account_id", "id"),
  CONSTRAINT "user_employee_fk" FOREIGN KEY ("business_account_id", "employee_id")
    REFERENCES "restaurant"."employees"("business_account_id", "id")
);
--> statement-breakpoint
CREATE TABLE "identity"."permission_grants" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "permission_key" varchar(100) NOT NULL,
  "restaurant_id" uuid,
  "branch_id" uuid,
  "granted_by_user_id" uuid,
  "granted_at_utc" timestamp with time zone NOT NULL,
  "revoked_at_utc" timestamp with time zone,
  CONSTRAINT "permission_grant_employee_fk" FOREIGN KEY ("business_account_id", "employee_id")
    REFERENCES "restaurant"."employees"("business_account_id", "id"),
  CONSTRAINT "permission_grant_restaurant_fk" FOREIGN KEY ("business_account_id", "restaurant_id")
    REFERENCES "restaurant"."restaurants"("business_account_id", "id"),
  CONSTRAINT "permission_grant_branch_fk" FOREIGN KEY ("business_account_id", "branch_id")
    REFERENCES "restaurant"."branches"("business_account_id", "id")
);
--> statement-breakpoint
CREATE TABLE "identity"."staff_sessions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "token_hash" char(64) NOT NULL,
  "csrf_token_hash" char(64) NOT NULL,
  "active_branch_id" uuid,
  "credential_version" integer NOT NULL,
  "authenticated_at_utc" timestamp with time zone NOT NULL,
  "created_at_utc" timestamp with time zone NOT NULL,
  "expires_at_utc" timestamp with time zone NOT NULL,
  "last_seen_at_utc" timestamp with time zone NOT NULL,
  "revoked_at_utc" timestamp with time zone,
  "revocation_reason" varchar(160),
  CONSTRAINT "staff_session_expiry_after_creation" CHECK ("expires_at_utc" > "created_at_utc"),
  CONSTRAINT "staff_session_user_fk" FOREIGN KEY ("business_account_id", "user_id")
    REFERENCES "identity"."users"("business_account_id", "id"),
  CONSTRAINT "staff_session_branch_fk" FOREIGN KEY ("business_account_id", "active_branch_id")
    REFERENCES "restaurant"."branches"("business_account_id", "id")
);
--> statement-breakpoint
CREATE TABLE "identity"."staff_invitations" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "token_hash" char(64) NOT NULL,
  "expires_at_utc" timestamp with time zone NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "created_at_utc" timestamp with time zone NOT NULL,
  "accepted_at_utc" timestamp with time zone,
  "revoked_at_utc" timestamp with time zone,
  CONSTRAINT "staff_invitation_expiry_after_creation" CHECK ("expires_at_utc" > "created_at_utc"),
  CONSTRAINT "staff_invitation_employee_fk" FOREIGN KEY ("business_account_id", "employee_id")
    REFERENCES "restaurant"."employees"("business_account_id", "id")
);
--> statement-breakpoint
CREATE TABLE "identity"."credential_recovery_tokens" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "token_hash" char(64) NOT NULL,
  "expires_at_utc" timestamp with time zone NOT NULL,
  "created_at_utc" timestamp with time zone NOT NULL,
  "used_at_utc" timestamp with time zone,
  CONSTRAINT "credential_recovery_expiry_after_creation" CHECK ("expires_at_utc" > "created_at_utc"),
  CONSTRAINT "credential_recovery_user_fk" FOREIGN KEY ("business_account_id", "user_id")
    REFERENCES "identity"."users"("business_account_id", "id")
);
--> statement-breakpoint
CREATE TABLE "audit"."audit_events" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_account_id" uuid NOT NULL,
  "restaurant_id" uuid,
  "branch_id" uuid,
  "actor_user_id" uuid,
  "action" varchar(160) NOT NULL,
  "target_type" varchar(80) NOT NULL,
  "target_id" uuid NOT NULL,
  "outcome" varchar(24) NOT NULL,
  "reason" varchar(500),
  "correlation_id" uuid NOT NULL,
  "before_data" jsonb,
  "after_data" jsonb,
  "occurred_at_utc" timestamp with time zone NOT NULL,
  CONSTRAINT "audit_outcome_supported" CHECK ("outcome" in ('attempted', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "business_account_code_uidx" ON "restaurant"."business_accounts" ("code");
--> statement-breakpoint
CREATE INDEX "restaurants_tenant_status_idx" ON "restaurant"."restaurants" ("business_account_id", "status");
--> statement-breakpoint
CREATE INDEX "branches_tenant_restaurant_idx" ON "restaurant"."branches" ("business_account_id", "restaurant_id", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX "branch_hours_period_uidx" ON "restaurant"."branch_hours" ("business_account_id", "branch_id", "day_of_week", "opens_at_local");
--> statement-breakpoint
CREATE UNIQUE INDEX "branch_closure_date_uidx" ON "restaurant"."branch_closures" ("business_account_id", "branch_id", "closure_date");
--> statement-breakpoint
CREATE UNIQUE INDEX "employees_restaurant_email_uidx" ON "restaurant"."employees" ("business_account_id", "restaurant_id", lower("email"));
--> statement-breakpoint
CREATE UNIQUE INDEX "employee_branch_access_uidx" ON "restaurant"."employee_branch_access" ("business_account_id", "employee_id", "branch_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "users_tenant_employee_uidx" ON "identity"."users" ("business_account_id", "employee_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "users_tenant_email_uidx" ON "identity"."users" ("business_account_id", "email_normalized");
--> statement-breakpoint
CREATE UNIQUE INDEX "permission_grants_active_uidx" ON "identity"."permission_grants" (
  "business_account_id",
  "employee_id",
  "permission_key",
  coalesce("restaurant_id", '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce("branch_id", '00000000-0000-0000-0000-000000000000'::uuid)
) WHERE "revoked_at_utc" IS NULL;
--> statement-breakpoint
CREATE INDEX "permission_resolution_idx" ON "identity"."permission_grants" ("business_account_id", "employee_id", "branch_id") WHERE "revoked_at_utc" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "staff_session_token_uidx" ON "identity"."staff_sessions" ("token_hash");
--> statement-breakpoint
CREATE INDEX "staff_session_user_active_idx" ON "identity"."staff_sessions" ("business_account_id", "user_id", "expires_at_utc") WHERE "revoked_at_utc" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "staff_invitation_token_uidx" ON "identity"."staff_invitations" ("token_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX "credential_recovery_token_uidx" ON "identity"."credential_recovery_tokens" ("token_hash");
--> statement-breakpoint
CREATE INDEX "audit_tenant_time_idx" ON "audit"."audit_events" ("business_account_id", "occurred_at_utc" DESC);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "audit"."reject_audit_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit events are append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "audit_events_append_only"
BEFORE UPDATE OR DELETE ON "audit"."audit_events"
FOR EACH ROW EXECUTE FUNCTION "audit"."reject_audit_mutation"();
