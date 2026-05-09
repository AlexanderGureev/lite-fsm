# Lite FSM Graph Simulator: спецификация этапа 9

Статус: техническое задание.

Этап 9 реализует headless system-first simulator поверх
`LiteFsmGraphDocument`. Симулятор моделирует набор машин на общей event bus;
симуляция одной машины является system scope с одним автоматом.

Симулятор остается символьным: не парсит исходник повторно, не выводит context
из summary и не исполняет пользовательский JavaScript. Публичная форма команд и
snapshot должна сразу оставлять расширения для payload/meta, reducer/context
evaluation, actor instances, auto-cascade effects и time travel.

## Цели

1. Dispatch одного события через общую event bus.
2. Ручная симуляция выбранного набора машин visualizer-а.
3. Раздельные слои `config -> reducer -> effects`.
4. Доставка события всем selected/routed consumer-ам, принимающим его из
   текущего состояния.
5. Effect emissions как ручные follow-up events.
6. Actor templates как slices, совместимые с будущими actor instances.
7. Object events с `payload` и `meta`.
8. Initial state/context overrides.
9. Immutable timeline для будущего time travel/fork.
10. Отдельные resolver, routing, branch selection и evaluator policies.
11. Явный internal typed dispatch pipeline вместо монолитного orchestrator-а.
12. Модульная структура runtime-а: entrypoint остается тонким facade, а
    scope/snapshot/routing/transitions/selection/effects/timeline/semantics
    имеют отдельных владельцев.

## Не цели этапа

1. Исполнение пользовательских `reducer`, `effect`, `condition` или `guard`
   функций.
2. Динамический импорт project files.
3. TypeScript semantic analysis.
4. Автоматическое вычисление guards по payload/context.
5. Автоматическая мутация context через пользовательский reducer.
6. Полный UI time travel.
7. Codegen, source patches и редактирование графа.
8. Реальное планирование асинхронных effects.

Базовая реализация использует symbolic/no-op policies, но оставляет точки
расширения для этих возможностей.

## Предварительное требование к compiler

Simulator не выводит runtime data из summary/source text. Все нужные runtime
значения должны быть явно представлены в IR.

Для этапа 9 compiler должен расширить `LiteFsmGraphMachine`:

```ts
export type LiteFsmGraphMachine = {
  initialContextSummary?: GraphValueSummary;
  initialContextJson?: GraphJsonObject;
};
```

Правила:

1. `initialContextJson` заполняется только когда `initialContext` статически
   вычисляется в JSON-safe object.
2. Если `initialContext` не JSON-safe, external, dynamic или unsupported,
   compiler оставляет только `initialContextSummary` и diagnostic/confidence.
3. Simulator использует `initialContextJson` как стартовый context. Если поля
   нет, simulator сохраняет context как `summary` или `unknown`.
4. Simulator не парсит `GraphValueSummary.text` и не пытается восстановить
   object из source fragment.

## Публичный entrypoint

Экспорт:

```txt
@lite-fsm/graph/simulator
```

Root import `@lite-fsm/graph` не реэкспортирует simulator runtime.

Минимальный публичный API:

```ts
export function createGraphSimulator(
  document: LiteFsmGraphDocument,
  options?: CreateGraphSimulatorOptions,
): GraphSimulator;
```

Допустимый helper для сценария одной машины:

```ts
export function createMachineGraphSimulator(
  document: LiteFsmGraphDocument,
  machineId: string,
  options?: Omit<CreateGraphSimulatorOptions, "scope">,
): GraphSimulator;
```

`createMachineGraphSimulator(...)` - только wrapper над
`createGraphSimulator(document, { scope: { kind: "machines", machineIds:
[machineId] } })`; отдельной семантики у него нет.

## Internal architecture

Simulator runtime должен быть модульным implementation detail subpath-а
`@lite-fsm/graph/simulator`. Public API экспортируется только из `index.ts`;
internal modules не становятся extension API.

Обязательная структура:

1. `index.ts`: public type exports и factories.
2. `runtime.ts`: closure state, lifecycle commands, public command adapters и
   pending choice state.
3. `pipeline.ts`: единый `runDispatchPipeline(...)` с фиксированными фазами.
4. `pipeline-types.ts`: internal pipeline input/state/result contracts.
5. `scope.ts`: scope validation, initial slice construction, start/reset
   snapshot.
6. `snapshot.ts`: slice ordering, slice lookup, immutable snapshot helpers.
7. `transitions.ts`: config acceptance, reducer branch resolution и available
   candidates.
8. `routing.ts`: event meta routing, IR routing и actor/template routing.
9. `selection.ts`: branch policy, explicit choices и stale choice checks.
10. `effects.ts`: suggested emissions и manual effect dispatch support.
11. `timeline.ts`: deterministic step ids, root timeline и append-only graph
    helpers.
