import { z } from "zod";

/** `prefix_` followed by lowercase letters, digits and underscores. */
export const idOf = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[a-z0-9_]+$`), `must look like ${prefix}_lower_snake`);

export const ProjectId = idOf("proj");
export const DocumentId = idOf("doc");
export const SheetId = idOf("sheet");
export const ChunkId = idOf("chunk");
export const PlanId = idOf("plan");
export const AssemblyId = idOf("asm");
export const PartId = idOf("part");
export const MaterialId = idOf("mat");
export const StepId = idOf("step");
export const JobId = idOf("job");
export const IssueId = idOf("issue");
export const TurnId = idOf("turn");
export const VerificationId = idOf("ver");
export const ContextId = idOf("ctx");
export const AnchorId = idOf("anchor");

/** `evt_` + a 26-character ULID (Crockford base32, upper case). */
export const EventId = z.string().regex(/^evt_[0-9A-HJKMNP-TV-Z]{26}$/, "must be evt_ + a 26-char ULID");

export const Timestamp = z.string().datetime({ offset: true });
