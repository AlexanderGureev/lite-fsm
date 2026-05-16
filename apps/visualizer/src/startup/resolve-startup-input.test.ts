import { describe, expect, it } from "vitest";
import { resolveStartupInput } from "./resolve-startup-input";

describe("startup input resolver", () => {
  it("выбирает pasted-source без query params", () => {
    expect(resolveStartupInput("", "http://localhost:5174")).toEqual({ kind: "pasted-source", key: "pasted-source" });
  });

  it("выбирает project-export для config и валидирует URL", () => {
    expect(resolveStartupInput("?config=%2Fexports%2Fgraph.json", "http://localhost:5174")).toMatchObject({
      kind: "project-export",
      key: "project-export:http://localhost:5174/exports/graph.json",
      fileName: "graph.json",
    });
    expect(resolveStartupInput("?config=%20https%3A%2F%2Fexample.com%2Fexports%2Fgraph.json%3Fv%3D1%20", "http://localhost:5174")).toMatchObject({
      kind: "project-export",
      key: "project-export:https://example.com/exports/graph.json?v=1",
      fileName: "graph.json",
    });
    expect(resolveStartupInput("?config=exports%2Fgraph.json", "http://localhost:5174")).toMatchObject({
      kind: "project-export",
      key: "project-export:invalid:exports/graph.json",
      issue: { message: "Project graph export URL must be absolute or root-relative." },
    });
    expect(resolveStartupInput("?config=", "http://localhost:5174")).toMatchObject({
      kind: "project-export",
      fileName: "project-export.json",
      issue: { message: "Query parameter \"config\" is empty." },
    });
  });

  it("выбирает local-session и дает session приоритет над config", () => {
    expect(resolveStartupInput("?session=token-1", "http://localhost:5174")).toEqual({
      kind: "local-session",
      key: "local-session:token-1",
      token: "token-1",
    });
    expect(resolveStartupInput("?session=%20token-1%20", "http://localhost:5174")).toEqual({
      kind: "local-session",
      key: "local-session:token-1",
      token: "token-1",
    });
    expect(resolveStartupInput("?session=", "http://localhost:5174")).toEqual({
      kind: "local-session",
      key: "local-session:",
      token: "",
    });
    expect(resolveStartupInput("?config=%2Fexports%2Fgraph.json&session=token-2", "http://localhost:5174")).toEqual({
      kind: "local-session",
      key: "local-session:token-2",
      token: "token-2",
    });
  });
});
