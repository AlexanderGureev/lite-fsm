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
  -> UI вкладок `Source`, `System`, `Events`, `Machines`

LiteFsmGraphDocument + selected machine ids
  -> GraphSimulationService
  -> VisualizerSimulationState
  -> simulation overlay для GraphVisualizerModelClient
```

React-компоненты только dispatch commands и читают selectors. Они не вызывают
compiler, analyzer, `view-model` или simulator напрямую.

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

React Flow и ELK не входят в MVP; L1/L2/L3 не требуют canvas-графа.

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
  activeTab: "source" | "system" | "events" | "machines";
  l1: SystemViewState;
  l2: EventCatalogViewState;
  l3: MachineWorkbenchViewState;
  simulation: VisualizerSimulationState;
  diagnostics: WorkbenchDiagnosticRef[];
  console: ConsoleState;
};
```

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
  | { type: "source.overlay.closed" };
```

Command handlers возвращают controlled result и не бросают exceptions для
ожидаемых ошибок compiler/model/simulator:

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
        | "simulator-rejected";
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

### Диагностики приложения

```ts
type WorkbenchDiagnosticRef = {
  diagnosticId: string;
  sourceVersion: number;
  origin: "compiler" | "analyzer" | "source" | "view-model" | "simulator";
  diagnostic: GraphDiagnostic;
  graphItemRef?: GraphItemRef;
  sourceAnchor?: GraphSourceAnchor;
};
```

Compiler error может блокировать L1/L2/L3, если document нельзя показать.
Analyzer diagnostics не блокируют просмотр и ручную симуляцию.

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
row-command adapters, source overlay anchor selection, diagnostics
normalization, simulation overlay mapping, timeline inspect/reset mapping и
построение L3/workbench-facing view state. Эти модули обязаны иметь unit-тесты
со strict `100%` coverage по statements/branches/functions/lines.

React components покрываются smoke/e2e и не должны содержать непокрытую business
logic. Если логика нужна компоненту, она сначала выносится в pure module и
попадает под `test:coverage`.

### Этап 12a: каркас приложения

Состав:

1. Создать `apps/visualizer`.
2. Настроить Vite, React, TypeScript и styling.
3. Добавить скрипты `dev`, `build`, `check-types`, `test:unit`,
   `test:coverage`, `test:e2e`.
4. Добавить подключение workspace/turbo.
5. Реализовать static host adapter с capabilities без доступа к файловой
   системе.
6. Реализовать shell с вкладками и пустыми панелями.
7. Добавить smoke test на Playwright.

Проверка:

```txt
pnpm --filter @lite-fsm/visualizer check-types
pnpm --filter @lite-fsm/visualizer build
pnpm --filter @lite-fsm/visualizer test:coverage
pnpm --filter @lite-fsm/visualizer test:e2e
```

### Этап 12b: конвейер исходника и состояние приложения

Состав:

1. Реализовать `SourceSession`.
2. Реализовать асинхронные клиенты.
3. Реализовать latest-wins обработку ответов по `sourceVersion`.
4. Подключить host capabilities к состоянию приложения.
5. Нормализовать диагностики.
6. Подключить пример исходника.
7. Подключить `buildGraphVisualizerModel`.
8. Реализовать selectors для L1/L2/L3.

Проверка:

1. `check-types`.
2. Unit-тесты для отбрасывания устаревших ответов.
3. Unit-тесты для compile/analyze/projection на примере исходника.
4. Unit-тесты для диагностик анализатора как неблокирующего состояния.
5. `test:coverage` проходит со `100%` coverage для pure logic этапа 12.

### Этап 12c: исходник и L1

Состав:

1. Вкладка исходника.
2. Compile/analyze/build по действию `Open visualizer`.
3. Автоматический переход в L1 после успешной сборки модели.
4. Колонка машин.
5. Колонка топиков.
6. Колонка деталей выбора.
7. Поиск и фильтр.
8. Подсветка связей.
9. Действие открытия окна исходника.

Проверка:

1. L1 показывает непустые списки машин и топиков на примере исходника.
2. Поиск и фильтр не мутируют projection.
3. Выбор машины подсвечивает топики.
4. Выбор топика подсвечивает машины.
5. Окно исходника открывается из деталей выбора.

### Этап 12d: L2

Состав:

1. Список событий.
2. Детали топика.
3. Секция производителей.
4. Секция потребителей.
5. Маркеры достоверности (`confidence`).
6. Пустые состояния.

Проверка:

1. L2 открывается из деталей топика в L1.
2. Производители и потребители совпадают с моделью этапа 11.
3. Потребитель с несколькими ветками показывает все цели.
4. Данные `dynamic/unknown` видимы и не отфильтровываются.
5. Routing values в L2 совпадают с `GraphTopicSummary.routingValues`, app не
   пересобирает их из raw IR.

### Этап 12e: L3

Состав:

1. Выбор машин.
2. Карточки машин.
3. Блоки состояний.
4. Кликабельные transition rows (`config`/`reducer`) текущего состояния.
5. Кликабельные suggested `effect` rows текущего состояния.
6. Строка отправки события.
7. Timeline.
8. Режим inspect.
9. Reset.

Проверка:

1. L3 открывается из L1 и L2.
2. Внешнее событие вызывает `GraphSimulationSession.send(...)` и пишет шаг
   timeline из `GraphSimulationSnapshot`.
3. Клик по transition row (`config` или `reducer`) вызывает
   `GraphSimulationSession.sendFromTransition(...)` с `row.transitionId`.
4. Клик по строке `effect` вызывает
   `GraphSimulationSession.sendFromEmission(...)`, сохраняет routing из IR и
   отправляет выбранную ветку только если emission есть в
   `getSuggestedEmissions()`.
5. L3 не содержит собственной transition/routing/branch-selection logic и не
   вызывает simulator runtime напрямую из React-компонентов.
6. Приближение маршрутизации actor templates явно видно в UI.
7. Reset вызывает `GraphSimulationSession.reset(...)` и очищает UI inspect
   state.
8. Редактирование исходника или повторная компиляция очищает simulator session.
9. Ошибки simulator/app commands возвращают controlled command result,
   обновляют diagnostics/pendingChoice при необходимости и не мутируют stale
   sourceVersion.
10. Unit-тесты покрывают row-command adapters, slice disambiguation,
    simulation overlay mapping, timeline inspect/reset и workbench-facing view
    state со `100%` coverage для этих pure modules.

### Этап 12f: стабилизация

Состав:

1. Значки диагностик во вкладках Source/L1/L2/L3.
2. Детали диагностик с line/column при наличии `loc`.
3. Пустые состояния.
4. Минимальная адаптивность для desktop/tablet.
5. Предсказуемая обрезка и перенос длинных labels состояния, события и guard.
6. E2E сценарии:
   - исходник -> open visualizer -> L1;
   - выбор в L1;
   - детали топика в L2;
   - отправка события в L3;
   - inspect timeline;
   - окно исходника.

Проверка:

```txt
pnpm --filter @lite-fsm/visualizer check-types
pnpm --filter @lite-fsm/visualizer build
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
4. Ручная отправка события работает через `GraphSimulationService` поверх
   `@lite-fsm/graph/simulator`, без исполнения пользовательского кода и без
   собственной simulation logic в UI.
5. Диагностики и окно исходника видимы.
6. Состояние приложения содержит host capabilities и не требует доступа к
   файловой системе в static-режиме.
7. Pure logic этапа 12 и модули workbench model/workbench-facing view state
   покрыты unit-тестами со strict `100%` coverage.
8. Проверки visualizer не запускают сборку docs.
