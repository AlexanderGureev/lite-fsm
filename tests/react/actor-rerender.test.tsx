// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";

import { FSMContextProvider, useSelector, useTransition } from "../../src/react";
import { MachineManager } from "../../src/core/MachineManager";
import type { ActorMeta, FSMEvent, MachineConfig, MachinesState, Middleware, PublicActorSlice } from "../../src/core/types";

// Канонический actor template для всех сценариев. Reducer возвращает {state, context}
// без meta — manager пришивает canonical, тесты проверяют что useSelector это ловит.
type LikeConfig = {
  __INIT: { LIKE: "PENDING" };
  PENDING: { BUMP: null; OK: "__RESOLVED" };
};
type LikeContext = { id: string; count: number };
type LikeEvent =
  | FSMEvent<"LIKE", { id: string }>
  | FSMEvent<"BUMP">
  | FSMEvent<"OK">
  | FSMEvent<"DOMAIN">
  | FSMEvent<"PING">;

const createLikeSync = (): MachineConfig<LikeConfig, LikeContext, LikeEvent> => ({
  config: { __INIT: { LIKE: "PENDING" }, PENDING: { BUMP: null, OK: "__RESOLVED" } },
  initialState: "__INIT",
  initialContext: { id: "", count: 0 },
  reducer: (state, action, meta) => {
    if (action.type === "LIKE") return { state: meta.nextState, context: { id: action.payload.id, count: 1 } };
    if (action.type === "BUMP") {
      return { state: meta.nextState, context: { ...state.context, count: state.context.count + 1 } };
    }
    return { state: meta.nextState, context: state.context };
  },
});

type DomainConfig = { IDLE: { DOMAIN: null } };
type DomainContext = { ticks: number };
const createDomain = (): MachineConfig<DomainConfig, DomainContext, LikeEvent> => ({
  config: { IDLE: { DOMAIN: null } },
  initialState: "IDLE",
  initialContext: { ticks: 0 },
  reducer: (state, action) => {
    if (action.type === "DOMAIN") return { state: state.state, context: { ticks: state.context.ticks + 1 } };
  },
});

type Store = { domain: ReturnType<typeof createDomain>; likeSync: ReturnType<typeof createLikeSync> };
type ActorRecord = Record<string, PublicActorSlice<LikeConfig, LikeContext>>;

const createStoreManager = () => MachineManager<Store, LikeEvent>({ domain: createDomain(), likeSync: createLikeSync() });

