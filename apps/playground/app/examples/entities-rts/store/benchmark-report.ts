import type { AppStore } from ".";
import { cloneRtsMetricsSnapshot, type MetricsAdapter } from "./metrics";

export const captureRtsBenchmarkReport = (manager: AppStore, metrics: MetricsAdapter) => {
  const session = manager.getState().gameSession;

  if (session.state !== "BENCHMARK_COMPLETE" || session.context.report !== null) return;

  manager.transition({
    type: "BENCHMARK_REPORT_CAPTURED",
    payload: cloneRtsMetricsSnapshot(metrics.readSnapshot()),
  });
};
