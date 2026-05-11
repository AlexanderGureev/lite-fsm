# Machine Canvas Board: MVP ТЗ

## 1. Назначение

MVP добавляет сценарий:

```txt
L3 Machines -> machine card -> graph action -> Machine Canvas Board
```

Machine Canvas Board показывает одну скомпилированную machine как read-only
state graph. Визуальная основа MVP: React Flow, ELK layout и baseline
`machine-graph-rf.html`.

Board в MVP показывает:

- state nodes;
- grouped transition edges;
- wildcard state node `*`;
- wildcard effect node `*`;
- self loops;
- terminal, spawn, initial и current states;
- config/reducer transitions;
- effect-driven local lifecycle edges;
- emission-only effects как source-node chips/counters без state-to-state edge;
- producer category: `external`, `self-emitted`, `from-other`;
- grouped route labels с `+N`;
- hover popover по edge label.

L3 cards остаются владельцем dispatch, timeline и simulator session. Canvas не
dispatch-ит FSM events и остается полезным без simulator session.

## 2. Общие требования

### 2.1 Архитектура

- `packages/graph` владеет semantic Machine Flow Model.
- `packages/graph` не импортирует React, React Flow, ELK, DOM, canvas или
  модули `apps/visualizer`.
- `apps/visualizer` владеет board state, selector glue, commands, layout,
  React Flow renderer и visual styles.
- `apps/visualizer` не восстанавливает FSM-semantics из карточек, source text,
  React Flow nodes, ELK output или DOM order.
- Visualizer вызывает `buildMachineFlowModel({ model, machineId })` поверх
  `GraphVisualizerModel`.
- Machine Flow Model является projection над `GraphVisualizerModel`, а не
  вторым compiler/analyzer.
- Источники истины для `buildMachineFlowModel`: `model.workbenchMachines`,
  `model.machines`, `model.topics`, `model.relations`, `model.diagnostics`,
  `model.rowMappings` и source anchors внутри этих структур.
- `buildMachineFlowModel` не читает `LiteFsmGraphDocument`, source text, AST,
  React components, L3 cards или DOM.
- `buildMachineFlowModel` не запускает compiler/analyzer и не пересоздает
  reducer folding, target normalization, source anchors или diagnostics.
- Renderer node ids, edge ids, coordinates, viewport, DOM measurements и hover
  state не хранятся в workbench state.
- Graph item state хранит semantic ids: `stateId`, `rowId`,
  `edgeGroup.groupId`.

### 2.2 Product behavior

- Source edit, compile reset/failure, model failure и missing machine закрывают
  board или переводят его в controlled empty state.
- Stale internal responses не открывают старый board повторно.
- Current state подсвечивается только из
  `GraphVisualizerModel` / `GraphMachineWorkbenchModel.currentStateId` /
  `GraphWorkbenchStateBlock.current`.
- `initialState` не используется как fallback current state.
- MVP обрабатывает compiler surface, exposed через `GraphVisualizerModel`:
  config transitions, reducer rows, effect emissions, wildcard state, wildcard
  effect, actor templates, routing metadata, terminal/init states,
  self/null targets, dynamic/blocked/unknown targets.

### 2.3 Public API и справочники

- `buildMachineFlowModel` экспортируется только из
  `@lite-fsm/graph/view-model`.
- Root import `@lite-fsm/graph` не получает новый export.
- При добавлении public API обновить:
  - `tests/types/graph-view-model-api.tst.ts`;
  - `API-CHEATSHEET.md`;
  - `TYPES-CHEATSHEET.md`.

### 2.4 Тестирование

- Runtime behavior покрывается Vitest.
- Public types покрываются Tstyche.
- Названия `describe`, `it`, `test` пишутся на русском.
- Pure graph logic и pure renderer logic покрываются 100% по
  statements/branches/functions/lines.
- Для `packages/graph` добавить package-local Vitest config/script или
  documented scoped root command для `machine-flow*` source files.
- `packages/graph` coverage для `machine-flow*` source files: 100% по
  statements/branches/functions/lines.
- Visualizer pure renderer modules покрываются через
  `@lite-fsm/visualizer test:coverage` с strict thresholds.
- Component/E2E tests покрывают основной путь: открыть board, увидеть
  nodes/edges, закрыть board.

### 2.5 Команды

Запрещено запускать:

```txt
pnpm run build
pnpm --filter @lite-fsm/docs build
pnpm run docs:build
pnpm run pages:build
pnpm run pages:build*
pnpm run verify:release
next build внутри apps/docs
```

Разрешенные проверки для MVP:

```txt
pnpm --filter @lite-fsm/graph check-types
pnpm --filter @lite-fsm/graph test:unit
pnpm --filter @lite-fsm/graph test:coverage
pnpm --filter @lite-fsm/visualizer check-types
pnpm --filter @lite-fsm/visualizer test:unit
pnpm --filter @lite-fsm/visualizer test:coverage
pnpm --filter @lite-fsm/visualizer test:e2e
pnpm run test:types
pnpm run check-types
pnpm run build:packages
```

