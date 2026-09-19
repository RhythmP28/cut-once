import type { Plugin } from "./app.js";
import { healthRoutes } from "./routes/health.js";

/** Everything beyond the core. Order matters only for the static web app, which must come last. */
export const plugins: Plugin[] = [healthRoutes];
