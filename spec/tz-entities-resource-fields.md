# @lite-fsm/entities resource fields — ТЗ для реализации

## 1. Цель

Добавить в `@lite-fsm/entities` descriptor `resource(...)` для runtime-owned ресурсов actor template.

Целевой результат:

- entity template может объявить в `initialContext` runtime resource, общий для всех rows этого template;
- resource создается один раз на `MachineManager` runtime instance, а не как module-level singleton;
- owner callbacks этого же template получают mutable resource через `self`;
- другие templates и внешний код получают только явно exposed view через `entities().get(...)`;
- private resource без `expose` не виден в `EntityAccess`;
- resource не является column, не индексируется как `resourceField[entity]`, не входит в public state, React row snapshots, selectors, snapshot, hydration и persistence;
- ordered ECS semantics сохраняется: template order в `machines` остается simulation contract, а resource owner reducer может пересобирать cache на `TICK`;
- resource rollback не добавляется в v1. Resource предназначен для deterministic rebuildable caches, которые owner пересобирает из entity columns.

## 2. Как выполнять это ТЗ

Реализация идет строго по этапам. Этап `N+1` начинается только после прохождения `stage gate` этапа `N`.

Перед началом реализации прочитать:

- `packages/entities/src/schema.ts`;
- `packages/entities/src/machine-extension.ts`;
- `packages/entities/src/runtime/compile.ts`;
- `packages/entities/src/runtime/state.ts`;
- `packages/entities/src/runtime/access.ts`;
- `packages/entities/src/runtime/reduce.ts`;
- `packages/entities/src/runtime/effects.ts`;
- `packages/entities/src/runtime/reactions.ts`;
- `packages/entities/src/runtime/snapshot.ts`;
- `packages/entities/src/react/index.ts`;
- `packages/entities/src/index.ts`;
- `tests/entities/entities-plugin.test.ts`;
- `tests/entities/entities-reducer-self.test.ts`;
- `tests/entities/entities-reducer-entities-access.test.ts`;
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

- public API `resource` в `@lite-fsm/entities`;
- schema descriptor validation и типы `EntityContextSchema`, `EntitySpawnSchema`;
- public storage extension types в `packages/entities/src/machine-extension.ts`;
- runtime metadata split между `metadata.initialContext` для columns и отдельной `resourceSchema`;
- `ColumnarActorStore` и entity access views;
- reducer/effect/reaction `self`;
- snapshot/hydrate, mutation snapshot и React preview/snapshot paths только в части исключения resource leakage;
- runtime tests в `tests/entities/**`;
- type tests в `tests/types/entities-api.tst.ts` и связанных type regression files;
- `packages/entities/README.md`;
- `API-CHEATSHEET.md`;
- `TYPES-CHEATSHEET.md`.

### Вне области работ

- новый storage kind для singleton/system actors;
- singleton-only validation по `store.count === 1`;
- automatic spawn system rows;
- transactional rollback, snapshot/restore hooks или rebuild hooks для resources;
- proxy, freeze, deep-freeze или runtime enforcement read-only view;
- запрет functions, class instances, `Map`, `Set`, arrays или typed arrays как resource values;
- factory context с deps, manager, config, action или payload;
- async resources;
- persistence, hydration или migration формата для resource values;
- изменение ordered reducer semantics, route collection, lifecycle events, effects или reactions beyond resource access wiring;
- RTS demo rewrite.

### Общие инварианты

- `@lite-fsm/core` не должен импортировать `@lite-fsm/entities`.
- `resource(...)` разрешен только для `storage: "entity"` templates и только в `initialContext`.
- `resource(...)` запрещен в `spawnSchema` на уровне типов и runtime validation.
- Resource принадлежит actor template, а не row. Один resource value создается на template/runtime instance независимо от количества active rows.
- Resource доступен при `0` rows, если есть exposed view. `0` rows не является ошибкой.
- Resource не заставляет reducer template запускаться. Reducer вызывается только по существующим accepted rows текущей entity runtime модели.
- Resource owner определяется template key. Любой reducer/effect/reaction этого template получает owner object через `self`.
- Consumer access через `entities().get(...)` получает только `View`, возвращенный `expose`. Без `expose` resource field отсутствует в `EntityAccess`.
- `expose` отвечает за безопасность consumer surface. Библиотека не анализирует mutating methods и не делает proxy/freeze.
- Resource mutation не является side effect наружу, пока object принадлежит runtime и не сохраняется как долгоживущая external reference.
- Reducers остаются sync-only. Resource factory и `expose` также sync-only.
- Resource не входит в `MachinesState`, public entity slice, `dehydrate()`, `hydrate()`, React `useEntitySnapshot`, `useEntityList`, persistence и selectors.
- Текущая семантика columns сохраняется: column fields остаются индексируемыми полями `column[entity]`.
- Runtime `EntityTemplateMetadata.initialContext` остается column-only schema для совместимости существующих runtime loops. Resource descriptors хранятся отдельно в `metadata.resourceSchema`.
- Resource field names проходят reserved-name validation наравне с columns и дополнительно не могут совпадать со встроенными полями или методами `self` и `EntityAccess` view.
- Документация должна явно различать resource descriptor, owner object и exposed view.

