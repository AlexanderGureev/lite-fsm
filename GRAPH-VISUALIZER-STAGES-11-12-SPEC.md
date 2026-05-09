# Визуализатор Lite FSM: спецификация этапов 11-12

Статус: черновик.

Документ заменяет описание этапов 11 и 12 из
[`GRAPH-COMPILER-SPEC.md`](GRAPH-COMPILER-SPEC.md). База этапов 0-9 уже
доступна: compiler, analyzer и system-first simulator на общей event bus.
Этапы после 12 здесь не описываются.

Основания:

- [`GRAPH-COMPILER-SPEC.md`](GRAPH-COMPILER-SPEC.md) - IR, анализатор,
  симулятор и границы пакетов;
- [`GRAPH-SIMULATOR-STAGE-9-SPEC.md`](GRAPH-SIMULATOR-STAGE-9-SPEC.md) -
  system-first simulator, event bus, timeline и границы simulator-а;
- [`GRAPH-COMPILER-IMPLEMENTATION-LOG.md`](GRAPH-COMPILER-IMPLEMENTATION-LOG.md)
  - фактическое состояние этапов 0-9;
- [`VISUALIZER-MVP-SPEC.md`](VISUALIZER-MVP-SPEC.md) - функциональная модель
  L1/L2/L3;
- [`music-app-mvp-flow.html`](music-app-mvp-flow.html) - эталон поведения и
  визуальной структуры MVP.

## Базовая модель

Визуализатор показывает `lite-fsm` как систему плоских машин на общей event
bus. Основная модель чтения:

```txt
машина -> потребляемые топики
машина -> производимые топики
топик -> производители + потребители
выбранные машины -> ручная проверка отправки события
```

MVP не строит постоянный граф всех машин и ребер. Базовые экраны: инвентарь
машин, каталог событий и рабочая область выбранных машин. Связи показываются
по выбору/наведению, без плотной сетки ребер.

## Входная база

К началу этапа 11 доступны:

- `compileLiteFsmGraph(source, options?)`;
- `selectMachineGraph(document, selector?)`;
- `analyzeLiteFsmGraph(document, options?)`;
- `LiteFsmGraphDocument` с машинами, менеджерами, переходами из `config`,
  ветками `reducer`, отправками из `effects`, маршрутизацией, привязками к
  исходнику, diagnostics и `initialContextJson` для JSON-safe стартового
  context;
- `@lite-fsm/graph/simulator` с `createGraphSimulator(document, options?)` для
  символьной системной симуляции выбранных машин на общей event bus.

`view-model` и visualizer работают только поверх IR/diagnostics: не парсят
исходник, не исполняют пользовательские `reducer`/`effect`. Dispatch/timeline
выполняется только через `@lite-fsm/graph/simulator`; собственная transition
logic в visualizer запрещена.

## Термины

| Термин             | Значение                                          | Источник                                  |
| ------------------ | ------------------------------------------------- | ----------------------------------------- |
| Машина             | доменная машина или шаблон актора                 | `LiteFsmGraphMachine`                     |
| Топик              | тип события на общей шине                         | `GraphEventRef.type`                      |
| Потребитель        | машина принимает топик из конкретного состояния   | `GraphTransition` layer `config`          |
| Производитель      | `effect` может отправить топик                    | `GraphEmission`                           |
| Ветка              | альтернативный переход из `config/reducer/effect` | reducer transitions или guarded emissions |
| Маршрутизация      | область доставки отправленного события            | `GraphRouting`                            |
| Рабочая область    | ручная проверка выбранных машин                   | состояние приложения                      |
| Привязка исходника | диапазон кода, связанный с элементом графа        | `SourceLocation`                          |

## Этап 11: проекция для визуализатора

### Цель

Реализовать `@lite-fsm/graph/view-model`: read-only projection
`LiteFsmGraphDocument` для трех представлений:

1. L1: системный инвентарь.
2. L2: каталог событий.
3. L3: рабочая область машин.

Проекция строится по всему документу и индексирует все машины, менеджеры и
топики.

### Публичная точка входа

Экспорт:

```txt
@lite-fsm/graph/view-model
```

Корневой импорт `@lite-fsm/graph` не реэкспортирует этот слой.

Минимальный публичный API:

```ts
export function buildGraphVisualizerModel(
  document: LiteFsmGraphDocument,
  options?: BuildGraphVisualizerModelOptions,
): GraphVisualizerModel;

export function buildMachineWorkbenchModel(
  machine: LiteFsmGraphMachine,
  options?: BuildMachineWorkbenchModelOptions,
): GraphMachineWorkbenchModel;
```

`buildMachineWorkbenchModel(machine, ...)` - machine-local helper для unit-тестов
и isolated previews. Он не подтягивает diagnostics/anchors вне переданной машины
и не знает `sourceVersion`. Production app использует
`buildGraphVisualizerModel(document, ...).workbenchMachines`, чтобы L1/L2/L3,
diagnostics и source anchors строились из одной версии IR.

### Обязанности этапа

Этап 11 реализует:

1. Индекс машин.
2. Индекс менеджеров.
3. Индекс топиков/event catalog из `transitions`, `emissions` и
   `reducerCases` IR.
4. Связи производителей и потребителей.
5. Модель рабочей области машины.
6. Привязки элементов графа к исходнику.
7. Привязки диагностик к элементам графа и исходнику.
8. Simulation overlay из готовых identifiers, row refs и флагов.
9. Детерминированную сортировку всех списков.

Этап 11 не реализует:

1. React-компоненты.
2. Интеграцию CodeMirror.
3. Вкладки, фильтры, hover/selection-состояние.
4. Dispatch, routing, branch selection или timeline logic simulator-а.
5. Симуляцию экземпляров акторов.
6. Автоматический каскад `effects`.
7. Сценарии.
8. Редактирование исходника и генерацию кода.
9. Раскладку canvas, React Flow, ELK или DOM API.
10. Dispatch или вычисление `available now`; это responsibility simulator-а и
    app adapter-а.

### Архитектура и границы `view-model`

`@lite-fsm/graph/view-model` - синхронный, чистый, UI-agnostic projection
layer. Он принимает уже готовые IR, diagnostics и simulation facts, строит
read-only данные для отображения и не владеет lifecycle приложения.

Pipeline этапа 11:

```txt
LiteFsmGraphDocument
  + analysisDiagnostics?
  + simulation overlay facts?
  -> normalize projection input
  -> build document indexes
  -> build source anchor map
  -> normalize diagnostic anchors
  -> build machine/manager summaries
  -> build topic catalog and relation index
  -> build machine workbench models
  -> apply simulation overlay flags
  -> finalize deterministic sorting
  -> GraphVisualizerModel
```

Внутренний pipeline должен быть линейным: каждый шаг принимает immutable input
и возвращает новый projection fragment или index. Шаг не должен читать React/UI
state, запускать simulator, парсить source или мутировать `LiteFsmGraphDocument`.

Границы ответственности:

1. Compiler владеет AST parsing, IR, `SourceLocation`, `initialContextJson` и
   compiler diagnostics.
2. Analyzer владеет semantic diagnostics поверх IR.
3. Simulator владеет scope, slices, current state, available transitions,
   suggested emissions, branch policy, dispatch, routing, timeline и pending
   choice.
4. View-model владеет labels, stable projection refs, row ids, source anchors,
   diagnostic anchors, summaries, relation indexes, workbench rows,
   capabilities и overlay flags из готовых facts.
5. App этапа 12 владеет sourceVersion, async clients, active tab, selection,
   hover, filters/search, opened overlays, selected machines, row-to-slice
   command adapter, manual simulation session и UI diagnostics.
6. Renderer/layout adapter владеет DOM, canvas, coordinates, edge paths,
   viewport, user layout preferences и concrete component props.
7. Future codegen/edit layer владеет draft model, source patches, diff preview
   и explicit apply; он не мутирует IR и не добавляет editing lifecycle в
   `view-model`.

Рекомендуемая внутренняя структура кода:

```txt
src/view-model/index.ts             public subpath exports only
src/view-model/types.ts             public projection types
src/view-model/build-model.ts       top-level orchestration only
src/view-model/indexes.ts           machine/state/transition/emission indexes
src/view-model/summaries.ts         machine and manager summaries
src/view-model/topics.ts            event catalog, producers, consumers, routing values
src/view-model/workbench.ts         state blocks and rows
src/view-model/diagnostics.ts       diagnostic ids and graph/source binding
src/view-model/source-anchors.ts    read-only source anchor helpers
src/view-model/simulation.ts        overlay flags and row-ref mapping
src/view-model/ids.ts               stable projection ids and row ids
src/view-model/sort.ts              deterministic ordering helpers
```

Имена файлов можно уточнить по фактическому коду, но ownership должен
сохраниться. `build-model.ts` не должен содержать business logic: он только
вызывает passes pipeline-а и собирает финальный `GraphVisualizerModel`.
`buildMachineWorkbenchModel(...)` должен использовать тот же workbench builder,
что и `buildGraphVisualizerModel(...)`; отдельная реализация L3 для isolated
preview запрещена.

Правила расширяемости:

1. Новая возможность добавляется как новый projection fragment или новый pass
   pipeline-а, если она строится из IR/diagnostics/simulator facts.
2. Если возможность требует UI state, async lifecycle, selection, filters,
   timeline step, payload draft или source editing, она относится к app/codegen
   layer, а не к `view-model`.
3. Новые row kinds, badges, capabilities и graph refs добавляются только когда
   есть устойчивый IR/source/simulator identifier. DOM ids, component keys и
   renderer-specific ids не становятся domain ids.
4. Derived summaries строятся один раз внутри `view-model` и передаются app как
   готовые поля. App selectors могут фильтровать/группировать projection, но не
   должны пересобирать semantic summary из raw IR.
5. Детерминированная сортировка централизована в `sort.ts`; локальные
   `array.sort(...)` в feature builders запрещены, кроме вызова shared helper-а.
6. Row id generation централизован в `ids.ts`; строки не собирают id
   ad hoc из display labels.
7. Source anchors создаются только через `source-anchors.ts`, чтобы future
   edit/codegen layer получил единый provenance contract.
8. Diagnostics binding создается только через `diagnostics.ts`; feature builders
   получают уже нормализованные diagnostic anchors/ids.
9. Simulation overlay применяется последним pass-ом поверх готовых rows. Он не
   меняет semantic rows, topics или relations.
10. При изменении публичного API или типов projection нужно обновить
    `API-CHEATSHEET.md` и `TYPES-CHEATSHEET.md`.

Правила зависимостей:

1. `view-model` может импортировать только типы и pure helpers из
   `@lite-fsm/graph` internals, которые не тянут simulator runtime, UI, DOM,
   CodeMirror, React Flow, ELK или app modules.
2. `view-model` может импортировать simulator types только как `import type`,
   если это нужно для совместимости overlay facts; runtime import simulator-а
   запрещен.
3. Root entrypoint `@lite-fsm/graph` не импортирует и не реэкспортирует
   `view-model`.
4. Тесты могут импортировать internal files только для проверки ownership
   boundaries; public behavior tests должны предпочитать
   `@lite-fsm/graph/view-model`.

### Порядок реализации этапа 11

Этап 11 реализуется последовательно. Контекстное окно LLM не является причиной
для объединения работ: модель должна строить план по подэтапам ниже, закрывать
каждый подэтап тестами и только затем переходить к следующему. Запрещено
смешивать workbench rows, diagnostics и simulation overlay в одном начальном
изменении, потому что эти части зависят от стабильных refs, row ids и
сортировки.

План реализации должен всегда начинаться с короткого чеклиста вида:

```txt
11a public surface: pending
11b L1/L2 indexes: pending
11c machine workbench: pending
11d diagnostics and anchors: pending
11e simulation overlay and row mapping: pending
11f stabilization: pending
```

Во время работы агент обновляет статус подэтапов по мере выполнения. Если
приходится временно добавить заглушку для следующего подэтапа, она должна быть
минимальной, явно тестируемой и не должна имитировать завершенную логику.

#### Этап 11a: public surface и базовые типы

Состав:

1. Добавить отдельный экспорт `@lite-fsm/graph/view-model`.
2. Не реэкспортировать `view-model` из корневого `@lite-fsm/graph`.
3. Добавить публичные типы projection layer.
4. Добавить скелеты `buildGraphVisualizerModel(...)` и
   `buildMachineWorkbenchModel(...)`.
5. Добавить shared helpers только для уже нужных операций: stable refs,
   source anchors, target labels и deterministic ordering.

Проверка:

1. TypeScript видит `@lite-fsm/graph/view-model`.
2. Корневой импорт `@lite-fsm/graph` не содержит view-model API.
3. `view-model` не импортирует React, DOM, CodeMirror, React Flow, ELK и
   модули приложения.
4. Базовые builders возвращают корректную версию модели и пустые/минимальные
   структуры без падения на пустом документе.

#### Этап 11b: L1/L2 indexes

Состав:

1. Построить `GraphMachineSummary`.
2. Построить `GraphManagerSummary`.
3. Построить `GraphTopicSummary` из `transitions`, `emissions` и
   `reducerCases`.
