import type { BuildScan, Twin } from "@cutonce/schemas";
import type { Config } from "../config.js";
import type { Vocab } from "./data.js";
import { labelTwins } from "./label.js";
import type { Truth } from "./score.js";
import { CAMERA, KIT, renderPhoto, synthScan, type Prim } from "./synth.js";
import { buildTwins, decodeScan } from "./twins.js";

export const SYNTHETIC_KIT = "synthetic_kit";

/** What each of KIT's primitives is, and the colour it is drawn in. Null: not an object (the floor, the table). */
const KIT_KEY: { name: string | null; size_cm: number[]; colour: [number, number, number] }[] = [
  { name: null, size_cm: [], colour: [122, 126, 132] },
  { name: null, size_cm: [], colour: [181, 137, 96] },
  { name: "pizza_box", size_cm: [35, 35, 4], colour: [214, 178, 120] },
  { name: "tall_can", size_cm: [15.7, 6.6, 6.6], colour: [200, 44, 52] },
  { name: "tall_can", size_cm: [15.7, 6.6, 6.6], colour: [60, 120, 200] },
  { name: "tall_can", size_cm: [15.7, 6.6, 6.6], colour: [228, 228, 232] },
];

const centre = (p: Prim): [number, number] =>
  p.kind === "cyl" ? [p.x, p.z] : p.kind === "box" ? [(p.min[0] + p.max[0]) / 2, (p.min[2] + p.max[2]) / 2] : [p.centre[0], p.centre[2]];

/**
 * The synthetic recording of the demo kit: the scan the headset would upload (with a depth sensor's noise), a drawing of
 * the scene as its photo, the names a vision model that made no mistakes would give, and the tape-measure truth.
 * Deterministic, so regenerating it changes nothing. The names go through the real labelTwins with a stand-in model
 * that answers from the scene, so labels.json is exactly what the server would have saved.
 */
export async function syntheticKitRecording(cfg: Config, vocab: Vocab): Promise<{ scan: BuildScan; photo: Buffer; labels: Twin[]; truth: Truth }> {
  const scan: BuildScan = { ...synthScan(KIT, CAMERA.cam, CAMERA.lookAt, { sigmaFrac: 0.005, seed: 7 }), scan_id: `scan_rec_${SYNTHETIC_KIT}` };
  const photo = renderPhoto(KIT, KIT_KEY.map((k) => k.colour), CAMERA.cam, CAMERA.lookAt);
  const cloud = decodeScan(scan), built = buildTwins(cloud, scan.scan_id);

  const whatIs = (t: Twin) => {
    const near = KIT.map((p, i) => ({ key: KIT_KEY[i]!, d: Math.hypot(centre(p)[0] - t.position[0], centre(p)[1] - t.position[2]) }))
      .filter((c) => c.key.name).sort((a, b) => a.d - b.d)[0];
    return near && near.d < 0.1 ? near.key.name : null;
  };
  // labelTwins numbers the nearest first; the stand-in model answers for each number from the scene itself.
  const numbered = built.twins.filter((t) => t.bbox_px).sort((a, b) => a.distance_m - b.distance_m);
  const perfectModel = async () => ({
    objects: numbered.map((t, i) => {
      const item = vocab.get(whatIs(t) ?? "");
      return item
        ? { n: i + 1, is_object: true, name: item.name, other_name: null, count: 1, material: item.material, load_bearing: item.load_bearing, cuttable: item.cuttable, confidence: 0.9, shape: item.shape ?? t.shape.type }
        : { n: i + 1, is_object: false, name: "other", other_name: null, count: 1, material: "other", load_bearing: false, cuttable: false, confidence: 0.9, shape: t.shape.type };
    }),
    missed: [],
  });
  const labels = await labelTwins({ cfg: { ...cfg, openaiKey: "synthetic" }, call: perfectModel, model: "synthetic", vocab, timeoutMs: 1000 }, photo, built.twins, built.surfaces, cloud);
  const truth: Truth = { objects: KIT_KEY.filter((k) => k.name).map((k) => ({ name: k.name!, size_cm: k.size_cm })) };
  return { scan, photo, labels, truth };
}
