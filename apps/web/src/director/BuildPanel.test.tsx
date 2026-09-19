import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Strict, type BuildIdea, type Twin } from "@cutonce/schemas";
import { BuildPanelView, type BuildPanelViewProps } from "./BuildPanel";

const REPO = join(import.meta.dirname, "..", "..", "..", "..");
// Real data: the names saved with the synthetic recording, and the idea in the stream fixture the headset tests also use.
const twins = (JSON.parse(readFileSync(join(REPO, "data", "build", "recordings", "synthetic_kit", "labels.json"), "utf8")) as unknown[]).map((t) => Strict.Twin.parse(t) as Twin);
const message = JSON.parse(readFileSync(join(REPO, "data", "fixtures", "build", "ws_build_ideas.json"), "utf8")) as { ideas: unknown[] };
const ideas = message.ideas.map((i) => Strict.BuildIdea.parse(i) as BuildIdea);

const nothing = () => {};
const props = (over: Partial<BuildPanelViewProps> = {}): BuildPanelViewProps => ({
  twins: [], ideas: [], scans: [], vocab: [], pick: "", busy: false, status: "", error: null,
  onPick: nothing, onStart: nothing, onAdd: nothing, onReplay: nothing, onNewSession: nothing, ...over,
});
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("the Director's Build panel", () => {
  it("says how to begin when nothing has been scanned", () => {
    const html = text(renderToStaticMarkup(<BuildPanelView {...props()} />));
    expect(html).toContain("Objects (0)");
    expect(html).toContain("Nothing scanned yet");
    expect(html).toContain("No ideas yet");
  });

  it("lists every object with its size, every idea with a Start button, and every scan with both replays", () => {
    const html = renderToStaticMarkup(<BuildPanelView {...props({
      twins, ideas, pick: "tall_can", vocab: [{ name: "tall_can", label: "tall can", standard: true }],
      scans: [{ scan_id: "scan_rec_synthetic_kit", session_id: null, captured_at: null, recording: true }],
      status: "You could build a laptop riser.",
    })} />);
    const seen = text(html);
    expect(seen).toContain(`Objects (${twins.length})`);
    expect(seen).toContain("tall can");
    expect(seen).toContain("pizza box");
    expect(seen).toMatch(/⌀\d+\.\d × \d+\.\d cm/);
    expect(seen).toContain(ideas[0]!.title);
    expect(html.match(/>Start<\/button>/g)).toHaveLength(ideas.length);
    expect(seen).toContain("scan_rec_synthetic_kit");
    expect(seen).toContain("recording");
    expect([html.includes(">Replay</button>"), html.includes(">New names</button>")]).toEqual([true, true]);
    expect(seen).toContain("You could build a laptop riser.");
  });

  it("shows an error instead of the status, and holds every button while a request is in flight", () => {
    const html = renderToStaticMarkup(<BuildPanelView {...props({ ideas, busy: true, status: "replay…", error: "replay: Cannot reach the server." })} />);
    expect(text(html)).toContain("replay: Cannot reach the server.");
    expect(text(html)).not.toContain("replay…");
    expect(html.match(/<button[^>]*>/g)!.every((b) => b.includes("disabled"))).toBe(true);
  });
});
