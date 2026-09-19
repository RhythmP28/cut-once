import { describe, expect, it } from "vitest";
import { shapeSize } from "./format";

describe("shapeSize", () => {
  it("writes a cylinder as its width and length, and a box as its three sides, in cm", () => {
    expect(shapeSize({ type: "cylinder", axis: "y", diameter: 0.066, length: 0.157 })).toBe("⌀6.6 × 15.7 cm");
    expect(shapeSize({ type: "box", size: [0.35, 0.04, 0.35] })).toBe("35.0 × 4.0 × 35.0 cm");
  });
});
