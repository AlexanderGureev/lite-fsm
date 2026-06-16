# @lite-fsm/entities reducer `entities()` access — ТЗ для реализации

## 1. Цель

Добавить в `storage: "entity"` reducer read-only доступ к entity stores через `entities()` и зафиксировать для entity reducer модель ordered entity systems.

Целевой результат:

- один `manager.transition({ type: "TICK" })` может обновлять несколько entity actor stores без orchestrator-а в `reactions`;
- entity reducer может читать live read views других entity stores через `entities().get(...)`;
- entity reducer мутирует только `self`;
- обычные reducers, actors и `storage: "instance"` не получают доступ к состоянию других machines;
- entity `reactions` остаются observer-only слоем для внешней синхронизации;
- entity `effects` остаются слоем редких событий, `transition(...)`, `despawn`, async/IO и управления внешним flow.

## 2. Как выполнять это ТЗ

Реализация идет строго по этапам. Этап `N+1` начинается только после прохождения `stage gate` этапа `N`.

Перед началом реализации прочитать:

- `packages/entities/src/machine-extension.ts`;
- `packages/entities/src/runtime/reduce.ts`;
- `packages/entities/src/runtime/access.ts`;
- `packages/entities/src/runtime/state.ts`;
- `packages/entities/src/runtime/reactions.ts`;
- `packages/entities/src/runtime/effects.ts`;
- `packages/entities/src/plugin.ts`;
- `tests/entities/entities-reducer-self.test.ts`;
- `tests/entities/entities-reducer-post-processing.test.ts`;
- `tests/entities/entities-plugin.test.ts`;
- `tests/types/entities-api.tst.ts`;
- `packages/entities/README.md`;
- `API-CHEATSHEET.md`;
- `TYPES-CHEATSHEET.md`.

Запрещенные проверки:

- `pnpm run build`;
- `pnpm --filter @lite-fsm/docs build`;
- `pnpm run docs:build`;
- `pnpm run pages:build*`;
- любой `next build` внутри `apps/docs`.

Если нужна проверка сборки пакетов, использовать `pnpm run build:packages`. Проверку документации через docs build должен выполнять пользователь.

### Область работ

- Runtime reducer context для `storage: "entity"`;
- public types `EntityReducerContext`, `EntityMachineExtension` и связанные internal helper types;
- runtime tests в `tests/entities/**`;
- type tests в `tests/types/entities-api.tst.ts` и связанных type regression files, если они зависят от storage extension context;
- `packages/entities/README.md`;
- `API-CHEATSHEET.md`;
- `TYPES-CHEATSHEET.md`;
- при необходимости точечные docs/examples внутри `packages/entities/**`, если они описывают reducer/reaction/effect responsibilities.

### Вне области работ

- Переписывание RTS demo в `apps/playground/app/examples/entities-rts/**`;
- performance benchmarking и performance regression gates;
- новый public order API вроде `entityOrder`, `systems`, `before` или `after`;
- snapshot-before-tick режим;
- proxy/freeze/wrapper для runtime read-only защиты чужих columns;
- graph compiler, graph UI, devtools UI и Redux DevTools time travel;
- изменение порядка фаз storage runtime, effects или reactions;
- изменение `payloadFor(entity)` semantics;
- чтение обычных non-entity machines из reducer;
- новый app-level builder или новый способ объявления `machines`;
- изменение core type machinery для передачи всего `MachineStore` в storage dependent lambda.

### Общие инварианты

- `@lite-fsm/core` не должен импортировать `@lite-fsm/entities`.
- Обычные reducers остаются локальными reducers без доступа к другим machines.
- `storage: "entity"` reducer является entity system reducer: он обрабатывает batch строк `self.indices`, читает entity stores через `entities()` и мутирует только свой store.
- `entities()` в reducer возвращает live read view текущего entity runtime. Это не snapshot на начало события.
- Reducer видит изменения entity reducers, которые уже выполнились раньше в том же `transition`, и не видит будущие изменения reducers, которые стоят позже в ordered pipeline.
- Порядок entity actor templates в `machines` является simulation contract для одного event.
- `self` остается единственным mutable доступом в reducer.
- Store views из `entities()` типизируются read-only. Runtime не защищает от `as any` и прямой записи в typed arrays.
- `entities()` доступен в reducer для всех action types, включая `ENTITY_SPAWNED`, публичные события и routed transitions.
- `payloadFor(entity)` остается доступным только в reducer на `ENTITY_SPAWNED` и сохраняет текущую runtime error semantics вне spawn scope.
- `entities()` в reducer читает весь live entity world без scoped validation.
- Перед чтением optional actor row пользователь должен проверять `view.has(entity)`.
- `entities().get(key)` и `entities().maybe(key)` требуют существующий entity template key. Unknown key остается ошибкой конфигурации/runtime access.
- `entities()` в reducer не читает `manager.getDependencies().entities`; runtime использует internal `runtime.access`.
- `AppDeps.entities` используется только как источник строгих типов для reducer context.
- Если `AppDeps.entities` отсутствует или несовместим с `() => EntityAccess<...>`, reducer получает широкий `EntityAccess<AnyEntityMachineStore>`, где `get(string)` возвращает generic read-only entity view.
- Reducer должен быть sync-only. Promise result из reducer является runtime error.
- Не сохранять `self`, `entities()` и store views из reducer для использования после возврата reducer.
- Детерминизм сохраняется при одинаковом начальном snapshot, одинаковом action, одинаковом порядке `machines` и отсутствии внешних side effects.