### Rollback contract

Resource rollback в v1 не реализуется.

Контракт:

- staged spawn rollback продолжает откатывать entity rows, columns и indexes по текущей модели;
- resource values не включаются в `snapshotRuntimeMutation(...)`;
- если reducer мутировал resource и затем выбросил ошибку, runtime не гарантирует восстановление resource state;
- resource должен использоваться для deterministic caches, rebuildable из source-of-truth columns;
- owner reducer должен строить resource в безопасном порядке: validate/read first, mutate/rebuild после проверок, без throw после начала resource mutation;
- для RTS target pattern spatial grid, flow field и scratch buffers пересобираются штатным `TICK`, а не через rollback hook.

## 3. Целевой public API

### Imports

```ts
import { f32, resource } from "@lite-fsm/entities";
```

`resource` экспортируется из root entrypoint `@lite-fsm/entities`. Отдельный subpath в v1 не добавляется.

### Descriptor overloads

```ts
export function resource<T>(
  factory: () => T,
): EntityResourceDescriptor<T, never, false>;

export function resource<T, View>(
  factory: () => T,
  expose: (resource: T) => View,
): EntityResourceDescriptor<T, View, true>;
```

`EntityResourceDescriptor<T, View, Exposed>` является public type только если он нужен для type tests и public metadata. Если можно сохранить descriptor type internal без ухудшения inference, отдельный export не обязателен. `resource(...)` должен нести type metadata для owner value, exposed view и флаг наличия `expose`.

Правило доступа:

- `resource(factory)` создает descriptor с `Exposed = false`; поле доступно в owner `self`, но исключается из `EntityAccess`;
- `resource(factory, expose)` создает descriptor с `Exposed = true`; поле доступно в owner `self` и в `EntityAccess` с типом `View`;
- исключение private resource из `EntityAccess` должно зависеть от флага `Exposed`, а не от того, что `View` равен `never`.

### Использование owner resource

```ts
const unitMovement = createMachine({
  storage: "entity",
  initialState: "__INIT",
  initialContext: {
    x: f32(),
    y: f32(),
    unitGrid: resource(
      () => createSpatialGrid(),
      (grid) => ({
        queryRadius: grid.queryRadius.bind(grid),
        queryCell: grid.queryCell.bind(grid),
      }),
    ),
    neighborBuffer: resource(() => new Int32Array(64)),
  },
  spawnSchema: {
    x: f32(),
    y: f32(),
  },
  config: {
    __INIT: { ENTITY_SPAWNED: "active" },
    active: { TICK: "active" },
  },
  reducer(_state, action, { self }) {
    if (action.type !== "TICK") return;

    self.unitGrid.clear();
    for (const entity of self.indices) {
      self.unitGrid.insert(entity, self.x[entity], self.y[entity]);
    }
  },
});
```

Owner `self`:

- `self.x`: `Float32Array`;
- `self.y`: `Float32Array`;
- `self.unitGrid`: owner type `SpatialGrid`;
- `self.neighborBuffer`: owner type `Int32Array`.

### Использование exposed resource

```ts
const unitCombat = createMachine({
  storage: "entity",
  initialState: "__INIT",
  initialContext: {
    target: i32({ default: -1 }),
  },
  spawnSchema: {},
  config: {
    __INIT: { ENTITY_SPAWNED: "active" },
    active: { TICK: "active" },
  },
  reducer(_state, action, { self, entities }) {
    if (action.type !== "TICK") return;

    const movement = entities().get("unitMovement");
    for (const entity of self.indices) {
      const candidates = movement.unitGrid.queryRadius(movement.x[entity], movement.y[entity], 96);
      self.target[entity] = candidates[0] ?? -1;
    }
  },
});
```

