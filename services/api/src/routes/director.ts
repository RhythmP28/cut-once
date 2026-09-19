import type { FastifyInstance } from "fastify";
import { ulid } from "ulid";
import { S } from "@cutonce/schemas";
import { ApiError, badRequest, notFound } from "../errors.js";
import type { Ctx } from "../app.js";

/** The laptop control page. `goto` and `set_flag` only travel to the headset; the server keeps no demo state. */
export function directorRoutes(app: FastifyInstance, { store, hooks }: Ctx) {
  app.post("/v1/director/command", async (req) => {
    const parsed = S.DirectorCommand.safeParse(req.body);
    if (!parsed.success) throw badRequest("unknown or malformed director command", parsed.error.issues);
    const command = parsed.data;

    if (command.type === "new_run") {
      const assembly = await store.createAssembly({ seed: command.seed, plan_id: command.plan_id });
      return { ok: true, assembly };
    }
    if (command.type === "force_state") {
      const current = store.currentAssembly();
      if (!current) throw notFound("current run");
      const before = store.getState(current.assembly_id).parts[command.part_id]?.state ?? "missing";
      const now = new Date().toISOString();
      const result = await store.appendEvent(current.assembly_id, {
        event_id: `evt_${ulid()}`, assembly_id: current.assembly_id, version: null, timestamp: now, client_timestamp: now, kind: "part_state",
        part_id: command.part_id, previous_state: before, new_state: command.new_state, source: "system", confidence: 1, actor: "director", note: "forced from the Director page",
      });
      return { ok: true, version: result.event.version };
    }
    if (command.type === "promote_cache") {
      if (!hooks.promoteCache) throw new ApiError(501, "not_implemented", "the copilot module has not registered a cache yet");
      await hooks.promoteCache(command.turn_id, command.scripted_query_id);
      return { ok: true };
    }
    store.bus.emit("broadcast", { type: "director_command", command });
    return { ok: true };
  });
}
