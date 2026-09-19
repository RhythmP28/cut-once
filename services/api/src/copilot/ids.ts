import { ulid } from "ulid";

/**
 * Turn, context and verification ids are `prefix_lower_snake` (see packages/schemas/src/ids.ts),
 * so the ULID is lower-cased. Event ids are the one exception and keep ULID's upper case.
 */
const id = (prefix: string) => `${prefix}_${ulid().toLowerCase()}`;

export const newTurnId = () => id("turn");
export const newVerificationId = () => id("ver");
export const newContextId = () => id("ctx");
export const newIssueId = () => id("issue");
