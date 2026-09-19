import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { REPO_ROOT } from "../src/config.js";
import { auth, makeApp } from "./helpers.js";

let t: Awaited<ReturnType<typeof makeApp>>;
beforeEach(async () => { t = await makeApp(); });
afterEach(async () => { await t.cleanup(); });

it("serves the E7 model that boot copied next to its plan, byte for byte", async () => {
  const r = await t.app.inject({ method: "GET", url: "/v1/plans/plan_e7_massing/assets/e7.glb", headers: auth });
  expect(r.statusCode).toBe(200);
  expect(r.headers["content-type"]).toBe("model/gltf-binary");
  // The committed file, whatever it holds: a checkout without Git LFS has a pointer here, not a GLB.
  expect(r.rawPayload.equals(readFileSync(join(REPO_ROOT, "data", "e7", "out", "e7.glb")))).toBe(true);
});

it("refreshes an asset when its source file changes (a regenerated E7 model)", () => {
  const src = join(mkdtempSync(join(tmpdir(), "asset-src-")), "e7.glb");
  writeFileSync(src, "glTF version 1");
  const store = t.app.ctx.store;
  expect(store.syncAsset("plan_e7_massing", "e7.glb", src)).toBe(true);   // differs from the booted copy
  expect(store.syncAsset("plan_e7_massing", "e7.glb", src)).toBe(false);  // now identical: nothing to do
  writeFileSync(src, "glTF version 2");
  expect(store.syncAsset("plan_e7_massing", "e7.glb", src)).toBe(true);
  expect(readFileSync(store.assetPath("plan_e7_massing", "e7.glb")!, "utf8")).toBe("glTF version 2");
});

it("rejects odd names, reports missing files and needs the token", async () => {
  expect((await t.app.inject({ method: "GET", url: "/v1/plans/plan_e7_massing/assets/..%2F..%2Fsecret.glb", headers: auth })).statusCode).toBe(400);
  expect((await t.app.inject({ method: "GET", url: "/v1/plans/plan_e7_massing/assets/nope.glb", headers: auth })).statusCode).toBe(404);
  expect((await t.app.inject({ method: "GET", url: "/v1/plans/plan_e7_massing/assets/e7.glb" })).statusCode).toBe(401);
});