Consumer `EntityAccess`:

- `entities().get("unitMovement").x`: read-only column view;
- `entities().get("unitMovement").unitGrid`: exposed `View`;
- `entities().get("unitMovement").neighborBuffer`: type error, because no `expose` was provided.

### Public metadata

`MachineResultMetadata<typeof machine>["entityContextSchema"]` keeps the author `initialContext` shape including resource descriptors:

```ts
type Context = MachineResultMetadata<typeof unitMovement>["entityContextSchema"];

// Context["x"] is an entity column descriptor.
// Context["unitGrid"] is an entity resource descriptor.
```

Runtime metadata должен нормализовать author schema в отдельные column schema и resource schema до создания store.

Runtime `EntityTemplateMetadata.initialContext` остается column-only schema. Public type metadata `MachineResultMetadata<typeof machine>["entityContextSchema"]` продолжает отражать author `initialContext` с column и resource descriptors.

## 4. Целевая архитектура

### Schema layer

`schema.ts` получает resource marker, descriptor factory и type helpers.

Обязательная семантика descriptor:

- descriptor object замораживается, как scalar descriptors;
- descriptor несет owner value type `T` и exposed view type `View`;
- `resource(factory)` хранит `factory` и не создает exposed view;
- `resource(factory, expose)` хранит `factory` и `expose`;
- descriptor validation отклоняет неизвестную форму descriptor, Promise-returning factories и Promise-returning expose results в точке runtime invocation.

`EntityContextSchema` меняется с record только для column descriptors на record для column или resource descriptors.

`EntitySpawnSchema` остается record только для spawn descriptors. Resource descriptor в `spawnSchema` invalid.

### Runtime metadata

Compile step должен разделять author schema:

- `initialContext`: только scalar descriptors, используемые для columns, capacity growth, initial values, snapshot и hydrate;
- `resourceSchema`: только resource descriptors, используемые для runtime resource creation;
- `hasResources`: derived flag if needed for hot paths.

Author schema с resource descriptors остается type-level контрактом через `MachineResultMetadata`, но не используется как runtime column schema.

Snapshot/hydration могут продолжать перечислять runtime `metadata.initialContext`, потому что он остается column-only. Новый runtime код, которому нужны resources, должен использовать `metadata.resourceSchema`.

### Actor store

`ColumnarActorStore` получает template-level resource storage:

```ts
resources: Record<string, unknown>;
resourceViews: Record<string, unknown>;
```

Правила:

- `resources[field]` хранит owner object, возвращенный `factory()`;
- `resourceViews[field]` существует только когда задан `expose`;
- factory и expose вызываются один раз во время actor store creation;
- resource identity и view identity стабильны на весь lifetime manager;
- capacity growth, spawn, despawn, hydrate и mutation snapshot не заменяют resource values или views;
- если `factory` или `expose` бросает ошибку, `MachineManager(...)` creation бросает ошибку.

### Access surfaces

Owner `self`:

- навешивает columns из `store.columns`;
- навешивает все owner resource objects из `store.resources`;
- resource properties are enumerable;
- cached reducer self должен переустанавливаться для columns при capacity/hydrate как сейчас, но resource fields остаются стабильными.

`EntityAccess` store view:

- навешивает columns из `store.columns`;
- навешивает только exposed resource views из `store.resourceViews`;
- private resources не навешиваются;
- exposed resource properties are enumerable;
- root access и manager access могут читать exposed resources даже при `store.count === 0`;
- scoped effect access сохраняет текущую scoped validation semantics для `entities().get(...)`; resource views не обходят actor row scope validation.

Resource field names не должны конфликтовать с встроенными ключами store view: `count`, `capacity`, `version`, `has`, `state` и всеми другими public properties/methods view.

### Effects и reactions

Для того же owner template:

- `EntityEffectSelf` включает owner resources с mutable owner type;
- `EntityReactionSelf` включает owner resources с mutable owner type;
- effects/reactions не должны сохранять owner resources как external long-lived references;
- `self` и owner resources в effects/reactions являются transition-scope references. Их нельзя использовать после async boundary; это documented contract, а не runtime enforcement.
- effects остаются side-effect layer, а не hot-path cache rebuild layer.

