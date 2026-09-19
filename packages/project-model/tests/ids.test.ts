import { expect, it } from "vitest";
import { toMaterialId, toPartId } from "../src/index.js";

it("slugs a name", () => expect(toPartId("Left rear leg")).toBe("part_left_rear_leg"));
it("strips punctuation", () => expect(toPartId("Leg (rear, left)")).toBe("part_leg_rear_left"));
it("numbers collisions", () => expect(toPartId("Left rear leg", new Set(["part_left_rear_leg"]))).toBe("part_left_rear_leg_2"));
it("handles an empty name", () => expect(toPartId("???")).toBe("part_part"));
it("makes material ids", () => expect(toMaterialId("Steel leg 700 mm")).toBe("mat_steel_leg_700_mm"));
