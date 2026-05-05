import React from "react";
import { describe, expect, test } from "tstyche";
import type {
  FSMEvent,
  IMachineManager,
  AnyEvent,
  MachineConfig,
  MachineDependencies,
  MachineManagerSnapshot,
  MachineStore,
  MachineReducer,
  ManagerAction,
  MachinesState,
  PublicActorSlice,
  StateType,
  Subscriber,
} from "lite-fsm";
import { MachineManager } from "lite-fsm";
import {
  defineMachine,
  FSMContext,
  type FSMContextType,
  FSMContextProvider,
  type FSMContextProviderProps,
  FSMHydrationBoundary,
  type TypedUseMachineHook,
  type TypedUseManagerHook,
  type TypedUseSelectorHook,
  type TypedUseTransitionHook,
  useManager,
  useHydrateSnapshot,
  useSelector,
  useTransition,
} from "lite-fsm/react";

import type { Assert, Equal } from "./_helpers";

type Cfg = {
  idle: { PING: "busy" };
  busy: { DONE: "idle" };
};

type Ctx = { requests: number };
type Deps = { api: { call: () => Promise<void> } };
type Evt = FSMEvent<"PING"> | FSMEvent<"DONE">;

const reducer: MachineReducer<Cfg, Evt, Ctx> = (state, _a, meta) => ({
  state: meta.nextState,
  context: state.context,
});

const machineCfg = {
  config: { idle: { PING: "busy" }, busy: { DONE: "idle" } } as Cfg,
  initialState: "idle" as const,
  initialContext: { requests: 0 } as Ctx,
  reducer,
  effects: {
    busy: ({ api }) => {
      void api.call();
    },
  },
} satisfies MachineConfig<Cfg, Ctx, Evt, Deps>;

const store = { x: machineCfg };
type Store = typeof store;
type StoreState = MachinesState<Store>;

type ActorCfg = {
  __INIT: { PING: "pending" };
  pending: { DONE: "__RESOLVED" };
};
type ActorCtx = { id: string };
const actorCfg = {
  config: { __INIT: { PING: "pending" }, pending: { DONE: "__RESOLVED" } },
  initialState: "__INIT",
  initialContext: { id: "" },
} satisfies MachineConfig<ActorCfg, ActorCtx, Evt>;
const mixedStore = { x: machineCfg, sync: actorCfg };
type MixedStore = typeof mixedStore;

describe("FSMContextType<S, P>", () => {
  test("является alias для IMachineManager<S, P>", () => {
    type FC = FSMContextType<Store, Evt>;
    type MM = IMachineManager<Store, Evt>;
    type _SameShape = Assert<Equal<FC, MM>>;
  });

  test("по умолчанию даёт безопасный manager MachineStore/AnyEvent", () => {
    type Default = FSMContextType;
    expect<Default>().type.toBe<IMachineManager<MachineStore, AnyEvent>>();
  });
});

describe("FSMContext", () => {
  test("хранит erased context value, а useManager восстанавливает typed manager", () => {
    expect(FSMContext).type.toBe<React.Context<unknown>>();
  });
});

describe("FSMContextProvider", () => {
  test("принимает machineManager с подходящим IMachineManager<S, P>", () => {
    const manager = MachineManager<Store, Evt>(store);
    const el = (
      <FSMContextProvider<Store, Evt> machineManager={manager}>
        <span>child</span>
      </FSMContextProvider>
    );
    expect(el).type.toBeAssignableTo<React.JSX.Element>();
  });

  test("принимает getServerSnapshot с root state shape", () => {
    const manager = MachineManager<Store, Evt>(store);
    const props: FSMContextProviderProps<Store, Evt> = {
      machineManager: manager,
      getServerSnapshot: manager.getState,
    };
    expect(props.getServerSnapshot!()).type.toBe<ReturnType<typeof manager.getState>>();

    const el = (
      <FSMContextProvider<Store, Evt> machineManager={manager} getServerSnapshot={manager.getState}>
        <span>child</span>
      </FSMContextProvider>
    );
    expect(el).type.toBeAssignableTo<React.JSX.Element>();
  });

  test("getServerSnapshot отклоняет dehydrated envelope вместо root state", () => {
    const manager = MachineManager<Store, Evt>(store);
    const el = (
      <FSMContextProvider<Store, Evt>
        machineManager={manager}
        // @ts-expect-error!
        getServerSnapshot={() => manager.dehydrate()}
      >
        <span>invalid</span>
      </FSMContextProvider>
    );
    void el;
  });

  test("отклоняет неправильную форму machineManager", () => {
    const el = (
      <FSMContextProvider<Store, Evt>
        // @ts-expect-error!
        machineManager={{ transition: (a: Evt) => a }}
      >
        <span>invalid</span>
      </FSMContextProvider>
    );
    void el;
  });

  test("типизирует children через PropsWithChildren", () => {
    const manager = MachineManager<Store, Evt>(store);
    const elWithChildren = (
      <FSMContextProvider<Store, Evt> machineManager={manager}>
        <span>child</span>
      </FSMContextProvider>
    );
    expect(elWithChildren).type.toBeAssignableTo<React.JSX.Element>();

    const elWithoutChildren = <FSMContextProvider<Store, Evt> machineManager={manager} />;
    expect(elWithoutChildren).type.toBeAssignableTo<React.JSX.Element>();
  });
});

