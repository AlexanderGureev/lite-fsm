// @vitest-environment jsdom
import React from "react";
import { renderToString } from "react-dom/server";
import { act, render, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MachineManager } from "@lite-fsm/core";
import type { FSMEvent, MachineConfig } from "@lite-fsm/core";
import {
  defineEntitySpawn,
  defineSpawnEvents,
  entitiesPlugin,
  f32,
  spawnEvent,
  string,
} from "@lite-fsm/entities";
import { useEntityCount, useEntityList, useEntitySnapshot } from "@lite-fsm/entities/react";
import { FSMContextProvider, FSMHydrationBoundary, useStorageHydrationPreview } from "@lite-fsm/react";

import { getEntityRuntimeState } from "../../packages/entities/src/runtime/state";
import {
  FSMHydrationOverlayProvider,
  FSMServerSnapshotProvider,
  NO_STORAGE_HYDRATION_PREVIEW,
  readSnapshotStoragePreview,
} from "../../packages/react/src/hydrationOverlay";
import type { EntityAccess, EntityIndex } from "@lite-fsm/entities";

type SpawnPayload = {
  readonly id: string;
  readonly groupTag: string;
  readonly x: number;
  readonly label: string;
};
type MovementSelf = {
  readonly indices: readonly EntityIndex[];
  readonly x: Float32Array;
  readonly label: string[];
};
type MovementMeta = {
  readonly self: MovementSelf;
  payloadFor(entity: EntityIndex): { readonly x: number; readonly label: string };
};

const movementActor = {
  storage: "entity",
  config: {
    __INIT: { ENTITY_SPAWNED: "READY" },
    READY: { MOVE: "READY", KILL: "DEAD" },
    DEAD: {},
  },
  initialState: "__INIT",
  initialContext: {
    x: f32(),
    label: string(),
  },
  spawnSchema: {
    x: f32(),
    label: string(),
  },
  despawnOn: "DEAD",
  reducer(_slice: unknown, action: { readonly type: string; readonly payload?: unknown }, meta: MovementMeta) {
    if (action.type === "ENTITY_SPAWNED") {
      for (const entity of meta.self.indices) {
        const payload = meta.payloadFor(entity);
        meta.self.x[entity] = payload.x;
        meta.self.label[entity] = payload.label;
      }
      return;
    }

    if (action.type !== "MOVE") return;
    const dx = (action.payload as { readonly dx: number }).dx;
    for (const entity of meta.self.indices) {
      meta.self.x[entity] += dx;
    }
  },
} as const;

const machines = { movementActor };
type Machines = typeof machines;

const spawnEvents = defineSpawnEvents({
  SPAWN_ENTITY: spawnEvent<SpawnPayload>(),
});

const spawn = defineEntitySpawn(machines, spawnEvents)({
  SPAWN_ENTITY: (payload) => ({
    id: payload.id,
    groupTag: payload.groupTag,
    actors: {
      movementActor: {
        x: payload.x,
        label: payload.label,
      },
    },
  }),
});

const createEntityManager = () => MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });

const spawnEntity = (
  manager: ReturnType<typeof createEntityManager>,
  id: string,
  groupTag: string,
  x: number,
  label = id,
) => {
  manager.transition({ type: "SPAWN_ENTITY", payload: { id, groupTag, x, label } });
};

const wrap =
  (manager: ReturnType<typeof createEntityManager>) =>
  ({ children }: { readonly children: React.ReactNode }) => (
    <FSMContextProvider machineManager={manager}>{children}</FSMContextProvider>
  );

const storageOverlay = (manager: ReturnType<typeof createEntityManager>, preview: unknown) => ({
  getState: manager.getState,
  getStoragePreview: (storageKind: string) =>
    storageKind === "entity" ? { hasPreview: true, preview } : NO_STORAGE_HYDRATION_PREVIEW,
});

