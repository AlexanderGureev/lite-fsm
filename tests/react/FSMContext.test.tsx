// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { FSMContext, FSMContextProvider } from "../../src/react";
import { MachineManager } from "../../src/core/MachineManager";

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
});
