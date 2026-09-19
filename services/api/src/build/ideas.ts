import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { validatePlan } from "@cutonce/project-model";
import { S, Strict, type BuildIdea, type IdeaDraft, type Surface, type Twin, type Vec3 } from "@cutonce/schemas";
import type { Config } from "../config.js";
import { writeJsonAtomic } from "../store/fs.js";
import type { Payload, Rule, Vocab } from "./data.js";
import { newId } from "./files.js";
import type { ModelCall } from "./label.js";
import { toPlan } from "./plan.js";
import { matchRules } from "./rules.js";
import { describeShape, dimsCm, halfOf, volumeOf } from "./shape.js";
import { chooseSite, type Box2 } from "./site.js";
import { solve } from "./solver.js";
import { checkStability } from "./stability.js";

export interface IdeasDeps {
  cfg: Config; vocab: Vocab; rules: Rule[]; call: ModelCall; model: string; cacheDir: string; timeoutMs: number;
  log: { warn: (o: object, m: string) => void };
}
export interface IdeasInput { sessionId: string; twins: Twin[]; surfaces: Surface[]; camera: Vec3; photo: Buffer | null; request: string | null }
type Candidate = { draft: IdeaDraft; source: "rule" | "ai"; ruleId: string | null; payload: Payload | null };

const Out = z.object({ ideas: z.array(S.IdeaDraft) });
const OutStrict = z.object({ ideas: z.array(Strict.IdeaDraft) });

const SYSTEM = [
  "You design small things a person can build right now from the real objects in front of them, like a Master Builder in the Lego Movie.",
  "You get an inventory of objects with measured sizes, and a photo. Return exactly 4 designs, each as bottom-up placement steps:",
  "- place: an object id from the inventory (each at most once).",
  "- orientation: upright (tallest side up), flat (thinnest side up) or on_side (middle side up). Cans, bottles, mugs and other cylinders can only be upright.",
  "- on: [] for the table, or ids already placed that it rests on. Supports must be able to hold weight and be the SAME height: use identical objects as supports.",
  "- at_cm: {x, z} on the table (x to the right, z toward the viewer, origin the centre of the build), or null.",
  "- next_to, side (left/right/front/back), gap_cm: or put it beside an object already on the table.",
  "Something resting on supports needs at least 3 supports that are not in a line, or one support at least as wide as it. Keep weight over what holds it.",
  "At most 6 objects. No cutting in this version. Title: 2–4 words saying what it is for. why: one fun sentence a judge would enjoy.",
].join("\n");

export function inventoryText(twins: Twin[], surfaces: Surface[]): string {
  const s = surfaces.map((x) => `${x.surface_id} ${x.kind} at ${Math.round(x.y * 100)} cm`).join("; ");
  const lines = twins.map((t) => `${t.twin_id} ${t.label}: ${describeShape(t.shape)}; ${t.material}; ${t.load_bearing ? "can hold weight" : "cannot hold weight"}${t.sits_on ? `; on ${t.sits_on}` : ""}`);
  return `Surfaces: ${s || "none"}.\nObjects:\n${lines.join("\n")}`;
}

/** Same names and sizes → same key; canonical ids c1… in name-then-size order, so cached designs map onto a new scan. */
export function canonical(twins: Twin[]) {
  const sorted = [...twins].sort((a, b) => a.name.localeCompare(b.name) || volumeOf(a.shape) - volumeOf(b.shape) || a.twin_id.localeCompare(b.twin_id));
  const key = createHash("sha1").update(sorted.map((t) => `${t.name}:${dimsCm(t.shape).map(Math.round).join("x")}`).join("|")).digest("hex").slice(0, 16);
  return { key, toCanon: new Map(sorted.map((t, i) => [t.twin_id, `c${i + 1}`])), fromCanon: new Map(sorted.map((t, i) => [`c${i + 1}`, t.twin_id])) };
}

/** A twin's outer bound along the room's axes, whichever way it is turned. */
const roomBox = (t: Twin): Box2 => {
  const h = halfOf(t.shape), r = Math.max(h[0], h[2]);
  return { min: [t.position[0] - r, t.position[2] - r], max: [t.position[0] + r, t.position[2] + r] };
};

