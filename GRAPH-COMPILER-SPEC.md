# Lite FSM Graph Compiler: спецификация / ТЗ

Статус: черновик.

Цель документа - зафиксировать архитектурное решение для построения универсального графа `lite-fsm` из строки исходного кода. Граф должен быть пригоден не только для визуализации, но и для симуляции, CLI, статического анализа, правил линтинга и будущей генерации кода из диаграмм.

## Референс

Идея продукта близка к Stately Sketch:

- Репозиторий: https://github.com/statelyai/sketch
- Парсинг входной строки и конвертация в граф: https://github.com/statelyai/sketch/blob/main/src/lib/machine.ts
- Симуляция поверх нормализованной модели: https://github.com/statelyai/sketch/blob/main/src/lib/store.ts
- UI графа: https://github.com/statelyai/sketch/blob/main/src/components/MachineViz.tsx
- UI перехода: https://github.com/statelyai/sketch/blob/main/src/components/TransitionViz.tsx
- UI состояния: https://github.com/statelyai/sketch/blob/main/src/components/StateNodeViz.tsx

Важное наблюдение по Sketch: он не пытается сохранить всю реализацию XState-кода. Он принимает строку, получает нормализованную модель машины, строит удобный граф и симулирует бизнес-поток по этой модели. Guards превращаются в выбираемые символические ветки, а не в полноценное исполнение пользовательской логики.

Для `lite-fsm` нужно сохранить эту простоту, но не копировать обязательное исполнение кода через `new Function`. Базовый путь должен быть статическим и безопасным.

## Тестовый набор форм API

Файл [`tests/graph/fixtures/graph-sources.ts`](tests/graph/fixtures/graph-sources.ts) является основным fixture-набором parser-а. В нем собраны разные валидные и диагностические формы объявления `createMachine`, `createEffect`, `createConfig`, `createReducer` и `MachineManager`, которые parser должен корректно разобрать из одной строки исходника и преобразовать в `LiteFsmGraphDocument`.

Этот файл нужно использовать как контракт покрытия для реализации:

1. Каждая валидная машина из fixture-а должна попадать в IR.
2. Каждый поддерживаемый `config`, `reducer` и `effects` паттерн должен давать ожидаемые states, transitions, reducer cases и emissions.
3. Diagnostic-примеры в конце файла должны возвращать diagnostics, а не приводить к падению parser-а.
4. При добавлении нового поддерживаемого синтаксиса сначала нужно добавить минимальный пример в этот fixture, затем реализовать parser и тесты.

## Краткое решение

Главный контракт:

```txt
строка исходника -> LiteFsmGraphDocument JSON
```

UI, CLI, симулятор, линтеры и будущий codegen должны работать с одним и тем же документом графа.

Базовая архитектура:

```txt
строка TypeScript/JavaScript
  -> статический парсер на ts-morph
  -> частичный вычислитель для поддерживаемого подмножества
  -> LiteFsmGraphDocument
  -> selectMachineGraph(...)
  -> символический симулятор / UI / CLI / анализаторы
```

## Цели

1. Принимать на вход строку с исходным кодом: содержимое редактора, буфера обмена, stdin или файла, прочитанного CLI.
2. Находить один или несколько вызовов `createMachine(...)` в этой строке.
3. Строить универсальный JSON-документ графа.
4. Позволять выбрать один автомат из документа и симулировать его изолированно.
5. Показывать частичный граф даже при неполном понимании кода.
6. Возвращать диагностику вместо полного падения, когда парсер не может раскрыть часть кода.
7. Не требовать контекст проекта, `tsconfig`, сборку или резолвинг импортов.
8. Сохранять достаточно метаданных исходника для подсветки кода, диагностики и будущего codegen.

## Не цели v1

1. Не исполнять реальный `MachineManager`.
2. Не исполнять `reducer`, `effect` или `middleware` как среду исполнения приложения.
3. Не резолвить импорты значений из других файлов.
4. Не строить режим проекта для TypeScript.
5. Не доказывать условия, зависящие от payload.
6. Не анализировать произвольные вспомогательные функции.
7. Не симулировать несколько машин и маршрутизацию акторов как полноценную систему.
8. Не гарантировать обратимость для произвольного TypeScript-кода.

## Основные ограничения парсера

Эти ограничения должны быть публично документированы, потому что они делают задачу реализуемой и предсказуемой.

### Вход

1. Парсер работает с одной строкой исходника.
2. CLI может читать файл, но компилятор графа получает уже строку.
3. Импорты не резолвятся: парсер читает только import declaration в текущей строке исходника и не проверяет файловую систему или package exports.
4. Импорты типов игнорируются.
5. Импорты значений считаются непрозрачными внешними символами.
6. Неизвестные идентификаторы не валят сборку. Они создают диагностику и `unknown` узлы/ребра, если нужны для графа.

### Обнаружение машин

Поддерживаются:

```ts
import { createMachine, createConfig, createReducer, createEffect, MachineManager } from "@lite-fsm/core";
import { createMachine as makeMachine } from "@lite-fsm/core";

createMachine({ ... });
makeMachine({ ... });
export const machine = createMachine({ ... });
export default createMachine({ ... });
const machine = createMachine({ ... });
const machines = { machineA, machineB };
MachineManager(machines, options);
MachineManager({ machineA, inline: createMachine({ ... }) }, options);
```

Парсер должен распознавать API не по эвристикам имени переменной, а по явному происхождению:

- точные ambient names `createMachine`, `createConfig`, `createReducer`, `createEffect`, `MachineManager` для вставленных самодостаточных snippets;
- локальные имена, импортированные из известных source specifiers, если импортируемый export name равен `createMachine`, `createConfig`, `createReducer`, `createEffect` или `MachineManager`;
- локальный alias из import specifier допустим, например `import { createMachine as makeMachine } ...`.

Известные source specifiers для v1:

- `"@lite-fsm/core"`;

После миграции в монорепу fixture-ы и внутренние тесты должны использовать package import `"@lite-fsm/core"`, а не legacy-пути вида `"../src/core"`.

Парсер не должен считать произвольный импорт из любого модуля API `@lite-fsm/core`, даже если локальное имя похоже на `createMachine`.

Для ambient `createMachine(...)` без import-а нужно проверять форму первого аргумента. Вызов считается машиной только если первый аргумент выглядит как object literal с `config`, `initialState` и `initialContext`.

Не поддерживаются alias chains без import provenance:

```ts
const makeMachine = createMachine;
const create = makeMachine;
create({ ... });
```

Парсер должен уметь определить имена машин:

- `variableName`: имя переменной, которой присвоен `createMachine(...)`;
- `exportName`: имя export-а, если есть;
- `managerKey`: ключ в объекте, переданном в `MachineManager`;
- `index`: порядковый номер в строке исходника.

`createConfig(...)` и `createReducer(...)` не являются отдельными сущностями графа. В v1 это прозрачные identity-wrappers, которые можно раскрывать только в позициях `config:` и `reducer:`.

`defineMachine(...).create({ ... })` в v1 не является обязательной формой обнаружения. Ее можно добавить позже как синтаксический alias `createMachine`, если практика покажет, что это часто нужно для pasted snippets.

Если селектор не указан, UI и CLI могут использовать первую машину, как Sketch.

### Частичное вычисление

Поддерживаются:

