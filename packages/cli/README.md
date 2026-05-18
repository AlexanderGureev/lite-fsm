# @lite-fsm/cli

Alpha command line tools for `lite-fsm`. The `lite-fsm` binary can export a project graph JSON document and run a local Visualizer session for a TypeScript project.

The CLI uses `@lite-fsm/graph` for static analysis. It does not run your app, call reducers, execute effects, or evaluate user code.

## Install

```bash
npm install --save-dev @lite-fsm/cli
```

After installation, the `lite-fsm` command is available.

## Commands

| Command        | Purpose                                                                |
| -------------- | ---------------------------------------------------------------------- |
| `export-graph` | Build a project graph and write a JSON export document.                |
| `visualize`    | Build a project graph and launch the bundled local Visualizer session. |

## Export a Graph

```bash
lite-fsm export-graph --entry store/index.ts --out lite-fsm.graph.json --tsconfig tsconfig.json
```

Minimal source shape:

```ts
// store/index.ts
import { MachineManager, createMachine } from "@lite-fsm/core";

export const lamp = createMachine({
  config: {
    OFF: { SWITCH: "ON" },
    ON: { SWITCH: "OFF" },
  },
  initialState: "OFF",
  initialContext: {},
});

export const manager = MachineManager({ lamp });
```

The export document includes the graph, project files, source hashes, CLI diagnostics, and optional source text when `--include-source` is passed.

## Run the Visualizer

```bash
lite-fsm visualize --entry store/index.ts
```

By default, `visualize` starts a local server on `127.0.0.1:3030`, opens a browser, and keeps the process running until interrupted.

Useful options:

```bash
lite-fsm visualize --entry store/index.ts --tsconfig tsconfig.json --port 3031 --no-open
```

## Options

`export-graph`:

- `--entry <path>` - required TypeScript entry file where the selected `MachineManager(...)` is visible.
- `--out <path>` - required output JSON path.
- `--tsconfig <path>` - optional explicit TypeScript config.
- `--include-source` - embed discovered source file text in the JSON document.

`visualize`:

- `--entry <path>` - required TypeScript entry file.
- `--tsconfig <path>` - optional explicit TypeScript config.
- `--port <number>` - local Visualizer port, defaults to `3030`.
- `--no-open` - print the session URL without opening a browser.

## Documentation

- [Full documentation](https://alexandergureev.github.io/lite-fsm/)
- [CLI package guide](https://alexandergureev.github.io/lite-fsm/packages/cli)
- [CLI API reference](https://alexandergureev.github.io/lite-fsm/api/cli)
