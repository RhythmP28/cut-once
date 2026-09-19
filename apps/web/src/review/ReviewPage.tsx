import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import type { Plan } from "@cutonce/schemas";
import { approvePlan, describeError, getPlan } from "../api";
import { PlanViewer } from "../three/PlanViewer";
import { IssuesList } from "./IssuesList";
import { PagePreview } from "./PagePreview";
import { PartsTable } from "./PartsTable";

const REVIEWER_KEY = "cutonce.approved_by";

function rememberedReviewer(): string {
  try {
    return window.localStorage.getItem(REVIEWER_KEY) ?? "";
  } catch {
    return "";
  }
}

export function ReviewPage() {
  const { planId = "" } = useParams();
  const [search] = useSearchParams();
  const revParam = search.get("rev");
  const revision = revParam && /^\d+$/.test(revParam) ? Number(revParam) : undefined;

  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeIssue, setActiveIssue] = useState<number | null>(null);
  const [pickedPart, setPickedPart] = useState<string | null>(null);
  const [reviewer, setReviewer] = useState(rememberedReviewer);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setPlan(null);
    setError(null);
    setActiveIssue(null);
    setPickedPart(null);
    setApproveError(null);
    getPlan(planId, revision).then(
      (p) => { if (alive) setPlan(p); },
      (e) => { if (alive) setError(describeError(e)); },
    );
    return () => { alive = false; };
  }, [planId, revision]);

  const issues = useMemo(() => plan?.provenance.validation ?? [], [plan]);
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.length - errorCount;
  const names = useMemo(() => new Map((plan?.parts ?? []).map((p) => [p.part_id, p.name])), [plan]);
  const partName = useCallback((id: string) => names.get(id) ?? id, [names]);

  const highlight = useMemo(() => {
    if (activeIssue !== null) return issues[activeIssue]?.part_ids ?? [];
    return pickedPart ? [pickedPart] : [];
  }, [activeIssue, issues, pickedPart]);

  // A row click toggles; a click in the 3D view selects what was hit (or clears on empty space).
  const togglePart = useCallback((id: string) => {
    setActiveIssue(null);
    setPickedPart((cur) => (cur === id ? null : id));
  }, []);
  const selectPart = useCallback((id: string | null) => {
    setActiveIssue(null);
    setPickedPart(id);
  }, []);

  const approve = async () => {
    if (!plan) return;
    setApproving(true);
    setApproveError(null);
    try {
      const by = reviewer.trim();
      const approved = await approvePlan(plan.plan_id, { revision: plan.revision, approved_by: by });
      try {
        window.localStorage.setItem(REVIEWER_KEY, by);
      } catch {
        // Only a convenience; ignore.
      }
      setPlan(approved);
    } catch (e) {
      setApproveError(describeError(e));
    } finally {
      setApproving(false);
    }
  };

  if (error) {
    return (
      <main className="page">
        <h1>Review</h1>
        <p className="banner error-text">Could not load <span className="mono">{planId}</span>{revision ? ` revision ${revision}` : ""}: {error}</p>
      </main>
    );
  }
  if (!plan) return <main className="page"><h1>Review</h1><p className="muted">Loading the plan…</p></main>;

  const isApproved = plan.status === "approved";
  const blocked = errorCount > 0;

  return (
    <main className="page review">
      <header className="review-head">
        <div>
          <h1>{plan.name}</h1>
          <p className="muted">
            <span className="mono">{plan.plan_id}</span> · revision {plan.revision} ·{" "}
            <span className={isApproved ? "ok-text" : "amber"}>{plan.status}</span>
            {plan.provenance.approved_by ? ` by ${plan.provenance.approved_by}` : ""} · extracted by {plan.provenance.extracted_by}
            {plan.overall_size ? ` · overall ${plan.overall_size.map((v) => Math.round(v * 1000)).join(" × ")} mm` : ""}
          </p>
        </div>
        <div className="approve">
          <input
            value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="approved by (your name)"
            aria-label="Approved by" disabled={isApproved || approving}
          />
          <button type="button" className="primary" disabled={isApproved || blocked || approving || !reviewer.trim()} onClick={() => void approve()}>
            {isApproved ? "Approved" : approving ? "Approving…" : "Approve"}
          </button>
          {blocked && !isApproved && <span className="error-text small">{errorCount} error{errorCount === 1 ? "" : "s"} must be fixed in the plan JSON first.</span>}
          {approveError && <span className="error-text small">{approveError}</span>}
        </div>
      </header>

      <div className="review-grid">
        <aside className="review-left">
          <h2>Source pages</h2>
          <PagePreview documentIds={plan.provenance.source_document_ids} />
        </aside>

        <section className="review-centre">
          <PlanViewer plan={plan} highlight={highlight} onSelect={selectPart} />
        </section>

        <aside className="review-right">
          <h2>Parts <span className="muted small">{plan.parts.length} · read-only</span></h2>
          <PartsTable plan={plan} highlight={highlight} onPick={togglePart} />

          <h2>Assumptions</h2>
          {plan.provenance.assumptions.length === 0
            ? <p className="muted">None recorded.</p>
            : <ul className="assumptions">{plan.provenance.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>}

          <h2>Checker issues <span className="muted small">{errorCount} errors · {warningCount} warnings</span></h2>
          <IssuesList issues={issues} active={activeIssue} onPick={(i) => { setPickedPart(null); setActiveIssue(i); }} partName={partName} />
        </aside>
      </div>
    </main>
  );
}