### Разделение ответственности

- Entity reducer — единственный hot-path слой для обновления entity state. Может читать `entities()`, мутирует только `self`, не использует deps, `transition`, async и внешние side effects.
- Entity reactions — sync-only observers после reducer pipeline. Используются для внешней синхронизации через deps, runtime caches, renderer/debug/metrics. Не вычисляют и не flush-ят gameplay state.
- Entity effects — state-driven side-effect слой для редких событий, `transition(...)`, `transition.despawn(...)`, `HERO_DEAD`, game over, async/IO при необходимости.
- Обычные reducers — локальные state transitions без read access к другим machines.

### Общие тестовые ожидания

- Измененный runtime code должен иметь 100% coverage по statements, branches, functions и lines.
- 100% coverage не заменяет сценарные tests: реальные паттерны ECS/RTS должны быть проверены отдельными runtime tests.
- Новые `describe`/`it`/`test` пишутся на русском; API identifiers остаются на английском.
- Behavior tests покрывают позитивные, негативные, boundary и error paths.
- Type tests покрывают строгий `EntityAccess<AppMachines>` через `AppDeps.entities`, fallback без `AppDeps.entities`, read-only foreign columns, mutable `self`, отсутствие `entities` в обычных reducers.
- Final gate обязательно включает `pnpm run test:coverage`.

## 3. Целевой public API

### Entity reducer context

`EntityReducerContext` расширяется новым полем `entities`:

```ts
export type EntityReducerContext<
  ContextSchema extends EntityContextSchema,
  SpawnSchema extends EntitySpawnSchema,
  Config extends object = object,
  AppDeps = unknown,
> = {
  readonly self: EntityReducerSelf<ContextSchema, Config>;
  readonly entities: () => EntityReducerEntityAccess<AppDeps>;
  payloadFor(entity: EntityIndex): EntitySpawnPayload<SpawnSchema>;
};
```

`EntityReducerEntityAccess<AppDeps>` является internal helper:

```ts
type EntityReducerEntityAccess<AppDeps> =
  AppDeps extends { readonly entities: () => infer Access }
    ? Access extends EntityAccess<infer _AppMachines extends MachineStore>
      ? Access
      : EntityAccess<AnyEntityMachineStore>
    : EntityAccess<AnyEntityMachineStore>;
```

Helper не экспортируется как public API.

`AnyEntityMachineStore` является internal type, совместимый с любым entity template key:

```ts
type AnyEntityMachineStore = Record<
  string,
  {
    readonly storage: "entity";
    readonly initialState: "__INIT";
    readonly config: object;
    readonly initialContext: EntityContextSchema;
    readonly spawnSchema: EntitySpawnSchema;
  }
>;
```

### Использование

```ts
const movement = createMachine({
  storage: "entity",
  initialState: "__INIT",
  initialContext: {
    x: f32(),
    y: f32(),
    vx: f32(),
    vy: f32(),
  },
  spawnSchema: {
    x: f32(),
    y: f32(),
    vx: f32(),
    vy: f32(),
  },
  config: {
    __INIT: { ENTITY_SPAWNED: "ACTIVE" },
    ACTIVE: { TICK: "ACTIVE" },
  },
  reducer: (_state, action, { self, entities, payloadFor }) => {
    if (action.type === "ENTITY_SPAWNED") {
      for (const entity of self.indices) {
        const payload = payloadFor(entity);
        self.x[entity] = payload.x;
        self.y[entity] = payload.y;
        self.vx[entity] = payload.vx;
        self.vy[entity] = payload.vy;
      }
      return;
    }

    if (action.type !== "TICK") return;

    const health = entities().get("unitHealth");

    for (const entity of self.indices) {
      if (!health.has(entity) || health.hp[entity] <= 0) continue;
      self.x[entity] += self.vx[entity];
      self.y[entity] += self.vy[entity];
    }
  },
});
```