4. Построить producers, consumers и consumer branches.
5. Построить `routingKinds` и `routingValues` только из producer routings.
6. Построить `GraphRelationIndex`.
7. Зафиксировать deterministic sorting для машин, менеджеров, топиков,
   producers и consumers.

Правила:

1. Consumer создается только из `config` acceptance.
2. Reducer branch уточняет уже принятый event и не создает отдельный consumer.
3. App layer этапа 12 не должен пересобирать routing summary из raw IR.

Проверка:

1. Snapshot системного инвентаря.
2. Snapshot каталога топиков.
3. Snapshot `routingKinds` и `routingValues`.
4. Snapshot relation index.
5. Полный fixture с исходником строит L1/L2 projection для всех машин без
   предварительного `selectMachineGraph`.

#### Этап 11c: machine workbench model

Состав:

1. Реализовать `buildMachineWorkbenchModel(...)` как machine-local helper.
2. Построить state blocks в порядке `machine.states`.
3. Построить rows `config`, `reducer`, `effect`, `diagnostic`, `unknown`.
4. Построить `GraphTargetView`.
5. Построить badges и capabilities.
6. Реализовать collapse policy.
7. Реализовать folded reducer rows для сквозных reducer branches.
8. Отразить wildcard и lifecycle-строки actor templates.

Правила:

1. Workbench model не импортирует simulator runtime.
2. Transition rows используют `row.transitionId`, чтобы app мог передать
   explicit branch в `sendFromTransition(...)`.
3. Неразрешенные `dynamic`, `unknown` и `blocked` цели остаются видимыми
   строками; projection не создает псевдосостояния.

Проверка:

1. Snapshot модели рабочей области машины.
2. Snapshot свернутых сквозных reducer branches.
3. Snapshot wildcard-поведения.
4. Snapshot lifecycle-строк actor templates.
5. Unit-тесты для `GraphTargetView`.

#### Этап 11d: diagnostics и source anchors

Состав:

1. Нормализовать compiler diagnostics из `document.diagnostics`.
2. Нормализовать analyzer diagnostics из `options.analysisDiagnostics`.
3. Построить локальные `diagnosticId`.
4. Привязать diagnostics к `GraphItemRef`, когда это возможно.
5. Привязать diagnostics к `GraphSourceAnchor`, когда есть `loc`.
6. Пробросить `diagnosticIds` в machines, managers, topics и state blocks.
7. Добавить diagnostic rows в workbench model.

Правила:

1. `diagnosticId` стабилен только внутри одной сборки модели.
2. Source anchors в этапе 11 всегда read-only: `editable: false`.
3. Если diagnostic нельзя надежно связать с graph item, он все равно остается в
   `GraphVisualizerModel.diagnostics`.

Проверка:

1. Snapshot привязок диагностик.
2. Snapshot source anchors.
3. Тесты compiler/analyzer origins.
4. Тест на diagnostics без `loc` и без `machineId`.

#### Этап 11e: simulation overlay и canonical row mapping

Состав:

1. Применить `currentStateId` к workbench state blocks.
2. Проставить `simulation.available` для transition rows.
3. Проставить `simulation.suggested` и `dispatchability` для effect rows.
4. Проставить `simulation.recentlyFired` и `simulation.inspected`.
5. Поддержать input по row ids и по graph-level row refs.
6. Реализовать canonical mapping row refs к workbench row ids.
7. Зафиксировать приоритет slice-level facts над machine-level facts.

Правила:

1. Projection не выбирает timeline step.
2. Projection не вызывает simulator и не импортирует simulator runtime.
3. Если graph-level ref не мапится однозначно, ambiguity должна быть видима для
   app selector-а; projection не должна молча выбирать случайную row.
4. Machine-level simulation input является MVP shortcut и не должен становиться
   базой для future exact actor mode.

Проверка:

1. Snapshot slice-level overlay flags для available/suggested/recently
   fired/inspected rows.
2. Unit-тесты canonical mapping для config, reducer, folded reducer и effect
   rows.
3. Unit-тест приоритета slice-level над machine-level input.
4. Unit-тест ambiguous/no-match mapping.

#### Этап 11f: стабилизация

Состав:

1. Свести `buildGraphVisualizerModel(...)` так, чтобы L1/L2/L3, diagnostics и
   source anchors строились из одной версии IR.
2. Проверить deterministic sorting всех публичных списков.
3. Убрать временные заглушки подэтапов.
4. Проверить границы импорта и отсутствие UI/runtime зависимостей.
5. Обновить cheatsheets, если публичный API или типы требуют документации.

Проверка:

```txt
pnpm --filter @lite-fsm/graph check-types
pnpm exec vitest run tests/graph
```

### Базовая структура модели

```ts
export type BuildGraphVisualizerModelOptions = {
  analysisDiagnostics?: readonly GraphDiagnostic[];
  simulation?: GraphVisualizerSimulationOverlayInput;
};

export type GraphVisualizerModel = {
  version: "lite-fsm.visualizer/v1";
  source: GraphSource;
  machines: readonly GraphMachineSummary[];
  managers: readonly GraphManagerSummary[];
  topics: readonly GraphTopicSummary[];
  relations: GraphRelationIndex;
  diagnostics: readonly GraphDiagnosticAnchor[];
  workbenchMachines: Record<string, GraphMachineWorkbenchModel>;
};
```

### Ссылки на элементы графа

Все представления используют стабильные graph refs. DOM id, React key,
CodeMirror marker id и renderer id не являются domain ids.

```ts
export type GraphItemRef =
  | { kind: "machine"; machineId: string }
  | { kind: "manager"; managerId: string }
  | { kind: "state"; machineId: string; stateId: string }
  | { kind: "transition"; machineId: string; transitionId: string }
  | { kind: "emission"; machineId: string; emissionId: string }
  | { kind: "reducerCase"; machineId: string; reducerCaseId: string }
  | { kind: "topic"; eventType: string }
  | { kind: "diagnostic"; diagnosticId: string };
```

`topic` - объект проекции со стабильным ключом `eventType`.

### Привязки к исходнику

```ts
export type GraphSourceAnchor = {
  kind:
    | "machine"
    | "manager"
    | "state"
    | "config-transition"
    | "reducer-branch"
    | "effect-emission"
    | "initial-state"
    | "initial-context"
    | "diagnostic";
  loc?: SourceLocation;
  editable: false;
};
```

В этапе 11 anchors read-only; `editable` всегда `false` и зарезервирован для
будущего edit layer.

### Диагностики

`GraphDiagnostic` не имеет публичного id. Проекция нормализует диагностики в
локальные ссылки:

```ts
export type GraphDiagnosticAnchor = {
  diagnosticId: string;
  origin: "compiler" | "analyzer";
  diagnostic: GraphDiagnostic;
  graphItemRef?: GraphItemRef;
  sourceAnchor?: GraphSourceAnchor;
};
```

`diagnosticId` строится из `origin`, `machineId`, `code`, `loc` и порядкового
номера в группе; он стабилен только внутри одной сборки модели.

### Сводка машины

```ts
export type GraphMachineSummary = {
  machineId: string;
  title: string;
  kind: "domain" | "actorTemplate" | "unknown";
  groupTag?: string;
  initialState?: string;
  managerKeys: readonly string[];
  counts: {
    states: number;
    consumedTopics: number;
    producedTopics: number;
    configTransitions: number;
    reducerBranches: number;
    effectEmissions: number;
    diagnostics: number;
  };
  consumedTopicTypes: readonly string[];
  producedTopicTypes: readonly string[];
  sourceAnchors: readonly GraphSourceAnchor[];
  diagnosticIds: readonly string[];
};
```

UI может отображать `actorTemplate` как `actor`, но модель хранит термин IR.

### Сводка менеджера

```ts
export type GraphManagerSummary = {
  managerId: string;
  title: string;
  machineRefs: readonly Array<{
    key: string;
    machineId: string;
    sourceAnchors: readonly GraphSourceAnchor[];
  }>;
  sourceAnchors: readonly GraphSourceAnchor[];
  diagnosticIds: readonly string[];
};
```

### Сводка топика

```ts
export type GraphTopicSummary = {
  eventType: string;
  producerCount: number;
  consumerCount: number;
  routingKinds: readonly GraphRouting["kind"][];
  routingValues: readonly GraphTopicRoutingValue[];
  producers: readonly GraphTopicProducer[];
  consumers: readonly GraphTopicConsumer[];
  diagnosticIds: readonly string[];
};

export type GraphTopicRoutingValue = {
  kind: GraphRouting["kind"];
  label: string;
  value?: string;
  confidence: "exact" | "partial" | "unknown";
};

export type GraphTopicProducer = {
  machineId: string;
  emissionId: string;
  sourceStateKey: string | "*";
  routing: GraphRouting;
  guard?: GraphCondition;
  confidence: "exact" | "partial" | "unknown";
  sourceAnchors: readonly GraphSourceAnchor[];
};

export type GraphTopicConsumer = {
  machineId: string;
  sourceStateKey: string | "*";
  acceptedTransitionId: string;
  branches: readonly GraphTopicConsumerBranch[];
  confidence: "exact" | "partial" | "unknown";
  sourceAnchors: readonly GraphSourceAnchor[];
};

export type GraphTopicConsumerBranch = {
  transitionId: string;
  layer: "config" | "reducer";
  target: GraphTargetView;
  guard?: GraphCondition;
  reducerCaseId?: string;
  confidence: "exact" | "partial" | "unknown";
};
```

Потребитель создается только из `config` acceptance. Ветки `reducer` уточняют
уже принятое событие и не создают отдельного consumer-а.

`routingKinds` и `routingValues` строятся только из producer routings
`GraphTopicProducer.routing`. `routingKinds` - deduplicated ordered set видов
routing. `routingValues` - deduplicated ordered set concrete display values для
L2 (`default`, `groupTag:X`, `actorId:*`, dynamic/unknown и т.п.) с сохранением
`confidence`; app selectors не пересобирают этот summary из raw IR. Сортировка:
сначала `kind`, затем `label`, затем порядок producer-а в IR.

### Индекс связей

```ts
export type GraphRelationIndex = {
  topicTypesByMachineId: Record<
    string,
    {
      consumed: readonly string[];
      produced: readonly string[];
    }
  >;
  machineIdsByTopicType: Record<
    string,
    {
      producers: readonly string[];
      consumers: readonly string[];
      related: readonly string[];
    }
  >;
};
```

Индекс нужен для L1 highlight без постоянных ребер между колонками.

### Модель рабочей области машины

```ts
export type GraphWorkbenchCollapsePolicy =
  | { kind: "none" }
  | { kind: "collapse-non-current-long-states"; rowThreshold: number };

export type BuildMachineWorkbenchModelOptions = {
  simulation?: GraphMachineSimulationOverlayInput;
  collapse?: GraphWorkbenchCollapsePolicy;
};

export type GraphMachineWorkbenchModel = {
  machineId: string;
  title: string;
  kind: "domain" | "actorTemplate" | "unknown";
  groupTag?: string;
  initialState?: string;
  currentStateId?: string;
  states: readonly GraphWorkbenchStateBlock[];
  globalBehavior: readonly GraphWorkbenchRow[];
  diagnostics: readonly GraphDiagnosticAnchor[];
  sourceAnchors: readonly GraphSourceAnchor[];
};

export type GraphWorkbenchStateBlock = {
  stateId: string;
  stateKey: string;
  kind: GraphState["kind"];
  badges: readonly GraphWorkbenchBadge[];
  current: boolean;
  collapsed: boolean;
  rows: readonly GraphWorkbenchRow[];
  sourceAnchors: readonly GraphSourceAnchor[];
  diagnosticIds: readonly string[];
};
```

Значки описывают смысл, а не CSS:

```ts
export type GraphWorkbenchBadge = {
  kind:
    | "domain"
    | "actor-template"
    | "group-tag"
    | "initial"
    | "spawn"
    | "terminal"
    | "wildcard"
    | "config"
    | "reducer"
    | "effect"
    | "routing"
    | "diagnostic"
    | "confidence";
  label: string;
  severity?: GraphDiagnostic["severity"];
};
```

Строки рабочей области - структурированные данные, не JSX:

