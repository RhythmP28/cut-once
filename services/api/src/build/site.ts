import type { Surface, Vec3 } from "@cutonce/schemas";
import { onSurface } from "./twins.js";

type P2 = [number, number];
export interface Box2 { min: P2; max: P2 }

/**
 * Where the design's frame sits in the room. Its +Z (the front) turns toward the viewer; it goes to the right or
 * left of the pile, then in front of it, wherever it fits on the surface with 2 cm to spare. If nothing fits it goes
 * on the pile itself: those objects are about to move anyway. A spot where something else stands (an object the
 * design does not use) is skipped while a clear one exists: a hologram drawn through the sponsor's box is no guide.
 * A turn θ about +Y takes design +X to (cos θ, -sin θ) and +Z to (sin θ, cos θ) in the room's (x, z).
 */
export function chooseSite(surface: Surface, pile: Box2, design: { w: number; d: number }, camera: Vec3, obstacles: Box2[] = []):
  { position: Vec3; rotation_quat: [number, number, number, number]; yaw_deg: number } {
  const pc: P2 = [(pile.min[0] + pile.max[0]) / 2, (pile.min[1] + pile.max[1]) / 2];
  const theta = Math.atan2(camera[0] - pc[0], camera[2] - pc[1]);
  const right: P2 = [Math.cos(theta), -Math.sin(theta)], toward: P2 = [Math.sin(theta), Math.cos(theta)];
  const corners: P2[] = [[pile.min[0], pile.min[1]], [pile.max[0], pile.min[1]], [pile.max[0], pile.max[1]], [pile.min[0], pile.max[1]]];
  const reach = (dir: P2) => Math.max(...corners.map((c) => Math.abs((c[0] - pc[0]) * dir[0] + (c[1] - pc[1]) * dir[1])));
  const at = (dir: P2, k: number): P2 => [pc[0] + dir[0] * k, pc[1] + dir[1] * k];
  const gap = 0.05;
  const candidates: P2[] = [
    at(right, reach(right) + design.w / 2 + gap), at(right, -(reach(right) + design.w / 2 + gap)),
    at(toward, reach(toward) + design.d / 2 + gap), pc,
  ];
  const fits = (c: P2) => ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as P2[]).every(([sx, sz]) => {
    const x = c[0] + right[0] * sx * (design.w / 2) + toward[0] * sz * (design.d / 2);
    const z = c[1] + right[1] * sx * (design.w / 2) + toward[1] * sz * (design.d / 2);
    return onSurface(surface, x, z, -0.02);                 // in the table's own frame: its box along the room's axes has corners the table lacks
  });
  // The turned design's outer bound along the room's axes, against each obstacle's box.
  const reachX = (Math.abs(right[0]) * design.w + Math.abs(toward[0]) * design.d) / 2;
  const reachZ = (Math.abs(right[1]) * design.w + Math.abs(toward[1]) * design.d) / 2;
  const clear = (c: P2) => obstacles.every((o) => c[0] + reachX <= o.min[0] || c[0] - reachX >= o.max[0] || c[1] + reachZ <= o.min[1] || c[1] - reachZ >= o.max[1]);
  const c = candidates.find((q) => fits(q) && clear(q)) ?? candidates.find(fits) ?? pc;
  return { position: [c[0], surface.y, c[1]], rotation_quat: [0, Math.sin(theta / 2), 0, Math.cos(theta / 2)], yaw_deg: (theta * 180) / Math.PI };
}
