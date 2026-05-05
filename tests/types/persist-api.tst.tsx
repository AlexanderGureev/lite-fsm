import React from "react";
import { describe, expect, test } from "tstyche";
import { MachineManager } from "lite-fsm";
import type {
  FSMEvent,
  MachineConfig,
  MachineManagerSnapshot,
  MachineReducer,
  MachinesState,
  ManagerCommitAction,
  StateType,
} from "lite-fsm";
import { FSMContextProvider, type FSMContextProviderProps, type FSMPersistLifecycle } from "lite-fsm/react";
import * as persistEntry from "lite-fsm/persist";
import {
  createJsonStorage,
  persistManager,
  type MaybePromise,
  type PersistController,
  type PersistManagerOptions,
  type PersistRestoreSettledResult,
  type PersistStatus,
  type PersistStorage,
  type PersistedRecord,
} from "lite-fsm/persist";
import * as persistReactEntry from "lite-fsm/persist/react";
import { useIsPersistRestoring, usePersistStatus } from "lite-fsm/persist/react";

import type { Assert, Equal } from "./_helpers";

type Event = FSMEvent<"PING"> | FSMEvent<"DONE">;
type Config = { idle: { PING: "busy" }; busy: { DONE: "idle" } };
type Context = { requests: number };
type ActorConfig = { __INIT: { PING: "pending" }; pending: { DONE: "__RESOLVED" } };
type ActorContext = { id: string };

const reducer: MachineReducer<Config, Event, Context> = (state, _action, meta) => ({
  state: meta.nextState,
  context: state.context,
});

const machine = {
  config: { idle: { PING: "busy" }, busy: { DONE: "idle" } },
  initialState: "idle",
  initialContext: { requests: 0 },
  reducer,
} satisfies MachineConfig<Config, Context, Event>;

const actor = {
  config: { __INIT: { PING: "pending" }, pending: { DONE: "__RESOLVED" } },
  initialState: "__INIT",
  initialContext: { id: "" },
} satisfies MachineConfig<ActorConfig, ActorContext, Event>;

const store = { x: machine };
type Store = typeof store;
const mixedStore = { x: machine, sync: actor };
type MixedStore = typeof mixedStore;

const manager = MachineManager<Store, Event>(store);
const mixedManager = MachineManager<MixedStore, Event>(mixedStore);

const storage: PersistStorage<Store> = {
  get: () => ({
    timestamp: 1,
    snapshot: {
      machines: {
        x: { state: "idle", context: { requests: 1 } },
      },
    },
  }),
  set: (record) => {
    expect(record.snapshot).type.toBe<MachineManagerSnapshot<Store>>();
  },
  remove: () => {},
};

describe("lite-fsm/persist public API", () => {
  test("entrypoints экспортируют только runtime helpers", () => {
    type _PersistKeys = Assert<Equal<keyof typeof persistEntry, "createJsonStorage" | "persistManager">>;
    type _PersistReactKeys = Assert<
      Equal<keyof typeof persistReactEntry, "useIsPersistRestoring" | "usePersistStatus">
    >;
  });

  test("типы PersistStorage и PersistedRecord сохраняют MachineManagerSnapshot<S>", () => {
    type _Maybe = Assert<Equal<MaybePromise<number>, number | Promise<number>>>;
    type _RecordSnapshot = Assert<Equal<PersistedRecord<Store>["snapshot"], MachineManagerSnapshot<Store>>>;
    type _StorageGet = Assert<
      Equal<Awaited<ReturnType<PersistStorage<Store>["get"]>>, PersistedRecord<Store> | undefined>
    >;
    type _Status = Assert<
      Equal<
        PersistStatus,
        | { phase: "idle" }
        | { phase: "restoring" }
        | { phase: "ready"; restored: boolean }
        | { phase: "error"; error: unknown }
      >
    >;
    type _RestoreSettled = Assert<
      Equal<PersistRestoreSettledResult, { phase: "ready"; restored: boolean } | { phase: "error"; error: unknown }>
    >;
  });

  test("persistManager принимает только dehydrate-eligible machine keys", () => {
    const controller = persistManager(manager, { storage, machines: ["x"] });
    expect(controller).type.toBe<PersistController>();

    persistManager(mixedManager, {
      storage: storage as unknown as PersistStorage<MixedStore>,
      // @ts-expect-error!
      machines: ["sync"],
    });
  });

  test("PersistManagerOptions типизирует callbacks от manager state и commit action", () => {
    const options: PersistManagerOptions<Store> = {
      storage,
      shouldSave: ({ prevState, currentState, action }) => {
        expect(prevState).type.toBe<MachinesState<Store>>();
        expect(currentState.x).type.toBe<StateType<Config, Context>>();
        expect(action).type.toBe<ManagerCommitAction<Store>>();
        return action.type !== "DONE";
      },
      migrate: (record) => {
        expect(record.snapshot).type.toBe<MachineManagerSnapshot<Store>>();
        return record.snapshot;
      },
      onRestoreSettled: (result) => {
        expect(result).type.toBe<PersistRestoreSettledResult>();
        if (result.phase === "ready") {
          expect(result.restored).type.toBe<boolean>();
        } else {
          expect(result.error).type.toBe<unknown>();
        }
      },
    };

    expect(options.storage).type.toBe<PersistStorage<Store>>();
  });

  test("createJsonStorage создаёт typed PersistStorage<S>", () => {
    const jsonStorage = createJsonStorage<Store>({
      key: "state",
      storage: {
        getItem: () => null,
        setItem: (_key, _value) => {},
        removeItem: (_key) => {},
      },
    });

    expect(jsonStorage).type.toBe<PersistStorage<Store>>();
  });
});

describe("React persist API", () => {
  test("FSMContextProviderProps.persist принимает structural lifecycle", () => {
    const lifecycle = { start: () => () => {} };
    expect(lifecycle).type.toBeAssignableTo<FSMPersistLifecycle>();

    const props: FSMContextProviderProps<Store, Event> = {
      machineManager: manager,
      persist: lifecycle,
    };
    expect(props.persist).type.toBe<FSMPersistLifecycle | readonly FSMPersistLifecycle[] | undefined>();

    const arrayProps: FSMContextProviderProps<Store, Event> = {
      machineManager: manager,
      persist: [lifecycle],
    };
    expect(arrayProps.persist).type.toBe<FSMPersistLifecycle | readonly FSMPersistLifecycle[] | undefined>();

    const el = (
      <FSMContextProvider machineManager={manager} persist={lifecycle}>
        <span>child</span>
      </FSMContextProvider>
    );
    expect(el).type.toBeAssignableTo<React.JSX.Element>();
  });

  test("persist/react hooks типизированы через PersistController", () => {
    const controller = persistManager(manager, { storage });

    expect(usePersistStatus(controller)).type.toBe<PersistStatus>();
    expect(useIsPersistRestoring(controller)).type.toBe<boolean>();
  });
});
