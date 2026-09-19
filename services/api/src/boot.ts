import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { S, type Plan } from "@cutonce/schemas";
import type { FastifyBaseLogger } from "fastify";
import type { Config } from "./config.js";
import type { DocumentStore, KnownHash } from "./store/documents.js";
import type { Store } from "./store/store.js";

const json = (p: string) => JSON.parse(readFileSync(p, "utf8"));

/** Copies the committed demo data into DATA_DIR when it is missing, so a fresh VM or laptop starts out identical. */
export async function boot(store: Store, docs: DocumentStore, cfg: Config, log: FastifyBaseLogger) {
  const planFiles: string[] = [];
  const demo = join(cfg.repoRoot, "data", "demo");
  if (existsSync(demo)) planFiles.push(...readdirSync(demo).filter((f) => f.endsWith(".plan.json")).map((f) => join(demo, f)));
  const e7 = join(cfg.repoRoot, "data", "e7", "out", "e7.plan.json");
  if (existsSync(e7)) planFiles.push(e7);
  for (const f of ["plan_desk_archetype.json", "plan_asymmetric.json"]) {
    const p = join(cfg.repoRoot, "data", "fixtures", f);
    if (existsSync(p)) planFiles.push(p);
  }
  for (const file of planFiles) {
    const parsed = S.Plan.safeParse(json(file));
    if (!parsed.success) { log.warn({ file }, "skipped a plan file that does not match the schema"); continue; }
    if (store.importApproved(parsed.data as Plan)) log.info({ plan_id: parsed.data.plan_id, revision: parsed.data.revision }, "imported plan");
    const meshFiles = new Set<string>();
    for (const part of parsed.data.parts) {
      const shape = part.shape as { type: string; uri?: string };
      if (shape.type === "mesh" && shape.uri) meshFiles.add(shape.uri);
    }
    for (const uri of meshFiles) {
      const source = join(dirname(file), uri);
      // A clone made without Git LFS has a small text pointer here instead of the model: say so, or the
      // preview and headset quietly fall back to boxes.
      if (existsSync(source) && readFileSync(source).subarray(0, 64).toString().startsWith("version https://git-lfs")) {
        log.warn({ file: source }, `${uri} is a Git LFS pointer, not the model: install git-lfs and run \`git lfs pull\``);
      }
      store.syncAsset(parsed.data.plan_id, uri, source);
    }
  }

  const seeds = join(demo, "seeds");
  if (existsSync(seeds)) for (const f of readdirSync(seeds).filter((f) => f.endsWith(".json"))) {
    const seed = S.Seed.safeParse(json(join(seeds, f)));
    if (seed.success) store.putSeed(seed.data);
  }

  const known = join(demo, "known_hashes.json");
  if (existsSync(known)) docs.mergeKnown(json(known) as Record<string, KnownHash>);

  // A fresh data folder starts with one run: the configured seed (E7 unless DEFAULT_SEED says otherwise), else the desk.
  // An existing current run is never replaced here; the Director page's "New run" switches.
  const seedNames = store.listSeeds();
  const first = [cfg.defaultSeed, "demo_start"].find((s) => seedNames.includes(s));
  if (!store.currentAssembly() && first) {
    try { const a = await store.createAssembly({ seed: first }); log.info({ assembly_id: a.assembly_id, seed: first }, "created the first run"); }
    catch (err) { log.warn({ err, seed: first }, "could not create the first run"); }
  }
}