1. Объектные литералы.
2. Локальные `const` объектные литералы в том же файле исходника.
3. Простые spread-операции из локальных объектных литералов.
4. Строковые литералы.
5. `as const`.
6. `satisfies`.
7. Вычисляемые ключи только если они сводятся к строковому литералу из локальной const.
8. Локальные `const` string literals для state keys, event keys, target values, `initialState` и `transition({ type })`.
9. Прозрачные identity-wrappers `createConfig({ ... })` и `createReducer(fn)` в ожидаемых позициях.
10. Routing meta из object literal: `meta.actorId`, `meta.groupId`, `meta.groupTag` как string literal, array literal из string literals или `self.actorId/self.groupId/self.groupTag`.

Не поддерживаются:

1. Импортированные config-объекты.
2. Фабрики runtime-объектов.
3. Вызовы функций, которые возвращают config.
4. Динамические вычисляемые ключи.
5. Деструктуризация/мутация, если они нужны для построения config.

### `config`

Поддерживаются значения target:

```ts
"STATE"
null
"__RESOLVED"
"__REJECTED"
"__CANCELLED"
```

Семантика target:

- строковый target - переход в состояние или terminal target;
- `null` - self/targetless-переход в терминах `lite-fsm`, то есть событие принято, а reducer может оставить или изменить state;
- `undefined` - отсутствующий transition, в граф не попадает;
- динамическое выражение - `target.kind = "dynamic"` и diagnostic.

Wildcard `"*"` сохраняется как отдельный source. Для симуляции он применяется, когда edge конкретного состояния не найден, как в runtime.

Шаблон актора определяется по наличию `__INIT` в `config`. Compiler должен сохранить это в `kind: "actorTemplate"` и не ломать документ графа, даже если `initialState !== "__INIT"`. Семантический diagnostic по некорректной форме actor template должен возвращать analyzer на базе IR.

### Анализ reducer

Парсер анализирует reducer только как источник символических веток поверх `config`.

Поддерживаются:

```ts
reducer: (state, action, { nextState }) => {
  switch (action.type) {
    case "A":
      state.state = "B";
      return;
    case "C":
      state.state = nextState;
      return;
  }
}
```

```ts
if (action.type === "A") {
  state.state = condition ? "B" : "C";
  return;
}
```

```ts
if (action.type === "A" && action.payload.kind === "x") {
  state.state = "X";
} else {
  state.state = "Y";
}
```

Поддерживаемые записи в state:

- `state.state = "TARGET"`;
- `s.state = "TARGET"`, если первый параметр reducer-а называется `s`;
- `state.state = nextState`;
- `state.state = condition ? "A" : "B"`;
- `return { state: "TARGET", context: ... }` для простых объектных литералов.
- `reducer: createReducer((state, action, meta) => { ... })` как прозрачный wrapper.

Не поддерживаются:

- mutation через вспомогательную функцию: `setState(state, "READY")`;
- alias-переменные на `state`: `const draft = state; draft.state = "READY"`;
- computed assignment: `state["state"] = "READY"`;
- arbitrary expression target;
- полный control-flow analysis.

Guard/condition сохраняется как текстовый label. Parser не вычисляет условие.

Ветки reducer не должны заменять `config` edges без следа. В IR нужно хранить оба слоя:

- declared acceptance из `config`;
- выведенные из reducer ветки target.

Reducer branch не создает новый config-переход сам по себе. Compiler должен сохранить reducer case в IR даже если событие не найдено в `config`/wildcard. Семантический diagnostic для такого случая возвращает analyzer rule `reducer-config-consistency`, а не reducer parser.

### Анализ effects

Парсер анализирует effects только как источник отправляемых событий.

Поддерживаемые формы effects:

- inline object literal `effects: { ... }`;
- local const object literal `effects: localEffects`;
- state-specific key: `effects: { LOADING: (...) => {} }`;
- wildcard key: `effects: { "*": (...) => {} }`;
- computed key из локальной const string;
- plain effect function inline;
- plain effect function из локальной const;
- inline `createEffect({ effect })`;
- `createEffect({ effect })`, сохраненный в локальную const и переданный в `effects`;
- `createEffect({ type, effect, cancelFn })`; `cancelFn` для графа игнорируется.

Поддерживаются прямые вызовы:

```ts
transition({ type: "DONE" });
transition({ type: "DONE", meta: { actorId: "actor-1" } });
transition({ type: "DONE", meta: { groupId: ["group-1", "group-2"] } });
transition({ type: "DONE", meta: { groupTag: "workers" } });
transition.unscoped({ type: "DONE" });
transition.actor("id", { type: "DONE" });
transition.group(self.groupId, { type: "DONE" });
transition.tag(self.groupTag, { type: "DONE" });
```

Важное ограничение API: `transition.actor/group/tag/unscoped` существует только в actor effects, то есть в effects машины с `__INIT`. В domain effects поддерживается callable `transition(action)`, включая прямой routing через `action.meta`. Если parser видит `transition.actor(...)` в domain effect, он должен вернуть diagnostic, а не считать это валидной отправкой.

Прямой `transition({ type })` без routing meta сохраняется в IR как default-routing emission. Для симуляции одной машины это можно показывать как suggested local event, но для будущего анализа `MachineManager` важно не терять факт, что в коде не было явного `actorId/groupId/groupTag/unscoped`.

Внутри effect поддерживаются простые `if`/`else if`/`else` и `switch (action.type)` как источник условий для emissions. Условия сохраняются как текстовые labels и не вычисляются.

Не поддерживаются:

- `transition` передан как аргумент в другую вспомогательную функцию;
- `transition` сохранен в переменную и вызван позже;
- объект события создан сложным runtime expression;
- event type не является string literal или локальной const string literal;
- async ordering, timers, retries, cancellation semantics.

Если `transition` escape-ится за пределы прямого вызова, граф должен получить diagnostic:

```txt
transition escaped from effect; emitted events may be incomplete
```

Отправка события из effect не является state transition. Это отдельный слой графа:

```txt
entering STATE may emit EVENT
```

Симулятор может показывать такие события как suggested follow-up events, но базовая симуляция одной машины все равно разрешает вручную активировать любое событие, принимаемое текущим state.

Важно не склеивать effect emission и следующий accepted transition в одно ребро. Runtime выполняет это как два шага:

```txt
A --TO_B--> B
entering B may emit GO_C / GO_X
B --GO_C--> C
B --GO_X--> X
```

В IR это должно оставаться двумя слоями:

1. `GraphTransition`: какие события машина принимает и куда они переводят state.
2. `GraphEmission`: какие события effect может отправить после входа в state.

Для симуляции полного бизнес-сценария simulator может после перехода в `B` предложить emissions из `B` как продолжение. Если пользователь выбирает emission `GO_C`, simulator применяет его как обычное событие только если текущий state действительно принимает `GO_C` через `config`/wildcard/reducer branch. Если событие не принято, оно остается suggested emission с diagnostic/analyzer-подсказкой, но не двигает state.

Для v1 headless simulator автоматически применяет только local/default-routing emissions. Emissions с `actor`, `group`, `tag`, `unscoped` или `unknown` routing должны показываться в suggested list, но не применяться как локальный переход одной машины. Полноценная доставка таких событий относится к будущему symbolic system simulator поверх `MachineManager`.

### Middleware

Middleware в v1 не анализируются и не учитываются при построении графа.

## Универсальный формат IR

IR должен описывать предметную модель, а не раскладку UI. Координаты, размеры и UI-раскладка не являются частью базовой модели.

Черновые определения типов:

