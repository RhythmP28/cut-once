import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const ensureDir = (dir: string) => mkdirSync(dir, { recursive: true });

/** Write to a temp file, then rename: a crash never leaves a half-written JSON file. */
export function writeJsonAtomic(path: string, value: unknown) {
  ensureDir(dirname(path));
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  renameSync(tmp, path);
}

export const readJson = <T>(path: string): T | null => (existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : null);

/** Append one line and fsync it: an acknowledged event survives a power cut. */
export function appendLine(path: string, line: string) {
  ensureDir(dirname(path));
  appendFileSync(path, line + "\n");
  const fd = openSync(path, "r");
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

export const readLines = (path: string): string[] => (existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean) : []);
