import { Client } from "pg";

export async function resetPlatformSchema(
  connectionString: string,
): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query("drop schema if exists platform cascade");
  } finally {
    await client.end();
  }
}