12. `semantics.ts`: runtime intent rules: state-specific vs wildcard
    precedence, reducer-over-config edge rules, target resolution и
    terminal/disposed status.
13. `actor-runtime.ts`: internal actor slice contracts reserved for future
    exact actor instance mode.
14. Pure shared helpers остаются в `json.ts`, `ids.ts`, `diagnostics.ts`.

Размер файлов с логикой должен оставаться управляемым: если source/test файл
приближается к 800 строкам, его надо разбить по владельцам ответственности, а
entrypoint оставить тонким.

## Internal dispatch pipeline

Pipeline остается внутренним и typed, но не registry/plugin API.

```ts
type DispatchPipelineInput = {
  document: LiteFsmGraphDocument;
  snapshot: GraphSimulationSnapshot;
  branchPolicy: GraphBranchSelectionPolicy;
  evaluationPolicy?: GraphEvaluationPolicy;
  dispatch: DispatchInput;
  pendingChoiceId: string;
};

type DispatchPipelineState = {
  event: GraphSimulationEvent;
  routedSlices: RoutedSlice[];
  pendingCandidatesBySliceId: Record<string, readonly GraphAvailableTransition[]>;
  selections: SelectedTransition[];
  choices: GraphSimulationChoice[];
  diagnostics: GraphDiagnostic[];
  nextSlices: Record<string, GraphSimulationSlice>;
  consumed: GraphSimulationConsumption[];
  contextPatches: GraphContextPatch[];
  rowRefs: GraphSimulationRowRef[];
  stepId: string;
  stepIndex: number;
};
```

Фазы фиксированы и вызываются линейно:

1. `validateEvent` - validate/clone event без мутации snapshot.
2. `createPipelineState` - route slices и подготовить draft step/slices.
3. `evaluateAndSelect` - candidates, evaluator, branch policy и pending choice.
4. `commitSelections` - target resolution, context reduction и atomic draft
   updates.
5. `collectEmissions` - suggested effect emissions после committed state
   changes.
6. `appendTimeline` - один timeline step для successful command.
7. `freezeSnapshot` - immutable public snapshot/result.

Любая failure до append timeline возвращает controlled diagnostic и исходный
snapshot; partial slice commits запрещены.

## Базовая модель

Симулятор работает с системой slices.

```ts
export type GraphSimulationSliceRef =
  | { kind: "domain"; machineId: string }
  | { kind: "actorTemplate"; machineId: string }
  | { kind: "actor"; machineId: string; actorId: string };
```

- Domain machine имеет один slice.
- Actor template представлен отдельным `actorTemplate` slice-ом без `actorId`.
- Будущий exact actor mode может иметь много `actor` slices на один
  `machineId` с разными `actorId`, `groupId` и `groupTag`.

## JSON-значения

Payload, стартовый context и `initialContextJson` принимаются только в
JSON-safe форме. Типы общие для compiler и simulator.

```ts
export type GraphJsonValue =
  | null
  | boolean
  | number
  | string
  | GraphJsonValue[]
  | { [key: string]: GraphJsonValue };

export type GraphJsonObject = { [key: string]: GraphJsonValue };
```

Не JSON-safe input возвращает controlled diagnostic без мутации snapshot.

## Событие

Все команды dispatch принимают object event.

```ts
export type GraphSimulationEvent = {
  type: string;
  payload?: GraphJsonValue;
  meta?: GraphSimulationEventMeta;
};

export type GraphSimulationEventMeta = {
  actorId?: string | readonly string[];
  groupId?: string | readonly string[];
  groupTag?: string | readonly string[];
  senderActorId?: string;
  senderGroupId?: string;
  senderGroupTag?: string;
};
```

Правила:

1. `type` обязателен и не может быть пустым.
2. `payload` сохраняется в timeline независимо от evaluator-а.
3. `meta` используется routing resolver-ом.
4. Приоритет routing meta: `actorId > groupId > groupTag > unscoped`.
5. Входной event object не мутируется.

## Опции создания

```ts
export type CreateGraphSimulatorOptions = {
  scope?: GraphSimulationScope;
  actorMode?: GraphActorSimulationMode;
  effectMode?: GraphEffectSimulationMode;
  branchPolicy?: GraphBranchSelectionPolicy;
  evaluationPolicy?: GraphEvaluationPolicy;
  initialStateOverrides?: readonly GraphInitialStateOverride[];
  initialContextOverrides?: readonly GraphInitialContextOverride[];
};

export type GraphSimulationScope =
  | { kind: "document" }
  | { kind: "manager"; managerId: string }
  | { kind: "machines"; machineIds: readonly string[] };

export type GraphActorSimulationMode = "template-approximation";

export type GraphEffectSimulationMode = "manual";
```