## 3. Этап 1. Machine Flow Model

Домен: semantic graph view-model в `packages/graph`.

Цель: добавить renderer-agnostic Machine Flow Model для MVP board.

Целевые файлы:

```txt
packages/graph/src/view-model/machine-flow.ts
packages/graph/src/view-model/machine-flow-types.ts
packages/graph/src/view-model/machine-flow-ids.ts
packages/graph/src/view-model/index.ts
packages/graph/src/view-model/types.ts
tests/graph/*
tests/types/graph-view-model-api.tst.ts
API-CHEATSHEET.md
TYPES-CHEATSHEET.md
packages/graph/package.json
packages/graph/vitest.config.ts
```

### 3.1 Builder pipeline

Machine Flow Model строится как projection:

```txt
GraphVisualizerModel
-> selected GraphMachineWorkbenchModel
-> GraphWorkbenchRow[] / topics / relations / summaries
-> MachineFlowNode[] + MachineFlowEdgeGroup[]
```

Pipeline:

```txt
validate input
-> create build context/indexes
-> build node drafts
-> collect accepted transition candidates
-> collect effect emission candidates
-> pair local self-emitted lifecycle edges
-> classify producer category and edge kind
-> resolve targets
-> group edge drafts
-> attach source anchors and diagnostics refs
-> calculate node stats and legend
-> sort final output
```

Обязательные владельцы логики:

- `FlowBuildContext`;
- node drafts;
- accepted transition candidates;
- effect emission candidates;
- edge drafts;
- edge group key;
- producer classifier;
- target resolver;
- legend builder.

Расширяемые правила держать в отдельных функциях или registry-like таблицах:

- target resolvers: `state`, `self`, `terminal`, `dynamic`, `blocked`,
  `unknown`;
- producer classifiers: `external`, `self-emitted`, `from-other`;
- node role rules: `normal`, `initial`, `current`, `terminal`, `spawn`,
  `wildcard`, `effect-source`, `synthetic`;
- edge grouping key rules;
- row/source attachment rules.

`GraphWorkbenchRow` handling:

- `config` и `reducer` создают accepted transition candidates;
- `effect` создает producer/emission candidates;
- `diagnostic` прикрепляется к counters/diagnostics и не создает edge;
- `unknown` прикрепляется к row refs/counters и не создает edge.

Запрещено:

- искать transitions/effects в raw graph document;
- парсить source text;
- вычислять source anchors заново;
- повторять reducer folding;
- нормализовать targets заново при наличии нужной формы в `GraphTargetView`;
- использовать L3 card view как источник semantics.

### 3.2 Public contract

Экспортировать из `@lite-fsm/graph/view-model`:

- `BuildMachineFlowModelInput`;
- `MachineFlowModel`;
- `MachineFlowMachine`;
- `MachineFlowNode`;
- `MachineFlowEdgeGroup`;
- `MachineFlowRowRef`;
- `MachineFlowBadge`;
- `MachineFlowLegend`;
- `MachineFlowEdgeKind`;
- `buildMachineFlowModel`.

Обязательный контракт:

```ts
type BuildMachineFlowModelInput = {
  model: GraphVisualizerModel;
  machineId: string;
};

type MachineFlowModel =
  | { status: "missing-machine"; machineId: string }
  | {
      status: "ready";
      machine: MachineFlowMachine;
      nodes: readonly MachineFlowNode[];
      edgeGroups: readonly MachineFlowEdgeGroup[];
      legend: MachineFlowLegend;
    };

type MachineFlowMachine = {
  machineId: string;
  title: string;
  kind: "domain" | "actorTemplate" | "unknown";
  groupTag?: string;
  initialState?: string;
  currentStateKey?: string;
  sourceAnchors: readonly GraphSourceAnchor[];
  badges: readonly MachineFlowBadge[];
  counters: {
    states: number;
    transitions: number;
    reducerBranches: number;
    emissions: number;
    diagnostics: number;
  };
};

type MachineFlowNode = {
  nodeId: string;
  ref:
    | { kind: "state"; stateId: string }
    | { kind: "wildcard-state" }
    | { kind: "wildcard-effect" }
    | {
        kind: "synthetic-target";
        targetKind: "dynamic" | "blocked" | "unknown";
      };
  label: string;
  role:
    | "normal"
    | "initial"
    | "current"
    | "terminal"
    | "spawn"
    | "wildcard"
    | "effect-source"
    | "synthetic";
  badges: readonly MachineFlowBadge[];
  sourceAnchors: readonly GraphSourceAnchor[];
  diagnosticIds: readonly string[];
  stats: {
    incoming: number;
    outgoing: number;
    selfLoops: number;
    emissions: number;
  };
};

type MachineFlowEdgeKind =
  | "accepted-transition"
  | "self-emitted-transition"
  | "from-other-transition"
  | "emission-only";

type MachineFlowEdgeGroup = {
  groupId: string;
  sourceNodeId: string;
  targetNodeId?: string;
  direction: "normal" | "self";
  kind: MachineFlowEdgeKind;
  layer: "config" | "reducer" | "effect" | "mixed";
  producerCategory: "external" | "self-emitted" | "from-other";
  label: string;
  count: number;
  rows: readonly MachineFlowRowRef[];
  sourceAnchors: readonly GraphSourceAnchor[];
  diagnostics: readonly string[];
};

type MachineFlowRowRef =
  | {
      rowId: string;
      rowKind: "config" | "reducer" | "effect";
      eventType: string;
      targetLabel: string;
      guardLabel?: string;
      routingLabel?: string;
      confidence?: "exact" | "partial" | "unknown";
      sourceAnchors: readonly GraphSourceAnchor[];
    }
  | {
      rowId: string;
      rowKind: "diagnostic";
      label: string;
      severity: "error" | "warning" | "info";
      sourceAnchors: readonly GraphSourceAnchor[];
    }
  | {
      rowId: string;
      rowKind: "unknown";
      label: string;
      reason: string;
      confidence: "partial" | "unknown";
      sourceAnchors: readonly GraphSourceAnchor[];
    };

type MachineFlowBadge = {
  kind:
    | "initial"
    | "current"
    | "terminal"
    | "spawn"
    | "wildcard"
    | "effect-source"
    | "group-tag"
    | "persistence"
    | "context-scoped"
    | "diagnostic"
    | "unknown";
  label: string;
  tone?: "neutral" | "config" | "effect" | "routing" | "warning" | "danger";
};

type MachineFlowLegend = {
  edgeKinds: ReadonlyArray<{
    kind: MachineFlowEdgeKind;
    label: string;
    description: string;
  }>;
  badges: readonly MachineFlowBadge[];
};
```

