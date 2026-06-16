import { describe, expect, it } from "vitest";

import {
  createSeededRandom,
  randomBetween,
  randomInt,
} from "../../../apps/playground/app/examples/entities-rts/store/spawn/random";

describe("seeded random для RTS", () => {
  it("создает повторяемую последовательность для seed", () => {
    const left = createSeededRandom("map-seed");
    const right = createSeededRandom("map-seed");
    const other = createSeededRandom("other-seed");

    expect([left(), left(), left()]).toEqual([right(), right(), right()]);
    expect(left()).not.toBe(other());
  });

  it("поддерживает ranges и проверяет границы randomInt", () => {
    const random = createSeededRandom("");
    const value = randomBetween(random, 10, 20);
    const integer = randomInt(random, 2, 5);

    expect(value).toBeGreaterThanOrEqual(10);
    expect(value).toBeLessThan(20);
    expect(integer).toBeGreaterThanOrEqual(2);
    expect(integer).toBeLessThan(5);
    expect(() => randomInt(random, 5, 5)).toThrow("randomInt expects maxExclusive to be greater than min");
  });
});
