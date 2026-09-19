import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { VisualStyle } from "@cutonce/project-model";

/**
 * Three.js materials for one part, driven entirely by a VisualStyle from @cutonce/project-model.
 * Nothing here chooses a colour: change the look in HOLOGRAM_PALETTE, never in this file.
 */
export interface PartMaterials { fill: THREE.MeshBasicMaterial; edge: LineMaterial; style: VisualStyle }

/** Diagnostic overlay for `compare=` (a second plan drawn as thin outlines). Not a headset state, so not in the palette. */
export const COMPARE_OUTLINE = { color: "#FFFFFF", opacity: 0.55, widthPx: 1.25 } as const;

/**
 * A fat-line material that shares one resolution vector with every other line in the view, so a resize
 * updates them all at once. Line widths are in CSS pixels.
 */
export function lineMaterial(resolution: THREE.Vector2): LineMaterial {
  const m = new LineMaterial({ transparent: true, depthWrite: false });
  m.uniforms.resolution!.value = resolution;
  return m;
}

export function makeMaterials(style: VisualStyle, resolution: THREE.Vector2): PartMaterials {
  const fill = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const m: PartMaterials = { fill, edge: lineMaterial(resolution), style };
  applyStyle(m, style);
  return m;
}

export function applyStyle(m: PartMaterials, style: VisualStyle): void {
  m.style = style;
  m.fill.color.set(style.fill);
  m.fill.opacity = style.fillAlpha;
  m.fill.visible = style.fillAlpha > 0;
  m.edge.color.set(style.edge);
  m.edge.linewidth = style.edgeWidthPx;
  m.edge.opacity = style.edgeAlpha;
}

/** Pulses fill and edge at the style's rate. `still` holds the rest value so screenshots are stable. */
export function animate(m: PartMaterials, tSeconds: number, still: boolean): void {
  const k = still || m.style.pulseHz === 0 ? 1 : 0.6 + 0.4 * Math.sin(2 * Math.PI * m.style.pulseHz * tSeconds);
  m.fill.opacity = m.style.fillAlpha * k;
  m.edge.opacity = m.style.edgeAlpha * (0.7 + 0.3 * k);
}

/** Screen-space-width lines (WebGL's own lines are always 1 px). */
export function fatLines(positions: number[], material: LineMaterial): LineSegments2 {
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);
  const lines = new LineSegments2(geometry, material);
  lines.raycast = () => {};
  return lines;
}

/** The hard edges of a geometry as segment endpoints. */
export function edgePositions(geometry: THREE.BufferGeometry, thresholdDeg = 20): number[] {
  const edges = new THREE.EdgesGeometry(geometry, thresholdDeg);
  const out = Array.from(edges.getAttribute("position").array as ArrayLike<number>);
  edges.dispose();
  return out;
}

const corners = (b: THREE.Box3): THREE.Vector3[] => {
  const out: THREE.Vector3[] = [];
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) out.push(new THREE.Vector3(x, y, z));
  return out;
};

/** Corner brackets for BUILT_LIVE: at each corner, three short strokes along the box edges. */
export function bracketPositions(box: THREE.Box3, frac = 0.15): number[] {
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const out: number[] = [];
  for (const c of corners(box)) {
    for (const axis of ["x", "y", "z"] as const) {
      const end = c.clone();
      end[axis] += Math.sign(centre[axis] - c[axis]) * size[axis] * frac;
      out.push(c.x, c.y, c.z, end.x, end.y, end.z);
    }
  }
  return out;
}

/** A grid on every face of the box, for CURRENT_STEP (blueprint §8). At most 40 lines per face direction. */
export function gridPositions(box: THREE.Box3, spacing: number): number[] {
  const out: number[] = [];
  const axes = ["x", "y", "z"] as const;
  for (const n of axes) {
    const [u, v] = axes.filter((a) => a !== n) as [typeof axes[number], typeof axes[number]];
    for (const at of [box.min[n], box.max[n]]) {
      for (const [along, across] of [[u, v], [v, u]] as const) {
        const len = box.max[across] - box.min[across];
        const step = Math.max(spacing, len / 40);
        for (let s = box.min[across] + step; s < box.max[across] - step * 0.25; s += step) {
          const a = new THREE.Vector3(), b = new THREE.Vector3();
          a[n] = at; b[n] = at;
          a[across] = s; b[across] = s;
          a[along] = box.min[along]; b[along] = box.max[along];
          out.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
      }
    }
  }
  return out;
}