Contract requirements:

- Optional fields заполняются только данными из `GraphVisualizerModel`.
- `MachineFlowRowRef` остается discriminated union.
- Diagnostic/unknown rows не получают fake `eventType` или fake target.
- Machine Flow Model не хранит renderer stroke/style/marker hints.
- Renderer мапит `edge.kind`, `producerCategory` и `layer` через local render
  policy.

### 3.3 Semantic ids

- State node id строится из `machineId` и `stateId`.
- Wildcard state node id строится из `machineId` и wildcard state marker.
- Wildcard effect node id строится из `machineId` и wildcard effect marker.
- Edge group id строится из `machineId`, source node, target node или
  `target:none`, edge kind, producer category, direction и grouped row ids.
- Semantic ids детерминированы до layout.
- React Flow ids не появляются в Machine Flow Model.

### 3.4 Machine summary и nodes

- Сохранить machine id, title, kind, groupTag, source anchors.
- Сохранить initial state.
- Сохранить current state только из model/workbench projection.
- Посчитать states, transitions, reducer branches, emissions, diagnostics.
- Построить node для каждого `workbench.states` entry.
- Labels используют canonical state keys.
- Initial определяется из `workbench.initialState` и badges.
- Current определяется из `workbench.currentStateId` или state `current`.
- `__INIT` рендерится как spawn/init node.
- `__RESOLVED`, `__REJECTED`, `__CANCELLED` и `state.kind === "terminal"`
  рендерятся как terminal nodes.
- Referenced target-only states остаются видимыми при наличии в workbench.
- Detached/isolated states остаются видимыми.
- Node stats включают incoming, outgoing, self loops и emissions.
- `MachineFlowNode.role` задает primary visual role; дополнительные факты
  сохраняются в `badges`.
- Приоритет ролей: `current` -> `spawn` -> `terminal` -> `initial` ->
  `effect-source` -> `wildcard` -> `synthetic` -> `normal`.

### 3.5 Accepted transitions и target resolver

- Config rows создают accepted transition candidates.
- Reducer rows создают accepted transition candidates, кроме folded rows.
- Candidate source: concrete source state или wildcard state node.
- State targets мапятся на state nodes.
- `self` и `null` targets становятся self loops.
- Handled event без state change видим как self loop.
- Dynamic, blocked и unknown targets создают compact synthetic target node с
  deterministic id и сохраняют row ref.

Target resolver:

| `GraphTargetView.kind` | Результат |
| --- | --- |
| `state` | Edge target: existing state node по `target.stateId`; missing state -> synthetic `unknown` target |
| `self` / `null` | Self loop на source node |
| `terminal` | Terminal state node; missing terminal -> synthetic `unknown` target |
| `dynamic` | Synthetic target node с `targetKind: "dynamic"` |
| `blocked` | Synthetic target node с `targetKind: "blocked"` |
| `unknown` | Synthetic target node с `targetKind: "unknown"` |

### 3.6 Wildcard state и wildcard effect

Wildcard state:

- `state.kind === "wildcard"` или `state.stateKey === "*"` становится одним
  wildcard state node.
- Label: `*`.
- Badge/subtitle: `any state`.
- Node является source для wildcard config/reducer accepted transitions.
- Node не раскрывается в edge на каждое real state.
- Node отдельный от wildcard effect node.

