import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BuildFiles } from "../src/build/files.js";
import { REPO_ROOT } from "../src/config.js";
import { auth, makeApp } from "./helpers.js";

let t: Awaited<ReturnType<typeof makeApp>>;
beforeEach(async () => { t = await makeApp(); });
afterEach(async () => { await t.app.ctx.hooks.build!.idle(); await t.cleanup(); });   // no scan may still be writing when the folder goes

const photoB64 = () => readFileSync(join(REPO_ROOT, "data", "fixtures", "frame_0001.jpg")).toString("base64");
const upload = (over: object = {}) => ({
  device_id: "quest", grid: { cols: 8, rows: 6 }, points_mm: new Array(144).fill(0), hit: "0".repeat(48),
  camera: { position: [0, 1.6, 0], forward: [0, 0, 1], intrinsics: { width: 1280, height: 960, fx: 853.6, fy: 853.6, cx: 640, cy: 480 } },
  photo_b64: photoB64(), ...over,
});
const post = (body: object) => t.app.inject({ method: "POST", url: "/v1/build/scans", headers: auth, payload: body });

describe("POST /v1/build/scans", () => {
  it("saves the scan and its photo under the runtime data folder, and starts a session", async () => {
    const r = await post(upload());
    expect(r.statusCode).toBe(202);
    const { scan_id, session_id } = r.json();
    expect(scan_id).toMatch(/^scan_[a-z0-9]+$/);
    expect(session_id).toMatch(/^bsess_[a-z0-9]+$/);
    const dir = join(t.dataDir, "build", "scans", scan_id);
    expect(existsSync(join(dir, "scan.json")) && existsSync(join(dir, "photo.jpg"))).toBe(true);
  });

  it("keeps the session when the headset sends it back", async () => {
    const first = (await post(upload())).json();
    expect(first.session_id).toMatch(/^bsess_[a-z0-9]+$/);           // without this, two 404s would "agree" on undefined
    const second = (await post(upload({ session_id: first.session_id }))).json();
    expect(second.session_id).toBe(first.session_id);
  });

  it("refuses a grid whose arrays do not match its size", async () => {
    const r = await post(upload({ hit: "0".repeat(47) }));
    expect(r.statusCode).toBe(400);
  });

  it("refuses a photo that is not a JPEG, before anything is saved", async () => {
    const r = await post(upload({ photo_b64: Buffer.from("x".repeat(300)).toString("base64") }));
    expect(r.statusCode).toBe(400);
    expect(existsSync(join(t.dataDir, "build", "scans"))).toBe(false);
  });

  it("lists saved scans", async () => {
    const { scan_id } = (await post(upload())).json();
    const list = (await t.app.inject({ method: "GET", url: "/v1/build/scans", headers: auth })).json();
    expect(list.scans.some((s: { scan_id: string }) => s.scan_id === scan_id)).toBe(true);
  });
});

describe("BuildFiles", () => {
  it("lists scans from their small meta files, and is not broken by a stray folder", async () => {
    const { scan_id } = (await post(upload())).json();
    await t.app.ctx.hooks.build!.idle();
    mkdirSync(join(t.dataDir, "build", "scans", "scan_01abc copy"));                   // Finder's doing, or a teammate's
    mkdirSync(join(t.dataDir, "build", "scans", "scan_empty"));
    const r = await t.app.inject({ method: "GET", url: "/v1/build/scans", headers: auth });
    expect(r.statusCode).toBe(200);
    const live = (r.json().scans as { scan_id: string; recording: boolean }[]).filter((q) => !q.recording).map((q) => q.scan_id);
    expect(live).toEqual([scan_id, "scan_empty"]);                                    // recordings from the repo are listed too
    // The list never opens scan.json (150 kB of points each): what it shows is in meta.json, written with the scan.
    const meta = JSON.parse(readFileSync(join(t.dataDir, "build", "scans", scan_id, "meta.json"), "utf8"));
    expect(Object.keys(meta).sort()).toEqual(["captured_at", "session_id"]);
  });

  it("never writes into a recording: they are fixtures in the public repo, and a live replay must not change them", () => {
    const files = new BuildFiles(t.dataDir, t.dataDir);             // a stand-in repo root, so nothing real is touched
    files.saveLabels("scan_rec_kit", []);
    expect(existsSync(join(t.dataDir, "data", "build", "recordings", "kit", "labels.json"))).toBe(false);
    files.saveLabels("scan_live01", []);
    expect(existsSync(join(t.dataDir, "build", "scans", "scan_live01", "labels.json"))).toBe(true);
  });

  it("checks a scan id before it touches a path (ids arrive in URLs)", () => {
    const files = new BuildFiles(t.dataDir, REPO_ROOT);
    for (const id of ["scan_rec_../../../etc", "../scan_x", "scan_rec_a/b", "scan_A", "SCAN_x", ""]) {
      expect(() => files.scanDir(id), id).toThrow(/not found/);
    }
    expect(files.scanDir("scan_rec_kit_table")).toBe(join(REPO_ROOT, "data", "build", "recordings", "kit_table"));
  });
});