Defaults этапа 9:

1. `scope`: `{ kind: "document" }`.
2. `actorMode`: `"template-approximation"`.
3. `effectMode`: `"manual"`.
4. Auto-cascade добавляется только будущими `effectMode`.
5. Exact actor instance simulation добавляется только будущими `actorMode`.

## Стартовые overrides

```ts
export type GraphInitialStateOverride = {
  slice: GraphSimulationSliceRef;
  stateKey: string;
};

export type GraphInitialContextOverride = {
  slice: GraphSimulationSliceRef;
  context: GraphJsonObject;
};
```

Правила:

1. State override должен ссылаться на существующее состояние машины.
2. Domain slice использует `machine.initialState`, если override не задан.
3. Actor template slice в `template-approximation` стартует из `__INIT`, если
   override не задан.
4. Context override заменяет стартовый context для slice.
5. Без context override используется `initialContextJson`, затем
   `initialContextSummary`, затем `{ kind: "unknown" }`.

## Context model

```ts
export type GraphSimulationContext =
  | { kind: "json"; value: GraphJsonObject }
  | { kind: "summary"; summary: GraphValueSummary }
  | { kind: "unknown"; reason?: string };
```

В этапе 9 пользовательский reducer не вычисляет context: default symbolic
policy возвращает previous context. Все commits все равно проходят через
context reducer policy, чтобы будущая evaluation подключалась без изменения
команд, snapshot и timeline.

## Branch selection policy

```ts
export type GraphBranchSelectionPolicy =
  | { kind: "manual" }
  | { kind: "origin-explicit-default-others" }
  | { kind: "deterministic-first" };
```

Режимы:

1. `manual`: любой ambiguous consumer возвращает `choice-required` без мутации.
2. `origin-explicit-default-others`: origin slice требует explicit choice для
   команды по transition row; остальные ambiguous consumers берут первую ветку
   в стабильном порядке IR. Для external `send(...)` без origin slice все
   ambiguous consumers считаются non-origin и берут первую ветку в стабильном
   порядке IR. Это default для ручной L3-симуляции.
3. `deterministic-first`: все ambiguous consumers берут первую ветку в
   стабильном порядке IR.

Default policy для этапа 9:

```ts
{ kind: "origin-explicit-default-others" }
```

## Evaluation policy

Evaluator отделен от resolver-а и branch policy.

```ts
export type GraphEvaluationPolicy = {
  evaluateTransition?: (input: GraphEvaluateTransitionInput) => GraphEvaluateTransitionResult;
  reduceContext?: (input: GraphReduceContextInput) => GraphReduceContextResult;
};

export type GraphResolvedTransitionCandidate = GraphAvailableTransition;

export type GraphEvaluateTransitionInput = {
  slice: GraphSimulationSlice;
  event: GraphSimulationEvent;
  candidates: readonly GraphResolvedTransitionCandidate[];
  context: GraphSimulationContext;
};

export type GraphEvaluateTransitionResult =
  | { kind: "unchanged"; candidates: readonly GraphResolvedTransitionCandidate[] }
  | { kind: "resolved"; candidate: GraphResolvedTransitionCandidate; reason?: string }
  | { kind: "blocked"; diagnostics: readonly GraphDiagnostic[] };

export type GraphReduceContextInput = {
  slice: GraphSimulationSlice;
  event: GraphSimulationEvent;
  transition: GraphResolvedTransitionCandidate;
  previousContext: GraphSimulationContext;
};

export type GraphReduceContextResult =
  | { kind: "unchanged"; context: GraphSimulationContext }
  | { kind: "changed"; context: GraphSimulationContext; patches?: readonly GraphContextPatch[] }
  | { kind: "blocked"; diagnostics: readonly GraphDiagnostic[] };
```

Default symbolic policy не вычисляет guards, не исполняет reducer, не читает
payload/context, не сужает candidates и возвращает context unchanged.

Будущая payload-aware policy должна подключаться без изменения формы `send`,
`sendFromTransition`, `sendFromEmission`, snapshot и timeline step.

## GraphContextPatch

```ts
export type GraphContextPatch = {
  slice: GraphSimulationSliceRef;
  op: "replace" | "set" | "delete";
  path: readonly string[];
  value?: GraphJsonValue;
};
```

В этапе 9 patches могут быть пустыми; тип нужен для timeline, будущего context
inspector-а и time travel.

## Simulator API

