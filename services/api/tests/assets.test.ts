import { afterEach, beforeEach, expect, it } from "vitest";
import { auth, makeApp } from "./helpers.js";

let t: Awaited<ReturnType<typeof makeApp>>;
beforeEach(async () => { t = await makeApp(); });
afterEach(async () => { await t.cleanup(); });

it("serves the E7 model that boot copied next to its plan", async () => {
  const r = await t.app.inject({ method: "GET", url: "/v1/plans/plan_e7_massing/assets/e7.glb", headers: auth });
  expect(r.statusCode).toBe(200);
  expect(r.headers["content-type"]).toBe("model/gltf-binary");
  expect(r.rawPayload.subarray(0, 4).toString()).toBe("glTF");
});

it("rejects odd names, reports missing files and needs the token", async () => {
  expect((await t.app.inject({ method: "GET", url: "/v1/plans/plan_e7_massing/assets/..%2F..%2Fsecret.glb", headers: auth })).statusCode).toBe(400);
  expect((await t.app.inject({ method: "GET", url: "/v1/plans/plan_e7_massing/assets/nope.glb", headers: auth })).statusCode).toBe(404);
  expect((await t.app.inject({ method: "GET", url: "/v1/plans/plan_e7_massing/assets/e7.glb" })).statusCode).toBe(401);
});
