import { readFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { S } from "@cutonce/schemas";
import { badRequest, notFound } from "../errors.js";
import type { Ctx } from "../app.js";

const int = (v: unknown, name: string): number | undefined => {
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw badRequest(`${name} must be a non-negative integer`);
  return n;
};

/** Plans, runs (assemblies), events and state. Shapes follow blueprint section 14. */
export function coreRoutes(app: FastifyInstance, { store }: Ctx) {
  app.get("/v1/plans", async () => ({ plans: store.listPlans() }));
  app.get<{ Params: { plan_id: string }; Querystring: { revision?: string } }>("/v1/plans/:plan_id", async (req) =>
    store.getPlan(req.params.plan_id, int(req.query.revision, "revision")));
  app.get<{ Params: { plan_id: string; name: string } }>("/v1/plans/:plan_id/assets/:name", async (req, reply) => {
    const { plan_id, name } = req.params;
    if (!/^[a-z0-9][a-z0-9_-]*\.(glb|gltf|png|jpg)$/.test(name)) throw badRequest("asset names are lowercase file names");
    const path = store.assetPath(plan_id, name);
    if (!path) throw notFound(`asset ${name} of ${plan_id}`);
    const type = name.endsWith(".glb") ? "model/gltf-binary" : name.endsWith(".gltf") ? "model/gltf+json" : name.endsWith(".png") ? "image/png" : "image/jpeg";
    return reply.type(type).header("cache-control", "no-store").send(readFileSync(path));
  });
  app.put<{ Params: { plan_id: string } }>("/v1/plans/:plan_id/draft", async (req) => {
    const body = { ...(req.body as object), plan_id: req.params.plan_id };
    const { revision, validation } = store.putDraft(body);
    return { revision, validation };
  });
  app.post<{ Params: { plan_id: string } }>("/v1/plans/:plan_id/approve", async (req) => {
    const body = z.object({ revision: z.number().int().min(1), approved_by: z.string().min(1) }).safeParse(req.body);
    if (!body.success) throw badRequest("body must be { revision, approved_by }");
    return store.approve(req.params.plan_id, body.data.revision, body.data.approved_by);
  });

  app.get("/v1/seeds", async () => ({ seeds: store.listSeeds() }));
  app.post("/v1/assemblies", async (req, reply) => {
    const body = z.object({ plan_id: S.Plan.shape.plan_id.optional(), revision: z.number().int().min(1).optional(), seed: z.string(), name: z.string().optional() }).safeParse(req.body);
    if (!body.success) throw badRequest("body must be { seed, plan_id?, revision?, name? }");
    return reply.status(201).send(await store.createAssembly(body.data));
  });
  app.get("/v1/assemblies", async () => ({ assemblies: store.listAssemblies(), current: store.currentAssembly()?.assembly_id ?? null }));
  app.get("/v1/assemblies/current", async (_req, reply) => {
    const current = store.currentAssembly();
    return current ?? reply.status(404).send({ error: { code: "not_found", message: "no run yet" } });
  });
  app.get<{ Params: { aid: string } }>("/v1/assemblies/:aid", async (req) => store.getAssembly(req.params.aid));

  app.get<{ Params: { aid: string }; Querystring: { after?: string } }>("/v1/assemblies/:aid/events", async (req) =>
    store.getEvents(req.params.aid, int(req.query.after, "after") ?? 0));
  app.post<{ Params: { aid: string } }>("/v1/assemblies/:aid/events", async (req, reply) => {
    const { status, event, head } = await store.appendEvent(req.params.aid, req.body);
    return reply.status(status === "created" ? 201 : 200).send({ version: event.version, head, event });
  });
  app.get<{ Params: { aid: string }; Querystring: { version?: string } }>("/v1/assemblies/:aid/state", async (req) =>
    store.getState(req.params.aid, int(req.query.version, "version")));
}