```ts
export type GraphWorkbenchRowSimulation = {
  available?: boolean;
  suggested?: boolean;
  recentlyFired?: boolean;
  inspected?: boolean;
};

export type GraphWorkbenchRow =
  | GraphConfigRow
  | GraphReducerRow
  | GraphEffectRow
  | GraphDiagnosticRow
  | GraphUnknownRow;

export type GraphConfigRow = {
  kind: "config";
  rowId: string;
  machineId: string;
  sourceStateId: string;
  eventType: string;
  acceptedTransitionId: string;
  transitionId: string;
  target: GraphTargetView;
  guard?: GraphCondition;
  confidence: "exact" | "partial" | "unknown";
  simulation?: GraphWorkbenchRowSimulation;
  capabilities: readonly GraphWorkbenchCapability[];
  sourceAnchors: readonly GraphSourceAnchor[];
};

export type GraphReducerRow = {
  kind: "reducer";
  rowId: string;
  machineId: string;
  sourceStateId: string;
  eventType: string;
  acceptedTransitionId: string;
  transitionId: string;
  reducerCaseId?: string;
  target: GraphTargetView;
  guard?: GraphCondition;
  foldedIntoConfig: boolean;
  confidence: "exact" | "partial" | "unknown";
  simulation?: GraphWorkbenchRowSimulation;
  capabilities: readonly GraphWorkbenchCapability[];
  sourceAnchors: readonly GraphSourceAnchor[];
};

export type GraphEffectRow = {
  kind: "effect";
  rowId: string;
  machineId: string;
  sourceStateId?: string;
  sourceStateKey: string | "*";
  emissionId: string;
  eventType: string;
  routing: GraphRouting;
  guard?: GraphCondition;
  confidence: "exact" | "partial" | "unknown";
  dispatchability?: "can-dispatch" | "not-current-state" | "terminal-slice" | "unknown-routing";
  simulation?: GraphWorkbenchRowSimulation;
  capabilities: readonly GraphWorkbenchCapability[];
  sourceAnchors: readonly GraphSourceAnchor[];
};

export type GraphDiagnosticRow = {
  kind: "diagnostic";
  rowId: string;
  machineId?: string;
  diagnosticId: string;
  severity: GraphDiagnostic["severity"];
  message: string;
  capabilities: readonly GraphWorkbenchCapability[];
  sourceAnchors: readonly GraphSourceAnchor[];
};

export type GraphUnknownRow = {
  kind: "unknown";
  rowId: string;
  machineId?: string;
  label: string;
  reason: string;
  confidence: "partial" | "unknown";
  capabilities: readonly GraphWorkbenchCapability[];
  sourceAnchors: readonly GraphSourceAnchor[];
};
```

`foldedIntoConfig` применяется к сквозной ветке `reducer`, которая не добавляет
информации к `config`; UI показывает одну строку `config` с маркером `reducer`.
`GraphConfigRow` и `GraphReducerRow` с capability `send-event` являются
transition rows. При клике app передает именно `row.transitionId` в
`sendFromTransition(...)`; это сохраняет ручной выбор reducer branch без
дублирования transition logic в UI.

Canonical row mapping:

1. `GraphSimulationRowRef.kind === "transition"` мапится на единственную
   transition row, у которой `machineId` и `transitionId` совпадают с ref.
2. Для обычного `config` edge это `GraphConfigRow.transitionId`.
3. Для развернутой reducer branch это `GraphReducerRow.transitionId`; если branch
   свернута в config row (`foldedIntoConfig === true`), ref мапится на
   `GraphConfigRow` accepted transition row.
4. Если ref соответствует нескольким rows или не соответствует ни одной row,
   app selector возвращает controlled diagnostic и не вызывает simulator command.
5. `GraphSimulationRowRef.kind === "emission"` мапится по `emissionId` на
   `GraphEffectRow`; ambiguous actor slices различаются через `sliceId`.

### Представление цели перехода

```ts
export type GraphTargetView = {
  kind: GraphTarget["kind"];
  label: string;
  stateId?: string;
  terminal?: "__RESOLVED" | "__REJECTED" | "__CANCELLED";
  blockedReason?: string;
};
```

Правила отображения:

1. `self` отображается как `self`.
2. `terminal` отображается через label терминала.
3. `dynamic`, `unknown` и `blocked` остаются видимыми строками.
4. Проекция не создает псевдосостояние для неразрешенной цели.

### Слой подсветки симуляции

Этап 11 не запускает симуляцию и не импортирует simulator runtime. Он принимает
только facts, которые app layer получил из `GraphSimulationSnapshot`,
`getAvailableTransitions()`, `getSuggestedEmissions()` и выбранного UI timeline
step.

```ts
export type GraphVisualizerSimulationRowRef =
  | { kind: "transition"; machineId: string; transitionId: string; sliceId?: string }
  | { kind: "emission"; machineId: string; emissionId: string; sliceId?: string };

export type GraphVisualizerSimulationOverlayInput = {
  currentStateIdsBySliceId?: Record<string, string>;
  availableTransitionIdsBySliceId?: Record<string, readonly string[]>;
  suggestedEmissionIdsBySliceId?: Record<string, readonly string[]>;
  currentStateIdsByMachineId?: Record<string, string>;
  availableTransitionIdsByMachineId?: Record<string, readonly string[]>;
  suggestedEmissionIdsByMachineId?: Record<string, readonly string[]>;
  firedRefs?: readonly GraphVisualizerSimulationRowRef[];
  inspectedRefs?: readonly GraphVisualizerSimulationRowRef[];
  recentlyFiredRowIds?: readonly string[];
  inspectedRowIds?: readonly string[];
};

export type GraphMachineSimulationOverlayInput = {
  sliceId?: string;
  currentStateId?: string;
  availableTransitionIds?: readonly string[];
  suggestedEmissionIds?: readonly string[];
  recentlyFiredRowIds?: readonly string[];
  inspectedRowIds?: readonly string[];
};
```

`firedRefs`/`inspectedRefs` - graph-level facts simulator-а.
`recentlyFiredRowIds`/`inspectedRowIds` - row ids после app mapping. Этап 11
может принимать оба формата, но не выбирает timeline step. Он только проставляет
`simulation.available`, `simulation.suggested`, `simulation.recentlyFired` и
`simulation.inspected` на rows из переданных facts. Slice-level maps -
каноничный формат simulator-а; machine-level maps - MVP-only shortcut для ровно
одного активного slice. При конфликте slice-level имеет приоритет. Тесты
simulator/app должны покрывать slice-level mapping; machine-level mapping нельзя
использовать как основу future exact actor mode.

### Доступные действия

```ts
export type GraphWorkbenchCapability =
  | { kind: "inspect"; ref: GraphItemRef }
  | { kind: "select-source"; anchors: readonly GraphSourceAnchor[] }
  | { kind: "send-event"; machineId: string; eventType: string; transitionId?: string }
  | { kind: "follow-emission"; machineId: string; emissionId: string };
```

Capabilities описывают разрешенную операцию, не мутируют source и simulation
state. App этапа 12 мапит их в `GraphSimulationSession`: `send(...)`,
`sendFromTransition(...)`, `sendFromEmission(...)` или `choose(...)`.

Capabilities являются UI hints, а не simulator origin. Для row-level команд app
selector обязан связать `machineId`/`rowId` с единственным активным
`GraphSimulationSliceRef`; при неоднозначности команда отклоняется diagnostic-ом
приложения и не вызывает simulator.

### Сортировка

1. Машины идут в порядке `document.machines`.
2. Менеджеры идут в порядке `document.managers`.
3. Топики сортируются по `eventType`.
4. Производители и потребители сортируются по порядку машин, затем по порядку
   состояний, затем по порядку в IR.
5. Блоки состояний идут в порядке `machine.states`.
6. Строки внутри состояния идут в порядке `config`, `reducer`, `effect`,
   `diagnostic`, `unknown`.

### Проверка этапа 11

Обязательные команды:

```txt
pnpm --filter @lite-fsm/graph check-types
pnpm exec vitest run tests/graph
```

Обязательные тесты:

1. `@lite-fsm/graph/view-model` доступен как отдельный экспорт.
2. Корневой импорт `@lite-fsm/graph` не загружает `view-model`.
3. `view-model` не импортирует React, DOM, CodeMirror, React Flow, ELK и модули
   приложения.
4. Snapshot-тесты покрывают:
   - системный инвентарь;
   - каталог топиков;
   - `routingKinds` и `routingValues` каталога топиков;
   - модель рабочей области машины;
   - привязки диагностик;
   - показатель достоверности (`confidence`) для динамической маршрутизации;
   - свернутые сквозные ветки `reducer`;
   - lifecycle-строки шаблонов акторов;
   - wildcard-поведение;
   - slice-level simulation overlay flags для available/suggested/recently
     fired/inspected rows;
   - canonical mapping simulator row refs к workbench row ids для config,
     reducer, folded reducer и effect rows.
5. Полный fixture с исходником строит проекцию для всех машин без
   предварительного `selectMachineGraph`.

## Этап 12: MVP визуализатора

### Цель

Собрать отдельное приложение `apps/visualizer`, которое реализует:

1. Редактор исходника.
2. L1: системный инвентарь.
3. L2: каталог событий.
4. L3: рабочую область машин.
5. Ручную отправку события по выбранным машинам.
6. Окно исходника для выбранной машины.
7. UI диагностик.

Приложение - инструмент, не лендинг и не часть docs.

### Расширение под codegen

Этап 12 не реализует codegen, но оставляет для него границу без переписывания
приложения.

Будущий codegen строится отдельным слоем поверх исходника и IR:

```txt
SourceSession
  -> compile/analyze/view-model
  -> editable draft
  -> SourcePatch/TextEdit[]
  -> diff preview
  -> explicit apply через host adapter
```

`view-model` остается read-only projection. Editable canvas, создание машин и
codegen используют отдельную draft-модель и не мутируют IR напрямую.

UI-компоненты и `@lite-fsm/graph` не пишут в файловую систему. Codegen
возвращает structured patches; host adapter решает, можно ли применить их.
Будущий local host может читать project files и применять patches только после
preview и явного действия пользователя.

Минимальные ограничения для этапа 12:

1. Все операции с исходником идут через `SourceSession` и async clients.
2. UI не импортирует `node:fs` и не пишет файлы напрямую.
3. Source patches привязываются к `sourceVersion` и `hash`.
4. L3-карточки проектируются так, чтобы позже иметь режимы `inspect` и `edit`.
5. Host capabilities являются частью состояния приложения, даже если в MVP
   используется только static adapter.

### Поток данных

```txt
SourceSession
  -> GraphCompilerClient
  -> GraphAnalyzerClient
  -> GraphVisualizerModelClient
  -> headless workbench selectors
  -> UI вкладок `Source`, `System`, `Events`, `Machines`

LiteFsmGraphDocument + selected machine ids
  -> GraphSimulationService
  -> VisualizerSimulationState
  -> simulation overlay для GraphVisualizerModelClient
```

React-компоненты только dispatch commands и читают selectors. Они не вызывают
compiler, analyzer, `view-model` или simulator напрямую.

React view слой этапа 12 по возможности остается простым read/dispatch слоем:
компоненты читают готовый view state, отправляют пользовательские события и не
содержат business logic. Любые правила выбора, трансформации, доступности
действий, guards и side-effect orchestration выносятся в workbench/features,
selectors, services или app-level effect runner.

### Архитектура приложения и границы слоев

Этап 12 должен заложить внутреннюю архитектуру visualizer-а так, чтобы будущие
codegen, editable L3/canvas, дополнительные окна/консоли и validation providers
добавлялись новыми слоями, а не переписыванием UI. Сам этап 12 остается
strictly non-canvas MVP: React Flow, ELK, координаты, edge routing, drag/drop и
редактируемый canvas не реализуются и не подключаются как runtime-зависимости
MVP. В Stage 12 допускается только reserved `canvas/` boundary с типами/no-op
адаптером для будущей интеграции.

Этот раздел задает контракт, а не отдельную параллельную задачу. Его
минимальная реализация входит в `12a architecture foundation`; подэтапы
`12b`, `12b-shadcn-foundation` и `12c`-`12f` должны опираться на эти
boundaries и не переопределять их.

Границы ответственности:

1. `@lite-fsm/graph` владеет compiler/analyzer/simulator/view-model. Он не
   импортирует visualizer app modules, React, DOM, CodeMirror, host adapters,
   eslint, codegen или canvas.
2. `services/` в `apps/visualizer` владеет async boundaries поверх graph tooling:
   compiler, analyzer, view-model, simulator session, host adapter и future
   validation providers. Даже локальные реализации возвращают `Promise`.
3. `workbench/` владеет pure state, reducers, commands,
   `WorkbenchEffectDescriptor`, sourceVersion guards, stale response policy и
   selectors. Он не импортирует React, DOM, CodeMirror, shadcn, lucide, CSS или
   concrete renderer adapters.
4. `source/` владеет `SourceSession`, hashing, sample source, source overlays и
   source anchor selection. Он не компилирует graph напрямую.
5. `features/source`, `features/system`, `features/events`,
   `features/machines` владеют feature-level selectors/view state и React
   components соответствующих вкладок. Components читают только selectors и
   dispatch-ят commands.
6. `cards/` владеет L3/card-facing model builders и actions/capabilities поверх
   `GraphMachineWorkbenchModel`. Card model не является JSX и не хранит DOM ids.
7. `canvas/` в этапе 12 является reserved boundary. Он может содержать только
   типы `CanvasItemModel`/`CanvasAdapter` и no-op adapter для будущего renderer-а.
   L1/L2/L3 Stage 12 не используют canvas.
8. `diagnostics/` владеет нормализацией `WorkbenchDiagnosticRef`, binding-ом к
   graph/source anchors и provider registry. Console/panel отображают уже
   нормализованные diagnostics.
9. `console/` владеет console entries, channels, filters и navigation targets.
   Для Stage 12 достаточно общей console/panel; отдельные диагностические окна
   не реализуются.
10. `codegen/` в этапе 12 содержит только reserved types и no-op planner. Он не
    строит patches, не применяет patches и не меняет source.
11. `validation/` владеет future provider boundary для custom rules/eslint. В
    Stage 12 можно иметь no-op provider registry; visualizer должен быть готов
    принимать diagnostics из таких providers без смены формата state.
12. `app/` владеет composition root: providers, effect runner, shell, tab/panel
    wiring и подключение concrete UI.

