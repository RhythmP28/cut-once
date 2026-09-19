/** "Left rear leg" → "part_left_rear_leg". Adds _2, _3… when the id is already taken. */
export function toPartId(name: string, existing: ReadonlySet<string> = new Set()): string {
  const slug = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "part";
  const base = `part_${slug}`;
  if (!existing.has(base)) return base;
  for (let n = 2; ; n++) if (!existing.has(`${base}_${n}`)) return `${base}_${n}`;
}

export const toMaterialId = (name: string, existing: ReadonlySet<string> = new Set()): string =>
  toPartId(name, new Set([...existing].map((id) => id.replace(/^mat_/, "part_")))).replace(/^part_/, "mat_");
