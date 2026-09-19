/**
 * Builds the shared fixtures in data/fixtures. The plans and event lists are written by hand below;
 * each case's `expected` state comes from fold(), and tests/fixtures.test.ts pins the key facts
 * independently (counts, percentages, current step), so a reducer bug cannot hide inside a generated file.
 * Run: pnpm gen:fixtures
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Strict, type BuildEvent, type DocRef, type Part, type Plan } from "@cutonce/schemas";
import { fold } from "../src/fold.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "data", "fixtures");
mkdirSync(join(root, "events_to_state"), { recursive: true });
const write = (rel: string, value: unknown) => writeFileSync(join(root, rel), JSON.stringify(value, null, 2) + "\n");

const frame = (pose: string, origin: string) => ({ handedness: "right", up: "+Y", units: "m", pose, origin }) as const;
const drawings = (sheet: string, page: number): DocRef => ({ document_id: "doc_desk_drawings", sheet_id: sheet, page });
const manual = (page: number): DocRef => ({ document_id: "doc_desk_manual", page });

// ── plan_asymmetric: the mirror test. If part_plus_x shows on the wrong side in Unity, toUnity() has the wrong sign.
const cube = (id: string, name: string, position: [number, number, number], step: string, restsOn: string[]): Part => ({
  part_id: id, name, aliases: [], kind: "cube", layer: "structure", shape: { type: "box", size: [0.1, 0.1, 0.1] }, position,
  material_id: "mat_test_cube", step_id: step, rests_on: restsOn, attaches_to: [], verify_hint: "test cube", install_minutes: 1, doc_refs: [],
});
const asymmetric: Plan = {
  plan_id: "plan_asymmetric", project_id: "proj_cutonce_demo", name: "Mirror test (L shape)", revision: 1, status: "approved",
  frame: frame("upright", "centre of the origin cube"), layers: ["structure"],
  parts: [
    cube("part_origin", "Origin cube", [0, 0, 0], "step_01", []),
    cube("part_plus_x", "Plus X cube", [0.1, 0, 0], "step_02", ["part_origin"]),
    cube("part_plus_z", "Plus Z cube", [0, 0, 0.1], "step_03", ["part_origin"]),
  ],
  materials: [{ material_id: "mat_test_cube", name: "Test cube", spec: "100 mm cube", unit: "each", quantity: 3, used_by: ["part_origin", "part_plus_x", "part_plus_z"], doc_refs: [] }],
  steps: [
    { step_id: "step_01", index: 1, title: "Place the origin cube", instruction: "Place it.", part_ids: ["part_origin"], requires: [], layer: "structure", est_minutes: 1, materials: [], doc_refs: [] },
    { step_id: "step_02", index: 2, title: "Add the +X cube", instruction: "Place it on the +X side.", part_ids: ["part_plus_x"], requires: ["step_01"], layer: "structure", est_minutes: 1, materials: [], doc_refs: [] },
    { step_id: "step_03", index: 3, title: "Add the +Z cube", instruction: "Place it on the +Z side.", part_ids: ["part_plus_z"], requires: ["step_01"], layer: "structure", est_minutes: 1, materials: [], doc_refs: [] },
  ],
  markers: [], touch_points: [],
  provenance: { source_document_ids: [], extracted_by: "hand", approved_by: "fixture", assumptions: [], validation: [] },
};

// ── plan_desk_archetype: the nine-part desk with archetype numbers. data/demo/desk.plan.json replaces them with measured ones.
const leg = (id: string, name: string, aliases: string[], x: number, z: number, step: string, page: number): Part => ({
  part_id: id, name, aliases, kind: "leg", layer: "structure", shape: { type: "cylinder", axis: "y", diameter: 0.04, length: 0.7 },
  position: [x, 0.35, z], material_id: "mat_leg_700", step_id: step, rests_on: ["part_tabletop"],
  attaches_to: [{ part_id: "part_tabletop", relation: "on", via_material_id: "mat_mount_plate" }],
  verify_hint: "black steel tube, 40 mm wide, 70 cm long, standing upright on the panel", install_minutes: 1, doc_refs: [manual(page), drawings("sheet_a1", 1)],
});
const parts: Part[] = [
  { part_id: "part_tabletop", name: "Tabletop", aliases: ["top", "desktop", "table top"], kind: "panel", layer: "structure",
    shape: { type: "box", size: [1.0, 0.034, 0.6] }, position: [0.5, -0.017, 0.3], material_id: "mat_top_1000x600", step_id: "step_01",
    rests_on: [], attaches_to: [], verify_hint: "white rectangular panel lying flat, underside facing up", install_minutes: 1, doc_refs: [drawings("sheet_a1", 1)] },
  leg("part_left_front_leg", "Left front leg", ["front left leg"], 0.07, 0.53, "step_02", 4),
  leg("part_right_front_leg", "Right front leg", ["front right leg"], 0.93, 0.53, "step_03", 4),
  leg("part_left_rear_leg", "Left rear leg", ["rear left leg", "back left leg"], 0.07, 0.07, "step_04", 4),
  leg("part_right_rear_leg", "Right rear leg", ["rear right leg", "back right leg"], 0.93, 0.07, "step_05", 4),
  { part_id: "part_rear_crossbar", name: "Rear crossbar", aliases: ["crossbar", "stretcher", "rear brace"], kind: "crossbar", layer: "structure",
    shape: { type: "box", size: [0.82, 0.06, 0.018] }, position: [0.5, 0.45, 0.07], material_id: "mat_crossbar", step_id: "step_06",
    rests_on: ["part_left_rear_leg", "part_right_rear_leg"],
    attaches_to: [{ part_id: "part_left_rear_leg", relation: "on", via_material_id: "mat_crossbar_clamp" }, { part_id: "part_right_rear_leg", relation: "on", via_material_id: "mat_crossbar_clamp" }],
    verify_hint: "flat wooden bar spanning between the two rear legs", install_minutes: 2, doc_refs: [drawings("sheet_a1", 1)] },
  { part_id: "part_cable_tray", name: "Cable tray", aliases: ["tray", "cable basket"], kind: "tray", layer: "hardware",
    shape: { type: "box", size: [0.5, 0.08, 0.12] }, position: [0.5, 0.04, 0.16], material_id: "mat_cable_tray", step_id: "step_07",
    rests_on: ["part_tabletop"], attaches_to: [{ part_id: "part_tabletop", relation: "on", via_material_id: "mat_tray_screw" }],
    verify_hint: "metal wire tray fixed to the underside near the rear edge", install_minutes: 2, doc_refs: [drawings("sheet_e1", 2)] },
  { part_id: "part_power_strip", name: "Power strip", aliases: ["power bar", "extension strip"], kind: "power_strip", layer: "electrical",
    shape: { type: "box", size: [0.3, 0.04, 0.055] }, position: [0.5, 0.03, 0.16], material_id: "mat_power_strip", step_id: "step_08",
    rests_on: ["part_cable_tray"], attaches_to: [{ part_id: "part_cable_tray", relation: "inside" }],
    verify_hint: "white six-outlet power strip lying inside the tray", install_minutes: 1, doc_refs: [drawings("sheet_e1", 2)] },
  { part_id: "part_power_cable", name: "Power cable", aliases: ["cable", "cord", "power cord"], kind: "cable", layer: "electrical",
    shape: { type: "polyline", diameter: 0.008, points: [[0.65, 0.03, 0.16], [0.9, 0.03, 0.16], [0.93, 0.05, 0.094], [0.93, 0.7, 0.094]] },
    position: [0, 0, 0], material_id: "mat_power_cable_2m", step_id: "step_09", rests_on: ["part_power_strip", "part_right_rear_leg"],
    attaches_to: [{ part_id: "part_cable_tray", relation: "inside" }, { part_id: "part_right_rear_leg", relation: "along", via_material_id: "mat_cable_clip" }],
    verify_hint: "black cable clipped along the right rear leg", install_minutes: 2, doc_refs: [drawings("sheet_e1", 2)] },
];
const bom = (row: number): DocRef[] => [{ document_id: "doc_desk_bom", page: 1, chunk_id: `chunk_doc_desk_bom_p1_${row}` }];
const usedBy = (materialId: string) => parts.filter((p) => p.material_id === materialId).map((p) => p.part_id);
const mat = (material_id: string, name: string, spec: string, quantity: number, row: number) =>
  ({ material_id, name, spec, unit: "each", quantity, used_by: usedBy(material_id), doc_refs: bom(row) });
const titles: Record<string, [string, string]> = {
  part_tabletop: ["Lay the tabletop upside down", "Lay the tabletop on the floor with its underside facing up."],
  part_left_front_leg: ["Attach left front leg", "Screw the leg clockwise into the left front plate until hand-tight."],
  part_right_front_leg: ["Attach right front leg", "Screw the leg clockwise into the right front plate until hand-tight."],
  part_left_rear_leg: ["Attach left rear leg", "Screw the leg clockwise into the left rear plate until hand-tight."],
  part_right_rear_leg: ["Attach right rear leg", "Screw the leg clockwise into the right rear plate until hand-tight."],
  part_rear_crossbar: ["Clamp the rear crossbar", "Clamp the crossbar between the two rear legs, 45 cm from the tabletop."],
  part_cable_tray: ["Fix the cable tray", "Screw the tray to the underside, centred, 10 cm from the rear edge."],
  part_power_strip: ["Seat the power strip", "Lay the power strip inside the tray with its cable end to the right."],
  part_power_cable: ["Route the power cable", "Run the cable through the tray to the right rear leg, then clip it down the leg."],
};
const desk: Plan = {
  plan_id: "plan_desk_archetype", project_id: "proj_cutonce_demo", name: "Demo desk (archetype numbers)", revision: 1, status: "approved",
  frame: frame("assembly (upside down)", "underside corner A, far-left as the Operator stands"),
  overall_size: [1.0, 0.734, 0.6], layers: ["structure", "hardware", "electrical"], parts,
  materials: [
    mat("mat_top_1000x600", "Tabletop 1000 x 600", "1000 x 600 x 34 mm, white laminate", 1, 1),
    mat("mat_leg_700", "Steel leg 700 mm", "Ø40 x 700 mm, black, M8 stud", 4, 2),
    mat("mat_mount_plate", "Leg mounting plate", "Steel plate with M8 thread", 4, 3),
    mat("mat_plate_screw", "Plate screw", "4 x 16 mm wood screw", 20, 4),
    mat("mat_crossbar", "Rear crossbar", "820 x 60 x 18 mm pine", 1, 5),
    mat("mat_crossbar_clamp", "Crossbar clamp", "40 mm pipe clamp", 2, 6),
    mat("mat_cable_tray", "Cable tray", "500 x 120 x 80 mm wire tray", 1, 7),
    mat("mat_tray_screw", "Tray screw", "4 x 12 mm wood screw", 4, 8),
    mat("mat_power_strip", "Power strip", "6 outlet, 300 mm", 1, 9),
    mat("mat_power_cable_2m", "Power cable", "2 m, 3 x 1.5 mm2", 1, 10),
    mat("mat_cable_clip", "Cable clip", "8 mm adhesive clip", 4, 11),
  ],
  steps: [
    ...parts.map((p, i) => ({
      step_id: p.step_id, index: i + 1, title: titles[p.part_id]![0], instruction: titles[p.part_id]![1], part_ids: [p.part_id],
      requires: [...new Set(p.rests_on.map((id) => parts.find((q) => q.part_id === id)!.step_id))].sort(), layer: p.layer,
      est_minutes: p.install_minutes, materials: [{ material_id: p.material_id, qty: 1 }], doc_refs: p.doc_refs,
    })),
    { step_id: "step_10", index: 10, title: "Flip the desk upright", instruction: "With a helper, turn the desk onto its legs.", part_ids: [],
      requires: parts.map((p) => p.step_id), layer: "structure", est_minutes: 1, materials: [], doc_refs: [manual(6)] },
  ],
  markers: [
    { marker_id: "m1", payload: "co:desk:m1", size_m: 0.1, position: [0.2, 0, 0.53], normal: "+Y" },
    { marker_id: "m2", payload: "co:desk:m2", size_m: 0.1, position: [0.8, 0, 0.53], normal: "+Y" },
    { marker_id: "m3", payload: "co:desk:m3", size_m: 0.1, position: [0.19, 0, 0.08], normal: "+Y" },
  ],
  touch_points: [
    { point_id: "tp_c", name: "Near-left corner", position: [0, 0, 0.6] },
    { point_id: "tp_d", name: "Near-right corner", position: [1, 0, 0.6] },
  ],
  provenance: { source_document_ids: ["doc_desk_drawings", "doc_desk_manual", "doc_desk_bom"], extracted_by: "hand", approved_by: "fixture",
    assumptions: ["Archetype dimensions, not measured from a real desk"], validation: [] },
};

// ── events
const ASM = "asm_fixture_run";
const at = (n: number) => new Date(Date.parse("2026-09-20T13:00:00.000Z") + n * 60_000).toISOString();
const id = (n: number) => `evt_01J8ZK${"0".repeat(18)}${String(n).padStart(2, "0")}`;
const stepOf = (partId: string) => parts.find((p) => p.part_id === partId)!.step_id;
const state = (n: number, partId: string, from: "missing" | "built" | "wrong", to: "missing" | "built" | "wrong", source: BuildEvent["source"] = "manual"): BuildEvent => ({
  event_id: id(n), assembly_id: ASM, version: n, timestamp: at(n), client_timestamp: at(n), kind: "part_state", part_id: partId,
  previous_state: from, new_state: to, source, confidence: 1, actor: source === "seed" ? "seed" : "operator", step_id: stepOf(partId),
});
const seed = [state(1, "part_tabletop", "missing", "built", "seed"), state(2, "part_left_front_leg", "missing", "built", "seed"), state(3, "part_right_front_leg", "missing", "built", "seed")];
const lrBuilt = state(4, "part_left_rear_leg", "missing", "built");
const verification: BuildEvent = {
  event_id: id(5), assembly_id: ASM, version: 5, timestamp: at(5), client_timestamp: at(5), kind: "verification", part_id: "part_left_rear_leg",
  source: "camera_verification", confidence: 0.91, actor: "copilot", verdict: "present", verification_id: "ver_fixture_01",
};

const cases: Array<{ file: string; note: string; events: BuildEvent[]; up_to: number | null }> = [
  { file: "01_empty", note: "Nothing built", events: [], up_to: null },
  { file: "02_demo_start", note: "Seed: tabletop and both front legs", events: seed, up_to: null },
  { file: "03_build_next", note: "Seed, then the left rear leg", events: [...seed, lrBuilt], up_to: null },
  { file: "04_out_of_sequence", note: "Cable built before the strip it rests on", events: [...seed, state(4, "part_power_cable", "missing", "built")], up_to: null },
  { file: "05_undo", note: "Leg built, then removed", events: [...seed, lrBuilt, state(5, "part_left_rear_leg", "built", "missing")], up_to: null },
  { file: "06_no_op", note: "Tabletop marked built twice; the second event changes nothing", events: [...seed, state(4, "part_tabletop", "built", "built")], up_to: null },
  { file: "07_verification", note: "Camera check attaches a verdict and changes no state", events: [...seed, lrBuilt, verification], up_to: null },
  { file: "08_history_upto", note: "History view at version 2", events: [...seed, lrBuilt], up_to: 2 },
];

for (const plan of [asymmetric, desk]) Strict.Plan.parse(plan);
write("plan_asymmetric.json", asymmetric);
write("plan_desk_archetype.json", desk);
for (const c of cases) {
  for (const e of c.events) if (e.previous_state !== e.new_state) Strict.BuildEvent.parse(e);
  const expected = Strict.BuildState.parse(fold(desk, ASM, c.events, c.up_to));
  write(`events_to_state/${c.file}.json`, { note: c.note, plan: "plan_desk_archetype.json", assembly_id: ASM, events: c.events, up_to: c.up_to, expected });
}
console.log(`wrote 2 plans and ${cases.length} state cases to ${root}`);