Рекомендуемая внутренняя структура:

```txt
apps/visualizer/src/
  app/                 composition root, providers, effect runner, shell
  workbench/           pure state, commands, reducers, selectors, effects
  source/              SourceSession, hash, samples, source overlay logic
  services/            compiler/analyzer/model/simulator/host clients
  diagnostics/         diagnostic refs, provider registry, bindings
  console/             console state, channels, filters, navigation targets
  codegen/             reserved intents, patch plan types, no-op planner
  validation/          future lint/custom-rule provider boundary
  cards/               L3/card model builders and card actions
  canvas/              reserved no-op boundary, no renderer in Stage 12
  features/
    source/
    system/
    events/
    machines/
  ui/                  shared presentational components
```

Dependency rules:

1. React components не импортируют `@lite-fsm/graph`, simulator runtime,
   CodeMirror state helpers, codegen planner или validation providers напрямую.
2. Pure modules из `workbench/`, `source/`, `diagnostics/`, `console/`,
   `cards/`, `codegen/`, `validation/` и `canvas/` не импортируют React/DOM и
   попадают под `test:coverage`.
3. Concrete UI libraries (`shadcn/ui`, `lucide-react`, CodeMirror) остаются в
   feature/UI слоях.
4. Domain refs везде представлены `GraphItemRef`, `GraphSourceAnchor`,
   `GraphSimulationSliceRef`, `machineId`, `rowId` и `sourceVersion`. DOM id,
   React key, CodeMirror decoration id, future canvas node id и test id не
   являются domain identifiers.
5. Новые окна, панели и консоли добавляются через panel/console state и
   selectors. Они не должны читать raw IR в обход `GraphVisualizerModel`.

### Source hash

`SourceSession.hash` - content hash текущего `source`. Формат hash является
opaque для UI, но должен быть детерминированным для одинаковой строки source в
одной версии приложения. `version` не заменяет `hash`: `version` нужен для
latest-wins lifecycle, `hash` нужен для будущего patch safety и conflict
detection. Future patch/apply операции сравнивают и `sourceVersion`, и `hash`;
при несовпадении возвращают controlled conflict/diagnostic.

### App-level card, canvas и codegen contracts

L3-карточки Stage 12 рендерятся как обычная карточная рабочая область, но
строятся через app-level `CardModel`, чтобы future canvas мог использовать тот
же data model.

```ts
type CardOrigin =
  | { kind: "ir"; ref: GraphItemRef; sourceAnchors: readonly GraphSourceAnchor[] }
  | { kind: "draft"; draftId: string; intent: SourceEditIntent };

type EditableSupport =
  | { kind: "yes" }
  | { kind: "readonly"; reason: "derived-from-reducer" | "derived-from-effect" | "analysis-only" }
  | { kind: "unsupported-source-shape"; reason: string }
  | { kind: "dynamic"; reason: string }
  | { kind: "external"; reason: string };

type CardAction =
  | { kind: "inspect"; ref: GraphItemRef }
  | { kind: "select-source"; anchors: readonly GraphSourceAnchor[] }
  | { kind: "send-event"; machineId: string; rowId: string }
  | { kind: "follow-emission"; machineId: string; rowId: string }
  | { kind: "propose-source-edit"; intent: SourceEditIntent; enabled: false };

type CardSection = {
  sectionId: string;
  kind:
    | "accepted-events"
    | "reducer-decisions"
    | "effects"
    | "routed-emissions"
    | "global-behavior"
    | "diagnostics"
    | "unknown";
  title: string;
  rows: readonly GraphWorkbenchRow[];
};

type WorkbenchCardModel = {
  cardId: string;
  origin: CardOrigin;
  title: string;
  badges: readonly GraphWorkbenchBadge[];
  sections: readonly CardSection[];
  actions: readonly CardAction[];
  editable: EditableSupport;
};
```

`propose-source-edit` в Stage 12 является reserved disabled action. UI может
вообще не показывать ее, но card/action model обязан сохранять место для этой
capability. Это нужно, чтобы будущий codegen подключался как planner, а не как
мутация JSX-компонента или IR.

Reserved codegen types:

```ts
type SourceEditIntent =
  | { kind: "add-machine"; template: "domain" | "actorTemplate"; machineIdHint?: string }
  | { kind: "add-state"; machineId: string; stateKey: string }
  | { kind: "add-transition"; machineId: string; sourceStateId: string; eventType: string; targetStateKey: string }
  | { kind: "change-transition-target"; machineId: string; transitionId: string; targetStateKey: string }
  | { kind: "add-effect-emission"; machineId: string; sourceStateId: string; eventType: string }
  | { kind: "rename-state"; machineId: string; stateId: string; nextKey: string };

type TextEdit = {
  range: SourceLocation;
  expectedText?: string;
  replacement: string;
};

type SourcePatchPlan = {
  sourceVersion: number;
  sourceHash: string;
  edits: readonly TextEdit[];
  expectedGraphChange: GraphChangeExpectation;
  diagnostics: readonly CodegenDiagnostic[];
};

type CodegenState = {
  status: "idle" | "not-implemented" | "previewing" | "blocked";
  lastIntent?: SourceEditIntent;
  diagnostics: readonly WorkbenchDiagnosticRef[];
};

type CodegenPlanner = {
  plan(input: CodegenPlanRequest): Promise<SourcePatchPlan>;
};
```

В Stage 12 `CodegenPlanner` реализуется как no-op boundary, который возвращает
controlled diagnostic `codegen-not-implemented` и не создает `TextEdit`.
`SourcePatchPlan`, `GraphChangeExpectation`, `CodegenDiagnostic` и related
request/result-типы остаются internal app types, не public API
`@lite-fsm/graph`.

Reserved canvas types:

```ts
type CanvasItemOrigin =
  | { kind: "card"; cardId: string; cardOrigin: CardOrigin }
  | { kind: "diagnostic"; diagnosticId: string }
  | { kind: "draft"; draftId: string; intent: SourceEditIntent };

type CanvasAdapter = {
  kind: "none";
};

type CanvasState = {
  adapter: CanvasAdapter;
  items: readonly CanvasItemOrigin[];
};
```

Stage 12 не строит `CanvasLayout`, координаты, edges, drag handles или renderer
props. Future canvas adapter должен потреблять `WorkbenchCardModel` и
`CanvasItemOrigin`, а не raw IR.

### Host, validation и diagnostics providers

Host capabilities должны иметь concrete adapter boundary:

```ts
type VisualizerHostAdapter = {
  getCapabilities(): VisualizerHostCapabilities;
  readFile?(path: string): Promise<SourceSession>;
  previewPatch?(plan: SourcePatchPlan): Promise<PatchPreviewResult>;
  applyPatch?(plan: SourcePatchPlan): Promise<ApplyPatchResult>;
};
```

Stage 12 использует static host adapter: `mode: "static"`, без чтения файлов и
без patch apply. UI и graph packages не импортируют `node:fs`.

Diagnostics приходят через единый normalized contract:

```ts
type WorkbenchDiagnosticOrigin =
  | "compiler"
  | "analyzer"
  | "source"
  | "view-model"
  | "simulator"
  | "validation"
  | "eslint"
  | "codegen"
  | "host"
  | "layout";

type DiagnosticProvider = {
  id: string;
  origin: WorkbenchDiagnosticOrigin;
  run(input: DiagnosticProviderInput): Promise<readonly WorkbenchDiagnosticRef[]>;
};
```

Analyzer diagnostics продолжают строиться через `analyzeLiteFsmGraph`. Future
custom eslint rules должны подключаться как `DiagnosticProvider`: visualizer
принимает их normalized diagnostics и показывает в общей console/panel, source
markers и graph badges при наличии anchors. В Stage 12 provider registry может
содержать только no-op/future slots; отдельное окно diagnostics не требуется.

### Workbench commands и async lifecycle

User-facing commands описаны ниже. Дополнительно workbench должен иметь
internal response commands для async effects:

```ts
type VisualizerInternalCommand =
  | { type: "compile.succeeded"; requestId: string; sourceVersion: number; document: LiteFsmGraphDocument }
  | { type: "compile.failed"; requestId: string; sourceVersion: number; diagnostics: readonly WorkbenchDiagnosticRef[] }
  | { type: "analysis.succeeded"; requestId: string; sourceVersion: number; diagnostics: readonly WorkbenchDiagnosticRef[] }
  | { type: "model.succeeded"; requestId: string; sourceVersion: number; model: GraphVisualizerModel }
  | { type: "model.failed"; requestId: string; sourceVersion: number; diagnostics: readonly WorkbenchDiagnosticRef[] }
  | { type: "validation.succeeded"; requestId: string; sourceVersion: number; diagnostics: readonly WorkbenchDiagnosticRef[] }
  | { type: "simulation.snapshot.changed"; sourceVersion: number; snapshot?: GraphSimulationSnapshot };
```

Reducer/command layer применяет response только если `sourceVersion ===
state.source.version` и `requestId` является последним ожидаемым request-ом
соответствующего канала. Stale responses не мутируют compile/model/simulation
state; они могут попасть только в debug console entry.

Асинхронные side effects описываются typed descriptors. Reducer и command
handlers не создают `Promise`, не вызывают clients/services и не держат ссылки
на concrete implementations. Они возвращают deterministic list descriptors;
app-level effect runner исполняет descriptors через `services/`, `host`,
`codegen` и `validation`, затем dispatch-ит `VisualizerInternalCommand`.

```ts
type WorkbenchEffectDescriptor =
  | { kind: "compile"; requestId: string; source: SourceSession }
  | { kind: "analyze"; requestId: string; sourceVersion: number; document: LiteFsmGraphDocument }
  | {
      kind: "build-model";
      requestId: string;
      sourceVersion: number;
      document: LiteFsmGraphDocument;
      analysisDiagnostics: readonly GraphDiagnostic[];
      simulation?: GraphVisualizerSimulationOverlayInput;
    }
  | {
      kind: "run-validation";
      requestId: string;
      sourceVersion: number;
      document?: LiteFsmGraphDocument;
      model?: GraphVisualizerModel;
    }
  | {
      kind: "create-simulation-session";
      sourceVersion: number;
      document: LiteFsmGraphDocument;
      scope: GraphSimulationScope;
      simulatorOptions?: GraphSimulationSessionOptions;
      initialStateOverrides?: readonly GraphInitialStateOverride[];
      initialContextOverrides?: readonly GraphInitialContextOverride[];
    }
  | { kind: "simulation.send"; sourceVersion: number; event: GraphSimulationEvent }
  | { kind: "simulation.send-from-transition"; sourceVersion: number; target: VisualizerWorkbenchRowCommandTarget; payload?: GraphJsonValue }
  | { kind: "simulation.send-from-emission"; sourceVersion: number; target: VisualizerWorkbenchRowCommandTarget; payload?: GraphJsonValue }
  | {
      kind: "simulation.reset";
      sourceVersion: number;
      initialStateOverrides?: readonly GraphInitialStateOverride[];
      initialContextOverrides?: readonly GraphInitialContextOverride[];
    }
  | { kind: "codegen.plan"; requestId: string; sourceVersion: number; sourceHash: string; intent: SourceEditIntent };

type WorkbenchCommandOutput = {
  result: VisualizerCommandResult;
  effects: readonly WorkbenchEffectDescriptor[];
};
```

Правила descriptors:

1. Descriptor содержит только serializable command data, domain refs,
   `requestId`, `sourceVersion` и `sourceHash`; closures, service instances,
   React nodes, DOM refs и component props запрещены.
2. Effect runner является единственным местом, где descriptor превращается в
   вызов `GraphCompilerClient`, `GraphAnalyzerClient`,
   `GraphVisualizerModelClient`, `GraphSimulationService`, `CodegenPlanner`,
   `DiagnosticProvider` или `VisualizerHostAdapter`.
3. Cancellation/latest-wins policy дублируется: runner может abort-ить старые
   descriptors, но reducer все равно проверяет `requestId` и `sourceVersion` у
   каждого internal response.
4. Pure tests проверяют не только mutation результата команды, но и точный
   набор emitted descriptors. UI/e2e tests проверяют, что пользовательский flow
   проходит через effect runner, а не через service calls из React components.

### React binding и referential stability

React integration не должна зависеть от ad hoc сравнения ссылок, списков id или
глубоких equality-функций внутри компонентов. Между headless `workbench/` и
React должен быть один централизованный binding layer.

Обязательный contract:

```ts
type WorkbenchRevisionIndex = {
  source: number;
  compile: number;
  analysis: number;
  model: number;
  validation: number;
  l1: number;
  l2: number;
  l3: number;
  simulation: number;
  diagnostics: number;
  console: number;
  panels: number;
  codegen: number;
};

type WorkbenchSnapshot = {
  state: VisualizerWorkbenchState;
  revisions: WorkbenchRevisionIndex;
};

type WorkbenchStore = {
  getSnapshot(): WorkbenchSnapshot;
  subscribe(listener: () => void): () => void;
  dispatch(command: VisualizerCommand | VisualizerInternalCommand): WorkbenchCommandOutput;
};

type WorkbenchSelector<T> = (snapshot: WorkbenchSnapshot) => T;
```

