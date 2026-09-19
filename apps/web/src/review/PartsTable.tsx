import { useMemo } from "react";
import type { Part, Plan } from "@cutonce/schemas";

const mm = (metres: number) => String(Math.round(metres * 1000));

/** Size in millimetres, in the plan's own axis order (x × y × z). */
export function sizeMm(part: Part): string {
  const s = part.shape;
  if (s.type === "box") return `${mm(s.size[0])} × ${mm(s.size[1])} × ${mm(s.size[2])}`;
  if (s.type === "cylinder") return `Ø${mm(s.diameter)} × ${mm(s.length)} along ${s.axis}`;
  if (s.type === "polyline") {
    let length = 0;
    for (let i = 1; i < s.points.length; i++) {
      const a = s.points[i - 1]!, b = s.points[i]!;
      length += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    return `Ø${mm(s.diameter)} × ${mm(length)} long`;
  }
  if (s.bounds) {
    const { min, max } = s.bounds;
    return `${mm(max[0] - min[0])} × ${mm(max[1] - min[1])} × ${mm(max[2] - min[2])} (bounds)`;
  }
  return "–";
}

interface Props {
  plan: Plan;
  highlight: string[];
  onPick: (partId: string) => void;
}

export function PartsTable({ plan, highlight, onPick }: Props) {
  const materials = useMemo(() => new Map(plan.materials.map((m) => [m.material_id, m.name])), [plan]);
  const steps = useMemo(() => new Map(plan.steps.map((s) => [s.step_id, s.index])), [plan]);
  const lit = new Set(highlight);

  return (
    <div className="table-scroll">
      <table className="data parts">
        <thead>
          <tr><th>Part</th><th>Shape</th><th>Size (mm)</th><th>Material</th><th className="num">Step</th></tr>
        </thead>
        <tbody>
          {plan.parts.map((p) => (
            <tr key={p.part_id} className={lit.has(p.part_id) ? "row-highlight" : undefined} onClick={() => onPick(p.part_id)} title={p.part_id}>
              <td>{p.name}</td>
              <td>{p.shape.type}</td>
              <td className="mono">{sizeMm(p)}</td>
              <td>{materials.get(p.material_id) ?? p.material_id}</td>
              <td className="num">{steps.get(p.step_id) ?? p.step_id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
