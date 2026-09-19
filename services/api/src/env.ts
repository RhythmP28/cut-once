import { existsSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./config.js";

/**
 * Loads .env.local for a CLI run.
 *
 * This used to be `tsx --env-file-if-exists=../../.env.local` in the package scripts, but pnpm 9.15's
 * `exec` parses that flag itself and dies with "../../.env.local: not found" before tsx ever sees it.
 * Doing it in-process works the same whether the script is run through pnpm, through tsx, or directly.
 */
const path = join(REPO_ROOT, ".env.local");
if (existsSync(path)) process.loadEnvFile(path);
