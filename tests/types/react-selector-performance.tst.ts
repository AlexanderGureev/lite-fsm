import { describe, expect, test } from "tstyche";
import { type TypedUseManagerHook, type TypedUseSelectorHook, useManager, useSelector } from "@lite-fsm/react";

import type { AppMachines, AppState, PerfEvent, PerfState, PerfStep } from "./_performance-fixtures";

describe("type performance React selectors для большой карты machines", () => {
  test("TypedUseSelectorHook раскрывает 1000 machines внутри selector", () => {
    const usePerfSelector: TypedUseSelectorHook<AppMachines> = useSelector;
    const selected = usePerfSelector(
      (state) => {
        expect(state).type.toBe<AppState>();
        expect(state.machine000.state).type.toBe<PerfState<"machine000", PerfStep>>();
        expect(state.machine333.context.payload.owner).type.toBe<"machine333">();
        expect(state.machine999.context.storageKey).type.toBe<"storage:machine999">();

        return {
          first: state.machine000.state,
          middleOwner: state.machine500.context.payload.owner,
          lastRevision: state.machine999.context.revision,
        };
      },
      (left, right) => {
        expect(left.first).type.toBe<PerfState<"machine000", PerfStep>>();
        expect(left.middleOwner).type.toBe<"machine500">();
        expect(right.lastRevision).type.toBe<"machine999:revision">();
        return left.first === right.first && left.lastRevision === right.lastRevision;
      },
    );

    expect(selected.first).type.toBe<PerfState<"machine000", PerfStep>>();
    expect(selected.middleOwner).type.toBe<"machine500">();
    expect(selected.lastRevision).type.toBe<"machine999:revision">();
  });

  test("typed useManager отдаёт manager с большим AppState", () => {
    const usePerfManager: TypedUseManagerHook<AppMachines, PerfEvent> = useManager;
    const manager = usePerfManager();
    const state = manager.getState();

    expect(state).type.toBe<AppState>();
    expect(state.machine250.context.id).type.toBe<"machine250">();
    expect(state.machine750.state).type.toBe<PerfState<"machine750", PerfStep>>();
  });
});
