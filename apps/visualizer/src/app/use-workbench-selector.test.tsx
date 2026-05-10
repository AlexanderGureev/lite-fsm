import type { LiteFsmGraphDocument } from "@lite-fsm/graph";
import type { GraphVisualizerModel } from "@lite-fsm/graph/view-model";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { memo } from "react";
import { describe, expect, it, vi } from "vitest";
import { createNoopCodegenPlanner } from "../codegen";
import type { EffectRunnerServices } from "../services";
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
  validation: createNoopValidationRegistry(),
  codegen: createNoopCodegenPlanner(),
});

const PipelineButton = () => {
  const { dispatch } = useWorkbenchContext();
  const modelStatus = useWorkbenchSelector((snapshot) => snapshot.state.model.status);

  return (
    <button type="button" onClick={() => dispatch({ type: "source.open-visualizer" })}>
      {modelStatus}
    </button>
  );
};

const MissingProviderProbe = () => {
  useWorkbenchContext();

  return null;
};

describe("useWorkbenchSelector", () => {
  it("не rerender-ит component при unchanged selected value", () => {
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

  it("dispatch из provider запускает effect runner и обновляет subscribers", async () => {
    const store = createWorkbenchStore();
    const services = createServices();

    render(
      <WorkbenchProvider store={store} services={services}>
        <PipelineButton />
      </WorkbenchProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "idle" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "ready" })).toBeTruthy());
    expect(services.compiler.compile).toHaveBeenCalledTimes(1);
    expect(services.analyzer.analyze).toHaveBeenCalledTimes(1);
    expect(services.visualizerModel.build).toHaveBeenCalledTimes(1);
  });

  it("явно падает при использовании context hook без provider", () => {
    expect(() => render(<MissingProviderProbe />)).toThrow("WorkbenchProvider is missing.");
  });
});