React components читают state только через `useWorkbenchSelector(selector)`.
Компоненты не получают весь `VisualizerWorkbenchState` через context и не
строят собственные derived arrays/maps из raw model. Если компоненту нужен
новый derived view state, он добавляется как named selector в feature/workbench
слой и покрывается unit-тестом.

Правила structural sharing:

1. Reducer возвращает прежний `VisualizerWorkbenchState` object для no-op
   command или stale response.
2. Reducer сохраняет ссылку на каждый top-level slice (`source`, `compile`,
   `analysis`, `model`, `validation`, `l1`, `l2`, `l3`, `simulation`,
   `diagnostics`, `console`, `panels`, `codegen`), если этот slice
   семантически не изменился.
3. Изменение одного slice увеличивает только его revision и revisions зависимых
   selectors; unrelated slices сохраняют прежние references.
4. Arrays/maps внутри state и selector outputs пересоздаются только при
   изменении содержимого. Пустые массивы/объекты должны использовать shared
   constants.
5. `GraphVisualizerModel` и `GraphMachineWorkbenchModel` считаются immutable
   values. App не мутирует их и не пересобирает derived summaries в React.
6. Simulation overlay rebuild запускается только при изменении
   `model`, `simulation.snapshot`, `simulation.inspectedStepId`,
   `simulation.recentlyFiredRowIds` или selected machines. Hover, active tab,
   console selection и source overlay не должны пересобирать model overlay.
7. Source edit invalidates compile/analysis/model/simulation/diagnostics
   производные slices один раз через reducer, а не через цепочку React effects.

Правила selector layer:

1. Selectors являются единственным местом, где соединяются
   `GraphVisualizerModel`, UI state, simulation snapshot и diagnostics.
2. Selectors memoize output по входным slice references и revision numbers.
   Если входы не изменились, selector обязан вернуть тот же output reference.
3. Selector может использовать `Object.is` по умолчанию и один shared
   `shallowEqualObject` helper для плоских props objects. Deep equality,
   JSON stringify comparison и локальные equality helpers в компонентах
   запрещены.
4. Feature selectors возвращают render-ready props: компоненты не фильтруют
   большие списки, не создают maps по ids и не резолвят row/slice bindings в
   render path.
5. Selector output не должен включать fresh inline callbacks. Commands
   dispatch-ятся через stable action helpers из React binding layer.

Правила React layer:

1. React binding использует `useSyncExternalStore` или эквивалентный stable
   subscription mechanism.
2. Context содержит только store instance и stable dispatch helpers, а не весь
   mutable app state.
3. `useEffect` в компонентах не запускает compile/analyze/model/simulation по
   изменению derived object references. Async effects запускает app effect
   runner на основании command/effect descriptors.
4. Компонентные `useMemo`/`useCallback` допустимы только для UI-local cheap
   formatting и DOM handlers; они не являются механизмом корректности state
   identity.
5. React keys строятся из domain ids (`machineId`, `eventType`, `rowId`,
   `diagnosticId`, `stepId`) или stable adapter ids из selector output. Keys не
   участвуют в domain state и не используются selectors как source of truth.

Проверка referential stability:

1. No-op command возвращает тот же state reference и тот же snapshot reference.
2. Stale async response не меняет state/slice references и не вызывает
   subscription notification.
3. `l1.machine.selected` не меняет `model`, `topics`, `workbenchMachines`,
   `l2`, `simulation` и codegen/canvas refs.
4. `l2.topic.selected` не пересобирает L1 machine/topic lists.
5. `l3.timeline.step.selected` меняет только inspect-related selectors и не
   пересоздает source/model/diagnostics refs.
6. `panel.console.toggled` не пересобирает L1/L2/L3 selector outputs.
7. Source edit один раз инвалидирует derived slices и очищает simulation без
   render/effect loop.
8. Hook-level smoke test проверяет, что repeated identical selector output не
   вызывает повторный render subscribed component-а.

### Приложение

Путь:

```txt
apps/visualizer
```

Имя пакета:

```txt
@lite-fsm/visualizer
```

Технологии:

1. Vite SPA.
2. React.
3. TypeScript.
4. Tailwind CSS v4.
5. shadcn/ui для стандартных контролов, где это уменьшает код.
6. `lucide-react` для UI-иконок.
7. CodeMirror 6 для редактора исходника.

React Flow, ELK и любые concrete canvas/render-layout dependencies не входят в
MVP; L1/L2/L3 строятся как вкладки и карточные представления без canvas-графа.
`canvas/` в Stage 12 - только reserved no-op boundary для будущего.

Скрипты пакета:

```json
{
  "dev": "...",
  "build": "...",
  "check-types": "...",
  "test:unit": "...",
  "test:coverage": "...",
  "test:e2e": "..."
}
```

Скрипты visualizer не запускают docs build или `next build` в `apps/docs`.
`test:coverage` является strict gate: для всей pure logic этапа 12 и всех
модулей, которые строят, адаптируют или мапят workbench model, thresholds
`statements`, `branches`, `functions` и `lines` должны быть ровно `100%`.
Исключать pure modules из coverage запрещено без явной правки этой
спецификации.

Тестовый контракт этапа 12 является обязательной частью Definition of Done:

1. Каждый подэтап `12a`, `12b`, `12b-shadcn-foundation` и `12c`-`12f`
   закрывается только вместе с тестами для всех
   добавленных или измененных behavior paths. Реализация без тестов считается
   незавершенной, даже если UI визуально работает.
2. Pure logic покрывается unit-тестами и strict `test:coverage` в том же
   подэтапе, где эта logic появилась. Перенос покрытия на следующий подэтап
   запрещен.
3. Любое пользовательски видимое UI-поведение, появившееся в подэтапе, должно
   иметь Playwright e2e-сценарий в этом же подэтапе. Это включает happy path,
   empty/loading/error/diagnostic states, keyboard/focus/close behavior,
   long-label/responsive cases и disabled/no-op affordances, если они стали
   частью UI.
4. E2E-покрытие не заменяет unit-тесты для reducers/selectors/adapters, а
   unit-тесты не заменяют e2e для UI. Нужны оба уровня там, где есть и pure
   logic, и интерфейс.
5. `12f` не является местом, куда откладывается покрытие UI предыдущих
   подэтапов. Он добавляет regression matrix и стабилизационные сценарии поверх
   уже существующих e2e tests.
6. Запрещены `skip`, `todo`, `only` и фиктивные assertions для требований,
   входящих в завершенный подэтап. Если кейс временно невозможен, подэтап не
   считается закрытым.

### Сессия исходника

```ts
type SourceSession = {
  source: string;
  filePath?: string;
  filename?: string;
  language: "ts" | "tsx" | "js" | "jsx";
  version: number;
  hash: string;
};
```

К `sourceVersion` привязаны compile/analyze results, visualizer model,
diagnostic refs, manual simulation state, source overlay fragments и console
entries. При изменении source активная simulation очищается; ответы старой
версии не применяются.

### Асинхронные клиенты и сервисы

Даже локальная реализация вызывается через Promise-клиенты:

```ts
type GraphCompilerClient = {
  compile(input: CompileRequest): Promise<CompileResponse>;
};

type GraphAnalyzerClient = {
  analyze(input: AnalyzeRequest): Promise<AnalyzeResponse>;
};

type GraphVisualizerModelClient = {
  build(input: BuildVisualizerModelRequest): Promise<BuildVisualizerModelResponse>;
};

type GraphSimulationService = {
  createSession(input: CreateSimulationSessionRequest): GraphSimulationSession;
};

type GraphSimulationSessionOptions = Omit<
  CreateGraphSimulatorOptions,
  "scope" | "initialStateOverrides" | "initialContextOverrides"
>;

type CreateSimulationSessionRequest = {
  document: LiteFsmGraphDocument;
  sourceVersion: number;
  scope: GraphSimulationScope;
  simulatorOptions?: GraphSimulationSessionOptions;
  initialStateOverrides?: readonly GraphInitialStateOverride[];
  initialContextOverrides?: readonly GraphInitialContextOverride[];
};

type GraphSimulationSession = {
  readonly sourceVersion: number;
  readonly scope: GraphSimulationScope;
  start(): GraphSimulatorStartResult;
  reset(input?: GraphSimulatorResetInput): GraphSimulatorStartResult;
  getSnapshot(): GraphSimulationSnapshot | undefined;
  getAvailableTransitions(input?: GraphAvailableTransitionsInput): readonly GraphAvailableTransition[];
  getSuggestedEmissions(input?: GraphSuggestedEmissionsInput): readonly GraphSuggestedEmission[];
  send(input: GraphSendInput): GraphSendResult;
  sendFromTransition(input: GraphSendFromTransitionInput): GraphSendResult;
  sendFromEmission(input: GraphSendFromEmissionInput): GraphSendResult;
  choose(input: GraphChooseInput): GraphSendResult;
  dispose(): void;
};

type AsyncRequestMeta = {
  requestId: string;
  sourceVersion: number;
  signal?: AbortSignal;
};

type VisualizerHostCapabilities = {
  mode: "static" | "local";
  canReadFiles: boolean;
  canWriteFiles: boolean;
  canApplyPatch: boolean;
  projectRoot?: string;
};

type VisualizerHostState = {
  capabilities: VisualizerHostCapabilities;
};
```

UI применяет только последний ответ для текущего `source.version`.
`GraphSimulationService` принадлежит app/service слою `apps/visualizer`:
создает `createGraphSimulator(document, { ...simulatorOptions, scope,
initialStateOverrides, initialContextOverrides })`, проверяет `sourceVersion` и
lifecycle, но не реализует acceptance, routing, branch selection, evaluation
или timeline. `simulatorOptions` - pass-through boundary для policies и будущих
`actorMode`/`effectMode`; React-компоненты их не формируют напрямую.
`@lite-fsm/graph/view-model` от сервиса не зависит.

### Состояние приложения

```ts
type VisualizerWorkbenchState = {
  host: VisualizerHostState;
  source: SourceSession;
  compile: CompileState;
  analysis: AnalysisState;
  model: ViewModelState;
  validation: ValidationState;
  activeTab: "source" | "system" | "events" | "machines";
  panels: VisualizerPanelState;
  l1: SystemViewState;
  l2: EventCatalogViewState;
  l3: MachineWorkbenchViewState;
  simulation: VisualizerSimulationState;
  diagnostics: WorkbenchDiagnosticRef[];
  console: ConsoleState;
  codegen: CodegenState;
};
```

Panel/window state остается app state и не попадает в `@lite-fsm/graph` или
`GraphVisualizerModel`:

```ts
type VisualizerPanelState = {
  sourceOverlay?: SourceOverlayState;
  console: {
    open: boolean;
    selectedEntryId?: string;
  };
};

type ValidationState = {
  status: "idle" | "running" | "ready" | "blocked";
  providers: readonly string[];
  diagnostics: readonly WorkbenchDiagnosticRef[];
};
```

Stage 12 использует общую console/panel для diagnostics. Новые окна и консоли
добавляются расширением `VisualizerPanelState` и `ConsoleState`, а не новым
форматом diagnostics.

Команды:

```ts
type VisualizerWorkbenchRowCommandTarget = {
  machineId: string;
  rowId: string;
  slice: GraphSimulationSliceRef;
};

type VisualizerCommand =
  | { type: "source.changed"; source: string }
  | { type: "source.reset-to-sample" }
  | { type: "source.open-visualizer" }
  | { type: "tab.selected"; tab: VisualizerWorkbenchState["activeTab"] }
  | { type: "l1.machine.selected"; machineId: string }
  | { type: "l1.topic.selected"; eventType: string }
  | { type: "l2.topic.selected"; eventType: string }
  | { type: "l3.machine.toggled"; machineId: string }
  | { type: "l3.selection.cleared" }
  | { type: "l3.event.sent"; event: GraphSimulationEvent }
  | { type: "l3.transition-row.sent"; target: VisualizerWorkbenchRowCommandTarget; payload?: GraphJsonValue }
  | { type: "l3.effect-row.followed"; target: VisualizerWorkbenchRowCommandTarget; payload?: GraphJsonValue }
  | {
      type: "l3.simulation.reset";
      initialStateOverrides?: readonly GraphInitialStateOverride[];
      initialContextOverrides?: readonly GraphInitialContextOverride[];
    }
  | { type: "l3.timeline.step.selected"; stepId: string }
  | { type: "source.overlay.opened"; machineId: string }
  | { type: "source.overlay.closed" }
  | { type: "panel.console.toggled"; open?: boolean }
  | { type: "console.entry.selected"; entryId: string }
  | { type: "codegen.intent.created"; intent: SourceEditIntent };
```

Command handlers возвращают `WorkbenchCommandOutput`: controlled `result` и
typed `effects`. Они не бросают exceptions для ожидаемых ошибок
compiler/model/simulator:

```ts
type VisualizerCommandResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "stale-source-version"
        | "missing-document"
        | "missing-model"
        | "missing-simulation-session"
        | "ambiguous-row-slice"
        | "simulator-rejected"
        | "codegen-not-implemented";
      diagnostics: readonly WorkbenchDiagnosticRef[];
    };
```

Правила:

1. Simulator failures (`choice-required`, `stale-choice`,
   `evaluation-blocked`, validation diagnostics) попадают в
   `VisualizerSimulationState.pendingChoice`/`status` и
   `diagnostics` с origin `"simulator"`.