Wildcard effect:

- Effect row из `*` или graph wildcard effect key становится одним wildcard
  effect node.
- Label: `*`.
- Role: `effect-source`.
- Badge/subtitle: `any effect` или `effect source`.
- Node является producer node.
- Node не раскрывается fan-out из каждого real state.
- Node отдельный от wildcard state node.

### 3.7 Effect emissions и producer category

- Consumed events классифицируются через `model.topics` и `model.relations`.
- Edge kind выбирается в порядке:
  1. Same-machine effect producer + local consumer -> `self-emitted-transition`
     и `producerCategory: "self-emitted"`.
  2. Producers только из других machines -> `from-other-transition` и
     `producerCategory: "from-other"`.
  3. Остальные accepted rows -> `accepted-transition`.
- `accepted-transition` использует `producerCategory: "external"` для
  no/unknown/external producer и `"self-emitted"` для same-machine producer без
  local lifecycle pairing.
- Pairing self-emitted lifecycle edges выполняется по `eventType` и source
  locality: same concrete source state consumer, затем wildcard accepted
  transition того же event.
- Accepted transition из другого concrete source state не является local
  lifecycle continuation.
- Accepted row, использованный в `self-emitted-transition`, не создает
  duplicate `accepted-transition`.
- Self-emitted edge строится от effect source node к accepted target.
- Wildcard effect с local consumer создает lifecycle edge от wildcard effect
  node к accepted target.
- Consumer через wildcard config/reducer сохраняет `via *` / `via any state` в
  row labels.
- Effect emission без local consumer создает `MachineFlowEdgeGroup` с
  `kind: "emission-only"` и без `targetNodeId`.
- Emission-only group в MVP renderer показывается только как source-node
  chip/counter.
- Multiple emitted events группируются по target и edge kind.

### 3.8 Edge grouping, labels и sorting

- Collapse rows/events только при одинаковом
  `sourceNodeId + targetNodeId + edgeKind + producerCategory + direction`.
- Events из разных source states не collapse-ятся только по общему target.
- Сохранять все original row refs.
- Label показывает first display event.
- Additional display entries рендерятся как `+N`.
- 6 grouped display entries рендерятся как `FIRST_EVENT +5`.
- Mixed config/reducer/effect groups получают `layer: "mixed"`.
- Self transitions и handled `null` targets имеют `direction: "self"`.
- State nodes следуют workbench order.
- Wildcard state node идет перед synthetic targets.
- Edge groups сортируются по source label, target label, edge kind, producer
  category и first event type.
- Grouped row refs сохраняют workbench row order.

### 3.9 Тесты этапа 1

- Missing machine.
- Initial/current/terminal/spawn nodes.
- Actor template kind и groupTag.
- Wildcard state node.
- Wildcard effect node.
- Wildcard effect accepted via wildcard config.
- Config transitions.
- Reducer rows и folded reducer ids.
- Self transitions.
- Same-state self-emitted lifecycle edges.
- Self-emitted emission не pair-ится с accepted transition из другого concrete
  source state.
- Wildcard accepted transition как fallback consumer.
- Emission-only effects как edge group без `targetNodeId`.
- Producer categories: `external`, `self-emitted`, `from-other`.
- Dynamic, blocked и unknown targets сохраняют row refs.
- Routing metadata сохраняется для effect rows.
- Diagnostic/unknown rows не создают transition edges.
- Diagnostic/unknown row refs не получают fake `eventType`.
- Role precedence.
- Grouped labels и `+N`.
- Deterministic sorting и stable ids.
- `machine-flow*` coverage: 100% statements/branches/functions/lines.
- Type API tests для нового view-model export.

Готовность этапа:

- `buildMachineFlowModel` реализован и exported из view-model entrypoint.
- Model pure и renderer-agnostic.
- MVP semantic cases покрыты tests.
- Pipeline содержит extension points для Post-MVP.

## 4. Этап 2. Canvas state и selectors

Домен: app state, commands, reducer behavior и selector projection.

Цель: открыть/закрыть board и получить Machine Flow Model без renderer state в
workbench.

Целевые файлы:

```txt
apps/visualizer/src/canvas/types.ts
apps/visualizer/src/canvas/noop-adapter.ts
apps/visualizer/src/canvas/index.ts
apps/visualizer/src/canvas/machine-canvas-selectors.ts
apps/visualizer/src/workbench/types.ts
apps/visualizer/src/workbench/reducer.ts
apps/visualizer/src/workbench/state.ts
apps/visualizer/src/workbench/*
```

### 4.1 State и commands

Нужные функции:

- `openMachineBoard`;
- `closeMachineBoard`;
- `clearCanvasOnPipelineInvalidation`;
- `selectMachineCanvasBoard`;
- `mapMachineFlowToBoardView`.

State:

```ts
type MachineCanvasBoardState = {
  sourceVersion: number;
  machineId: string;
};
```

Requirements:

