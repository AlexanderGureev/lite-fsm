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

Файл [`xstate/graph-parser-fixtures.ts`](xstate/graph-parser-fixtures.ts) является основным fixture-набором для будущего parser-а. В нем собраны разные валидные и диагностические формы объявления `createMachine`, `createEffect`, `createConfig`, `createReducer` и `MachineManager`, которые parser должен корректно разобрать из одной строки исходника и преобразовать в `LiteFsmGraphDocument`.

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
  -> selectMachine(...)
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
- `"../src/core"` для текущих fixture-ов и внутренних тестов до миграции в монорепу.

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

Симулятор может показывать такие события как suggested/auto, но базовая симуляция одной машины все равно разрешает вручную активировать любое событие, принимаемое текущим state.

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
sim.send({ event: "NEXT" });
sim.choose({ transitionId: "..." });
sim.restart();
```

Черновой snapshot:

```ts
export type GraphSimulationSnapshot = {
  machineId: string;
  stateId: string;
  stateKey: string;
  history: GraphSimulationStep[];
};

export type GraphSimulationStep = {
  event: string;
  transitionId: string;
  from: string;
  to: string;
  guard?: string;
  timestamp?: number;
};
```

Правила:

1. Симулятор моделирует границу одной машины.
2. Любое событие, принятое текущим state через `config`/wildcard/reducer branch, считается доступным для внешней отправки.
3. Источник события не важен: UI, другая машина, effect, actor или тест.
4. Отправки событий из effects показываются как suggested events, но не блокируют ручной выбор принимаемых событий.
5. Ветки reducer с несколькими target-ами становятся выбираемыми ветками.
6. Guards не вычисляются. UI выбирает конкретную ветку.
7. `null` target считается self target, если reducer не дал более точную ветку.
8. Terminal target для actor template переводит symbolic snapshot в terminal pseudo-state. UI может дополнительно показать это как disposed actor, но v1 симулятор не удаляет actor record и не моделирует полный `MachineManager`.

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
@lite-fsm/graph       graph compiler, IR, analyzer, simulator, view-model
@lite-fsm/cli         CLI package
```

Graph API не должен жить внутри runtime-пакета. `@lite-fsm/core` не зависит от `@lite-fsm/graph`, `ts-morph`, TypeScript parser tooling или CLI. Это сохраняет lightweight runtime и позволяет graph tooling развиваться отдельно.

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

