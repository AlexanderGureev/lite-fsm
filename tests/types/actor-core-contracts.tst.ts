import { describe, expect, test } from "tstyche";
import {
  createActorMeta,
  createEffect,
  createMachine,
  type ActionForState,
  type ActorActionForState,
  type ActorDefaultDeps,
  type ActorMeta,
  type ActorPublicState,
  type ActorSystemState,
  type ActorTerminalState,
  type ActorTransition,
  type AnyEvent,
  type AnyRecord,
  type DehydrateOptions,
  type DomainTransitionTarget,
  type EffectStateName,
  type FSMEvent,
  type FSMEventMeta,
  type HydrateAction,
  type HydrateMeta,
  type HydrateOptions,
  type HydratePreviewOptions,
  type IncomingEventTypes,
  type IsActorTemplate,
  type MachineConfig,
  type MachineDependencies,
  type MachineEffect,
  type MachineManagerRuntimeSnapshot,
  type MachineManagerSnapshot,
  type MachineReducer,
  type MachineReducerInputState,
  type MachineReducerState,
  type MachineRuntimeSnapshot,
  type MachineRuntimeSnapshotForMachine,
  type MachineSliceState,
  type MachineSnapshot,
  type MachinesState,
  type ManagerAction,
  type ManagerCommitAction,
  type PublicActorSlice,
  type Self,
  type SnapshotForMachine,
  type StateType,
  type TransitionNextState,
  type TransitionSubscriber,
  type TransitionTargetForConfig,
  type TypedCreateEffectFn,
  type TypedCreateMachineFn,
  type UnknownMachineKeyContext,
  type WILDCARD,
} from "@lite-fsm/core";

import type { ActorIdentity as InternalActorIdentity, ActorRuntime as InternalActorRuntime } from "@lite-fsm/core/internal/actor";
import type { Assert, Equal, IsNever } from "./_helpers";

// @ts-expect-error! внутренние actor runtime типы не экспортируются из публичного entrypoint
import type { ActorRuntime } from "@lite-fsm/core";
// @ts-expect-error! внутренние actor effect deps не экспортируются из публичного entrypoint
import type { InternalActorEffectDeps } from "@lite-fsm/core";
// @ts-expect-error! внутренний sidecar state не экспортируется из публичного entrypoint
import type { SidecarState } from "@lite-fsm/core";
// @ts-expect-error! внутренний dispatch context не экспортируется из публичного entrypoint
import type { DispatchContext } from "@lite-fsm/core";

type Spawn = FSMEvent<"SPAWN", { id: string }>;
type Done = FSMEvent<"DONE", { ok: boolean }>;
type Cancel = FSMEvent<"CANCEL">;
type Reset = FSMEvent<"RESET">;
type Evt = Spawn | Done | Cancel | Reset;

type ActorCfg = {
  __INIT: { SPAWN: "PENDING" };
  PENDING: { DONE: "__RESOLVED"; RESET: null };
  "*": { CANCEL: "__CANCELLED" };
};

type DomainCfg = {
  idle: { SPAWN: "busy" };
  busy: { DONE: "idle" };
  orphan: {};
  "*": { RESET: "idle" };
};

type ActorCtx = { id: string };
type DomainCtx = { count: number };
type UserDeps = { clock: () => number };

const actorMachine = createMachine<Evt, UserDeps, ActorCfg, ActorCtx>({
  config: {
    __INIT: { SPAWN: "PENDING" },
    PENDING: { DONE: "__RESOLVED", RESET: null },
    "*": { CANCEL: "__CANCELLED" },
  },
  initialState: "__INIT",
  initialContext: { id: "" },
  effects: {
    PENDING: ({ clock }) => {
      expect(clock()).type.toBe<number>();
    },
  },
});