- Расширить `CanvasAdapter` вариантом `{ kind: "machine-canvas" }`.
- Расширить `CanvasState` optional-полем `machineBoard`.
- На open хранить current `sourceVersion` и `machineId`.
- Не хранить viewport, hover item, React Flow ids, coordinates, edge paths,
  measured sizes или layout output.
- Добавить `canvas.machine-board.opened`.
- Добавить `canvas.machine-board.closed`.
- Расширить `VisualizerCommandResult["reason"]` значением
  `"missing-machine"`.
- Opening при missing model возвращает controlled failure `missing-model` и не
  мутирует `CanvasState`.
- Opening при missing machine возвращает controlled failure `"missing-machine"`
  и не мутирует `CanvasState`.
- Successful open переключает adapter и сохраняет source version.
- Close очищает только board state.
- Close не меняет L3 selection и simulator session.

### 4.2 Invalidation

- `source.changed` очищает board.
- `source.open-visualizer` очищает board.
- Compile reset/failure очищает board.
- Model failure очищает board.
- Если latest model не содержит opened `machineId`, selector возвращает
  controlled `missing-machine`.
- Stale async responses не открывают board повторно.
- Unrelated commands сохраняют ссылку canvas state при отсутствии изменений.

### 4.3 Selector contract

Selector не интерпретирует graph semantics: он вызывает
`buildMachineFlowModel`, добавляет app-local status/sourceVersion и возвращает
view state.

```ts
type MachineCanvasBoardView =
  | { status: "not-opened"; reason: "not-opened" }
  | {
      status: "missing-model";
      reason: "missing-model";
      board: MachineCanvasBoardState;
    }
  | {
      status: "missing-machine";
      sourceVersion: number;
      machineId: string;
    }
  | {
      status: "ready";
      sourceVersion: number;
      machineId: string;
      flow: Extract<MachineFlowModel, { status: "ready" }>;
    };
```

Requirements:

- `not-opened` возвращается, если board не открыт.
- `missing-model` возвращается, если model отсутствует.
- `ready` и `missing-machine` пробрасываются из Machine Flow Model.
- Selector добавляет source version.
- Selector не перестраивает edge groups.
- Selector не использует `MachineCardView.currentStateKey` как current state.
- Lazy renderer loading, layout-in-progress и layout failure остаются
  component-local controlled states.

### 4.4 Тесты этапа 2

- Reducer: open сохраняет source version и machine id.
- Reducer: missing model не мутирует state.
- Reducer: missing machine не мутирует state.
- Reducer: close очищает только board.
- Reducer: source edit очищает board.
- Reducer: compile/open visualizer очищает board.
- Reducer: stale internal responses не открывают board повторно.
- Reducer: unrelated commands сохраняют ссылку canvas state.
- Selector: `not-opened`.
- Selector: `missing-model`.
- Selector: passthrough для `missing-machine`.
- Selector: passthrough для ready model.
- Selector: absence of current state не заменяется initial state.

Готовность этапа:

- Board открывается и закрывается на уровне state/selector.
- Invalidation rules покрыты.
- Renderer concerns не попали в app state.

## 5. Этап 3. L3 board shell

Домен: React integration и board shell.

Цель: открыть board из L3 и показать controlled shell states.

Целевые файлы:

```txt
apps/visualizer/src/features/machines/MachinesPanel.tsx
apps/visualizer/src/features/machines/MachineCanvasBoard.tsx
apps/visualizer/src/test-ids.ts
apps/visualizer/src/features/machines/*.test.tsx
```

### 5.1 Machine card action

- Добавить graph icon button рядом с source button.
- Использовать lucide `Network` или existing подходящий icon.
- Tooltip: `Open graph`.
- Dispatch: `canvas.machine-board.opened`.
- Card body остается row-clickable для simulation.
- Source и graph buttons доступны с клавиатуры.

### 5.2 Test ids

Добавить stable ids в стиле `VISUALIZER_TEST_IDS`:

```ts
canvas: {
  board: "visualizer-machine-canvas-board",
  close: "visualizer-machine-canvas-close",
  graph: "visualizer-machine-canvas-graph",
  stateNode: "visualizer-machine-canvas-state-node",
  edgeLabel: "visualizer-machine-canvas-edge-label",
  legend: "visualizer-machine-canvas-legend",
  openAction: "visualizer-workbench-graph-action",
}
```

### 5.3 Board shell

- Board открывается как full-workspace overlay поверх Machines tab на всех
  ширинах.
- На узких ширинах overlay занимает весь workspace и сохраняет visible close
  action.
- Header показывает machine title.
- Header показывает kind и group tag.
- Header показывает current state из `MachineFlowMachine.currentStateKey` или
  `simulation idle`.
- Header и node highlight не используют `MachineCardView.currentStateKey`.
- Header показывает counters для states/transitions/emissions.
- Header содержит close button.
- Body содержит graph area.
- Body содержит compact legend area.
- Body содержит React Flow controls area.
- Layout имеет graph area contract и extension slots для будущих panels.