```ts
export type GraphSimulator = {
  start(): GraphSimulatorStartResult;
  reset(input?: GraphSimulatorResetInput): GraphSimulatorStartResult;
  getSnapshot(): GraphSimulationSnapshot | undefined;
  getAvailableTransitions(input?: GraphAvailableTransitionsInput): GraphAvailableTransition[];
  getSuggestedEmissions(input?: GraphSuggestedEmissionsInput): GraphSuggestedEmission[];
  send(input: GraphSendInput): GraphSendResult;
  sendFromTransition(input: GraphSendFromTransitionInput): GraphSendResult;
  sendFromEmission(input: GraphSendFromEmissionInput): GraphSendResult;
  choose(input: GraphChooseInput): GraphSendResult;
};

export type GraphSimulatorResetInput = {
  initialStateOverrides?: readonly GraphInitialStateOverride[];
  initialContextOverrides?: readonly GraphInitialContextOverride[];
};
```

Правила lifecycle:

1. До `start()` read methods возвращают пустые списки или `undefined`.
2. До `start()` mutating commands возвращают `not-started`.
3. `start()` идемпотентен и возвращает текущий snapshot.
4. `reset()` пересоздает initial snapshot с теми же options и опциональными
   overrides.
5. `start()` и `reset()` не запускают effects начальных states.
6. Public time travel API не входит в этап 9; internal frames by `stepId`
   допустимы для будущего checkout/fork.

## Snapshot

```ts
export type GraphSimulationSnapshot = {
  documentVersion: LiteFsmGraphDocument["version"];
  machineIds: readonly string[];
  slices: Record<string, GraphSimulationSlice>;
  domainSlicesByMachineId: Record<string, string>;
  actorTemplateSlicesByMachineId: Record<string, string>;
  actorSliceIdsByMachineId: Record<string, readonly string[]>;
  timeline: GraphSimulationTimeline;
  diagnostics: readonly GraphDiagnostic[];
};

export type GraphSimulationSlice = {
  sliceId: string;
  ref: GraphSimulationSliceRef;
  machineId: string;
  kind: "domain" | "actorTemplate" | "actor";
  stateId: string;
  stateKey: string;
  context: GraphSimulationContext;
  actor?: GraphSimulationActorMeta;
  status: "active" | "terminal" | "disposed";
};

export type GraphSimulationActorMeta = {
  actorId: string;
  groupId: string;
  groupTag: string;
};
```

Правила:

1. Snapshot immutable для клиента.
2. `sliceId` является stable id внутри simulation session.
3. Domain slice id детерминирован от `machineId`.
4. Actor template slice id детерминирован от `machineId`.
5. Actor slice id детерминирован от `machineId + actorId`.
6. Terminal actor transition фиксируется в timeline consumption. Активный
   snapshot может пометить actor slice как `disposed`, если режим моделирует
   runtime collapse.

## Timeline

Timeline проектируется как graph, а не только как массив history.

```ts
export type GraphSimulationTimeline = {
  rootStepId: string;
  currentStepId: string;
  stepsById: Record<string, GraphSimulationTimelineStep>;
  childrenByStepId: Record<string, readonly string[]>;
  linearStepIds: readonly string[];
};

export type GraphSimulationTimelineStep = {
  stepId: string;
  parentStepId?: string;
  index: number;
  event?: GraphSimulationEvent;
  source: GraphSimulationEventSource;
  consumed: readonly GraphSimulationConsumption[];
  emissions: readonly GraphStepSuggestedEmission[];
  choices: readonly GraphSimulationChoice[];
  contextPatches: readonly GraphContextPatch[];
  rowRefs: readonly GraphSimulationRowRef[];
  diagnostics: readonly GraphDiagnostic[];
};
```

`rootStepId` - initial snapshot без event. `linearStepIds` - текущая линейная
ветка для MVP UI. `stepsById` и `childrenByStepId` резервируют branching time
travel; public checkout/fork API в этап 9 не входит.

## Event source

```ts
export type GraphSimulationEventSource =
  | { kind: "initial" }
  | { kind: "external" }
  | { kind: "manual-config"; slice: GraphSimulationSliceRef; transitionId: string }
  | { kind: "manual-effect"; slice: GraphSimulationSliceRef; emissionId: string; routing: GraphRouting };
```

## Consumption

```ts
export type GraphSimulationConsumption = {
  slice: GraphSimulationSliceRef;
  machineId: string;
  sliceId: string;
  fromStateId: string;
  fromStateKey: string;
  toStateId?: string;
  toStateKey?: string;
  acceptedTransitionId: string;
  effectiveTransitionId: string;
  transitionId: string;
  reducerCaseId?: string;
  guard?: GraphCondition;
  target: GraphTarget;
  targetKind: GraphTarget["kind"];
  contextBefore: GraphSimulationContext;
  contextAfter: GraphSimulationContext;
  contextPatches: readonly GraphContextPatch[];
  selection: "explicit" | "evaluated" | "default" | "only-candidate";
  status: "committed" | "blocked";
  blockedReason?: GraphSimulationBlockedReason;
};

export type GraphSimulationBlockedReason =
  | "event-not-accepted"
  | "target-not-resolved"
  | "blocked-target"
  | "choice-required"
  | "evaluation-blocked"
  | "invalid-payload"
  | "invalid-context";
```

