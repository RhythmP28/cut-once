import type { JobStage } from "@cutonce/schemas";
import { ms } from "../format";

const ICON: Record<JobStage["status"], string> = { pending: "○", running: "", done: "✓", failed: "✕", skipped: "–" };

/** The stages exactly as the server reports them: no invented progress, no estimated times. */
export function StageList({ stages }: { stages: JobStage[] }) {
  if (stages.length === 0) return <p className="muted">The server has not reported any stages yet.</p>;
  return (
    <ol className="stages">
      {stages.map((s, i) => (
        <li key={`${i}:${s.name}`} className={`stage stage-${s.status}`}>
          <span className="stage-icon" aria-hidden="true">{s.status === "running" ? <span className="spinner" /> : ICON[s.status]}</span>
          <span className="stage-name">{s.name.replace(/_/g, " ")}</span>
          <span className="stage-status">{s.status}</span>
          <span className="stage-ms mono">{typeof s.ms === "number" ? ms(s.ms) : ""}</span>
          {s.detail && <span className="stage-detail muted">{s.detail}</span>}
        </li>
      ))}
    </ol>
  );
}
