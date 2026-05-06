// @vitest-environment jsdom
import React from "react";
import { act, render, waitFor } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { MachineManager } from "../../src/core/MachineManager";
import type { HydrateStrategy, MachineConfig, MachineManagerSnapshot } from "../../src/core/types";
import { HYDRATE_ACTION_TYPE } from "../../src/core/utils";
import { FSMContext, FSMContextProvider, FSMHydrationBoundary, useHydrateSnapshot, useManager, useSelector } from "../../src/react";

type Config = { IDLE: {} };
type Action = { type: "NOOP" };
type Context = { count: number };
type Snapshot = { count: number };
type FlagConfig = { READY: {} };
type FlagContext = { enabled: boolean };
type FlagSnapshot = { enabled: boolean };
type ListsConfig = { READY: {} };
type ListsContext = { lists: Record<string, string> };

const counter = {
  config: { IDLE: {} },
  initialState: "IDLE",
  initialContext: { count: 0 },
  hydrate: (prev, snapshot: Snapshot) => {
    if (prev.context.count === snapshot.count) return prev;
    return { state: prev.state, context: { count: snapshot.count } };
  },
} satisfies MachineConfig<Config, Context, Action, {}, Snapshot>;

const store = { counter };
type Store = typeof store;

const flag = {
  config: { READY: {} },
  initialState: "READY",
  initialContext: { enabled: false },
  hydrate: (prev, snapshot: FlagSnapshot) => {
    if (prev.context.enabled === snapshot.enabled) return prev;
    return { state: prev.state, context: { enabled: snapshot.enabled } };
  },
} satisfies MachineConfig<FlagConfig, FlagContext, Action, {}, FlagSnapshot>;

const nestedStore = { counter, flag };
type NestedStore = typeof nestedStore;

const listsMachine = {
  config: { READY: {} },
  initialState: "READY",
  initialContext: { lists: {} },
  hydrate: (prev, snapshot) => {
    const snapshotEntries = Object.entries(snapshot.context.lists);
    const isApplied =
      prev.state === snapshot.state &&
      snapshotEntries.every(([id, title]) => prev.context.lists[id] === title);

    if (isApplied) return prev;

    return {
      state: snapshot.state,
      context: { lists: { ...prev.context.lists, ...snapshot.context.lists } },
    };
  },
} satisfies MachineConfig<ListsConfig, ListsContext, Action>;
const listsStore = { lists: listsMachine };
type ListsStore = typeof listsStore;

type Subscription = { id: string };
type ProfileConfig = { IDLE: {}; READY: {} };
type ProfileContext = { subscription: Subscription | null };
type ProfileSnapshot = { subscription: Subscription | null };
type OnboardingConfig = {
  IDLE: { CHECK_ONBOARDING: "CHECKING" };
  CHECKING: {
    CHECK_ONBOARDING_RESOLVE: "VISIBLE";
    CHECK_ONBOARDING_REJECT: "DISABLED";
  };
  VISIBLE: {};
  DISABLED: {};
};
type OnboardingContext = { checks: number };
type OnboardingAction =
  | { type: "CHECK_ONBOARDING" }
  | { type: "CHECK_ONBOARDING_RESOLVE" }
  | { type: "CHECK_ONBOARDING_REJECT" };
type OnboardingDeps = { getState: () => { profile: { context: ProfileContext } } };

const profileMachine = {
  config: { IDLE: {}, READY: {} },
  initialState: "IDLE",
  initialContext: { subscription: null as ProfileContext["subscription"] },
  hydrate: (prev, snapshot: ProfileSnapshot) => {
    if (prev.state === "READY" && prev.context.subscription?.id === snapshot.subscription?.id) return prev;
    return { state: "READY", context: { subscription: snapshot.subscription } };
  },
} satisfies MachineConfig<ProfileConfig, ProfileContext, OnboardingAction, {}, ProfileSnapshot>;

const onboardingMachine = {
  config: {
    IDLE: { CHECK_ONBOARDING: "CHECKING" },
    CHECKING: {
      CHECK_ONBOARDING_RESOLVE: "VISIBLE",
      CHECK_ONBOARDING_REJECT: "DISABLED",
    },
    VISIBLE: {},
    DISABLED: {},
  },
  initialState: "IDLE",
  initialContext: { checks: 0 },
  reducer: (state, action, { nextState }) => ({
    state: nextState,
    context: { checks: state.context.checks + (action.type === "CHECK_ONBOARDING" ? 1 : 0) },
  }),
  effects: {
    CHECKING: ({ getState, transition }) => {
      if (getState().profile.context.subscription?.id === "premium") {
        transition({ type: "CHECK_ONBOARDING_RESOLVE" });
      } else {
        transition({ type: "CHECK_ONBOARDING_REJECT" });
      }
    },
  },
} satisfies MachineConfig<OnboardingConfig, OnboardingContext, OnboardingAction, OnboardingDeps>;

const onboardingStore = { profile: profileMachine, onboarding: onboardingMachine };
type OnboardingStore = typeof onboardingStore;

type SequenceConfig = {
  IDLE: { FIRST: "FIRST" };
  FIRST: { SECOND: "SECOND" };
  SECOND: {};
};
type SequenceContext = { log: string[] };
type SequenceAction = { type: "FIRST" } | { type: "SECOND" };
type SequenceSnapshot = { log: string[] };

const sequenceMachine = {
  config: { IDLE: { FIRST: "FIRST" }, FIRST: { SECOND: "SECOND" }, SECOND: {} },
  initialState: "IDLE",
  initialContext: { log: [] },
  hydrate: (prev, snapshot: SequenceSnapshot) => {
    if (prev.context.log === snapshot.log) return prev;
    return { state: prev.state, context: { log: snapshot.log } };
  },
  reducer: (state, action, { nextState }) => ({
    state: nextState,
    context: { log: [...state.context.log, action.type] },
  }),
} satisfies MachineConfig<SequenceConfig, SequenceContext, SequenceAction, {}, SequenceSnapshot>;