```ts
export type LiteFsmGraphDocument = {
  version: "lite-fsm.graph/v1";
  source: GraphSource;
  machines: LiteFsmGraphMachine[];
  managers: LiteFsmGraphManager[];
  diagnostics: GraphDiagnostic[];
};

export type LiteFsmGraphResult = {
  document: LiteFsmGraphDocument;
  diagnostics: GraphDiagnostic[];
};

export type GraphSource = {
  filename?: string;
  language: "ts" | "tsx" | "js" | "jsx" | "unknown";
  hash?: string;
};

export type LiteFsmGraphManager = {
  id: string;
  variableName?: string;
  machineRefs: Array<{
    key: string;
    machineId: string;
    loc?: SourceLocation;
  }>;
  loc?: SourceLocation;
};

export type LiteFsmGraphMachine = {
  id: string;
  index: number;
  variableName?: string;
  exportName?: string;
  managerKeys: string[];
  kind: "domain" | "actorTemplate" | "unknown";
  initialState?: string;
  initialContextSummary?: GraphValueSummary;
  groupTag?: string;
  persistence?: "runtime" | "snapshot" | "unknown";
  states: GraphState[];
  transitions: GraphTransition[];
  emissions: GraphEmission[];
  reducerCases: GraphReducerCase[];
  diagnostics: GraphDiagnostic[];
  loc?: SourceLocation;
};

export type GraphState = {
  id: string;
  key: string;
  kind: "normal" | "wildcard" | "init" | "terminal" | "unknown";
  isInitial: boolean;
  isPublicActorState: boolean;
  loc?: SourceLocation;
};

export type GraphTransition = {
  id: string;
  machineId: string;
  source: GraphStateRef;
  event: GraphEventRef;
  target: GraphTarget;
  layer: "config" | "reducer";
  order: number;
  guard?: GraphCondition;
  reducerCaseId?: string;
  confidence: "exact" | "partial" | "unknown";
  loc?: SourceLocation;
};

export type GraphEmission = {
  id: string;
  machineId: string;
  sourceState: GraphStateRef | "*";
  event: GraphEventRef;
  routing: GraphRouting;
  origin: "effect" | "unknown";
  guard?: GraphCondition;
  confidence: "exact" | "partial" | "unknown";
  loc?: SourceLocation;
};

export type GraphReducerCase = {
  id: string;
  event: GraphEventRef;
  guard?: GraphCondition;
  writesState: boolean;
  targets: GraphTarget[];
  confidence: "exact" | "partial" | "unknown";
  loc?: SourceLocation;
};

export type GraphStateRef =
  | { kind: "state"; stateId: string }
  | { kind: "wildcard" }
  | { kind: "unknown"; label?: string };

export type GraphEventRef = {
  type: string;
  source?: "config" | "reducer" | "effect" | "typeUnion" | "unknown";
};

export type GraphTarget =
  | { kind: "state"; stateId: string }
  | { kind: "self" }
  | { kind: "terminal"; terminal: "__RESOLVED" | "__REJECTED" | "__CANCELLED" }
  | { kind: "dynamic"; label?: string }
  | { kind: "blocked"; reason: string }
  | { kind: "unknown"; label?: string };

export type GraphRouting =
  | { kind: "default" }
  | { kind: "unscoped" }
  | { kind: "actor"; target: GraphRoutingTarget }
  | { kind: "group"; target: GraphRoutingTarget }
  | { kind: "tag"; target: GraphRoutingTarget }
  | { kind: "unknown"; label?: string };

export type GraphRoutingTarget =
  | { kind: "literal"; value: string }
  | { kind: "array"; items: GraphRoutingTarget[] }
  | { kind: "selfField"; field: "actorId" | "groupId" | "groupTag" }
  | { kind: "dynamic"; label?: string };

export type GraphCondition = {
  text: string;
  kind: "if" | "else-if" | "else" | "switch-case" | "ternary" | "unknown";
  loc?: SourceLocation;
};

export type GraphDiagnostic = {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  machineId?: string;
  loc?: SourceLocation;
};

export type SourceLocation = {
  start: { line: number; column: number; offset: number };
  end: { line: number; column: number; offset: number };
};

export type GraphValueSummary = {
  kind: "empty" | "literal" | "object" | "array" | "external" | "dynamic" | "unknown";
  text?: string;
};

export type MachineSelector =
  | { index: number }
  | { id: string }
  | { variableName: string }
  | { exportName: string }
  | { managerKey: string }
  | { managerId: string; managerKey: string };

export type SelectMachineGraphResult =
  | { ok: true; machine: LiteFsmGraphMachine; diagnostics: GraphDiagnostic[] }
  | { ok: false; candidates: LiteFsmGraphMachine[]; diagnostics: GraphDiagnostic[] };
```

`LiteFsmGraphDocument.diagnostics` является source of truth для compiler diagnostics документа. `LiteFsmGraphResult.diagnostics` - convenience mirror того же нормализованного списка без дополнительных entries; он нужен для короткого доступа вызывающего к diagnostics, но не хранит отдельный слой состояния.

## Выбор одной машины

Документ графа может содержать много машин, но UI и simulator должны уметь выбрать одну.

Селекторы:

```ts
selectMachineGraph(doc, { index: 0 });
selectMachineGraph(doc, { id: "trafficLight" });
selectMachineGraph(doc, { variableName: "trafficLight" });
selectMachineGraph(doc, { exportName: "trafficLight" });
selectMachineGraph(doc, { managerKey: "trafficLight" });
```

Если selector неоднозначен, API должен вернуть diagnostic и список candidates.

## Stable IDs

Stable IDs должны строиться от семантического пути, а не от source location. Source location хранится отдельно как metadata для подсветки и diagnostics, но не должна быть основой ID: перенос кода по файлу не должен менять идентификаторы графа.

Базовая стратегия:

1. `machineId`: первый доступный стабильный identity source в порядке `exportName`, `variableName`, unique `managerKey`, `default`, `index`.
2. `stateId`: `${machineId}:state:${stateKey}`.
3. `transitionId`: `${machineId}:transition:${layer}:${sourceKey}:${eventType}:${targetLabel}:${ordinal}`.
4. `reducerCaseId`: `${machineId}:reducer:${eventType}:${ordinal}`.
5. `emissionId`: `${machineId}:emission:${sourceState}:${eventType}:${routingLabel}:${ordinal}`.

`ordinal` считается внутри одинакового semantic bucket в порядке появления в source. Source offset можно использовать только как fallback для детерминированной сортировки одинаковых элементов, но не как публичную часть ID.

## Симулятор

Симулятор работает по IR графа, а не по среде исполнения `lite-fsm`.

Черновой API:

```ts
const sim = createGraphSimulator(machineGraph);

sim.start();
sim.getSnapshot();
sim.getAvailableTransitions();
sim.getSuggestedEmissions();
sim.send({ event: "NEXT" });
sim.choose({ transitionId: "..." });
sim.followEmission({ emissionId: "..." });
sim.restart();
```

Черновые публичные типы:

```ts
export type GraphSimulator = {
  start(): GraphSimulatorStartResult;
  restart(): GraphSimulatorStartResult;
  getSnapshot(): GraphSimulationSnapshot;
  getAvailableTransitions(): GraphAvailableTransition[];
  getSuggestedEmissions(): GraphSuggestedEmission[];
  send(input: GraphSendInput): GraphSendResult;
  choose(input: GraphChooseTransitionInput): GraphSendResult;
  followEmission(input: GraphFollowEmissionInput): GraphFollowEmissionResult;
};

export type GraphSimulatorStartResult =
  | { ok: true; snapshot: GraphSimulationSnapshot }
  | {
      ok: false;
      reason: "missing-active-actor-start" | "ambiguous-active-actor-start" | "unknown-start-state";
      candidates: GraphState[];
      diagnostics: GraphDiagnostic[];
    };

export type GraphSimulationSnapshot = {
  machineId: string;
  stateId: string;
  stateKey: string;
  history: GraphSimulationStep[];
};

export type GraphSimulationStep = {
  event: string;
  transitionId: string;
  emissionId?: string;
  cause: "external" | "effect";
  from: string;
  to: string;
  guard?: string;
  timestamp?: number;
};

export type GraphAvailableTransition = {
  transitionId: string;
  event: GraphEventRef;
  source: GraphStateRef;
  target: GraphTarget;
  layer: "config" | "reducer";
  guard?: GraphCondition;
  reducerCaseId?: string;
};

export type GraphSendInput = {
  event: string;
};

export type GraphChooseTransitionInput = {
  transitionId: string;
};

export type GraphSendResult =
  | {
      ok: true;
      snapshot: GraphSimulationSnapshot;
      step: GraphSimulationStep;
      suggestedEmissions: GraphSuggestedEmission[];
    }
  | {
      ok: false;
      reason: "not-started" | "event-not-accepted" | "ambiguous-transition" | "unknown-transition";
      snapshot?: GraphSimulationSnapshot;
      candidates?: GraphAvailableTransition[];
      diagnostics: GraphDiagnostic[];
    };

export type GraphSuggestedEmission = {
  emissionId: string;
  event: GraphEventRef;
  routing: GraphRouting;
  guard?: GraphCondition;
  canFollowLocally: boolean;
  blockedReason?: string;
};

export type GraphFollowEmissionInput = {
  emissionId: string;
};

export type GraphFollowEmissionResult =
  | {
      ok: true;
      snapshot: GraphSimulationSnapshot;
      step: GraphSimulationStep;
    }
  | {
      ok: false;
      reason: "event-not-accepted" | "non-local-routing" | "unknown-emission";
      snapshot: GraphSimulationSnapshot;
      emission?: GraphSuggestedEmission;
    };
```

Правила:

1. Симулятор моделирует границу одной машины.
2. Любое событие, принятое текущим state через `config`/wildcard/reducer branch, считается доступным для внешней отправки.
3. Источник события не важен: UI, другая машина, effect, actor или тест.
4. Отправки событий из effects показываются как suggested events, но не блокируют ручной выбор принимаемых событий.
5. `getSuggestedEmissions()` возвращает emissions, применимые к текущему state после последнего шага симуляции. State-specific effect связывается с входом в этот state; wildcard effect связывается с wildcard source.
6. `followEmission({ emissionId })` применяет emission как следующий event только если `canFollowLocally === true`: routing является `default`, а текущий state принимает event через `config`/wildcard/reducer branch.
7. Если emission имеет guard/condition, simulator не вычисляет его. UI выбирает конкретную emission branch так же, как guarded/reducer branch.
8. Ветки reducer с несколькими target-ами становятся выбираемыми ветками.
9. Guards не вычисляются. UI выбирает конкретную ветку.
10. `null` target считается self target, если reducer не дал более точную ветку.
11. Terminal target для actor template переводит symbolic snapshot в terminal pseudo-state. UI может дополнительно показать это как disposed actor, но v1 симулятор не удаляет actor record и не моделирует полный `MachineManager`.

Для actor template нужны два режима:

```ts
type ActorSimulationMode = "spawnLifecycle" | "activeActor";
```

- `spawnLifecycle`: стартует из `__INIT` и показывает spawn transitions.
- `activeActor`: стартует из выбранного public state, чтобы симулировать уже созданного актора.

Решение для default state:

1. Для actor template режим по умолчанию - `spawnLifecycle`.
2. `activeActor` должен получать явный `startState`.
3. Если `activeActor.startState` не задан, simulator может вывести default только когда из `__INIT` достижим ровно один public non-terminal state. Во всех остальных случаях он должен вернуть diagnostic/blocked start и попросить выбрать state явно.

Reducer/config layering:

1. IR всегда хранит оба слоя: `config` acceptance и `reducer` refinements.
2. Reducer branch не удаляет и не перезаписывает config transition.
3. В simulator reducer branch считается effective target для выбранной ветки события.
4. `config: null` остается видимым self/targetless acceptance и используется как fallback, если reducer не дал выбранной ветки.
5. UI должен показывать config edge и reducer-derived target как разные слои, а не терять один из них.

Effect emission following:

1. Emission не является transition и не меняет snapshot сама по себе.
2. После успешного `send`/`choose` simulator может вычислить suggested emissions для нового state.
3. Пользователь может выбрать одну suggested emission и применить ее как следующий event.
4. Follow-up event проходит через тот же resolver доступных transitions, что и внешний `send`.
5. Если event не принят текущим state, simulator не меняет snapshot и должен вернуть blocked follow result с причиной `event-not-accepted`.
6. Если emission имеет routing не `default`, simulator одной машины не доставляет его локально. Такой emission остается видимым для UI/analyzer и будущего system simulator.
7. Автоматический режим `auto-unambiguous` может сам применить только одну однозначную local/default emission без guard-а. Если emissions несколько или есть guard, simulator должен вернуть choices и ждать выбора UI/пользователя.
8. Автоматический режим follow-up должен иметь ограничение глубины, чтобы не зависнуть на циклах вида `B -> effect GO_B -> B`.

## Diagnostics

Diagnostics - часть результата, а не исключение.

Примеры diagnostic-кодов:

```txt
LFG_UNKNOWN_CONFIG_IDENTIFIER
LFG_UNSUPPORTED_DYNAMIC_KEY
LFG_UNSUPPORTED_DYNAMIC_TARGET
LFG_UNRESOLVED_TARGET_STATE
LFG_UNREACHABLE_STATE
LFG_DEAD_END_STATE
LFG_ACTOR_INIT_STATE_MISMATCH
LFG_REDUCER_DYNAMIC_STATE_WRITE
LFG_REDUCER_EVENT_NOT_ACCEPTED
LFG_REDUCER_HELPER_MUTATION_UNSUPPORTED
LFG_EFFECT_TRANSITION_ESCAPED
LFG_EFFECT_DYNAMIC_EVENT_TYPE
LFG_EFFECT_ACTOR_ROUTING_ON_DOMAIN
LFG_EFFECT_EVENT_NOT_ACCEPTED
LFG_WILDCARD_TRANSITION_SHADOWED
LFG_IMPORT_VALUE_UNRESOLVED
LFG_AMBIGUOUS_MACHINE_SELECTOR
```

Уровни diagnostics:

- `info`: граф построен, есть полезная подсказка;
- `warning`: граф частичный или может быть неполным;
- `error`: конкретная машина не может быть надежно построена, но document все равно может содержать другие машины.

## Публичный API

Решение: проект переходит на монорепу и scoped packages `@lite-fsm/*`. Миграция монорепы описывается отдельным ТЗ, а эта спецификация graph compiler-а считает ее базовой инфраструктурной предпосылкой.

Целевая структура пакетов:

```txt
@lite-fsm/core        runtime createMachine, MachineManager, core types
@lite-fsm/react       React bindings
@lite-fsm/middleware  optional middleware packages/entrypoints
@lite-fsm/graph       private/experimental graph compiler workspace до стабилизации API
@lite-fsm/cli         будущий CLI package; не является обязательным publish target v1
```

Graph API не должен жить внутри runtime-пакета. `@lite-fsm/core` не зависит от `@lite-fsm/graph`, `ts-morph`, TypeScript parser tooling или CLI. Это сохраняет lightweight runtime и позволяет graph tooling развиваться отдельно.

