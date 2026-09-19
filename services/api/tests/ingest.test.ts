import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plan } from "@cutonce/schemas";
import { REPO_ROOT } from "../src/config.js";
import { matchMaterial, parseCsv, readBom } from "../src/ingest/bom.js";
import { chunkItems, chunkPage } from "../src/ingest/chunk.js";
import { linkParts } from "../src/ingest/link.js";

const desk = JSON.parse(readFileSync(join(REPO_ROOT, "data/fixtures/plan_desk_archetype.json"), "utf8")) as Plan;
const para = (n: number, ch = "a") => `${ch.repeat(n - 1)}.`;

describe("chunkPage", () => {
  it("merges short paragraphs", () => expect(chunkPage("doc_x", 1, [para(200), para(200), para(200)].join("\n\n"))).toHaveLength(1));
  it("splits a long paragraph at sentence ends, never past 900 characters", () => {
    const text = Array.from({ length: 20 }, (_, i) => `Sentence number ${i} has some words in it to fill up the space nicely and then it ends.`).join(" ");
    const chunks = chunkPage("doc_x", 2, text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.text.length <= 900 && /\.$/.test(c.text))).toBe(true);
  });
  it("gives deterministic ids", () => {
    const text = [para(500), para(500, "b")].join("\n\n");
    expect(chunkPage("doc_desk_manual", 4, text).map((c) => c.chunk_id)).toEqual(["chunk_desk_manual_p4_1", "chunk_desk_manual_p4_2"]);
    expect(chunkPage("doc_desk_manual", 4, text)).toEqual(chunkPage("doc_desk_manual", 4, text));
  });
  it("chunks transcribed items one by one and drops empty ones", () =>
    expect(chunkItems("doc_site_note", 1, [{ title: "Note", text: "clips every 20 cm" }, { title: "", text: "  " }]).map((c) => c.chunk_id)).toEqual(["chunk_site_note_p1_1"]));
});

describe("linkParts", () => {
  it("links through an alias", () => expect(linkParts("Screw the rear left leg into the plate", desk.parts)).toContain("part_left_rear_leg"));
  it("respects word boundaries", () => expect(linkParts("a legendary tabletopper", desk.parts)).toEqual([]));
  it("accepts a plural", () => expect(linkParts("Fit both cable trays", desk.parts)).toContain("part_cable_tray"));
  it("links several parts", () => expect(linkParts("Run the power cable through the cable tray", desk.parts).sort()).toEqual(["part_cable_tray", "part_power_cable"]));
});

describe("parts list", () => {
  const csv = 'line,item,qty,unit,spec,notes\n1,"Leg Ø40 700mm BLK",4,ea,"Steel, M8 stud","c/w plate, see manual p.4"\n2,Cable clip 8mm,4,ea,adhesive,\n';
  it("reads quoted CSV", () => expect(parseCsv(csv)[0]).toMatchObject({ item: "Leg Ø40 700mm BLK", notes: "c/w plate, see manual p.4" }));
  it("matches supplier wording to a material", () => expect(matchMaterial("Leg Ø40 700mm BLK Steel M8 stud", desk.materials)).toBe("mat_leg_700"));
  it("returns null when nothing fits", () => expect(matchMaterial("Banana", desk.materials)).toBeNull());
  it("makes one chunk per row with its material", () => {
    const { rows, chunks } = readBom("doc_desk_bom", csv, desk.materials);
    expect(rows).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ chunk_id: "chunk_desk_bom_p1_1", material_ids: ["mat_leg_700"] });
    expect(chunks[1]!.material_ids).toEqual(["mat_cable_clip"]);
  });
});
