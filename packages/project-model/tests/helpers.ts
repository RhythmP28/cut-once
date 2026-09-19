import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BuildEvent, BuildState, Plan } from "@cutonce/schemas";

export const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "data", "fixtures");
export const load = <T>(rel: string): T => JSON.parse(readFileSync(join(FIXTURES, rel), "utf8")) as T;
export const desk = () => load<Plan>("plan_desk_archetype.json");
export interface StateCase { note: string; plan: string; assembly_id: string; events: BuildEvent[]; up_to: number | null; expected: BuildState }
export const stateCases = () => readdirSync(join(FIXTURES, "events_to_state")).filter((f) => f.endsWith(".json")).sort()
  .map((f) => ({ file: f, ...load<StateCase>(`events_to_state/${f}`) }));
export const clone = <T>(v: T): T => structuredClone(v);
