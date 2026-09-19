import "../env.js";
import { loadConfig, REPO_ROOT } from "../config.js";
import { installDrawings, type UploadAnswer } from "../e7/drawings.js";

/**
 * pnpm e7:install [--server http://host:port] [--keep-run]
 * Loads all 14 published E7 drawings into the running server (downloading any this machine lacks), then makes E7 the
 * current run so the headset shows it. Token and port come from .env.local, like the server's.
 */
const cfg = loadConfig();
const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const server = (arg("--server") ?? process.env.CUTONCE_SERVER ?? `http://127.0.0.1:${cfg.port}`).replace(/\/$/, "");
const auth = { authorization: `Bearer ${cfg.apiToken}` };

const health = await fetch(`${server}/health`).catch(() => null);
if (!health?.ok) { console.error(`No server answers at ${server}/health. Start it first (pnpm serve:local or pnpm dev), or pass --server.`); process.exit(1); }

const result = await installDrawings({
  repoRoot: REPO_ROOT,
  log: (line) => console.log(line),
  download: async (url) => {
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 cut-once-e7-install/1.0" } }).catch(() => null);
    return r?.ok ? Buffer.from(await r.arrayBuffer()) : null;
  },
  upload: async (filename, bytes, docType, projectId): Promise<UploadAnswer> => {
    const form = new FormData();
    form.append("doc_type", docType);                                   // before the file: the server reads fields that precede it
    form.append("file", new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }), filename);
    const r = await fetch(`${server}/v1/projects/${projectId}/documents`, { method: "POST", headers: auth, body: form });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  },
});
console.log(`\n${result.installed} of 14 drawings installed, ${result.linked} linked to the approved E7 plan.`);

if (!process.argv.includes("--keep-run")) {
  const r = await fetch(`${server}/v1/director/command`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ type: "new_run", seed: "e7_start" }) });
  console.log(r.ok ? "E7 is now the current run: the headset switches to it." : `Could not start an E7 run (${r.status}); use the Director page.`);
}
process.exit(result.failed.length ? 1 : 0);
