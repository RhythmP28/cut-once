// Owner: Rhythm (Copilot)
//
// What the narrator and the safety net watch during the demo: what the copilot heard, what it said,
// where every millisecond went, which drawing it cited, and the frame it was looking at with the
// headset's projected boxes drawn on top.
//
// Turns arrive over the stream as an untyped record (the stream schema is `z.record(z.unknown())`),
// so every field is read defensively: a teammate adding a field must never blank this panel mid-demo.
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAnswerAudio, fetchLastFrame, getLastCapture, type LastCapture } from "../api";
import { ms } from "../format";
import { useStream } from "../ws";

type Turn = Record<string, unknown>;

/** Section 10's targets. Over the first, the turn felt slow; over the second, the cache should have fired. */
const TARGET_MS = 4000;
const CAP_MS = 9000;

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

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
    out.push({ title: text(r.title) ?? document_id ?? "Untitled reference", document_id, page: num(r.page), sheet_id: text(r.sheet_id) });
  }
  return out;
}

interface Box { part_id: string; state: string; bbox: [number, number, number, number] }
interface Projection { width: number; height: number; boxes: Box[] }
/** The projected boxes out of a CopilotContext, or null if the headset sent no camera intrinsics. */
function projection(context: unknown): Projection | null {
  if (!context || typeof context !== "object") return null;
  const c = context as Record<string, unknown>;
  const cam = c.camera as Record<string, unknown> | undefined;
  const width = num(cam?.width);
  const height = num(cam?.height);
  if (!width || !height || !Array.isArray(c.visible_parts)) return null;
  const boxes: Box[] = [];
  for (const item of c.visible_parts) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    const bbox = Array.isArray(v.bbox_px) ? v.bbox_px.filter((n): n is number => typeof n === "number") : [];
    if (bbox.length !== 4 || !text(v.part_id)) continue;
    boxes.push({ part_id: String(v.part_id), state: text(v.state) ?? "missing", bbox: bbox as [number, number, number, number] });
  }
  return { width, height, boxes };
}

const BOX_COLOUR: Record<string, string> = { missing: "#00e676", built: "#ffffff", wrong: "#ff4040" };

/** Plays the answer through the turn's WAV form (`?format=wav`), which any browser can decode. */
function useAnswerAudio() {
  const elRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "none">("idle");

  const play = useCallback(async (turnId: string) => {
    setState("loading");
    try {
      const url = await fetchAnswerAudio(`/v1/audio/${turnId}`);
      elRef.current ??= new Audio();
      const el = elRef.current;
      el.src = url;
      el.onended = () => { setState("idle"); URL.revokeObjectURL(url); };
      await el.play();
      setState("playing");
    } catch {
      setState("none"); // no TTS key, or the clip is still being generated: the text is on screen either way
    }
  }, []);

  return { play, state };
}

