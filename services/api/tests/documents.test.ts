import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { auth, makeApp } from "./helpers.js";

let t: Awaited<ReturnType<typeof makeApp>>;
beforeEach(async () => { t = await makeApp(); });
afterEach(async () => { await t.cleanup(); });

function multipart(filename: string, content: Buffer, mime = "application/octet-stream") {
  const boundary = "----cutonce" + Math.random().toString(16).slice(2);
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`;
  return { payload: Buffer.concat([Buffer.from(head), content, Buffer.from(`\r\n--${boundary}--\r\n`)]), headers: { ...auth, "content-type": `multipart/form-data; boundary=${boundary}` } };
}
const upload = (filename: string, content: Buffer, mime?: string) => t.app.inject({ method: "POST", url: "/v1/projects/proj_cutonce_demo/documents", ...multipart(filename, content, mime) });
async function settled(jobId: string) {
  for (let i = 0; i < 500; i++) { // up to 10 s: the first pdftoppm run is slow
    const job = (await t.app.inject({ method: "GET", url: `/v1/jobs/${jobId}`, headers: auth })).json();
    if (!["queued", "running"].includes(job.status)) return job;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("job did not settle");
}

/** A real one-page PDF with a text layer, written by hand (objects plus a correct xref table), so the test needs no extra tools. */
function makePdf(text: string): Buffer {
  const stream = `BT /F1 14 Tf 72 720 Td (${text.replace(/[()\\]/g, "\\$&")}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = objects.map((o, i) => { const at = body.length; body += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

describe("uploads", () => {
  const csv = Buffer.from("line,item,qty,unit,spec,notes\n1,Steel leg 700 mm black,4,ea,M8 stud,\n");

  it("stores a new file, indexes it to disk, and finishes as `indexed` when extraction is off", async () => {
    const r = await upload("desk-bom.csv", csv, "text/csv");
    expect(r.statusCode).toBe(201);
    expect(r.json().document_id).toBe("doc_desk_bom");
    const job = await settled(r.json().job_id);
    expect(job.status).toBe("indexed");
    expect(job.stages.map((s: { name: string; status: string }) => [s.name, s.status])).toEqual([["store", "done"], ["index", "done"], ["extract", "skipped"], ["validate", "skipped"], ["review", "skipped"]]);
    const chunks = t.app.ctx.docs.readChunks("doc_desk_bom");
    expect(chunks[0]).toMatchObject({ chunk_id: "chunk_desk_bom_p1_1", material_ids: ["mat_leg_700"], doc_type: "materials" });
  });

  it("dedupes the same bytes", async () => {
    const a = await upload("desk-bom.csv", csv), b = await upload("copy-of-bom.csv", csv);
    expect([b.statusCode, b.json().document_id, b.json().job_id]).toEqual([200, a.json().document_id, a.json().job_id]);
  });

  it("recognises a known file, returns its approved plan at once, and tells the headset", async () => {
    const sha = createHash("sha256").update(csv).digest("hex");
    t.app.ctx.docs.setKnown(sha, { plan_id: "plan_desk_demo", revision: 1, job_id: null, processed_at: "2026-09-19T12:00:00Z", reviewed_by: "mikey" });
    const seen: unknown[] = [];
    t.app.ctx.store.bus.on("plan_ready", (m) => seen.push(m));
    const r = await upload("desk-bom.csv", csv);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ known_plan_id: "plan_desk_demo", revision: 1, reviewed_by: "mikey" });
    expect(seen).toEqual([{ plan_id: "plan_desk_demo", revision: 1 }]);
    expect((await settled(r.json().job_id)).status).toBe("approved");
  });

  it("rejects unsupported types and oversize files", async () => {
    expect((await upload("virus.exe", Buffer.from("x"))).statusCode).toBe(422);
    expect((await upload("huge.pdf", Buffer.alloc(26 * 1024 * 1024))).statusCode).toBe(413);
  });

  it("reads a PDF's text layer, links parts, and serves the page image", async () => {
    const pdf = makePdf("Attach the left rear leg to the tabletop. Tighten by hand until it stops turning.");
    const r = await upload("desk-manual.pdf", pdf, "application/pdf");
    const job = await settled(r.json().job_id);
    expect(job.status).toBe("indexed");
    const chunks = t.app.ctx.docs.readChunks("doc_desk_manual");
    expect(chunks[0]!.text).toContain("left rear leg");
    expect(chunks[0]!.part_ids.sort()).toEqual(["part_left_rear_leg", "part_tabletop"]);
    const png = await t.app.inject({ method: "GET", url: "/v1/documents/doc_desk_manual/pages/1.png", headers: auth });
    expect([png.statusCode, png.headers["content-type"]]).toEqual([200, "image/png"]);
    expect(png.rawPayload.subarray(1, 4).toString()).toBe("PNG");
    expect((await t.app.inject({ method: "GET", url: "/v1/documents/doc_desk_manual/pages/9.png", headers: auth })).statusCode).toBe(404);
  });
});