const sequenceStore = { sequence: sequenceMachine };
type SequenceStore = typeof sequenceStore;

const createManager = () => MachineManager(store);
const createSnapshot = (count: number): MachineManagerSnapshot<Store> => ({
  machines: {
    counter: { count },
  },
});

const createNestedCounterSnapshot = (count: number): MachineManagerSnapshot<NestedStore> => ({
  machines: {
    counter: { count },
  },
});

const createFlagSnapshot = (enabled: boolean): MachineManagerSnapshot<NestedStore> => ({
  machines: {
    flag: { enabled },
  },
});

const createNestedSnapshot = (count: number, enabled: boolean): MachineManagerSnapshot<NestedStore> => ({
  machines: {
    counter: { count },
    flag: { enabled },
  },
});

const createListsSnapshot = (id: string, title: string): MachineManagerSnapshot<ListsStore> => ({
  machines: {
    lists: {
      state: "READY",
      context: {
        lists: {
          [id]: title,
        },
      },
    },
  },
});

const createOnboardingManager = () => {
  const manager = MachineManager<OnboardingStore, OnboardingAction>(onboardingStore);
  manager.setDependencies({ getState: manager.getState });
  return manager;
};

const createProfileSnapshot = (id: string | null): MachineManagerSnapshot<OnboardingStore> => ({
  machines: {
    profile: { subscription: id ? { id } : null },
  },
});

const createSequenceSnapshot = (log: string[]): MachineManagerSnapshot<SequenceStore> => ({
  machines: {
    sequence: { log },
  },
});

const Counter = ({ realReads, renders }: { realReads?: number[]; renders?: number[] }) => {
  const manager = useManager<Store>();
  const count = useSelector<Store, number>((state) => state.counter.context.count);
  renders?.push(count);
  realReads?.push(manager.getState().counter.context.count);
  return <span data-testid="count">{count}</span>;
};

const NestedReadout = (): React.ReactElement => {
  const count = useSelector<NestedStore, number>((state) => state.counter.context.count);
  const enabled = useSelector<NestedStore, boolean>((state) => state.flag.context.enabled);
  return React.createElement("span", { "data-testid": "nested" }, `${count}:${enabled ? "on" : "off"}`);
};

const ListsReadout = (): React.ReactElement => {
  const titles = useSelector<ListsStore, string>((state) =>
    Object.values(state.lists.context.lists).sort().join(","),
  );
  return React.createElement("span", { "data-testid": "lists" }, titles);
};

const OnboardingReadout = (): React.ReactElement => {
  const state = useSelector<OnboardingStore, string>((root) => root.onboarding.state);
  return React.createElement("span", { "data-testid": "onboarding" }, state);
};

const SequenceReadout = (): React.ReactElement => {
  const label = useSelector<SequenceStore, string>(
    (root) => `${root.sequence.state}:${root.sequence.context.log.join(",")}`,
  );
  return React.createElement("span", { "data-testid": "sequence" }, label);
};

const CommitOnlyHydrator = ({
  snapshot,
  strategy,
}: {
  snapshot: MachineManagerSnapshot<Store>;
  strategy?: HydrateStrategy;
}): React.ReactElement | null => {
  useHydrateSnapshot(snapshot, { strategy });
  return null;
};

const createClientHydrationGate = () => {
  let blocked = false;
  let releasePromise: (() => void) | null = null;
  let promise = Promise.resolve();

  const Gate = ({ children }: React.PropsWithChildren): React.ReactElement => {
    if (blocked) throw promise;
    return <>{children}</>;
  };

  return {
    Gate,
    block: () => {
      blocked = true;
      promise = new Promise<void>((resolve) => {
        releasePromise = () => {
          blocked = false;
          resolve();
        };
      });
    },
    release: () => {
      releasePromise?.();
    },
  };
};

const getHydrationErrors = (calls: unknown[][]): string[] =>
  calls
    .map((call) => call.map((item) => (item instanceof Error ? item.message : String(item))).join(" "))
    .filter((message) => /hydration|hydrated|server rendered html/i.test(message));

