// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { FSMContext, FSMContextProvider } from "@lite-fsm/react";
import { MachineManager } from "@lite-fsm/core";

describe("FSMContext / FSMContextProvider", () => {
  it("без Provider контекст равен null", () => {
    let captured: React.ContextType<typeof FSMContext> = null;
    const Consumer = () => {
      const ctx = React.useContext(FSMContext);
      captured = ctx;
      return null;
    };

    render(<Consumer />);

    expect(captured).toBeNull();
  });

  it("Provider прокидывает переданный machineManager вниз по дереву", () => {
    const manager = MachineManager({
      m: {
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: {},
      },
    });

    let got: React.ContextType<typeof FSMContext> = null;
    const Consumer = () => {
      got = React.useContext(FSMContext);
      return null;
    };

    render(
      <FSMContextProvider machineManager={manager}>
        <Consumer />
      </FSMContextProvider>,
    );

    expect(got).toBe(manager);
  });

  it("Provider сохраняет ту же ссылку значения контекста при rerender с тем же machineManager", () => {
    const manager = MachineManager({
      m: {
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: {},
      },
    });
    const seen: Array<React.ContextType<typeof FSMContext>> = [];

    const Consumer = () => {
      seen.push(React.useContext(FSMContext));
      return null;
    };

    const { rerender } = render(
      <FSMContextProvider machineManager={manager}>
        <Consumer />
      </FSMContextProvider>,
    );

    rerender(
      <FSMContextProvider machineManager={manager}>
        <Consumer />
      </FSMContextProvider>,
    );

    expect(seen).toEqual([manager, manager]);
    expect(seen[0]).toBe(seen[1]);
  });
});
