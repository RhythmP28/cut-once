import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ulid } from "ulid";
import { S, type BuildScan, type BuildScanUpload, type Twin } from "@cutonce/schemas";
import { notFound } from "../errors.js";
import { ensureDir, readJson, writeJsonAtomic } from "../store/fs.js";

export const newId = (prefix: "scan" | "bsess" | "idea") => `${prefix}_${ulid().toLowerCase()}`;

/**
 * Where build mode keeps things. Live scans go under the runtime data folder (git-ignored: photos of the venue
 * must never reach the public repo). Curated recordings of the kit pile live in data/build/recordings/<name>/ and
 * are addressed as scan_rec_<name>.
 */
export class BuildFiles {
  constructor(private readonly dataDir: string, private readonly repoRoot: string) {}

  get root() { return join(this.dataDir, "build"); }
  get recordingsDir() { return join(this.repoRoot, "data", "build", "recordings"); }

  /** Scan ids come from URLs, so they are checked before they ever touch a path (the same rule as plan ids in the Store). */
  scanDir(scanId: string): string {
    if (!/^scan_[a-z0-9_]+$/.test(scanId)) throw notFound(`build scan ${scanId}`);
    return scanId.startsWith("scan_rec_") ? join(this.recordingsDir, scanId.slice("scan_rec_".length)) : join(this.root, "scans", scanId);
  }

  saveScan(upload: BuildScanUpload, sessionId: string): BuildScan {
    const scan: BuildScan = {
      scan_id: newId("scan"), session_id: sessionId, device_id: upload.device_id, captured_at: new Date().toISOString(),
      grid: upload.grid, points_mm: upload.points_mm, hit: upload.hit, camera: upload.camera,
    };
    const dir = this.scanDir(scan.scan_id);
    ensureDir(dir);
    writeJsonAtomic(join(dir, "scan.json"), scan);
    writeFileSync(join(dir, "photo.jpg"), Buffer.from(upload.photo_b64, "base64"));
    return scan;
  }

  readScan(scanId: string): { scan: BuildScan; photo: Buffer } {
    const dir = this.scanDir(scanId);
    const raw = readJson<unknown>(join(dir, "scan.json"));
    if (!raw || !existsSync(join(dir, "photo.jpg"))) throw notFound(`build scan ${scanId}`);
    return { scan: S.BuildScan.parse(raw), photo: readFileSync(join(dir, "photo.jpg")) };
  }

  readLabels(scanId: string): Twin[] | null {
    const raw = readJson<unknown[]>(join(this.scanDir(scanId), "labels.json"));
    return raw ? raw.map((t) => S.Twin.parse(t)) : null;
  }

  /** A recording keeps the labels it was recorded with (pnpm build:record): the server never writes into the repo's tracked data. */
  saveLabels(scanId: string, twins: Twin[]): void {
    if (scanId.startsWith("scan_rec_")) return;
    writeJsonAtomic(join(this.scanDir(scanId), "labels.json"), twins);
  }

  listScans(): { scan_id: string; session_id: string | null; captured_at: string | null; recording: boolean }[] {
    const live = existsSync(join(this.root, "scans")) ? readdirSync(join(this.root, "scans")).filter((d) => d.startsWith("scan_")) : [];
    const recs = existsSync(this.recordingsDir) ? readdirSync(this.recordingsDir).filter((d) => /^[a-z0-9_]+$/.test(d)).map((d) => `scan_rec_${d}`) : [];
    return [...live, ...recs].map((scan_id) => {
      const meta = readJson<{ session_id?: string; captured_at?: string }>(join(this.scanDir(scan_id), "scan.json"));
      return { scan_id, session_id: meta?.session_id ?? null, captured_at: meta?.captured_at ?? null, recording: scan_id.startsWith("scan_rec_") };
    }).sort((a, b) => (b.captured_at ?? "").localeCompare(a.captured_at ?? ""));
  }

  saveSession(session: { session_id: string }): void { writeJsonAtomic(join(this.root, "sessions", session.session_id, "session.json"), session); }
}