Для consumer access через `entities().get(...)` effects и reactions получают exposed views согласно текущей root/scoped access semantics.

### Snapshot, hydrate и public state

Resource fields не сериализуются и не восстанавливаются:

- `EntityActorSnapshot.schema.columns` включает только columns;
- `EntityActorSnapshot.columns` включает только columns;
- `dehydrateEntityRuntime(...)` не включает resources;
- `hydrateEntityRuntime(...)` обновляет только entity rows, columns и public slices;
- `hydrate()` на существующем manager сохраняет identities resource и exposed view;
- `MachineManager(..., { snapshot })` создает новые resource instances во время manager creation и затем применяет snapshot к columns;
- preview hydrate не должен вызывать resource factory/expose.

### Runtime errors

Использовать существующие категории `LiteFsmError`, где это возможно.

Обязательная диагностика:

- resource в `spawnSchema`:

```text
[lite-fsm/entities] machine 'unitMovement' has invalid spawnSchema.unitGrid: resource(...) is not allowed in spawnSchema.
```

- reserved field name:

```text
[lite-fsm/entities] machine 'unitMovement' has invalid initialContext.count: field name is reserved.
```

- factory returned Promise:

```text
[lite-fsm/entities] machine 'unitMovement' resource 'unitGrid' factory returned a Promise; resource factories are sync-only.
```

- expose returned Promise:

```text
[lite-fsm/entities] machine 'unitMovement' resource 'unitGrid' expose returned a Promise; resource expose functions are sync-only.
```

Ошибки unknown descriptor property должны сохранять текущий стиль и включать failing path.

## 5. Этапы реализации

### Этап 1 — Schema descriptor и public type model

#### Цель

Добавить `resource(...)` как schema descriptor и настроить public type inference без runtime store wiring.

#### Зависит от

Нет.

#### Контракт этапа

- Добавить `resource` factory в `packages/entities/src/schema.ts`.
- Добавить marker для resource descriptors, не смешивая его со scalar column descriptor logic.
- `resource(factory)` должен выводить owner type `T` и private exposed type.
- `resource(factory, expose)` должен выводить owner type `T` и exposed view type `View`.
- Descriptor должен нести флаг `Exposed`: `false` для `resource(factory)`, `true` для `resource(factory, expose)`.
- `EntityContextSchema` должен принимать scalar descriptors и resource descriptors.
- `EntitySpawnSchema` не должен принимать resource descriptors.
- Type helpers должны разделять:
  - column value/column/spawn types;
  - owner resource fields для `self`;
  - exposed resource fields для `EntityAccess`.
- `MachineResultMetadata["entityContextSchema"]` должен сохранять author schema с resource descriptors.
- Добавить root export `resource` из `packages/entities/src/index.ts`.
- Обновить export surface tests, где ожидается список root exports.

#### Не делать в этом этапе

- Не создавать runtime `store.resources`.
- Не менять snapshot/hydrate.
- Не добавлять docs сверх минимальных комментариев в type tests.
- Не добавлять rollback или rebuild hooks.

#### Тесты этапа

- `tests/types/entities-api.tst.ts`:
  - `resource` импортируется из `@lite-fsm/entities`;
  - `initialContext` принимает `resource`;
  - `spawnSchema` отклоняет `resource`;
  - `self` получает owner `T`;
  - `EntityAccess` получает `View` только при наличии `expose`;
  - private resource без `expose` отсутствует в `EntityAccess`;
  - private resource исключается по marker наличия `expose`, а не по типу `never`;
  - `MachineResultMetadata` сохраняет resource descriptor.
- Runtime validation test для `spawnSchema.resource` можно добавить здесь или в этапе 2, если validation требует runtime wiring.

#### Критерий завершения

- Type tests этапа проходят.
- `pnpm --filter @lite-fsm/entities run check-types` проходит.
- `git diff --check` проходит.
- `resource` экспортируется из root entrypoint.

### Этап 2 — Runtime resource storage и access views

#### Цель

Создать resource values и exposed views на уровне actor store и подключить их к `self` и `EntityAccess`.

#### Зависит от

Этап 1.

#### Контракт этапа

