import { describe, expect, test } from "tstyche";
import { MachineManager } from "lite-fsm";
import type {
  MachineManagerRuntimeSnapshot,
  MachineManagerSnapshot,
  ManagerAction,
  SnapshotMachineKey,
  StateType,
} from "lite-fsm";
import { type FSMHydrationBoundaryProps, useHydrateSnapshot } from "lite-fsm/react";

import type {
  ActorPerfMachines,
  ActorRuntimeState,
  ActorSnapshotRecord,
  AppMachines,
  AppState,
  LargeConfig,
  MachineContext,
  MachineKey,
  PerfEvent,
  PerfState,
  PerfStep,
} from "./_performance-fixtures";
import { actorMachines, machines } from "./_performance-fixtures";

declare const snapshot: MachineManagerSnapshot<AppMachines>;
declare const actorSnapshot: MachineManagerSnapshot<ActorPerfMachines>;

describe("type performance snapshots для большой карты machines", () => {
  test("domain snapshot API раскрывает 1000 machines", () => {
    const manager = MachineManager<AppMachines, PerfEvent>(machines);
    const runtimeSnapshot = manager.getSnapshot();
    const fullDehydrated = manager.dehydrate();
    const partialDehydrated = manager.dehydrate({ machines: ["machine000", "machine999"] as const });
    const preview = manager.getHydratedState(snapshot);

    expect(runtimeSnapshot).type.toBe<MachineManagerRuntimeSnapshot<AppMachines>>();
    expect(runtimeSnapshot.machines.machine999.state).type.toBe<PerfState<"machine999", PerfStep>>();
    expect(fullDehydrated.machines.machine999).type.toBe<StateType<LargeConfig<"machine999">, MachineContext<"machine999">>>();
    expect(partialDehydrated.machines.machine000.context.id).type.toBe<"machine000">();
    expect(partialDehydrated.machines.machine999.context.revision).type.toBe<"machine999:revision">();
    expect(preview).type.toBe<AppState>();
    expect(preview.machine999.context.payload.owner).type.toBe<"machine999">();

    manager.hydrate(snapshot, { strategy: "merge" });
    useHydrateSnapshot<AppMachines>(snapshot, { strategy: "replace" });
    expect<FSMHydrationBoundaryProps<AppMachines>["snapshot"]>().type.toBe<MachineManagerSnapshot<AppMachines>>();
    expect<FSMHydrationBoundaryProps<AppMachines, PerfEvent>["transitionAfterHydrate"]>().type.toBe<
      ManagerAction<PerfEvent> | ReadonlyArray<ManagerAction<PerfEvent>> | undefined
    >();
  });

  test("actor snapshot API раскрывает 1000 actor templates", () => {
    const manager = MachineManager<ActorPerfMachines, PerfEvent>(actorMachines);
    const runtimeSnapshot = manager.getSnapshot();
    const dehydrated = manager.dehydrate({ machines: ["machine999"] as const });
    const preview = manager.getHydratedState(actorSnapshot);

    expect<SnapshotMachineKey<ActorPerfMachines>>().type.toBe<MachineKey>();
    expect<MachineManagerSnapshot<ActorPerfMachines>["machines"]["machine999"]>().type.toBe<
      ActorSnapshotRecord<"machine999"> | undefined
    >();
    expect(runtimeSnapshot.machines.machine999).type.toBe<ActorRuntimeState<"machine999">>();
    expect(dehydrated.machines.machine999["actor-999"].snapshot.savedAt).type.toBe<"machine999:saved">();
    expect(preview.machine000).type.toBe<ActorRuntimeState<"machine000">>();
    expect(preview.machine999["actor-999"].context.actorOwner).type.toBe<"machine999">();

    manager.hydrate(actorSnapshot);
  });
});
