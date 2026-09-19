import type { IdeaDraft, Twin } from "@cutonce/schemas";
import type { Payload, Rule } from "./data.js";

const best = (a: Twin, b: Twin) => b.confidence - a.confidence || a.distance_m - b.distance_m || a.twin_id.localeCompare(b.twin_id);

/** Every rule the pile can make, with its role slots ("can#2") bound to twin ids. Most confident, nearest objects first. */
export function matchRules(rules: Rule[], twins: Twin[]): { rule: Rule; draft: IdeaDraft; payload: Payload | null }[] {
  const out: { rule: Rule; draft: IdeaDraft; payload: Payload | null }[] = [];
  for (const rule of rules) {
    const used = new Set<string>(), binding = new Map<string, string>();
    let ok = true;
    for (const role of rule.roles) {
      const pool = twins.filter((t) => role.any_of.includes(t.name) && !used.has(t.twin_id)).sort(best);
      let pick: Twin[] = [];
      if (role.same_name) {
        for (const name of role.any_of) { const same = pool.filter((t) => t.name === name); if (same.length >= role.count) { pick = same.slice(0, role.count); break; } }
      } else pick = pool.slice(0, role.count);
      if (pick.length < role.count) { ok = false; break; }
      pick.forEach((t, k) => { used.add(t.twin_id); binding.set(`${role.role}#${k + 1}`, t.twin_id); });
    }
    if (!ok) continue;
    const id = (ref: string) => binding.get(ref) ?? ref;
    const steps = rule.steps.map((s) => ({ ...s, place: id(s.place), on: s.on.map(id), next_to: s.next_to ? id(s.next_to) : null }));
    out.push({ rule, payload: rule.payload, draft: { title: rule.title, why: rule.why, tools: rule.tools, uses: [...used], steps } });
  }
  return out;
}