Blocked consumption не мутирует slice. Если команда целиком blocked, snapshot
не меняется.

## Row refs

Симулятор возвращает только graph-level refs для подсветки.

```ts
export type GraphSimulationRowRef =
  | { kind: "transition"; machineId: string; transitionId: string; sliceId: string }
  | { kind: "emission"; machineId: string; emissionId: string; sliceId: string };
```

Stage 11/12 мапит эти refs в row ids.

## Available transitions

```ts
export type GraphAvailableTransitionsInput = {
  slice?: GraphSimulationSliceRef;
  eventType?: string;
};

export type GraphAvailableTransition = {
  slice: GraphSimulationSliceRef;
  sliceId: string;
  machineId: string;
  transitionId: string;
  acceptedTransitionId: string;
  effectiveTransitionId: string;
  event: GraphEventRef;
  source: GraphStateRef;
  target: GraphTarget;
  layer: "config" | "reducer";
  guard?: GraphCondition;
  reducerCaseId?: string;
  canApply: boolean;
  blockedReason?: "target-not-resolved" | "blocked-target";
  confidence: "exact" | "partial" | "unknown";
};
```

Resolver rules:

1. State-specific `config` acceptance имеет приоритет над wildcard acceptance.
2. Wildcard не применяется из actor `__INIT`.
3. Terminal/disposed actor slice не принимает events.
4. Reducer branches не создают acceptance. Они уточняют target только для уже
   принятого config event.
5. Для config-only transition `acceptedTransitionId === effectiveTransitionId`.
6. Для reducer branch `acceptedTransitionId` указывает на config edge, а
   `effectiveTransitionId` - на reducer edge.
7. `dynamic`, `unknown` и `blocked` targets остаются видимыми choices, но
   `canApply === false`.

## Suggested emissions

```ts
export type GraphSuggestedEmissionsInput = {
  slice?: GraphSimulationSliceRef;
};

export type GraphSuggestedEmission = {
  slice: GraphSimulationSliceRef;
  sliceId: string;
  machineId: string;
  emissionId: string;
  event: GraphEventRef;
  routing: GraphRouting;
  guard?: GraphCondition;
  sourceStateId?: string;
  sourceStateKey: string | "*";
  canDispatch: boolean;
  blockedReason?: "not-current-state" | "terminal-slice" | "unknown-routing";
  confidence: "exact" | "partial" | "unknown";
};

export type GraphStepSuggestedEmission = GraphSuggestedEmission & {
  producedAfterStepId: string;
};
```

Правила effects:

1. Effects не являются transitions и сами не мутируют state.
2. В `manual` mode effects являются только suggestions.
3. `sendFromEmission(...)` отправляет ровно выбранную emission branch как bus
   event.
4. Initial effects не предлагаются до committed transition в этот state.
5. State-specific effects предлагаются только после реального входа в state.
6. Self transition не считается входом для state-specific effect.
7. Wildcard effects предлагаются по runtime precedence после state-specific
   case.

## Commands

### send

```ts
export type GraphSendInput = {
  event: GraphSimulationEvent;
  source?: Extract<GraphSimulationEventSource, { kind: "external" }>;
  choices?: readonly GraphTransitionChoiceOverride[];
};
```

`send(...)` отправляет external event через bus. У external send нет origin
slice, поэтому default `origin-explicit-default-others` не требует UI branch
picker: ambiguous consumers выбираются как non-origin по стабильному порядку IR.
Если включена policy `{ kind: "manual" }`, ambiguous external dispatch
возвращает `choice-required` без мутации.

### sendFromTransition

```ts
export type GraphSendFromTransitionInput = {
  slice: GraphSimulationSliceRef;
  transitionId: string;
  payload?: GraphJsonValue;
  choices?: readonly GraphTransitionChoiceOverride[];
};
```

Правила:

1. `transitionId` должен быть available для origin slice.
2. Event type берется из выбранного transition.
3. Optional `payload` добавляется к отправленному event.
4. Origin slice использует `transitionId` как explicit branch.
5. Routing override запрещен; для custom routing meta использовать `send(...)`
   с явным `GraphSimulationEvent`.
6. Consumers следуют routing resolver и branch policy.
7. Event отправляется всем selected/routed consumers, не только origin slice.

### sendFromEmission

```ts
export type GraphSendFromEmissionInput = {
  slice: GraphSimulationSliceRef;
  emissionId: string;
  payload?: GraphJsonValue;
  choices?: readonly GraphTransitionChoiceOverride[];
};
```

Правила:

