import * as THREE from "three";
import type { Part } from "@cutonce/schemas";

/**
 * Turns one plan part into three.js objects. No DOM or WebGL is touched here, so it can be checked
 * in Node. Plans are right-handed, +Y up, in metres, which is exactly three.js's convention:
 * coordinates are used as they are. Nothing is flipped, mirrored or re-ordered.
 */

export type Look = "default" | "highlight" | "built" | "wrong";

export const LOOKS: Record<Look, { color: number; opacity: number; line: number }> = {
  default: { color: 0x4da3ff, opacity: 0.28, line: 0x9ccbff },
  highlight: { color: 0xffd84d, opacity: 0.85, line: 0xfff1a8 },
  built: { color: 0x3ddc84, opacity: 0.6, line: 0xa5f3c4 },
  wrong: { color: 0xff5252, opacity: 0.75, line: 0xffb3b3 },
};

export interface PartObject {
  partId: string;
  name: string;
  /** Add this to the scene. */
  root: THREE.Object3D;
  /** The surface the pointer can hit. */
  pick: THREE.Mesh;
  fill: THREE.MeshStandardMaterial;
  line: THREE.LineBasicMaterial;
  /** Mesh parts are drawn as a faint wireframe box, so their fill stays nearly invisible. */
  opacityScale: number;
}

const EDGE_THRESHOLD_DEG = 20;

function cylinderGeometry(axis: "x" | "y" | "z", diameter: number, length: number): THREE.BufferGeometry {
  // three's cylinder runs along +Y. Rotate the geometry so its long axis matches the plan's letter.
  const g = new THREE.CylinderGeometry(diameter / 2, diameter / 2, length, 32, 1, false);
  if (axis === "x") g.rotateZ(-Math.PI / 2); // +Y → +X
  else if (axis === "z") g.rotateX(Math.PI / 2); // +Y → +Z
  return g;
}

function polylineGeometry(points: [number, number, number][], diameter: number): THREE.BufferGeometry | null {
  // Straight runs between the points (a cable route), swept into a tube of radius diameter / 2.
  const path = new THREE.CurvePath<THREE.Vector3>();
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const a = new THREE.Vector3(...points[i - 1]!);
    const b = new THREE.Vector3(...points[i]!);
    if (a.distanceToSquared(b) < 1e-12) continue; // A repeated point would give a zero-length segment.
    path.add(new THREE.LineCurve3(a, b));
    length += a.distanceTo(b);
  }
  if (path.curves.length === 0) return null;
  const radius = diameter / 2;
  const segments = Math.min(600, Math.max(path.curves.length * 8, Math.ceil(length / Math.max(radius * 2, 0.005))));
  return new THREE.TubeGeometry(path, segments, radius, 12, false);
}

/** Returns null for shapes that cannot be drawn (a mesh with no bounds, or a degenerate polyline). */
export function buildPartObject(part: Part): PartObject | null {
  const s = part.shape;
  let geometry: THREE.BufferGeometry | null = null;
  let position = new THREE.Vector3(...part.position);
  let opacityScale = 1;

  if (s.type === "box") {
    geometry = new THREE.BoxGeometry(s.size[0], s.size[1], s.size[2]);
  } else if (s.type === "cylinder") {
    geometry = cylinderGeometry(s.axis, s.diameter, s.length);
  } else if (s.type === "polyline") {
    // Points are relative to the part's position: placing the tube at `position` adds it to every point.
    geometry = polylineGeometry(s.points, s.diameter);
  } else {
    // Mesh files are not loaded here. If the plan declares bounds (model space, as project-model's
    // partAabb reads them), draw them as a wireframe box; otherwise skip the part.
    if (!s.bounds) return null;
    const min = new THREE.Vector3(...s.bounds.min);
    const max = new THREE.Vector3(...s.bounds.max);
    const size = max.clone().sub(min);
    if (size.x <= 0 || size.y <= 0 || size.z <= 0) return null;
    geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    position = min.clone().add(max).multiplyScalar(0.5);
    opacityScale = 0.15;
  }
  if (!geometry) return null;

  const fill = new THREE.MeshStandardMaterial({
    color: LOOKS.default.color, transparent: true, opacity: LOOKS.default.opacity * opacityScale,
    depthWrite: false, side: THREE.DoubleSide, roughness: 0.65, metalness: 0,
  });
  const line = new THREE.LineBasicMaterial({ color: LOOKS.default.line, transparent: true, opacity: 0.95 });

  const pick = new THREE.Mesh(geometry, fill);
  pick.position.copy(position);
  // rotation_quat is read as [x, y, z, w] (glTF order). Mesh bounds are already axis-aligned.
  if (part.rotation_quat && s.type !== "mesh") {
    const [x, y, z, w] = part.rotation_quat;
    const q = new THREE.Quaternion(x, y, z, w);
    if (q.lengthSq() > 1e-9) pick.quaternion.copy(q.normalize());
  }
  pick.userData.partId = part.part_id;
  pick.name = part.part_id;

  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, EDGE_THRESHOLD_DEG), line);
  edges.raycast = () => {}; // Lines are decoration; only the surface is pickable.
  pick.add(edges);

  return { partId: part.part_id, name: part.name, root: pick, pick, fill, line, opacityScale };
}

export function applyLook(obj: PartObject, look: Look): void {
  const l = LOOKS[look];
  obj.fill.color.setHex(l.color);
  obj.fill.opacity = l.opacity * (look === "default" ? obj.opacityScale : Math.max(obj.opacityScale, 0.5));
  obj.line.color.setHex(l.line);
  obj.pick.renderOrder = look === "default" ? 0 : 1;
}

/** Free the GPU buffers and materials under `root`. */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as Partial<THREE.Mesh> & THREE.Object3D;
    m.geometry?.dispose();
    const material = m.material;
    const list = Array.isArray(material) ? material : material ? [material] : [];
    for (const mat of list) {
      const map = (mat as THREE.Material & { map?: THREE.Texture | null }).map;
      map?.dispose();
      mat.dispose();
    }
  });
}
