import { describe, it, expect } from "vitest";
import { compose, deepFreeze } from "@lite-fsm/core/internal/utils";

describe("compose", () => {
  it("компонует функции справа налево: f(g(h(x)))", () => {
    const add1 = (n: number) => n + 1;
    const multiply2 = (n: number) => n * 2;
    const subtract3 = (n: number) => n - 3;

    expect(compose(subtract3, multiply2, add1)(5)).toBe(9);
  });

  it("без аргументов возвращает identity", () => {
    const identity = compose();

    expect(identity(5)).toBe(5);
    expect(identity(null)).toBe(null);
  });

  it("совместим с middleware-стилем: each next возвращает enhanced", () => {
    const trace: string[] = [];
    const mw =
      (label: string) =>
      (next: (x: number) => number) =>
      (x: number): number => {
        trace.push(`${label}:in`);
        const r = next(x + 1);
        trace.push(`${label}:out`);
        return r;
      };

    const enhanced = compose(mw("a"), mw("b"), mw("c"))((x: number) => x);

    expect(enhanced(0)).toBe(3);
    expect(trace).toEqual(["a:in", "b:in", "c:in", "c:out", "b:out", "a:out"]);
  });
});

describe("deepFreeze", () => {
  it("рекурсивно замораживает объект и все вложенные поля", () => {
    const obj = { a: 1, nested: { b: 2, deep: { c: 3 } } };

    deepFreeze(obj);

    expect(Object.isFrozen(obj)).toBe(true);
    expect(Object.isFrozen(obj.nested)).toBe(true);
    expect(Object.isFrozen(obj.nested.deep)).toBe(true);
  });

  it("возвращает примитивы и null без изменений", () => {
    expect(deepFreeze(null)).toBe(null);
    expect(deepFreeze(42)).toBe(42);
    expect(deepFreeze("str")).toBe("str");
  });

  it("идемпотентен: не падает на уже замороженном объекте", () => {
    const obj = Object.freeze({ a: 1 });
    expect(() => deepFreeze(obj)).not.toThrow();
    expect(deepFreeze(obj)).toBe(obj);
  });
});
