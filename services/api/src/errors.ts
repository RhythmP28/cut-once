import type { FastifyReply } from "fastify";

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) { super(message); }
}
export const notFound = (what: string) => new ApiError(404, "not_found", `${what} not found`);
export const badRequest = (message: string, details?: unknown) => new ApiError(400, "bad_request", message, details);

export function sendError(reply: FastifyReply, err: ApiError) {
  return reply.status(err.status).send({ error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } });
}
