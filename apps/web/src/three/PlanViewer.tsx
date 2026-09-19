import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { PartState, Plan } from "@cutonce/schemas";
import { applyLook, buildPartObject, disposeObject, type Look, type PartObject } from "./buildPart";

export interface PlanViewerProps {
  plan: Plan;
  /** Part ids drawn in yellow. */
  highlight?: string[];
  /** Build state per part: `built` is green, `wrong` is red, `missing` (or absent) stays see-through blue. */
  states?: Record<string, PartState>;
  /** Called when a part is clicked (null when the click hits nothing). */
  onSelect?: (partId: string | null) => void;
}

interface Ctx {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  partsGroup: THREE.Group;
  decorGroup: THREE.Group;
  parts: Map<string, PartObject>;
  frame: () => void;
}

function textSprite(text: string, color: string, height: number): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const g = canvas.getContext("2d");
  if (g) {
    g.font = "bold 44px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = color;
    g.fillText(text, 64, 34);
  }
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(height * 2, height, 1);
  sprite.renderOrder = 10; // Stay readable in front of a highlighted (nearly opaque) part.
  sprite.raycast = () => {};
  return sprite;
}

/** Grid cell: 0.1 m for furniture, 1 m for a room, 10 m for a building. */
function gridCell(maxDim: number): number {
  const exp = Math.floor(Math.log10(Math.max(maxDim, 1e-3) / 2) + 1e-9);
  return Math.max(0.01, 10 ** exp);
}

