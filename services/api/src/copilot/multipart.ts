import type { FastifyRequest } from "fastify";
import { badRequest } from "../errors.js";

export interface Uploaded { buffer: Buffer; filename: string; mime: string }
export interface Parsed { files: Record<string, Uploaded>; fields: Record<string, string>; bytes: number }

/**
 * Reads a multipart request with several files in it. `@fastify/multipart`'s `req.file()` only
 * returns the first one, and a copilot query carries three parts at once.
 */
export async function readMultipart(req: FastifyRequest): Promise<Parsed> {
  if (!req.isMultipart()) throw badRequest("send this as multipart/form-data");
  const out: Parsed = { files: {}, fields: {}, bytes: 0 };
  for await (const part of req.parts()) {
    if (part.type === "file") {
      const buffer = await part.toBuffer(); // over 25 MB this throws FST_REQ_FILE_TOO_LARGE → 413
      out.files[part.fieldname] = { buffer, filename: part.filename, mime: part.mimetype };
      out.bytes += buffer.length;
    } else {
      const value = typeof part.value === "string" ? part.value : String(part.value);
      out.fields[part.fieldname] = value;
      out.bytes += Buffer.byteLength(value);
    }
  }
  return out;
}

/** A field that may arrive as a JSON string or as an uploaded .json file — the headset does both. */
export function jsonPart(parsed: Parsed, name: string): unknown {
  const raw = parsed.fields[name] ?? parsed.files[name]?.buffer.toString("utf8");
  if (raw === undefined) throw badRequest(`multipart field \`${name}\` is required`);
  try { return JSON.parse(raw); } catch { throw badRequest(`multipart field \`${name}\` is not valid JSON`); }
}

export function filePart(parsed: Parsed, name: string): Uploaded {
  const file = parsed.files[name];
  if (!file) throw badRequest(`multipart file \`${name}\` is required`);
  return file;
}
