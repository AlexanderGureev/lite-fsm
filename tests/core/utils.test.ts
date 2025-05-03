import { describe, it, expect } from "vitest";
import { compose } from "../../src/core/utils";

describe("compose", () => {
  it("should compose functions from right to left", () => {
    const add1 = (n: number) => n + 1;
    const multiply2 = (n: number) => n * 2;
    const subtract3 = (n: number) => n - 3;

    const composed = compose(
      (n: number) => subtract3(n),
      (n: number) => multiply2(n),
      (n: number) => add1(n),
    );

    // (5 + 1) * 2 - 3 = 9
    expect(composed(5)).toBe(9);
  });

  it("should return identity function when no arguments are passed", () => {
    const identity = compose();

    expect(identity(5)).toBe(5);
    expect(identity("test")).toBe("test");
    expect(identity(null)).toBe(null);
  });

  it("should work with a single function", () => {
    const add1 = (n: number) => n + 1;

    const composed = compose((n: number) => add1(n));

    expect(composed(5)).toBe(6);
  });

  it("should work with functions that return functions", () => {
    const add = (a: number, b: number) => a + b;
    const multiply = (a: number, b: number) => a * b;

    const composed = compose(
      (n: number) => n - 3,
      (n: number) => multiply(n, 2),
      (n: number) => add(n, 1),
    );

    // (5 + 1) * 2 - 3 = 9
    expect(composed(5)).toBe(9);
  });

  it("should work with async functions", async () => {
    const asyncAdd = async (x: number) => x + 1;
    const asyncMultiply = async (x: Promise<number> | number) => {
      const resolved = await x;
      return resolved * 2;
    };

    const composed = compose(
      (p: Promise<number>) => asyncMultiply(p),
      (n: number) => asyncAdd(n),
    );

    await expect(composed(5)).resolves.toBe(12);
  });

  it("should handle nested compositions", () => {
    const add1 = (n: number) => n + 1;
    const multiply2 = (n: number) => n * 2;
    const subtract3 = (n: number) => n - 3;

    const innerComposed = compose(
      (n: number) => multiply2(n),
      (n: number) => add1(n),
    );

    const outerComposed = compose((n: number) => subtract3(n), innerComposed);

    // ((5 + 1) * 2) - 3 = 9
    expect(outerComposed(5)).toBe(9);
  });
});
