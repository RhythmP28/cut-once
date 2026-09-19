import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BuildIdea, BuildScan, BuildScanUpload, Surface, Twin, Vec3 } from "@cutonce/schemas";
import type { Ctx } from "../app.js";
import { normalise } from "../copilot/fastpath.js";
import { badRequest, notFound } from "../errors.js";
import { standardShape, type Rule, type Vocab } from "./data.js";
import { BuildFiles, newId } from "./files.js";
import { computeIdeas, summary } from "./ideas.js";
import { nameTwins, type ModelCall } from "./label.js";
import { appendTwin, mergeSurfaces, mergeTwins } from "./merge.js";
import { flatSize, heightOf } from "./shape.js";
import { fixSizes } from "./sizes.js";
import { buildTwins, decodeScan, type Cloud } from "./twins.js";

export interface BuildDeps {
  vocab: Vocab; rules: Rule[]; call: ModelCall; models: { label: string; ideas: string };
  log: { warn: (o: object, m: string) => void; error: (o: object, m: string) => void };
}
export interface Session {
  session_id: string; created_at: string; scans: string[]; surfaces: Surface[]; twins: Twin[]; ideas: BuildIdea[];
  camera: Vec3 | null; photo: string | null;
  /** The idea being built, from its start until the next scan. The headset shows no new ideas mid-build, and drops out of build mode if another run appears. */
  started: string | null;
}

/** What may surround an idea's name when it is being picked: "let's build the laptop riser, please". */
const PICKING = new Set("lets let us build make start do try pick choose show me i id we want would like to go with for the a an that this one please instead ok okay yes yeah sure can could you now then".split(" "));

/**
 * The idea a sentence picks, or null. Only the name plus picking words counts. "How tall is the laptop riser?" names an
 * idea too, but asks about it, and starting a run for it would throw the current build away.
 */
export function pickIdea<T extends { title: string }>(transcript: string, ideas: T[]): T | null {
  const said = ` ${normalise(transcript)} `;
  for (const idea of [...ideas].sort((a, b) => b.title.length - a.title.length)) {   // "tall laptop riser" before "laptop riser"
    const name = ` ${normalise(idea.title)} `;
    const at = said.indexOf(name);
    if (at < 0) continue;
    const around = `${said.slice(0, at)} ${said.slice(at + name.length)}`.split(" ").filter(Boolean);
    if (around.every((w) => PICKING.has(w))) return idea;
  }
  return null;
}

/**
 * One build session at a time (one headset). A scan is saved, answered at once (202), then processed in order:
 * outlines → names → sizes → rule ideas → AI ideas. Every step is broadcast, so the headset and /director update live.
 */
