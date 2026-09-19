import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { S, type TwinShape } from "@cutonce/schemas";

const Cm3 = z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]);

export const VocabItem = z.object({
  name: z.string().regex(/^[a-z0-9_]+$/), label: z.string().min(1), shape: z.enum(["box", "cylinder"]),
  size_cm: Cm3.nullable(), diameter_cm: z.number().positive().nullable(), height_cm: z.number().positive().nullable(),
  material: S.TwinMaterial, load_bearing: z.boolean(), cuttable: z.boolean(), density_kg_m3: z.number().positive(),
});
const Vocabulary = z.object({ version: z.literal(1), items: z.array(VocabItem).min(1) });

export const Payload = z.object({ label: z.string(), size_cm: Cm3, kg: z.number().positive() });
const Role = z.object({ role: z.string().regex(/^[a-z_]+$/), any_of: z.array(z.string()).min(1), count: z.number().int().min(1), same_name: z.boolean() });
export const Rule = z.object({
  rule_id: z.string().regex(/^rule_[a-z0-9_]+$/), title: z.string().min(1), why: z.string(), tools: z.array(z.string()),
  roles: z.array(Role).min(1), steps: z.array(S.PlaceStep).min(1), payload: Payload.nullable(),
});
const Rules = z.object({ version: z.literal(1), rules: z.array(Rule) });

export type VocabItem = z.infer<typeof VocabItem>;
export type Vocab = Map<string, VocabItem>;
export type Rule = z.infer<typeof Rule>;
export type Payload = z.infer<typeof Payload>;

const read = (repoRoot: string, file: string) => JSON.parse(readFileSync(join(repoRoot, "data", "build", file), "utf8"));

export function loadVocab(repoRoot: string): Vocab {
  const v = Vocabulary.parse(read(repoRoot, "vocabulary.json"));
  return new Map(v.items.map((i) => [i.name, i]));
}

/** Rules must name only vocabulary objects, and their steps only roles they declare ("can#2" needs count ≥ 2). */
export function loadRules(repoRoot: string, vocab: Vocab): Rule[] {
  const { rules } = Rules.parse(read(repoRoot, "rules.json"));
  for (const rule of rules) {
    const slots = new Set(rule.roles.flatMap((r) => Array.from({ length: r.count }, (_, k) => `${r.role}#${k + 1}`)));
    for (const role of rule.roles) for (const n of role.any_of) {
      if (!vocab.has(n)) throw new Error(`${rule.rule_id}: role ${role.role} names ${n}, which is not in vocabulary.json`);
    }
    for (const s of rule.steps) for (const ref of [s.place, ...s.on, ...(s.next_to ? [s.next_to] : [])]) {
      if (!slots.has(ref)) throw new Error(`${rule.rule_id}: step names ${ref}, which no role declares`);
    }
  }
  return rules;
}

/** The standard size in metres (boxes largest side first, in no particular orientation; cylinders standing), or null when it varies. */
export function standardShape(item: VocabItem): TwinShape | null {
  const m = (cm: number) => Math.round(cm * 10) / 1000;   // 6.6 cm → exactly the double 0.066
  if (item.shape === "cylinder") {
    return item.diameter_cm && item.height_cm ? { type: "cylinder", axis: "y", diameter: m(item.diameter_cm), length: m(item.height_cm) } : null;
  }
  if (!item.size_cm) return null;
  const [a, b, c] = [...item.size_cm].sort((x, y) => y - x) as [number, number, number];
  return { type: "box", size: [m(a), m(b), m(c)] };
}