### 5.4 Закрытие и controlled states

- Close button dispatch-ит `canvas.machine-board.closed`.
- Escape закрывает board.
- Source/model invalidation обрабатывается правилами этапа 2.
- Close не сбрасывает L3 machine selection.
- Close не сбрасывает simulator session.
- `not-opened` не рендерит board.
- `missing-model` рендерит controlled empty/error state.
- `missing-machine` рендерит controlled missing-machine state.
- Renderer loading рендерит controlled loading state.
- Layout failure рендерит controlled board error state.

### 5.5 Тесты этапа 3

- Component: graph action dispatch-ит open command.
- Component: source button по-прежнему dispatch-ит source action.
- Component: disabled source button остается disabled.
- Component: close button dispatch-ит close command.
- Component: empty/missing state рендерится.
- Component: без current state header показывает `simulation idle`.
- Component: initial state не подсвечивается как current.
- Component: graph action и close button доступны с клавиатуры.

Готовность этапа:

- Пользователь открывает и закрывает board shell из L3 card.
- Shell подключен к selector state.
- Shell готов принять MVP renderer.

## 6. Этап 4. React Flow и ELK renderer

Домен: layout, graph rendering и visual grammar.

Цель: отрендерить `MachineFlowModel` как readable static graph.

Целевые файлы:

```txt
apps/visualizer/package.json
apps/visualizer/src/canvas/layout-machine-canvas.ts
apps/visualizer/src/canvas/machine-canvas-render-types.ts
apps/visualizer/src/canvas/machine-canvas-render-policy.ts
apps/visualizer/src/canvas/machine-canvas-geometry.ts
apps/visualizer/src/features/machines/MachineCanvasGraph.tsx
apps/visualizer/src/features/machines/MachineCanvasBoard.tsx
apps/visualizer/src/styles.css
apps/visualizer/DESIGN.md
apps/visualizer/src/features/machines/*.test.tsx
```

### 6.1 Renderer pipeline

React components остаются thin. Layout, geometry, React Flow mapping,
self-loop math и label placement являются pure functions в `canvas/`.

Pipeline:

```txt
MachineFlowModel
-> render node drafts with stable sizes
-> split normal edges and self loops
-> run ELK for non-self edges
-> build edge paths
-> place labels
-> apply bounded label collision pass
-> map to React Flow nodes and edges
```

Mapping tables/functions:

- `nodeRole -> visual style`;
- `edgeKind -> stroke/style/marker`;
- `producerCategory -> legend/popover metadata label`;
- `badgeKind -> tone`;
- `layout error -> controlled board state`.

Renderer не меняет Machine Flow semantics.

### 6.2 Dependencies и loading

- Добавить `@xyflow/react` только в `apps/visualizer`.
- Добавить `elkjs` только в `apps/visualizer`.
- React Flow и ELK не появляются в `packages/graph`.
- Board renderer загружается лениво при первом открытии.

### 6.3 Render policy constants

Constants живут в
`apps/visualizer/src/canvas/machine-canvas-render-policy.ts` и покрываются unit
tests.

```txt
node min width: 160
node name char width: 7.4
node horizontal padding/buffer: 28
node marker gap: 6
node marker width: 56
base node height: 70
extra height per side-degree overflow: 18
edge label max width: 170
label collision passes: 4
label collision candidate shifts: 0.12, -0.12, 0.22, -0.22, 0.32, -0.32
label t bounds: 0.1..0.9
self-loop base opening/reach: 16 / 28
self-loop step opening/reach: 14 / 22
fit view padding: 0.2
zoom range: 0.3..1.6
background dots gap/size/color: visualizer tokens + baseline density
```

### 6.4 ELK layout и React Flow behavior

ELK options:

```txt
elk.algorithm = layered
elk.direction = RIGHT
elk.edgeRouting = ORTHOGONAL
elk.layered.nodePlacement.strategy = NETWORK_SIMPLEX
elk.layered.crossingMinimization.strategy = LAYER_SWEEP
elk.spacing.nodeNode = 80
elk.spacing.edgeEdge = 28
elk.spacing.edgeNode = 40
elk.layered.spacing.nodeNodeBetweenLayers = 200
elk.layered.spacing.edgeNodeBetweenLayers = 50
elk.layered.spacing.edgeEdgeBetweenLayers = 28
elk.layered.thoroughness = 10
```

Requirements:

- Direction: left-to-right.
- Edge routing: orthogonal.
- Размеры nodes стабильны до layout.
- Width растет с длиной label и ограничивается max width.
- Text truncates после max width.
- Height растет с max in/out side degree.
- Self loops исключаются из ELK.
- Missing ELK route использует fallback direct path.
- Semantic nodes рендерятся как React Flow nodes.
- Edge groups рендерятся как React Flow/custom edges.
- Nodes не draggable.
- Handles не connectable.
- Graph read-only и не dispatch-ит events.
- Выполнять fit view после layout.
- Повторять fit view после DOM node measurement, когда measured sizes меняют
  graph bounds.
