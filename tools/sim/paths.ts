import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Where a simulation run lives. `current` is this run, `baseline` the one it is compared with. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const OUT = join(ROOT, "sim-out");
export const CURRENT = join(OUT, "current");
export const BASELINE = join(OUT, "baseline");
export const SIM_PORT = Number(process.env.SIM_PORT ?? 8787);
export const SIM_TOKEN = "sim-token";