На первом этапе `@lite-fsm/graph` остается private/experimental workspace package и не входит в fixed release group runtime-пакетов. Runtime fixed group включает `@lite-fsm/core`, `@lite-fsm/react`, `@lite-fsm/middleware` и `@lite-fsm/persist`.

Export:

```txt
@lite-fsm/graph
```

Черновые exports:

```ts
export function compileLiteFsmGraph(
  source: string,
  options?: CompileLiteFsmGraphOptions,
): LiteFsmGraphResult;

export function selectMachineGraph(
  document: LiteFsmGraphDocument,
  selector?: MachineSelector,
): SelectMachineGraphResult;

export function analyzeLiteFsmGraph(
  document: LiteFsmGraphDocument,
  options?: AnalyzeLiteFsmGraphOptions,
): GraphAnalysisResult;

export function createGraphSimulator(
  machine: LiteFsmGraphMachine,
  options?: GraphSimulatorOptions,
): GraphSimulator;
```

Опции:

```ts
export type CompileLiteFsmGraphOptions = {
  filename?: string;
  language?: "ts" | "tsx" | "js" | "jsx";
  parser?: "static";
  maxMachines?: number;
};

export type ActorSimulationMode = "spawnLifecycle" | "activeActor";
export type EffectFollowMode = "manual" | "auto-unambiguous";

export type GraphSimulatorOptions = {
  actorMode?: ActorSimulationMode;
  startState?: string;
  effectFollowMode?: EffectFollowMode;
  maxEffectFollowDepth?: number;
};

export type AnalyzeLiteFsmGraphOptions = {
  rules?: GraphAnalysisRuleId[];
  strict?: boolean;
  scope?: { machineId?: string; managerId?: string };
};

export type GraphAnalysisResult = {
  diagnostics: GraphDiagnostic[];
};

export type GraphAnalysisRuleId =
  | "unknown-target"
  | "unreachable-state"
  | "dead-end-state"
  | "actor-template-shape"
  | "reducer-config-consistency"
  | "effect-event-acceptance"
  | "wildcard-shadowing";
```

`trustedEval` не входит в v1 API. Parser mode в v1 только `"static"`. Идею trusted evaluation можно исследовать отдельно, но она не должна появляться в публичном API, пока не будет доказана практическая необходимость и безопасная граница применения.

## CLI

Черновые команды:

```bash
npx @lite-fsm/cli graph ./xstate/examples.ts
npx @lite-fsm/cli graph ./xstate/examples.ts --list-machines
npx @lite-fsm/cli graph ./xstate/examples.ts --machine p3
npx @lite-fsm/cli graph --stdin --machine trafficLight
npx @lite-fsm/cli graph ./src/store.ts --format json
```

CLI должен читать файлы/stdin и передавать строку в тот же `compileLiteFsmGraph`.

CLI не должен добавлять режим проекта в v1.

Решение: CLI поставляется отдельным пакетом `@lite-fsm/cli` и зависит от `@lite-fsm/graph`. Зависимости CLI не должны попадать в runtime package.

## Реализация парсера

Использовать `ts-morph` за внутренним адаптером.

Причины:

1. Навигация по AST проще, чем через raw TypeScript compiler API.
2. Хорошо подходит для файлов исходника, созданных из строки.
3. Можно получать текст исходника и позиции для diagnostics.
4. При необходимости можно провалиться к raw compiler nodes.

Граница адаптера:

```txt
строка исходника
  -> SourceAdapter над ts-morph
  -> SourceCatalog / binding layer
  -> MachineCandidate / ManagerCandidate discovery
  -> PartialEvaluator
  -> feature compilers: config / manager / reducer / effects
  -> GraphAssembler
  -> LiteFsmGraphDocument
```

Не экспортировать типы `ts-morph` из публичного API.

### Внутренняя архитектура compiler-а

Решение для v1: фиксированный compiler pipeline и внутренние registries маленьких правил. Публичную plugin API не добавлять до стабилизации `@lite-fsm/graph` и появления нескольких реальных расширений. Это сохраняет ядро расширяемым, но не закрепляет преждевременно внутренние AST-контракты как публичный API.

Цель архитектуры: новый поддерживаемый синтаксический кейс должен добавляться локально - новым resolver/rule в нужном слое, минимальным fixture-примером и тестом. Он не должен требовать правок в config compiler-е, reducer compiler-е, effects compiler-е и assembler-е одновременно.

Внутренние контракты:

```ts
type CompilerContext = {
  source: SourceAdapter;
  catalog: SourceCatalog;
  evaluator: PartialEvaluator;
  diagnostics: DiagnosticSink;
};

type CompilerPass<Input, Output> = {
  name: string;
  run(input: Input, context: CompilerContext): Output;
};

type PatternRule<RuleContext, Result> = {
  name: string;
  match(node: AstNodeRef, context: RuleContext): boolean;
  read(node: AstNodeRef, context: RuleContext): Result;
};
```

Эти типы являются внутренними. Они не экспортируются из `@lite-fsm/graph` как публичный extension API.

Внутренние слои:

1. `SourceAdapter` скрывает `ts-morph`, нормализует `loc`, text ranges и базовые операции чтения AST.
2. `SourceCatalog` строится один раз и хранит import provenance, локальные `const`, known API names, candidate calls и быстрые lookup-таблицы.
3. `CandidateDiscovery` находит `MachineCandidate[]` и `ManagerCandidate[]`, но не строит graph transitions.
4. `PartialEvaluator` раскрывает поддерживаемое TypeScript-подмножество без знания FSM-семантики.
5. Feature compilers (`ConfigCompiler`, `ManagerLinker`, `ReducerCompiler`, `EffectsCompiler`) читают candidates/evaluator и возвращают независимые graph slices.
6. `GraphAssembler` объединяет slices, назначает stable IDs, сортирует сущности и нормализует diagnostics.

Partial evaluator должен быть registry-based. Базовые resolvers v1:

1. `StringLiteralResolver`;
2. `NullLiteralResolver`;
3. `ArrayLiteralResolver`;
4. `ObjectLiteralResolver`;
5. `LocalConstIdentifierResolver`;
6. `AsConstResolver`;
7. `SatisfiesResolver`;
8. `ParenthesizedExpressionResolver`;
9. `ObjectSpreadResolver`;
10. `ComputedKeyResolver`;
11. `TransparentWrapperResolver` для `createConfig(...)`, `createReducer(...)`, `createEffect(...)` только в ожидаемых позициях.

Evaluator возвращает structured result, а не бросает исключение:

```ts
type GraphObjectProperty = {
  key: string;
  value: GraphValue;
  loc?: SourceLocation;
};

type GraphValue =
  | { kind: "string"; value: string; loc?: SourceLocation }
  | { kind: "null"; loc?: SourceLocation }
  | { kind: "array"; items: GraphValue[]; loc?: SourceLocation }
  | { kind: "object"; properties: GraphObjectProperty[]; loc?: SourceLocation }
  | { kind: "function"; node: AstNodeRef; loc?: SourceLocation };

type EvaluationResult =
  | { kind: "known"; value: GraphValue; loc?: SourceLocation }
  | { kind: "external"; label: string; loc?: SourceLocation }
  | { kind: "dynamic"; label?: string; loc?: SourceLocation }
  | { kind: "unsupported"; code: string; message: string; loc?: SourceLocation };
```

Feature compilers должны возвращать slices:

```ts
type MachineGraphSlices = {
  candidate: MachineCandidate;
  config?: ConfigGraphSlice;
  reducer?: ReducerGraphSlice;
  effects?: EffectsGraphSlice;
  managerKeys: string[];
  diagnostics: GraphDiagnostic[];
};
```