const remap = (d: IdeaDraft, m: Map<string, string>): IdeaDraft | null => {
  const id = (x: string) => m.get(x);
  const ids = [...d.uses, ...d.steps.flatMap((s) => [s.place, ...s.on, ...(s.next_to ? [s.next_to] : [])])];
  if (ids.some((x) => !id(x))) return null;
  return { ...d, uses: d.uses.map((x) => id(x)!), steps: d.steps.map((s) => ({ ...s, place: id(s.place)!, on: s.on.map((x) => id(x)!), next_to: s.next_to ? id(s.next_to)! : null })) };
};

function buildSurface(twins: Twin[], surfaces: Surface[]): Surface | null {
  const votes = new Map<string, number>();
  for (const t of twins) if (t.sits_on) votes.set(t.sits_on, (votes.get(t.sits_on) ?? 0) + 1);
  const top = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return surfaces.find((s) => s.surface_id === top) ?? surfaces[0] ?? null;
}

function check(c: Candidate, byId: Map<string, Twin>, surface: Surface, input: IdeasInput, deps: IdeasDeps): { idea: BuildIdea } | { reason: string } {
  const missing = c.draft.steps.find((s) => !byId.has(s.place));
  if (missing) return { reason: `${missing.place} is not in the inventory` };
  const solved = solve(c.draft, byId);
  if (!solved.ok) return { reason: solved.reason };
  const stable = checkStability(solved.placed, byId, deps.vocab, c.payload);
  if (!stable.ok) return { reason: stable.reason };
  const ideaId = newId("idea");
  const { plan, twinOf, size } = toPlan({ ideaId, title: c.draft.title, why: c.draft.why, tools: c.draft.tools, source: c.source, ruleId: c.ruleId, model: deps.model, placed: solved.placed, twins: byId, projectId: deps.cfg.projectId });
  const error = validatePlan(plan).find((i) => i.severity === "error");
  if (error) return { reason: `plan check ${error.code}: ${error.message}` };
  const used = solved.placed.map((p) => byId.get(p.twin_id)!);
  const pile: Box2 = { min: [Math.min(...used.map((t) => roomBox(t).min[0])), Math.min(...used.map((t) => roomBox(t).min[1]))], max: [Math.max(...used.map((t) => roomBox(t).max[0])), Math.max(...used.map((t) => roomBox(t).max[1]))] };
  // Everything else standing on that surface, named or not, is in the way of a hologram.
  const inTheWay = input.twins.filter((t) => t.sits_on === surface.surface_id && !used.includes(t)).map(roomBox);
  const site = chooseSite(surface, pile, { w: size[0], d: size[1] }, input.camera, inTheWay);
  return { idea: {
    idea_id: ideaId, session_id: input.sessionId, source: c.source, rule_id: c.ruleId, title: c.draft.title, why: c.draft.why, tools: c.draft.tools,
    plan, origin: { position: site.position, rotation_quat: site.rotation_quat }, twin_of: twinOf, score: (c.source === "rule" ? 100 : 50) + used.length,
  } };
}

