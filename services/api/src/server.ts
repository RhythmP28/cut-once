import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { plugins } from "./plugins.js";

const cfg = loadConfig();
const app = await buildApp(cfg, plugins);
await app.listen({ port: cfg.port, host: cfg.host });
app.log.info({ dataDir: cfg.dataDir, search: cfg.searchMode, reconstruction: cfg.reconstruction }, "Cut Once API is up");
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => void app.close().then(() => process.exit(0)));