- Runtime compile metadata сохраняет `metadata.initialContext` как column-only schema и добавляет `metadata.resourceSchema`.
- Все existing column loops в `state.ts`, `snapshot.ts`, `mutation-snapshot.ts` и related runtime modules продолжают использовать `metadata.initialContext` как column-only schema.
- `ColumnarActorStore` хранит `resources` и `resourceViews`.
- `createColumnarActorStore(...)` вызывает resource `factory()` один раз на template/runtime.
- Если descriptor имеет `expose`, `createColumnarActorStore(...)` вызывает `expose(resource)` один раз.
- Runtime проверяет Promise-returning `factory` и `expose` и бросает понятный `LiteFsmError`.
- `createActorReducerSelf`, `rebindActorReducerSelf`, `createScopedEntitySelf`, `createReactionEntitySelf` навешивают owner resources.
- `createStoreView` и `rebindEntityStoreView` навешивают только exposed resource views.
- Resource/view properties enumerable.
- Private resources отсутствуют в `EntityAccess`.
- Exposed resource доступен при `0` rows.
- Resource identity не меняется при capacity growth, spawn, despawn.
- Resource field names не могут совпадать с `has`, `entityId`, `state`, `count`, `capacity`, `version`, `indices`, `states`, `presence`, `stateCode`, `prevStateCode`, `rowVersion` и другими встроенными ключами `self` или store view.

#### Не делать в этом этапе

- Не менять semantics route collection или reducer scheduling.
- Не добавлять singleton validation.
- Не добавлять hydrate-specific reset/rebuild.
- Не добавлять proxy/freeze.

#### Тесты этапа

- Runtime tests:
  - `factory` вызывается один раз на manager instance;
  - `expose` вызывается один раз на manager instance;
  - два manager instances получают разные resources;
  - owner `self.resource` мутирует shared resource;
  - resource shared между всеми rows одного template;
  - `entities().get(...).resource` возвращает exposed view;
  - private resource отсутствует во view;
  - exposed resource доступен при `0` rows;
  - resource/view properties enumerable.
- Validation tests:
  - reserved name с `resource` rejected;
  - resource names `has`, `entityId` и `state` rejected;
  - Promise from factory/expose rejected.

#### Критерий завершения

- Focused runtime tests этапа проходят.
- Existing entity runtime tests для reducer self и entity access проходят.
- `pnpm --filter @lite-fsm/entities run check-types` проходит.
- `git diff --check` проходит.

### Этап 3 — Reducer, effect и reaction typing

#### Цель

Сделать resource fields частью owner `self` во всех entity callbacks и частью consumer `EntityAccess` только через exposed view.

#### Зависит от

Этапы 1-2.

#### Контракт этапа

- `EntityReducerSelf` включает owner resources как mutable owner type `T`.
- `EntityEffectSelf` включает owner resources как mutable owner type `T`.
- `EntityReactionSelf` включает owner resources как mutable owner type `T`.
- `EntityActorStoreViewFor` включает exposed resource views и исключает private resources.
- `EntityActorStoreViewFor` включает exposed resource key только когда descriptor имеет `Exposed = true`.
- Column fields сохраняют existing read-only/mutable types.
- Existing fallback `EntityAccess<AnyEntityMachineStore>` остается совместимым.
- Consumer view не маскируется под `Readonly<T>`; его тип ровно равен `View`.
- Если `expose` возвращает mutable object, library types expose этот object как запрошено.
- `entities().get(...)`, `entities().maybe(...)` и `manager.entities().get(...)` имеют один и тот же resource view type.
- Effects/reactions type docs должны фиксировать, что owner resources нельзя сохранять и использовать после async boundary.

#### Не делать в этом этапе

- Не добавлять type-level analysis of mutability.
- Не запрещать methods/classes/maps/sets.
- Не менять `EntityAccess` key inference.
- Не менять app deps provider contract.

#### Тесты этапа

- Type tests:
  - reducer owner может вызывать mutable owner methods;
  - effect owner может вызывать mutable owner methods;
  - reaction owner может вызывать mutable owner methods;
  - consumer может вызывать exposed query methods;
  - consumer не может обратиться к private resource;
  - consumer не видит private resource key как property типа `never`;
  - consumer не может обратиться к owner-only methods, если `View` их исключает;
  - `manager.entities().get(...)` имеет тот же exposed view type;
  - fallback access остается широким, но не выводит private resources из unknown schema.

#### Критерий завершения

- `pnpm exec tstyche tests/types/entities-api.tst.ts` проходит.
- `pnpm run test:types` проходит.
- `pnpm --filter @lite-fsm/entities run check-types` проходит.
- `git diff --check` проходит.

