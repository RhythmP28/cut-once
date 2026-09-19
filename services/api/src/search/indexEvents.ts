import type { Assembly, BuildEvent } from "@cutonce/schemas";
import type { Ctx } from "../app.js";
import { getEs, INDEX } from "./client.js";

export const eventDoc = (assembly: Assembly, e: BuildEvent, previous: BuildEvent | null) => ({
  "@timestamp": e.timestamp, event_id: e.event_id, assembly_id: e.assembly_id, plan_id: assembly.plan_id, version: e.version, kind: e.kind,
  part_id: e.part_id, previous_state: e.previous_state, new_state: e.new_state, source: e.source, confidence: e.confidence, step_id: e.step_id,
  actor: e.actor, verdict: e.verdict, note: e.note,
  seconds_since_prev: previous ? Math.max(0, (Date.parse(e.timestamp) - Date.parse(previous.timestamp)) / 1000) : 0,
});

/** Fire-and-forget indexing with retry. Disk already holds the event, so a slow or dead cluster costs nothing but analytics. */
export function startEventIndexer(ctx: Ctx, index: (id: string, doc: object) => Promise<void> = defaultIndex(ctx)) {
  const queue: { id: string; doc: object; tries: number }[] = [];
  let timer: NodeJS.Timeout | null = null;
  const pump = async () => {
    timer = null;
    while (queue.length) {
      const job = queue[0]!;
      try { await index(job.id, job.doc); queue.shift(); }
      catch {
        job.tries += 1;
        if (job.tries > 8) queue.shift();
        timer = setTimeout(pump, Math.min(30_000, 1000 * 2 ** (job.tries - 1))); timer.unref();
        return;
      }
    }
  };
  ctx.store.bus.on("event_appended", ({ assembly, event, previous }) => {
    if (!getEs(ctx.cfg) && index === defaultIndexRef) return;
    queue.push({ id: event.event_id, doc: eventDoc(assembly, event, previous), tries: 0 });
    if (!timer) void pump();
  });
  return { pending: () => queue.length, flush: pump };
}

let defaultIndexRef: unknown;
function defaultIndex(ctx: Ctx) {
  const fn = async (id: string, doc: object) => { await getEs(ctx.cfg)!.index({ index: INDEX.events, id, document: doc }); };
  defaultIndexRef = fn;
  return fn;
}