Разделение ответственности:

1. `ConfigCompiler` не раскрывает identifiers, spreads, wrappers или computed keys вручную; для этого используется `PartialEvaluator`.
2. `ReducerCompiler` не проверяет consistency с `config`; он извлекает reducer cases и reducer-layer transitions.
3. `EffectsCompiler` не превращает emissions в state transitions и не проверяет, принимает ли машина emitted event.
4. `ManagerLinker` не пересобирает машины; он связывает уже найденные candidates с manager keys.
5. `GraphAssembler` не читает AST и не содержит pattern matching для `switch`, `if`, `createEffect`, spread или routing.
6. Semantic diagnostics остаются в analyzer-е на базе IR, а compiler diagnostics ограничены извлечением исходника.

## Анализ корректности на базе IR

Анализ корректности должен быть отдельным слоем после построения `LiteFsmGraphDocument`.

Разделение ответственности:

1. Compiler/parser строит IR из строки исходника и возвращает diagnostics о непонятых или неподдержанных формах кода.
2. Analyzer получает уже готовый `LiteFsmGraphDocument` и проверяет семантическую корректность графа.
3. Analyzer не использует `ts-morph`, исходный AST, project mode, файловую систему или import resolution.
4. UI, CLI, simulator и будущий codegen могут запускать analyzer повторно после любых изменений IR.

Это важно для архитектуры: весь прикладной анализ автомата должен опираться на универсальный IR, а не на внутренности parser-а. Исключение - diagnostics, связанные с извлечением исходника: синтаксическая ошибка, неизвестный identifier, dynamic target, escaped transition и неподдержанная форма AST. Такие diagnostics остаются ответственностью compiler-а.

Возможные анализаторы:

1. Недостижимые состояния.
2. Объявленное целевое состояние не существует.
3. Событие принято в `config`, но reducer никогда не пишет `state.state`.
4. Reducer пишет target, которого нет в `config`.
5. `null` config target, но reducer имеет несколько динамических targets.
6. Шаблон актора имеет некорректный `__INIT` setup.
7. Terminal state используется как config key.
8. Wildcard transition перекрыт state-specific transition.
9. Effect отправляет событие, которое не принимает ни одно состояние.
10. State не имеет исходящих transitions и не помечен как намеренно terminal.

Результат analyzer-а - список `GraphDiagnostic[]`. Он не должен мутировать документ. Если UI хочет показать diagnostics вместе с IR, он может объединить compiler diagnostics и analysis diagnostics на уровне приложения.

Минимальный набор правил для v1:

1. `unknown-target`: transition target не найден среди states или terminal targets.
2. `unreachable-state`: normal state недостижим из `initialState`.
3. `dead-end-state`: state не имеет исходящих transitions и не является terminal/намеренно конечным. По умолчанию severity `info`; в `strict` mode может быть `warning`.
4. `actor-template-shape`: actor template нарушает правила `__INIT`, reserved states, terminal targets или `initialState`.
5. `reducer-config-consistency`: reducer пишет target для события, которое не принято через `config`/wildcard, или пишет неизвестный target.
6. `effect-event-acceptance`: effect emits event, который не принимается ни одной машиной в текущем document/scope. Для single-machine snippets и неполного документа по умолчанию severity `info`; для явно выбранного manager scope или `strict` mode может быть `warning`.
7. `wildcard-shadowing`: wildcard transition перекрыт state-specific transition и может быть подсвечен как info.

## Направление codegen

Будущее направление:

```txt
diagram -> LiteFsmGraphDocument -> generated createMachine code
строка исходника -> LiteFsmGraphDocument -> diagram
```

Обратимость должна быть явно ограничена:

1. Декларативные `config` edges можно генерировать и редактировать.
2. Выведенные ветки reducer/effect остаются read-only, если их не перевели в ручные метаданные графа.
3. Произвольный код реализации должен сохраняться вне генерируемых регионов.
4. Генерируемый код должен целиться в предсказуемое подмножество:

```ts
export const machine = createMachine({
  config: { ... },
  initialState: "...",
  initialContext: {},
  reducer: (state, action, { nextState }) => {
    state.state = nextState;
  },
});
```

Для будущего codegen каждая сущность графа должна иметь stable ID:

- state id;
- transition id;
- emission id;
- reducer case id.

Стабильные ID позволяют делать правки из UI, diffing, comments, diagnostics и обновление generated-code.

Ручные metadata для diagram/codegen не входят в v1. В v1 IR не хранит координаты, layout hints, generated regions или editable annotations. Эти поля стоит добавлять только после появления первого codegen/editing сценария, чтобы не закрепить преждевременный формат.

## Предлагаемые этапы

Каждый этап должен быть законченным проверяемым куском. После любого этапа код должен собираться, а результат этапа должен иметь тесты по fixture-ам или snapshot-ам. Если этап добавляет новый слой, он не должен требовать знания внутренностей предыдущего слоя кроме публичного/внутреннего контракта, описанного в ТЗ.

Для этапов, которые меняют `@lite-fsm/graph`, обязательная проверка этапа: `pnpm --filter @lite-fsm/graph check-types`, плюс релевантные Vitest/Tstyche tests. Если этап меняет build exports, package surface или dist contract, дополнительно запускать `pnpm --filter @lite-fsm/graph build`. Не использовать root `pnpm run build` и не считать `pnpm run build:packages` достаточной проверкой graph compiler-а: root build запрещен для агентной проверки, а `build:packages` исключает `@lite-fsm/graph`.

### Этап 0: каркас `@lite-fsm/graph` и контракты IR

Цель: зафиксировать публичные IR-типы, тестовую инфраструктуру и внутренние контракты compiler pipeline до реализации анализа AST.

Состав:

1. После миграции монорепы добавить пакет `@lite-fsm/graph`.
2. Описать типы `LiteFsmGraphDocument`, `LiteFsmGraphMachine`, transitions, emissions, reducer cases, diagnostics, selectors.
3. Добавить `compileLiteFsmGraph(source)` как заглушку, которая возвращает пустой document без падения.
4. Добавить тестовый harness, который читает `tests/graph/fixtures/graph-sources.ts` как строку.
5. Добавить внутренние типы/контракты для `SourceAdapter`, `SourceCatalog`, `CompilerContext`, `CompilerPass`, `PatternRule`, graph slices и `DiagnosticSink`.
6. Добавить минимальный контракт `GraphAssembler`/stable-id builder: сборка пустого document, нормализация diagnostics, базовое назначение semantic IDs и сборка config-only slices без чтения AST.
7. Добавить базовые тесты публичных типов.

Проверка:

1. `compileLiteFsmGraph("")` возвращает валидный пустой `LiteFsmGraphDocument`.
2. Fixture-файл читается как строка в тестах.
3. Type tests подтверждают форму публичного API.
4. Внутренний pipeline можно создать с no-op passes без обращения к `ts-morph` из публичных exports.
5. Минимальный `GraphAssembler` собирает пустой document и hand-written config-only slice, не читая AST и не выполняя pattern matching.

### Этап 1: source catalog, API provenance и обнаружение candidates

Цель: научиться находить кандидаты `createMachine`/`MachineManager` без построения graph transitions.

Состав:

