import type { Plugin } from "./app.js";
import { copilotRoutes } from "./copilot/index.js";
import { documentRoutes } from "./routes/documents.js";
import { healthRoutes } from "./routes/health.js";
import { knowledgeRoutes } from "./routes/knowledge.js";
import { staticRoutes } from "./routes/static.js";

/** Everything beyond the core. The static web app goes last: its not-found handler is the catch-all. */
export const plugins: Plugin[] = [healthRoutes, documentRoutes, knowledgeRoutes, copilotRoutes, staticRoutes];