### Этап 4 — Snapshot, hydrate, React и leakage regression

#### Цель

Зафиксировать, что resources не становятся public/persisted state и не участвуют в hydrate.

#### Зависит от

Этапы 1-3.

#### Контракт этапа

- `dehydrate()` не содержит resource fields в `snapshot.storage.entity`.
- `getSnapshot()` и `MachinesState` public entity slices не включают resources.
- `hydrate()` на existing manager не вызывает resource factory/expose повторно.
- `hydrate()` сохраняет resource и exposed view identities.
- `getHydratedState(..., preview)` не трогает resource values.
- React entity snapshot/list hooks сохраняют column-only row snapshots.
- Mutation snapshot для staged spawn rollback не клонирует и не восстанавливает resources.
- Tests явно документируют rollback limitation: resource state не transactional.

#### Не делать в этом этапе

- Не добавлять resource serialization.
- Не добавлять resource migration format.
- Не добавлять resource rebuild after hydrate.
- Не изменять React hook API.

#### Тесты этапа

- Runtime tests:
  - dehydrate snapshot не содержит resource keys в actor schema или columns;
  - public state содержит только `storage`, `version`, `count`, `capacity`;
  - hydrate сохраняет resource identity;
  - preview hydrate не вызывает factory/expose;
  - React snapshot/list output исключает resources;
  - staged spawn rollback восстанавливает columns, но оставляет resource вне rollback contract; test name должен фиксировать это ограничение.

#### Критерий завершения

- Focused runtime и React tests проходят.
- Focused Vitest suites, покрывающие `dehydrate`, `hydrate`, React entity snapshots и staged spawn rollback, проходят. Команда должна указывать конкретные test files без shell glob как обязательного acceptance command.
- `git diff --check` проходит.

### Этап 5 — Документация, examples и cheatsheets

#### Цель

Описать `resource(...)` как public capability и intended ECS usage.

#### Зависит от

Этапы 1-4.

#### Контракт этапа

- `packages/entities/README.md` документирует:
  - resource as template-level shared runtime field;
  - owner `self` mutable access;
  - exposed view через `resource(factory, expose)`;
  - private resource через `resource(factory)`;
  - no singleton row requirement;
  - no snapshot/hydrate/persistence;
  - rollback limitation;
  - RTS ordered ECS pattern.
- `API-CHEATSHEET.md` добавляет краткую справку по `resource`.
- `TYPES-CHEATSHEET.md` добавляет owner/view type rules.
- Examples не должны использовать module-level singleton scratch/cache для нового паттерна.
- Documentation не должна описывать resource как domain source of truth.

#### Не делать в этом этапе

- Не rewrite RTS demo.
- Не добавлять docs build commands.
- Не документировать unsupported rollback/rebuild hooks как доступные.
- Не описывать `Readonly<T>` как safety guarantee для methods.

#### Documentation acceptance checklist

- `resource(factory)` private owner-only.
- `resource(factory, expose)` exposes `View` в `EntityAccess`.
- Resource принадлежит template/runtime, а не row.
- `self.resource` не индексируется по `entity`.
- `resource` invalid в `spawnSchema`.
- Resource не persisted, не hydrated, не deep-frozen и не included in public state.
- Использовать для spatial grid, flow field, physics world, pathfinding cache, scratch buffers.
- Не использовать для `hp`, `command`, `selected`, ownership или authoritative domain facts.

#### Тесты этапа

- Type snippets в docs должны соответствовать covered type tests.
- `git diff --check` проходит.
- Source audit для stale singleton-only wording проходит:
  - `singleton resource`;
  - `requires exactly one active row`;
  - `resourceField[entity]`;
  - `Readonly<T>` as runtime protection.

#### Критерий завершения

- README и cheatsheets обновлены.
- Stale wording audit не имеет unexpected hits.
- `pnpm run test:types` проходит, если docs snippets потребовали type updates.
- Запрещенные docs build commands не запускались.

### Этап 6 — Рефакторинг, чистка и полировка

#### Цель

Убрать временные решения после behavior/docs этапов и проверить ownership boundaries.

#### Зависит от

Этапы 1-5.

#### Контракт этапа

Must fix:

- temporary helpers, transitional branches, debug logging, TODO/FIXME in active scope;
- duplicate descriptor validation owners;
- duplicate column/resource schema split logic;
- resource-aware loops that still enumerate author `initialContext` where column-only schema is required;
- stale comments describing all `initialContext` fields as columns;
- unused imports, locals, types и test scaffolds;
- resource leakage in snapshot/hydrate/react paths.

