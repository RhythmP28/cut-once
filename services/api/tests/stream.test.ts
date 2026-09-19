import { afterEach, beforeEach, expect, it } from "vitest";
import WebSocket from "ws";
import type { AddressInfo } from "node:net";
import { TOKEN, auth, builtEvent, makeApp } from "./helpers.js";

let t: Awaited<ReturnType<typeof makeApp>>;
let base: string;
beforeEach(async () => { t = await makeApp(); await t.app.listen({ port: 0, host: "127.0.0.1" }); base = `127.0.0.1:${(t.app.server.address() as AddressInfo).port}`; });
afterEach(async () => { await t.cleanup(); });

function connect(query: string) {
  const ws = new WebSocket(`ws://${base}/v1/stream?${query}`);
  const messages: Array<Record<string, any>> = [];
  ws.on("message", (raw) => messages.push(JSON.parse(String(raw))));
  const until = (test: () => boolean) => new Promise<void>((resolve, reject) => {
    const started = Date.now();
    const tick = () => (test() ? resolve() : Date.now() - started > 3000 ? reject(new Error(`timed out; saw ${JSON.stringify(messages.map((m) => m.type))}`)) : setTimeout(tick, 10));
    tick();
  });
  return { ws, messages, until };
}

it("closes with 4401 on a bad token", async () => {
  const { ws } = connect("token=nope&client=web");
  const code = await new Promise<number>((resolve) => ws.on("close", (c) => resolve(c)));
  expect(code).toBe(4401);
});

it("sends presence then the current run on connect, then events and presence changes", async () => {
  const a = connect(`token=${TOKEN}&client=quest&id=quest3_a`);
  await a.until(() => a.messages.length >= 2);
  expect(a.messages[0]).toMatchObject({ type: "presence", clients: [{ kind: "quest", id: "quest3_a" }] });
  expect(a.messages[1]!.type).toBe("assembly_changed");
  const aid = a.messages[1]!.assembly.assembly_id;

  const b = connect(`token=${TOKEN}&client=web&id=laptop`);
  await a.until(() => a.messages.some((m) => m.type === "presence" && m.clients.length === 2));

  await t.app.inject({ method: "POST", url: `/v1/assemblies/${aid}/events`, headers: auth, payload: builtEvent(aid, "part_left_rear_leg") });
  await Promise.all([a, b].map((c) => c.until(() => c.messages.some((m) => m.type === "event_appended" && m.head === 4))));

  await t.app.inject({ method: "POST", url: "/v1/director/command", headers: auth, payload: { type: "set_flag", flag: "verification", value: false } });
  await a.until(() => a.messages.some((m) => m.type === "director_command" && m.command.flag === "verification"));

  b.ws.close();
  await a.until(() => a.messages.at(-1)!.type === "presence" && a.messages.at(-1)!.clients.length === 1);
  a.ws.close();
});