const emptyServerOverlay = (manager: ReturnType<typeof createEntityManager>) => ({
  getState: manager.getState,
  getStoragePreview: () => NO_STORAGE_HYDRATION_PREVIEW,
});

const entityAccess = (manager: ReturnType<typeof createEntityManager>): EntityAccess<Machines> =>
  manager.entities();

describe("@lite-fsm/entities/react — чтение committed state", () => {
  it("useEntitySnapshot возвращает публичный snapshot строки", () => {
    const manager = createEntityManager();
    spawnEntity(manager, "unit/a", "enemy", 3, "scout");

    const { result } = renderHook(() => useEntitySnapshot<Machines>("movementActor", "unit/a"), {
      wrapper: wrap(manager),
    });

    expect(result.current).toEqual({
      entityId: "unit/a",
      groupTag: "enemy",
      state: "READY",
      context: { x: 3, label: "scout" },
    });
  });

  it("useEntitySnapshot с null и undefined возвращает стабильный undefined", () => {
    const manager = createEntityManager();

    const { result, rerender } = renderHook(
      ({ entityId }: { readonly entityId: string | null | undefined }) =>
        useEntitySnapshot<Machines>("movementActor", entityId),
      {
        initialProps: { entityId: null as string | null | undefined },
        wrapper: wrap(manager),
      },
    );
    const first = result.current;

    rerender({ entityId: undefined });

    expect(first).toBeUndefined();
    expect(result.current).toBeUndefined();
  });

  it("обновление одной строки не ререндерит потребителя другой строки", () => {
    const manager = createEntityManager();
    spawnEntity(manager, "unit/a", "enemy", 1);
    spawnEntity(manager, "unit/b", "enemy", 10);
    const renders = { a: 0, b: 0 };

    const Row = ({ id, slot }: { readonly id: string; readonly slot: "a" | "b" }) => {
      renders[slot] += 1;
      const row = useEntitySnapshot<Machines>("movementActor", id);
      return <span data-testid={slot}>{row?.context.x}</span>;
    };

    const view = render(
      <FSMContextProvider machineManager={manager}>
        <Row id="unit/a" slot="a" />
        <Row id="unit/b" slot="b" />
      </FSMContextProvider>,
    );
    const initialB = renders.b;

    act(() => {
      manager.transition({ type: "MOVE", payload: { dx: 2 }, meta: { entityId: "unit/a" } });
    });

    expect(view.getByTestId("a").textContent).toBe("3");
    expect(view.getByTestId("b").textContent).toBe("10");
    expect(renders.a).toBeGreaterThan(1);
    expect(renders.b).toBe(initialB);
  });

  it("useEntityCount и useEntityList фильтруют по groupTag и сохраняют список при той же membership", () => {
    const manager = createEntityManager();
    spawnEntity(manager, "unit/a", "enemy", 1);
    spawnEntity(manager, "unit/b", "ally", 2);
    let listRenderCount = 0;
    let countRenderCount = 0;
    let firstList: readonly string[] | undefined;

    const Probe = () => {
      listRenderCount += 1;
      const list = useEntityList<Machines>("movementActor", { groupTag: "enemy" });
      firstList ??= list;
      return <span data-testid="list">{list.join(",")}</span>;
    };
    const Count = () => {
      countRenderCount += 1;
      return <span data-testid="count">{useEntityCount<Machines>("movementActor", { groupTag: "enemy" })}</span>;
    };

    const view = render(
      <FSMContextProvider machineManager={manager}>
        <Probe />
        <Count />
      </FSMContextProvider>,
    );

    expect(view.getByTestId("list").textContent).toBe("unit/a");
    expect(view.getByTestId("count").textContent).toBe("1");

    act(() => {
      manager.transition({ type: "MOVE", payload: { dx: 1 }, meta: { entityId: "unit/a" } });
    });

    expect(listRenderCount).toBe(1);
    expect(countRenderCount).toBe(1);
    expect(firstList).toEqual(["unit/a"]);

    act(() => {
      spawnEntity(manager, "unit/c", "enemy", 4);
    });

    expect(view.getByTestId("list").textContent).toBe("unit/a,unit/c");
    expect(view.getByTestId("count").textContent).toBe("2");
    expect(listRenderCount).toBe(2);
    expect(countRenderCount).toBe(2);

    act(() => {
      manager.transition({ type: "KILL", meta: { entityId: "unit/a" } });
    });

    expect(view.getByTestId("list").textContent).toBe("unit/c");
    expect(view.getByTestId("count").textContent).toBe("1");
  });

  it("useEntityList и useEntityCount возвращают empty snapshots для пустого store и missing group", () => {
    const manager = createEntityManager();
    const { result: emptyList } = renderHook(() => useEntityList<Machines>("movementActor"), {
      wrapper: wrap(manager),
    });
    const { result: emptyCount } = renderHook(() => useEntityCount<Machines>("movementActor"), {
      wrapper: wrap(manager),
    });

    expect(emptyList.current).toEqual([]);
    expect(emptyCount.current).toBe(0);

    act(() => {
      spawnEntity(manager, "unit/a", "ally", 1);
    });

    const { result: missingList } = renderHook(
      () => useEntityList<Machines>("movementActor", { groupTag: "enemy" }),
      {
        wrapper: wrap(manager),
      },
    );
    const { result: missingCount } = renderHook(
      () => useEntityCount<Machines>("movementActor", { groupTag: "enemy" }),
      {
        wrapper: wrap(manager),
      },
    );

    expect(missingList.current).toEqual([]);
    expect(missingCount.current).toBe(0);
  });

  it("useEntitySnapshot возвращает undefined для live entity без row выбранного template", () => {
    const manager = createEntityManager();
    spawnEntity(manager, "unit/a", "enemy", 1);
    const runtime = getEntityRuntimeState(manager.entities());
    const entity = runtime.entityStore.indexById["unit/a"];
    runtime.actorStores.movementActor.presence[entity] = 0;

    const { result } = renderHook(() => useEntitySnapshot<Machines>("movementActor", "unit/a"), {
      wrapper: wrap(manager),
    });

    expect(result.current).toBeUndefined();
  });

  it("useEntityList меняет ссылку при hydrate replacement с тем же count и другим id", () => {
    const manager = createEntityManager();
    const replacement = createEntityManager();
    spawnEntity(manager, "unit/a", "enemy", 1);
    spawnEntity(replacement, "unit/c", "enemy", 3);
    let lastList: readonly string[] | undefined;

    const Probe = () => {
      lastList = useEntityList<Machines>("movementActor", { groupTag: "enemy" });
      return <span data-testid="list">{lastList.join(",")}</span>;
    };

    const view = render(
      <FSMContextProvider machineManager={manager}>
        <Probe />
      </FSMContextProvider>,
    );
    const firstList = lastList;

    act(() => {
      manager.hydrate(replacement.dehydrate());
    });

    expect(view.getByTestId("list").textContent).toBe("unit/c");
    expect(lastList).not.toBe(firstList);
  });

  it("despawn и повторный spawn того же entityId инвалидируют snapshot", () => {
    const manager = createEntityManager();
    spawnEntity(manager, "unit/a", "enemy", 1, "first");

    const { result } = renderHook(() => useEntitySnapshot<Machines>("movementActor", "unit/a"), {
      wrapper: wrap(manager),
    });
    const first = result.current;

    act(() => {
      manager.transition({ type: "KILL", meta: { entityId: "unit/a" } });
    });
    expect(result.current).toBeUndefined();

    act(() => {
      spawnEntity(manager, "unit/a", "enemy", 9, "second");
    });

    expect(result.current).not.toBe(first);
    expect(result.current?.context).toEqual({ x: 9, label: "second" });
  });

  it("бросает clear errors для отсутствующего runtime, unknown templateKey и invalid groupTag", () => {
    const plainManager = MachineManager({ counter: { config: { READY: {} }, initialState: "READY", initialContext: {} } });

    expect(() =>
      renderHook(() => useEntityCount("movementActor" as never), {
        wrapper: ({ children }) => <FSMContextProvider machineManager={plainManager}>{children}</FSMContextProvider>,
      }),
    ).toThrow(/entitiesPlugin/);

    const manager = createEntityManager();
    expect(() =>
      renderHook(() => useEntityCount("unknownActor" as never), {
        wrapper: wrap(manager),
      }),
    ).toThrow(/unknown entity actor template/);

    expect(() =>
      renderHook(() => useEntityList<Machines>("movementActor", { groupTag: 1 } as never), {
        wrapper: wrap(manager),
      }),
    ).toThrow(/groupTag must be a string/);
  });

  it("бросает clear error если runtime не имеет React capability", () => {
    const manager = createEntityManager();
    const runtime = getEntityRuntimeState(manager.entities());
    const reactRuntime = runtime.react;
    delete runtime.react;

    expect(() =>
      renderHook(() => useEntityCount<Machines>("movementActor"), {
        wrapper: wrap(manager),
      }),
    ).toThrow(/React subscription\/preview capability/);

    runtime.react = reactRuntime;
  });

  it("бросает clear error если present row не имеет public state snapshot", () => {
    const manager = createEntityManager();
    spawnEntity(manager, "unit/a", "enemy", 1);
    const runtime = getEntityRuntimeState(manager.entities());
    const entity = runtime.entityStore.indexById["unit/a"];
    runtime.actorStores.movementActor.stateCode[entity] = -1;

    expect(() =>
      renderHook(() => useEntitySnapshot<Machines>("movementActor", "unit/a"), {
        wrapper: wrap(manager),
      }),
    ).toThrow(/public state snapshot/);
  });
});