export class BuildSessions {
  readonly files: BuildFiles;
  private session: Session | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly ctx: Ctx, private readonly deps: BuildDeps) { this.files = new BuildFiles(ctx.cfg.dataDir, ctx.cfg.repoRoot); }

  current = () => this.session;
  idle = () => this.queue;
  ideaTitles = () => this.session?.ideas.map((i) => i.title) ?? [];

  newSession(): Session {
    this.session = { session_id: newId("bsess"), created_at: new Date().toISOString(), scans: [], surfaces: [], twins: [], ideas: [], camera: null, photo: null, started: null };
    return this.session;
  }

  accept(upload: BuildScanUpload): { scan_id: string; session_id: string } {
    const session = upload.session_id && this.session?.session_id === upload.session_id ? this.session : this.newSession();
    session.started = null;                                          // scanning again puts the headset back to picking
    const scan = this.files.saveScan(upload, session.session_id);
    const photo = Buffer.from(upload.photo_b64, "base64");
    this.enqueue(() => this.process(session, scan, photo, "live"));
    return { scan_id: scan.scan_id, session_id: session.session_id };
  }

  replay(scanId: string, labels: "saved" | "live"): { session_id: string } {
    const { scan, photo } = this.files.readScan(scanId);
    const session = this.newSession();
    this.enqueue(() => this.process(session, { ...scan, session_id: session.session_id }, photo, labels));
    return { session_id: session.session_id };
  }

  rethink(request: string): Promise<boolean> {
    const s = this.session;
    if (!s || s.twins.length === 0 || s.started) return Promise.resolve(false);
    const photo = s.photo && existsSync(s.photo) ? readFileSync(s.photo) : null;
    this.enqueue(() => this.ideas(s, photo, request));
    return Promise.resolve(true);
  }

  async startIdea(ideaId: string): Promise<{ assembly_id: string; plan_id: string; revision: number }> {
    const session = this.session;                                      // a replay may swap this.session while the run is being made
    const idea = session?.ideas.find((i) => i.idea_id === ideaId);
    if (!session || !idea) throw notFound(`build idea ${ideaId}`);
    const { store } = this.ctx;
    const { revision } = store.putDraft(idea.plan);
    store.approve(idea.plan.plan_id, revision, "build mode");
    store.putSeed({ seed: "build_start", plan_id: idea.plan.plan_id, built: ["part_surface"] });
    const assembly = await store.createAssembly({ plan_id: idea.plan.plan_id, revision, seed: "build_start", name: `Build: ${idea.title}` });
    session.started = idea.idea_id;
    return { assembly_id: assembly.assembly_id, plan_id: idea.plan.plan_id, revision };
  }

  async startByName(transcript: string): Promise<string | null> {
    if (!this.session || this.session.started) return null;
    const idea = pickIdea(transcript, this.session.ideas);
    if (!idea) return null;
    await this.startIdea(idea.idea_id);
    return idea.title;
  }

  /** The Director's "add a missed object": its standard size, standing in the middle of the main surface. */
  addObject(name: string): Twin {
    const item = this.deps.vocab.get(name);
    const std = item ? standardShape(item) : null;
    if (!item || !std) throw badRequest(`${name} is not a vocabulary object with a standard size`);
    const s = this.session ?? this.newSession();
    const surface = s.surfaces.find((x) => x.kind === "table") ?? s.surfaces[0] ?? null;
    const shape: Twin["shape"] = std.type === "cylinder" ? std : { type: "box", size: flatSize(std.size) };
    const [x, z] = surface ? [(surface.min[0] + surface.max[0]) / 2, (surface.min[1] + surface.max[1]) / 2] : [0, 0.5];
    const y = surface?.y ?? 0.74;
    s.twins = appendTwin(s.twins, {
      twin_id: "o0", name, label: item.label, shape, position: [x, y + heightOf(shape) / 2, z], yaw_deg: 0, sits_on: surface?.surface_id ?? null,
      material: item.material, load_bearing: item.load_bearing, cuttable: item.cuttable, confidence: 1, error_m: 0.003, points: 0,
      distance_m: 0, bbox_px: null, snapped: true, scan_ids: [],
    });
    this.broadcastInventory(s, s.twins, null, true, null);
    const photo = s.photo && existsSync(s.photo) ? readFileSync(s.photo) : null;
    this.enqueue(() => this.ideas(s, photo, null));
    return s.twins.at(-1)!;
  }

  private enqueue(work: () => Promise<void>): void {
    this.queue = this.queue.then(work).catch((err) => this.deps.log.error({ err: (err as Error).message }, "build mode step failed"));
  }

  private async process(session: Session, scan: BuildScan, photo: Buffer, labels: "saved" | "live"): Promise<void> {
    try {
      const cloud = decodeScan(scan);
      const built = buildTwins(cloud, scan.scan_id);
      const { surfaces, idMap } = mergeSurfaces(session.surfaces, built.surfaces);
      const incoming = built.twins.map((t) => ({ ...t, sits_on: t.sits_on ? idMap.get(t.sits_on) ?? t.sits_on : null }));
      session.surfaces = surfaces; session.camera = scan.camera.position; session.scans.push(scan.scan_id);
      session.photo = join(this.files.scanDir(scan.scan_id), "photo.jpg");
      this.broadcastInventory(session, mergeTwins(session.twins, incoming), scan.scan_id, false,
        incoming.length ? null : "I couldn't see any objects. Try looking at them from a little closer.");
      const named = await this.label(scan, photo, incoming, surfaces, cloud, labels);
      session.twins = fixSizes(mergeTwins(session.twins, named.twins), this.deps.vocab);
      this.broadcastInventory(session, session.twins, scan.scan_id, true, named.note);
      await this.ideas(session, photo, null);
    } catch (err) {
      this.broadcastInventory(session, session.twins, scan.scan_id, true, `I couldn't read that scan: ${(err as Error).message}`);
      throw err;
    } finally {
      this.files.saveSession(session);
    }
  }

  /** Names for this scan's twins: its saved labels on a replay, else nameTwins (the vision model, or sizes alone). */
  private async label(scan: BuildScan, photo: Buffer, incoming: Twin[], surfaces: Surface[], cloud: Cloud, mode: "saved" | "live"): Promise<{ twins: Twin[]; note: string | null }> {
    if (mode === "saved") { const saved = this.files.readLabels(scan.scan_id); if (saved) return { twins: saved, note: null }; }
    if (incoming.length === 0) return { twins: incoming, note: null };
    const { twins, by } = await nameTwins(
      { cfg: this.ctx.cfg, call: this.deps.call, model: this.deps.models.label, vocab: this.deps.vocab, timeoutMs: 15_000, log: this.deps.log },
      photo, incoming, surfaces, cloud);
    if (by === "vision") { this.files.saveLabels(scan.scan_id, twins); return { twins, note: null }; }
    const named = twins.filter((t) => t.name !== "unknown").length;
    return { twins, note: named ? `I named ${named} of ${twins.length} objects by their size alone.` : "I can see objects but couldn't name them. Add them from the laptop, or ask again." };
  }

  private async ideas(session: Session, photo: Buffer | null, request: string | null): Promise<void> {
    await computeIdeas(
      { cfg: this.ctx.cfg, vocab: this.deps.vocab, rules: this.deps.rules, call: this.deps.call, model: this.deps.models.ideas,
        cacheDir: join(this.files.root, "idea-cache"), timeoutMs: 20_000, log: this.deps.log },
      { sessionId: session.session_id, twins: session.twins, surfaces: session.surfaces, camera: session.camera ?? [0, 1.6, 0], photo, request },
      (ideas, final) => {
        session.ideas = ideas;
        const message = final ? summary(session.twins, ideas) : null;
        const audio = message ? this.ctx.hooks.say?.(message) ?? null : null;
        this.ctx.store.bus.emit("broadcast", { type: "build_ideas", session_id: session.session_id, ideas, final, audio_url: audio?.audio_url ?? null, message });
      },
    );
  }

  private broadcastInventory(session: Session, twins: Twin[], scanId: string | null, labelled: boolean, message: string | null): void {
    this.ctx.store.bus.emit("broadcast", { type: "build_inventory", inventory: { session_id: session.session_id, scan_id: scanId, labelled, surfaces: session.surfaces, twins, message } });
  }
}