export type GraphSimulatorOptions = {
  actorMode?: ActorSimulationMode;
  startState?: string;
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
строка исходника -> ts-morph AST -> внутренняя модель извлечения -> LiteFsmGraphDocument
```

Не экспортировать типы `ts-morph` из публичного API.

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

### Этап 0: каркас `@lite-fsm/graph` и контракты IR

Цель: зафиксировать типы и тестовую инфраструктуру до реализации анализа AST.

Состав:

1. После миграции монорепы добавить пакет `@lite-fsm/graph`.
2. Описать типы `LiteFsmGraphDocument`, `LiteFsmGraphMachine`, transitions, emissions, reducer cases, diagnostics, selectors.
3. Добавить `compileLiteFsmGraph(source)` как заглушку, которая возвращает пустой document без падения.
4. Добавить тестовый harness, который читает `xstate/graph-parser-fixtures.ts` как строку.
5. Добавить базовые тесты публичных типов.

Проверка:

1. `compileLiteFsmGraph("")` возвращает валидный пустой `LiteFsmGraphDocument`.
2. Fixture-файл читается как строка в тестах.
3. Type tests подтверждают форму публичного API.

### Этап 1: source catalog и обнаружение API

Цель: научиться находить кандидаты `createMachine`/`MachineManager` без построения graph transitions.

Состав:

1. Парсить строку через `ts-morph` без project mode.
2. Построить import provenance map для известных source specifiers.
3. Найти вызовы `createMachine`, alias-импорты, ambient `createMachine`, `export default createMachine(...)`.
4. Найти `MachineManager(...)` и inline `createMachine(...)` внутри manager object.
5. Сохранить `variableName`, `exportName`, `managerKey`, `index`, `loc`.
6. Игнорировать alias chains без import provenance и неподдержанные похожие imports.

Проверка:

1. По `xstate/graph-parser-fixtures.ts` возвращается ожидаемое число machine candidates.
2. Alias import, ambient shape guard, default export и inline manager machine покрыты отдельными тестами.
3. Неподдержанный alias chain не распознается как machine.

### Этап 2: partial evaluator для поддерживаемого подмножества

Цель: отдельно реализовать вычисление простых AST-значений, не привязывая его к FSM.

Состав:

1. Поддержать object literals, local `const`, string literals, null, arrays.
2. Поддержать `as const`, `satisfies`, parenthesized expressions.
3. Поддержать spreads из локальных object literals.
4. Поддержать computed keys из local const string.
5. Поддержать transparent wrappers `createConfig({ ... })` и `createReducer(fn)` в ожидаемых позициях.
6. Возвращать structured result: `known`, `external`, `dynamic`, `unsupported` с `loc` и diagnostic metadata.

Проверка:

1. Unit tests без `createMachine`: evaluator раскрывает literals/spreads/computed keys.
2. Dynamic target и external identifier дают контролируемый result, а не exception.
3. Evaluator не читает файловую систему и не резолвит imports.

### Этап 3: config graph compiler

Цель: построить полезный graph document только по `config`.

Состав:

1. Для каждого machine candidate извлечь `config`, `initialState`, `initialContextSummary`, `groupTag`, `persistence`.
2. Построить `states` и `transitions` слоя `config`.
3. Поддержать wildcard `"*"`, `null`, terminal targets, dynamic targets.
4. Определить `kind: "domain" | "actorTemplate" | "unknown"` по `config`.
5. Сохранить source locations и stable IDs для states/transitions.
6. Вернуть compiler diagnostics только для неподдержанного исходника: unknown config identifier, dynamic key, dynamic target.

Проверка:

1. `directObjectMachine`, `localConstConfigMachine`, `computedKeysMachine`, `satisfiesMachine`, `wildcardMachine`, `helperWrappedMachine` строятся по config.
2. Actor template получает `kind: "actorTemplate"` и terminal targets.
3. Diagnostic-примеры с external config и dynamic target не ломают document.

### Этап 4: manager linker и выбор одной машины

Цель: связать уже найденные машины с `MachineManager` и дать стабильный selector API.

Состав:

1. Построить `LiteFsmGraphManager[]`.
2. Заполнить `managerKeys` у машин.
3. Поддержать manager object literal и local const manager map.
4. Реализовать `selectMachineGraph(document, selector)`.
5. Обрабатывать неоднозначный selector через diagnostic и candidates.

Проверка:

1. `manager`, `renamedManager` и `inlineManager` из fixture-а дают ожидаемые manager refs.
2. `selectMachineGraph` выбирает по `index`, `id`, `variableName`, `exportName`, `managerKey`, `{ managerId, managerKey }`.
3. Неоднозначный `managerKey` возвращает candidates, а не случайную машину.

### Этап 5: reducer branch compiler

Цель: добавить символические ветки reducer поверх уже построенного config graph.

Состав:

1. Поддержать inline reducer function и `reducer: createReducer(fn)`.
2. Поддержать `switch (action.type)`.
3. Поддержать `if`/`else if`/`else` с `action.type === "..."`.
4. Поддержать прямые записи `state.state = ...`, `s.state = ...`, `state.state = nextState`.
5. Поддержать ternary targets и простой `return { state, context }`.
6. Создавать `GraphReducerCase[]` и transitions слоя `reducer`.
7. Сохранять guard text как `GraphCondition`, не вычисляя его.

Проверка:

1. `switchReducerMachine`, `ifReducerMachine`, `chainedIfReducerMachine`, `returnObjectReducerMachine`, `helperWrappedMachine` дают expected reducer cases.
2. Reducer targets не удаляют config transitions, а добавляются отдельным слоем.
3. Unsupported reducer mutation/helper call дает partial diagnostic без падения.

### Этап 6: effects emission compiler

Цель: добавить слой отправляемых событий из effects, не превращая их в state transitions.

Состав:

1. Поддержать inline effects object и local const effects object.
2. Поддержать plain effect function inline/local const.
3. Поддержать `createEffect({ effect })`, local `createEffect`, `type`, `cancelFn`.
4. Поддержать state-specific, wildcard и computed effect keys.
5. Поддержать прямой `transition({ type })`.
6. Поддержать `transition({ type, meta: { actorId/groupId/groupTag } })`.
7. Поддержать `transition.actor/group/tag/unscoped` только для actor effects.
8. Поддержать `if`/`else if`/`else` и `switch(action.type)` labels внутри effect.
9. Детектить escaped `transition`.

Проверка:

1. `plainEffectsMachine`, `createEffectMachine`, `localEffectsMachine`, `localEffectsObjectMachine`, `ifEffectMachine`, `switchEffectMachine`, `wildcardEffectMachine`, `computedWildcardCreateEffectMachine` дают expected emissions.
2. `domainWithMetaTransitionMachine` распознает routing через `meta`.
3. `actorTemplate` и `actorWildcardEffectTemplate` распознают actor routing sugar.
4. `escapedTransitionMachine` возвращает diagnostic.

### Этап 7: сборка полного compiler result

Цель: собрать все compiler-слои в стабильный `LiteFsmGraphDocument`.

Состав:

1. Объединить source catalog, config graph, manager links, reducer branches и effect emissions.
2. Нормализовать document-level и machine-level diagnostics.
3. Обеспечить stable IDs для states, transitions, emissions, reducer cases.
4. Добавить snapshot tests полного документа по `xstate/graph-parser-fixtures.ts`.
5. Не запускать semantic analyzer внутри compiler по умолчанию.

Проверка:

1. `compileLiteFsmGraph(fixtureSource)` возвращает document со всеми валидными машинами, managers, transitions, reducer cases и emissions.
2. Повторный запуск на том же source дает те же IDs.
3. Compiler diagnostics относятся только к извлечению исходника, а не к semantic analysis.

### Этап 8: анализ корректности на базе IR

Цель: реализовать отдельный semantic analyzer, который работает только поверх `LiteFsmGraphDocument`.

Состав:

1. Реализовать `analyzeLiteFsmGraph(document)`.
2. Analyzer не использует AST, `ts-morph`, source files или import resolution.
3. Реализовать rules v1: `unknown-target`, `unreachable-state`, `dead-end-state`, `actor-template-shape`, `reducer-config-consistency`, `effect-event-acceptance`, `wildcard-shadowing`.
4. Возвращать `GraphDiagnostic[]` с `machineId` и `loc`, если `loc` есть в IR.
5. Оставить compiler diagnostics и analyzer diagnostics различимыми.

Проверка:

1. Analyzer тестируется на hand-written IR fixtures и на document из `xstate/graph-parser-fixtures.ts`.
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

Проверка:

1. Симулятор проходит сценарии vending/traffic-light и несколько машин из fixture-а.
2. Любое событие, принятое текущим state, можно отправить вручную независимо от source события.
3. Guards и reducer branches выбираются символически, без исполнения условий.

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

1. Вставка `xstate/graph-parser-fixtures.ts` показывает список машин и не ломает UI.
2. Можно выбрать одну машину из многих и симулировать только ее.
3. Diagnostics подсвечивают source locations, если они есть.

## Закрытые решения

1. Проект переходит на монорепу и scoped packages `@lite-fsm/*`; миграция монорепы будет описана отдельным ТЗ.
2. Runtime живет в `@lite-fsm/core`; graph tooling живет отдельно в `@lite-fsm/graph` и не попадает в runtime dependencies.
3. CLI живет отдельно в `@lite-fsm/cli` и зависит от `@lite-fsm/graph`.
4. `trustedEval` не входит в v1 API. Единственный parser mode v1 - static parser.
5. Ручные graph/codegen metadata не входят в v1 и появятся только после реального сценария редактирования диаграммы или codegen.
6. Stable IDs строятся от semantic path; source location хранится отдельно и не является публичной частью ID.
7. Actor template simulation по умолчанию использует `spawnLifecycle`. `activeActor` требует явный `startState`, кроме случая с единственным однозначным public state.
8. Reducer-derived targets не перекрывают `config` слой в IR. UI и simulator используют reducer layer как effective branch, но сохраняют config acceptance видимым.
9. `dead-end-state` и `effect-event-acceptance` остаются analyzer rules, но по умолчанию не должны создавать жесткий warning для неполных single-machine snippets.

## Итоговая рекомендация

После миграции в монорепу собрать `@lite-fsm/graph` как статический компилятор графа со строкой исходника на входе и символическим симулятором одной машины.

Не делать режим проекта. Не исполнять код приложения. Не пытаться вывести произвольный JavaScript.

Это сохраняет близость к продуктовой идее Sketch, но лучше подходит для `lite-fsm`: один и тот же документ графа сможет питать визуализацию, CLI, диагностику, правила линтинга, анализ и будущую генерацию кода.