2. Stale async responses или commands для старого `sourceVersion` возвращают
   `stale-source-version` и не мутируют текущую session.
3. Если row command не резолвится в единственный active slice, app возвращает
   `ambiguous-row-slice` и не вызывает `GraphSimulationSession`.
4. Selectors являются единственным местом, где app соединяет sourceVersion,
   view-model rows, simulator snapshot, overlay flags и UI state для React.
5. MVP не реализует branch-picker UI для `pendingChoice`. `choice-required`
   переводит simulation в `blocked`, показывает diagnostic и не мутирует
   snapshot; `choose(...)` остается частью service boundary для будущего UI и
   для unit-тестов command layer.
6. `codegen.intent.created` в Stage 12 вызывает только no-op planner, возвращает
   `codegen-not-implemented`, пишет diagnostic origin `"codegen"` и не меняет
   `SourceSession.source`.

### Диагностики приложения

```ts
type WorkbenchDiagnosticNavigationTarget =
  | { kind: "source"; anchor: GraphSourceAnchor }
  | { kind: "graph"; ref: GraphItemRef }
  | { kind: "console" }
  | { kind: "none"; reason: "no-anchor" | "ambiguous-anchor" };

type WorkbenchDiagnosticRef = {
  diagnosticId: string;
  sourceVersion: number;
  origin:
    | "compiler"
    | "analyzer"
    | "source"
    | "view-model"
    | "simulator"
    | "validation"
    | "eslint"
    | "codegen"
    | "host"
    | "layout";
  diagnostic: GraphDiagnostic;
  graphItemRef?: GraphItemRef;
  sourceAnchors: readonly GraphSourceAnchor[];
  primaryTarget: WorkbenchDiagnosticNavigationTarget;
};
```

Compiler error может блокировать L1/L2/L3, если document нельзя показать.
Analyzer diagnostics не блокируют просмотр и ручную симуляцию.
Validation/eslint/codegen/host origins являются extension-ready каналами; в
Stage 12 они могут появляться только из no-op/reserved providers или controlled
app diagnostics. Отдельное diagnostics window не требуется: все entries идут в
общую console/panel.

Diagnostic normalization сохраняет все известные source anchors, а не только
первый. `primaryTarget` выбирается в `diagnostics/` один раз и используется
console/panel/source overlay для navigation. React components не выбирают
fallback anchor самостоятельно: если provider не дал надежного source/graph
binding, `sourceAnchors` остается пустым, а `primaryTarget.kind` равен `"none"`.

### Каркас интерфейса

Постоянные вкладки:

```txt
Source | System | Events | Machines
```

Счетчики:

- `System`: количество машин.
- `Events`: количество топиков.
- `Machines`: выбранные машины / все машины.

Стартовый экран - `Source` с примером. После успешного `Open visualizer`
активируется `System`.

### Вкладка исходника

Содержимое: большой monospace-редактор, действия `Open visualizer` и
`reset to sample`, короткая подсказка о input contract и сводка диагностик.

Пример должен компилироваться без непреднамеренных analyzer warnings. Если
пример намеренно показывает diagnostic, UI должен это явно отражать.

### L1: системный инвентарь

Раскладка: три колонки - машины, топики событий, детали выбора.

Строка машины показывает kind, `groupTag`, `machineId`, количество состояний,
consumed/produced topics и маркер диагностик. Строка топика показывает
`eventType`, количество producers/consumers и маркер диагностик.

Поведение:

1. Поиск и фильтр машин.
2. Поиск и фильтр топиков.
3. Наведение или выбор машины подсвечивает связанные топики.
4. Наведение или выбор топика подсвечивает связанные машины.
5. Детали машины показывают потребляемые и производимые топики и действия
   `open in workbench`, `view source`.
6. Детали топика показывают производителей, потребителей и действие
   `open in event catalog`.
7. Постоянные ребра между колонками не рисуются.

### L2: каталог событий

Раскладка: две колонки - список событий и детали топика.

Детали топика показывают:

1. `eventType`.
2. Количество производителей.
3. Количество потребителей.
4. Виды и значения маршрутизации из `GraphTopicSummary.routingKinds` и
   `GraphTopicSummary.routingValues`.
5. Секцию производителей.
6. Секцию потребителей.

Строка производителя показывает машину, исходное состояние, routing,
`guard/when`, `confidence` и действие перехода к source. Строка потребителя
показывает машину, исходное состояние, цель или набор целей, количество веток,
guard-метки `reducer`, `confidence` и действие перехода к source.

Пустые состояния обязательны для топиков без производителей или потребителей.

### L3: рабочая область машин

Раскладка: три колонки - выбор машин, карточки машин, timeline символьной
симуляции.

Выбор машин: переключатель для каждой машины, действие `clear`; изменение
выбранного набора очищает ручную симуляцию.

Карточка машины показывает kind, `groupTag`, `machineId`, текущее состояние,
кнопку source, state blocks, строки `config`/`effect` и diagnostics. Блок state
показывает `stateKey`, значки `initial`/`spawn`/`terminal`/`wildcard`,
индикатор current state и collapse для длинных нетекущих blocks.

Строки:

1. Transition rows (`config` и `reducer`) текущего состояния кликабельны, если
   row имеет capability `send-event` и simulator считает branch available.
2. Строки `effect` текущего состояния кликабельны только если simulator вернул
   emission из `getSuggestedEmissions()`; initial-state effects после
   `start/reset` остаются read-only до committed входа в state.
3. Нетекущие строки доступны только для чтения.
4. Недавно сработавшие строки подсвечиваются.
5. Выбор шага timeline подсвечивает точные сработавшие строки.

Строка отправки события:

1. Выпадающий список всех типов событий.
2. Группа `available now` идет перед `not accepted`.
3. `send` отправляет внешнее событие. Для default branch policy external send
   не требует branch picker: ambiguous consumers выбираются simulator-ом как
   non-origin по стабильному порядку IR.

Шаг timeline показывает index, `eventType`, source (`external`, manual cfg,
manual eff), accepted machines, empty state для непринятого события и `rowId`
для inspect.

### Ручная отправка события

Ручная симуляция - UI/session state поверх `@lite-fsm/graph/simulator`.
Приложение не реализует transition acceptance, routing, branch selection,
effect-follow или timeline commit logic. Все dispatch-операции идут через
текущую `GraphSimulationSession`, которая делегирует правила `GraphSimulator`.

```ts
type VisualizerSimulationState = {
  status: "idle" | "running" | "blocked";
  scope: GraphSimulationScope;
  selectedMachineIds: readonly string[];
  initialStateOverrides?: readonly GraphInitialStateOverride[];
  initialContextOverrides?: readonly GraphInitialContextOverride[];
  snapshot?: GraphSimulationSnapshot;
  pendingChoice?: GraphSimulationPendingChoice;
  inspectedStepId?: string;
  recentlyFiredRowIds: readonly string[];
};
```

Правила:

1. Одно действие пользователя равно одной отправке события.
2. `effects` не запускаются автоматически при входе в состояние.
3. Изменение selected machines уничтожает текущую session, обновляет `scope`,
   создает новую `GraphSimulationSession` и очищает snapshot/timeline. В MVP
   picker формирует `{ kind: "machines", machineIds }`; будущий exact actor
   mode может добавить slice-aware scope без изменения service boundary.
4. Строка отправки события берет полный список event types из
   `GraphVisualizerModel.topics`, а группу `available now` строит из
   `GraphSimulationSession.getAvailableTransitions()`.
5. Клик по текущей transition row (`GraphConfigRow` или `GraphReducerRow`) идет
   через app adapter: `machineId`/`rowId` резолвятся в row view-model,
   `target.slice` передается в `sendFromTransition(...)` как origin slice, а
   `row.transitionId` - как explicit выбранная ветка. Simulator отправляет
   событие всем selected/routed accepting slices.
6. Исходный slice, по строке которого был клик, использует выбранную ветку.
   Остальные потребители используют branch policy simulator-а.
7. Клик по текущей `effect` row разрешен только при
   `simulation.suggested === true`/`dispatchability === "can-dispatch"` и идет
   через тот же adapter: `machineId`/`rowId` резолвятся в row view-model,
   `target.slice` передается в `sendFromEmission(...)`. Routing emission-а
   берется из IR и не переопределяется приложением.
8. Доменные машины, actor template approximation, routing и empty-consumption
   steps обрабатываются simulator-ом.
9. Timeline UI читает `snapshot.timeline.linearStepIds` и steps из
   `snapshot.timeline.stepsById`.
10. Выбор шага timeline является UI-состоянием `inspectedStepId`; он не вызывает
    checkout/fork simulator state и не мутирует snapshot.
11. Recently fired и inspected rows строятся маппингом
    `GraphSimulationTimelineStep.rowRefs` на view-model row ids.
12. `reset` вызывает `GraphSimulationSession.reset(...)` для текущего scope и
    очищает `inspectedStepId`.
13. Редактирование исходника или повторная компиляция уничтожает текущую
    simulator session и очищает snapshot/timeline.
14. `machineId`/`rowId` в row-level командах идентифицируют только
    UI/projection row. Origin simulator-а всегда `GraphSimulationSliceRef`.
    Если adapter не связывает row с активным slice однозначно, команда
    отклоняется diagnostic-ом приложения.
15. MVP может не иметь UI-редактора payload/context, но command/service
    contracts уже принимают `GraphSimulationEvent.payload`,
    `GraphSimulationEvent.meta` для external `send(...)` и initial state/context
    overrides.

### Окно исходника

Окно открывается из L1 и L3. Содержимое: заголовок машины, фрагмент source по
`GraphSourceAnchor`, fallback message для недоступного диапазона. Закрытие:
кнопка, backdrop click, Escape.

Правила выбора anchor:

1. Предпочитать `GraphSourceAnchor.kind === "machine"` с `loc`.
2. Если machine anchor недоступен, использовать первый anchor с `loc` в порядке
   `initial-state`, `initial-context`, `config-transition`, `reducer-branch`,
   `effect-emission`.
3. Если ни одного `loc` нет, overlay открывается с fallback message и diagnostic
   origin `"view-model"`.
4. Overlay fragment привязан к `sourceVersion`; при изменении source или
   повторной компиляции открытый overlay закрывается, stale fragment не
   переиспользуется.

### Unit coverage этапа 12

Pure logic этапа 12 должна быть вынесена из React components в тестируемые
модули: command handlers, state reducers, selectors, sourceVersion guards,
effect descriptor emission, internal async response guards, host capability
mapping, row-command adapters, source overlay anchor selection, diagnostics
normalization, diagnostic provider normalization, console/channel mapping,
store subscription, structural sharing, selector memoization/referential
stability, no-op codegen planner, card model builders, reserved canvas no-op
adapter, simulation overlay mapping, timeline inspect/reset mapping и
построение L3/workbench-facing view state. Эти модули обязаны иметь unit-тесты
со strict `100%` coverage по statements/branches/functions/lines.

React components покрываются smoke/e2e и не должны содержать непокрытую business
logic. Если логика нужна компоненту, она сначала выносится в pure module и
попадает под `test:coverage`.

### E2E coverage этапа 12

Playwright e2e tests являются обязательным gate для каждого UI-подэтапа.
Каждый новый пользовательский flow должен иметь сценарий с прямыми assertions
на видимый результат и на недопустимые побочные эффекты, если они описаны в
составе подэтапа.

Минимальная e2e matrix этапа 12:

1. `12a`: app shell, tabs, empty panels, общая console/panel, отсутствие docs
   build в web server command.
2. `12b`: visual style fixture, tokens/states visibility, focus-visible,
   representative badges/console/card, long-label wrapping и responsive floor.
3. `12b-shadcn-foundation`: shadcn/Tailwind foundation, базовый UI kit,
   визуальная доводка fixture до уровня demo reference, исправление
   layout/overflow/focus/accessibility дефектов, desktop/mobile screenshot QA.
4. `12c`: Source editor, `Open visualizer`, controlled diagnostics, reset to
   sample, source edit invalidation и console channel visibility.
5. `12d`: все L1/L2 user flows из проверки подэтапа, включая search/filter,
   hover/selection highlight, source overlay, diagnostics anchors, L1 -> L2
   navigation, dynamic/unknown rows и branch/routing display.
6. `12e`: все L3/simulation user flows из проверки подэтапа, включая open from
   L1/L2, external send, transition/effect rows, routing approximation,
   timeline inspect, reset, source edit invalidation, simulator error states и
   disabled/no-op source edit affordance.
7. `12f`: regression matrix для полного пути `source -> L1 -> L2 -> L3 ->
   simulation -> diagnostics/source overlay`, а также empty/error/long-label/
   responsive cases, которые стабилизируют MVP.

Если UI behavior трудно проверить через production fixture, подэтап должен
добавить controlled e2e fixture или mock service boundary в `apps/visualizer`
test setup. Fixture не должен обходить public UI flow, который пользователь
реально выполняет.

### Порядок реализации этапа 12

Этап 12 реализуется как семь законченных подэтапов. Каждый подэтап должен
оставлять приложение в проверяемом состоянии и не должен требовать знания
будущего подэтапа для понимания сделанных изменений. Нельзя смешивать
архитектурный foundation, visual direction, source pipeline, read-only views и
simulation UI в одном начальном изменении.

