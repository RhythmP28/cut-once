import type { ValidationIssue } from "@cutonce/schemas";

interface Props {
  issues: ValidationIssue[];
  active: number | null;
  onPick: (index: number | null) => void;
  partName: (partId: string) => string;
}

/** Plan-checker findings. Errors are red and block approval; warnings are amber. Click one to light up its parts. */
export function IssuesList({ issues, active, onPick, partName }: Props) {
  if (issues.length === 0) return <p className="ok-text">The plan checker found nothing.</p>;
  const ordered = issues.map((issue, index) => ({ issue, index })).sort((a, b) => (a.issue.severity === b.issue.severity ? 0 : a.issue.severity === "error" ? -1 : 1));
  return (
    <ul className="issues">
      {ordered.map(({ issue, index }) => (
        <li key={index}>
          <button
            type="button"
            className={`issue issue-${issue.severity}${active === index ? " active" : ""}`}
            aria-pressed={active === index}
            onClick={() => onPick(active === index ? null : index)}
          >
            <span className="issue-code">{issue.code} · {issue.severity}</span>
            <span className="issue-message">{issue.message}</span>
            {issue.part_ids.length > 0 && <span className="issue-parts">{issue.part_ids.map(partName).join(", ")}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
