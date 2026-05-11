import type { LiteFsmGraphDocument } from "@lite-fsm/graph";
import type { GraphVisualizerModel } from "@lite-fsm/graph/view-model";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { memo } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createNoopCodegenPlanner } from "../codegen";
import { createLocalSimulationService, type EffectRunnerServices } from "../services";
import { createWorkbenchStore } from "../workbench";
import { createNoopValidationRegistry } from "../validation";
import { useWorkbenchSelector } from "./use-workbench-selector";
import { useWorkbenchContext, WorkbenchProvider } from "./workbench-context";

const SelectedValueBase = ({ onRender }: { onRender: (value: string) => void }) => {
  const sourceHash = useWorkbenchSelector((snapshot) => snapshot.state.source.hash);
  onRender(sourceHash);

  return <span>{sourceHash}</span>;
};

const SelectedValue = memo(SelectedValueBase);

const documentFixture = { source: { filename: "sample.ts", language: "ts" }, diagnostics: [], machines: [], managers: [] } as unknown as LiteFsmGraphDocument;
const modelFixture = {
  version: "lite-fsm.visualizer/v1",
  machines: [{ machineId: "player" }],
  managers: [],
  topics: [],
  diagnostics: [],
  workbenchMachines: {},
} as unknown as GraphVisualizerModel;

const createServices = (): EffectRunnerServices => ({
  compiler: {
    compile: vi.fn(async (input) => ({
      ok: true as const,
      sourceVersion: input.source.version,
      document: documentFixture,
      diagnostics: [],
    })),
  },
  analyzer: {
    analyze: vi.fn(async (input) => ({
      ok: true as const,
      sourceVersion: input.sourceVersion,
      diagnostics: [],
    })),
  },
  visualizerModel: {
    build: vi.fn(async (input) => ({
      ok: true as const,
      sourceVersion: input.sourceVersion,
      model: modelFixture,
    })),
  },
  simulation: createLocalSimulationService(),
  validation: createNoopValidationRegistry(),
  codegen: createNoopCodegenPlanner(),
});

const PipelineButton = () => {
  const { dispatch } = useWorkbenchContext();
  const modelStatus = useWorkbenchSelector((snapshot) => snapshot.state.model.status);

  return (
    <button
      type="button"
      data-testid="pipeline-button"
      data-status={modelStatus}
      onClick={() => dispatch({ type: "source.open-visualizer" })}
    >
      {modelStatus}
    </button>
  );
};

const MissingProviderProbe = () => {
  useWorkbenchContext();

  return null;
};

describe("хук useWorkbenchSelector", () => {
  it("не выполняет rerender компонента при неизменном выбранном значении", () => {
    const store = createWorkbenchStore();
    const onRender = vi.fn();

    render(
      <WorkbenchProvider store={store}>
        <SelectedValue onRender={onRender} />
      </WorkbenchProvider>,
    );

    expect(onRender).toHaveBeenCalledTimes(1);

    store.dispatch({ type: "tab.selected", tab: "events" });

    expect(onRender).toHaveBeenCalledTimes(1);
  });

  it("читает server snapshot при SSR render", () => {
    const store = createWorkbenchStore();
    const onRender = vi.fn();

    renderToString(
      <WorkbenchProvider store={store}>
        <SelectedValue onRender={onRender} />
      </WorkbenchProvider>,
    );

    expect(onRender).toHaveBeenCalledTimes(1);
    expect(onRender).toHaveBeenCalledWith(store.getSnapshot().state.source.hash);
  });

  it("dispatch из provider запускает effect runner и обновляет subscribers", async () => {
    const store = createWorkbenchStore();
    const services = createServices();

    render(
      <WorkbenchProvider store={store} services={services}>
        <PipelineButton />
      </WorkbenchProvider>,
    );

    fireEvent.click(screen.getByTestId("pipeline-button"));

    await waitFor(() => expect(screen.getByTestId("pipeline-button").getAttribute("data-status")).toBe("ready"));
    expect(services.compiler.compile).toHaveBeenCalledTimes(1);
    expect(services.analyzer.analyze).toHaveBeenCalledTimes(1);
    expect(services.visualizerModel.build).toHaveBeenCalledTimes(1);
  });

  it("явно падает при использовании context hook без provider", () => {
    expect(() => render(<MissingProviderProbe />)).toThrow("WorkbenchProvider is missing.");
  });
});
