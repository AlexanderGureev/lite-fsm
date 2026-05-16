import type { GraphSourceAnchor } from "@lite-fsm/graph/view-model";
import { describe, expect, it } from "vitest";
import { createInitialSourceAccessState, setSourceAccessError, setSourceAccessLoading, setSourceAccessReady } from "./source-cache";
import { firstLocatedSourceAnchor, resolveSourceAccessFetchRequest, resolveSourceText } from "./source-resolver";

type LocatedTestAnchor = GraphSourceAnchor & { loc: NonNullable<GraphSourceAnchor["loc"]> };

const anchor = (fileName?: string): LocatedTestAnchor => ({
  kind: "machine",
  editable: false,
  loc: {
    ...(fileName ? { fileName } : {}),
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 4, offset: 3 },
  },
});

const files = [{ fileName: "store.ts", language: "ts" as const, roles: ["entry" as const], hash: "abc" }];

describe("resolver исходников local/project/paste", () => {
  it("разрешает pasted source только для текущего файла", () => {
    expect(resolveSourceText({ kind: "pasted-source", source: "const a = 1;", filename: "sample.ts" }, anchor())).toEqual({
      status: "ready",
      text: "const a = 1;",
    });
    expect(resolveSourceText({ kind: "pasted-source", source: "const a = 1;", filename: "sample.ts" }, anchor("other.ts"))).toEqual({
      status: "unavailable",
      message: "Source text for this file is not available in the current pasted source.",
    });
  });

  it("разрешает project export только из embedded sources", () => {
    expect(resolveSourceText({
      kind: "project-export",
      sources: { files: [{ fileName: "store.ts", language: "ts", hash: "abc", text: "const store = 1;" }] },
    }, anchor("store.ts"))).toEqual({ status: "ready", text: "const store = 1;" });

    expect(resolveSourceText({ kind: "project-export" }, anchor("store.ts"))).toEqual({
      status: "unavailable",
      message: "Source text is not included in the JSON export.",
    });
    expect(resolveSourceText({
      kind: "project-export",
      sources: { files: [{ fileName: "other.ts", language: "ts", hash: "def", text: "const other = 1;" }] },
    }, anchor("store.ts"))).toEqual({
      status: "unavailable",
      message: "Source text is not included in the JSON export.",
    });
  });

  it("разрешает local session через metadata и cache state", () => {
    const empty = createInitialSourceAccessState();
    const loading = setSourceAccessLoading(empty, "store.ts", "abc");
    const ready = setSourceAccessReady(empty, "store.ts", "abc", "const store = 1;");
    const stale = setSourceAccessError(empty, "store.ts", "abc", "source-stale", "Changed");
    const missing = setSourceAccessError(empty, "store.ts", "abc", "not-found", "Missing");

    expect(resolveSourceText({ kind: "local-session", sessionId: "s1", token: "t1", files, sourceAccess: empty }, anchor())).toEqual({
      status: "unavailable",
      message: "Source file metadata is not available for this local session.",
    });
    expect(resolveSourceText({ kind: "local-session", sessionId: "s1", token: "t1", files, sourceAccess: empty }, anchor("missing.ts"))).toEqual({
      status: "unavailable",
      message: "Source file metadata is not available for this local session.",
    });
    expect(resolveSourceText({ kind: "local-session", sessionId: "s1", token: "t1", files, sourceAccess: empty }, anchor("store.ts"))).toEqual({
      status: "loading",
    });
    expect(resolveSourceText({ kind: "local-session", sessionId: "s1", token: "t1", files, sourceAccess: loading }, anchor("store.ts"))).toEqual({
      status: "loading",
    });
    expect(resolveSourceText({ kind: "local-session", sessionId: "s1", token: "t1", files, sourceAccess: ready }, anchor("store.ts"))).toEqual({
      status: "ready",
      text: "const store = 1;",
    });
    expect(resolveSourceText({ kind: "local-session", sessionId: "s1", token: "t1", files, sourceAccess: stale }, anchor("store.ts"))).toEqual({
      status: "error",
      code: "source-stale",
      message: "Source file changed after this visualizer session was created. Restart lite-fsm visualize to refresh the graph.",
    });
    expect(resolveSourceText({ kind: "local-session", sessionId: "s1", token: "t1", files, sourceAccess: missing }, anchor("store.ts"))).toEqual({
      status: "error",
      code: "not-found",
      message: "Missing",
    });
  });

  it("создает fetch request только для local-session cache miss", () => {
    const empty = createInitialSourceAccessState();
    const ready = setSourceAccessReady(empty, "store.ts", "abc", "const store = 1;");

    expect(firstLocatedSourceAnchor([{ kind: "diagnostic", editable: false }, anchor("store.ts")])?.loc.fileName).toBe("store.ts");
    expect(resolveSourceAccessFetchRequest({ kind: "local-session", sessionId: "s1", token: "t1", files, sourceAccess: empty }, [anchor("store.ts")])).toEqual({
      sessionId: "s1",
      token: "t1",
      fileName: "store.ts",
      hash: "abc",
    });
    expect(resolveSourceAccessFetchRequest({ kind: "local-session", sessionId: "s1", token: "t1", files, sourceAccess: empty }, [anchor("missing.ts")])).toBeUndefined();
    expect(resolveSourceAccessFetchRequest({ kind: "local-session", sessionId: "s1", token: "t1", files, sourceAccess: empty }, [anchor()])).toBeUndefined();
    expect(resolveSourceAccessFetchRequest({ kind: "local-session", sessionId: "s1", token: "t1", files, sourceAccess: ready }, [anchor("store.ts")])).toBeUndefined();
    expect(resolveSourceAccessFetchRequest({ kind: "local-session", sessionId: "s1", token: "t1", files, sourceAccess: empty }, [])).toBeUndefined();
  });
});
