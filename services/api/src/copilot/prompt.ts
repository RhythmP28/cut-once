import type { RetrievedChunk } from "@cutonce/schemas";
import type { LegendRow } from "./annotate.js";
import type { Gathered } from "./context.js";
import { stepSummary } from "./context.js";

/**
 * Section 10's prompt contract. Every rule here exists because breaking it loses the demo:
 * long answers overrun the 5-minute slot, invented part names cannot be highlighted, invented
 * dimensions are the exact failure Cut Once claims to prevent.
 */
export const SYSTEM = [
  "You are Cut Once, a construction copilot speaking to someone wearing a headset while they build.",
  "",
  "Rules, in order of importance:",
  "1. Answer in at most two short spoken sentences. It is read aloud, so no lists, no markdown, no part ids in the speech.",
  "2. Refer to parts only by ids from the PARTS IN VIEW or PLAN PARTS tables. Never invent a part id.",
  "3. Cite only the chunk ids given under DOCUMENTS. If none of them answers the question, say you have no drawing for it.",
  "4. BUILD STATE is the truth about what is installed. If it says a part is missing, never say it is built.",
  "5. Never invent a dimension, a material or a quantity. If it is not in the tables or the documents, say you do not have it.",
  "6. If the question is ambiguous or you cannot see enough, say so in the answer and set needs_clarification to true.",
  "",
  "You get two images: the first is the headset's camera frame with numbered boxes drawn on the parts the",
  "headset can see (the numbers map to part ids in PARTS IN VIEW), the second is the same frame unmarked.",
  "Use the marked one to work out which part someone is pointing at or holding; use the unmarked one to judge",
  "what is physically there.",
  "",
  "highlight_parts is what lights up in the headset: list every part your answer is about, in the order you mean them.",
  "Use highlight_style \"path\" when the parts form a route (a cable run, a sequence) and \"pulse\" otherwise.",
].join("\n");

const trim = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

function partsInView(legend: LegendRow[], g: Gathered): string {
  if (legend.length === 0) return "PARTS IN VIEW: none — the headset could not project any part into this frame.";
  const rows = legend.map((l) => {
    const part = g.plan.parts.find((p) => p.part_id === l.part_id);
    const bits = [`[${l.n}]`, l.part_id, part?.name ?? "unknown part", `state=${l.state}`,
      `${l.distance_m.toFixed(2)} m away`, `${Math.round(l.in_frame * 100)}% in frame`];
    return `  ${bits.join(" · ")}`;
  });
  return `PARTS IN VIEW (the numbers are drawn on the first image):\n${rows.join("\n")}`;
}

function planParts(g: Gathered): string {
  const rows = g.plan.parts.map((p) => {
    const st = g.state.parts[p.part_id]?.state ?? "missing";
    const size = p.shape.type === "box" ? `${p.shape.size.map((m) => Math.round(m * 1000)).join("×")} mm`
      : p.shape.type === "cylinder" ? `⌀${Math.round(p.shape.diameter * 1000)} × ${Math.round(p.shape.length * 1000)} mm`
      : p.shape.type;
    return `  ${p.part_id} · ${p.name} · layer=${p.layer} · ${size} · step=${p.step_id} · ${st}`;
  });
  return `PLAN PARTS (${g.plan.name}, revision ${g.plan.revision}):\n${rows.join("\n")}`;
}

function selected(g: Gathered): string {
  if (!g.selected) return "POINTED AT: nothing — no part is under the controller ray.";
  const p = g.selected;
  const st = g.state.parts[p.part_id]?.state ?? "missing";
  const lines = [
    `POINTED AT: ${p.part_id} · ${p.name} (${st})`,
    `  aliases: ${p.aliases.join(", ") || "none"}`,
    `  rests on: ${p.rests_on.join(", ") || "nothing"}`,
    `  attaches to: ${p.attaches_to.map((a) => `${a.part_id} (${a.relation})`).join(", ") || "nothing"}`,
    `  how to check it: ${p.verify_hint}`,
  ];
  if (g.material) lines.push(`  material: ${g.material.name} — ${g.material.spec} (${g.material.quantity} ${g.material.unit})`);
  return lines.join("\n");
}

function buildState(g: Gathered): string {
  const p = g.state.progress;
  const missing = Object.entries(g.state.parts).filter(([, s]) => s.state === "missing").map(([id]) => id);
  return [
    `BUILD STATE: ${p.built} of ${p.total} parts built (${p.pct}%), about ${Math.round(p.minutes_left)} minutes left, version ${g.state.version}.`,
    `  current step: ${stepSummary(g.step)}`,
    `  next step: ${stepSummary(g.nextStep)}`,
    `  still missing: ${missing.join(", ") || "nothing"}`,
    `  ready to install now: ${g.state.available_part_ids.join(", ") || "nothing"}`,
    `  blocked until something else goes in: ${g.state.blocked_part_ids.join(", ") || "nothing"}`,
  ].join("\n");
}

function recent(g: Gathered): string {
  if (g.recentEvents.length === 0) return "RECENT EVENTS: none yet.";
  const rows = g.recentEvents.map((e) => `  ${e.timestamp} · ${e.kind} · ${e.part_id ?? "-"} · ${e.previous_state ?? "-"}→${e.new_state ?? "-"} · by ${e.actor} (${e.source})`);
  return `RECENT EVENTS (oldest first):\n${rows.join("\n")}`;
}

function documents(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "DOCUMENTS: nothing came back from search. Say you have no drawing for this.";
  const rows = chunks.map((c) => `  ${c.chunk_id} · ${c.title} · ${c.document_id}${c.sheet_id ? ` · ${c.sheet_id}` : ""} · page ${c.page}\n    ${trim(c.text.replace(/\s+/g, " "), 700)}`);
  return `DOCUMENTS (the only passages you may cite):\n${rows.join("\n")}`;
}

function history(turns: { transcript: string; answer_text: string }[]): string {
  if (turns.length === 0) return "";
  return `\nEARLIER IN THIS CONVERSATION (oldest first, so follow-ups like "and after that?" make sense):\n${turns.map((t) => `  they asked: ${t.transcript}\n  you said: ${t.answer_text}`).join("\n")}\n`;
}

export interface PromptInput {
  transcript: string; gathered: Gathered; legend: LegendRow[]; chunks: RetrievedChunk[];
  mode: "upload" | "overlay"; turns: { transcript: string; answer_text: string }[];
}

export function userText(input: PromptInput): string {
  const { transcript, gathered: g } = input;
  const stale = g.staleBy > 0 ? `\nNOTE: the headset's picture is ${g.staleBy} versions behind the server. BUILD STATE below is the current one.\n` : "";
  return [
    `MODE: ${input.mode} (${input.mode === "overlay" ? "building onto something already part-built" : "building from the drawings"})`,
    stale,
    partsInView(input.legend, g),
    "",
    selected(g),
    "",
    buildState(g),
    "",
    planParts(g),
    "",
    recent(g),
    "",
    documents(input.chunks),
    history(input.turns),
    "",
    `THEY ASKED: "${transcript}"`,
  ].join("\n");
}