### Строгая типизация через `AppDeps.entities`

Приложение, которому нужны строгие ключи и columns в reducer, объявляет `AppDeps.entities` так же, как для effects/reactions:

```ts
type AppMachines = typeof machines;
type AppDeps = {
  readonly entities: () => EntityAccess<AppMachines>;
};

export const createMachine: TypedCreateMachineFn<
  AppEvents,
  AppDeps,
  EntitiesPlugin<AppDeps>
> = createLiteFsmMachine;
```

Целевой DX внутри entity reducer:

```ts
const health = entities().get("unitHealth");
health.hp[entity]; // number

entities().get("gameSession"); // TS error, не entity storage
health.hp[entity] = 0; // TS error, foreign view read-only
self.hp[entity] = 0; // ok только в reducer владельца hp
```

Если `AppDeps.entities` не объявлен, `entities()` остается доступен, но получает широкий тип `EntityAccess<AnyEntityMachineStore>`.

## 4. Целевая архитектура

### Runtime access

- `reduceAcceptedBatch(...)` передает в user reducer context поле `entities`.
- `entities` является функцией, которая возвращает `runtime.access`.
- `entities()` в одном reducer invocation возвращает тот же root access object, что `manager.entities()`.
- Стабильность самой function не является публичным контрактом. Стабильность returned access object является контрактом.
- `entities` closure может создаваться один раз на reducer batch.
- Новый API не должен создавать объекты внутри цикла по entities.
- Не добавлять proxy, snapshot, copy или wrapper columns для reducer access.
- `get()` возвращает cached store view через существующую `EntityAccess` архитектуру.

### Ordered live semantics

- Public entity reducer batches выполняются в текущем порядке storage runtime.
- Порядок templates берется из `machines` и уже используется runtime для `templatesByEventCode`.
- `entities()` читает live runtime state на момент вызова.
- Если machine B стоит после machine A и обе принимают `TICK`, reducer B видит изменения, записанные reducer A в этом же `transition`.
- Если reducer читает свою machine через `entities().get(currentKey)`, он читает те же columns, что `self`, но типизированные read-only.
- Для собственной machine в reducer рекомендуется использовать `self`.
- Если системе нужен frame-start state, она должна использовать `prev*` columns, локальные scratch arrays или отдельную prepass machine. Snapshot-before-tick не вводится.

### Effects и reactions

- Порядок фаз storage runtime не меняется.
- Effects и reactions не меняют semantics, порядок запуска, error handling и scoped access.
- Effects остаются deferred по текущим правилам core/storage runtime.
- Reactions не используются для hot-path расчета gameplay state и batch flush.
- Документация должна описать `reaction -> orchestrator -> scratch -> flush events` как anti-pattern для hot-path entity state.

### Ошибки и диагностика

Promise result из entity reducer должен бросать `LiteFsmError` с кодом `LITE_FSM_INVALID_STORAGE_RUNTIME`.

Рекомендуемый текст:

```text
[lite-fsm/entities] reducer for actor 'unitMovement' and event 'TICK' returned a Promise; entity reducers are sync-only.
```

Rollback для sync mutations, выполненных async reducer до возврата Promise, не является контрактом MVP. Runtime должен бросать clear error; пользователь не должен писать async reducers.

## 5. Этапы реализации

### Этап 1 — Runtime и базовый тип `entities()` в entity reducer

#### Цель

Добавить runtime поле `entities()` в entity reducer context и минимальный широкий public type, достаточный для компиляции runtime tests. Строгая типизация ключей через `AppDeps.entities` выполняется на этапе 2.

#### Зависит от

- Текущая архитектура `runtime.access`, `createEntityAccess(...)`, `getActorReducerSelf(...)` и `reduceAcceptedBatch(...)`.

#### Контракт этапа

