import { useCallback, useEffect, useState } from "react";
import type { BuildIdea, Twin } from "@cutonce/schemas";
import {
  addBuildObject, describeError, getBuildCurrent, getBuildVocabulary, listBuildScans, newBuildSession, replayBuildScan, startBuildIdea,
  type BuildScanRow, type BuildVocabItem,
} from "../api";
import { shapeSize } from "../format";
import { useStream } from "../ws";

const SCANS_SHOWN = 12;
/** Where a design came from, in the words the presenter needs: only "live" may be called live on stage. */
const MADE: Record<string, string> = { live: "live", cache: "from rehearsal", rule: "offline rule" };

/** Build mode from the laptop: every live fallback in the demo (replay, add a missed object, pick an idea) is one click. */
export function BuildPanel() {
  const [twins, setTwins] = useState<Twin[]>([]);
  const [ideas, setIdeas] = useState<BuildIdea[]>([]);
  const [wish, setWish] = useState<string | null>(null);
  const [scans, setScans] = useState<BuildScanRow[]>([]);
  const [vocab, setVocab] = useState<BuildVocabItem[]>([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [cur, list, v] = await Promise.all([getBuildCurrent(), listBuildScans(), getBuildVocabulary()]);
      const addable = v.items.filter((i) => i.standard);        // an object with no standard size cannot be placed by hand
      setTwins(cur.twins); setIdeas(cur.ideas); setWish(cur.wish ?? null); setScans(list.scans); setVocab(addable);
      setPick((p) => p || addable[0]?.name || "");
      setError(null);
    } catch (e) { setError(describeError(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // The server streams every step of a scan, so the panel follows the headset (or a replay) live.
  useStream((msg) => {
    if (msg.type === "build_inventory") { setTwins(msg.inventory.twins); if (msg.inventory.message) setStatus(msg.inventory.message); }
    if (msg.type === "build_ideas") {
      setIdeas(msg.ideas);
      if (msg.message) setStatus(msg.message);
      // The wish is not on the stream: ask for it when a list is final (a rethink or a spoken wish may have changed it).
      if (msg.final) getBuildCurrent().then((cur) => setWish(cur.wish ?? null), () => {});
    }
  });

  const run = (label: string, work: () => Promise<unknown>) => async () => {
    setBusy(true); setError(null); setStatus(`${label}…`);
    try { await work(); setStatus(`${label}: done`); await load(); }
    catch (e) { setStatus(""); setError(`${label}: ${describeError(e)}`); }
    finally { setBusy(false); }
  };

  return (
    <BuildPanelView
      twins={twins} ideas={ideas} wish={wish} scans={scans} vocab={vocab} pick={pick} busy={busy} status={status} error={error}
      onPick={setPick}
      onStart={(i) => void run(`start ${i.title}`, () => startBuildIdea(i.idea_id))()}
      onAdd={() => void run("add object", () => addBuildObject(pick))()}
      onReplay={(scanId, labels) => void run(labels === "saved" ? "replay" : "replay with new names", () => replayBuildScan(scanId, labels))()}
      onNewSession={() => void run("new session", () => newBuildSession())()}
    />
  );
}

export interface BuildPanelViewProps {
  twins: Twin[]; ideas: BuildIdea[]; wish: string | null; scans: BuildScanRow[]; vocab: BuildVocabItem[]; pick: string; busy: boolean; status: string; error: string | null;
  onPick: (name: string) => void; onStart: (idea: BuildIdea) => void; onAdd: () => void;
  onReplay: (scanId: string, labels: "saved" | "live") => void; onNewSession: () => void;
}

/** What the panel shows, with no state of its own: the test renders it with a session's data. */
export function BuildPanelView({ twins, ideas, wish, scans, vocab, pick, busy, status, error, onPick, onStart, onAdd, onReplay, onNewSession }: BuildPanelViewProps) {
  return (
    <section className="card">
      <h2>Build mode</h2>

      <h3>Objects ({twins.length})</h3>
      {twins.length === 0 && <p className="muted small">Nothing scanned yet. Press X on the headset, say "what can I build", or replay a scan below.</p>}
      <ul className="client-list">
        {twins.map((t) => (
          <li key={t.twin_id}>
            <span className="client-kind">{t.twin_id}</span>
            <span>{t.label}</span>
            <span className="muted small">{shapeSize(t.shape)}{t.snapped ? "" : " (measured)"}</span>
          </li>
        ))}
      </ul>

      <h3>Ideas</h3>
      {wish && <p className="muted small">Asked for: {wish}</p>}
      {ideas.length === 0 && <p className="muted small">No ideas yet.</p>}
      <ul className="client-list">
        {ideas.map((i) => (
          <li key={i.idea_id} title={i.why}>
            <span className="client-kind">{(i.made && MADE[i.made]) || i.source}</span>
            <span>{i.title}</span>
            <span className="muted small">{i.plan.steps.length - 1} pieces</span>
            <button type="button" className="small" disabled={busy} onClick={() => onStart(i)}>Start</button>
          </li>
        ))}
      </ul>

      <h3>Add a missed object</h3>
      <div className="row wrap">
        <select value={pick} onChange={(e) => onPick(e.target.value)} aria-label="Object to add">
          {vocab.map((v) => <option key={v.name} value={v.name}>{v.label}</option>)}
        </select>
        <button type="button" disabled={!pick || busy} onClick={onAdd}>Add</button>
      </div>

      <h3>Scans</h3>
      {scans.length === 0 && <p className="muted small">No scans yet.</p>}
      <ul className="client-list">
        {scans.slice(0, SCANS_SHOWN).map((s) => (
          <li key={s.scan_id}>
            <span className="client-kind">{s.recording ? "recording" : "live"}</span>
            <span className="run-id">{s.scan_id}</span>
            <button type="button" className="small" disabled={busy} title="Replay with the names it was saved with: no model, the same every time" onClick={() => onReplay(s.scan_id, "saved")}>Replay</button>
            <button type="button" className="small" disabled={busy} title="Replay, asking the vision model for names again" onClick={() => onReplay(s.scan_id, "live")}>New names</button>
          </li>
        ))}
      </ul>
      {scans.length > SCANS_SHOWN && <p className="muted small">Showing the newest {SCANS_SHOWN} of {scans.length}.</p>}

      <div className="row wrap">
        <button type="button" disabled={busy} onClick={onNewSession}>New session</button>
        {status && !error && <span className="muted small">{status}</span>}
        {error && <span className="error-text">{error}</span>}
      </div>
    </section>
  );
}