Inspect only:

- decorative renames;
- широкие переносы модулей без снижения сложности;
- generic abstractions with one call site;
- micro-optimizations без hot-path evidence.

Expected remaining hits:

- это ТЗ и его журнал могут упоминать rejected singleton-only decisions и rollback limitations;
- tests may mention rollback limitation in test names.

#### Не делать в этом этапе

- Не менять public API.
- Не добавлять new semantics.
- Не rewrite unrelated entity runtime modules.
- Не запускать prohibited docs build commands.

#### Тесты этапа

- Focused regressions для changed behavior проходят.
- `pnpm run lint` проходит.
- `pnpm run check-types` проходит.
- `git diff --check` проходит.
- Source audits для stale resource wording и descriptor leakage проходят.
- Coverage gate выполняется, если cleanup изменил behavior code.

#### Критерий завершения

- Cleanup scope не содержит active stale code или stale comments.
- Нет unexpected source audit hits.
- Lint и type checks проходят.
- Журнал обновлен результатом cleanup.

### Этап 7 — Финальная проверка release scope

#### Цель

Проверить полную готовность feature без docs build.

#### Зависит от

Этапы 1-6.

#### Контракт этапа

- Запустить full relevant test/type/lint gates.
- Package build запускать только через разрешенную command, если нужна build verification.
- Проверить, что docs и cheatsheets описывают final contract.
- Проверить, что resource отсутствует в snapshot/public state formats.
- Проверить, что журнал содержит final readiness entry.

#### Не делать в этом этапе

- Не менять implementation, кроме final corrective fixes.
- Не запускать prohibited docs build commands.
- Не stage и не commit без явного запроса пользователя.

#### Тесты этапа

Recommended gates:

- `pnpm run test:types`;
- `pnpm run check-types`;
- `pnpm run lint`;
- `pnpm run test`;
- `pnpm run test:coverage`, если нужно подтвердить behavior code coverage;
- `pnpm run build:packages`, если нужна package build verification;
- `git diff --check`.

#### Критерий завершения

- Все этапы имеют статус `done`.
- Full readiness checks проходят или каждая skipped check имеет явную причину.
- Запрещенные docs build commands не запускались.
- Residual risks зафиксированы в журнале.

## 6. Критерий полной готовности

Feature считается готовой, когда выполнены все условия:

- `resource` экспортируется из `@lite-fsm/entities`.
- `resource(factory)` создает private template-level owner resource.
- `resource(factory, expose)` создает owner resource и stable exposed view.
- Resource factory/expose вызываются один раз на template/runtime manager instance.
- Runtime `metadata.initialContext` остается column-only schema, а resource descriptors хранятся в `metadata.resourceSchema`.
- Resource и exposed view identities стабильны при spawn, despawn, capacity growth и hydrate на existing manager.
- Resource общий для всех rows одного actor template и доступен независимо от active row count.
- Owner reducer/effect/reaction `self` имеет mutable owner resource type.
- Consumer `EntityAccess` видит только exposed resource view.
- Private resources отсутствуют в `EntityAccess`.
- Resource fields не являются columns и никогда не читаются как `resourceField[entity]`.
- Resource descriptor invalid в `spawnSchema`.
- Resource values не появляются в public state, snapshot, hydrate payload, React row snapshots или persistence.
- Runtime не делает freeze/proxy для resource или exposed view.
- Runtime валидирует Promise-returning factory/expose с clear diagnostics.
- Runtime валидирует reserved resource field names, включая встроенные ключи `self` и store view.
- Docs и cheatsheets описывают template-level shared resource semantics, expose facade, private resources, hydrate behavior и rollback limitation.
- Runtime tests покрывают lifecycle, access, no leakage, identity stability и diagnostics.
- Type tests покрывают owner type, exposed view type, private resources, metadata и spawnSchema rejection.
- Cleanup/refactor gate завершен.
- Final checks проходят:
  - `pnpm run test:types`;
  - `pnpm run check-types`;
  - `pnpm run lint`;
  - `pnpm run test`;
  - `git diff --check`;
  - `pnpm run build:packages` if package build verification is requested.
- `pnpm run build`, docs build commands и `next build` внутри `apps/docs` не запускались агентами.
