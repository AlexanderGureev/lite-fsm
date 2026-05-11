import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { createDefaultEffectRunnerServices, type EffectRunnerServices } from "./services";
import "./styles.css";

const root = document.getElementById("root");

if (!root) throw new Error("Visualizer root element is missing.");

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const createE2eDelayedServices = (delayMs: number): EffectRunnerServices => {
  const services = createDefaultEffectRunnerServices();

  return {
    ...services,
    compiler: {
      compile: async (input) => {
        await delay(delayMs);
        return services.compiler.compile(input);
      },
    },
  };
};

const e2ePipelineDelayMs = Number(new URLSearchParams(window.location.search).get("visualizerPipelineDelayMs") ?? 0);
const services = e2ePipelineDelayMs > 0 ? createE2eDelayedServices(e2ePipelineDelayMs) : undefined;

createRoot(root).render(
  <StrictMode>
    <App services={services} />
  </StrictMode>,
);
