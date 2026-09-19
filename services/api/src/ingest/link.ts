const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Which parts a piece of text is about: a whole-word, case-insensitive match on each part's name and aliases. */
export function linkParts(text: string, parts: readonly { part_id: string; name: string; aliases: string[] }[]): string[] {
  const hits: string[] = [];
  for (const p of parts) {
    const names = [p.name, ...p.aliases].filter((n) => n.trim().length >= 3).map((n) => escape(n.trim()).replace(/\s+/g, "\\s+"));
    if (names.length && new RegExp(`\\b(?:${names.join("|")})s?\\b`, "i").test(text)) hits.push(p.part_id);
  }
  return hits;
}