export function PlanViewer({ plan, highlight, states, onSelect }: PlanViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<Ctx | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [failed, setFailed] = useState<string | null>(null);

  const names = useMemo(() => new Map(plan.parts.map((p) => [p.part_id, p.name])), [plan]);

  // ── renderer, camera, controls: once per mount ─────────────────────────────
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "WebGL is not available");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.className = "viewer-canvas";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1017);
    scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(2, 4, 3);
    scene.add(sun);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    camera.position.set(1.5, 1.2, 1.5);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;

    const partsGroup = new THREE.Group();
    const decorGroup = new THREE.Group();
    scene.add(decorGroup, partsGroup);

    const frame = () => {
      const box = new THREE.Box3().setFromObject(partsGroup);
      if (box.isEmpty()) box.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const radius = Math.max(sphere.radius, 0.05);
      const fov = THREE.MathUtils.degToRad(camera.fov);
      const fitH = radius / Math.sin(fov / 2);
      const fitW = radius / Math.sin(Math.atan(Math.tan(fov / 2) * camera.aspect));
      const dist = Math.max(fitH, fitW) * 1.15;
      // Look from the +X +Y +Z side, so +X reads to the right and +Z comes toward the viewer.
      const dir = new THREE.Vector3(0.75, 0.7, 1).normalize();
      camera.position.copy(sphere.center).addScaledVector(dir, dist);
      camera.near = Math.max(dist / 200, 0.001);
      camera.far = dist * 50 + radius * 10;
      camera.updateProjectionMatrix();
      controls.target.copy(sphere.center);
      controls.update();
    };

    const resize = () => {
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    // Picking: hover shows the name, a click (not a drag) selects.
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const hit = (ev: PointerEvent): string | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(partsGroup.children, false);
      const id = hits[0]?.object.userData.partId;
      return typeof id === "string" ? id : null;
    };
    let down: { x: number; y: number } | null = null;
    const onMove = (ev: PointerEvent) => {
      if (ev.buttons !== 0) return; // Orbiting: leave the label alone.
      setHoverId(hit(ev));
    };
    const onDown = (ev: PointerEvent) => {
      down = { x: ev.clientX, y: ev.clientY };
    };
    const onUp = (ev: PointerEvent) => {
      const wasClick = down !== null && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 5;
      down = null;
      if (!wasClick) return;
      const id = hit(ev);
      setSelectedId(id);
      onSelectRef.current?.(id);
    };
    const onLeave = () => setHoverId(null);
    const el = renderer.domElement;
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointerleave", onLeave);

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    ctxRef.current = { renderer, scene, camera, controls, partsGroup, decorGroup, parts: new Map(), frame };

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointerleave", onLeave);
      controls.dispose();
      disposeObject(scene);
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      el.remove();
      ctxRef.current = null;
    };
  }, []);

  // ── parts, grid and axes: rebuilt when the plan changes ────────────────────
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const built: PartObject[] = [];
    const notDrawn: string[] = [];
    for (const part of plan.parts) {
      let obj: PartObject | null = null;
      try {
        obj = buildPartObject(part);
      } catch (e) {
        console.warn(`[viewer] could not draw ${part.part_id}`, e);
      }
      if (!obj) {
        notDrawn.push(part.name);
        continue;
      }
      built.push(obj);
      ctx.parts.set(obj.partId, obj);
      ctx.partsGroup.add(obj.root);
    }
    setSkipped(notDrawn);
    setSelectedId(null);
    setHoverId(null);

    // Grid on the plan's lowest face, axes at the model origin with letters at the tips.
    const box = new THREE.Box3().setFromObject(ctx.partsGroup);
    if (box.isEmpty()) box.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.05);
    const cell = gridCell(maxDim);
    const divisions = Math.min(200, Math.max(4, Math.ceil((Math.max(size.x, size.z) * 2) / cell)));
    const grid = new THREE.GridHelper(divisions * cell, divisions, 0x3b4a5e, 0x1f2935);
    grid.position.set(Math.round(centre.x / cell) * cell, box.min.y - maxDim * 0.001, Math.round(centre.z / cell) * cell);
    const axisLen = maxDim * 0.6;
    const axes = new THREE.AxesHelper(axisLen);
    const labelH = maxDim * 0.07;
    const lx = textSprite("+X", "#ff6b6b", labelH);
    lx.position.set(axisLen + labelH, 0, 0);
    const ly = textSprite("+Y", "#6bff8f", labelH);
    ly.position.set(0, axisLen + labelH, 0);
    const lz = textSprite("+Z", "#6ba8ff", labelH);
    lz.position.set(0, 0, axisLen + labelH);
    const decor = [grid, axes, lx, ly, lz];
    for (const d of decor) {
      d.raycast = () => {};
      ctx.decorGroup.add(d);
    }
    ctx.frame();

    return () => {
      for (const obj of built) {
        obj.root.removeFromParent();
        disposeObject(obj.root);
        ctx.parts.delete(obj.partId);
      }
      for (const d of decor) {
        d.removeFromParent();
        disposeObject(d);
      }
    };
  }, [plan]);

  // ── colours: highlight wins over state ─────────────────────────────────────
  const highlightKey = (highlight ?? []).join("|");
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const lit = new Set(highlightKey ? highlightKey.split("|") : []);
    for (const [id, obj] of ctx.parts) {
      const state = states?.[id];
      const look: Look = lit.has(id) ? "highlight" : state === "built" ? "built" : state === "wrong" ? "wrong" : "default";
      applyLook(obj, look);
    }
  }, [plan, highlightKey, states]);

  const labelId = hoverId ?? selectedId;
  const labelState = labelId ? states?.[labelId] : undefined;

  return (
    <div className="viewer" ref={hostRef}>
      {failed && <div className="viewer-failed">3D preview unavailable: {failed}</div>}
      {labelId && (
        <div className="viewer-label">
          <strong>{names.get(labelId) ?? labelId}</strong>
          <span className="muted"> {labelId}{labelState ? ` · ${labelState}` : ""}</span>
        </div>
      )}
      <button type="button" className="viewer-reset" onClick={() => ctxRef.current?.frame()}>Reset view</button>
      <div className="viewer-legend">
        <span><i className="swatch swatch-planned" />planned</span>
        {states && <span><i className="swatch swatch-built" />built</span>}
        {states && <span><i className="swatch swatch-wrong" />wrong</span>}
        <span><i className="swatch swatch-highlight" />highlighted</span>
        {skipped.length > 0 && <span className="amber">not drawn: {skipped.join(", ")}</span>}
      </div>
    </div>
  );
}

export default PlanViewer;
