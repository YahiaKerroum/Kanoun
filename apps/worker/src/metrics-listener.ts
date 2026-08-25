import { createServer, type Server } from "node:http";

export interface WorkerMetricsListener {
  readonly close: () => Promise<void>;
}

/**
 * Loopback-only JSON metrics listener for the worker process. The worker never
 * starts or imports Express; this is a minimal node:http surface bound to a
 * loopback host chosen in configuration.
 */
export function startWorkerMetricsListener(options: {
  readonly host: string;
  readonly port: number;
  readonly read: () => string;
}): Promise<WorkerMetricsListener> {
  const server: Server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/metrics") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(options.read());
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => {
      resolve({
        close: () =>
          new Promise((resolveClose, rejectClose) => {
            server.close((error) =>
              error ? rejectClose(error) : resolveClose(),
            );
          }),
      });
    });
  });
}
