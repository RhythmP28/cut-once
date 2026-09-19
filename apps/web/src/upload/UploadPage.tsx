import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import type { Job } from "@cutonce/schemas";
import { PROJECT_ID, describeError, getJob, uploadDocument, type UploadResult } from "../api";
import { StageList } from "./StageList";

const POLL_MS = 1000;
const TERMINAL: Job["status"][] = ["needs_review", "approved", "failed"];

type Phase =
  | { name: "idle" }
  | { name: "uploading"; file: File; fraction: number }
  | { name: "done"; file: File; result: UploadResult }
  | { name: "error"; message: string };

const reviewLink = (planId: string, revision?: number) =>
  `/review/${encodeURIComponent(planId)}${revision ? `?rev=${revision}` : ""}`;

function fileSize(bytes: number): string {
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} kB`;
}

export function UploadPage() {
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [dragging, setDragging] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<(() => void) | null>(null);

  useEffect(() => () => abortRef.current?.(), []);

  const start = useCallback((file: File) => {
    abortRef.current?.();
    setJob(null);
    setJobError(null);
    setPhase({ name: "uploading", file, fraction: 0 });
    const { promise, abort } = uploadDocument(PROJECT_ID, file, (fraction) =>
      setPhase((p) => (p.name === "uploading" && p.file === file ? { ...p, fraction } : p)),
    );
    abortRef.current = abort;
    promise.then(
      (result) => { abortRef.current = null; setPhase({ name: "done", file, result }); },
      (e) => { abortRef.current = null; setPhase({ name: "error", message: describeError(e) }); },
    );
  }, []);

  // Poll the job once a second until it settles. Each request waits for the previous one.
  const jobId = phase.name === "done" ? phase.result.job_id ?? null : null;
  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    let timer: number | undefined;
    const poll = async () => {
      let settled = false;
      try {
        const j = await getJob(jobId);
        if (!alive) return;
        setJob(j);
        setJobError(null);
        settled = TERMINAL.includes(j.status);
      } catch (e) {
        if (!alive) return;
        setJobError(describeError(e));
      }
      if (alive && !settled) timer = window.setTimeout(() => void poll(), POLL_MS);
    };
    void poll();
    return () => { alive = false; window.clearTimeout(timer); };
  }, [jobId]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && phase.name !== "uploading") start(file);
  };

  const result = phase.name === "done" ? phase.result : null;
  const known = result?.known_plan_id ? { planId: result.known_plan_id, revision: result.revision } : null;
  const uploading = phase.name === "uploading";

  return (
    <main className="page upload">
      <h1>Upload a drawing</h1>

      <div
        className={`dropzone${dragging ? " dragging" : ""}${uploading ? " busy" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !uploading) { e.preventDefault(); inputRef.current?.click(); } }}
        role="button" tabIndex={0} aria-label="Choose a file to upload"
      >
        <input
          ref={inputRef} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.csv,application/pdf,image/*,text/csv"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) start(f); }}
        />
        <p className="dropzone-title">Drop a PDF, image or CSV here</p>
        <p className="muted">or click to choose a file · 25 MB limit · project <span className="mono">{PROJECT_ID}</span></p>
      </div>

      {phase.name === "uploading" && (
        <section className="card">
          <h2>{phase.file.name} <span className="muted small">{fileSize(phase.file.size)}</span></h2>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(phase.fraction * 100)}>
            <div className="progress-fill" style={{ width: `${phase.fraction * 100}%` }} />
          </div>
          <div className="row">
            <span>{phase.fraction >= 1 ? "Sent. Waiting for the server to answer…" : `Uploading ${Math.round(phase.fraction * 100)}%`}</span>
            <button type="button" className="ghost small" onClick={() => abortRef.current?.()}>Cancel</button>
          </div>
        </section>
      )}

      {phase.name === "error" && <p className="banner error-text">Upload failed: {phase.message}</p>}

      {phase.name === "done" && result && (
        <>
          {known ? (
            <section className="card known">
              <div className="known-title">Matches approved revision {known.revision ?? "?"}</div>
              <p>This file was processed and reviewed earlier; the stages below are from that run.</p>
              <Link className="button primary" to={reviewLink(known.planId, known.revision)}>Open the reviewed plan</Link>
            </section>
          ) : (
            <section className="card">
              <h2>{phase.file.name} <span className="muted small">{fileSize(phase.file.size)} · uploaded</span></h2>
              <p className="muted">Document <span className="mono">{result.document_id}</span>{result.job_id ? <> · job <span className="mono">{result.job_id}</span></> : null}</p>
            </section>
          )}

          <section className="card">
            <h2>
              {known ? "Stages from the earlier run" : "Processing stages"}
              {job && <span className={`pill pill-${job.status}`}>{job.status.replace("_", " ")}</span>}
            </h2>
            {!result.job_id && <p className="muted">The server returned no job for this file, so there are no stages to show.</p>}
            {result.job_id && !job && !jobError && <p className="muted">Asking the server for the job…</p>}
            {jobError && <p className="amber">Could not read the job ({jobError}). Still trying once a second.</p>}
            {job && <StageList stages={job.stages} />}

            {job && !known && job.status === "needs_review" && (
              job.plan_id
                ? <p><Link className="button primary" to={reviewLink(job.plan_id, job.revision)}>Review the extracted plan</Link></p>
                : <p className="amber">The job is ready for review but did not name a plan.</p>
            )}
            {job && !known && job.status === "approved" && job.plan_id && (
              <p><Link className="button" to={reviewLink(job.plan_id, job.revision)}>Open the approved plan</Link></p>
            )}
            {job?.status === "failed" && <p className="error-text">Processing failed. The stage marked failed says where.</p>}
            {job?.issues && job.issues.length > 0 && (
              <p className="muted small">{job.issues.filter((i) => i.severity === "error").length} errors and {job.issues.filter((i) => i.severity === "warning").length} warnings from the plan checker. The review page lists them.</p>
            )}
          </section>

          <p><button type="button" className="ghost" onClick={() => { setPhase({ name: "idle" }); setJob(null); setJobError(null); }}>Upload another file</button></p>
        </>
      )}
    </main>
  );
}
