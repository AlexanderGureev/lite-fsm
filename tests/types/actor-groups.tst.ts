import { describe, expect, test } from "tstyche";
import {
  createMachine,
  type ActorDefaultDeps,
  type ActorMeta,
  type ActorPublicState,
  type ActorTransition,
  type FSMEvent,
  type MachineManagerRuntimeSnapshot,
  type MachineManagerSnapshot,
  type ManagerAction,
  type MachinesState,
  type PublicActorSlice,
  type Self,
} from "@lite-fsm/core";

import type { Assert, Equal } from "./_helpers";

type Spawn = FSMEvent<"SPAWN", { id: string }>;
type Done = FSMEvent<"DONE">;
type Cancel = FSMEvent<"CANCEL">;
type Evt = Spawn | Done | Cancel;

type ActorCfg = {
  __INIT: { SPAWN: "PENDING" };
  PENDING: { DONE: "__RESOLVED" };
  "*": { CANCEL: "__CANCELLED" };
};

type DomainCfg = {
  IDLE: { SPAWN: "BUSY" };
  BUSY: {};
};

const actorMachine = createMachine<Evt, {}, ActorCfg, { id: string }>({
  config: {
    __INIT: { SPAWN: "PENDING" },
    PENDING: { DONE: "__RESOLVED" },
    "*": { CANCEL: "__CANCELLED" },
  },
  initialState: "__INIT",
  initialContext: { id: "" },
});

const domainMachine = createMachine<Evt, {}, DomainCfg, { count: number }>({
  config: {
    IDLE: { SPAWN: "BUSY" },
    BUSY: {},
  },
  initialState: "IDLE",
  initialContext: { count: 0 },
});

