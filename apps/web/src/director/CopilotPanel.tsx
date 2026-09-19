// Owner: Rhythm (Copilot)
//
// Minimal working version: shows the latest `copilot_turn` from the live stream. The turn arrives as
// an untyped record (the stream schema is `z.record(z.unknown())`), so every field is read defensively.
// Still to come from the owner: retrieved sources, projected boxes on the frame, playing the answer audio.
import { useState } from "react";
import { ms } from "../format";
import { useStream } from "../ws";

type Turn = Record<string, unknown>;

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

function timings(v: unknown): [string, number][] {
  if (!v || typeof v !== "object" || Array.isArray(v)) return [];
  return Object.entries(v as Record<string, unknown>).filter((e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1]));
}

interface Ref { title: string; document_id: string | null; page: number | null; sheet_id: string | null }
function drawingRefs(v: unknown): Ref[] {
  if (!Array.isArray(v)) return [];
  const out: Ref[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const document_id = text(r.document_id);
    const page = typeof r.page === "number" ? r.page : null;
    out.push({ title: text(r.title) ?? document_id ?? "Untitled reference", document_id, page, sheet_id: text(r.sheet_id) });
  }
  return out;
}

export function CopilotPanel() {
  const [turn, setTurn] = useState<Turn | null>(null);
  const [receivedAt, setReceivedAt] = useState<Date | null>(null);

  useStream((msg) => {
    if (msg.type !== "copilot_turn") return;
    setTurn(msg.turn);
    setReceivedAt(new Date());
  });

  if (!turn) {
    return (
      <section className="card copilot">
        <h2>Copilot</h2>
        <p className="muted">Waiting for the first question from the headset.</p>
      </section>
    );
  }

  const transcript = text(turn.transcript);
  const answer = text(turn.answer_text);
  const rows = timings(turn.timings_ms);
  const hasTotal = rows.some(([k]) => k === "total");
  const total = rows.reduce((sum, [, v]) => sum + v, 0);
  const refs = drawingRefs(turn.drawing_refs);

  return (
    <section className="card copilot">
      <h2>
        Copilot
        <span className="muted small">
          {" "}{text(turn.turn_id) ?? ""}{turn.cached === true ? " · cached answer" : ""}
          {receivedAt ? ` · ${receivedAt.toLocaleTimeString([], { hour12: false })}` : ""}
        </span>
      </h2>
      <div className="label">Heard</div>
      <p className="copilot-transcript">{transcript ?? <span className="muted">(no transcript in this turn)</span>}</p>
      <div className="label">Answer</div>
      <p className="copilot-answer">{answer ?? <span className="muted">(no answer text in this turn)</span>}</p>

      {rows.length > 0 && (
        <table className="data compact">
          <thead><tr><th>Stage</th><th className="num">Time</th></tr></thead>
          <tbody>
            {rows.map(([k, v]) => <tr key={k}><td>{k}</td><td className="num mono">{ms(v)}</td></tr>)}
            {!hasTotal && rows.length > 1 && <tr className="total"><td>sum of stages</td><td className="num mono">{ms(total)}</td></tr>}
          </tbody>
        </table>
      )}

      {refs.length > 0 && (
        <>
          <div className="label">Drawing references</div>
          <ul className="refs">
            {refs.map((r, i) => (
              <li key={i}>
                {r.title}
                <span className="muted small">
                  {" "}{[r.document_id, r.sheet_id, r.page !== null ? `page ${r.page}` : null].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
