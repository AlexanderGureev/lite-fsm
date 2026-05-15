# Graph Simulator: текущие возможности

Статус: краткий справочник по фактической реализации `@lite-fsm/graph/simulator`.

Источники правды:

- [`packages/graph/src/simulator/`](packages/graph/src/simulator/) - headless simulator runtime.
- [`tests/graph/simulator*.test.ts`](tests/graph/) - runtime-контракт симулятора.
- [`tests/types/graph-simulator-api.tst.ts`](tests/types/graph-simulator-api.tst.ts) - публичная type surface.
- [`packages/core/src/Machine.ts`](packages/core/src/Machine.ts) и [`packages/core/src/MachineManager.ts`](packages/core/src/MachineManager.ts) - референс реального runtime.

Симулятор работает поверх уже собранного `LiteFsmGraphDocument`. Он не парсит source повторно, не исполняет пользовательский JavaScript и не создает настоящий `MachineManager`.

## Назначение

Текущий симулятор - это headless symbolic runtime для visualizer-а и будущих CLI/analysis сценариев.

Он умеет:

- запускать систему из `document`, одного `manager` или выбранного набора машин;
- считать текущие доступные `config`/`reducer` transitions;
- отправлять object events через общий bus;
- фиксировать атомарные commits в immutable timeline;
- показывать ручные follow-up events из effect emissions;
- моделировать actor templates в режиме приближения;
- возвращать controlled diagnostics вместо падения на неподдержанных командах.

Он не умеет:

- исполнять реальные `reducer`, `effect`, `condition`, middleware или guards;
- автоматически запускать effects и async chains;
- создавать реальные actor instances с `actorId`/`groupId`/sidecar;
- выполнять hydrate/dehydrate, persistence hooks или schema migration;
- делать public time travel checkout/fork;
- гарантировать 100% соответствие runtime `MachineManager`.

## Public API

Simulator экспортируется только из subpath-а:

```ts
import {
  createGraphSimulator,
  createMachineGraphSimulator,
} from "@lite-fsm/graph/simulator";
```

Root import `@lite-fsm/graph` не реэкспортирует simulator runtime.

```ts
const simulator = createGraphSimulator(document, {
  scope: { kind: "machines", machineIds: ["checkout", "audit"] },
});

const started = simulator.start();
const sent = simulator.send({
  event: { type: "SUBMIT", payload: { id: 1 } },
});
```

Команды:

| API | Что делает |
| --- | --- |
| `start()` | Создает initial immutable snapshot. Повторный вызов идемпотентен. |
| `reset(input?)` | Пересоздает initial snapshot с теми же options и optional overrides. |
| `getSnapshot()` | Возвращает текущий snapshot или `undefined` до `start()`. |
| `getAvailableTransitions(input?)` | Возвращает transitions для текущих slices, опционально по `slice`/`eventType`. |
| `getSuggestedEmissions(input?)` | Возвращает effect emissions последнего committed step. |
| `send({ event, choices? })` | Отправляет external object event через bus. |
| `sendFromTransition(...)` | Отправляет event выбранного transition; origin branch фиксируется явно. |
| `sendFromEmission(...)` | Отправляет event выбранной suggested emission с routing из IR. |
| `choose(...)` | Commit ранее возвращенного pending branch choice. |

## Scope и старт

Поддержанные scopes:

```ts
type GraphSimulationScope =
  | { kind: "document" }
  | { kind: "manager"; managerId: string }
  | { kind: "machines"; machineIds: readonly string[] };
```

По умолчанию используется `{ kind: "document" }`.

Стартовые правила:

- document scope включает все `document.machines`;
- manager scope включает машины из `manager.machineRefs`;
- machines scope включает только явно перечисленные `machineIds`;
- пустой scope, неизвестная машина, неизвестный manager и неизвестный start state дают controlled failure;
- поддержан только `actorMode: "template-approximation"`;
- поддержан только `effectMode: "manual"`;
- `start()`/`reset()` не запускают effects начальных states.

Domain machine получает `domain` slice. Actor template machine получает `actorTemplate` slice. Exact `actor` slice ref уже есть в типах, но текущий runtime не создает actor instances.

## Snapshot и context

Snapshot deep-frozen для клиента и содержит:

- `machineIds` в порядке document/scope;
- `slices` по stable `sliceId`;
- индексы domain/actorTemplate/actor slices;
- immutable timeline graph;
- diagnostics текущего snapshot.

Context slice выбирается так:

1. `initialContextOverrides` как JSON-safe object;
2. `machine.initialContextJson`, если compiler смог вывести JSON-safe object;
3. `machine.initialContextSummary`;
4. `{ kind: "unknown" }`, если context не представлен в IR.

Simulator не парсит `GraphValueSummary.text` и не восстанавливает объект из source fragment. Default reducer policy context не меняет; context может изменить только пользовательская `evaluationPolicy.reduceContext`.

## События

Команды принимают object event:

```ts
type GraphSimulationEvent = {
  type: string;
  payload?: GraphJsonValue;
  meta?: {
    actorId?: string | readonly string[];
    groupId?: string | readonly string[];
    groupTag?: string | readonly string[];
    senderActorId?: string;
    senderGroupId?: string;
    senderGroupTag?: string;
  };
};
```

Валидация:

- `type` должен быть непустой строкой;
- `payload` должен быть JSON-safe;
- `meta` values должны быть строками или массивами строк;
- входной event clone-ится и не мутируется;
- sender fields сохраняются в event, но routing resolver их сейчас не использует.

Routing priority из `event.meta`: `actorId > groupId > groupTag > default`.

## Transitions

`getAvailableTransitions()` строит candidates из текущего snapshot.

Правила acceptance:

- state-specific `config` transition имеет приоритет над wildcard transition того же event;
- wildcard применяется только если state-specific edge не найден;
- wildcard не применяется из actor template state `__INIT`;
- terminal/disposed slice не принимает events;
- reducer transition сам не создает acceptance;
- reducer transition уточняет target только для уже принятого `config`/wildcard edge с тем же event и тем же source.

Targets:

- `self` оставляет slice в текущем state;
- `state` переводит в существующий `stateId`;
- `terminal` переводит в terminal pseudo-state и выставляет `status: "terminal"`;
- `dynamic` и `unknown` видны как choices, но `canApply: false` и commit блокируется с `target-not-resolved`;
- `blocked` виден как choice, но commit блокируется с `blocked-target`.

Если для принятого config edge есть reducer branches, available candidate становится reducer-layer transition. При этом `acceptedTransitionId` указывает на config edge, а `effectiveTransitionId` и `transitionId` - на выбранный reducer edge.

## Dispatch

Все dispatch-команды проходят общий pipeline:

1. validate/clone event;
2. route slices;
3. найти candidates в каждом routed slice;
4. применить optional evaluator;
5. выбрать branch по explicit choices или branch policy;
6. проверить target;
7. применить optional context reducer policy;
8. атомарно обновить draft slices;
9. добавить один timeline step;
10. собрать suggested emissions.

Атомарность:

- failure до commit не мутирует snapshot и не двигает timeline;
- если один routed consumer блокируется на target/context/evaluator, весь dispatch отклоняется;
- routed slices без acceptance просто отсутствуют в `consumed`;
- external `send(...)` без consumers успешен и добавляет empty-consumption step;
- valid `sendFromEmission(...)` без consumers тоже успешен;
- `sendFromTransition(...)` требует, чтобы origin transition был available.

## Branch selection

Поддержанные policies:

```ts
type GraphBranchSelectionPolicy =
  | { kind: "manual" }
  | { kind: "origin-explicit-default-others" }
  | { kind: "deterministic-first" };
```

Default:

```ts
{ kind: "origin-explicit-default-others" }
```

Поведение:

- `manual` возвращает `choice-required` для любого ambiguous consumer;
- `origin-explicit-default-others` требует explicit choice только для origin slice, остальные ambiguous consumers берут первый candidate в стабильном порядке IR;
- external `send(...)` не имеет origin slice, поэтому ambiguous consumers по default policy выбираются детерминированно;
- `deterministic-first` всегда берет первый candidate;
- `choose(...)` commit-ит pending choice только если timeline cursor и candidate shape не устарели.

## Evaluation policy

`evaluationPolicy` - единственная текущая точка расширения для payload/context-aware поведения:

```ts
type GraphEvaluationPolicy = {
  evaluateTransition?: (input: GraphEvaluateTransitionInput) => GraphEvaluateTransitionResult;
  reduceContext?: (input: GraphReduceContextInput) => GraphReduceContextResult;
};
```

Default policy:

- не вычисляет guards;
- не читает payload/context;
- не сужает candidates;
- возвращает previous context без изменений.

Custom policy может:

- выбрать конкретный transition;
- заблокировать evaluation diagnostics-ами;
- заменить context;
- вернуть `GraphContextPatch[]` для timeline.

