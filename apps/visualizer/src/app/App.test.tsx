import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNoopCodegenPlanner } from "../codegen";
import { createLocalSimulationService, type EffectRunnerServices } from "../services";
import { resetStartupLoaderForTests } from "../startup/StartupLoader";
import { VISUALIZER_TEST_IDS } from "../test-ids";
import { createNoopValidationRegistry } from "../validation";
import { App } from "./App";

afterEach(() => {
  resetStartupLoaderForTests();
});

describe("приложение App", () => {
  it("монтирует provider, tooltip boundary и оболочку visualizer", () => {
    render(<App />);

    expect(screen.getByTestId(VISUALIZER_TEST_IDS.shell.root)).toBeTruthy();
  });

  it("пробрасывает custom services в WorkbenchProvider", async () => {
    const services: EffectRunnerServices = {
      compiler: {
        compile: vi.fn(async (input) => ({ ok: false as const, sourceVersion: input.source.version, diagnostics: [] })),
      },
      analyzer: {
        analyze: vi.fn(async (input) => ({ ok: true as const, sourceVersion: input.sourceVersion, diagnostics: [] })),
      },
      visualizerModel: {
        build: vi.fn(async (input) => ({ ok: false as const, sourceVersion: input.sourceVersion, diagnostics: [] })),
      },
      simulation: createLocalSimulationService(),
      validation: createNoopValidationRegistry(),
      codegen: createNoopCodegenPlanner(),
      sourceAccess: { fetch: vi.fn() },
    };

    render(<App services={services} />);
    fireEvent.click(screen.getByTestId(VISUALIZER_TEST_IDS.source.open));

    await waitFor(() => expect(services.compiler.compile).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId(VISUALIZER_TEST_IDS.source.status).getAttribute("title")).toBe("compile status: failed");
  });
});
