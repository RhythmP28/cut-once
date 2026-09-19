import { z, type ZodRawShape } from "zod";
import {
  AnchorId, AssemblyId, ChunkId, ContextId, DocumentId, EventId, IssueId, JobId, MaterialId, PartId,
  PlanId, ProjectId, SheetId, StepId, Timestamp, TurnId, VerificationId,
} from "./ids.js";

/**
 * Every object schema is built through `o`, so one definition yields two forms:
 *  - "strip": unknown keys are dropped (the API at runtime; a teammate's new field must not become a 400)
 *  - "strict": unknown keys fail (fixtures, tests and the JSON Schema export; catches our own typos)
 */
export type Mode = "strip" | "strict";

export function buildSchemas(mode: Mode) {
  const o = <T extends ZodRawShape>(shape: T) => (mode === "strict" ? z.object(shape).strict() : z.object(shape));

  // ── geometry ────────────────────────────────────────────────────────────────
  const Vec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
  const Size3 = z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]);
  const Quat = z.tuple([z.number(), z.number(), z.number(), z.number()]);
  const BBoxNorm = z.tuple([z.number(), z.number(), z.number(), z.number()]);
  const BBoxPx = z.tuple([z.number(), z.number(), z.number(), z.number()]);

  const DocRef = o({
    document_id: DocumentId,
    sheet_id: SheetId.optional(),
    page: z.number().int().min(1),
    chunk_id: ChunkId.optional(),
    bbox_norm: BBoxNorm.optional(),
  });

  // ── documents ───────────────────────────────────────────────────────────────
  const DocType = z.enum(["architectural", "electrical", "materials", "assembly", "spec", "other"]);
  const Sheet = o({
    sheet_id: SheetId, document_id: DocumentId, page: z.number().int().min(1), title: z.string(),
    discipline: z.string(), image_uri: z.string(), width_px: z.number().int().positive(),
    height_px: z.number().int().positive(),
    scale: o({ px_per_m: z.number().positive().optional(), ratio: z.string().optional() }).optional(),
  });
  const Document = o({
    document_id: DocumentId, project_id: ProjectId, filename: z.string(), sha256: z.string().length(64),
    mime: z.string(), doc_type: DocType, page_count: z.number().int().min(0), uploaded_at: Timestamp,
    sheets: z.array(Sheet),
  });
  const Project = o({
    project_id: ProjectId, name: z.string(), created_at: Timestamp,
    document_ids: z.array(DocumentId), plan_ids: z.array(PlanId),
  });

  // ── plan ────────────────────────────────────────────────────────────────────
  const Shape = z.discriminatedUnion("type", [
    o({ type: z.literal("box"), size: Size3 }),
    o({ type: z.literal("cylinder"), axis: z.enum(["x", "y", "z"]), diameter: z.number().positive(), length: z.number().positive() }),
    o({ type: z.literal("polyline"), points: z.array(Vec3).min(2), diameter: z.number().positive() }),
    o({ type: z.literal("mesh"), uri: z.string(), node: z.string(), bounds: o({ min: Vec3, max: Vec3 }).optional() }),
  ]);
  const Relation = z.enum(["on", "inside", "along"]);
  const Part = o({
    part_id: PartId, name: z.string().min(1), aliases: z.array(z.string()), kind: z.string(), layer: z.string(),
    parent_id: PartId.optional(), shape: Shape, position: Vec3, rotation_quat: Quat.optional(),
    material_id: MaterialId, step_id: StepId, rests_on: z.array(PartId),
    attaches_to: z.array(o({ part_id: PartId, relation: Relation, via_material_id: MaterialId.optional() })),
    verify_hint: z.string(), install_minutes: z.number().nonnegative(), doc_refs: z.array(DocRef),
    external_ids: z.record(z.string()).optional(),
  });
  const Material = o({
    material_id: MaterialId, name: z.string(), spec: z.string(), unit: z.string(),
    quantity: z.number().nonnegative(), used_by: z.array(PartId), doc_refs: z.array(DocRef),
  });
  const BuildStep = o({
    step_id: StepId, index: z.number().int().min(1), title: z.string(), instruction: z.string(),
    part_ids: z.array(PartId), requires: z.array(StepId), layer: z.string(), est_minutes: z.number().nonnegative(),
    materials: z.array(o({ material_id: MaterialId, qty: z.number().positive() })), doc_refs: z.array(DocRef),
  });
  const Marker = o({ marker_id: z.string().regex(/^m[0-9]+$/), payload: z.string().min(1), size_m: z.number().positive(), position: Vec3, normal: z.literal("+Y") });
  const TouchPoint = o({ point_id: z.string().regex(/^tp_[a-z0-9_]+$/), name: z.string(), position: Vec3 });
  const ValidationIssue = o({
    code: z.enum(["V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8"]), severity: z.enum(["error", "warning"]),
    part_ids: z.array(z.string()), message: z.string(),
  });
  const Plan = o({
    plan_id: PlanId, project_id: ProjectId, name: z.string(), revision: z.number().int().min(1),
    status: z.enum(["draft", "approved"]),
    frame: o({ handedness: z.literal("right"), up: z.literal("+Y"), units: z.literal("m"), pose: z.string(), origin: z.string() }),
    overall_size: Size3.optional(),
    layers: z.array(z.string()), parts: z.array(Part), materials: z.array(Material), steps: z.array(BuildStep),
    markers: z.array(Marker), touch_points: z.array(TouchPoint),
    provenance: o({
      source_document_ids: z.array(DocumentId), extracted_by: z.string(), approved_by: z.string().optional(),
      assumptions: z.array(z.string()), validation: z.array(ValidationIssue),
    }),
  });

  // ── plan draft (what the drawing-reading model returns) ─────────────────────
  // Every field is required and nullable instead of optional: OpenAI's strict JSON-schema mode needs that.
  const Evidence = o({ page: z.number().int().min(1), text: z.string() });
  const DraftPart = o({
    name: z.string(), aliases: z.array(z.string()), kind: z.string(), layer: z.string(), shape: Shape, position: Vec3,
    rests_on_names: z.array(z.string()), attaches_to: z.array(o({ name: z.string(), relation: Relation })),
    material_name: z.string().nullable(), verify_hint: z.string(), install_minutes: z.number().nonnegative(),
    evidence: z.array(Evidence), assumptions: z.array(z.string()),
  });
  const DraftMaterial = o({ name: z.string(), spec: z.string(), unit: z.string(), quantity: z.number().nonnegative(), evidence: z.array(Evidence) });
  const PlanDraft = o({
    name: z.string(), overall_size: o({ value: Size3, evidence: z.array(Evidence) }),
    parts: z.array(DraftPart), materials: z.array(DraftMaterial), assumptions: z.array(z.string()),
  });

  // ── assembly, events, state ─────────────────────────────────────────────────
  const Assembly = o({
    assembly_id: AssemblyId, plan_id: PlanId, plan_revision: z.number().int().min(1), name: z.string(),
    seed: z.string(), created_at: Timestamp, status: z.enum(["active", "archived"]),
  });
  const Seed = o({ seed: z.string().regex(/^[a-z0-9_]+$/), plan_id: PlanId, built: z.array(PartId) });
  const PartState = z.enum(["missing", "built", "wrong"]);
  const EventSource = z.enum(["manual", "voice", "camera_verification", "system", "seed"]);
  const Verdict = z.enum(["present", "absent", "wrong_orientation", "unsure"]);
  const BuildEventBase = o({
    event_id: EventId, assembly_id: AssemblyId, version: z.number().int().min(1).nullable(),
    timestamp: Timestamp, client_timestamp: Timestamp,
    kind: z.enum(["part_state", "verification", "annotation", "alignment"]),
    part_id: PartId.optional(), previous_state: PartState.optional(), new_state: PartState.optional(),
    source: EventSource, confidence: z.number().min(0).max(1), actor: z.string(),
    step_id: StepId.optional(), verification_id: VerificationId.optional(), turn_id: TurnId.optional(),
    verdict: Verdict.optional(), note: z.string().optional(),
  });
  const BuildEvent = BuildEventBase.superRefine((e, ctx) => {
    if (e.kind === "part_state" && (!e.part_id || !e.previous_state || !e.new_state)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "part_state events need part_id, previous_state and new_state" });
    }
    if (e.kind === "verification" && (!e.part_id || !e.verdict)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "verification events need part_id and verdict" });
    }
  });
  const PartStatus = o({
    state: PartState, since_version: z.number().int().min(0), last_event_id: EventId.nullable(),
    verified: o({ verdict: Verdict, confidence: z.number().min(0).max(1) }).nullable(),
  });
  const BuildState = o({
    assembly_id: AssemblyId, plan_id: PlanId, plan_revision: z.number().int().min(1),
    version: z.number().int().min(0), as_of: Timestamp.nullable(),
    parts: z.record(PartStatus),
    progress: o({
      built: z.number().int().min(0), total: z.number().int().min(0), pct: z.number().int().min(0).max(100),
      by_layer: z.record(z.tuple([z.number().int(), z.number().int()])), minutes_left: z.number().nonnegative(),
    }),
    current_step_id: StepId.nullable(), available_part_ids: z.array(PartId), blocked_part_ids: z.array(PartId),
    out_of_sequence: z.array(o({ part_id: PartId, kind: z.enum(["hard", "soft"]) })),
  });
  const SpatialAnchor = o({
    anchor_id: AnchorId, assembly_id: AssemblyId, device_id: z.string(),
    method: z.enum(["qr_2pt", "qr_3pt", "touch_2pt", "touch_3pt", "manual", "restored"]), meta_anchor_uuid: z.string(),
    nudge: o({ dx: z.number(), dy: z.number(), dz: z.number(), dyaw_deg: z.number() }),
    residual_mm: z.number().nonnegative(), level_error_mm: z.number().nonnegative(),
    m3_residual_mm: z.number().nonnegative().optional(), locked_at: Timestamp,
  });

  // ── copilot and verification (Tier 2: Rhythm owns these; this is the starting point) ──
  const CameraIntrinsics = o({ width: z.number().int().positive(), height: z.number().int().positive(), fx: z.number(), fy: z.number(), cx: z.number(), cy: z.number() });
  const VisiblePart = o({ part_id: PartId, state: PartState, bbox_px: BBoxPx, in_frame: z.number().min(0).max(1), distance_m: z.number().nonnegative() });
  const CopilotContext = o({
    context_id: ContextId, assembly_id: AssemblyId, plan_revision: z.number().int().min(1), state_version: z.number().int().min(0),
    mode: z.enum(["upload", "overlay"]), selected_part_id: PartId.nullable(),
    selection_source: z.enum(["controller_ray", "gaze", "none"]), current_step_id: StepId.nullable(),
    visible_parts: z.array(VisiblePart), camera: CameraIntrinsics.nullable(),
    scripted_query_id: z.string().nullable(), client_sent_at: Timestamp,
  });
  const CopilotAction = z.discriminatedUnion("type", [
    o({ type: z.literal("mark_state"), part_ids: z.array(PartId), new_state: PartState, source: z.literal("voice") }),
    o({ type: z.literal("log_issue"), issue_id: IssueId }),
  ]);
  const CopilotResponse = o({
    turn_id: TurnId, transcript: z.string(), answer_text: z.string(),
    highlight_parts: z.array(PartId), highlight_style: z.enum(["pulse", "path"]),
    drawing_refs: z.array(o({ document_id: DocumentId, sheet_id: SheetId.optional(), page: z.number().int().min(1), chunk_id: ChunkId.optional(), title: z.string() })),
    action: CopilotAction.nullable(), confidence: z.number().min(0).max(1), needs_clarification: z.boolean(),
    audio_url: z.string().nullable(), cached: z.boolean(), timings_ms: z.record(z.number()),
  });
  const VerificationRequest = o({
    verification_id: VerificationId, part_id: PartId, claimed_state: PartState, state_version: z.number().int().min(0),
    bbox_px: BBoxPx, in_frame: z.number().min(0).max(1), camera: CameraIntrinsics,
  });
  const VerificationResult = o({
    verification_id: VerificationId, part_id: PartId, verdict: Verdict, confidence: z.number().min(0).max(1),
    evidence: z.string(), model: z.string(), ms: z.number().nonnegative(),
  });

  // ── jobs, search, director, stream ──────────────────────────────────────────
  const JobStage = o({
    name: z.string(), status: z.enum(["pending", "running", "done", "failed", "skipped"]),
    ms: z.number().nonnegative().optional(), artifact_uri: z.string().optional(), detail: z.string().optional(),
  });
  const Job = o({
    job_id: JobId, document_ids: z.array(DocumentId),
    status: z.enum(["queued", "running", "needs_review", "approved", "failed"]), stages: z.array(JobStage),
    plan_id: PlanId.optional(), revision: z.number().int().min(1).optional(),
    issues: z.array(ValidationIssue).optional(), created_at: Timestamp,
  });
  const RetrievedChunk = o({
    chunk_id: ChunkId, document_id: DocumentId, sheet_id: SheetId.optional(), page: z.number().int().min(1),
    title: z.string(), text: z.string(), part_ids: z.array(PartId), score: z.number(), page_image_uri: z.string().optional(),
  });
  const DirectorCommand = z.discriminatedUnion("type", [
    o({ type: z.literal("new_run"), seed: z.string(), plan_id: PlanId.optional() }),
    o({ type: z.literal("force_state"), part_id: PartId, new_state: PartState }),
    o({ type: z.literal("goto"), demo_state: z.string() }),
    o({ type: z.literal("set_flag"), flag: z.enum(["verification", "offline", "reconstruction"]), value: z.boolean() }),
    o({ type: z.literal("promote_cache"), turn_id: TurnId, scripted_query_id: z.string() }),
  ]);
  const Presence = o({ kind: z.enum(["quest", "web"]), id: z.string(), connected_at: Timestamp });
  const WsMessage = z.discriminatedUnion("type", [
    o({ type: z.literal("event_appended"), assembly_id: AssemblyId, event: BuildEventBase, head: z.number().int().min(0) }),
    o({ type: z.literal("assembly_changed"), assembly: Assembly }),
    o({ type: z.literal("plan_ready"), plan_id: PlanId, revision: z.number().int().min(1) }),
    o({ type: z.literal("director_command"), command: DirectorCommand }),
    o({ type: z.literal("copilot_turn"), turn: z.record(z.unknown()) }),
    o({ type: z.literal("issue_logged"), issue_id: IssueId, part_id: PartId.nullable(), note: z.string() }),
    o({ type: z.literal("presence"), clients: z.array(Presence) }),
  ]);

  return {
    Vec3, Size3, DocRef, DocType, Sheet, Document, Project, Shape, Relation, Part, Material, BuildStep, Marker,
    TouchPoint, ValidationIssue, Plan, Evidence, DraftPart, DraftMaterial, PlanDraft, Assembly, Seed, PartState,
    EventSource, Verdict, BuildEventBase, BuildEvent, PartStatus, BuildState, SpatialAnchor, CameraIntrinsics,
    VisiblePart, CopilotContext, CopilotAction, CopilotResponse, VerificationRequest, VerificationResult,
    JobStage, Job, RetrievedChunk, DirectorCommand, Presence, WsMessage,
  };
}