describe("useManager<S, P>", () => {
  test("возвращает IMachineManager<S, P>", () => {
    const m = useManager<Store, Evt>();
    expect(m).type.toBe<IMachineManager<Store, Evt>>();
  });

  test("по умолчанию даёт безопасный manager MachineStore/AnyEvent", () => {
    const m = useManager();
    expect(m).type.toBe<IMachineManager<MachineStore, AnyEvent>>();
  });

  test("alias через TypedUseMachineHook сужает тип manager", () => {
    const typed: TypedUseMachineHook<Store, Evt> = useManager;
    const m = typed();
    expect(m).type.toBe<IMachineManager<Store, Evt>>();
  });

  test("alias через TypedUseManagerHook сужает тип manager", () => {
    const typed: TypedUseManagerHook<Store, Evt> = useManager;
    const m = typed();
    expect(m).type.toBe<IMachineManager<Store, Evt>>();
  });
});

describe("useSelector<S, R>", () => {
  test("возвращает R, извлечённый selector", () => {
    const count = useSelector<Store, number>((state) => state.x.context.requests);
    expect(count).type.toBe<number>();
  });

  test("selector получает MachinesState<S>", () => {
    useSelector<Store, string>((state) => {
      expect(state).type.toBe<StoreState>();
      return state.x.state;
    });
  });

  test("equalityFn опционален и типизирован как (oldValue, newValue) => boolean", () => {
    useSelector<Store, number>(
      (state) => state.x.context.requests,
      (a, b) => a === b,
    );
  });

  test("отклоняет selector, который читает отсутствующий key", () => {
    useSelector<Store, number>(
      // @ts-expect-error!
      (state) => state.missing.context.requests,
    );
  });

  test("отклоняет equalityFn с неправильным R", () => {
    useSelector<Store, number>(
      (state) => state.x.context.requests,
      // @ts-expect-error!
      (a: string, b: string) => a === b,
    );
  });

  test("TypedUseSelectorHook<S> фиксирует store state, но оставляет R generic", () => {
    const typed: TypedUseSelectorHook<Store> = useSelector;
    const r = typed((state) => state.x.state);
    expect(r).type.toBe<"idle" | "busy">();
  });

  test("TypedUseSelectorHook<S> видит actor slice как public record с readonly meta", () => {
    const typed: TypedUseSelectorHook<MixedStore> = useSelector;
    typed((state) => {
      expect(state.sync).type.toBe<Record<string, PublicActorSlice<ActorCfg, ActorCtx>>>();
      const slice = state.sync["sync/0"];
      expect(slice.state).type.toBe<"pending">();
      expect(slice.meta.actorId).type.toBe<string>();
      // @ts-expect-error!
      slice.meta.actorId = "next";
      return slice.meta.groupId;
    });
  });
});

describe("useTransition<P>", () => {
  test("возвращает dispatch-функцию (payload: ManagerAction<P>) => ManagerAction<P>", () => {
    const dispatch = useTransition<Evt>();
    expect(dispatch).type.toBe<(payload: ManagerAction<Evt>) => ManagerAction<Evt>>();
    dispatch({ type: "PING" });
    dispatch({ type: "DONE" });
  });

  test("отклоняет events вне P", () => {
    const dispatch = useTransition<Evt>();
    // @ts-expect-error!
    dispatch({ type: "UNKNOWN" });
  });

  test("по умолчанию возвращает dispatch для AnyEvent", () => {
    const dispatch = useTransition();
    expect(dispatch).type.toBe<(payload: ManagerAction<AnyEvent>) => ManagerAction<AnyEvent>>();
  });

  test("TypedUseTransitionHook<P> сужает сигнатуру transition", () => {
    const typed: TypedUseTransitionHook<Evt> = useTransition;
    const dispatch = typed();
    expect(dispatch).type.toBe<(payload: ManagerAction<Evt>) => ManagerAction<Evt>>();
  });
});

