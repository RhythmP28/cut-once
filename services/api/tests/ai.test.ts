import { describe, expect, it } from "vitest";
import { aiFor, modelFor, ready } from "../src/ai.js";
import { loadConfig } from "../src/config.js";
import { jsonCall } from "../src/llm.js";
import { omniJsonCall } from "../src/omni.js";

const omni = { omniKey: "q", omniBaseUrl: "https://omni.example/v1" };
const openai = { openaiKey: "o" };
const cfg = (over: object = {}) => loadConfig({}, over);

describe("aiFor: which provider and model does a job", () => {
  it("uses OMNI by default when it is set up", () => {
    const ai = aiFor(cfg({ ...omni, ...openai }), "turn");
    expect([ai?.provider, ai?.model, ai?.call]).toEqual(["omni", "qwen3.5-omni-flash", omniJsonCall]);
  });
  it("uses the other provider when the chosen one has no key, and nothing when neither has", () => {
    expect(aiFor(cfg(openai), "ideas")?.provider).toBe("openai");                       // OMNI is the default but not set up
    expect(aiFor(cfg({ ...omni, kitAi: { turn: "openai", label: "openai", ideas: "openai" } }), "label")?.provider).toBe("omni");
    expect(aiFor(cfg(), "turn")).toBeNull();
  });
  it("follows each job's own setting", () => {
    const c = cfg({ ...omni, ...openai, kitAi: { turn: "omni", label: "openai", ideas: "omni" } });
    expect(["turn", "label", "ideas"].map((j) => aiFor(c, j as "turn")?.provider)).toEqual(["omni", "openai", "omni"]);
    expect(aiFor(c, "label")?.call).toBe(jsonCall);
  });
  it("can be asked for one provider explicitly, as the fallback path does", () => {
    const c = cfg({ ...omni, ...openai });
    expect(aiFor(c, "turn", "openai")?.provider).toBe("openai");
  });
  it("needs both the OMNI key and its base URL", () => {
    expect(ready(cfg({ omniKey: "q" }), "omni")).toBe(false);
    expect(ready(cfg(omni), "omni")).toBe(true);
    expect(ready(cfg(openai), "openai")).toBe(true);
  });
});

describe("modelFor", () => {
  it("names each job's model on each provider, from the settings the repo already uses", () => {
    const c = cfg({ openaiModel: "gpt-x", omniModel: "qwen-flash", omniIdeasModel: "qwen-plus" });
    const env = { OPENAI_COPILOT_MODEL: "gpt-vision", OPENAI_LABEL_MODEL: "gpt-label", OPENAI_IDEAS_MODEL: "" };
    expect([modelFor(c, "turn", "omni", env), modelFor(c, "label", "omni", env), modelFor(c, "ideas", "omni", env)]).toEqual(["qwen-flash", "qwen-flash", "qwen-plus"]);
    expect([modelFor(c, "turn", "openai", env), modelFor(c, "label", "openai", env), modelFor(c, "ideas", "openai", env)]).toEqual(["gpt-vision", "gpt-label", "gpt-x"]);
    expect(modelFor(cfg({ omniModel: "qwen-flash" }), "ideas", "omni", {})).toBe("qwen-flash");         // no ideas model: the main one
  });
});
