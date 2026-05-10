import { describe, expect, it } from "vitest";
import { createSourceSession, hashSource, updateSourceSession } from "./session";

describe("сессия исходника", () => {
  it("строит одинаковый hash для одинаковой строки", () => {
    expect(hashSource("const a = 1;")).toBe(hashSource("const a = 1;"));
  });

  it("меняет hash при изменении исходника", () => {
    expect(hashSource("const a = 1;")).not.toBe(hashSource("const a = 2;"));
  });

  it("разделяет lifecycle version и content hash", () => {
    const first = createSourceSession({ source: "export const a = 1;", version: 4 });
    const second = updateSourceSession(first, first.source);

    expect(second.version).toBe(5);
    expect(second.hash).toBe(first.hash);
  });

  it("задает language/version defaults и сохраняет file metadata при update", () => {
    const first = createSourceSession({
      source: "export const a = 1;",
      filePath: "/project/src/a.tsx",
      filename: "a.tsx",
    });
    const second = updateSourceSession(first, "export const a = 2;", "jsx");

    expect(first).toMatchObject({
      filePath: "/project/src/a.tsx",
      filename: "a.tsx",
      language: "ts",
      version: 1,
    });
    expect(second).toMatchObject({
      filePath: "/project/src/a.tsx",
      filename: "a.tsx",
      language: "jsx",
      version: 2,
    });
    expect(second.hash).toBe(hashSource("export const a = 2;"));
  });
});
