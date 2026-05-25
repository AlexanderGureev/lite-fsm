import { describe, expect, test } from "tstyche";
import { MachineManager } from "@lite-fsm/core";
import type {
  DehydrateOptions,
  FSMEvent,
  MachineConfig,
  MachineManagerDehydratedSnapshot,
  MachineManagerRuntimeSnapshot,
  MachineManagerSnapshot,
  MachinesState,
} from "@lite-fsm/core";

import type { Assert, Equal } from "./_helpers";

type Event = FSMEvent<"INC">;
type Cfg = { IDLE: { INC: "IDLE" } };
type Ctx = { count: number };
type Store = {
  counter: MachineConfig<Cfg, Ctx, Event>;
};

const machines = {
  counter: {
    config: { IDLE: { INC: "IDLE" } },
    initialState: "IDLE",
    initialContext: { count: 0 },
  } satisfies MachineConfig<Cfg, Ctx, Event>,
};

describe("storage snapshot type surface", () => {
  test("MachineManagerSnapshot допускает top-level storage envelope", () => {
    const snapshot: MachineManagerSnapshot<Store> = {
      machines: {
        counter: { state: "IDLE", context: { count: 1 } },
      },
      storage: {
        custom: { revision: 1 },
      },
    };

    expect(snapshot.storage).type.toBe<Record<string, unknown> | undefined>();
    expect(snapshot.machines.counter).type.toBe<{ state: "IDLE"; context: Ctx } | undefined>();
  });

  test("dehydrate принимает storage filter независимо от machines", () => {
    const manager = MachineManager<Store, Event>(machines);

    expect(manager.dehydrate({ storage: ["custom"] }).storage).type.toBe<Record<string, unknown> | undefined>();
    expect(manager.dehydrate({ machines: ["counter"], storage: [] }).machines.counter).type.toBe<{
      state: "IDLE";
      context: Ctx;
    }>();
    expect(manager.dehydrate({ storage: [] })).type.toBe<MachineManagerDehydratedSnapshot<Store>>();

    const options: DehydrateOptions<typeof machines> = { storage: ["custom"] };
    expect(options.storage).type.toBe<readonly string[] | undefined>();
  });

  test("getSnapshot runtime envelope не получает storage field", () => {
    const manager = MachineManager(machines);
    const runtimeSnapshot = manager.getSnapshot();

    expect(runtimeSnapshot).type.toBe<MachineManagerRuntimeSnapshot<typeof machines>>();
    // @ts-expect-error!
    runtimeSnapshot.storage;
  });

  test("hydrate и getHydratedState принимают storage envelope без изменения root state type", () => {
    const manager = MachineManager(machines);
    const snapshot: MachineManagerSnapshot<typeof machines> = {
      machines: {},
      storage: {
        custom: { revision: 1 },
      },
    };

    expect(manager.getHydratedState(snapshot)).type.toBe<MachinesState<typeof machines>>();
    expect(manager.hydrate(snapshot)).type.toBe<void>();
  });

  test("public snapshot aliases сохраняют storage contract", () => {
    type _SnapshotStorage = Assert<Equal<MachineManagerSnapshot<Store>["storage"], Record<string, unknown> | undefined>>;
    type _DehydratedStorage = Assert<
      Equal<MachineManagerDehydratedSnapshot<Store>["storage"], Record<string, unknown> | undefined>
    >;
    type _DehydrateStorage = Assert<Equal<DehydrateOptions<Store>["storage"], readonly string[] | undefined>>;
  });
});
