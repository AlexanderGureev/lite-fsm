// @vitest-environment jsdom
import React from "react";
import { act, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { MachineManager } from "../../src/core/MachineManager";
import type { HydrateStrategy, MachineConfig, MachineManagerSnapshot } from "../../src/core/types";
import { FSMContextProvider, FSMHydrationBoundary, useHydrateSnapshot, useManager, useSelector } from "../../src/react";

type Config = { IDLE: {} };
type Action = { type: "NOOP" };
type Context = { count: number };
type Snapshot = { count: number };
type FlagConfig = { READY: {} };
type FlagContext = { enabled: boolean };
type FlagSnapshot = { enabled: boolean };

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
});
