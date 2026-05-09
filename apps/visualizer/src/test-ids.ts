export const VISUALIZER_TEST_IDS = {
  shell: {
    root: "visualizer-shell",
    topbar: "visualizer-topbar",
    workspace: "visualizer-workspace",
  },
  tabs: {
    root: "visualizer-tabs",
    trigger: {
      source: "visualizer-tab-source",
      system: "visualizer-tab-system",
      events: "visualizer-tab-events",
      machines: "visualizer-tab-machines",
    },
  },
  source: {
    panel: "visualizer-source-panel",
    search: "visualizer-source-search",
    reset: "visualizer-source-reset",
    editor: "visualizer-source-editor",
    snippet: "visualizer-source-snippet",
    open: "visualizer-source-open",
  },
  workbench: {
    panel: "visualizer-workbench-panel",
    eventSearch: "visualizer-workbench-event-search",
    eventSourceSelect: "visualizer-workbench-event-source-select",
    machineCard: "visualizer-workbench-machine-card",
    sourceAction: "visualizer-workbench-source-action",
    currentState: "visualizer-workbench-current-state",
    longLabel: "visualizer-workbench-long-label",
    row: {
      config: "visualizer-workbench-row-config",
      effect: "visualizer-workbench-row-effect",
      simulation: "visualizer-workbench-row-simulation",
    },
  },
  console: {
    toggle: "visualizer-console-toggle",
    panel: "visualizer-console-panel",
    close: "visualizer-console-close",
    entries: "visualizer-console-entries",
    analyzerAlert: "visualizer-console-analyzer-alert",
    simulatorAlert: "visualizer-console-simulator-alert",
    timeline: "visualizer-console-timeline",
    timelineSend: "visualizer-console-timeline-send",
    timelineStep: "visualizer-console-timeline-step",
  },
} as const;
