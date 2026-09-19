import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../src/config.js";
import { loadRules, loadVocab, standardShape } from "../src/build/data.js";
import { dimsCm, flatSize, heightOf, volumeOf } from "../src/build/shape.js";

describe("build data", () => {
  const vocab = loadVocab(REPO_ROOT);
  it("loads the vocabulary and every rule names only vocabulary objects", () => {
    expect(vocab.get("tall_can")?.label).toBe("tall can");
    expect(loadRules(REPO_ROOT, vocab).map((r) => r.rule_id)).toContain("rule_laptop_riser");
  });
  it("gives standard shapes in metres: boxes largest side first, cylinders upright", () => {
    expect(standardShape(vocab.get("pizza_box")!)).toEqual({ type: "box", size: [0.35, 0.35, 0.04] });
    expect(standardShape(vocab.get("tall_can")!)).toEqual({ type: "cylinder", axis: "y", diameter: 0.066, length: 0.157 });
    expect(standardShape(vocab.get("cardboard_box")!)).toBeNull();
  });
  it("measures shapes", () => {
    const can = { type: "cylinder" as const, axis: "y" as const, diameter: 0.066, length: 0.157 };
    expect(heightOf(can)).toBeCloseTo(0.157);
    expect(volumeOf({ type: "box", size: [0.1, 0.2, 0.3] })).toBeCloseTo(0.006);
    expect(dimsCm(can)).toEqual([15.7, 6.6, 6.6]);
    expect(flatSize([0.35, 0.04, 0.3])).toEqual([0.35, 0.04, 0.3]);
  });
});

describe("a rules file with a mistake in it", () => {
  // A copy of data/build in a temp "repo", with one rule broken: the server must refuse to start on it, not guess.
  const brokenRepo = (breakRule: (rule: { roles: { any_of: string[] }[]; steps: { place: string }[] }) => void) => {
    const root = mkdtempSync(join(tmpdir(), "build-data-"));
    mkdirSync(join(root, "data", "build"), { recursive: true });
    cpSync(join(REPO_ROOT, "data", "build", "vocabulary.json"), join(root, "data", "build", "vocabulary.json"));
    const rules = JSON.parse(readFileSync(join(REPO_ROOT, "data", "build", "rules.json"), "utf8"));
    breakRule(rules.rules[0]);
    writeFileSync(join(root, "data", "build", "rules.json"), JSON.stringify(rules));
    return root;
  };
  it("names the object that is not in the vocabulary", () => {
    const root = brokenRepo((r) => { r.roles[0]!.any_of = ["tall_cann"]; });
    expect(() => loadRules(root, loadVocab(root))).toThrow(/tall_cann, which is not in vocabulary\.json/);
  });
  it("names the step that uses a slot no role declares", () => {
    const root = brokenRepo((r) => { r.steps[0]!.place = "can#9"; });
    expect(() => loadRules(root, loadVocab(root))).toThrow(/can#9, which no role declares/);
  });
});
