import { describe, it, expect } from "vitest";
import { compose } from "../../src/core/utils";

describe("compose", () => {
  it("должен компоновать функции справа налево", () => {
    const add1 = (n: number) => n + 1;
    const multiply2 = (n: number) => n * 2;
    const subtract3 = (n: number) => n - 3;

    const composed = compose(subtract3, multiply2, add1);

    // (5 + 1) * 2 - 3 = 9
    expect(composed(5)).toBe(9);
  });

  it("должен возвращать функцию идентичности, когда аргументы не переданы", () => {
    const identity = compose();

    expect(identity(5)).toBe(5);
    expect(identity("test")).toBe("test");
    expect(identity(null)).toBe(null);
  });

  it("должен работать с одной функцией", () => {
    const add1 = (n: number) => n + 1;
    const composed = compose(add1);
    expect(composed(5)).toBe(6);
  });

  it("должен работать с функциями, возвращающими функции", () => {
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

  it("должен работать с асинхронными функциями", async () => {
    const asyncAdd = async (x: number) => x + 1;
    const asyncMultiply = async (x: Promise<number> | number) => {
      const resolved = await x;
      return resolved * 2;
    };

    const composed = compose(asyncMultiply, asyncAdd);

    await expect(composed(5)).resolves.toBe(12);
  });

  it("должен обрабатывать вложенные композиции", () => {
    const add1 = (n: number) => n + 1;
    const multiply2 = (n: number) => n * 2;
    const subtract3 = (n: number) => n - 3;

    const innerComposed = compose(multiply2, add1);
    const outerComposed = compose(subtract3, innerComposed);

    // ((5 + 1) * 2) - 3 = 9
    expect(outerComposed(5)).toBe(9);
  });
});
