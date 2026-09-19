import { useCallback, useEffect, useState } from "react";
import { ApiError, describeError, getAnalytics, postIssueWebhook, type AnalyticsName, type AnalyticsTable } from "../api";

const TABLES: { name: AnalyticsName; title: string; blurb: string }[] = [
  { name: "step_durations", title: "Step durations", blurb: "Median seconds per step across runs" },
  { name: "runs_compared", title: "Runs compared", blurb: "Total time per run" },
  { name: "sources_breakdown", title: "Where events came from", blurb: "Events counted by source" },
];

type Loaded = { status: "loading" } | { status: "ok"; table: AnalyticsTable } | { status: "error"; message: string };

function friendly(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 0) return "The server is not reachable right now.";
    if (e.status === 404) return "This query is not set up on the server yet.";
    if (e.status >= 500) return `Elastic did not answer this query (${e.message}). The build data on disk is unaffected.`;
  }
  return describeError(e);
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return "–";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function AnalyticsCard({ title, blurb, data }: { title: string; blurb: string; data: Loaded }) {
  return (
    <section className="card">
      <h2>{title} <span className="muted small">{blurb}</span></h2>
      {data.status === "loading" && <p className="muted">Loading…</p>}
      {data.status === "error" && <p className="amber">{data.message}</p>}
      {data.status === "ok" && data.table.rows.length === 0 && <p className="muted">No rows yet.</p>}
      {data.status === "ok" && data.table.rows.length > 0 && (
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                {data.table.columns.map((c, i) => (
                  <th key={i} title={c.type} className={/^(double|float|half_float|scaled_float|long|integer|short|byte|unsigned_long)$/.test(c.type) ? "num" : undefined}>{c.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.table.rows.map((row, r) => (
                <tr key={r}>
                  {(Array.isArray(row) ? row : [row]).map((v, i) => (
                    <td key={i} className={typeof v === "number" ? "num mono" : undefined}>{cell(v)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function ElasticTab({ assemblyId, firstPartId }: { assemblyId: string | null; firstPartId: string | null }) {
  const [data, setData] = useState<Record<AnalyticsName, Loaded>>({
    step_durations: { status: "loading" }, runs_compared: { status: "loading" }, sources_breakdown: { status: "loading" },
  });
  const [issue, setIssue] = useState<{ status: "idle" | "busy" | "ok" | "error"; message?: string }>({ status: "idle" });

  const load = useCallback(() => {
    let alive = true;
    for (const { name } of TABLES) {
      setData((d) => ({ ...d, [name]: { status: "loading" } }));
      getAnalytics(name, assemblyId ?? undefined).then(
        (table) => { if (alive) setData((d) => ({ ...d, [name]: { status: "ok", table } })); },
        (e) => { if (alive) setData((d) => ({ ...d, [name]: { status: "error", message: friendly(e) } })); },
      );
    }
    return () => { alive = false; };
  }, [assemblyId]);

  useEffect(() => load(), [load]);

  const runIssueTest = async () => {
    if (!firstPartId) return;
    const issue_id = `issue_test_${Date.now()}`;
    setIssue({ status: "busy" });
    try {
      await postIssueWebhook({ issue_id, part_id: firstPartId, note: "Test issue from the Director page" });
      setIssue({ status: "ok", message: `Posted ${issue_id}. A toast should appear here and a badge on the headset.` });
    } catch (e) {
      setIssue({ status: "error", message: describeError(e) });
    }
  };

  return (
    <div className="elastic-tab">
      <section className="card">
        <div className="row wrap">
          <button type="button" onClick={() => load()}>Refresh tables</button>
          <button type="button" disabled={!firstPartId || issue.status === "busy"} onClick={() => void runIssueTest()}>
            {issue.status === "busy" ? "Posting…" : "Run log_issue test"}
          </button>
          <span className="muted small">
            {assemblyId ? <>Run <span className="mono">{assemblyId}</span></> : "No run loaded: queries cover all runs."}
            {!firstPartId && " The test needs a loaded plan (it uses the first part)."}
          </span>
        </div>
        {issue.status === "ok" && <p className="ok-text small">{issue.message}</p>}
        {issue.status === "error" && <p className="error-text">{issue.message}</p>}
        <p className="muted small">
          The test posts straight to this server's issue webhook (the same call the Elastic Workflow makes); it does not run the Workflow itself.
        </p>
      </section>
      {TABLES.map((t) => <AnalyticsCard key={t.name} title={t.title} blurb={t.blurb} data={data[t.name]} />)}
    </div>
  );
}
