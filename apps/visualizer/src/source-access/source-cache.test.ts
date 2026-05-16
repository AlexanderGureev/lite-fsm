import { describe, expect, it } from "vitest";
import {
  createInitialSourceAccessState,
  getSourceAccessEntry,
  setSourceAccessError,
  setSourceAccessLoading,
  setSourceAccessReady,
  sourceAccessCacheKey,
} from "./source-cache";

describe("cache исходников local session", () => {
  it("создает collision-safe cache key для специальных символов", () => {
    const first = sourceAccessCacheKey("a:b/%#? файл.ts", "hash:1");
    const second = sourceAccessCacheKey("a:b/%#?", " файл.ts:hash:1");

    expect(first).not.toBe(second);
    expect(JSON.parse(first)).toEqual(["a:b/%#? файл.ts", "hash:1"]);
  });

  it("обновляет loading, ready и error entries по fileName/hash", () => {
    const empty = createInitialSourceAccessState();
    const loading = setSourceAccessLoading(empty, "store.ts", "abc");
    const sameLoading = setSourceAccessLoading(loading, "store.ts", "abc");
    const ready = setSourceAccessReady(loading, "store.ts", "abc", "const a = 1;");
    const sameReady = setSourceAccessReady(ready, "store.ts", "abc", "const a = 1;");
    const changedReady = setSourceAccessReady(ready, "store.ts", "abc", "const a = 2;");
    const error = setSourceAccessError(ready, "store.ts", "abc", "source-stale", "Changed");
    const sameError = setSourceAccessError(error, "store.ts", "abc", "source-stale", "Changed");
    const changedError = setSourceAccessError(error, "store.ts", "abc", "not-found", "Missing");
    const loadingAgain = setSourceAccessLoading(ready, "store.ts", "abc");

    expect(getSourceAccessEntry(empty, "store.ts", "abc")).toBeUndefined();
    expect(getSourceAccessEntry(loading, "store.ts", "abc")).toEqual({ status: "loading", fileName: "store.ts", hash: "abc" });
    expect(sameLoading).toBe(loading);
    expect(getSourceAccessEntry(ready, "store.ts", "abc")).toEqual({
      status: "ready",
      fileName: "store.ts",
      hash: "abc",
      text: "const a = 1;",
    });
    expect(sameReady).toBe(ready);
    expect(getSourceAccessEntry(changedReady, "store.ts", "abc")).toEqual({
      status: "ready",
      fileName: "store.ts",
      hash: "abc",
      text: "const a = 2;",
    });
    expect(getSourceAccessEntry(error, "store.ts", "abc")).toEqual({
      status: "error",
      fileName: "store.ts",
      hash: "abc",
      code: "source-stale",
      message: "Changed",
    });
    expect(sameError).toBe(error);
    expect(getSourceAccessEntry(changedError, "store.ts", "abc")).toEqual({
      status: "error",
      fileName: "store.ts",
      hash: "abc",
      code: "not-found",
      message: "Missing",
    });
    expect(getSourceAccessEntry(loadingAgain, "store.ts", "abc")).toEqual({ status: "loading", fileName: "store.ts", hash: "abc" });
  });
});