## Effects

Текущий режим effects - только `manual`.

Simulator не вызывает effect functions. Он использует `GraphEmission[]`, которые compiler извлек из source, и показывает их как suggestions после successful committed step.

Фактические правила suggestions:

- initial effects после `start()`/`reset()` не предлагаются;
- state-specific emissions предлагаются только после реального входа в state;
- self transition не считается входом в state;
- wildcard emissions предлагаются после каждого consumed transition;
- после входа в state текущая реализация предлагает и state-specific, и wildcard emissions;
- successful external event без consumers не собирает wildcard emissions, потому что нет consumption source.

`sendFromEmission(...)`:

- требует, чтобы emission была suggested для origin slice;
- берет event type и routing из IR;
- может добавить JSON-safe payload;
- dispatch-ит event через тот же bus;
- сама emission не меняет origin slice напрямую, но origin может измениться, если routed event им же принимается.

`canDispatch: false` выставляется для terminal slice или unknown/dynamic routing. Тип `blockedReason: "not-current-state"` зарезервирован, но текущий public list уже содержит только emissions последнего step.

## Routing и actor templates

Domain machines всегда входят в routed set и consume event только при acceptance текущего state. Это повторяет intent runtime: domain machines видят committed events независимо от actor routing meta.

Actor template routing в режиме `template-approximation`:

| Routing | Текущее поведение |
| --- | --- |
| `default` / `unscoped` | Все domain slices и все actorTemplate slices. |
| `groupTag` / `tag` | Все domain slices и actorTemplate slices с совпадающим `machine.groupTag`. |
| `actorId` | Все domain slices и все actorTemplate slices с `confidence: "partial"`. |
| `groupId` | Все domain slices и все actorTemplate slices с `confidence: "partial"`. |
| `unknown` / dynamic target | Emission не dispatch-ится; command возвращает controlled failure. |

`self.groupTag` в actor template emission резолвится в `machine.groupTag`. `self.actorId` и `self.groupId` не имеют настоящего actor instance, поэтому считаются приблизительно резолвимыми и ведут к partial routing.

Не реализовано:

- создание нескольких actor instances;
- реальные `actorId`/`groupId`;
- spawn counters и `originId`;
- sidecar indexes;
- terminal actor collapse из record;
- actor persistence `runtime`/`snapshot`;
- actor effect bag cleanup.

## Timeline

Timeline - immutable graph:

- root step всегда `step:0`;
- каждый successful command добавляет `step:N`;
- `linearStepIds` хранит текущую линейную ветку;
- `stepsById` и `childrenByStepId` уже представлены как graph для будущего time travel;
- public checkout/fork/jump API сейчас нет.

Step хранит:

- event и source (`initial`, `external`, `manual-config`, `manual-effect`);
- `consumed` transitions;
- suggested emissions, произведенные после step;
- branch choices;
- context patches;
- graph-level `rowRefs` для visualizer-а;
- diagnostics step-а.

Failures не добавляют timeline step.

## Diagnostics

Simulator возвращает diagnostics в result objects. Основные failure reasons:

- start: `empty-scope`, `unknown-machine`, `unknown-manager`, `unknown-start-state`, `invalid-initial-context`, `unsupported-mode`;
- send: `not-started`, `invalid-event`, `invalid-payload`, `invalid-context`, `unknown-slice`, `unknown-transition`, `unknown-emission`, `event-not-accepted`, `choice-required`, `stale-choice`, `target-not-resolved`, `blocked-target`, `evaluation-blocked`.

Коды имеют namespace `LFG_SIM_*`, например `LFG_SIM_CHOICE_REQUIRED` или `LFG_SIM_TARGET_NOT_RESOLVED`.

## Расхождения с реальным runtime