- Показывать layout-in-progress state для медленных графов.
- Background dots и zoom controls соответствуют baseline.

### 6.5 Visual grammar

Nodes:

- Normal node: quiet solid outline.
- Initial node: `initial` badge.
- Current node: accent border и subtle fill.
- Terminal node: dashed outline и quiet fill.
- Spawn `__INIT`: `spawn` badge.
- Wildcard state node: `*`, dashed outline, `any state` badge.
- Wildcard effect node: `*`, dashed green/effect outline, `any effect` или
  `effect source` badge.
- Synthetic target node: compact quiet node.
- Node stats показывают incoming, outgoing и self-loop counters.

Edges:

- `accepted-transition`: solid amber-style line.
- `self-emitted-transition`: dashed green line.
- `from-other-transition`: dotted purple-style line.
- `emission-only`: source-node chip/counter без state-to-state transition.
- Edge label показывает first event и `+N`.
- Edge kind различим без popover.
- Layer остается secondary metadata.
- Stroke/shape определяется `edge.kind`.
- `producerCategory` используется для popover/legend metadata.

Density:

- Renderer вычисляет density level из готового render graph:
  - `normal`: `states <= 12` и visible transition edge groups `<= 40`;
  - `dense`: `states <= 30` и visible transition edge groups `<= 120`;
  - `very-dense`: выше dense thresholds.
- Accepted, self-emitted и from-other transition edge groups видимы во всех
  density levels.
- `emission-only` groups во всех MVP density levels остаются source-node
  chips/counters.
- Density меняет только label/chip presentation.
- Density constants живут в render policy и покрываются unit tests.
- Expose stable diagnostic attributes для E2E:
  `data-density`, `data-visible-edge-count`.

### 6.6 Design contract

- Canvas tokens/classes живут в `apps/visualizer/src/styles.css`.
- При добавлении UI grammar, state, token, control pattern или interaction
  pattern обновить `apps/visualizer/DESIGN.md`.
- `DESIGN.md` содержит раздел `Machine Canvas Board` с:
  - board surface и dotted background;
  - node roles и badge grammar;
  - edge kind grammar;
  - emission-only source-node chip/counter grammar;
  - hover popover;
  - React Flow controls;
  - legend placement;
  - responsive full-overlay behavior.
- Цвета используют `--vf-*` tokens:
  `--vf-config`, `--vf-effect`, `--vf-routing`, `--vf-accent`.
- Не добавлять decorative gradients, glass surfaces, nested cards, extra
  side-stripes или icon libraries вне `lucide-react`.

### 6.7 Edge geometry и hover popover

- Рисовать orthogonal rounded polylines из ELK bend points.
- Рисовать manual self-loop arcs над nodes.
- Детерминированно stack-ать multiple self loops.
- Позиционировать labels по fractional arc length.
- Выполнять bounded collision pass для non-self edge labels.
- Long labels обрезаются.
- Labels не выходят за viewport и не resize-ят graph nodes после layout.
- Hover по edge label показывает popover:
  - source;
  - target или self;
  - producer category;
  - grouped event names;
  - producer path из row refs, routing labels или source anchors.
- Popover строится только из `MachineFlowEdgeGroup.rows`, `sourceAnchors` и
  `producerCategory`.
- Renderer не обращается к `model.topics`/`model.relations`.

### 6.8 Тесты этапа 4

- Unit: render policy mapping для node roles и edge kinds.
- Unit: renderer policy constants и grouped label text.
- Unit: MVP density thresholds.
- Unit: self-loop geometry deterministic.
- Unit: label collision pass остается в `0.1..0.9`.
- Unit coverage: `apps/visualizer/src/canvas/*machine-canvas*` pure modules
  покрыты 100% statements/branches/functions/lines.
- Component: graph рендерит state nodes.
- Component: graph рендерит edge labels.
- Component: wildcard state node различим.
- Component: wildcard effect node различим.
- Component: emission-only group не рендерится как state-to-state transition.
- Component: long labels constrained.
- Component: layout failure показывает controlled state.

Готовность этапа:

- Ready Machine Flow Model рендерится как static graph.
- Wildcard state, wildcard effect, grouped labels и self loops читаемы.
- Renderer не протекает в graph domain code.
- Визуально MVP соответствует baseline.

## 7. Этап 5. MVP hardening и проверки

Домен: итоговая проверка вертикального среза.

Цель: довести MVP до стабильного user flow.

Целевые файлы:

```txt
apps/visualizer/src/features/machines/MachineCanvasBoard.tsx
apps/visualizer/src/features/machines/MachineCanvasGraph.tsx
apps/visualizer/src/canvas/*
apps/visualizer/src/features/machines/*.test.tsx
apps/visualizer/e2e или существующие Playwright tests
```

### 7.1 Interaction

- Hover edge label показывает popover.
- Click по graph item не dispatch-ит FSM event.
- Close action доступен мышью и с клавиатуры.
- Zoom controls доступны.
- Long labels не выходят за nodes/edge labels/buttons/viewport.
- Graph остается read-only.

