import type { z } from "zod";
import { buildSchemas } from "./factory.js";

export * from "./ids.js";
export { buildSchemas, type Mode } from "./factory.js";

/** Runtime form: unknown keys are dropped. Use this at API boundaries. */
export const S = buildSchemas("strip");
/** Strict form: unknown keys fail. Use this for fixtures, tests and the JSON Schema export. */
export const Strict = buildSchemas("strict");

export const PlanSchema = S.Plan;
export const PartSchema = S.Part;
export const BuildEventSchema = S.BuildEvent;
export const BuildStateSchema = S.BuildState;
export const AssemblySchema = S.Assembly;
export const SeedSchema = S.Seed;
export const DirectorCommandSchema = S.DirectorCommand;
export const WsMessageSchema = S.WsMessage;
export const PlanDraftSchema = S.PlanDraft;
export const JobSchema = S.Job;
export const RetrievedChunkSchema = S.RetrievedChunk;
export const CopilotContextSchema = S.CopilotContext;
export const CopilotResponseSchema = S.CopilotResponse;
export const VerificationRequestSchema = S.VerificationRequest;
export const VerificationResultSchema = S.VerificationResult;

type Sch = ReturnType<typeof buildSchemas>;
export type Vec3 = z.infer<Sch["Vec3"]>;
export type DocRef = z.infer<Sch["DocRef"]>;
export type Sheet = z.infer<Sch["Sheet"]>;
export type Document = z.infer<Sch["Document"]>;
export type Project = z.infer<Sch["Project"]>;
export type Shape = z.infer<Sch["Shape"]>;
export type Part = z.infer<Sch["Part"]>;
export type Material = z.infer<Sch["Material"]>;
export type BuildStep = z.infer<Sch["BuildStep"]>;
export type Marker = z.infer<Sch["Marker"]>;
export type TouchPoint = z.infer<Sch["TouchPoint"]>;
export type ValidationIssue = z.infer<Sch["ValidationIssue"]>;
export type Plan = z.infer<Sch["Plan"]>;
export type Evidence = z.infer<Sch["Evidence"]>;
export type DraftPart = z.infer<Sch["DraftPart"]>;
export type DraftMaterial = z.infer<Sch["DraftMaterial"]>;
export type PlanDraft = z.infer<Sch["PlanDraft"]>;
export type Assembly = z.infer<Sch["Assembly"]>;
export type Seed = z.infer<Sch["Seed"]>;
export type PartState = z.infer<Sch["PartState"]>;
export type BuildEvent = z.infer<Sch["BuildEventBase"]>;
export type PartStatus = z.infer<Sch["PartStatus"]>;
export type BuildState = z.infer<Sch["BuildState"]>;
export type SpatialAnchor = z.infer<Sch["SpatialAnchor"]>;
export type CameraIntrinsics = z.infer<Sch["CameraIntrinsics"]>;
export type VisiblePart = z.infer<Sch["VisiblePart"]>;
export type CopilotContext = z.infer<Sch["CopilotContext"]>;
export type CopilotAction = z.infer<Sch["CopilotAction"]>;
export type CopilotResponse = z.infer<Sch["CopilotResponse"]>;
export type VerificationRequest = z.infer<Sch["VerificationRequest"]>;
export type VerificationResult = z.infer<Sch["VerificationResult"]>;
export type JobStage = z.infer<Sch["JobStage"]>;
export type Job = z.infer<Sch["Job"]>;
export type RetrievedChunk = z.infer<Sch["RetrievedChunk"]>;
export type DirectorCommand = z.infer<Sch["DirectorCommand"]>;
export type Presence = z.infer<Sch["Presence"]>;
export type WsMessage = z.infer<Sch["WsMessage"]>;
