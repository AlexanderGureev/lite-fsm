# @lite-fsm/graph

Alpha graph tooling for `lite-fsm`. The package statically reads TypeScript source, finds `createMachine` and `MachineManager` usage, and builds a graph document with machines, states, transitions, reducer branches, effects, managers, source anchors, and diagnostics.

It does not run your app, call reducers, execute effects, or evaluate user code.

## Install

```bash
npm install --save-dev @lite-fsm/graph
```

## Entry Points

```ts
import {
  analyzeLiteFsmGraph,
  compileLiteFsmGraph,
  compileLiteFsmGraphProject,
  selectMachineGraph,
} from "@lite-fsm/graph";

import { createGraphSimulator } from "@lite-fsm/graph/simulator";
import { buildGraphVisualizerModel } from "@lite-fsm/graph/view-model";
```

## Quick Example

```ts
import { analyzeLiteFsmGraph, compileLiteFsmGraph } from "@lite-fsm/graph";
import { createGraphSimulator } from "@lite-fsm/graph/simulator";

const source = `
  import { createMachine } from "@lite-fsm/core";

  export const toggle = createMachine({
    config: {
      OFF: { TOGGLE: "ON" },
      ON: { TOGGLE: "OFF" },
    },
    initialState: "OFF",
    initialContext: {},
  });
`;

const result = compileLiteFsmGraph(source, {
  filename: "toggle.ts",
});

const analysis = analyzeLiteFsmGraph(result.document, {
  rules: ["unknown-target", "unreachable-state"],
});

const simulator = createGraphSimulator(result.document);
const started = simulator.start();

if (started.ok) {
  const step = simulator.send({ event: { type: "TOGGLE" } });
  console.log(step.ok ? step.snapshot.slices : step.reason);
}

console.log(result.document.machines);
console.log(analysis.diagnostics);
```

## Main APIs

- `compileLiteFsmGraph(source, options)` - compile one source string into a `LiteFsmGraphDocument`.
- `compileLiteFsmGraphProject(options)` - compile a project entry file through a caller-provided host.
- `analyzeLiteFsmGraph(document, options)` - run graph analysis rules.
- `selectMachineGraph(document, selector)` - select one machine from a graph document.
- `@lite-fsm/graph/simulator` - simulate events over a graph document.
- `@lite-fsm/graph/view-model` - build data structures for visualization UIs.

## Documentation

- [Full documentation](https://alexandergureev.github.io/lite-fsm/)
- [Graph package guide](https://alexandergureev.github.io/lite-fsm/packages/graph)
- [Graph API reference](https://alexandergureev.github.io/lite-fsm/api/graph)