План реализации должен всегда начинаться с короткого чеклиста вида:

```txt
12a architecture foundation: pending
12b visual direction and apps/visualizer/DESIGN.md: pending
12b-shadcn-foundation UI kit and visual polish: pending
12c source pipeline and console: pending
12d L1/L2 read-only views: pending
12e L3 cards and simulation: pending
12f stabilization: pending
```

Во время работы агент обновляет статус подэтапов по мере выполнения. Если
приходится временно добавить заглушку для следующего подэтапа, она должна быть
минимальной, явно тестируемой и не должна имитировать завершенную логику.

### Этап 12a: архитектурный фундамент

Состав:

1. Создать `apps/visualizer`.
2. Настроить Vite, React, TypeScript и styling.
3. Добавить скрипты `dev`, `build`, `check-types`, `test:unit`,
   `test:coverage`, `test:e2e`.
4. Добавить подключение workspace/turbo.
5. Создать внутреннюю структуру `app/`, `workbench/`, `source/`, `services/`,
   `diagnostics/`, `console/`, `codegen/`, `validation/`, `cards/`,
   `canvas/`, `features/`, `ui/`.
6. Реализовать базовые public/internal app types: `SourceSession`,
   `WorkbenchSnapshot`, `WorkbenchStore`, `VisualizerCommand`,
   `VisualizerInternalCommand`, `WorkbenchEffectDescriptor`,
   `WorkbenchCommandOutput`, `WorkbenchDiagnosticRef`, `ConsoleState`,
   `CodegenState`, `ValidationState`, `CanvasState`.
7. Реализовать deterministic `SourceSession.hash` helper и separation
   `version`/`hash`.
8. Реализовать static host adapter с capabilities без доступа к файловой
   системе и без patch apply.
9. Добавить no-op boundaries для `codegen/`, `validation/` и `canvas/`.
10. Реализовать `WorkbenchStore`, revision counters, centralized subscription и
    `useWorkbenchSelector` binding.
11. Реализовать app-level effect runner skeleton, который принимает
    `WorkbenchEffectDescriptor[]`, вызывает только service/host/provider
    boundaries и возвращает результаты через `VisualizerInternalCommand`.
12. Реализовать structural sharing reducer skeleton: no-op/stale commands не
    меняют state refs и не отправляют subscription notification.
13. Реализовать shared selector helpers и первые empty-state selectors с
    referential stability.
14. Реализовать shell с вкладками и пустыми панелями, включая общую
    console/panel для diagnostics.
15. Не добавлять React Flow, ELK или concrete canvas renderer dependencies.
16. Настроить Playwright e2e-инфраструктуру для `apps/visualizer`:
    `playwright.config`, isolated e2e test directory, web server config на
    visualizer dev/preview command, shared test helpers и fixture loader.
17. Добавить smoke test на Playwright для app shell.
18. E2E-инфраструктура 12a должна быть достаточной, чтобы 12b,
    `12b-shadcn-foundation` и 12c-12f добавляли новые UI/e2e сценарии без
    изменения базовой Playwright-конфигурации.

Проверка:

1. `check-types`.
2. `build`.
3. `test:unit` проходит для всех pure modules, добавленных в 12a.
4. `test:e2e` поднимает только visualizer app через Playwright web server,
   проходит smoke на shell/tabs/empty panels/console и не запускает docs build.
5. Unit-тесты для `SourceSession.hash`, host capabilities, no-op codegen
   planner, no-op validation registry и no-op canvas adapter.
6. Unit-тесты для no-op/stale commands preserving state refs, unrelated slice
   updates preserving refs, selector output memoization и отсутствия
   subscription notification при identical snapshot.
7. Unit-тесты для `WorkbenchEffectDescriptor` emission: команды не запускают
   async clients напрямую, а возвращают ожидаемые descriptors с `requestId`,
   `sourceVersion` и без service/DOM references.
8. Hook-level smoke test: component subscribed through `useWorkbenchSelector`
   не rerender-ится при unchanged selected value.
9. Playwright helpers/fixtures доступны последующим e2e tests без правки
   инфраструктурных файлов.
10. `test:coverage` проходит со `100%` coverage для pure logic подэтапа.

### Этап 12b: visual direction и apps/visualizer/DESIGN.md

Цель: до верстки Source/L1/L2/L3 зафиксировать визуальный язык visualizer-а,
чтобы все последующие UI-этапы строили один цельный инструмент, а не набор
несогласованных панелей. Этот подэтап не реализует graph behavior и не должен
подменять source pipeline или L1/L2/L3.

Состав:

1. Изучить `music-app-mvp-flow.html` как визуальный и поведенческий reference:
   layout rhythm, density, panel hierarchy, list/detail/card grammar,
   timeline, badges, diagnostics, source overlay и interaction states.
2. Создать новый app-local файл `apps/visualizer/DESIGN.md` для visualizer-а.
   Root `DESIGN.md` не использовать и не расширять, чтобы не смешивать design
   specs playground и visualizer.
3. В `apps/visualizer/DESIGN.md` зафиксировать visualizer design direction:
   инструментальный,
   плотный, сканируемый workspace; без landing/hero, маркетинговых секций,
   decorative canvas и generic SaaS hero-композиции.
4. Зафиксировать tokens visualizer-а: цвета поверхностей, text colors,
   semantic colors для `config`/`reducer`/`effect`/`analysis`/`simulation`/
   `diagnostic`, routing/confidence/status badges, spacing scale, radius,
   border, focus, shadow и motion rules.
5. Зафиксировать typography rules: body/mono/display use, sizes для dense
   panels/cards/rows, code/event labels, timeline labels и console entries.
6. Зафиксировать component inventory и visual contracts для:
   app shell, top tabs, Source editor, console/panel, L1 inventory rows,
   L2 topic detail rows, L3 machine cards, state blocks, transition/effect rows,
   timeline, source overlay, empty/loading/error states.
7. Зафиксировать правила для длинных labels: event/state/guard/routing strings
   должны переноситься или обрезаться предсказуемо и не ломать columns/cards.
8. Зафиксировать accessibility и interaction states: focus-visible, keyboard
   navigation для tabs/overlay/console, Escape/backdrop close для overlay,
   contrast for diagnostics/status markers.
9. Перенести выбранные tokens в стартовые visualizer CSS variables/Tailwind
   theme entrypoint без привязки к L1/L2/L3 business logic.
10. Добавить небольшую visual style fixture/shell state, который показывает
    tabs, пустые панели, representative badges, console row и placeholder card,
    чтобы следующие этапы могли сравнивать UI с
    `apps/visualizer/DESIGN.md`.
11. Использовать `lucide-react` для стандартных UI icon affordances; не
    добавлять custom SVG icon system без отдельной причины.
12. Не копировать hardcoded implementation из `music-app-mvp-flow.html`.
    Reference задает направление и поведение, production visualizer строит свои
    tokens/components.
13. После реализации 12b обновить
    [`GRAPH-COMPILER-IMPLEMENTATION-LOG.md`](GRAPH-COMPILER-IMPLEMENTATION-LOG.md):
    состояние, ключевые решения, последний успешный набор проверок и следующий
    этап должны отражать Stage 12b.

Проверка:

1. `apps/visualizer/DESIGN.md` существует как отдельная app-local design spec;
   root `DESIGN.md` не меняется ради visualizer-а.
2. `apps/visualizer/DESIGN.md` описывает tokens, typography, components, states,
   diagnostics/status/routing/confidence markers и responsive floor для
   visualizer-а.
3. `check-types`.
4. `build`.
5. `test:e2e` использует инфраструктуру 12a, открывает visualizer shell/style
   fixture и проверяет все UI primitives, появившиеся в 12b: tabs, focus
   states, representative badges, console row, placeholder card, long-label
   wrapping и responsive floor.
6. `test:coverage` проходит. Если подэтап добавляет pure helpers для tokens,
   fixtures или class mapping, они покрыты unit-тестами со strict `100%`
   coverage.
7. `GRAPH-COMPILER-IMPLEMENTATION-LOG.md` обновлен в той же правке и указывает
   `12b-shadcn-foundation` как следующий подэтап.

### Этап 12b-shadcn-foundation: shadcn/Tailwind UI kit и visual polish

Цель: перед реализацией Source/L1/L2/L3 перевести visualizer на устойчивую
базу Tailwind + shadcn/ui и довести базовый вид shell/style fixture до уровня,
который можно использовать как foundation для следующих UI-подэтапов. Этот
подэтап не реализует graph behavior, source pipeline, L1/L2/L3 data flow или
simulation logic.

Существующий 12b fixture является промежуточным visual direction artifact. Его
нельзя считать достаточным UI foundation: текущий вид должен быть исправлен и
причесан относительно `music-app-mvp-flow.html`, потому что сейчас он выглядит
беднее demo по цвету, менее современно по surface hierarchy, имеет слишком
плоскую/скудную палитру и допускает visual/layout defects на широких и узких
экранах.

Состав:

1. Инициализировать shadcn/ui именно внутри `apps/visualizer`, с app-local
   `components.json`, aliases из visualizer `tsconfig`/Vite и Tailwind v4
   setup. Не переиспользовать `apps/playground/components.json` и не смешивать
   playground UI kit с visualizer.
2. Добавить минимальный shadcn baseline для следующих этапов:
   `button`, `badge`, `tabs`, `input`, `textarea`, `select`, `card`,
   `separator`, `scroll-area`, `tooltip`, `alert`. Если CLI добавляет
   supporting files (`cn`/utils, CSS variables, base components), они должны
   жить внутри `apps/visualizer`.
3. Перенести visualizer tokens из `apps/visualizer/DESIGN.md` в semantic
   Tailwind/shadcn variables. Standard controls используют shadcn variants и
   semantic tokens; graph-specific rows/cards/timeline могут иметь app-specific
   wrappers поверх shadcn primitives.
4. Обновить `apps/visualizer/DESIGN.md`: добавить раздел `UI kit`, где
   зафиксированы shadcn components, allowed variants, component ownership,
   Tailwind token policy, CSS ownership и что остается custom graph-specific
   grammar.
5. Пересобрать 12b style fixture на shadcn primitives:
   - tab strip через shadcn `Tabs`;
   - кнопки через shadcn `Button`;
   - status/layer/type markers через shadcn `Badge`;
   - source/search controls через shadcn `Input`/`Textarea`;
   - panels через один app-level `Panel` wrapper или shadcn `Card` без nested
     cards;
   - alerts/diagnostics через shadcn `Alert`;
   - scrollable panes через `ScrollArea`, если native overflow не дает
     предсказуемый результат.
6. Перевести текущую верстку на Tailwind utilities везде, где это делает код
   проще и ближе к shadcn conventions. Не плодить CSS-файлы и глобальные
   селекторы без необходимости: CSS допускается только для app-level theme
   variables, Tailwind v4/shadcn token bridge, shared low-level primitives,
   действительно повторяемой graph-specific grammar или случаев, которые
   невозможно выразить Tailwind utilities без ухудшения читаемости.
7. Визуально улучшить shell/style fixture, а не только заменить markup:
   - сделать палитру богаче, сохранив restrained dark product UI;
   - усилить hierarchy между app background, topbar, panel headers, rows,
     selected/current states и console/timeline;
   - привести spacing, radius, borders, text contrast и icon sizing к одному
     современному product language;
   - убрать ощущение пустых больших блоков без задачи;
   - сделать fixture ближе к плотности и сканируемости `music-app-mvp-flow.html`,
     но не копировать его CSS/DOM.
8. Исправить visual/layout defects текущего базового вида:
   - не должно быть горизонтального overflow на desktop/mobile;
   - длинные event/state/routing labels не ломают columns/cards;
   - элементы не перекрываются и не клипуются на широком shallow viewport;
   - root/shell/container не выглядят как accidental clickable surface;
   - focus-visible виден на tabs, buttons, chips, source controls и console
     rows;
   - console close/toggle, tab strip и source/action controls сохраняют
     понятные hover/active/disabled states;
   - empty/placeholder content выглядит как рабочий fixture, а не как
     недоделанный dashboard.
9. Добавить app-level UI wrappers только там, где они стабилизируют будущие
   этапы: `Panel`, `PanelHeader`, `StatusBadge`, `LayerBadge`, `GraphRow`,
   `SourceSnippet`/`SourceEditorShell`. Wrappers не должны содержать graph
   business logic и должны оставаться presentational.
10. Не добавлять React Flow, ELK, canvas renderer, chart libraries, command
   palette, dialogs/sheets для source overlay или полноценные L1/L2/L3 flows.
11. Использовать `agent-browser` или Playwright screenshot QA для сравнения с
    `music-app-mvp-flow.html` и проверки фактического visual result. Если
    screenshot показывает, что visualizer все еще заметно хуже demo по
    hierarchy, palette richness, density или polish, подэтап не закрыт.
12. После реализации обновить
    [`GRAPH-COMPILER-IMPLEMENTATION-LOG.md`](GRAPH-COMPILER-IMPLEMENTATION-LOG.md):
    отметить shadcn/Tailwind foundation, visual polish, последний успешный
    набор проверок и следующий этап `12c`.

