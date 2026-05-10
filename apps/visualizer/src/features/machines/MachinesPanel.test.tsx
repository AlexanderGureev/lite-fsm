import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VISUALIZER_TEST_IDS } from "../../test-ids";
import { MachinesPanel } from "./MachinesPanel";

const ids = VISUALIZER_TEST_IDS;

describe("MachinesPanel", () => {
  it("рендерит L3 placeholder через отдельный feature boundary", () => {
    render(
      <MachinesPanel
        view={{
          title: "Machine workbench",
          body: "Open the source pipeline before using machine cards.",
          status: "idle",
        }}
        sourcePanel={{
          machineCount: 2,
          topicCount: 5,
          diagnosticCount: 1,
        }}
      />,
    );

    expect(screen.getByTestId(ids.workbench.panel)).toBeTruthy();
    expect(screen.getByTestId(ids.workbench.status).getAttribute("data-status")).toBe("idle");
    expect(screen.getByTestId(ids.workbench.notice).getAttribute("data-status")).toBe("idle");
    expect(screen.getByTestId(ids.workbench.metricMachines).getAttribute("data-value")).toBe("2");
    expect(screen.getByTestId(ids.workbench.metricTopics).getAttribute("data-value")).toBe("5");
    expect(screen.getByTestId(ids.workbench.metricDiagnostics).getAttribute("data-value")).toBe("1");
  });

  it("показывает diagnostic tone для blocked placeholder state", () => {
    const { rerender } = render(
      <MachinesPanel
        view={{
          title: "Machine workbench",
          body: "Simulation is blocked.",
          status: "blocked",
        }}
        sourcePanel={{
          machineCount: 0,
          topicCount: 0,
          diagnosticCount: 3,
        }}
      />,
    );

    expect(screen.getByTestId(ids.workbench.status).getAttribute("data-status")).toBe("blocked");
    expect(screen.getByTestId(ids.workbench.notice).getAttribute("data-status")).toBe("blocked");

    rerender(
      <MachinesPanel
        view={{
          title: "Machine workbench",
          body: "Model is ready.",
          status: "ready",
        }}
        sourcePanel={{
          machineCount: 1,
          topicCount: 2,
          diagnosticCount: 0,
        }}
      />,
    );

    expect(screen.getByTestId(ids.workbench.status).getAttribute("data-status")).toBe("ready");
    expect(screen.getByTestId(ids.workbench.notice).getAttribute("data-status")).toBe("ready");
  });
});
