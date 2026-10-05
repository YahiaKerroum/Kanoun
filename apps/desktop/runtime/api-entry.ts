import process from "node:process";
import { loadApiConfig } from "../../api/src/config.js";
import { startApiServer } from "../../api/src/http-server.js";
import { onShutdownRequest, reportReady } from "./child-ipc.js";

const api = await startApiServer(loadApiConfig(process.env));
reportReady();

onShutdownRequest(async () => {
  await api.close().catch(() => undefined);
  process.exit(0);
});