- `reduceAcceptedBatch(...)` передает user reducer context с полями `self`, `entities`, `payloadFor`.
- `EntityReducerContext` и `EntityReducerContextLambda` получают поле `entities` в широкой форме `() => EntityAccess<AnyEntityMachineStore>`.
- Существующие type references `EntityReducerContext<ContextSchema, SpawnSchema, Config>` сохраняют arity compatibility. Ручные object literal mocks этого типа должны добавить `entities`.
- `entities()` возвращает internal `runtime.access`.
- `entities()` доступен для public events, lifecycle events, routed transitions и unscoped transitions.
- `entities()` возвращает root live access без scoped validation.
- `entities()` не читает `manager.getDependencies()`.
- `entities()` возвращает тот же access object, что `manager.entities()`.
- Повторные вызовы `entities()` внутри одного reducer invocation возвращают один и тот же access object.
- `entities().get(currentKey)` читает live self columns; special-case snapshot для current store не вводится.
- В hot path не добавлять proxy, deep freeze, wrapper columns или per-entity allocations.
- Promise result из reducer вызывает `LiteFsmError` `LITE_FSM_INVALID_STORAGE_RUNTIME`.
- Текст ошибки Promise result содержит actor template key, event type и `entity reducers are sync-only`.
- Порядок phases `prepareAction`, reduce, cleanup, commit, reactions, effects не меняется.

#### Не делать в этом этапе

- Не добавлять strict key inference через `AppDeps.entities`.
- Не менять effects/reactions public types.
- Не менять effects/reactions runtime.
- Не переписывать RTS demo.
- Не добавлять performance benchmarks.

#### Тесты этапа

Runtime tests:

- reducer читает другой entity store через `entities().get(...)` и мутирует только `self`;
- `entities()` в reducer возвращает тот же object, что `manager.entities()`;
- повторные вызовы `entities()` возвращают stable access object;
- reducer читает `entities()` на `ENTITY_SPAWNED`;
- reducer читает `entities()` в routed transition;
- `entities().get(currentKey)` видит live writes текущего reducer;
- `payloadFor(entity)` сохраняет текущую ошибку вне `ENTITY_SPAWNED`;
- async reducer / Promise result бросает clear `LiteFsmError`.

#### Критерий завершения

- Focused Vitest tests для нового runtime behavior проходят.
- Существующие tests `tests/entities/entities-reducer-self.test.ts`, `tests/entities/entities-reducer-post-processing.test.ts` и relevant subset `tests/entities/entities-plugin.test.ts` проходят.
- `pnpm --filter @lite-fsm/entities run check-types` проходит.
- `git diff --check` проходит по измененным runtime/test файлам.
- В измененном runtime scope нет proxy/snapshot/copy implementation для reducer read access.

### Этап 2 — Public types и strict reducer access

#### Цель

Типизировать `entities()` в entity reducer context через существующий `EntitiesPlugin<AppDeps>` pattern и `AppDeps.entities`.

#### Зависит от

- Этап 1 завершен.
- `EntityReducerContext` уже содержит широкое поле `entities`.
- `EntitiesPlugin<AppDeps>` уже передает `AppDeps` в `EntityMachineExtension`.
- Effects/reactions уже используют `AppDeps.entities` как источник строгого `EntityAccess<AppMachines>`.

#### Контракт этапа

- `EntityReducerContext` получает новый generic `AppDeps = unknown`.
- `EntityReducerContext` содержит `readonly entities: () => EntityReducerEntityAccess<AppDeps>`.
- `EntityReducerEntityAccess<AppDeps>` остается internal type helper.
- Если `AppDeps.entities` совместим с `() => EntityAccess<AppMachines>`, reducer `entities()` имеет этот строгий тип.
- Если `AppDeps.entities` отсутствует, reducer `entities()` имеет тип `() => EntityAccess<AnyEntityMachineStore>`.
- Если `AppDeps.entities` объявлен, но несовместим с `() => EntityAccess<...>`, reducer `entities()` fallback-ит на `() => EntityAccess<AnyEntityMachineStore>`.
- `EntityMachineExtension` использует `StorageDependentField<EntityReducerContextLambda<AppDeps>>`.
- `EntityReducerContextLambda<AppDeps>` зависит от `input` и `AppDeps`; core `StorageDependentTypeLambda` не расширяется.
- `self` остается mutable и точно типизированным по текущей machine.
- Store views из `entities()` остаются read-only.
- Обычные reducers и `storage: "instance"` reducers не получают `entities`.
- `EntityAccess` shape не меняется.
- `EntityReducerContext` type references без четвертого generic остаются совместимыми. Ручные object literal mocks должны включать `entities`.

#### Не делать в этом этапе