export function CopilotPanel() {
  const [turn, setTurn] = useState<Turn | null>(null);
  const [receivedAt, setReceivedAt] = useState<Date | null>(null);
  const [capture, setCapture] = useState<LastCapture | null>(null);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const { play, state: audioState } = useAnswerAudio();

  useStream((msg) => {
    if (msg.type !== "copilot_turn") return;
    setTurn(msg.turn);
    setReceivedAt(new Date());
  });

  // Every turn brings a new frame with it; fetch it once per turn rather than polling.
  useEffect(() => {
    if (!turn) return;
    const controller = new AbortController();
    let url: string | null = null;
    void (async () => {
      try {
        setCapture(await getLastCapture());
        url = await fetchLastFrame(controller.signal);
        if (url) setFrameUrl(url);
      } catch { /* the frame is a nice-to-have; the answer is what matters */ }
    })();
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [turn]);

  if (!turn) {
    return (
      <section className="card copilot">
        <h2>Copilot</h2>
        <p className="muted">Waiting for the first question from the headset.</p>
      </section>
    );
  }

  const turnId = text(turn.turn_id);
  const transcript = text(turn.transcript);
  const answer = text(turn.answer_text);
  const rows = timings(turn.timings_ms);
  const total = num((turn.timings_ms as Record<string, unknown> | undefined)?.total_to_response) ?? rows.reduce((s, [, v]) => s + v, 0);
  const refs = drawingRefs(turn.drawing_refs);
  const highlights = list(turn.highlight_parts);
  const confidence = num(turn.confidence);
  const proj = projection(capture?.context);
  const action = turn.action && typeof turn.action === "object" ? (turn.action as Record<string, unknown>) : null;

  return (
    <section className="card copilot">
      <h2>
        Copilot
        <span className="muted small">
          {" "}{turnId ?? ""}
          {receivedAt ? ` · ${receivedAt.toLocaleTimeString([], { hour12: false })}` : ""}
        </span>
      </h2>

      <div className="copilot-badges">
        {turn.cached === true && <span className="pill pill-running">cached answer</span>}
        {turn.needs_clarification === true && <span className="pill pill-needs_review">needs clarification</span>}
        {confidence !== null && <span className="pill">confidence {Math.round(confidence * 100)}%</span>}
        <span className={`pill ${total > CAP_MS ? "pill-failed" : total > TARGET_MS ? "pill-needs_review" : "pill-approved"}`}>{ms(total)}</span>
        {turnId && (
          <button className="link-card" onClick={() => void play(turnId)} disabled={audioState === "loading"}>
            {audioState === "loading" ? "loading…" : audioState === "playing" ? "playing" : audioState === "none" ? "no audio" : "play answer"}
          </button>
        )}
      </div>

      <div className="label">Heard</div>
      <p className="copilot-transcript">{transcript ?? <span className="muted">(no transcript in this turn)</span>}</p>
      <div className="label">Answer</div>
      <p className="copilot-answer">{answer ?? <span className="muted">(no answer text in this turn)</span>}</p>

      {action && (
        <p className="muted small">
          Action applied: <span className="mono">{String(action.type)}</span>
          {Array.isArray(action.part_ids) ? ` · ${(action.part_ids as string[]).join(", ")}` : ""}
          {text(action.new_state) ? ` → ${String(action.new_state)}` : ""}
          {text(action.direction) ? ` · ${String(action.direction)}` : ""}
        </p>
      )}

      {highlights.length > 0 && (
        <>
          <div className="label">Highlighted in the headset</div>
          <div className="copilot-badges">{highlights.map((p) => <span key={p} className="pill mono">{p}</span>)}</div>
        </>
      )}

      {frameUrl && (
        <>
          <div className="label">What it was looking at{capture?.note ? <span className="muted small"> · {capture.note}</span> : null}</div>
          <div className="copilot-frame">
            <img src={frameUrl} alt="the frame the copilot received" />
            {proj && (
              <svg viewBox={`0 0 ${proj.width} ${proj.height}`} preserveAspectRatio="none">
                {proj.boxes.map((b, i) => (
                  <g key={b.part_id}>
                    <rect x={b.bbox[0]} y={b.bbox[1]} width={b.bbox[2]} height={b.bbox[3]} fill="none"
                      stroke={highlights.includes(b.part_id) ? "#ffd400" : BOX_COLOUR[b.state] ?? "#58a6ff"}
                      strokeWidth={highlights.includes(b.part_id) ? 8 : 4} />
                    <text x={b.bbox[0] + 6} y={b.bbox[1] + 34} fontSize={28} fontFamily="monospace"
                      fill={highlights.includes(b.part_id) ? "#ffd400" : BOX_COLOUR[b.state] ?? "#58a6ff"}>
                      {i + 1} {b.part_id}
                    </text>
                  </g>
                ))}
              </svg>
            )}
          </div>
        </>
      )}

      {rows.length > 0 && (
        <table className="data compact">
          <thead><tr><th>Stage</th><th className="num">Time</th></tr></thead>
          <tbody>
            {rows.filter(([k]) => k !== "total_to_response").map(([k, v]) => <tr key={k}><td>{k}</td><td className="num mono">{ms(v)}</td></tr>)}
            <tr className="total"><td>total to response</td><td className="num mono">{ms(total)}</td></tr>
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