describe("@lite-fsm/entities/react — SSR preview storage", () => {
  it("useStorageHydrationPreview без providers возвращает empty preview", () => {
    const { result } = renderHook(() => useStorageHydrationPreview("entity"));

    expect(result.current).toEqual({
      hasPreview: false,
      preview: undefined,
      hasServerPreview: false,
      serverPreview: undefined,
    });
  });

  it("readSnapshotStoragePreview возвращает fallback без parent preview", () => {
    expect(readSnapshotStoragePreview({}, undefined, "entity")).toBe(NO_STORAGE_HYDRATION_PREVIEW);
  });

  it("FSMHydrationBoundary без storage preview оставляет bridge empty при state overlay", () => {
    type CounterEvent = FSMEvent<"INC">;
    type CounterConfig = { readonly READY: { readonly INC: "READY" } };
    const counter = {
      config: { READY: { INC: "READY" } },
      initialState: "READY",
      initialContext: { count: 0 },
      reducer: (slice: { readonly state: "READY"; readonly context: { readonly count: number } }) => ({
        state: "READY" as const,
        context: { count: slice.context.count + 1 },
      }),
    } satisfies MachineConfig<CounterConfig, { readonly count: number }, CounterEvent>;
    const counterMachines = { counter };
    const manager = MachineManager(counterMachines);
    const source = MachineManager(counterMachines);
    source.transition({ type: "INC" });

    const Probe = () => {
      const preview = useStorageHydrationPreview("entity");
      return (
        <span data-testid="storage">
          {String(preview.hasPreview)}:{String(preview.hasServerPreview)}
        </span>
      );
    };

    const view = render(
      <FSMContextProvider machineManager={manager}>
        <FSMHydrationBoundary<typeof counterMachines>
          snapshot={source.dehydrate()}
        >
          <Probe />
        </FSMHydrationBoundary>
      </FSMContextProvider>,
    );

    expect(view.getByTestId("storage").textContent).toBe("false:false");
  });

  it("FSMHydrationBoundary читает storage.entity preview на server render без мутации runtime", () => {
    const source = createEntityManager();
    const client = createEntityManager();
    spawnEntity(source, "unit/a", "enemy", 7, "preview");
    const snapshot = source.dehydrate();

    const Probe = () => {
      const row = useEntitySnapshot<Machines>("movementActor", "unit/a");
      const preview = useStorageHydrationPreview("entity");
      return (
        <span>
          {row?.context.label}:{String(preview.hasPreview)}:{String(preview.hasServerPreview)}
        </span>
      );
    };

    const html = renderToString(
      <FSMContextProvider machineManager={client}>
        <FSMHydrationBoundary<Machines> snapshot={snapshot}>
          <Probe />
        </FSMHydrationBoundary>
      </FSMContextProvider>,
    );

    expect(html.replace(/<!--.*?-->/g, "")).toContain("preview:true:true");
    expect(entityAccess(client).get("movementActor").count).toBe(0);
  });

  it("nested boundary наследует parent storage.entity preview если child не содержит storage.entity", () => {
    const source = createEntityManager();
    const client = createEntityManager();
    spawnEntity(source, "unit/a", "enemy", 1, "parent");

    const Probe = () => {
      const row = useEntitySnapshot<Machines>("movementActor", "unit/a");
      return <span>{row?.context.label}</span>;
    };

    const html = renderToString(
      <FSMContextProvider machineManager={client}>
        <FSMHydrationBoundary<Machines> snapshot={source.dehydrate()}>
          <FSMHydrationBoundary<Machines> snapshot={{ machines: {} }}>
            <Probe />
          </FSMHydrationBoundary>
        </FSMHydrationBoundary>
      </FSMContextProvider>,
    );

    expect(html).toContain("parent");
  });

  it("nested boundary заменяет parent storage.entity preview если child содержит storage.entity", () => {
    const parent = createEntityManager();
    const child = createEntityManager();
    const client = createEntityManager();
    spawnEntity(parent, "unit/a", "enemy", 1, "parent");
    spawnEntity(child, "unit/a", "enemy", 2, "child");

    const Probe = () => {
      const row = useEntitySnapshot<Machines>("movementActor", "unit/a");
      const list = useEntityList<Machines>("movementActor", { groupTag: "enemy" });
      const count = useEntityCount<Machines>("movementActor", { groupTag: "enemy" });
      return (
        <span>
          {row?.context.label}:{list.join(",")}:{count}
        </span>
      );
    };

    const html = renderToString(
      <FSMContextProvider machineManager={client}>
        <FSMHydrationBoundary<Machines> snapshot={parent.dehydrate()}>
          <FSMHydrationBoundary<Machines> snapshot={child.dehydrate()}>
            <Probe />
          </FSMHydrationBoundary>
        </FSMHydrationBoundary>
      </FSMContextProvider>,
    );

    expect(html.replace(/<!--.*?-->/g, "")).toContain("child:unit/a:1");
  });

  it("preview index игнорирует dead slots из storage.entity", () => {
    const source = createEntityManager();
    const client = createEntityManager();
    spawnEntity(source, "unit/a", "enemy", 1, "dead");
    spawnEntity(source, "unit/b", "enemy", 2, "live");
    source.transition({ type: "KILL", meta: { entityId: "unit/a" } });

    const Probe = () => {
      const row = useEntitySnapshot<Machines>("movementActor", "unit/b");
      const list = useEntityList<Machines>("movementActor", { groupTag: "enemy" });
      return (
        <span>
          {row?.context.label}:{list.join(",")}
        </span>
      );
    };

    const html = renderToString(
      <FSMContextProvider machineManager={client}>
        <FSMHydrationBoundary<Machines> snapshot={source.dehydrate()}>
          <Probe />
        </FSMHydrationBoundary>
      </FSMContextProvider>,
    );

    expect(html.replace(/<!--.*?-->/g, "")).toContain("live:unit/b");
  });

  it("hooks читают active storage preview из generic bridge на client render", () => {
    const source = createEntityManager();
    const client = createEntityManager();
    spawnEntity(source, "unit/a", "enemy", 5, "active");
    const preview = source.dehydrate().storage?.entity;

    const Probe = () => {
      const row = useEntitySnapshot<Machines>("movementActor", "unit/a");
      const list = useEntityList<Machines>("movementActor", { groupTag: "enemy" });
      const count = useEntityCount<Machines>("movementActor", { groupTag: "enemy" });
      return (
        <span data-testid="preview">
          {row?.context.label}:{list.join(",")}:{count}
        </span>
      );
    };

    const view = render(
      <FSMContextProvider machineManager={client}>
        <FSMHydrationOverlayProvider value={storageOverlay(client, preview)}>
          <Probe />
        </FSMHydrationOverlayProvider>
      </FSMContextProvider>,
    );

    expect(view.getByTestId("preview").textContent).toBe("active:unit/a:1");
    expect(entityAccess(client).get("movementActor").count).toBe(0);
  });

  it("getServerSnapshot наследует active preview если server preview отсутствует", () => {
    const source = createEntityManager();
    const client = createEntityManager();
    spawnEntity(source, "unit/a", "enemy", 5, "server-fallback");
    const preview = source.dehydrate().storage?.entity;

    const Probe = () => {
      const row = useEntitySnapshot<Machines>("movementActor", "unit/a");
      const list = useEntityList<Machines>("movementActor", { groupTag: "enemy" });
      const count = useEntityCount<Machines>("movementActor", { groupTag: "enemy" });
      const storagePreview = useStorageHydrationPreview("entity");
      return (
        <span>
          {row?.context.label}:{list.join(",")}:{count}:{String(storagePreview.hasPreview)}:
          {String(storagePreview.hasServerPreview)}
        </span>
      );
    };

    const html = renderToString(
      <FSMContextProvider machineManager={client}>
        <FSMHydrationOverlayProvider value={storageOverlay(client, preview)}>
          <FSMServerSnapshotProvider value={emptyServerOverlay(client)}>
            <Probe />
          </FSMServerSnapshotProvider>
        </FSMHydrationOverlayProvider>
      </FSMContextProvider>,
    );

    expect(html.replace(/<!--.*?-->/g, "")).toContain("server-fallback:unit/a:1:true:false");
    expect(entityAccess(client).get("movementActor").count).toBe(0);
  });

  it("getServerSnapshot читает committed runtime если storage preview отсутствует", () => {
    const manager = createEntityManager();
    spawnEntity(manager, "unit/a", "enemy", 5, "committed");

    const Probe = () => {
      const row = useEntitySnapshot<Machines>("movementActor", "unit/a");
      const list = useEntityList<Machines>("movementActor", { groupTag: "enemy" });
      const count = useEntityCount<Machines>("movementActor", { groupTag: "enemy" });
      return (
        <span>
          {row?.context.label}:{list.join(",")}:{count}
        </span>
      );
    };

    const html = renderToString(
      <FSMContextProvider machineManager={manager}>
        <Probe />
      </FSMContextProvider>,
    );

    expect(html.replace(/<!--.*?-->/g, "")).toContain("committed:unit/a:1");
  });

  it("preview validation error из bridge не мутирует committed runtime", () => {
    const manager = createEntityManager();

    const Probe = () => <span>{useEntityCount<Machines>("movementActor")}</span>;

    expect(() =>
      renderToString(
        <FSMContextProvider machineManager={manager}>
          <FSMHydrationOverlayProvider value={storageOverlay(manager, 1)}>
            <Probe />
          </FSMHydrationOverlayProvider>
        </FSMContextProvider>,
      ),
    ).toThrow(/invalid snapshot\.storage\.entity/);
    expect(entityAccess(manager).get("movementActor").count).toBe(0);
  });
});
