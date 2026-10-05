import pg from "pg";
import {
  applyDatabaseMigrations,
  createDatabasePool,
} from "@rms/building-blocks";
import { describeDatabaseUrl, type RestaurantSummary } from "./protocol.js";

export interface FriendlyError {
  readonly title: string;
  readonly detail: string;
}

/**
 * Turns PostgreSQL driver errors into something a restaurant owner can act on.
 * Never includes the connection password.
 */
export function describeDatabaseError(
  error: unknown,
  databaseUrl: string,
): FriendlyError {
  const where = describeDatabaseUrl(databaseUrl);
  const code = (error as { code?: unknown } | undefined)?.code;
  const message = error instanceof Error ? error.message : "";
  switch (code) {
    case "ECONNREFUSED":
      return {
        title: "The database server refused the connection",
        detail: `Nothing is accepting connections at ${where}. Check that PostgreSQL is running and the host and port are right.`,
      };
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return {
        title: "The database server could not be found",
        detail: `The host name in ${where} does not resolve. Check the spelling or use the server's IP address.`,
      };
    case "ETIMEDOUT":
      return {
        title: "The database server did not answer",
        detail: `Connecting to ${where} timed out. A firewall may be blocking the port.`,
      };
    case "28P01":
    case "28000":
      return {
        title: "PostgreSQL rejected the sign-in",
        detail:
          "The user name or password is wrong, or this computer is not allowed in the server's pg_hba.conf.",
      };
    case "3D000":
      return {
        title: "That database does not exist",
        detail: `Create the database on the server first, then connect again (${where}).`,
      };
    case "42501":
      return {
        title: "The database user is missing permissions",
        detail:
          "MISE needs a user that can create schemas and tables in this database.",
      };
    default:
      if (/does not support SSL/i.test(message)) {
        return {
          title: "The server does not use SSL",
          detail: "Remove sslmode=require from the connection URL.",
        };
      }
      return {
        title: "Could not use the database",
        detail: message
          ? message.replaceAll(databaseUrl, where)
          : "An unknown database error occurred. See the runtime log.",
      };
  }
}

export async function testConnection(databaseUrl: string): Promise<string> {
  const client = new pg.Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 8_000,
  });
  await client.connect();
  try {
    const result = await client.query<{ server_version: string }>(
      "show server_version",
    );
    const version = result.rows[0]?.server_version ?? "unknown";
    const major = Number.parseInt(version, 10);
    if (Number.isFinite(major) && major < 16) {
      throw Object.assign(
        new Error(
          `This server runs PostgreSQL ${version}. MISE needs PostgreSQL 16 or newer.`,
        ),
        { code: "MISE_VERSION" },
      );
    }
    return version;
  } finally {
    await client.end();
  }
}

export async function migrate(
  databaseUrl: string,
  migrationsFolder: string,
): Promise<void> {
  const pool = createDatabasePool({
    connectionString: databaseUrl,
    applicationName: "mise-desktop-migrate",
    maximumConnections: 1,
  });
  try {
    await applyDatabaseMigrations(pool, migrationsFolder);
  } finally {
    await pool.end();
  }
}

/** Read-only summary for the launcher; writes always go through the API. */
export async function listRestaurants(
  databaseUrl: string,
): Promise<RestaurantSummary[]> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{
      code: string;
      name: string;
      branches: string;
    }>(
      `select account.code,
              coalesce(min(restaurant.name), account.name) as name,
              count(branch.id) as branches
         from restaurant.business_accounts account
         left join restaurant.restaurants restaurant
           on restaurant.business_account_id = account.id
         left join restaurant.branches branch
           on branch.business_account_id = account.id
        where account.status = 'active'
        group by account.id, account.code, account.name
        order by account.created_at_utc`,
    );
    return result.rows.map((row) => ({
      businessCode: row.code,
      name: row.name,
      branches: Number(row.branches),
    }));
  } finally {
    await client.end();
  }
}
