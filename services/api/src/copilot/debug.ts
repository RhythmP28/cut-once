import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { ensureDir } from "../store/fs.js";
import type { Config } from "../config.js";

export interface LastCapture {
  received_at: string; frame_bytes: number; audio_bytes: number; mime: string;
  note: string; context: unknown;
}

/**
 * G2's target: prove a JPEG and a WAV recorded on the headset reached the server. Keeping the
 * newest capture in memory (and on disk) is the whole debugging loop for pillar C — the
 * `/debug` page shows the frame, plays the audio and draws the projected boxes over it.
 */
export class DebugCaptures {
  private last: { meta: LastCapture; frame: Buffer | null; audio: Buffer | null } | null = null;

  constructor(private cfg: Config) {}

  put(input: { frame: Buffer | null; audio: Buffer | null; mime: string; note: string; context: unknown }) {
    this.last = {
      meta: {
        received_at: new Date().toISOString(), frame_bytes: input.frame?.length ?? 0, audio_bytes: input.audio?.length ?? 0,
        mime: input.mime, note: input.note, context: input.context,
      },
      frame: input.frame, audio: input.audio,
    };
    const dir = join(this.cfg.dataDir, "debug");
    ensureDir(dir);
    if (input.frame) writeFileSync(join(dir, "last-frame.jpg"), input.frame);
    if (input.audio) writeFileSync(join(dir, "last-audio.wav"), input.audio);
    return this.last.meta;
  }

  meta = () => this.last?.meta ?? null;
  frame = () => this.last?.frame ?? null;
  audio = () => this.last?.audio ?? null;
}

/**
 * A single self-contained page, served from the API so it works with nothing built and nothing
 * installed — including from inside the headset's browser. The token is kept in localStorage
 * because the page is reachable through the public tunnel and every /v1 route needs a bearer.
 */
export const DEBUG_PAGE = `<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cut Once · copilot debug</title>
<style>
  :root { color-scheme: dark }
  body { font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; margin: 0; padding: 16px; background: #0d1117; color: #e6edf3 }
  h1 { font-size: 16px; margin: 0 0 12px } h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: #8b949e; margin: 20px 0 8px }
  .row { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 12px; flex: 1 1 380px; min-width: 320px }
  input, button { font: inherit; background: #21262d; color: inherit; border: 1px solid #30363d; border-radius: 6px; padding: 6px 10px }
  button { cursor: pointer } button:hover { border-color: #58a6ff }
  #wrap { position: relative; display: inline-block; max-width: 100% }
  #frame { max-width: 100%; display: block; border-radius: 6px }
  #boxes { position: absolute; inset: 0; width: 100%; height: 100% }
  pre { white-space: pre-wrap; word-break: break-word; margin: 0; max-height: 320px; overflow: auto; color: #adbac7 }
  .ok { color: #3fb950 } .bad { color: #f85149 } .muted { color: #8b949e }
  table { border-collapse: collapse; width: 100% } td, th { text-align: left; padding: 2px 8px 2px 0; border-bottom: 1px solid #21262d }
</style>
<h1>Cut Once · copilot debug <span class="muted" id="clock"></span></h1>
<div class="row">
  <div class="card">
    <div><input id="token" placeholder="API token" size="24"> <button onclick="saveToken()">save</button> <button onclick="poll()">refresh</button> <label><input type="checkbox" id="auto" checked> auto</label></div>
    <h2>Last capture <span id="status" class="muted"></span></h2>
    <div id="wrap"><img id="frame" alt="no frame yet"><svg id="boxes" viewBox="0 0 1 1" preserveAspectRatio="none"></svg></div>
    <div><audio id="audio" controls></audio></div>
    <table id="meta"></table>
  </div>
  <div class="card">
    <h2>Latest turn</h2>
    <pre id="turn" class="muted">waiting for a question…</pre>
    <h2>Cached answers</h2>
    <pre id="cache" class="muted">—</pre>
  </div>
</div>
<script>
const $ = (id) => document.getElementById(id);
let token = localStorage.getItem("cutonce_token") || "";
$("token").value = token;
function saveToken() { token = $("token").value.trim(); localStorage.setItem("cutonce_token", token); poll(); }
const api = (path) => fetch(path, { headers: { authorization: "Bearer " + token } });
let shownAt = null;
const urls = [];
async function blobUrl(path) {
  const r = await api(path);
  if (!r.ok) return "";
  while (urls.length > 4) URL.revokeObjectURL(urls.shift());
  const u = URL.createObjectURL(await r.blob());
  urls.push(u);
  return u;
}

const COLOUR = { missing: "#00e676", built: "#ffffff", wrong: "#ff4040" };
function drawBoxes(ctx) {
  const svg = $("boxes");
  svg.innerHTML = "";
  const cam = ctx && ctx.camera;
  const parts = (ctx && ctx.visible_parts) || [];
  if (!cam || !parts.length) return;
  svg.setAttribute("viewBox", "0 0 " + cam.width + " " + cam.height);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i], b = p.bbox_px, c = COLOUR[p.state] || "#58a6ff";
    svg.insertAdjacentHTML("beforeend",
      '<rect x="' + b[0] + '" y="' + b[1] + '" width="' + b[2] + '" height="' + b[3] + '" fill="none" stroke="' + c + '" stroke-width="4"/>' +
      '<text x="' + (b[0] + 6) + '" y="' + (b[1] + 34) + '" fill="' + c + '" font-size="28" font-family="monospace">' + (i + 1) + " " + p.part_id + "</text>");
  }
}

async function poll() {
  $("clock").textContent = new Date().toLocaleTimeString([], { hour12: false });
  if (!token) { $("status").textContent = "set a token"; return; }
  try {
    const r = await api("/v1/copilot/debug/last");
    if (r.status === 401) { $("status").innerHTML = '<span class="bad">401 — wrong token</span>'; return; }
    const meta = await r.json();
    if (!meta.received_at) { $("status").innerHTML = '<span class="muted">nothing received yet</span>'; return; }
    $("status").innerHTML = '<span class="ok">' + meta.received_at + "</span>";
    // Bearer-only auth on /v1, so media is fetched as a blob rather than set as a src with a token in the URL.
    if (meta.frame_bytes && meta.received_at !== shownAt) { $("frame").src = await blobUrl("/v1/copilot/debug/frame.jpg"); }
    if (meta.audio_bytes && meta.received_at !== shownAt) { $("audio").src = await blobUrl("/v1/copilot/debug/audio.wav"); }
    shownAt = meta.received_at;
    $("meta").innerHTML = "<tr><td>frame</td><td>" + meta.frame_bytes + " bytes</td></tr><tr><td>audio</td><td>" + meta.audio_bytes + " bytes</td></tr><tr><td>note</td><td>" + (meta.note || "-") + "</td></tr>";
    drawBoxes(meta.context);
    const c = await (await api("/v1/copilot/cache")).json();
    $("cache").textContent = (c.entries || []).map((e) => e.scripted_query_id + "  " + (e.has_audio ? "♪" : " ") + "  " + e.transcript).join("\\n") || "none promoted yet";
  } catch (e) { $("status").innerHTML = '<span class="bad">' + e.message + "</span>"; }
}

const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/v1/stream?client=web&token=" + encodeURIComponent(token));
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.type === "copilot_turn") $("turn").textContent = JSON.stringify(m.turn, null, 2); };
setInterval(() => { if ($("auto").checked) poll(); }, 1500);
poll();
</script>`;