describe("API гидратации snapshot", () => {
  const snapshot: MachineManagerSnapshot<Store> = {
    machines: {
      x: { state: "idle", context: { requests: 1 } },
    },
  };

  test("useHydrateSnapshot принимает typed manager snapshot", () => {
    expect(useHydrateSnapshot<Store>).type.toBe<
      (snapshot: MachineManagerSnapshot<Store>, opts?: { strategy?: "replace" | "merge" }) => void
    >();
    useHydrateSnapshot<Store>(snapshot);
    useHydrateSnapshot<Store>(snapshot, { strategy: "replace" });
  });

  test("useHydrateSnapshot отклоняет invalid strategy и actor keys", () => {
    useHydrateSnapshot<Store>(
      snapshot,
      // @ts-expect-error!
      { strategy: "invalid" },
    );

    useHydrateSnapshot<MixedStore>({
      machines: {
        x: { state: "idle", context: { requests: 1 } },
        // @ts-expect-error!
        sync: {},
      },
    });
  });

  test("FSMHydrationBoundary принимает snapshot и children", () => {
    const el = (
      <FSMHydrationBoundary<Store> snapshot={snapshot} strategy="merge">
        <span>child</span>
      </FSMHydrationBoundary>
    );
    expect(el).type.toBeAssignableTo<React.JSX.Element>();
  });

  test("FSMHydrationBoundary snapshot отклоняет actor keys", () => {
    const actorSnapshot: MachineManagerSnapshot<MixedStore> = {
      machines: {
        x: { state: "idle", context: { requests: 1 } },
        // @ts-expect-error!
        sync: {},
      },
    };
    const el = (
      <FSMHydrationBoundary<MixedStore> snapshot={actorSnapshot} strategy="replace">
        <span>child</span>
      </FSMHydrationBoundary>
    );
    expect(el).type.toBeAssignableTo<React.JSX.Element>();
  });
});

describe("defineMachine для React", () => {
  test("возвращает factory { create }, которая создаёт hook с machine API", () => {
    const factory = defineMachine<Evt, Deps>({
      dependencies: { api: { call: async () => {} } },
    });
    type _Keys = Assert<Equal<keyof typeof factory, "create">>;

    const use = factory.create(machineCfg);
    expect(use).type.toHaveProperty("transition");
    expect(use).type.toHaveProperty("getState");
    expect(use).type.toHaveProperty("onTransition");
    expect(use).type.toHaveProperty("addMiddleware");
  });

  test("вызов hook с selector возвращает R", () => {
    const use = defineMachine<Evt, Deps>({
      dependencies: { api: { call: async () => {} } },
    }).create(machineCfg);

    const r = use((state) => state.context.requests);
    expect(r).type.toBe<number>();
  });

  test("selector внутри hook видит StateType<C, T>", () => {
    const use = defineMachine<Evt, Deps>({
      dependencies: { api: { call: async () => {} } },
    }).create(machineCfg);

    use((state) => {
      expect(state).type.toBe<StateType<Cfg, Ctx>>();
      return state.state;
    });
  });

  test("hook принимает опциональный equalityFn", () => {
    const use = defineMachine<Evt, Deps>({
      dependencies: { api: { call: async () => {} } },
    }).create(machineCfg);

    use(
      (state) => state.context.requests,
      (a, b) => a === b,
    );
  });

  test("hook отклоняет equalityFn для неправильного R", () => {
    const use = defineMachine<Evt, Deps>({
      dependencies: { api: { call: async () => {} } },
    }).create(machineCfg);

    use<number>(
      (state) => state.context.requests,
      // @ts-expect-error!
      (a: string) => a === "x",
    );
  });

  test("machine.transition требует P", () => {
    const use = defineMachine<Evt, Deps>({
      dependencies: { api: { call: async () => {} } },
    }).create(machineCfg);

    use.transition({ type: "PING" });
    // @ts-expect-error!
    use.transition({ type: "UNKNOWN" });
  });

  test("machine.onTransition принимает Subscriber<C, T, P>", () => {
    const use = defineMachine<Evt, Deps>({
      dependencies: { api: { call: async () => {} } },
    }).create(machineCfg);

    expect(use.onTransition).type.toBe<(cb: Subscriber<Cfg, Ctx, Evt>) => () => void>();
  });

  test("defineMachine() без deps работает, когда D = {}", () => {
    const use = defineMachine<Evt>().create({
      config: { idle: { PING: "busy" }, busy: { DONE: "idle" } } as Cfg,
      initialState: "idle" as const,
      initialContext: { requests: 0 } as Ctx,
      reducer,
    } satisfies MachineConfig<Cfg, Ctx, Evt>);
    expect(use.transition).type.toBe<(action: Evt) => Evt>();
  });

  test("dependencies должны соответствовать D", () => {
    defineMachine<Evt, Deps>({
      // @ts-expect-error!
      dependencies: {},
    });
  });
});

describe("вывод store dependencies через hooks", () => {
  test("useSelector внутри provider читает MachineDependencies<S> через manager", () => {
    const Example = () => {
      const manager = useManager<Store, Evt>();
      expect(manager.setDependencies).type.toBe<(d: Deps | ((deps: Deps) => Deps)) => void>();
      expect<MachineDependencies<Store>>().type.toBe<Deps>();
      return null;
    };
    void Example;
  });
});