- Не менять `@lite-fsm/core` type machinery.
- Не вводить app-level builder.
- Не экспортировать `EntityReducerEntityAccess`.
- Не менять `EntityAccess` public methods или column access shape.
- Не переносить typing source с `AppDeps.entities` на runtime plugin value.

#### Тесты этапа

Type tests:

- reducer `entities().get("unitHealth").hp[entity]` типизируется как `number`;
- reducer `entities().get("nonEntityMachine")` отклоняется при strict `AppDeps.entities`;
- reducer `entities().get("instanceActor")` отклоняется при strict `AppDeps.entities`;
- запись в foreign column через `entities()` отклоняется;
- запись в `self` column разрешена;
- `payloadFor(entity)` сохраняет текущий тип spawn payload;
- без `AppDeps.entities` reducer `entities()` доступен с широким `EntityAccess<AnyEntityMachineStore>`;
- некорректный `AppDeps.entities` не ломает reducer typing и fallback-ит на широкий access;
- `EntityReducerContext<ContextSchema, SpawnSchema, Config>` можно использовать без четвертого generic, но object literal этого типа требует `entities`;
- обычный reducer не получает `entities`;
- effects/reactions type tests не меняют текущий контракт.

#### Критерий завершения

- `pnpm exec tstyche tests/types/entities-api.tst.ts` проходит.
- `pnpm run test:types` проходит.
- `pnpm --filter @lite-fsm/entities run check-types` проходит.
- `git diff --check` проходит по измененным type/test files.
- Public exports audit подтверждает отсутствие нового public helper для `EntityReducerEntityAccess`.

### Этап 3 — Ordered live semantics и snapshot/hydrate regression

#### Цель

Покрыть реальные ECS/RTS-подобные сценарии без миграции RTS demo и зафиксировать live ordered behavior как runtime contract.

#### Зависит от

- Этапы 1-2 завершены.

#### Контракт этапа

- Тесты должны моделировать несколько entity actor stores: movement-like, health-like, command-like и combat-like.
- Machine B видит изменения Machine A в том же `TICK`, если B стоит позже в `machines`.
- Изменение порядка `machines` меняет наблюдаемый результат в ожидаемую сторону.
- Reducer может читать state, уже измененный предыдущим reducer в этом же event.
- Reducer может читать state будущей machine, но получает ее текущее live значение на момент вызова.
- Cyclic read dependencies не запрещаются runtime.
- Optional rows обрабатываются через `view.has(entity)`.
- Dehydrate/hydrate после cross-read reducer update сохраняет корректные columns, presence, stateCode и public slices.
- Redux DevTools time travel не входит в scope и не тестируется.

#### Не делать в этом этапе

- Не переписывать `apps/playground/app/examples/entities-rts/**`.
- Не добавлять perf benchmark.
- Не добавлять snapshot-before-tick.
- Не добавлять warnings для чтения later machine.

#### Тесты этапа

Runtime tests:

- ordered live semantics для двух machines на `TICK`;
- reverse order scenario с другим результатом;
- optional component через `has(entity)`;
- self live read через `entities().get(currentKey)`;
- routed transition с root world read;
- `ENTITY_SPAWNED` read другого existing store;
- `dehydrate()` / `hydrate()` round-trip после cross-read update;
- no regression для lifecycle cleanup/effects scheduling.

#### Критерий завершения

- Focused Vitest tests для ordered semantics проходят.
- Existing entity snapshot/hydrate tests проходят.
- `pnpm run test:coverage` не показывает coverage gaps в измененном runtime scope.
- `git diff --check` проходит.

### Этап 4 — Документация, examples и cheatsheets

#### Цель

Описать новый reducer context, ordered entity systems semantics и зоны ответственности reducer/reactions/effects.

#### Зависит от

- Этапы 1-3 завершены.

#### Контракт этапа

Documentation acceptance checklist:

- `packages/entities/README.md` описывает `entities()` в entity reducer.
- README использует термин `entity system reducer`.
- README явно говорит, что `entities()` в reducer является live view, а не snapshot.
- README фиксирует ordered semantics и порядок `machines` как simulation contract.
- README показывает пример `TICK` reducer, который читает `health` и мутирует `movement self`.
- README показывает или описывает запрет mutation чужого store.
- README описывает `self.indices` как scope текущего reducer batch, а `entities()` как root read view всего entity runtime.
- README описывает, что `entities()` доступен и на `ENTITY_SPAWNED`, и на public/routed events.
- README фиксирует `view.has(entity)` перед чтением optional rows.
- README фиксирует, что `self`, `entities()` и store views нельзя сохранять после reducer.
- README фиксирует sync-only reducer, no deps, no transition, no async, no external side effects.
- README содержит soft anti-pattern note для `reaction -> orchestrator -> scratch -> flush events`.
- `API-CHEATSHEET.md` содержит краткий public API contract.
- `TYPES-CHEATSHEET.md` содержит `EntityReducerContext`, strict typing через `AppDeps.entities`, fallback и read-only foreign columns.
- Документация не должна обещать Redux DevTools time travel для entity runtime.
- Документация не должна описывать performance benchmark как acceptance gate.