const top3 = (list: BuildIdea[]) => {
  const seen = new Set<string>();
  return [...list].sort((a, b) => b.score - a.score).filter((i) => { const k = i.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 3);
};

/** Rule ideas go out as soon as they pass (final: false); the AI's join them in the final list. */
export async function computeIdeas(deps: IdeasDeps, input: IdeasInput, emit: (ideas: BuildIdea[], final: boolean) => void): Promise<BuildIdea[]> {
  const usable = input.twins.filter((t) => t.name !== "unknown" && t.confidence >= 0.5);
  const byId = new Map(usable.map((t) => [t.twin_id, t]));
  const surface = buildSurface(usable, input.surfaces);
  if (!surface || usable.length === 0) { emit([], true); return []; }
  const ruleIdeas = matchRules(deps.rules, usable)
    .map((m) => check({ draft: m.draft, source: "rule", ruleId: m.rule.rule_id, payload: m.payload }, byId, surface, input, deps))
    .flatMap((r) => ("idea" in r ? [r.idea] : []));
  if (ruleIdeas.length) emit(top3(ruleIdeas), false);
  let aiIdeas: BuildIdea[] = [];
  if (deps.cfg.openaiKey) {
    try { aiIdeas = await invent(deps, input, usable, byId, surface, ruleIdeas.map((i) => i.title)); }
    catch (err) { deps.log.warn({ err: (err as Error).message }, "AI build ideas failed; offering rule ideas only"); }
  }
  const all = top3([...ruleIdeas, ...aiIdeas]);
  emit(all, true);
  return all;
}

async function invent(deps: IdeasDeps, input: IdeasInput, usable: Twin[], byId: Map<string, Twin>, surface: Surface, offered: string[]): Promise<BuildIdea[]> {
  const canon = canonical(usable), cachePath = join(deps.cacheDir, `${canon.key}.json`);
  const text = inventoryText(usable, input.surfaces)
    + (offered.length ? `\nAlready offered, do not repeat: ${offered.join(", ")}.` : "")
    + (input.request ? `\nThe builder asked: "${input.request}".` : "");
  const ask = async (t: string, photo: Buffer | null) => Out.parse(await deps.call(deps.cfg, {
    name: "build_ideas", model: deps.model, schema: Out, strictSchema: OutStrict, system: SYSTEM, text: t, timeoutMs: deps.timeoutMs,
    images: photo ? [{ data: photo, mime: "image/jpeg" as const }] : [],
  }));
  const cached = !input.request && existsSync(cachePath)
    ? (JSON.parse(readFileSync(cachePath, "utf8")) as { drafts: IdeaDraft[] }).drafts.map((d) => remap(d, canon.fromCanon)).filter((d): d is IdeaDraft => d !== null)
    : null;
  const drafts = cached ?? (await ask(text, input.photo)).ideas;
  const ai = (draft: IdeaDraft) => check({ draft, source: "ai", ruleId: null, payload: null }, byId, surface, input, deps);
  const ok: { draft: IdeaDraft; idea: BuildIdea }[] = [], failed: { draft: IdeaDraft; reason: string }[] = [];
  for (const draft of drafts) { const r = ai(draft); if ("idea" in r) ok.push({ draft, idea: r.idea }); else failed.push({ draft, reason: r.reason }); }
  if (!cached && failed.length) {
    const fix = `${text}\n\nThese designs failed a check. Fix each one and return only the fixed designs:\n${failed.map((f) => `- ${JSON.stringify(f.draft)}\n  failed because ${f.reason}`).join("\n")}`;
    for (const draft of (await ask(fix, null)).ideas) { const r = ai(draft); if ("idea" in r) ok.push({ draft, idea: r.idea }); }
  }
  if (!cached && ok.length) writeJsonAtomic(cachePath, { drafts: ok.map((o) => remap(o.draft, canon.toCanon)).filter(Boolean) });
  return ok.map((o) => o.idea);
}

const NUM = ["no", "a", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const list = (w: string[]) => (w.length <= 1 ? w.join("") : `${w.slice(0, -1).join(", ")} and ${w.at(-1)}`);

/** What the voice says when the final ideas arrive. */
export function summary(twins: Twin[], ideas: Pick<BuildIdea, "title">[]): string {
  const counts = new Map<string, number>();
  for (const t of twins) if (t.name !== "unknown") counts.set(t.label, (counts.get(t.label) ?? 0) + 1);
  const found = list([...counts.entries()].map(([label, n]) => (n === 1 ? `a ${label}` : `${NUM[n] ?? n} ${label}s`)));
  if (!found) return "I couldn't make out any objects. Try looking from a little closer.";
  if (!ideas.length) return `I found ${found}, but nothing I tried stands up. Add something flat to go on top, or three things the same height.`;
  return `I found ${found}. You could build ${list(ideas.map((i) => `a ${i.title.toLowerCase()}`))}.`;
}
