import { describe, expect, it } from "vitest";

import {
  createDocumentationManager,
  createNoopDocumentationManager,
  flushDocumentationEffects,
} from "../fixtures/plugin-system-documentation";

describe("plugin system documentation fixture", () => {
  it("no-op plugin не меняет базовый manager pipeline", () => {
    const manager = createNoopDocumentationManager();

    expect(manager.getState().noop).toEqual({ state: "idle", context: { count: 0 } });

    manager.transition({ type: "PING" });

    expect(manager.getState().noop).toEqual({ state: "active", context: { count: 1 } });
    expect(manager.getSnapshot()).toEqual({
      machines: {
        noop: { state: "active", context: { count: 1 } },
      },
    });
  });

  it("покрывает routeMeta, manager extension, intercept/hooks и storage runtime", () => {
    const trace: string[] = [];
    const manager = createDocumentationManager(trace);

    expect(manager.getState().document).toEqual({ ready: false, value: "empty" });

    manager.transition({
      type: "LOAD_DOCUMENT",
      payload: { documentId: "42", tenantId: "acme" },
      meta: { cacheKey: "document", tenantId: "acme" },
    });

    expect(manager.getState().document).toEqual({ ready: true, value: "acme:42" });
    expect(trace).toContain("intercept:LOAD_DOCUMENT");
    expect(trace).toContain("beforeEffects:LOAD_DOCUMENT");

    const action = manager.cache.refresh("manual");

    expect(action).toMatchObject({ type: "CACHE_REFRESH", payload: { cacheKey: "manual" } });
    expect(manager.getState().document).toEqual({ ready: true, value: "manual" });
    expect(trace).toContain("manager:manual");
    expect(trace).toContain("intercept:CACHE_REFRESH");

    expect(manager.dehydrate().storage?.["document-cache"]).toMatchObject({
      commits: 2,
      lastAction: "CACHE_REFRESH",
    });
  });

  it("покрывает scoped deps, scoped transition и plugin event в machine events", async () => {
    const trace: string[] = [];
    const manager = createDocumentationManager(trace);

    manager.setDependencies({
      workflowLog: { push: (entry) => trace.push(`workflow:${entry}`) },
    });
    manager.transition({ type: "START_WORKFLOW" });

    await flushDocumentationEffects();

    expect(manager.getState().workflow).toEqual({ state: "done", context: { runs: 1 } });
    expect(manager.getState().document).toEqual({ ready: true, value: "workflow" });
    expect(trace).toContain("workflow:effect:workflow:START_WORKFLOW");
    expect(trace).toContain("scopedTransition:workflow");
    expect(trace).toContain("beforeEffects:CACHE_REFRESH");
  });
});