describe("type-контракт actor groups", () => {
  test("MachinesState условно мапит actor template в Record<actorId, PublicActorSlice>", () => {
    type State = MachinesState<{ domain: typeof domainMachine; sync: typeof actorMachine }>;
    type _Shape = Assert<
      Equal<
        State,
        {
          domain: { state: "IDLE" | "BUSY"; context: { count: number } };
          sync: Record<string, PublicActorSlice<ActorCfg, { id: string }>>;
        }
      >
    >;
  });

  test("snapshots разделяют runtime actor records и domain-only hydration envelope", () => {
    type Store = { domain: typeof domainMachine; sync: typeof actorMachine };
    type Snapshot = MachineManagerSnapshot<Store>;
    type RuntimeSnapshot = MachineManagerRuntimeSnapshot<Store>;

    const snapshot: Snapshot = {
      machines: {
        domain: { state: "IDLE", context: { count: 0 } },
      },
    };

    expect(snapshot).type.toBe<Snapshot>();
    expect<Snapshot["machines"]>().type.toBe<
      Partial<{
        domain: { state: "IDLE" | "BUSY"; context: { count: number } };
      }>
    >();
    expect<RuntimeSnapshot["machines"]>().type.toBe<{
      domain: { state: "IDLE" | "BUSY"; context: { count: number } };
      sync: Record<string, PublicActorSlice<ActorCfg, { id: string }>>;
    }>();
    expect<RuntimeSnapshot["machines"]["sync"]>().type.toBe<Record<string, PublicActorSlice<ActorCfg, { id: string }>>>();

    const invalidSnapshot: Snapshot = {
      machines: {
        // @ts-expect-error!
        sync: {},
      },
    };

    void invalidSnapshot;
  });

  test("PublicActorSlice содержит runtime meta и скрывает system states", () => {
    type Slice = PublicActorSlice<ActorCfg, { id: string }>;
    type _Keys = Assert<Equal<keyof Slice, "state" | "context" | "meta">>;
    expect<Slice["state"]>().type.toBe<"PENDING">();
    expect<Slice["meta"]>().type.toBe<Readonly<ActorMeta>>();
    expect<ActorPublicState<ActorCfg>>().type.toBe<"PENDING">();
  });

  test("ManagerAction добавляет routing и sender meta", () => {
    const action: ManagerAction<Spawn> = {
      type: "SPAWN",
      payload: { id: "a" },
      meta: {
        actorId: ["sync/0"],
        groupId: "sync/0",
        groupTag: "sync",
        senderActorId: "sync/0",
        senderGroupId: "sync/0",
        senderGroupTag: "sync",
      },
    };

    expect(action).type.toBe<ManagerAction<Spawn>>();
  });

  test("terminal targets разрешены actor templates и отклоняются у domain machines", () => {
    createMachine<Evt, {}, ActorCfg, { id: string }>({
      config: { __INIT: { SPAWN: "PENDING" }, PENDING: { DONE: "__RESOLVED" }, "*": { CANCEL: "__CANCELLED" } },
      initialState: "__INIT",
      initialContext: { id: "" },
    });

    createMachine<Evt, {}, DomainCfg, { count: number }>({
      config: {
        IDLE: {
          // @ts-expect-error!
          SPAWN: "__RESOLVED",
        },
        BUSY: {},
      },
      initialState: "IDLE",
      initialContext: { count: 0 },
    });
  });

  test("actor effect deps содержат self и transition sugar", () => {
    type Deps = ActorDefaultDeps<"PENDING", ActorCfg, Evt>;
    type _Self = Assert<Equal<Deps["self"], Self>>;
    type _Meta = Assert<Equal<Self, ActorMeta>>;

    expect<Deps["transition"]>().type.toBe<ActorTransition<Evt>>();
    expect<Deps["action"]>().type.toBe<ManagerAction<Spawn>>();

    const effect = ({ self, transition, action }: Deps) => {
      expect(self.actorId).type.toBe<string>();
      expect(action.meta).type.toBe<ManagerAction<Spawn>["meta"]>();
      expect(transition({ type: "DONE", meta: { actorId: self.actorId } })).type.toBe<ManagerAction<Evt>>();
      expect(transition.unscoped({ type: "CANCEL" })).type.toBe<ManagerAction<Evt>>();
      expect(transition.actor(self.actorId, { type: "DONE" })).type.toBe<ManagerAction<Evt>>();
      expect(transition.group([self.groupId], { type: "DONE" })).type.toBe<ManagerAction<Evt>>();
      expect(transition.tag(self.groupTag, { type: "DONE" })).type.toBe<ManagerAction<Evt>>();

      const routed: ManagerAction<Done> = { type: "DONE", meta: { actorId: self.actorId } };
      // @ts-expect-error!
      transition.actor(self.actorId, routed);
      // @ts-expect-error!
      transition.actor(self.actorId, { type: "DONE", meta: { actorId: self.actorId } });
      // @ts-expect-error!
      transition.group(self.groupId, { type: "DONE", meta: { groupId: self.groupId } });
      // @ts-expect-error!
      transition.tag(self.groupTag, { type: "DONE", meta: { groupTag: self.groupTag } });
    };

    void effect;
  });

  test("actor template effects доступны только для public states и wildcard", () => {
    createMachine<Evt, {}, ActorCfg, { id: string }>({
      config: { __INIT: { SPAWN: "PENDING" }, PENDING: { DONE: "__RESOLVED" }, "*": { CANCEL: "__CANCELLED" } },
      initialState: "__INIT",
      initialContext: { id: "" },
      effects: {
        PENDING: () => {},
        "*": () => {},
        // @ts-expect-error!
        __INIT: () => {},
      },
    });

    createMachine<Evt, {}, ActorCfg, { id: string }>({
      config: { __INIT: { SPAWN: "PENDING" }, PENDING: { DONE: "__RESOLVED" }, "*": { CANCEL: "__CANCELLED" } },
      initialState: "__INIT",
      initialContext: { id: "" },
      effects: {
        // @ts-expect-error!
        __RESOLVED: () => {},
      },
    });
  });
});