const domainMachine = createMachine<Evt, UserDeps, DomainCfg, DomainCtx>({
  config: {
    idle: { SPAWN: "busy" },
    busy: { DONE: "idle" },
    orphan: {},
    "*": { RESET: "idle" },
  },
  initialState: "idle",
  initialContext: { count: 0 },
  effects: {
    busy: ({ clock }) => {
      expect(clock()).type.toBe<number>();
    },
  },
});

describe("публичные type-контракты actor core", () => {
  test("canary импорта публичной type-only поверхности из core", () => {
    expect<AnyRecord>().type.toBe<Record<string, unknown>>();
    expect<HydrateOptions>().type.toBe<{ strategy?: "replace" | "merge" }>();
    expect<HydrateMeta>().type.toBe<{ strategy: "replace" | "merge" }>();
    expect<UnknownMachineKeyContext>().type.toBe<"hydrate" | "opts.snapshot">();
    expect<WILDCARD>().type.toBe<"*">();
    expect<ActorTerminalState>().type.toBe<"__RESOLVED" | "__REJECTED" | "__CANCELLED">();
    expect<ActorSystemState>().type.toBe<"__INIT" | ActorTerminalState>();
  });

  test("FSMEventMeta содержит routing fields и sender fields с точными типами", () => {
    type _Keys = Assert<
      Equal<
        keyof FSMEventMeta,
        "actorId" | "groupId" | "groupTag" | "senderActorId" | "senderGroupId" | "senderGroupTag"
      >
    >;
    expect<FSMEventMeta["actorId"]>().type.toBe<string | string[] | undefined>();
    expect<FSMEventMeta["groupId"]>().type.toBe<string | string[] | undefined>();
    expect<FSMEventMeta["groupTag"]>().type.toBe<string | string[] | undefined>();
    expect<FSMEventMeta["senderActorId"]>().type.toBe<string | undefined>();
    expect<FSMEventMeta["senderGroupId"]>().type.toBe<string | undefined>();
    expect<FSMEventMeta["senderGroupTag"]>().type.toBe<string | undefined>();
  });

  test("ManagerAction добавляет optional meta и сохраняет discriminated union narrowing", () => {
    const action: ManagerAction<Evt> = { type: "SPAWN", payload: { id: "a" }, meta: { groupTag: ["actor"] } };
    expect(action.payload.id).type.toBe<string>();

    const narrow = (next: ManagerAction<Evt>) => {
      if (next.type === "DONE") {
        expect(next.payload.ok).type.toBe<boolean>();
      } else if (next.type === "CANCEL") {
        // @ts-expect-error!
        next.payload;
      }
    };
    narrow(action);
  });

  test("ActorMeta и Self остаются одним structural type", () => {
    type _Self = Assert<Equal<Self, ActorMeta>>;
    type _Shape = Assert<Equal<Self, { actorId: string; groupId: string; groupTag: string }>>;
  });

  test("internal ActorRuntime хранит routing fields только в meta", () => {
    type _IdentityShape = Assert<Equal<InternalActorIdentity, { meta: Readonly<ActorMeta>; templateKey: string }>>;
    type _RuntimeKeys = Assert<Equal<keyof InternalActorRuntime, keyof InternalActorIdentity | "bag">>;
    type _RuntimeMeta = Assert<Equal<InternalActorRuntime["meta"], Readonly<ActorMeta>>>;
    type _RuntimeTemplate = Assert<Equal<InternalActorRuntime["templateKey"], string>>;
    type _RuntimeBag = Assert<Equal<InternalActorRuntime["bag"], Map<symbol, () => void>>>;
    type _NoDuplicatedFields = Assert<
      Equal<Extract<keyof InternalActorRuntime, "actorId" | "groupId" | "groupTag">, never>
    >;
  });

  test("createActorMeta принимает public identity и возвращает readonly ActorMeta", () => {
    const meta = createActorMeta({ actorId: "actor", groupId: "group", groupTag: "tag" });
    const fromRuntimeShape = createActorMeta({
      actorId: "actor",
      groupId: "group",
      groupTag: "tag",
      templateKey: "template",
    });

    expect(meta).type.toBe<Readonly<ActorMeta>>();
    expect(fromRuntimeShape).type.toBe<Readonly<ActorMeta>>();
    // @ts-expect-error!
    meta.groupId = "next";
  });

  test("transition target и reducer state semantics различают domain и actor config", () => {
    type _DomainTarget = Assert<Equal<DomainTransitionTarget<keyof DomainCfg>, "idle" | "busy" | "orphan" | null>>;
    type _DomainConfigTarget = Assert<
      Equal<TransitionTargetForConfig<DomainCfg, keyof DomainCfg>, "idle" | "busy" | "orphan" | null>
    >;
    expect<TransitionTargetForConfig<ActorCfg, keyof ActorCfg>>().type.toBe<"PENDING" | ActorTerminalState | null>();
    type _DomainNext = Assert<Equal<TransitionNextState<DomainCfg>, "idle" | "busy" | "orphan">>;
    type _ActorNext = Assert<Equal<TransitionNextState<ActorCfg>, "PENDING" | ActorTerminalState>>;
    type _ActorInput = Assert<
      Equal<
        MachineReducerInputState<ActorCfg, ActorCtx>,
        { state: "__INIT" | "PENDING" | ActorTerminalState; context: ActorCtx }
      >
    >;
    type _ActorReducerState = Assert<
      Equal<MachineReducerState<ActorCfg, ActorCtx>, { state: "PENDING" | ActorTerminalState; context: ActorCtx }>
    >;
  });

  test("MachineReducer actor meta получает terminal nextState, но output не принимает __INIT", () => {
    const reducer: MachineReducer<ActorCfg, Evt, ActorCtx> = (state, action, meta) => {
      expect(state.state).type.toBe<"__INIT" | "PENDING" | ActorTerminalState>();
      expect(action).type.toBe<ManagerAction<Evt>>();
      expect(meta.nextState).type.toBe<"PENDING" | ActorTerminalState>();
      return { state: meta.nextState, context: state.context };
    };

    const badReducer: MachineReducer<ActorCfg, Evt, ActorCtx> = () => ({
      // @ts-expect-error!
      state: "__INIT",
      context: { id: "" },
    });

    void reducer;
    void badReducer;
  });

  test("actor public states, effect state names и incoming events сужаются по config", () => {
    type _Public = Assert<Equal<ActorPublicState<ActorCfg>, "PENDING">>;
    type _ActorEffectStates = Assert<Equal<EffectStateName<ActorCfg>, "PENDING" | "*">>;
    type _DomainEffectStates = Assert<Equal<EffectStateName<DomainCfg>, "idle" | "busy" | "orphan" | "*">>;
    type _IncomingBusy = Assert<Equal<IncomingEventTypes<DomainCfg, "busy">, "SPAWN">>;
    type _BusyAction = Assert<Equal<ActionForState<DomainCfg, "busy", Evt>, Spawn>>;
    type _WildcardAction = Assert<Equal<ActionForState<DomainCfg, "*", Evt>, Evt>>;
    type _OrphanAction = Assert<IsNever<ActionForState<DomainCfg, "orphan", Evt>>>;
  });

  test("IsActorTemplate требует literal __INIT и не срабатывает на wide Record", () => {
    type _Actor = Assert<Equal<IsActorTemplate<typeof actorMachine>, true>>;
    type _Domain = Assert<Equal<IsActorTemplate<typeof domainMachine>, false>>;
    type _Wide = Assert<Equal<IsActorTemplate<{ config: Record<string, object> }>, false>>;
  });

  test("MachineSliceState и MachinesState сохраняют key-level shape mixed store", () => {
    type Store = { domain: typeof domainMachine; sync: typeof actorMachine };
    type _DomainSlice = Assert<
      Equal<MachineSliceState<typeof domainMachine>, { state: "idle" | "busy" | "orphan"; context: DomainCtx }>
    >;
    type _ActorSlice = Assert<
      Equal<MachineSliceState<typeof actorMachine>, Record<string, PublicActorSlice<ActorCfg, ActorCtx>>>
    >;
    expect<MachinesState<Store>>().type.toBe<{
      domain: { state: "idle" | "busy" | "orphan"; context: DomainCtx };
      sync: Record<string, PublicActorSlice<ActorCfg, ActorCtx>>;
    }>();
  });

  test("actor effects получают ActorDefaultDeps, domain effects не получают self", () => {
    const actorEffect: MachineEffect<"PENDING", ActorCfg, Evt, UserDeps> = ({
      action,
      self,
      transition,
      condition,
      clock,
    }) => {
      expect(action).type.toBe<ActorActionForState<ActorCfg, "PENDING", Evt>>();
      expect(self).type.toBe<Self>();
      expect(transition).type.toBe<ActorTransition<Evt>>();
      expect(condition).type.toBe<(predicate: (a: ManagerAction<Evt>) => boolean) => Promise<boolean>>();
      expect(clock()).type.toBe<number>();
    };
    const domainEffect: MachineEffect<"busy", DomainCfg, Evt, UserDeps> = (deps) => {
      const { action, transition, condition, clock } = deps;
      expect(action).type.toBe<Spawn>();
      expect(transition).type.toBe<(data: ManagerAction<Evt>) => ManagerAction<Evt>>();
      expect(condition).type.toBe<(predicate: (a: Evt) => boolean) => Promise<boolean>>();
      expect(clock()).type.toBe<number>();
      // @ts-expect-error!
      deps.self;
    };

    expect<ActorDefaultDeps<"PENDING", ActorCfg, Evt>["action"]>().type.toBe<ManagerAction<Spawn>>();
    void actorEffect;
    void domainEffect;
  });

  test("ActorTransition sugar принимает plain action без заранее заданного meta", () => {
    const effect = ({ self, transition }: ActorDefaultDeps<"PENDING", ActorCfg, Evt>) => {
      transition({ type: "DONE", payload: { ok: true }, meta: { actorId: self.actorId } });
      transition.unscoped({ type: "CANCEL" });
      transition.actor([self.actorId], { type: "DONE", payload: { ok: true } });
      transition.group(self.groupId, { type: "DONE", payload: { ok: true } });
      transition.tag(self.groupTag, { type: "DONE", payload: { ok: true } });
      // @ts-expect-error!
      transition.actor(self.actorId, { type: "DONE", payload: { ok: true }, meta: { actorId: self.actorId } });
    };
    void effect;
  });

  test("MachineDependencies для actor effects оставляет только user deps", () => {
    const actorForDeps = {
      config: {
        __INIT: { SPAWN: "PENDING" },
        PENDING: { DONE: "__RESOLVED", RESET: null },
        "*": { CANCEL: "__CANCELLED" },
      },
      initialState: "__INIT",
      initialContext: { id: "" },
      effects: {
        PENDING: ({ clock, self }) => {
          expect(clock()).type.toBe<number>();
          expect(self).type.toBe<Self>();
        },
      },
    } satisfies MachineConfig<ActorCfg, ActorCtx, Evt, UserDeps>;
    const domainForDeps = {
      config: {
        idle: { SPAWN: "busy" },
        busy: { DONE: "idle" },
        orphan: {},
        "*": { RESET: "idle" },
      },
      initialState: "idle",
      initialContext: { count: 0 },
      effects: {
        busy: ({ clock }) => {
          expect(clock()).type.toBe<number>();
        },
      },
    } satisfies MachineConfig<DomainCfg, DomainCtx, Evt, UserDeps>;
    type Store = { domain: typeof domainForDeps; sync: typeof actorForDeps };

    expect<MachineDependencies<Store>>().type.toBe<UserDeps>();
  });

  test("TypedCreateEffectFn типизирует actor deps и cancelFn", () => {
    const typed: TypedCreateEffectFn<Evt, UserDeps> = createEffect;
    typed<ActorCfg, "PENDING">({
      effect: ({ self, transition, clock }) => {
        expect(self).type.toBe<Self>();
        expect(clock()).type.toBe<number>();
        transition.actor(self.actorId, { type: "DONE", payload: { ok: true } });
      },
      cancelFn: ({ transition, self }) => {
        // @ts-expect-error!
        transition.actor(self.actorId, { type: "DONE", payload: { ok: true }, meta: { actorId: self.actorId } });
        return () => false;
      },
    });
  });

  test("snapshot и hydration types различают runtime actor records и domain envelope", () => {
    type Store = { domain: typeof domainMachine; sync: typeof actorMachine };
    type DomainRuntime = MachineRuntimeSnapshot<DomainCfg, DomainCtx>;
    type _RuntimeAlias = Assert<Equal<DomainRuntime, StateType<DomainCfg, DomainCtx>>>;
    type _DomainForMachine = Assert<Equal<MachineRuntimeSnapshotForMachine<typeof domainMachine>, DomainRuntime>>;
    type _ActorForMachine = Assert<
      Equal<MachineRuntimeSnapshotForMachine<typeof actorMachine>, Record<string, PublicActorSlice<ActorCfg, ActorCtx>>>
    >;
    type _SnapshotForDomain = Assert<Equal<SnapshotForMachine<typeof domainMachine>, DomainRuntime>>;
    type _MachineSnapshot = Assert<Equal<MachineSnapshot<typeof domainMachine>, DomainRuntime>>;

    expect<MachineManagerRuntimeSnapshot<Store>["machines"]>().type.toBe<{
      domain: DomainRuntime;
      sync: Record<string, PublicActorSlice<ActorCfg, ActorCtx>>;
    }>();
    expect<MachineManagerSnapshot<Store>["machines"]>().type.toBe<Partial<{ domain: DomainRuntime }>>();
    expect<DehydrateOptions<Store>["machines"]>().type.toBe<ReadonlyArray<"domain"> | undefined>();
    expect<HydrateAction<Store>>().type.toBe<{
      type: "@@lite-fsm/HYDRATE";
      payload: { strategy: "replace" | "merge"; snapshot: MachineManagerSnapshot<Store> };
    }>();
    expect<ManagerCommitAction<Store, ManagerAction<Evt>>>().type.toBe<
      ManagerAction<Evt> | HydrateAction<Store>
    >();
    expect<HydratePreviewOptions<Store>["baseState"]>().type.toBe<MachinesState<Store> | undefined>();
  });

  test("TransitionSubscriber обязан принимать user action и hydrate action union", () => {
    type Store = { domain: typeof domainMachine; sync: typeof actorMachine };
    const subscriber: TransitionSubscriber<Store, Evt> = (_prev, _current, action) => {
      if (action.type === "@@lite-fsm/HYDRATE") {
        expect(action.payload.snapshot).type.toBe<MachineManagerSnapshot<Store>>();
      } else {
        expect(action).type.toBe<ManagerAction<Evt>>();
      }
    };
    void subscriber;
  });

  test("TypedCreateMachineFn сохраняет actor state union без widening до string", () => {
    const typed: TypedCreateMachineFn<Evt, UserDeps> = createMachine;
    const machine = typed({
      config: {
        __INIT: { SPAWN: "PENDING" },
        PENDING: { DONE: "__RESOLVED", RESET: null },
        "*": { CANCEL: "__CANCELLED" },
      },
      initialState: "__INIT",
      initialContext: { id: "" },
    });

    expect(machine.initialState).type.toBe<"__INIT" | "PENDING">();
    expect<ActorPublicState<typeof machine.config>>().type.toBe<"PENDING">();
  });
});