1. `emissionId` должен быть suggested для origin slice.
2. Event type и routing берутся из emission.
3. Optional `payload` добавляется к emitted event.
4. Emission routing из IR authoritative и не переопределяется command input.
5. Emission сама не меняет state origin slice.
6. Emitted event идет через тот же bus path, что external events.
7. Future sender provenance может быть отдельным полем, но не заменяет
   `actorId`, `groupId` или `groupTag` routing из IR.

### choose

```ts
export type GraphChooseInput = {
  pendingChoiceId: string;
  choices: readonly GraphTransitionChoiceOverride[];
};

export type GraphTransitionChoiceOverride = {
  slice: GraphSimulationSliceRef;
  transitionId: string;
};
```

`choose(...)` commits ранее blocked `choice-required` dispatch. Если current
cursor или candidates больше не совпадают с pending choice, команда возвращает
controlled `stale-choice`.

## Command results

```ts
export type GraphSimulatorStartResult =
  | { ok: true; snapshot: GraphSimulationSnapshot }
  | { ok: false; reason: GraphSimulatorStartFailureReason; diagnostics: readonly GraphDiagnostic[] };

export type GraphSimulatorStartFailureReason =
  | "empty-scope"
  | "unknown-machine"
  | "unknown-manager"
  | "unknown-start-state"
  | "invalid-initial-context"
  | "unsupported-mode";

export type GraphSendResult =
  | {
      ok: true;
      snapshot: GraphSimulationSnapshot;
      step: GraphSimulationTimelineStep;
    }
  | {
      ok: false;
      reason: GraphSendFailureReason;
      snapshot?: GraphSimulationSnapshot;
      pendingChoice?: GraphSimulationPendingChoice;
      diagnostics: readonly GraphDiagnostic[];
    };

export type GraphSendFailureReason =
  | "not-started"
  | "invalid-event"
  | "invalid-payload"
  | "invalid-context"
  | "unknown-slice"
  | "unknown-transition"
  | "unknown-emission"
  | "event-not-accepted"
  | "choice-required"
  | "stale-choice"
  | "target-not-resolved"
  | "blocked-target"
  | "evaluation-blocked";
```

Diagnostics возвращаются в controlled results, а не через exceptions.

Для external `send(...)` отсутствие consumers не является
`event-not-accepted`: dispatch успешен и добавляет timeline step с пустым
`consumed`. `event-not-accepted` используется только для команд с явным
origin/choice (`sendFromTransition(...)`, `sendFromEmission(...)`,
`choose(...)`), когда IR-элемент есть в scope, но недоступен в текущем
snapshot. Неизвестный id возвращает `unknown-transition` или
`unknown-emission`.

Для `sendFromTransition(...)` доступный origin transition является accepting
consumption origin slice; если он больше не available, команда возвращает
`event-not-accepted`, а не successful empty-consumption step. Для
`sendFromEmission(...)` suggested emission является валидным origin action даже
если emitted event не принят ни одним routed slice; в этом случае команда
успешна, добавляет timeline step с пустым `consumed`, а emission source остается
зафиксированным в `step.source`.

## Pending choice

```ts
export type GraphSimulationPendingChoice = {
  pendingChoiceId: string;
  event: GraphSimulationEvent;
  source: GraphSimulationEventSource;
  candidatesBySliceId: Record<string, readonly GraphAvailableTransition[]>;
  createdAtStepId: string;
};

export type GraphSimulationChoice = {
  slice: GraphSimulationSliceRef;
  sliceId: string;
  eventType: string;
  candidates: readonly GraphAvailableTransition[];
  selectedTransitionId?: string;
  resolvedBy: "manual" | "policy" | "evaluator";
};
```

## Dispatch semantics

Для каждой dispatch command public adapter сначала нормализует command input в
internal `DispatchInput`, затем вызывает общий dispatch pipeline:

1. Валидировать event и command input.
2. Нормализовать routing из event meta или emission routing.
3. Разрешить target slices.
4. Для каждого target slice найти accepted transitions по current state и
   event type.
5. Применить evaluation policy к candidates.
6. Применить branch selection policy.
7. Вычислить target.
8. Применить context reducer policy.
9. Атомарно commit successful slice updates.
10. Добавить один timeline step.
11. Собрать suggested emissions для changed/current slices.

Event catalog ownership:

1. Simulator не строит global event catalog.
2. Full event/topic catalog принадлежит `@lite-fsm/graph/view-model`.
3. Visualizer берет dropdown events из view-model topics и помечает
   `available now` через `getAvailableTransitions()`.
4. Simulator может фильтровать available transitions по `eventType`, но не
   владеет producer/consumer topic indexing.

Atomicity:

1. Если command fails до commit, slices не мутируют.
2. Routed slices, которые не принимают event, отсутствуют в `consumed`; это не
   command failure.