### 7.2 Fixture matrix

MVP tests используют deterministic fixtures: compact source strings или fixture
builders, которые компилируются через graph compiler в тестах.

Запрещено напрямую импортировать runtime/demo modules, Next/React components,
store hooks, assets или playground package graph.

Reference material:

| Fixture | Reference |
| --- | --- |
| `lamp` | `apps/playground/app/examples/lamp/store/machines/lamp.ts` |
| `likes`, `likesPending` | `apps/playground/app/examples/likes/store/machines/likes.ts`, `likesPending.ts` |
| `likes-v2/likeSync` | `apps/playground/app/examples/likes-v2/store/machines/likesV2.ts`, `likeSync.ts` |
| `persist/chat*` | `apps/playground/app/examples/persist/store/machines/chatSession.ts`, `chatComposer.ts`, `chatThread.ts` |
| `album-download` | `apps/playground/app/examples/album-download/store/machines/albumDownload.ts`, `trackDownload.ts` |
| `actor-canvas` | `apps/playground/app/examples/actor-canvas/store/machines/canvasBoard.ts`, `canvasStroke.ts`, `canvasNetwork.ts` |
| `ssr-demo*` | `apps/playground/app/examples/ssr-demo*/store/machines/*.ts` |
| `roguelite` | `apps/playground/app/examples/roguelite/store/machines/*.ts` |
| `test-example/onboarding` | `apps/playground/app/examples/test-example/store/machines/onboarding.ts` |
| `xstate` | `xstate/graph-parser-fixtures.ts` и focused `xstate/*.ts` examples |

Required semantic coverage:

- `lamp`: two-state flow, reset/self handling.
- `likes`: wildcard state, pending flow, effect resolve/reject,
  reducer/context alternatives.
- `likes-v2`: actor template, `__INIT`, terminal states, wildcard cancel.
- `persist/chat*`: context machines, self/null handled events, persistence
  metadata.
- `album-download`: one-state summary, per-track actor template, grouped self
  loops.
- `actor-canvas`: snapshot persistence, actor template strokes, wildcard
  network effect, emission-only sync.
- `ssr-demo*`: hydration, paginated grids/entity lists, wildcard effects,
  context-scoped requests.
- `roguelite`: dense self loops, routed actor/group events, actor templates,
  terminal despawn flows.
- `test-example/onboarding`: wildcard state и wildcard effect в одной machine,
  conditional effect resolve/reject.
- `xstate`: computed keys, unresolved config, dynamic targets, escaped
  transition, conditional reducers/effects, wildcard effect.

Каждая fixture фиксирует expected visual story: business flow, collapsed edges,
emission-only chips и metadata badges.

### 7.3 E2E coverage

- Открыть compiled source в visualizer.
- Выбрать machine в L3.
- Открыть graph board.
- Проверить state nodes.
- Проверить edge labels.
- Проверить wildcard state node.
- Проверить wildcard effect node.
- Проверить self loop.
- Проверить grouped edge `+N`.
- Проверить dashed green self-emitted lifecycle edge.
- Проверить отсутствие ложного state-to-state edge для emission-only group.
- Проверить actor template: `__INIT`, terminal states, routing metadata,
  отсутствие per-instance nodes.
- Проверить one-state service через grouped self loops/node chips.
- Проверить dense fixture: нет horizontal overflow, graph видим после fit view.
- Снять deterministic screenshots для `lamp`, wildcard/self-loop fixture и
  dense fixture при disabled/reduced motion.
- Закрыть canvas board.
- Проверить, что source edit закрывает canvas board.

### 7.4 MVP acceptance criteria

- L3 machine cards показывают graph action.
- Graph action открывает board для выбранной machine и не меняет L3 selection.
- Board использует текущую compiled model.
- Board закрывается при source/model invalidation.
- Board рендерит state nodes, transition edges и self loops.
- Board рендерит wildcard state node и wildcard effect node.
- Board рендерит terminal, spawn, initial и current styling.
- Multiple events на одном route группируются с `+N`.
- Edge kind видим через edge style.
- Producer category видима через legend/popover metadata.
- Self-emitted local consumer events рендерятся как dashed green lifecycle
  edges.
- Effect emissions без local consumer остаются `emission-only` groups без
  `targetNodeId` и без state-to-state edges.
- One-state machines и dense fixtures читаемы.
- Actor templates читаются как templates без per-instance nodes.
- Canvas не dispatch-ит events.
- Layout failure показывает controlled board error state.
- Long labels constrained.
- React Flow и ELK imports отсутствуют в `packages/graph`.
- Renderer ids/coordinates отсутствуют в graph domain state.
- Unit/component/E2E tests покрывают MVP fixture matrix.

Готовность MVP:

- MVP user flow работает end-to-end.
- Graph читаем для small и dense compiled fixtures.
- Post-MVP extension points доступны без переписывания MVP architecture.