describe("FSMHydrationBoundary", () => {
  it("применяет snapshot до рендера children для ещё не смонтированного manager", () => {
    const manager = createManager();
    const renders: number[] = [];
    const realReads: number[] = [];

    const { getByTestId } = render(
      <FSMContextProvider machineManager={manager}>
        <FSMHydrationBoundary snapshot={createSnapshot(5)}>
          <Counter realReads={realReads} renders={renders} />
        </FSMHydrationBoundary>
      </FSMContextProvider>,
    );

    expect(getByTestId("count").textContent).toBe("5");
    expect(renders[0]).toBe(5);
    expect(realReads[0]).toBe(0);
    expect(manager.getState().counter.context.count).toBe(5);
  });

  it("не мутирует настоящий manager во время render", () => {
    const manager = createManager();
    const hydrate = vi.spyOn(manager, "hydrate");
    const hydrateCallsDuringRender: number[] = [];

    const Probe = () => {
      hydrateCallsDuringRender.push(hydrate.mock.calls.length);
      return <Counter />;
    };

    render(
      <FSMContextProvider machineManager={manager}>
        <FSMHydrationBoundary snapshot={createSnapshot(5)}>
          <Probe />
        </FSMHydrationBoundary>
      </FSMContextProvider>,
    );

    expect(hydrateCallsDuringRender[0]).toBe(0);
    expect(hydrate).toHaveBeenCalledOnce();
  });

  it("useSelector fallback работает с raw FSMContext.Provider без server snapshot context", () => {
    const manager = createManager();

    const { getByTestId } = render(
      <FSMContext.Provider value={manager}>
        <Counter />
      </FSMContext.Provider>,
    );

    expect(getByTestId("count").textContent).toBe("0");
  });

  it("FSMHydrationBoundary fallback считает server preview без родительского server snapshot context", () => {
    const manager = createManager();

    const { getByTestId } = render(
      <FSMContext.Provider value={manager}>
        <FSMHydrationBoundary snapshot={createSnapshot(3)}>
          <Counter />
        </FSMHydrationBoundary>
      </FSMContext.Provider>,
    );

    expect(getByTestId("count").textContent).toBe("3");
  });

  it("не запускает hydrate повторно для той же ссылки snapshot и той же strategy", () => {
    const manager = createManager();
    const hydrate = vi.spyOn(manager, "hydrate");
    const snapshot = createSnapshot(2);

    const { rerender } = render(
      <FSMContextProvider machineManager={manager}>
        <FSMHydrationBoundary snapshot={snapshot}>
          <Counter />
        </FSMHydrationBoundary>
      </FSMContextProvider>,
    );

    rerender(
      <FSMContextProvider machineManager={manager}>
        <FSMHydrationBoundary snapshot={snapshot}>
          <Counter />
        </FSMHydrationBoundary>
      </FSMContextProvider>,
    );

    expect(hydrate).toHaveBeenCalledOnce();
  });

  it("может заново commit-ить ту же ссылку snapshot после изменения base state", () => {
    const manager = createManager();
    const hydrate = vi.spyOn(manager, "hydrate");
    const snapshot = createSnapshot(2);

    const { rerender } = render(
      <FSMContextProvider machineManager={manager}>
        <FSMHydrationBoundary snapshot={snapshot}>
          <Counter />
        </FSMHydrationBoundary>
      </FSMContextProvider>,
    );

    hydrate.mockClear();
    act(() => {
      manager.hydrate(createSnapshot(0));
    });
    hydrate.mockClear();

    rerender(
      <FSMContextProvider machineManager={manager}>
        <FSMHydrationBoundary snapshot={snapshot}>
          <Counter />
        </FSMHydrationBoundary>
      </FSMContextProvider>,
    );

    expect(hydrate).toHaveBeenCalledOnce();
    expect(manager.getState().counter.context.count).toBe(2);
  });

  it("гидратирует заново при смене ссылки snapshot, даже если предыдущий уже применён", () => {
    const manager = createManager();
    const hydrate = vi.spyOn(manager, "hydrate");

    const App = ({ snapshot }: { snapshot: MachineManagerSnapshot<Store> }) => (
      <FSMContextProvider machineManager={manager}>
        <FSMHydrationBoundary snapshot={snapshot}>
          <Counter />
        </FSMHydrationBoundary>
      </FSMContextProvider>
    );

    const { rerender, getByTestId } = render(<App snapshot={createSnapshot(2)} />);
    expect(hydrate).toHaveBeenCalledOnce();
    expect(getByTestId("count").textContent).toBe("2");

    rerender(<App snapshot={createSnapshot(7)} />);
    expect(hydrate).toHaveBeenCalledTimes(2);
    expect(getByTestId("count").textContent).toBe("7");
    expect(manager.getState().counter.context.count).toBe(7);
  });

  it("гидратирует смонтированный manager в layout effect при клиентской навигации", () => {
    const manager = createManager();
    const renders: number[] = [];
    const realReads: number[] = [];

    const { rerender, getByTestId } = render(
      <FSMContextProvider machineManager={manager}>
        <Counter realReads={realReads} renders={renders} />
      </FSMContextProvider>,
    );

    rerender(
      <FSMContextProvider machineManager={manager}>
        <FSMHydrationBoundary snapshot={createSnapshot(9)}>
          <Counter realReads={realReads} renders={renders} />
        </FSMHydrationBoundary>
      </FSMContextProvider>,
    );

    expect(getByTestId("count").textContent).toBe("9");
    expect(renders).toContain(9);
    expect(realReads).toContain(0);
    expect(manager.getState().counter.context.count).toBe(9);
  });

  it("пропускает overlay и commit, когда содержимое snapshot уже применено", () => {
    const manager = createManager();
    manager.hydrate(createSnapshot(4));
    const hydrate = vi.spyOn(manager, "hydrate");

    const { getByTestId } = render(
      <FSMContextProvider machineManager={manager}>
        <FSMHydrationBoundary snapshot={createSnapshot(4)}>
          <Counter />
        </FSMHydrationBoundary>
      </FSMContextProvider>,
    );

    expect(getByTestId("count").textContent).toBe("4");
    expect(hydrate).not.toHaveBeenCalled();
  });

  it("пропускает overlay и commit для actor template snapshot", () => {
    type ActorAction = { type: "SPAWN"; payload: { id: string } };
    type Event = Action | ActorAction;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const actor = {
      config: { __INIT: { SPAWN: "PENDING" }, PENDING: {} },
      initialState: "__INIT",
      initialContext: { id: "" },
      reducer: (state, action, meta) => {
        if (action.type === "SPAWN") return { state: meta.nextState, context: { id: action.payload.id } };
        return { state: meta.nextState, context: state.context };
      },
    } satisfies MachineConfig<{ __INIT: { SPAWN: "PENDING" }; PENDING: {} }, { id: string }, Event>;
    const actorStore = { counter, sync: actor };
    type ActorStore = typeof actorStore;
    const manager = MachineManager<ActorStore, Event>(actorStore);
    manager.transition({ type: "SPAWN", payload: { id: "live" } });
    const hydrate = vi.spyOn(manager, "hydrate");
    const baseState = manager.getState();
    const runtimeSnapshot = {
      machines: {
        sync: { ghost: { state: "PENDING", context: { id: "ghost" } } },
      },
    } as never;
    const preview = manager.getHydratedState(runtimeSnapshot);

    const ActorReadout = () => {
      const ids = useSelector<ActorStore, string>((state) => Object.keys(state.sync).join(","));
      return <span data-testid="actors">{ids}</span>;
    };

    const { getByTestId } = render(
      <FSMContextProvider machineManager={manager}>
        <FSMHydrationBoundary
          snapshot={runtimeSnapshot}
        >
          <ActorReadout />
        </FSMHydrationBoundary>
      </FSMContextProvider>,
    );

    expect(getByTestId("actors").textContent).toBe("sync/0");
    expect(preview.sync).toBe(baseState.sync);
    expect(hydrate).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("actor template 'sync' was skipped"));
    warn.mockRestore();
  });

  it("preview показывает snapshot actors до commit, а после commit selectors читают restored actors", () => {
    type ActorAction = { type: "SPAWN"; payload: { id: string } } | { type: "BUMP" };
    type Event = Action | ActorAction;
    const actor = {
      config: { __INIT: { SPAWN: "PENDING" }, PENDING: { BUMP: null } },
      initialState: "__INIT",
      initialContext: { id: "", count: 0 },
      persistence: "snapshot",
      reducer: (state, action, meta) => {
        if (action.type === "SPAWN") return { state: meta.nextState, context: { id: action.payload.id, count: 1 } };
        if (action.type === "BUMP") {
          return { state: meta.nextState, context: { ...state.context, count: state.context.count + 1 } };
        }
        return { state: meta.nextState, context: state.context };
      },
    } satisfies MachineConfig<
      { __INIT: { SPAWN: "PENDING" }; PENDING: { BUMP: null } },
      { id: string; count: number },
      Event
    >;
    const actorStore = { sync: actor };
    type ActorStore = typeof actorStore;
    const manager = MachineManager<ActorStore, Event>(actorStore);
    const realReads: string[] = [];
    const renders: string[] = [];
    const snapshot = {
      machines: {
        sync: {
          "server/actor": {
            snapshot: {
              state: "PENDING",
              context: { id: "restored", count: 1 },
            },
            meta: { actorId: "server/actor", groupId: "server/group", groupTag: "sync" },
          },
        },
      },
    } satisfies MachineManagerSnapshot<ActorStore>;

    const ActorReadout = () => {
      const managerFromContext = useManager<ActorStore>();
      const label = useSelector<ActorStore, string>((state) =>
        Object.values(state.sync)
          .map((slice) => `${slice.context.id}:${slice.context.count}`)
          .join(","),
      );
      renders.push(label);
      realReads.push(Object.keys(managerFromContext.getState().sync).join(","));
      return <span data-testid="actors">{label}</span>;
    };

    const { getByTestId } = render(
      <FSMContextProvider machineManager={manager}>
        <FSMHydrationBoundary<ActorStore> snapshot={snapshot}>
          <ActorReadout />
        </FSMHydrationBoundary>
      </FSMContextProvider>,
    );

    expect(renders[0]).toBe("restored:1");
    expect(realReads[0]).toBe("");
    expect(getByTestId("actors").textContent).toBe("restored:1");
    expect(manager.getState().sync["server/actor"].context.id).toBe("restored");

    act(() => {
      manager.transition({ type: "BUMP", meta: { actorId: "server/actor" } });
    });

    expect(getByTestId("actors").textContent).toBe("restored:2");
  });

  it("композирует вложенные boundaries поверх overlay state родителя", () => {
    const manager = MachineManager(nestedStore);

    const { getByTestId } = render(
      <FSMContextProvider machineManager={manager}>
        <FSMHydrationBoundary snapshot={createNestedCounterSnapshot(3)}>
          <FSMHydrationBoundary snapshot={createFlagSnapshot(true)}>
            <NestedReadout />
          </FSMHydrationBoundary>
        </FSMHydrationBoundary>
      </FSMContextProvider>,
    );

    expect(getByTestId("nested").textContent).toBe("3:on");
    expect(manager.getState().counter.context.count).toBe(3);
    expect(manager.getState().flag.context.enabled).toBe(true);
  });

  it("не стирает sibling boundary snapshots одной machine, когда hydrate сливает вложенный record", () => {
    const manager = MachineManager(listsStore);

    const { getAllByTestId } = render(
      <FSMContextProvider machineManager={manager}>
        <FSMHydrationBoundary snapshot={createListsSnapshot("fresh", "Fresh arrivals")}>
          <ListsReadout />
        </FSMHydrationBoundary>
        <FSMHydrationBoundary snapshot={createListsSnapshot("slow", "Slow streaming widget")}>
          <ListsReadout />
        </FSMHydrationBoundary>
      </FSMContextProvider>,
    );

    expect(getAllByTestId("lists").map((node) => node.textContent)).toEqual([
      "Fresh arrivals,Slow streaming widget",
      "Fresh arrivals,Slow streaming widget",
    ]);
    expect(Object.keys(manager.getState().lists.context.lists).sort()).toEqual(["fresh", "slow"]);
  });

  it("useHydrateSnapshot commit-ит в layout effect без render overlay", () => {
    const manager = createManager();
    const renders: number[] = [];

    const { getByTestId } = render(
      <FSMContextProvider machineManager={manager}>
        <CommitOnlyHydrator snapshot={createSnapshot(6)} />
        <Counter renders={renders} />
      </FSMContextProvider>,
    );

    expect(renders[0]).toBe(0);
    expect(getByTestId("count").textContent).toBe("6");
  });

  it("useHydrateSnapshot пропускает ту же ссылку snapshot и ту же strategy", () => {
    const manager = createManager();
    const hydrate = vi.spyOn(manager, "hydrate");
    const snapshot = createSnapshot(6);

    const { rerender } = render(
      <FSMContextProvider machineManager={manager}>
        <CommitOnlyHydrator snapshot={snapshot} />
        <Counter />
      </FSMContextProvider>,
    );

    rerender(
      <FSMContextProvider machineManager={manager}>
        <CommitOnlyHydrator snapshot={snapshot} />
        <Counter />
      </FSMContextProvider>,
    );

    expect(hydrate).toHaveBeenCalledOnce();
  });

  it("useHydrateSnapshot снова гидратирует, когда strategy меняется при той же ссылке snapshot", () => {
    const manager = createManager();
    const hydrate = vi.spyOn(manager, "hydrate");
    const snapshot = createSnapshot(6);

    const { rerender } = render(
      <FSMContextProvider machineManager={manager}>
        <CommitOnlyHydrator snapshot={snapshot} strategy="merge" />
        <Counter />
      </FSMContextProvider>,
    );

    hydrate.mockClear();
    rerender(
      <FSMContextProvider machineManager={manager}>
        <CommitOnlyHydrator snapshot={snapshot} strategy="replace" />
        <Counter />
      </FSMContextProvider>,
    );

    expect(hydrate).toHaveBeenCalledOnce();
  });

  it("renderToString видит гидратированный state без запуска effects", () => {
    const manager = createManager();

    const html = renderToString(
      <FSMContextProvider machineManager={manager}>
        <FSMHydrationBoundary snapshot={createSnapshot(7)}>
          <Counter />
        </FSMHydrationBoundary>
      </FSMContextProvider>,
    );

    expect(html).toContain(">7<");
    expect(manager.getState().counter.context.count).toBe(0);
  });

  it("renderToString не вызывает transitionAfterHydrate", () => {
    const manager = createOnboardingManager();

    const html = renderToString(
      <FSMContextProvider machineManager={manager}>
        <FSMHydrationBoundary<OnboardingStore, OnboardingAction>
          snapshot={createProfileSnapshot("premium")}
          transitionAfterHydrate={{ type: "CHECK_ONBOARDING" }}
        >
          <OnboardingReadout />
        </FSMHydrationBoundary>
      </FSMContextProvider>,
    );

    expect(html).toContain(">IDLE<");
    expect(manager.getState().profile.state).toBe("IDLE");
    expect(manager.getState().onboarding.state).toBe("IDLE");
  });

  it("transitionAfterHydrate диспатчит событие после применения snapshot", async () => {
    const manager = createOnboardingManager();
    const actions: string[] = [];
    manager.onTransition((_prev, _current, action) => actions.push(action.type));

    render(
      <FSMContextProvider machineManager={manager}>
        <FSMHydrationBoundary<OnboardingStore, OnboardingAction>
          snapshot={createProfileSnapshot("premium")}
          transitionAfterHydrate={{ type: "CHECK_ONBOARDING" }}
        >
          <OnboardingReadout />
        </FSMHydrationBoundary>
      </FSMContextProvider>,
    );

    await waitFor(() => expect(manager.getState().onboarding.state).toBe("VISIBLE"));
    expect(manager.getState().profile.context.subscription?.id).toBe("premium");
    expect(manager.getState().onboarding.context.checks).toBe(1);
    expect(actions).toEqual([HYDRATE_ACTION_TYPE, "CHECK_ONBOARDING", "CHECK_ONBOARDING_RESOLVE"]);
  });

  it("transitionAfterHydrate работает даже если snapshot уже применён", async () => {
    const manager = createOnboardingManager();
    manager.hydrate(createProfileSnapshot("premium"));
    const actions: string[] = [];
    manager.onTransition((_prev, _current, action) => actions.push(action.type));

    render(
      <FSMContextProvider machineManager={manager}>
        <FSMHydrationBoundary<OnboardingStore, OnboardingAction>
          snapshot={createProfileSnapshot("premium")}
          transitionAfterHydrate={{ type: "CHECK_ONBOARDING" }}
        >
          <OnboardingReadout />
        </FSMHydrationBoundary>
      </FSMContextProvider>,
    );

    await waitFor(() => expect(manager.getState().onboarding.state).toBe("VISIBLE"));
    expect(actions).toEqual(["CHECK_ONBOARDING", "CHECK_ONBOARDING_RESOLVE"]);
  });

  it("transitionAfterHydrate диспатчит массив событий по порядку", () => {
    const manager = MachineManager<SequenceStore, SequenceAction>(sequenceStore);
    const log = ["hydrated"];

    const { getByTestId } = render(
      <FSMContextProvider machineManager={manager}>
        <FSMHydrationBoundary<SequenceStore, SequenceAction>
          snapshot={createSequenceSnapshot(log)}
          transitionAfterHydrate={[{ type: "FIRST" }, { type: "SECOND" }]}
        >
          <SequenceReadout />
        </FSMHydrationBoundary>
      </FSMContextProvider>,
    );

    expect(manager.getState().sequence.state).toBe("SECOND");
    expect(manager.getState().sequence.context.log).toEqual(["hydrated", "FIRST", "SECOND"]);
    expect(getByTestId("sequence").textContent).toBe("SECOND:hydrated,FIRST,SECOND");
  });

  it("transitionAfterHydrate с пустым массивом не диспатчит post actions", () => {
    const manager = createManager();
    const transition = vi.spyOn(manager, "transition");

    render(
      <FSMContextProvider machineManager={manager}>
        <FSMHydrationBoundary<Store, Action> snapshot={createSnapshot(3)} transitionAfterHydrate={[]}>
          <Counter />
        </FSMHydrationBoundary>
      </FSMContextProvider>,
    );

    expect(manager.getState().counter.context.count).toBe(3);
    expect(transition).not.toHaveBeenCalled();
  });

  it("transitionAfterHydrate не повторяет dispatch при rerender с теми же ссылками", () => {
    const manager = createManager();
    const transition = vi.spyOn(manager, "transition");
    const snapshot = createSnapshot(4);
    const action: Action = { type: "NOOP" };

    const App = () => (
      <FSMContextProvider machineManager={manager}>
        <FSMHydrationBoundary<Store, Action> snapshot={snapshot} transitionAfterHydrate={action}>
          <Counter />
        </FSMHydrationBoundary>
      </FSMContextProvider>
    );

    const { rerender } = render(<App />);
    expect(transition).toHaveBeenCalledOnce();

    rerender(<App />);
    expect(transition).toHaveBeenCalledOnce();
  });

  it("transitionAfterHydrate повторяет dispatch при смене strategy", () => {
    const manager = createManager();
    const hydrate = vi.spyOn(manager, "hydrate");
    const transition = vi.spyOn(manager, "transition");
    const snapshot = createSnapshot(6);
    const action: Action = { type: "NOOP" };

    const App = ({ strategy }: { strategy: HydrateStrategy }) => (
      <FSMContextProvider machineManager={manager}>
        <FSMHydrationBoundary<Store, Action>
          snapshot={snapshot}
          strategy={strategy}
          transitionAfterHydrate={action}
        >
          <Counter />
        </FSMHydrationBoundary>
      </FSMContextProvider>
    );

    const { rerender } = render(<App strategy="merge" />);
    expect(hydrate).toHaveBeenCalledOnce();
    expect(transition).toHaveBeenCalledOnce();

    rerender(<App strategy="replace" />);
    // Idempotent hydrate: previewState === baseState после первого commit, поэтому re-hydrate не запускается.
    expect(hydrate).toHaveBeenCalledOnce();
    expect(transition).toHaveBeenCalledTimes(2);
  });

  it("transitionAfterHydrate повторяет dispatch при смене ссылки prop с теми же snapshot и strategy", () => {
    const manager = createManager();
    const hydrate = vi.spyOn(manager, "hydrate");
    const transition = vi.spyOn(manager, "transition");
    const snapshot = createSnapshot(8);

    const App = ({ action }: { action: Action }) => (
      <FSMContextProvider machineManager={manager}>
        <FSMHydrationBoundary<Store, Action> snapshot={snapshot} transitionAfterHydrate={action}>
          <Counter />
        </FSMHydrationBoundary>
      </FSMContextProvider>
    );

    const firstAction: Action = { type: "NOOP" };
    const { rerender } = render(<App action={firstAction} />);
    expect(hydrate).toHaveBeenCalledOnce();
    expect(transition).toHaveBeenCalledOnce();
    expect(transition).toHaveBeenLastCalledWith(firstAction);

    const secondAction: Action = { type: "NOOP" };
    rerender(<App action={secondAction} />);
    expect(hydrate).toHaveBeenCalledOnce();
    expect(transition).toHaveBeenCalledTimes(2);
    expect(transition).toHaveBeenLastCalledWith(secondAction);
  });

  it("под React.StrictMode FSMHydrationBoundary вызывает manager.hydrate ровно один раз", () => {
    const manager = createManager();
    const hydrate = vi.spyOn(manager, "hydrate");

    render(
      <React.StrictMode>
        <FSMContextProvider machineManager={manager}>
          <FSMHydrationBoundary snapshot={createSnapshot(5)}>
            <Counter />
          </FSMHydrationBoundary>
        </FSMContextProvider>
      </React.StrictMode>,
    );

    expect(hydrate).toHaveBeenCalledOnce();
    expect(manager.getState().counter.context.count).toBe(5);
  });

  it("под React.StrictMode transitionAfterHydrate диспатчит один раз", async () => {
    const manager = createOnboardingManager();
    const hydrate = vi.spyOn(manager, "hydrate");
    const actions: string[] = [];
    manager.onTransition((_prev, _current, action) => actions.push(action.type));

    render(
      <React.StrictMode>
        <FSMContextProvider machineManager={manager}>
          <FSMHydrationBoundary<OnboardingStore, OnboardingAction>
            snapshot={createProfileSnapshot("premium")}
            transitionAfterHydrate={{ type: "CHECK_ONBOARDING" }}
          >
            <OnboardingReadout />
          </FSMHydrationBoundary>
        </FSMContextProvider>
      </React.StrictMode>,
    );

    await waitFor(() => expect(manager.getState().onboarding.state).toBe("VISIBLE"));
    expect(hydrate).toHaveBeenCalledOnce();
    expect(actions).toEqual([HYDRATE_ACTION_TYPE, "CHECK_ONBOARDING", "CHECK_ONBOARDING_RESOLVE"]);
  });

  it("под React.StrictMode useHydrateSnapshot вызывает manager.hydrate ровно один раз", () => {
    const manager = createManager();
    const hydrate = vi.spyOn(manager, "hydrate");

    render(
      <React.StrictMode>
        <FSMContextProvider machineManager={manager}>
          <CommitOnlyHydrator snapshot={createSnapshot(8)} />
          <Counter />
        </FSMContextProvider>
      </React.StrictMode>,
    );

    expect(hydrate).toHaveBeenCalledOnce();
    expect(manager.getState().counter.context.count).toBe(8);
  });

  it("unmount FSMHydrationBoundary убирает overlay, потомки переключаются на live state manager", () => {
    type Store = { counter: typeof counter };
    const manager = MachineManager<Store>(store);

    const renders: number[] = [];
    const Probe = () => {
      const value = useSelector<Store, number>((state) => state.counter.context.count);
      renders.push(value);
      return <span data-testid="probe">{value}</span>;
    };

    const Toggle = ({ withBoundary }: { withBoundary: boolean }) => (
      <FSMContextProvider machineManager={manager}>
        {withBoundary ? (
          <FSMHydrationBoundary snapshot={createSnapshot(11)}>
            <Probe />
          </FSMHydrationBoundary>
        ) : (
          <Probe />
        )}
      </FSMContextProvider>
    );

    const { rerender, getByTestId } = render(<Toggle withBoundary={true} />);
    expect(getByTestId("probe").textContent).toBe("11");
    expect(manager.getState().counter.context.count).toBe(11);

    rerender(<Toggle withBoundary={false} />);
    expect(getByTestId("probe").textContent).toBe("11");

    act(() => {
      manager.hydrate(createSnapshot(20));
    });
    expect(getByTestId("probe").textContent).toBe("20");
    expect(renders[renders.length - 1]).toBe(20);
  });

  it("hydrate hook возвращает prev — manager.hydrate не дёргает subscribers и не вызывает rerender", () => {
    type Store = { counter: typeof counter };
    const manager = MachineManager<Store>(store);
    manager.hydrate(createSnapshot(7));
    const subscriber = vi.fn();
    manager.onTransition(subscriber);

    let renders = 0;
    const Probe = () => {
      renders++;
      const value = useSelector<Store, number>((state) => state.counter.context.count);
      return <span data-testid="value">{value}</span>;
    };

    const { getByTestId } = render(
      <FSMContextProvider machineManager={manager}>
        <Probe />
      </FSMContextProvider>,
    );

    expect(getByTestId("value").textContent).toBe("7");
    const initial = renders;

    act(() => {
      manager.hydrate(createSnapshot(7));
      manager.hydrate(createSnapshot(7));
    });

    expect(subscriber).not.toHaveBeenCalled();
    expect(renders).toBe(initial);
  });

  it("Provider server snapshot защищает delayed subtree, если live manager обновился до hydration", async () => {
    const serverManager = createManager();
    const clientManager = createManager();
    const gate = createClientHydrationGate();
    const renders: number[] = [];
    const onRecoverableError = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const App = ({ manager }: { manager: ReturnType<typeof createManager> }) => (
      <FSMContextProvider machineManager={manager}>
        <React.Suspense fallback={<span>loading</span>}>
          <gate.Gate>
            <Counter renders={renders} />
          </gate.Gate>
        </React.Suspense>
      </FSMContextProvider>
    );

    const container = document.createElement("div");
    container.innerHTML = renderToString(<App manager={serverManager} />);
    document.body.appendChild(container);
    expect(container.textContent).toBe("0");
    renders.length = 0;

    gate.block();
    const root = hydrateRoot(container, <App manager={clientManager} />, { onRecoverableError });
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      clientManager.hydrate(createSnapshot(9));
    });
    expect(clientManager.getState().counter.context.count).toBe(9);

    await act(async () => {
      gate.release();
      await Promise.resolve();
    });

    await waitFor(() => expect(container.textContent).toBe("9"));
    expect(renders[0]).toBe(0);
    expect(renders[renders.length - 1]).toBe(9);
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(getHydrationErrors(consoleError.mock.calls)).toEqual([]);

    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
    consoleError.mockRestore();
  });

  it("custom getServerSnapshot имеет приоритет над default initial snapshot во время delayed hydration", async () => {
    const serverManager = createManager();
    const clientManager = createManager();
    const explicitServerState = serverManager.getHydratedState(createSnapshot(4));
    const gate = createClientHydrationGate();
    const renders: number[] = [];
    const onRecoverableError = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const App = ({ manager }: { manager: ReturnType<typeof createManager> }) => (
      <FSMContextProvider machineManager={manager} getServerSnapshot={() => explicitServerState}>
        <React.Suspense fallback={<span>loading</span>}>
          <gate.Gate>
            <Counter renders={renders} />
          </gate.Gate>
        </React.Suspense>
      </FSMContextProvider>
    );

    const container = document.createElement("div");
    container.innerHTML = renderToString(<App manager={serverManager} />);
    document.body.appendChild(container);
    expect(container.textContent).toBe("4");
    expect(serverManager.getState().counter.context.count).toBe(0);
    renders.length = 0;

    gate.block();
    const root = hydrateRoot(container, <App manager={clientManager} />, { onRecoverableError });
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      clientManager.hydrate(createSnapshot(9));
    });

    await act(async () => {
      gate.release();
      await Promise.resolve();
    });

    await waitFor(() => expect(container.textContent).toBe("9"));
    expect(renders[0]).toBe(4);
    expect(renders[renders.length - 1]).toBe(9);
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(getHydrationErrors(consoleError.mock.calls)).toEqual([]);

    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
    consoleError.mockRestore();
  });

  it("Provider default server snapshot фиксирует manager, подготовленный до Provider render", async () => {
    const serverManager = createManager();
    const clientManager = createManager();
    serverManager.hydrate(createSnapshot(4));
    clientManager.hydrate(createSnapshot(4));
    const gate = createClientHydrationGate();
    const renders: number[] = [];
    const onRecoverableError = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const App = ({ manager }: { manager: ReturnType<typeof createManager> }) => (
      <FSMContextProvider machineManager={manager}>
        <React.Suspense fallback={<span>loading</span>}>
          <gate.Gate>
            <Counter renders={renders} />
          </gate.Gate>
        </React.Suspense>
      </FSMContextProvider>
    );

    const container = document.createElement("div");
    container.innerHTML = renderToString(<App manager={serverManager} />);
    document.body.appendChild(container);
    expect(container.textContent).toBe("4");
    renders.length = 0;

    gate.block();
    const root = hydrateRoot(container, <App manager={clientManager} />, { onRecoverableError });
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      clientManager.hydrate(createSnapshot(9));
    });

    await act(async () => {
      gate.release();
      await Promise.resolve();
    });

    await waitFor(() => expect(container.textContent).toBe("9"));
    expect(renders[0]).toBe(4);
    expect(renders[renders.length - 1]).toBe(9);
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(getHydrationErrors(consoleError.mock.calls)).toEqual([]);

    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
    consoleError.mockRestore();
  });

  it("Boundary server snapshot используется на первом hydrateRoot render", async () => {
    const serverManager = createManager();
    const clientManager = createManager();
    clientManager.hydrate(createSnapshot(9));
    const renders: number[] = [];
    const onRecoverableError = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const App = ({ manager }: { manager: ReturnType<typeof createManager> }) => (
      <FSMContextProvider machineManager={manager}>
        <FSMHydrationBoundary snapshot={createSnapshot(5)}>
          <Counter renders={renders} />
        </FSMHydrationBoundary>
      </FSMContextProvider>
    );

    const container = document.createElement("div");
    container.innerHTML = renderToString(<App manager={serverManager} />);
    document.body.appendChild(container);
    expect(container.textContent).toBe("5");
    renders.length = 0;

    const root = hydrateRoot(container, <App manager={clientManager} />, { onRecoverableError });
    await waitFor(() => expect(renders.length).toBeGreaterThan(0));

    expect(renders[0]).toBe(5);
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(getHydrationErrors(consoleError.mock.calls)).toEqual([]);

    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
    consoleError.mockRestore();
  });

  it("Boundary server snapshot остаётся для delayed descendants после layout-effect commit", async () => {
    const serverManager = createManager();
    const clientManager = createManager();
    const gate = createClientHydrationGate();
    const renders: number[] = [];
    const onRecoverableError = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const hydrate = vi.spyOn(clientManager, "hydrate");

    const App = ({ manager }: { manager: ReturnType<typeof createManager> }) => (
      <FSMContextProvider machineManager={manager}>
        <FSMHydrationBoundary snapshot={createSnapshot(5)}>
          <React.Suspense fallback={<span>loading</span>}>
            <gate.Gate>
              <Counter renders={renders} />
            </gate.Gate>
          </React.Suspense>
        </FSMHydrationBoundary>
      </FSMContextProvider>
    );

    const container = document.createElement("div");
    container.innerHTML = renderToString(<App manager={serverManager} />);
    document.body.appendChild(container);
    expect(container.textContent).toBe("5");
    renders.length = 0;

    gate.block();
    const root = hydrateRoot(container, <App manager={clientManager} />, { onRecoverableError });
    await waitFor(() => expect(hydrate).toHaveBeenCalledOnce());
    expect(clientManager.getState().counter.context.count).toBe(5);

    act(() => {
      clientManager.hydrate(createSnapshot(9));
    });
    expect(clientManager.getState().counter.context.count).toBe(9);

    await act(async () => {
      gate.release();
      await Promise.resolve();
    });

    await waitFor(() => expect(container.textContent).toBe("9"));
    expect(renders[renders.length - 1]).toBe(9);
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(getHydrationErrors(consoleError.mock.calls)).toEqual([]);

    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
    consoleError.mockRestore();
  });

  it("nested boundaries используют composed server snapshot на первом hydrateRoot render", async () => {
    const serverManager = MachineManager(nestedStore);
    const clientManager = MachineManager(nestedStore);
    clientManager.hydrate(createNestedSnapshot(9, false));
    const renders: string[] = [];
    const onRecoverableError = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const Probe = () => {
      const count = useSelector<NestedStore, number>((state) => state.counter.context.count);
      const enabled = useSelector<NestedStore, boolean>((state) => state.flag.context.enabled);
      const label = `${count}:${enabled ? "on" : "off"}`;
      renders.push(label);
      return <span data-testid="nested">{label}</span>;
    };

    const App = ({ manager }: { manager: typeof clientManager }) => (
      <FSMContextProvider machineManager={manager}>
        <FSMHydrationBoundary snapshot={createNestedCounterSnapshot(5)}>
          <FSMHydrationBoundary snapshot={createFlagSnapshot(true)}>
            <Probe />
          </FSMHydrationBoundary>
        </FSMHydrationBoundary>
      </FSMContextProvider>
    );

    const container = document.createElement("div");
    container.innerHTML = renderToString(<App manager={serverManager} />);
    document.body.appendChild(container);
    expect(container.textContent).toBe("5:on");
    renders.length = 0;

    const root = hydrateRoot(container, <App manager={clientManager} />, { onRecoverableError });
    await waitFor(() => expect(renders.length).toBeGreaterThan(0));

    expect(renders[0]).toBe("5:on");
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(getHydrationErrors(consoleError.mock.calls)).toEqual([]);

    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
    consoleError.mockRestore();
  });

  it("nested boundaries сохраняют composed server snapshot для delayed hydration после live race", async () => {
    const serverManager = MachineManager(nestedStore);
    const clientManager = MachineManager(nestedStore);
    const gate = createClientHydrationGate();
    const renders: string[] = [];
    const onRecoverableError = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const hydrate = vi.spyOn(clientManager, "hydrate");

    const Probe = () => {
      const count = useSelector<NestedStore, number>((state) => state.counter.context.count);
      const enabled = useSelector<NestedStore, boolean>((state) => state.flag.context.enabled);
      const label = `${count}:${enabled ? "on" : "off"}`;
      renders.push(label);
      return <span data-testid="nested">{label}</span>;
    };

    const App = ({ manager }: { manager: typeof clientManager }) => (
      <FSMContextProvider machineManager={manager}>
        <FSMHydrationBoundary snapshot={createNestedCounterSnapshot(5)}>
          <FSMHydrationBoundary snapshot={createFlagSnapshot(true)}>
            <React.Suspense fallback={<span>loading</span>}>
              <gate.Gate>
                <Probe />
              </gate.Gate>
            </React.Suspense>
          </FSMHydrationBoundary>
        </FSMHydrationBoundary>
      </FSMContextProvider>
    );

    const container = document.createElement("div");
    container.innerHTML = renderToString(<App manager={serverManager} />);
    document.body.appendChild(container);
    expect(container.textContent).toBe("5:on");
    renders.length = 0;

    gate.block();
    const root = hydrateRoot(container, <App manager={clientManager} />, { onRecoverableError });
    await waitFor(() => expect(hydrate).toHaveBeenCalledTimes(2));
    expect(clientManager.getState().counter.context.count).toBe(5);
    expect(clientManager.getState().flag.context.enabled).toBe(true);

    act(() => {
      clientManager.hydrate(createNestedSnapshot(9, false));
    });
    expect(clientManager.getState().counter.context.count).toBe(9);
    expect(clientManager.getState().flag.context.enabled).toBe(false);

    await act(async () => {
      gate.release();
      await Promise.resolve();
    });

    await waitFor(() => expect(container.textContent).toBe("9:off"));
    expect(renders[renders.length - 1]).toBe("9:off");
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(getHydrationErrors(consoleError.mock.calls)).toEqual([]);

    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
    consoleError.mockRestore();
  });
});
