import { once } from "node:events";
import type { Server } from "node:http";
import { composeApi } from "./composition-root.js";
import type { ApiConfig } from "./config.js";

export interface RunningApiServer {
  readonly server: Server;
  readonly close: () => Promise<void>;
}

/**
 * Starts the composed API on the configured host and port. Both the
 * standalone `server.ts` entrypoint and the desktop runtime host use this so
 * there is exactly one place that binds the HTTP listener.
 */
export async function startApiServer(
  config: ApiConfig,
): Promise<RunningApiServer> {
  const { app, databasePool } = composeApi(config);
  const server = app.listen(config.port, config.host);
  await once(server, "listening");

  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closing ??= (async () => {
      const serverError = await new Promise<Error | undefined>((resolve) => {
        server.close((error) => resolve(error));
        server.closeAllConnections();
      });
      await databasePool.end();
      if (serverError) {
        throw serverError;
      }
    })();
    return closing;
  };

  return { server, close };
}