1. Парсить строку через `ts-morph` без project mode.
2. Реализовать `SourceAdapter`, чтобы остальные слои не зависели напрямую от типов `ts-morph`.
3. Построить `SourceCatalog`: import provenance map, local const declarations, known API names и call lookup.
4. Найти `MachineCandidate[]`: вызовы `createMachine`, alias-импорты, ambient `createMachine`, `export default createMachine(...)`.
5. Найти `ManagerCandidate[]`: `MachineManager(...)`, alias-импорты и inline `createMachine(...)` внутри manager object.
6. Сохранить `variableName`, `exportName`, `managerKey`, `index`, `loc` в candidates.
7. Игнорировать alias chains без import provenance и неподдержанные похожие imports.

Проверка:

1. По `tests/graph/fixtures/graph-sources.ts` возвращается ожидаемое число machine candidates.
2. Alias import, ambient shape guard, default export и inline manager machine покрыты отдельными тестами.
3. Неподдержанный alias chain не распознается как machine.
4. Следующие этапы могут читать только `SourceCatalog`/candidates, не сканируя source заново.

### Этап 2: partial evaluator для поддерживаемого подмножества

Цель: отдельно реализовать вычисление простых AST-значений, не привязывая его к FSM.

Состав:

1. Реализовать `PartialEvaluator` как registry resolvers, а не как один большой `switch` по всем будущим кейсам.
2. Поддержать object literals, local `const`, string literals, null, arrays.
3. Поддержать `as const`, `satisfies`, parenthesized expressions.
4. Поддержать spreads из локальных object literals.
5. Поддержать computed keys из local const string.
6. Поддержать transparent wrappers `createConfig({ ... })`, `createReducer(fn)`, `createEffect({ effect })` в ожидаемых позициях.
7. Возвращать structured result: `known`, `external`, `dynamic`, `unsupported` с `loc` и diagnostic metadata.
8. Не добавлять FSM-specific правила в evaluator: state/event/target/routing интерпретируют feature compilers.

Проверка:

1. Unit tests без `createMachine`: evaluator раскрывает literals/spreads/computed keys.
2. Dynamic target и external identifier дают контролируемый result, а не exception.
3. Evaluator не читает файловую систему и не резолвит imports.
4. Новый resolver можно протестировать изолированно без изменения config/reducer/effects tests.

### Этап 3: config graph compiler

Цель: построить полезный graph document только по `config`.

Состав:

1. Для каждого machine candidate через `PartialEvaluator` извлечь `config`, `initialState`, `initialContextSummary`, `groupTag`, `persistence`.
2. Построить `ConfigGraphSlice`: states, transitions слоя `config`, machine facts и diagnostics.
3. Поддержать wildcard `"*"`, `null`, terminal targets, dynamic targets.
4. Определить `kind: "domain" | "actorTemplate" | "unknown"` по evaluated `config`.
5. Сохранить source locations; `ConfigCompiler` возвращает slice без публичных IDs, а минимальный `GraphAssembler` из этапа 0 собирает config-only document со stable IDs.
6. Вернуть compiler diagnostics только для неподдержанного исходника: unknown config identifier, dynamic key, dynamic target.
7. Не раскрывать identifiers/spreads/wrappers внутри config compiler-а напрямую.

Проверка:

1. `directObjectMachine`, `localConstConfigMachine`, `computedKeysMachine`, `satisfiesMachine`, `wildcardMachine`, `helperWrappedMachine` строятся по config.
2. Actor template получает `kind: "actorTemplate"` и terminal targets.
3. Diagnostic-примеры с external config и dynamic target не ломают document.
4. Config compiler tests используют mocked/evaluated values там, где не проверяется сам evaluator.

### Этап 4: manager linker и выбор одной машины

Цель: связать уже найденные машины с `MachineManager` и дать стабильный selector API.

Состав:

1. Из `ManagerCandidate[]` и machine identity map построить `ManagerLinkSlice`.
2. Построить `LiteFsmGraphManager[]`.
3. Заполнить `managerKeys` у машин через slice, не пересканируя AST.
4. Поддержать manager object literal и local const manager map через `PartialEvaluator`.
5. Реализовать `selectMachineGraph(document, selector)`.
6. Обрабатывать неоднозначный selector через diagnostic и candidates.

Проверка:

1. `manager`, `renamedManager` и `inlineManager` из fixture-а дают ожидаемые manager refs.
2. `selectMachineGraph` выбирает по `index`, `id`, `variableName`, `exportName`, `managerKey`, `{ managerId, managerKey }`.
3. Неоднозначный `managerKey` возвращает candidates, а не случайную машину.
4. Inline machine получает тот же candidate/assembler path, что и top-level machine.

### Этап 5: reducer branch compiler

Цель: добавить символические ветки reducer поверх уже построенного config graph.

Состав:

1. Реализовать `ReducerCompiler` как registry rules для reducer function body.
2. Поддержать inline reducer function и `reducer: createReducer(fn)` через evaluator/wrapper resolver.
3. Поддержать `switch (action.type)`.
4. Поддержать `if`/`else if`/`else` с `action.type === "..."`.
5. Поддержать прямые записи `state.state = ...`, `s.state = ...`, `state.state = nextState`.
6. Поддержать ternary targets и простой `return { state, context }`.
7. Создавать `ReducerGraphSlice`: `GraphReducerCase[]`, transitions слоя `reducer`, diagnostics.
8. Сохранять guard text как `GraphCondition`, не вычисляя его.
9. Не проверять consistency reducer/config в compiler-е.

Reducer source contract:

1. `ReducerCompiler` извлекает `GraphReducerCase[]` независимо от consistency с `config`.
2. Reducer-layer `GraphTransition` создается только через join reducer case с уже принятой config/wildcard acceptance.
3. Для state-specific config acceptance `source` reducer transition указывает на конкретный state.
4. Для wildcard acceptance `source` reducer transition равен `{ kind: "wildcard" }`; simulator применяет его как fallback, если в текущем state нет state-specific acceptance.
5. Если reducer event не принят через config/wildcard, reducer case сохраняется, но reducer transition не создает новую acceptance; это проверяет analyzer rule `reducer-config-consistency`.

Проверка:

1. `switchReducerMachine`, `ifReducerMachine`, `chainedIfReducerMachine`, `returnObjectReducerMachine`, `helperWrappedMachine` дают expected reducer cases.
2. Reducer targets не удаляют config transitions, а добавляются отдельным слоем.
3. Unsupported reducer mutation/helper call дает partial diagnostic без падения.
4. Новое reducer rule можно проверить на функции reducer-а без полного machine fixture.

### Этап 6: effects emission compiler

Цель: добавить слой отправляемых событий из effects, не превращая их в state transitions.

Состав:

1. Реализовать `EffectsCompiler` как registry rules для effects object, effect function body и routing.
2. Поддержать inline effects object и local const effects object.
3. Поддержать plain effect function inline/local const.
4. Поддержать `createEffect({ effect })`, local `createEffect`, `type`, `cancelFn`.
5. Поддержать state-specific, wildcard и computed effect keys.
6. Поддержать прямой `transition({ type })`.
7. Поддержать `transition({ type, meta: { actorId/groupId/groupTag } })`.
8. Поддержать `transition.actor/group/tag/unscoped` только для actor effects.
9. Поддержать `if`/`else if`/`else` и `switch(action.type)` labels внутри effect.
10. Детектить escaped `transition`.
11. Создавать `EffectsGraphSlice`: `GraphEmission[]` и diagnostics.
12. Не проверять acceptance emitted events в compiler-е.

Проверка:

1. `plainEffectsMachine`, `createEffectMachine`, `localEffectsMachine`, `localEffectsObjectMachine`, `ifEffectMachine`, `switchEffectMachine`, `wildcardEffectMachine`, `computedWildcardCreateEffectMachine` дают expected emissions.
2. `domainWithMetaTransitionMachine` распознает routing через `meta`.
3. `actorTemplate` и `actorWildcardEffectTemplate` распознают actor routing sugar.
4. `escapedTransitionMachine` возвращает diagnostic.
5. Routing resolver tests покрывают default/meta/sugar routing без полного graph assembler-а.