Проверка:

1. `apps/visualizer/components.json` существует и относится только к
   visualizer.
2. `apps/visualizer/src/ui` или другой configured shadcn UI path содержит
   добавленные baseline components; imports в feature components идут через
   visualizer aliases.
3. `apps/visualizer/DESIGN.md` обновлен разделом `UI kit` и не противоречит
   фактическим shadcn/Tailwind tokens.
4. Style fixture использует shadcn primitives для стандартных controls и
   app-specific wrappers только для graph-domain UI.
5. Верстка fixture и новых presentational wrappers сделана преимущественно
   через Tailwind utilities и shadcn variants. Новые CSS-файлы или расширение
   глобального CSS имеют явное основание: tokens/theme bridge или повторяемая
   graph-specific grammar, которую нельзя чисто выразить через Tailwind.
6. Визуальная проверка desktop и mobile показывает, что базовый интерфейс
   выглядит современнее текущего 12b fixture: более выразительная, но
   restrained palette; ясная hierarchy; аккуратные panels/rows/badges; нет
   пустых недоделанных областей, overflow, clipping или accidental clickable
   containers.
7. `check-types`.
8. `build`.
9. `test:coverage` проходит; если добавлены pure helpers/wrappers with logic,
   они покрыты unit-тестами со strict `100%`.
10. `test:e2e` проверяет shadcn-based fixture: tabs, focus-visible,
   representative badges, console row, source/search controls, placeholder
   card/rows, long-label wrapping, responsive floor и отсутствие horizontal
   overflow.
11. `GRAPH-COMPILER-IMPLEMENTATION-LOG.md` обновлен в той же правке и указывает
    `12c` как следующий подэтап.

### Этап 12c: source pipeline и console

Состав:

1. Реализовать асинхронные клиенты compiler/analyzer/view-model и internal
   async response commands.
2. Реализовать latest-wins обработку ответов по `requestId` и
   `sourceVersion`.
3. Подключить host capabilities и static host adapter к состоянию приложения.
4. Нормализовать diagnostics из compiler/analyzer/view-model/source/host и
   prepared validation providers.
5. Подключить общую console/panel, channels и navigation targets.
6. Подключить пример исходника.
7. Реализовать вкладку Source: editor, `Open visualizer`, `reset to sample`,
   diagnostics summary.
8. Подключить `buildGraphVisualizerModel`.
9. После успешного `Open visualizer` строить compile/analyze/model state, но UI
   может оставаться на Source/empty System до 12d.
10. Source edit очищает stale compile/analyze/model/simulation slices одним
    reducer update и закрывает source overlay.
11. Реализовать memoized source/console/model selectors; React components не
    строят derived arrays/maps.

Проверка:

1. `check-types`.
2. `test:unit` проходит для source pipeline, console и async guards.
3. Unit-тесты для отбрасывания устаревших ответов.
4. Unit-тесты для compile/analyze/projection на примере исходника.
5. Unit-тесты для диагностик анализатора как неблокирующего состояния.
6. Unit-тесты для diagnostic provider normalization, `sourceAnchors`,
   `primaryTarget` и console channel mapping.
7. Unit-тесты для source edit invalidation без render/effect loop.
8. `test:e2e` покрывает все Source UI cases 12c: sample source -> `Open
   visualizer` -> model ready, controlled compile/analyze diagnostics, reset to
   sample, source edit invalidation, отсутствие stale model после edit и
   видимость console channels.
9. `test:coverage` проходит со `100%` coverage для pure logic подэтапа.

### Этап 12d: L1/L2 read-only views

Состав:

1. Автоматический переход в L1 после успешной сборки модели.
2. L1: колонки машин, топиков и деталей выбора.
3. L1: поиск и фильтр машин/топиков.
4. L1: подсветка связей по hover/selection.
5. L1: действия `open in workbench`, `view source`,
   `open in event catalog`.
6. L2: список событий и детали топика.
7. L2: секции producers/consumers, routing values, confidence markers и empty
   states.
8. Source/diagnostic actions используют `GraphSourceAnchor` и
   `WorkbenchDiagnosticRef`, а не raw IR.
9. Реализовать source overlay anchor selection и overlay UI из L1/L2 actions.
10. Console/panel показывает compiler/analyzer/source/view-model diagnostics,
    но отдельное diagnostics window не создается.
11. Реализовать memoized L1/L2 selectors; L2 selection не пересобирает L1 lists,
    console toggle не пересобирает L1/L2 outputs.
12. L1/L2 не строят canvas edges и не хранят renderer-specific ids в state.

Проверка:

1. `test:e2e` покрывает все пользовательские UI cases 12d; пункты 2-12 ниже
   являются обязательными Playwright-сценариями или прямыми assertions внутри
   этих сценариев.
2. L1 показывает непустые списки машин и топиков на примере исходника.
3. Поиск и фильтр не мутируют projection.
4. Выбор машины подсвечивает топики.
5. Выбор топика подсвечивает машины.
6. Окно исходника открывается из деталей выбора и закрывается при source edit.
7. Diagnostics видны в общей console/panel, сохраняют все source anchors и
   переходят по `primaryTarget`, если anchors доступны.
8. L2 открывается из деталей топика в L1.
9. Производители и потребители совпадают с моделью этапа 11.
10. Потребитель с несколькими ветками показывает все цели.
11. Данные `dynamic/unknown` видимы и не отфильтровываются.
12. Routing values в L2 совпадают с `GraphTopicSummary.routingValues`, app не
   пересобирает их из raw IR.
13. Unit-тесты для L1/L2 selector referential stability:
    `l1.machine.selected` не меняет model/L2/simulation refs,
    `l2.topic.selected` не пересобирает L1 lists.
14. `test:coverage` проходит со `100%` coverage для pure logic подэтапа.

### Этап 12e: L3 cards и manual simulation

Состав:

1. Выбор машин.
2. App-level `WorkbenchCardModel` для карточек, sections, actions/capabilities
   и reserved disabled `propose-source-edit`.
3. Блоки состояний.
4. Кликабельные transition rows (`config`/`reducer`) текущего состояния.
5. Кликабельные suggested `effect` rows текущего состояния.
6. Строка отправки события.
7. Timeline.
8. Режим inspect.
9. Reset.
10. No-op codegen planner остается недоступным из UI и не создает patches.
11. Manual simulation идет только через `GraphSimulationService` и
    `GraphSimulationSession`.
12. Реализовать memoized L3/simulation selectors; timeline inspect не
    пересоздает source/model/diagnostics refs.

Проверка:

1. `test:e2e` покрывает все пользовательские UI cases 12e; пункты 2-12 ниже
   являются обязательными Playwright-сценариями или прямыми assertions внутри
   этих сценариев.
2. L3 открывается из L1 и L2.
3. Внешнее событие вызывает `GraphSimulationSession.send(...)` и пишет шаг
   timeline из `GraphSimulationSnapshot`.
4. Клик по transition row (`config` или `reducer`) вызывает
   `GraphSimulationSession.sendFromTransition(...)` с `row.transitionId`.
5. Клик по строке `effect` вызывает
   `GraphSimulationSession.sendFromEmission(...)`, сохраняет routing из IR и
   отправляет выбранную ветку только если emission есть в
   `getSuggestedEmissions()`.
6. L3 не содержит собственной transition/routing/branch-selection logic и не
   вызывает simulator runtime напрямую из React-компонентов.
7. Приближение маршрутизации actor templates явно видно в UI.
8. Reset вызывает `GraphSimulationSession.reset(...)` и очищает UI inspect
   state.
9. Редактирование исходника или повторная компиляция очищает simulator session.
10. Ошибки simulator/app commands возвращают controlled command result,
   обновляют diagnostics/pendingChoice при необходимости и не мутируют stale
   sourceVersion.
11. Card model строится из `GraphMachineWorkbenchModel`, не из JSX и не из raw
    source.
12. Reserved `propose-source-edit` action сохраняет `SourceEditIntent`, но
    остается disabled/no-op в Stage 12.
13. Unit-тесты покрывают row-command adapters, slice disambiguation, card model
    builders, simulation overlay mapping, timeline inspect/reset и
    workbench-facing view state со `100%` coverage для этих pure modules.
14. Unit-тесты для L3 selector referential stability:
    `l3.timeline.step.selected` меняет только inspect-related outputs,
    `panel.console.toggled` не пересобирает L3 outputs.
15. `test:coverage` проходит со `100%` coverage для pure logic подэтапа.

### Этап 12f: стабилизация

Состав:

1. Значки диагностик во вкладках Source/L1/L2/L3.
2. Детали диагностик с line/column при наличии `loc`.
3. Пустые состояния.
4. Минимальная адаптивность для desktop/tablet.
5. Предсказуемая обрезка и перенос длинных labels состояния, события и guard.
6. Console/panel для diagnostics с каналами compiler/analyzer/source/view-model
   и simulator; validation/eslint/codegen/host каналы готовы в model, но не
   требуют отдельного UI в Stage 12.
7. Проверка, что MVP не содержит concrete canvas implementation, React Flow/ELK
   imports или layout/canvas state в active UI path.
8. Проверка, что React components используют `useWorkbenchSelector`/stable
   dispatch helpers и не содержат ad hoc deep/shallow equality для graph data.
9. Проверка, что source edit не запускает render/effect loop и не оставляет
   stale model/simulation overlay.
10. Если стабилизация добавляет или меняет pure logic, она покрывается unit
    tests и остается под strict `100%` `test:coverage`; исключения из coverage
    запрещены.
11. E2E regression matrix обязательна и не заменяет e2e-тесты, добавленные в
    `12a`-`12e`. Она повторно покрывает полный пользовательский путь и
    стабилизационные edge cases:
   - исходник -> open visualizer -> L1;
   - выбор в L1;
   - детали топика в L2;
   - отправка события в L3;
   - inspect timeline;
   - окно исходника;
   - diagnostics в общей console/panel;
   - empty/loading/error states;
   - long labels на машинах, событиях, состояниях и guards;
   - responsive desktop/tablet floor.

Проверка:

```txt
pnpm --filter @lite-fsm/visualizer check-types
pnpm --filter @lite-fsm/visualizer build
pnpm --filter @lite-fsm/visualizer test:unit
pnpm --filter @lite-fsm/visualizer test:coverage
pnpm --filter @lite-fsm/visualizer test:e2e
```

Сборка docs не входит в проверки этапа 12.

## Критерии готовности

Этап 11 готов, если:

1. `@lite-fsm/graph/view-model` реализован как отдельный экспорт.
2. Корневой импорт `@lite-fsm/graph` не загружает `view-model`.
3. Из `LiteFsmGraphDocument` строятся структуры для L1, L2 и L3.
4. Проекция детерминирована и не зависит от DOM.
5. Тесты покрывают машины, топики, производителей, потребителей, строки рабочей
   области, диагностики, данные `dynamic/unknown` и свернутые сквозные ветки
   `reducer`, включая canonical row mapping и routing value summary.

Этап 12 готов, если:

1. `apps/visualizer` существует как отдельное private-приложение.
2. Пользователь может открыть пример исходника и перейти в L1.
3. L1, L2 и L3 реализуют поток из `music-app-mvp-flow.html`.
4. `apps/visualizer/DESIGN.md` существует, основан на visual/behavior reference
   `music-app-mvp-flow.html`, и последующая верстка следует этим
   tokens/components/states.
5. Ручная отправка события работает через `GraphSimulationService` поверх
   `@lite-fsm/graph/simulator`, без исполнения пользовательского кода и без
   собственной simulation logic в UI.
6. Диагностики и окно исходника видимы.
7. Состояние приложения содержит host capabilities и не требует доступа к
   файловой системе в static-режиме.
8. Pure logic этапа 12 и модули workbench model/workbench-facing view state
   покрыты unit-тестами со strict `100%` coverage.
9. `apps/visualizer` содержит headless workbench, service boundaries,
   typed effect descriptors/effect runner, card model, общую console/panel,
   no-op codegen planner, no-op validation provider boundary и reserved no-op
   canvas boundary.
10. React подключен к модели через centralized store/subscription/selectors;
   reducers сохраняют structural sharing, selectors возвращают stable refs, а
   components не содержат ad hoc equality/reference checks для graph data.
11. Playwright e2e-инфраструктура живет в `apps/visualizer`, поднимает только
    visualizer app и используется всеми UI-подэтапами без перестройки config.
12. Каждый подэтап `12a`, `12b`, `12b-shadcn-foundation` и `12c`-`12f` закрыт
    собственными unit/coverage/e2e tests для всех добавленных behavior paths;
    UI cases покрыты Playwright e2e в том же подэтапе, где они появились.
13. E2E suite покрывает happy path, empty/loading/error/diagnostic states,
    keyboard/focus/close interactions, long-label behavior, responsive
    desktop/tablet floor и disabled/no-op affordances для UI этапа 12.
14. MVP не содержит concrete canvas implementation, React Flow/ELK runtime
   dependency, layout engine, drag/drop editing или source patch apply.
15. Diagnostics могут приходить из compiler/analyzer/source/view-model/simulator
    и готовы к future validation/eslint/codegen/host origins через единый
    `WorkbenchDiagnosticRef`.
16. Проверки visualizer не запускают сборку docs.