#### Не делать в этом этапе

- Не запускать docs build.
- Не переписывать RTS demo docs beyond direct API reference.
- Не добавлять changelog-style narration.
- Не склонять английские API identifiers через дефис.

#### Тесты этапа

- `pnpm run test:types` после docs/type examples, если examples влияют на type tests.
- `git diff --check`.
- Source audit по stale wording:
  - `reaction -> orchestrator` должен встречаться только как anti-pattern note, если используется;
  - не должно быть описания reducer `entities()` как snapshot;
  - не должно быть обещания runtime protection от `as any`.

#### Критерий завершения

- README, API cheatsheet и TYPES cheatsheet отражают целевой контракт.
- Documentation acceptance checklist из этого этапа закрыт.
- Запрещенные docs build commands не запускались.
- `git diff --check` проходит.

### Этап 5 — Рефакторинг, чистка и полировка

#### Цель

Удалить временные решения, проверить владельцев ответственности и подготовить изменение к финальным gates.

#### Зависит от

- Этапы 1-4 завершены.

#### Контракт этапа

Must fix:

- временные helpers, transitional branches, debug logging, TODO/FIXME в active scope;
- неиспользуемые imports, locals, types;
- duplicate owners для type extraction `AppDeps.entities`;
- runtime helper без второго места использования, если он не снижает сложность;
- stale comments/docs, которые описывают reducer как local-only для `storage: "entity"`;
- source audit hits старого anti-pattern wording вне допустимых docs notes.

Inspect only:

- декоративные переименования без снижения сложности;
- перенос кода между файлами без смены владельца ответственности;
- micro-optimizations без performance contract;
- изменение effects/reactions pipeline.

#### Не делать в этом этапе

- Не менять public API.
- Не добавлять новые behavior contracts.
- Не переписывать tests без причины.
- Не запускать docs build.

#### Тесты этапа

- Focused regressions по затронутым runtime/type contracts.
- `pnpm run lint`.
- `pnpm run test:types`.
- `git diff --check`.
- `rg` audit по stale identifiers/wording:
  - `EntityReducerEntityAccess` не экспортируется;
  - `snapshot-before-tick` не описан как реализованный режим;
  - `reducer.*transition` не описан как допустимый паттерн;
  - `entities().get` examples не пишут foreign columns.

#### Критерий завершения

- Cleanup audit не показывает active stale hits.
- Focused checks проходят.
- Нет временной реализации, dead code и лишних abstractions в scope.
- Журнал реализации обновлен.

## 6. Критерий полной готовности

Готовность считается полной только после завершения всех этапов и выполнения финального gate:

- `pnpm run test:coverage` проходит с 100% thresholds;
- `pnpm run test:types` проходит;
- `pnpm run check-types` проходит;
- `pnpm run lint` проходит;
- `pnpm run build:packages` проходит;
- `git diff --check` проходит;
- runtime tests покрывают reducer `entities()` на public events, `ENTITY_SPAWNED`, routed transitions, ordered live semantics, reverse order, optional rows, self live read, hydrate/dehydrate, Promise error;
- type tests покрывают strict access через `AppDeps.entities`, fallback access, read-only foreign columns, mutable `self`, absence in ordinary reducers;
- docs отражают зоны ответственности reducer/reactions/effects и ordered entity systems semantics;
- RTS demo не переписан в рамках этого ТЗ;
- performance benchmark не является блокирующим gate и может выполняться отдельно после реализации;
- graph/devtools work не выполнен и не заявлен как готовый;
- запрещенные docs build commands не запускались.

## 7. Future work

- Отдельное ТЗ на миграцию RTS demo с `reaction -> orchestrator -> scratch -> flush events` на entity system reducers.
- Отдельная проверка производительности после реализации.
- Отдельный design для entity dependency graph/devtools visualization, если ordered systems потребуется отображать как graph.
- Отдельный design для Redux DevTools time travel через dehydrated snapshots, включая `snapshot.storage.entity`.
