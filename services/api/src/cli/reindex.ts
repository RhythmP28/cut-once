import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { buildChunks, indexChunks } from "../ingest/ingest.js";
import { getEs, INDEX } from "../search/client.js";
import { eventDoc } from "../search/indexEvents.js";

/** pnpm reindex [--rebuild-chunks]. Rebuilds every index from DATA_DIR. Disk is the record; this proves it. */
const cfg = loadConfig(process.env, { logLevel: "warn" });
const app = await buildApp(cfg);
const { store, docs } = app.ctx;
const es = getEs(cfg);
if (!es) { console.error("Set ES_URL and ES_API_KEY first."); process.exit(1); }

for (const doc of docs.list()) {
  const chunks = process.argv.includes("--rebuild-chunks") || docs.readChunks(doc.document_id).length === 0 ? await buildChunks(app.ctx, doc.document_id) : docs.readChunks(doc.document_id);
  console.log(`${doc.document_id}: ${await indexChunks(app.ctx, chunks)} / ${chunks.length} passages`);
}

const plan = store.getPlan(store.currentAssembly()?.plan_id ?? "plan_desk_demo");
const size = (p: (typeof plan.parts)[number]) => p.shape.type === "box" ? p.shape.size.map((v) => `${Math.round(v * 1000)} mm`).join(" x ")
  : p.shape.type === "cylinder" ? `diameter ${Math.round(p.shape.diameter * 1000)} mm, length ${Math.round(p.shape.length * 1000)} mm` : p.shape.type;
const ops: object[] = [
  ...plan.parts.flatMap((p) => [{ index: { _index: INDEX.parts, _id: `${plan.plan_id}:${p.part_id}` } }, { part_id: p.part_id, plan_id: plan.plan_id, revision: plan.revision, name: p.name, aliases: p.aliases, layer: p.layer, kind: p.kind, material_id: p.material_id, step_id: p.step_id, dims_text: size(p), description: p.verify_hint, rests_on: p.rests_on }]),
  ...plan.materials.flatMap((m) => [{ index: { _index: INDEX.materials, _id: `${plan.plan_id}:${m.material_id}` } }, { material_id: m.material_id, plan_id: plan.plan_id, name: m.name, spec: m.spec, unit: m.unit, quantity: m.quantity, used_by: m.used_by, raw_text: `${m.name} ${m.spec}` }]),
];
for (const aid of store.listAssemblies()) {
  const assembly = store.getAssembly(aid), { events } = store.getEvents(aid);
  events.forEach((e, i) => ops.push({ index: { _index: INDEX.events, _id: e.event_id } }, eventDoc(assembly, e, events[i - 1] ?? null)));
}
const res = await es.bulk({ refresh: "wait_for", operations: ops });
console.log(`parts ${plan.parts.length}, materials ${plan.materials.length}, runs ${store.listAssemblies().length}; bulk errors: ${res.errors}`);
await app.close();