3. Для external `send(...)` и валидного `sendFromEmission(...)`, если ни один
   selected/routed slice не принимает event, command успешна, `consumed` пустой,
   timeline step добавлен.
4. Если выбран unresolved/blocked target для commit, command возвращает
   controlled blocked result и не мутирует snapshot.
5. Если один из routed consumers падает на target/context/evaluation failure,
   весь dispatch отклоняется атомарно: ранее обработанные draft slice updates
   не попадают в snapshot и timeline cursor не двигается.

## Routing semantics

Routing следует runtime intent:

1. Domain machines получают committed user events независимо от actor routing
   meta и consume только при acceptance текущего state.
2. `actorTemplate` slices в `template-approximation` фильтруются приближенно:
   default/unscoped - matching template; `groupTag` - только совпадающий
   `machine.groupTag`; `actorId`/`groupId` - partial confidence, если template
   plausibly related.
3. Future actor slices фильтруются по `actorId`, `groupId`, `groupTag` или
   unscoped/default для всех matching actor slices.
4. Future instance mode сохраняет runtime phases: spawn from `__INIT` before
   reduce, reduce live и pending-spawned actors, collapse terminal actors after
   reduce, effects target delivered/spawned actors after commit.

## Actor identities

Этап 9 резервирует actor identity contracts для будущего exact instance mode,
но не экспортирует этот режим как supported public option.

```ts
type GraphActorIdentityFactory = {
  createActorId(input: GraphCreateActorIdInput): string;
  createGroupId(input: GraphCreateGroupIdInput): string;
};

type GraphCreateActorIdInput = {
  templateMachineId: string;
  groupTag: string;
  event: GraphSimulationEvent;
  counter: number;
};

type GraphCreateGroupIdInput = {
  groupTag: string;
  event: GraphSimulationEvent;
  counter: number;
};
```

Это future/internal contracts, не public API этапа 9. Будущий exact instance
mode может экспортировать их после полной instance semantics. Default factories
должны быть deterministic и SSR-safe: без `Math.random()` и `Date.now()`.

## Visualizer overlay compatibility

Simulator не строит UI overlay objects. Он предоставляет facts:

1. current slice states через `snapshot.slices`;
2. current available transitions через `getAvailableTransitions()`;
3. current suggested emissions через `getSuggestedEmissions()`;
4. fired rows через `GraphSimulationTimelineStep.rowRefs`;
5. event sources и consumption через timeline steps.

Stage 11/12 adapters строят overlay flags из этих facts и UI state
(`selected/inspected` timeline step). Simulator не знает row ids, DOM ids,
tabs, selected panels или inspected step state.

## Sorting and determinism

Все списки детерминированы:

1. Machines идут в порядке `document.machines`.
2. Domain slices идут в порядке machines.
3. Actor template slices идут в порядке machines.
4. Actor instances идут в порядке spawn.
5. Available transitions идут в порядке IR transitions.
6. Reducer branches идут в порядке IR reducer transitions.
7. Emissions идут в порядке IR emissions.
8. Timeline step ids детерминированы внутри simulation session.

## Diagnostics

Diagnostic codes must use simulator namespace:

```txt
LFG_SIM_EMPTY_SCOPE
LFG_SIM_UNKNOWN_MACHINE
LFG_SIM_UNKNOWN_MANAGER
LFG_SIM_UNKNOWN_SLICE
LFG_SIM_UNKNOWN_START_STATE
LFG_SIM_INVALID_EVENT
LFG_SIM_INVALID_PAYLOAD
LFG_SIM_INVALID_CONTEXT
LFG_SIM_UNKNOWN_TRANSITION
LFG_SIM_UNKNOWN_EMISSION
LFG_SIM_EVENT_NOT_ACCEPTED
LFG_SIM_CHOICE_REQUIRED
LFG_SIM_STALE_CHOICE
LFG_SIM_TARGET_NOT_RESOLVED
LFG_SIM_BLOCKED_TARGET
LFG_SIM_EVALUATION_BLOCKED
LFG_SIM_UNSUPPORTED_MODE
```

## Package boundaries

1. `@lite-fsm/graph/simulator` может импортировать graph IR types и pure helper
   code.
2. `@lite-fsm/graph/simulator` не импортирует React, DOM, CodeMirror,
   React Flow, ELK, Vite или app modules.
3. `@lite-fsm/graph/simulator` не исполняет arbitrary source code.
4. Root `@lite-fsm/graph` не реэкспортирует simulator runtime.
5. View-model и visualizer потребляют simulator snapshots/results и не
   реализуют заново transition acceptance, routing, reducer branch selection
   или effect follow semantics.

## Required tests

Runtime tests через Vitest:

1. Root import не раскрывает simulator runtime.
2. `@lite-fsm/graph/simulator` экспортирует `createGraphSimulator`.
3. Одна selected machine работает как system с одним domain slice.
4. Несколько domain machines consume один external event в одном timeline step.
5. Event, не принятый selected slices, добавляет empty-consumption step.
6. `sendFromTransition` фиксирует selected origin branch и отправляет event
   другим consumers.
7. `sendFromTransition` принимает custom payload и не раскрывает routing
   override input.
8. Non-origin ambiguous consumers используют deterministic default under
   `origin-explicit-default-others`.
9. `manual` branch policy возвращает `choice-required` без мутации snapshot.
10. External `send(...)` under `origin-explicit-default-others` выбирает
    ambiguous consumers как non-origin default и не требует pending choice.
11. `choose` commits pending choices и отклоняет stale choices.
12. `sendFromEmission` emits event with routing и сам не мутирует origin.
13. `sendFromEmission` не позволяет command input переопределить emission
    routing.
14. `sendFromEmission` с валидной suggested emission и без accepting consumers
    успешен и добавляет empty-consumption timeline step.
15. Effects не suggested on initial start.
16. Effects suggested после real state entry.
17. Self transition не запускает state-specific entry effect.
18. Wildcard acceptance следует state-specific precedence.
19. Reducer branch не создает acceptance без config edge.
20. Dynamic/unknown/blocked targets видимы, но не committed.
21. Event payload сохраняется в timeline.
22. Event meta управляет routing resolver.
23. Domain machines получают events независимо от actor routing meta.
24. Actor routing в template approximation помечает partial confidence, когда
    exact actor identity неизвестна.
25. Initial state override меняет starting state.
26. Initial context override сохраняется как JSON context.
27. Non-JSON payload/context возвращает controlled diagnostic.
28. Snapshot results нельзя мутировать клиентом.
29. Timeline хранит `stepsById`, `childrenByStepId` и `linearStepIds` для
    future time travel без public checkout API в этапе 9.
30. Validation/evaluation/target/context failures не мутируют snapshot и не
    двигают timeline cursor.
31. Multi-slice dispatch атомарен: failure одного consumer-а отменяет весь
    command до append timeline.
32. Read filters по unknown slice возвращают пустые списки.
33. Manual effect dispatch сохраняет emission row ref и transition row refs в
    одном timeline step.
34. Runtime coverage для graph simulator source должен оставаться 100% по
    statements/branches/functions/lines, кроме явно исключенных pure type files.

Type tests через Tstyche:

1. Public event input принимает `payload` и `meta`.
2. `sendFromTransition` принимает `payload` и отклоняет routing `meta`.
3. Initial context override принимает JSON object и отклоняет functions/classes.
4. Slice refs дискриминируют domain, actorTemplate и actor.
5. Result unions сужаются по `ok`.
6. Branch/evaluator policy types не требуют DOM или app types.

## Required commands

Agents не запускают docs build для этого этапа. Required package checks:

```txt
pnpm --filter @lite-fsm/graph check-types
pnpm exec vitest run tests/graph
pnpm exec vitest run tests/graph --coverage --coverage.include 'packages/graph/src/**/*.ts' --coverage.exclude 'packages/graph/src/types.ts'
pnpm run test:types
```

If public graph types change, update:

```txt
API-CHEATSHEET.md
TYPES-CHEATSHEET.md
```

Cheatsheets описывают текущие capabilities и не являются changelog.

## Acceptance criteria

Этап 9 готов, если:

1. Симулятор создается от `LiteFsmGraphDocument`.
2. Система из одной машины и система из нескольких машин используют один API.
3. Dispatch одного события обновляет все accepting selected slices атомарно.
4. Timeline step содержит event, source, consumed slices, выбранные branches,
   context snapshots/patches и graph row refs.
5. Manual effect emission работает как dispatch нового bus event.
6. Manual effect emission не допускает override routing.
7. Payload/meta сохраняются и доступны future evaluator-у.
8. Initial state/context overrides работают.
9. Compiler явно передает `initialContextJson`; simulator не выводит context из
   summary/source text.
10. Actor template approximation представлен отдельным `actorTemplate` slice.
11. Routing resolver отделен от machine transition resolver.
12. Branch selection policy отделена от resolver-а.
13. Evaluation/context policies подключаются без изменения формы команд.
14. Snapshot immutable и содержит timeline graph для будущего time travel.
15. Stage 11/12 могут строить simulation overlay из snapshot без собственной
    transition logic.
16. Internal runtime построен как typed dispatch pipeline с отдельными modules
    для scope/snapshot/routing/transitions/selection/effects/timeline/semantics.
17. Source/test файлы с логикой не превращаются в 800+ строковые монолиты.
18. Все required tests и strict coverage проходят.