describe("React actor selectors — отсутствие лишних ре-рендеров", () => {
  it("useSelector(slice.meta) сохраняет ссылку через произвольное количество BUMP reduce", () => {
    const manager = createStoreManager();
    manager.transition({ type: "LIKE", payload: { id: "a" } });

    let renders = 0;
    let lastMeta: Readonly<ActorMeta> | undefined;
    const Probe = () => {
      renders++;
      lastMeta = useSelector<Store, Readonly<ActorMeta> | undefined>((s) => s.likeSync["likeSync/0"]?.meta);
      return <span>{lastMeta?.actorId ?? "none"}</span>;
    };

    render(
      <FSMContextProvider machineManager={manager}>
        <Probe />
      </FSMContextProvider>,
    );

    const initialRenders = renders;
    const firstMeta = lastMeta;
    expect(firstMeta).toEqual({ actorId: "likeSync/0", groupId: "likeSync/0", groupTag: "likeSync" });

    act(() => {
      for (let i = 0; i < 5; i += 1) manager.transition({ type: "BUMP", meta: { actorId: "likeSync/0" } });
    });

    expect(renders).toBe(initialRenders);
    expect(lastMeta).toBe(firstMeta);
  });

  it("useSelector(meta.groupId) стабилен по значению через reduce — нет лишнего rerender", () => {
    const manager = createStoreManager();
    manager.transition({ type: "LIKE", payload: { id: "a" } });

    let renders = 0;
    const Probe = () => {
      renders++;
      const groupId = useSelector<Store, string | undefined>((s) => s.likeSync["likeSync/0"]?.meta.groupId);
      return <span data-testid="g">{groupId ?? "none"}</span>;
    };

    const { getByTestId } = render(
      <FSMContextProvider machineManager={manager}>
        <Probe />
      </FSMContextProvider>,
    );

    expect(getByTestId("g").textContent).toBe("likeSync/0");
    const initial = renders;

    act(() => {
      manager.transition({ type: "BUMP", meta: { actorId: "likeSync/0" } });
      manager.transition({ type: "BUMP", meta: { actorId: "likeSync/0" } });
    });

    expect(renders).toBe(initial);
    expect(getByTestId("g").textContent).toBe("likeSync/0");
  });

  it("domain dispatch не ререндерит компонент, читающий только actor record", () => {
    const manager = createStoreManager();
    manager.transition({ type: "LIKE", payload: { id: "a" } });

    let renders = 0;
    let captured: ActorRecord | null = null;
    const Probe = () => {
      renders++;
      captured = useSelector<Store, ActorRecord>((s) => s.likeSync);
      return <span>{Object.keys(captured).length}</span>;
    };

    render(
      <FSMContextProvider machineManager={manager}>
        <Probe />
      </FSMContextProvider>,
    );

    const initial = renders;
    const ref = captured;

    act(() => {
      for (let i = 0; i < 3; i += 1) manager.transition({ type: "DOMAIN" });
    });

    expect(renders).toBe(initial);
    expect(captured).toBe(ref);
    expect(manager.getState().domain.context.ticks).toBe(3);
  });

  it("BUMP одного actor не ререндерит читателя другого actor в той же template-таблице", () => {
    const manager = createStoreManager();
    manager.transition({ type: "LIKE", payload: { id: "a" } });
    manager.transition({ type: "LIKE", payload: { id: "b" } });

    let aRenders = 0;
    let bRenders = 0;
    const ProbeA = () => {
      aRenders++;
      const count = useSelector<Store, number | undefined>((s) => s.likeSync["likeSync/0"]?.context.count);
      return <span data-testid="a">{count}</span>;
    };
    const ProbeB = () => {
      bRenders++;
      const count = useSelector<Store, number | undefined>((s) => s.likeSync["likeSync/1"]?.context.count);
      return <span data-testid="b">{count}</span>;
    };

    render(
      <FSMContextProvider machineManager={manager}>
        <ProbeA />
        <ProbeB />
      </FSMContextProvider>,
    );

    const aInit = aRenders;
    const bInit = bRenders;

    act(() => {
      manager.transition({ type: "BUMP", meta: { actorId: "likeSync/0" } });
    });

    expect(aRenders).toBe(aInit + 1);
    expect(bRenders).toBe(bInit);
  });

  it("idle→busy→idle цикл возвращает читателя record к одному рендеру (после spawn) и одному (после collapse)", () => {
    const manager = createStoreManager();

    let renders = 0;
    let captured: ActorRecord | null = null;
    const Probe = () => {
      renders++;
      captured = useSelector<Store, ActorRecord>((s) => s.likeSync);
      return <span>{Object.keys(captured).length}</span>;
    };

    render(
      <FSMContextProvider machineManager={manager}>
        <Probe />
      </FSMContextProvider>,
    );

    const empty = captured;
    const initial = renders;

    act(() => {
      manager.transition({ type: "LIKE", payload: { id: "a" } });
    });
    expect(renders).toBe(initial + 1);
    const busy = captured;
    expect(busy).not.toBe(empty);

    act(() => {
      for (let i = 0; i < 3; i += 1) manager.transition({ type: "DOMAIN" });
    });
    expect(renders).toBe(initial + 1);
    expect(captured).toBe(busy);

    act(() => {
      manager.transition({ type: "OK", meta: { actorId: "likeSync/0" } });
    });
    expect(renders).toBe(initial + 2);
    expect(captured).toBe(empty);

    act(() => {
      for (let i = 0; i < 3; i += 1) manager.transition({ type: "DOMAIN" });
    });
    expect(renders).toBe(initial + 2);
  });

  it("multi-target group routing делает один commit и один rerender вместо fan-out на каждую цель", () => {
    const manager = MachineManager<{ likeSync: ReturnType<typeof createLikeSync> }, LikeEvent>({
      likeSync: createLikeSync(),
    });
    manager.transition({ type: "LIKE", payload: { id: "a" } });
    manager.transition({ type: "LIKE", payload: { id: "b" } });
    manager.transition({ type: "LIKE", payload: { id: "c" } });

    let renders = 0;
    const Probe = () => {
      renders++;
      const total = useSelector<{ likeSync: ReturnType<typeof createLikeSync> }, number>((s) =>
        Object.values(s.likeSync).reduce((acc, slice) => acc + slice.context.count, 0),
      );
      return <span data-testid="sum">{total}</span>;
    };

    const { getByTestId } = render(
      <FSMContextProvider machineManager={manager}>
        <Probe />
      </FSMContextProvider>,
    );

    expect(getByTestId("sum").textContent).toBe("3");
    const initial = renders;

    act(() => {
      manager.transition({
        type: "BUMP",
        meta: { groupId: ["likeSync/0", "likeSync/1", "likeSync/2"] },
      });
    });

    expect(renders).toBe(initial + 1);
    expect(getByTestId("sum").textContent).toBe("6");
  });

  it("replacement existing actor с incoming meta не вызывает rerender meta-селектора", () => {
    type Store = { likeSync: ReturnType<typeof createLikeSync> };
    type StoreState = MachinesState<Store>;
    let replace!: () => void;
    const patchExisting: Middleware<StoreState, LikeEvent> = (api) => {
      api.replaceReducer((reducer) => (state, action) => {
        const next = reducer(state, action);
        if (action.type !== "PING") return next;

        return {
          ...next,
          likeSync: {
            ...next.likeSync,
            "likeSync/0": {
              ...next.likeSync["likeSync/0"],
              meta: { actorId: "likeSync/0", groupId: "fake", groupTag: "fake" },
            },
          },
        };
      });
      replace = () => {
        api.transition({ type: "PING" });
      };
      return (n) => (action) => n(action);
    };
    const manager = MachineManager<Store, LikeEvent>(
      { likeSync: createLikeSync() },
      { middleware: [patchExisting] },
    );
    manager.transition({ type: "LIKE", payload: { id: "a" } });

    let renders = 0;
    let lastMeta: Readonly<ActorMeta> | undefined;
    const Probe = () => {
      renders++;
      lastMeta = useSelector<{ likeSync: ReturnType<typeof createLikeSync> }, Readonly<ActorMeta> | undefined>(
        (s) => s.likeSync["likeSync/0"]?.meta,
      );
      return <span>{lastMeta?.groupId ?? "none"}</span>;
    };

    render(
      <FSMContextProvider machineManager={manager}>
        <Probe />
      </FSMContextProvider>,
    );

    const initial = renders;
    const canonicalMeta = lastMeta;
    expect(canonicalMeta).toEqual({ actorId: "likeSync/0", groupId: "likeSync/0", groupTag: "likeSync" });

    act(() => {
      replace();
    });

    expect(renders).toBe(initial);
    expect(lastMeta).toBe(canonicalMeta);
  });

  it("actor effect reentrant transition в одном act() батчится в один React rerender", () => {
    const actor: MachineConfig<LikeConfig, LikeContext, LikeEvent> = {
      ...createLikeSync(),
      effects: {
        PENDING: ({ self, transition }) => {
          transition.actor(self.actorId, { type: "BUMP" });
        },
      },
    };
    const manager = MachineManager<{ likeSync: typeof actor }, LikeEvent>({ likeSync: actor });
    const subscriberCalls: string[] = [];
    manager.onTransition((_prev, _current, action) => subscriberCalls.push(action.type));

    let renders = 0;
    const Probe = () => {
      renders++;
      const count = useSelector<{ likeSync: typeof actor }, number>((s) => s.likeSync["likeSync/0"]?.context.count ?? 0);
      return <span data-testid="c">{count}</span>;
    };

    const { getByTestId } = render(
      <FSMContextProvider machineManager={manager}>
        <Probe />
      </FSMContextProvider>,
    );

    const initial = renders;

    act(() => {
      manager.transition({ type: "LIKE", payload: { id: "a" } });
    });

    // core делает два полноценных commit'а (LIKE + reentrant BUMP),
    // но React батчит их в одну синхронную пачку — финальное значение коммитится один раз.
    expect(subscriberCalls).toEqual(["LIKE", "BUMP"]);
    expect(renders).toBe(initial + 1);
    expect(getByTestId("c").textContent).toBe("2");
  });

  it("useTransition стабилен по ссылке между rerender'ами провайдера", () => {
    const manager = createStoreManager();
    const seen: Array<(action: LikeEvent) => unknown> = [];
    const Probe = () => {
      const transition = useTransition<LikeEvent>();
      seen.push(transition);
      return null;
    };

    const { rerender } = render(
      <FSMContextProvider machineManager={manager}>
        <Probe />
      </FSMContextProvider>,
    );
    rerender(
      <FSMContextProvider machineManager={manager}>
        <Probe />
      </FSMContextProvider>,
    );

    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(seen[1]);
  });

  it("custom equalityFn по meta.groupId подавляет rerender, даже если record был перевычислен", () => {
    const manager = createStoreManager();
    manager.transition({ type: "LIKE", payload: { id: "a" } });

    const eq = vi.fn((a: string | undefined, b: string | undefined) => a === b);
    let renders = 0;
    const Probe = () => {
      renders++;
      const groupId = useSelector<Store, string | undefined>(
        (s) => s.likeSync["likeSync/0"]?.meta.groupId,
        eq,
      );
      return <span data-testid="g">{groupId}</span>;
    };

    const { getByTestId } = render(
      <FSMContextProvider machineManager={manager}>
        <Probe />
      </FSMContextProvider>,
    );
    expect(getByTestId("g").textContent).toBe("likeSync/0");
    const initial = renders;

    act(() => {
      for (let i = 0; i < 4; i += 1) manager.transition({ type: "BUMP", meta: { actorId: "likeSync/0" } });
    });

    expect(renders).toBe(initial);
    expect(eq).toHaveBeenCalled();
  });

  it("subscriber reentrant transition в одном act() батчится в один React rerender", () => {
    const manager = createStoreManager();
    manager.transition({ type: "LIKE", payload: { id: "a" } });
    const unsubscribe = manager.onTransition((_prev, _current, action) => {
      if (action.type === "DOMAIN") {
        unsubscribe();
        manager.transition({ type: "BUMP", meta: { actorId: "likeSync/0" } });
      }
    });

    let renders = 0;
    const Probe = () => {
      renders++;
      const count = useSelector<Store, number>((s) => s.likeSync["likeSync/0"]?.context.count ?? 0);
      const ticks = useSelector<Store, number>((s) => s.domain.context.ticks);
      return (
        <div>
          <span data-testid="c">{count}</span>
          <span data-testid="t">{ticks}</span>
        </div>
      );
    };

    const { getByTestId } = render(
      <FSMContextProvider machineManager={manager}>
        <Probe />
      </FSMContextProvider>,
    );

    const initial = renders;

    act(() => {
      manager.transition({ type: "DOMAIN" });
    });

    // core делает два полноценных commit'а (DOMAIN + reentrant BUMP),
    // React батчит их в один rerender внутри act().
    expect(renders).toBe(initial + 1);
    expect(getByTestId("t").textContent).toBe("1");
    expect(getByTestId("c").textContent).toBe("2");
  });

  it("async actor effect делает rerender в каждой microtask, без потери коммитов", async () => {
    const actor: MachineConfig<LikeConfig, LikeContext, LikeEvent> = {
      ...createLikeSync(),
      effects: {
        PENDING: async ({ self, transition }) => {
          await Promise.resolve();
          transition.actor(self.actorId, { type: "BUMP" });
          await Promise.resolve();
          transition.actor(self.actorId, { type: "BUMP" });
        },
      },
    };
    const manager = MachineManager<{ likeSync: typeof actor }, LikeEvent>({ likeSync: actor });

    let renders = 0;
    const Probe = () => {
      renders++;
      const count = useSelector<{ likeSync: typeof actor }, number>((s) => s.likeSync["likeSync/0"]?.context.count ?? 0);
      return <span data-testid="c">{count}</span>;
    };

    const { getByTestId } = render(
      <FSMContextProvider machineManager={manager}>
        <Probe />
      </FSMContextProvider>,
    );

    const initial = renders;

    await act(async () => {
      manager.transition({ type: "LIKE", payload: { id: "a" } });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(getByTestId("c").textContent).toBe("3");
    });
    // LIKE (sync) → 1 rerender; затем 2 async BUMP в отдельных microtask'ах → 2 рендера.
    // Всего: initial + 3 (без потери промежуточного значения).
    expect(renders).toBe(initial + 3);
  });

  it("setDependencies не вызывает subscribers и не ререндерит подписанные компоненты", () => {
    type Deps = { clock: () => number };
    const actorWithDeps: MachineConfig<LikeConfig, LikeContext, LikeEvent, Deps> = {
      ...createLikeSync(),
      effects: { PENDING: ({ clock }) => void clock() },
    };
    const manager = MachineManager<{ likeSync: typeof actorWithDeps }, LikeEvent>({ likeSync: actorWithDeps });
    manager.setDependencies({ clock: () => 1 });

    const subscriber = vi.fn();
    manager.onTransition(subscriber);

    let renders = 0;
    const Probe = () => {
      renders++;
      const count = useSelector<{ likeSync: typeof actorWithDeps }, number>(
        (s) => s.likeSync["likeSync/0"]?.context.count ?? 0,
      );
      return <span>{count}</span>;
    };

    render(
      <FSMContextProvider machineManager={manager}>
        <Probe />
      </FSMContextProvider>,
    );

    const initial = renders;

    act(() => {
      manager.setDependencies({ clock: () => 2 });
      manager.setDependencies({ clock: () => 3 });
    });

    expect(subscriber).not.toHaveBeenCalled();
    expect(renders).toBe(initial);
  });

  it("компонент с несколькими useSelector ререндерится один раз на dispatch, изменивший один из подписанных слайсов", () => {
    const manager = createStoreManager();
    manager.transition({ type: "LIKE", payload: { id: "a" } });

    let renders = 0;
    const Probe = (): React.ReactElement => {
      renders++;
      const count = useSelector<Store, number>((s) => s.likeSync["likeSync/0"]?.context.count ?? 0);
      const ticks = useSelector<Store, number>((s) => s.domain.context.ticks);
      const groupId = useSelector<Store, string | undefined>((s) => s.likeSync["likeSync/0"]?.meta.groupId);
      return (
        <div>
          <span data-testid="count">{count}</span>
          <span data-testid="ticks">{ticks}</span>
          <span data-testid="g">{groupId}</span>
        </div>
      );
    };

    const { getByTestId } = render(
      <FSMContextProvider machineManager={manager}>
        <Probe />
      </FSMContextProvider>,
    );

    const initial = renders;

    act(() => {
      manager.transition({ type: "DOMAIN" });
    });
    expect(renders).toBe(initial + 1);
    expect(getByTestId("ticks").textContent).toBe("1");

    act(() => {
      manager.transition({ type: "BUMP", meta: { actorId: "likeSync/0" } });
    });
    expect(renders).toBe(initial + 2);
    expect(getByTestId("count").textContent).toBe("2");
    expect(getByTestId("g").textContent).toBe("likeSync/0");
  });
});