| Область | Runtime `@lite-fsm/core` | Текущий simulator | Разрыв |
| --- | --- | --- | --- |
| Исполнение кода | Выполняет реальные reducer/effect/middleware функции. | Работает только по `LiteFsmGraphDocument` и optional policies. | Нет исполнения пользовательского JS. |
| Result model | `transition(...)` возвращает action или бросает исключение. | Команды возвращают discriminated result с diagnostics. | Поведение ошибок намеренно другое. |
| Context без reducer | Runtime default merge-ит `payload` в `context` для принятого transition без reducer. | Default context не меняется. | Нет runtime default context merge. |
| Context shape | Runtime context/payload могут быть произвольными runtime-значениями в рамках TS API. | Full context/payload только JSON-safe; иначе summary/unknown или failure. | Нужен JSON/structured clone слой для полного соответствия. |
| Reducer | Runtime выполняет reducer и может бросить `VOID_REDUCER_ERROR` без `immerMiddleware` для void reducer. | Simulator использует symbolic reducer targets из IR и не моделирует void reducer errors. | Мутационные reducer branches видны символически даже без middleware. |
| Guards/conditions | Runtime code может читать payload/context и выбирать любую логику reducer-а/effect-а. | Guards только labels; выбор ветки через policy/manual choice. | Нет payload-aware evaluation по умолчанию. |
| Reducer-only domain machines | В `MachineManager` domain machine без config edges попадает в `domainAlwaysReduce` и reduce-ится на каждое событие. | Reducer branch не создает acceptance без config/wildcard edge. | Reducer-only machines не симулируются как runtime. |
| Effects запуск | Runtime автоматически вызывает effects после committed transition. | Effects только suggestions; пользователь вручную вызывает `sendFromEmission`. | Нет auto-cascade, async ordering и late dispatch. |
| Effect precedence | Runtime вызывает state-specific effect при входе в state, иначе wildcard effect. | После входа в state simulator сейчас предлагает state-specific и wildcard emissions вместе. | Wildcard precedence расходится с runtime. |
| Wildcard effect на no-op | Runtime может вызвать wildcard effect после transition, даже если state не изменился. | Empty-consumption external step не собирает emissions. | No-consumer wildcard effects не моделируются. |
| `createEffect` | Runtime поддерживает `latest`, `cancelFn`, owner slots и actor bag cleanup. | Compiler сохраняет emissions; `cancelFn` и scheduling не исполняются. | Нет effect lifecycle semantics. |
| Routing domain | Domain machines видят committed events независимо от actor routing. | Domain slices всегда routed. | Совпадает по intent. |
| Actor instances | Runtime спавнит реальные actors, ведет sidecar, routing indexes, terminal collapse. | Один `actorTemplate` slice на machine, без instances. | Самый крупный разрыв. |
| Actor routing | Runtime точно фильтрует live actors по `actorId`, `groupId`, `groupTag`. | `groupTag` фильтруется, `actorId`/`groupId` дают partial confidence всем templates. | Actor/group routing только приближенный. |
| Actor template validation | Runtime валидирует actor templates в `MachineManager`; standalone actor template forbidden. | Simulator стартует то, что есть в IR, а semantic ошибки оставляет analyzer-у/start validation. | Нет fail-fast runtime validation полного config shape. |
| Hydration/persistence | Runtime поддерживает `hydrate`, `dehydrate`, snapshots, schemaVersion, actor persistence. | Только initial overrides и timeline. | Hydration/persistence не моделируются. |
| Middleware/subscribers | Runtime поддерживает middleware, `replaceReducer`, `onTransition`, `condition`. | Не поддержано. | Нет middleware pipeline и subscriber side effects. |
| Sender meta | Runtime normalizer переписывает sender fields и default routing actor dispatch в свою группу. | Sender fields только валидируются/хранятся; routing их не использует. | Actor self-dispatch semantics отсутствует. |
| Reserved actions | Runtime запрещает user dispatch системных `@@lite-fsm/*` actions. | Simulator проверяет только непустой `type`. | Reserved action validation не реализована. |
| Time travel | Runtime не хранит graph timeline. | Simulator хранит append-only timeline graph, но без public checkout/fork. | Timeline - simulator-only capability, не runtime parity. |

## Приоритетные gaps до 100% parity

1. Выровнять effect precedence с runtime: state-specific должен подавлять wildcard при входе в state.
2. Решить, должен ли simulator моделировать wildcard effects на no-op/empty-consumption events.
3. Добавить режим exact actor instances: spawn from `__INIT`, actor/group ids, sidecar, routing, terminal collapse.
4. Добавить payload/context-aware evaluator или trusted reducer execution mode для реального выбора branches и context updates.
5. Смоделировать domain machines без config edges как `domainAlwaysReduce`.
6. Описать и реализовать auto/manual effect cascade modes, включая async ordering, `createEffect` latest/cancel и actor bag cleanup.
7. Добавить hydrate/dehydrate/persistence simulation или явно оставить это вне scope visualizer-а.
8. Поддержать runtime-compatible validation: reserved actions, actor template shape, invalid actor reducer outputs.
9. Расширить timeline до public checkout/fork только после появления потребителя в visualizer/app layer.