### Этап 7: полная интеграция assembler-а всех slices

Цель: расширить минимальный `GraphAssembler` до сборки всех compiler-слоев в стабильный `LiteFsmGraphDocument`.

Состав:

1. Расширить `GraphAssembler`, чтобы он объединял source catalog, candidates, config slices, manager link slice, reducer slices и effects slices.
2. Нормализовать document-level и machine-level diagnostics.
3. Применить общий stable-id builder для states, transitions, emissions, reducer cases.
4. Детерминированно сортировать machines, managers, transitions, reducer cases, emissions и diagnostics.
5. Добавить snapshot tests полного документа по `tests/graph/fixtures/graph-sources.ts`.
6. Не запускать semantic analyzer внутри compiler по умолчанию.
7. Не читать AST и не выполнять pattern matching внутри assembler-а.

Проверка:

1. `compileLiteFsmGraph(fixtureSource)` возвращает document со всеми валидными машинами, managers, transitions, reducer cases и emissions.
2. Повторный запуск на том же source дает те же IDs.
3. Compiler diagnostics относятся только к извлечению исходника, а не к semantic analysis.
4. Удаление/добавление feature compiler slice меняет только соответствующий слой документа, а не contract assembler-а.

### Этап 8: анализ корректности на базе IR

Цель: реализовать отдельный semantic analyzer, который работает только поверх `LiteFsmGraphDocument`.

Состав:

1. Реализовать `analyzeLiteFsmGraph(document)`.
2. Analyzer не использует AST, `ts-morph`, source files или import resolution.
3. Реализовать rules v1: `unknown-target`, `unreachable-state`, `dead-end-state`, `actor-template-shape`, `reducer-config-consistency`, `effect-event-acceptance`, `wildcard-shadowing`.
4. Возвращать `GraphDiagnostic[]` с `machineId` и `loc`, если `loc` есть в IR.
5. Оставить compiler diagnostics и analyzer diagnostics различимыми.

Проверка:

1. Analyzer тестируется на hand-written IR fixtures и на document из `tests/graph/fixtures/graph-sources.ts`.
2. Analyzer можно запустить повторно после ручного изменения IR без повторного parsing-а source.
3. CLI/UI могут объединить diagnostics, но API сохраняет отдельный `GraphAnalysisResult`.

### Этап 9: headless simulator одной машины

Цель: реализовать симуляцию без UI и без исполнения пользовательского кода.

Состав:

1. Реализовать `createGraphSimulator(machineGraph)`.
2. Стартовать из `initialState` или actor simulation mode.
3. Вычислять доступные transitions с учетом state-specific edges, wildcard fallback и reducer branches.
4. Давать выбрать конкретную guarded/reducer ветку.
5. Поддержать self transitions, dynamic/unknown targets и terminal targets.
6. Показывать effect emissions как suggested events, не превращая их в state transition.
7. Поддержать `followEmission`, чтобы выбранный local/default emission применялся как следующий accepted event.
8. Добавить защиту от бесконечного auto-follow цикла через `maxEffectFollowDepth`.

Проверка:

1. Симулятор проходит сценарии vending/traffic-light и несколько машин из fixture-а.
2. Любое событие, принятое текущим state, можно отправить вручную независимо от source события.
3. Guards и reducer branches выбираются символически, без исполнения условий.
4. Сценарий `A --TO_B--> B`, где effect `B` условно emits `GO_C` или `GO_X`, показывает обе suggested emissions и позволяет выбрать продолжение `B --GO_C--> C` или `B --GO_X--> X`.
5. Emission для event, который текущий state не принимает, не меняет snapshot и возвращает blocked follow result.

### Этап 10: CLI

Цель: сделать compiler и analyzer доступными как headless-инструмент.

Состав:

1. `@lite-fsm/cli graph --stdin`.
2. `@lite-fsm/cli graph <file>`.
3. `--list-machines`.
4. `--machine`.
5. `--format json`.
6. Опциональный вывод analysis diagnostics.

Проверка:

1. CLI из пакета `@lite-fsm/cli` читает файл/stdin и передает строку в `compileLiteFsmGraph`.
2. CLI не добавляет project mode и не резолвит imports.
3. Snapshot tests CLI output покрывают list-machines, selected machine и diagnostics.

### Этап 11: UI view-model и layout adapter

Цель: отделить IR от конкретного UI и библиотеки отрисовки.

Состав:

1. Преобразовать `LiteFsmGraphMachine` в render model: nodes, edges, labels, badges, emissions, diagnostics anchors.
2. Выбрать layout adapter или оставить layout pluggable.
3. Не хранить координаты в базовом IR.
4. Поддержать view-model для state graph, emissions overlay и selected transition details.

Проверка:

1. Snapshot tests render model на fixture-машинах.
2. Render model не требует DOM и может использоваться в CLI/debug output.
3. Layout adapter можно заменить без изменения IR.

### Этап 12: Sketch-like UI

Цель: собрать интерактивный визуализатор поверх готового compiler/analyzer/simulator/view-model.

Состав:

1. Редактор исходной строки в духе Sketch.
2. Выбор машины из document.
3. Диаграмма из render model.
4. Панель симуляции одной машины.
5. Панель diagnostics.
6. Возможность копировать/вставлять source без project mode.

Проверка:

1. Вставка `tests/graph/fixtures/graph-sources.ts` показывает список машин и не ломает UI.
2. Можно выбрать одну машину из многих и симулировать только ее.
3. Diagnostics подсвечивают source locations, если они есть.

## Закрытые решения

1. Проект переходит на монорепу и scoped packages `@lite-fsm/*`; миграция монорепы будет описана отдельным ТЗ.
2. Runtime живет в `@lite-fsm/core`; graph tooling живет отдельно в `@lite-fsm/graph` и не попадает в runtime dependencies.
3. `@lite-fsm/graph` на первом этапе private/experimental и не публикуется вместе с runtime fixed group.
4. CLI живет отдельно в `@lite-fsm/cli` и зависит от `@lite-fsm/graph`, но не является обязательным publish target до стабилизации graph API.
5. `trustedEval` не входит в v1 API. Единственный parser mode v1 - static parser.
6. Ручные graph/codegen metadata не входят в v1 и появятся только после реального сценария редактирования диаграммы или codegen.
7. Stable IDs строятся от semantic path; source location хранится отдельно и не является публичной частью ID.
8. Actor template simulation по умолчанию использует `spawnLifecycle`. `activeActor` требует явный `startState`, кроме случая с единственным однозначным public state.
9. Reducer-derived targets не перекрывают `config` слой в IR. UI и simulator используют reducer layer как effective branch, но сохраняют config acceptance видимым.
10. `dead-end-state` и `effect-event-acceptance` остаются analyzer rules, но по умолчанию не должны создавать жесткий warning для неполных single-machine snippets.

## Итоговая рекомендация

После миграции в монорепу собрать `@lite-fsm/graph` как статический компилятор графа со строкой исходника на входе и символическим симулятором одной машины.

Не делать режим проекта. Не исполнять код приложения. Не пытаться вывести произвольный JavaScript.

Это сохраняет близость к продуктовой идее Sketch, но лучше подходит для `lite-fsm`: один и тот же документ графа сможет питать визуализацию, CLI, диагностику, правила линтинга, анализ и будущую генерацию кода.
