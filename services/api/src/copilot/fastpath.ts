import type { BuildEvent, BuildState, CopilotAction, Part, PartState, Plan } from "@cutonce/schemas";

export interface FastPathInput {
  plan: Plan; state: BuildState; selectedPartId: string | null; recentEvents: BuildEvent[];
}
export interface FastPath { action: CopilotAction; answer_text: string; highlight_parts: string[] }

/** Lower case, no punctuation, single spaces. "Mark the left rear leg, built." → "mark the left rear leg built". */
export const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const STOP = new Set(["the", "a", "an", "this", "that", "it", "my", "is", "as", "please", "now"]);
const words = (s: string) => normalise(s).split(" ").filter((w) => w && !STOP.has(w));

/**
 * Finds the one part a phrase names, by name or alias. Scores by how many of the part's own words
 * the phrase contains, so "left rear leg" beats "leg". Returns null when nothing matches or when
 * two parts tie: a wrong guess writes a wrong event, and falling through to the model is cheap.
 */
export function resolvePart(phrase: string, parts: Part[]): Part | null {
  const said = new Set(words(phrase));
  if (said.size === 0) return null;
  let best: { part: Part; score: number } | null = null;
  let tied = false;
  for (const part of parts) {
    let score = 0;
    for (const label of [part.name, ...part.aliases]) {
      const own = words(label);
      if (own.length === 0 || !own.every((w) => said.has(w))) continue;
      score = Math.max(score, own.length);
    }
    if (score === 0) continue;
    if (!best || score > best.score) { best = { part, score }; tied = false; }
    else if (score === best.score && part.part_id !== best.part.part_id) tied = true;
  }
  return best && !tied ? best.part : null;
}

const STATE_WORDS: Record<string, PartState> = { built: "built", done: "built", in: "built", wrong: "wrong", missing: "missing", out: "missing" };

const markState = (partId: string, newState: PartState): CopilotAction =>
  ({ type: "mark_state", part_ids: [partId], new_state: newState, source: "voice" });

/**
 * Section 10's fast path: a spoken command skips the model entirely and answers in under 1.5 s.
 * Everything here is decided from the plan and the event log, never from a guess — anything
 * uncertain returns null and takes the full pipeline instead.
 */
export function matchFastPath(transcript: string, input: FastPathInput): FastPath | null {
  const text = normalise(transcript);
  const { plan, state, selectedPartId, recentEvents } = input;
  const nameOf = (id: string) => plan.parts.find((p) => p.part_id === id)?.name ?? id;

  // "next" / "back": pure headset navigation, no event.
  if (/^(next|next step|go next|carry on)$/.test(text)) return { action: { type: "step_nav", direction: "next" }, answer_text: "Next step.", highlight_parts: [] };
  if (/^(back|go back|previous|previous step|last step)$/.test(text)) return { action: { type: "step_nav", direction: "back" }, answer_text: "Going back a step.", highlight_parts: [] };

  // "undo": reverse the most recent part_state change. Expressed as a normal mark_state so the
  // log stays append-only — an undo is a new event, never a deletion.
  if (/^(undo|undo that|undo it|take that back)$/.test(text)) {
    const last = [...recentEvents].reverse().find((e) => e.kind === "part_state" && e.part_id && e.previous_state && e.new_state);
    if (!last?.part_id || !last.previous_state) return null;
    return {
      action: markState(last.part_id, last.previous_state),
      answer_text: `Undone. The ${nameOf(last.part_id)} is back to ${last.previous_state}.`,
      highlight_parts: [last.part_id],
    };
  }

  // "done" / "mark it built": the part you are pointing at.
  if (/^(done|its done|thats done|mark (it|this) (built|done)|built)$/.test(text)) {
    if (!selectedPartId) return null; // nothing selected: let the model ask which part
    if (state.parts[selectedPartId]?.state === "built") return null; // no_op; the full pipeline explains why
    return { action: markState(selectedPartId, "built"), answer_text: `Marked the ${nameOf(selectedPartId)} built.`, highlight_parts: [selectedPartId] };
  }

  // "mark <part> built | done | wrong".
  const marked = /^mark (?:the )?(.+?) (?:as )?(built|done|wrong|missing)$/.exec(text);
  if (marked) {
    const newState = STATE_WORDS[marked[2]!]!;
    const part = resolvePart(marked[1]!, plan.parts);
    if (!part) return null; // ambiguous or unknown: the model can ask
    if (state.parts[part.part_id]?.state === newState) return null;
    return { action: markState(part.part_id, newState), answer_text: `Marked the ${part.name} ${newState}.`, highlight_parts: [part.part_id] };
  }

  return null;
}
