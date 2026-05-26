# Plugin System Stable API — ТЗ для реализации

## 1. Цель

Подготовить plugin system `@lite-fsm/core` к стабильному публичному релизу для сторонних plugins.

Стабильный контракт должен:

- сохранять небольшой и предсказуемый public API;
- разделять события, которые plugin добавляет в `manager.transition`, и события, которые plugin наблюдает в host manager;
- использовать плоское пространство ключей для всех публичных plugin sections без автоматического prefixing;
- дать storage runtime полноценный типовой контракт без `unknown` в основных owner-owned областях;
- сохранить текущий формат manager snapshot на верхнем уровне;
- обновить runtime tests, type tests и cheatsheets.

## 2. Как выполнять это ТЗ

### Область работ

Основные файлы:

- `packages/core/src/plugin.ts`
- `packages/core/src/pluginTypes.ts`
- `packages/core/src/pluginHelpers.ts`
- `packages/core/src/pluginStorage.ts`
- `packages/core/src/pluginStorageTypes.ts`
- `packages/core/src/pluginStorageNormalize.ts`
- `packages/core/src/runtime/kernel/registry.ts`
- `packages/core/src/runtime/kernel/storage.ts`
- `packages/core/src/runtime/kernel/snapshot.ts`
- `packages/core/src/runtime/kernel/createMachineManagerFactory.ts`
- `packages/core/src/index.ts`
- `tests/core/plugin-system-*.test.ts`
- `tests/types/plugin-system-*.tst.ts`
- `tests/types/exports-surface.tst.ts`
- `PLUGIN-SYSTEM-CHEATSHEET.md`
- `API-CHEATSHEET.md`
- `TYPES-CHEATSHEET.md`

Обязательные проверки для агента:

- `pnpm run test`
- `pnpm run test:types`
- `pnpm run check-types`
- `pnpm run lint`

Если изменение затрагивает только часть tests, можно сначала запускать точечные Vitest/Tstyche проверки, но финальный критерий готовности требует общие проверки выше.

### Запрещенные команды

Агентам запрещено запускать сборку документации и команды, которые транзитивно ее запускают:

- `pnpm run build`
- `pnpm --filter @lite-fsm/docs build`
- `pnpm run docs:build`
- `pnpm run pages:build*`
- любые `next build` внутри `apps/docs`

Если нужна проверка docs build, передать ее пользователю. Для package build использовать только `pnpm run build:packages`.

### Вне области работ

- Не вводить callback `install`.
- Не принимать structural plugin objects в `MachineManager(..., { plugins })`.
- Не добавлять автоматический prefixing вида `pluginName:key`.
- Не менять top-level формат `MachineManagerSnapshot`: `snapshot.storage` остается `Record<string, unknown>`.
- Не типизировать per-machine snapshot payload в storage runtime через `MachineStore` generic.
- Не менять routing priority, actor sender semantics, middleware pipeline или standalone `Machine(...)`.

## 3. Целевой public API

### `definePlugin`

`definePlugin<PluginEvents, HostEvents>()` должен разделять роли generics:

- `PluginEvents` — события, которые plugin добавляет в `manager.transition` через `PluginManagerEvents<Plugins>` и может эмитить через `scope.transition`.
- `HostEvents` — события host manager, которые plugin типизированно наблюдает в callbacks.

Контракт observer contexts:

```ts
definePlugin().create(...)
```

- `ctx.action`, `ctx.originalAction`, `routeMeta ctx.action`, `scope.event`: `ManagerAction<AnyEvent>`.
- `scope.transition(action)`: `ManagerAction<never>`.
- `PluginManagerEvents<typeof plugin>`: `never`.

```ts
definePlugin<PluginEvents>().create(...)
```

- `ctx.action`, `ctx.originalAction`, `routeMeta ctx.action`, `scope.event`: `ManagerAction<AnyEvent>`.
- `scope.transition(action)`: только `ManagerAction<PluginEvents>`.
- `PluginManagerEvents<typeof plugin>`: только `PluginEvents`.

```ts
definePlugin<PluginEvents, HostEvents>().create(...)
```

- `ctx.action`, `ctx.originalAction`, `routeMeta ctx.action`, `scope.event`: `ManagerAction<HostEvents | PluginEvents>`.
- `scope.transition(action)`: только `ManagerAction<PluginEvents>`.
- `PluginManagerEvents<typeof plugin>`: только `PluginEvents`.

Runtime delivery не фильтруется по `PluginEvents` или `HostEvents`: plugin callbacks могут быть вызваны на любом action manager-а.

### Плоское пространство ключей

Все exposed keys являются плоскими публичными ключами:

- `routeMeta.cacheKey` означает `action.meta.cacheKey`.
- `manager.cache` означает `manager.cache`.
- `scopedDeps.trace` означает `deps.trace`.
- `scopedTransition.refresh` означает `deps.transition.refresh`.

Core не добавляет namespace и не переписывает keys. Конфликт ключей должен быть hard error.

Multi-instance plugin factory обязана делать уникальными не только `name`, но и все exposed keys, если несколько экземпляров могут быть установлены в один manager.

### `defineStorageRuntime`

`defineStorageRuntime<Extension>().create(...)` остается single-generic API. `Extension` описывает machine-facing и runtime-only контракт storage runtime.

Machine-facing поля, которые входят в `PluginMachineExtensions<Plugins>`:

```ts
input
internalEvents
reducerContext
effectDeps
reactionDeps
resultMetadata
publicState
storage // добавляется builder-ом из literal kind
```

Runtime-only поля, которые не входят в `PluginMachineExtensions<Plugins>`:

```ts
runtimeState
templateData
snapshotData
invocation
identity
```

Целевой public shape:

```ts
type StorageRuntimeExtension = {
  readonly input?: object;
  readonly internalEvents?: AnyEvent;
  readonly reducerContext?: object;
  readonly effectDeps?: object;
  readonly reactionDeps?: object;
  readonly resultMetadata?: object;
  readonly publicState?: unknown;
  readonly runtimeState?: unknown;
  readonly templateData?: unknown;
  readonly snapshotData?: unknown;
  readonly invocation?: unknown;
  readonly identity?: Readonly<Record<string, unknown>>;
};

type StorageTemplate<TemplateData = unknown> = {
  readonly key: string;
  readonly kind: string;
  readonly data?: TemplateData;
};
```

`routeMetaKeys` остается `readonly string[]` и проверяется только runtime validation.

## 4. Целевая runtime-архитектура

### Plugin callbacks

Pipeline остается прежним: storage `prepareAction`, middleware, storage `beforeReduce`, public interceptors, dispatch hooks, reducers, commit, subscribers, reactions, effects.

Типы callbacks должны отражать фактическое runtime-поведение: callbacks наблюдают общий поток action-ов manager-а, а не только `PluginEvents`.

### Registry diagnostics

Конфликты должны показывать section, key и обоих владельцев:

```txt
[lite-fsm] duplicate routeMeta key 'cacheKey': plugin 'a' conflicts with plugin 'b'.
```

Применить owner-aware diagnostics для:

- `routeMeta`;
- `manager`;
- `scopedDeps`;
- `scopedTransition`;
- `storage kind`.

Error codes сохранять существующие, если не требуется новый сценарий.

### Storage runtime typing

Внутри storage runtime contexts:

- `ctx.state`: `Extension["runtimeState"]`, fallback `unknown`;
- `ctx.template.data`: `Extension["templateData"] | undefined`, fallback `unknown | undefined`;
- `ctx.templates`: `readonly StorageTemplate<TemplateData>[]`;
- `ctx.snapshot`: `Extension["snapshotData"] | undefined`, fallback `unknown | undefined`;
- `ctx.invocation`: `Extension["invocation"]`, fallback `unknown`;
- `identity.resolve(ctx)`: `Extension["identity"] | undefined`, fallback `Readonly<Record<string, unknown>> | undefined`;
- `ctx.action` и `ctx.originalAction`: `ManagerAction<AnyEvent>`.

`runtimeState` не должен принудительно становиться `readonly`. Core сохраняет тип, объявленный author-ом.

### Snapshot API для storage runtime

Public storage snapshot block должен использовать field `snapshot`, не `storage`:

```ts
snapshot: {
  dehydrate(ctx) {
    return {
      machines: {},
      snapshot: { commits: 1 },
    };
  },
  hydrate(ctx) {
    ctx.machines;
    ctx.snapshot;
    return { nextState: ctx.baseState, changed: false };
  },
}
```

`ctx.machines` — `Readonly<Record<string, unknown>>` с machine snapshots текущего storage kind.

`ctx.snapshot` — payload текущего storage kind из `MachineManagerSnapshot.storage[kind]`.

Top-level manager snapshot остается:

```ts
{
  machines: {},
  storage: {
    "document-cache": { commits: 1 }
  }
}
```

Legacy `{ storage }` в return value `snapshot.dehydrate()` не поддерживать как public alias. Runtime должен считать такой result invalid, а не silently ignore. Любой unknown top-level field в result `snapshot.dehydrate()` считается invalid.

## 5. Этапы реализации

### Этап 1 — Типовая семантика `definePlugin`

#### Цель

Исправить public type contract plugin callbacks так, чтобы типы соответствовали runtime delivery.

#### Зависит от

Нет зависимостей.

#### Контракт этапа

В `packages/core/src/plugin.ts` изменить вычисление observer event type:

- для `definePlugin<PluginEvents>()` observer contexts должны видеть `AnyEvent`;
- для `definePlugin<PluginEvents, HostEvents>()` observer contexts должны видеть `HostEvents | PluginEvents`;
- для `definePlugin()` observer contexts должны видеть `AnyEvent`;
- `PluginManagerEvents<Plugins>` не должен включать `HostEvents`;
- `scope.transition` должен принимать только `PluginEvents`.

Runtime pipeline не менять. Delivery остается без фильтрации по generics.

#### Не делать в этом этапе

- Не менять storage runtime types.
- Не менять registry diagnostics.
- Не добавлять runtime filtering callbacks.

#### Тесты этапа

Tstyche:

- `definePlugin<PluginEvent>()` дает `ctx.action: ManagerAction<AnyEvent>`.
- `definePlugin<PluginEvent>()` дает `scope.event: ManagerAction<AnyEvent>`.
- `definePlugin()` дает `ctx.action: ManagerAction<AnyEvent>` и `PluginManagerEvents<typeof plugin> = never`.
- `scope.transition` принимает `ManagerAction<PluginEvent>` и отклоняет host/app events.
- `definePlugin<PluginEvent, HostEvent>()` дает observer contexts `ManagerAction<HostEvent | PluginEvent>`.
- `PluginManagerEvents<typeof plugin>` остается `PluginEvent`.

Vitest:

- plugin с `PluginEvents` получает runtime action, которого нет в `PluginEvents`, без фильтрации.

#### Критерий завершения

Этап завершен, если type tests фиксируют новый контракт, runtime tests подтверждают отсутствие фильтрации, а существующие plugin tests обновлены без ослабления проверок.

### Этап 2 — Плоский namespace и owner-aware diagnostics

#### Цель

Сохранить плоское пространство ключей и сделать конфликты пригодными для публичной интеграции.

#### Зависит от

Нет зависимостей.

#### Контракт этапа

В `packages/core/src/runtime/kernel/registry.ts` и `packages/core/src/runtime/kernel/routing.ts` хранить owner первого зарегистрированного key. Для `storage kind` registry должен принимать owner при регистрации или хранить owner рядом с runtime entry.

При конфликте runtime должен бросать существующий `LiteFsmError` code и сообщение с обоими plugin owner-ами.

Обязательные сценарии:

- duplicate `routeMeta` key;
- duplicate `manager` key;
- duplicate `scopedDeps` key;
- duplicate `scopedTransition` key;
- duplicate `storage kind`.

Сообщение должно явно указывать section и key.

#### Не делать в этом этапе

- Не добавлять automatic prefixing.
- Не менять public key names.
- Не менять error codes без необходимости.
- Не добавлять soft warning режим.

#### Тесты этапа

Vitest:

- каждый duplicate key бросает ожидаемый `LiteFsmError.code`;
- сообщение содержит key, текущий plugin owner и конфликтующий owner;
- reserved core key diagnostics продолжают работать.

#### Критерий завершения

Этап завершен, если все registry conflicts имеют owner-aware сообщения и текущие negative tests не потеряли проверку error code.

### Этап 3 — Public model storage extension

#### Цель

Расширить `defineStorageRuntime<Extension>()` до стабильного single-generic контракта.

#### Зависит от

Нет зависимостей.

#### Контракт этапа

В `packages/core/src/pluginStorageTypes.ts`:

- переименовать или расширить текущий `PluginMachineExtensionInput` до public `StorageRuntimeExtension`;
- добавить runtime-only fields:
  - `runtimeState`;
  - `templateData`;
  - `snapshotData`;
  - `invocation`;
  - `identity`.
- добавить `StorageTemplate<TemplateData = unknown>`.

`PluginMachineExtensions<Plugins>` должен возвращать только machine-facing поля и `storage`.

`Extension` не должен принимать unknown top-level keys. `storage` внутри `Extension` должен оставаться запрещенным.

#### Не делать в этом этапе

- Не менять snapshot runtime behavior.
- Не менять public dehydrate return shape.
- Не экспортировать internal kernel contexts напрямую.

#### Тесты этапа

Tstyche:

- `PluginMachineExtensions<typeof plugin>` содержит `input`, `internalEvents`, `reducerContext`, `effectDeps`, `reactionDeps`, `resultMetadata`, `publicState`, `storage`;
- `PluginMachineExtensions<typeof plugin>` не содержит `runtimeState`, `templateData`, `snapshotData`, `invocation`, `identity`;
- `Extension` с unknown key отклоняется;
- `Extension` с `storage` отклоняется.

#### Критерий завершения

Этап завершен, если новый extension shape определен в `pluginStorageTypes.ts`, используется `defineStorageRuntime<Extension>()` и machine extension inference не раскрывает runtime-only поля. Root export выполняется на этапе 6.

### Этап 4 — Generic storage contexts

#### Цель

Протянуть `Extension` в storage runtime contexts, чтобы storage author получал типы без ручных casts.

#### Зависит от

Этап 3.

#### Контракт этапа

В `packages/core/src/pluginStorageTypes.ts` и `packages/core/src/runtime/kernel/storage.ts` ввести public generic context types для storage callbacks.

Минимальный набор public context exports:

- `StorageValidateTemplateContext<Kind, Extension>`;
- `StorageCompileTemplateContext<Kind, Extension>`;
- `StorageCreateRuntimeStateContext<Extension>`;
- `StorageCreatePublicInitialStateContext<Extension>`;
- `StoragePrepareActionContext<Extension>`;
- `StorageBeforeReduceContext<Extension>`;
- `StorageAcceptsEventContext<Extension>`;
- `StorageReduceContext<Extension>`;
- `StorageReduceBucketContext<Extension>`;
- `StorageCommitContext<Extension>`;
- `StorageConditionContext<Extension>`;
- `StorageResolveEffectInvocationsContext<Extension>`;
- `StorageEffectInvocationContext<Extension>`;
- `StorageDehydrateContext<Extension>`;
- `StorageHydrateContext<Extension>`;
- `StorageIdentityContext<Extension>`;
- `StorageReactionContext<Extension>`.

Context typing:

- `validateTemplate(ctx.machine)` и `compileTemplate(ctx.machine)` сохраняют текущую типизацию через `Extension["input"]`;
- `compileTemplate()` возвращает `void | { data?: TemplateData; key?: never; kind?: never }`;
- `createRuntimeState()` возвращает `RuntimeState`;
- `createRuntimeState(ctx).templates` использует `readonly StorageTemplate<TemplateData>[]`;
- `createPublicInitialState()` возвращает `PublicState`, если `publicState` объявлен;
- `acceptsEvent`, `reduce`, `reduceBucket`, `commit`, `effects`, `snapshot`, `identity`, `reactions` получают `ctx.state: RuntimeState`;
- `resolveInvocations()` возвращает `readonly Invocation[]`;
- `invoke(ctx).invocation` имеет тип `Invocation`;
- `identity.resolve()` возвращает `Identity | undefined`;
- `action` и `originalAction` остаются `ManagerAction<AnyEvent>`.

Fallback types:

- `runtimeState`: `unknown`;
- `templateData`: `unknown`;
- `snapshotData`: `unknown`;
- `invocation`: `unknown`;
- `identity`: `Readonly<Record<string, unknown>>`;
- `publicState`: `unknown`.

#### Не делать в этом этапе

- Не типизировать root `dispatch.nextState` по machine keys.
- Не типизировать per-machine snapshots.
- Не менять runtime object shapes.

#### Тесты этапа

Tstyche:

- `compileTemplate().data` проверяется как `templateData`;
- `ctx.template.data` имеет тип `TemplateData | undefined`;
- `ctx.templates` имеет тип `readonly StorageTemplate<TemplateData>[]`;
- `ctx.state` имеет тип `runtimeState`;
- `createRuntimeState()` обязан вернуть `runtimeState`;
- `createPublicInitialState()` обязан вернуть `publicState`;
- `resolveInvocations()` принимает readonly result;
- `ctx.invocation` имеет тип `invocation`;
- `identity.resolve()` возвращает `identity | undefined`;
- callbacks без runtime-only fields сохраняют `unknown` fallback.
- exported context types покрывают `acceptsEvent` и `effects.condition`.

#### Критерий завершения

Этап завершен, если storage runtime callbacks имеют stable contextual typing inline и public context types доступны из `@lite-fsm/core`.

### Этап 5 — Snapshot API storage runtime

#### Цель

Стабилизировать storage snapshot API: `{ snapshot }` в `dehydrate()` и разделенные `ctx.machines` / `ctx.snapshot` в `hydrate()`.

#### Зависит от

Этапы 3 и 4.

#### Контракт этапа

В public storage runtime `snapshot.dehydrate(ctx)` должен возвращать:

```ts
{
  readonly machines?: Record<string, unknown>;
  readonly snapshot?: SnapshotData;
}
```

`snapshot.hydrate(ctx)` должен получать:

- `ctx.machines: Readonly<Record<string, unknown>>`;
- `ctx.snapshot: SnapshotData | undefined`;
- `ctx.baseState`;
- `ctx.strategy`;
- `ctx.source`;
- `ctx.mode`.

В `packages/core/src/runtime/kernel/snapshot.ts` сохранить top-level manager format:

- `dehydrate()` кладет runtime `result.snapshot` в `MachineManagerSnapshot.storage[kind]`;
- `hydrate()` достает `MachineManagerSnapshot.storage[kind]` и передает payload в `ctx.snapshot`;
- machine snapshots текущего kind передаются в `ctx.machines`;
- полный manager envelope не передается в storage runtime.

Legacy `{ storage }` из storage runtime `dehydrate()` не поддерживать как public alias. Если runtime возвращает object result с unknown top-level field, включая `storage`, core должен бросать `LiteFsmError` с кодом `LITE_FSM_INVALID_STORAGE_RUNTIME`.

#### Не делать в этом этапе

- Не менять top-level `MachineManagerSnapshot["storage"]`.
- Не добавлять migration layer для `{ storage }`.
- Не типизировать `ctx.machines` глубже `Record<string, unknown>`.

#### Тесты этапа

Vitest:

- storage `dehydrate()` с `{ snapshot }` попадает в `manager.dehydrate().storage[kind]`;
- storage `hydrate()` получает `ctx.snapshot` payload конкретного kind;
- storage `hydrate()` получает `ctx.machines` только для своего kind;
- round-trip custom storage snapshot сохраняет текущее поведение на новом API;
- runtime без snapshot capability сохраняет текущие errors;
- old `{ storage }` и любой другой unknown top-level field в result бросают `LITE_FSM_INVALID_STORAGE_RUNTIME` и не попадают в manager snapshot.

Tstyche:

- `dehydrate().snapshot` типизируется как `snapshotData`;
- `hydrate(ctx).snapshot` типизируется как `snapshotData | undefined`;
- `hydrate(ctx).machines` остается `Readonly<Record<string, unknown>>`.

#### Критерий завершения

Этап завершен, если snapshot round-trip работает на новом API, старый public shape не требуется, а top-level manager snapshot не изменился.

### Этап 6 — Public exports и документация

#### Цель

Обновить public exports и справочники API под стабильный контракт.

#### Зависит от

Этапы 1-5.

#### Контракт этапа

В `packages/core/src/index.ts` экспортировать:

- `StorageRuntimeExtension`;
- `StorageTemplate`;
- generic public storage context types из этапа 4.

Обновить:

- `PLUGIN-SYSTEM-CHEATSHEET.md`;
- `API-CHEATSHEET.md`;
- `TYPES-CHEATSHEET.md`.

Документация должна описывать:

- первый generic `definePlugin` как plugin-emitted events;
- второй generic `definePlugin` как host-observed events;
- observer contexts по умолчанию `AnyEvent`;
- flat namespace и ответственность plugin author/integrator за уникальные keys;
- owner-aware conflict diagnostics;
- runtime-only storage fields;
- `dehydrate()` result `{ machines?, snapshot? }`;
- `hydrate(ctx).machines` и `hydrate(ctx).snapshot`;
- `routeMetaKeys` как runtime dependency с runtime validation;
- отсутствие runtime-only fields в `PluginMachineExtensions`.

Cheatsheets должны оставаться справочниками возможностей, а не changelog.

#### Не делать в этом этапе

- Не запускать docs build.
- Не добавлять migration history в cheatsheets.
- Не документировать unstable alias `{ storage }`.

#### Тесты этапа

Tstyche:

- `exports-surface.tst.ts` проверяет новые exports;
- public context types импортируются из `@lite-fsm/core`;
- старые public exports не пропали.

Runtime tests не требуются, если этап меняет только exports/docs.

#### Критерий завершения

Этап завершен, если root exports доступны, cheatsheets отражают новый контракт и docs не содержат устаревший storage runtime API.

### Этап 7 — Рефакторинг, чистка и полировка

#### Цель

После стабилизации plugin system привести кодовую базу к чистому состоянию: убрать временный код, transitional aliases, устаревшие validation paths, лишние типы и импорты, чтобы изменения этапов 1-6 не оставили техдолг в public API, storage runtime и registry.

#### Зависит от

Этапы 1-6.

#### Контракт этапа

- Public API, public types, runtime order, snapshot format, routing priority и error semantics не меняются.
- В `packages/core/src/plugin.ts`, `pluginTypes.ts` и `pluginHelpers.ts` удалены неиспользуемые aliases, transitional conditional types и imports, появившиеся при смене observer typing.
- В `packages/core/src/pluginStorageTypes.ts`, `pluginStorage.ts` и `pluginStorageNormalize.ts` удалены устаревшие names старого storage contract, compatibility branches, dead validation paths и дублирующая type plumbing.
- В `packages/core/src/runtime/kernel/registry.ts`, `routing.ts`, `storage.ts`, `snapshot.ts` и `createMachineManagerFactory.ts` удалены временные helpers, dead branches, лишние owner maps и промежуточные adapters, не нужные после финального owner-aware diagnostics и snapshot API.
- Runtime validation для `snapshot.dehydrate()` не содержит silent ignore для legacy `{ storage }` или unknown top-level fields.
- Комментарии описывают финальный stable contract, а не миграционные решения.
- Tests, fixtures и cheatsheets не содержат старые examples и transitional assertions, кроме исторических logs или явно помеченных regression-аудитов.
- `rg` audit по старым identifiers выполняется и все найденные active code hits либо удалены, либо документированы как допустимые regression/history hits.
- Нет временных TODO/FIXME, debug logging, unused imports, unused locals и dead branches в scope refactor.

Обязательный static audit:

```bash
rg "HostEvents.*never|ObserverEvents|snapshot.*storage|\\bstorage:\\s*\\{|PluginMachineExtensionInput|StorageTemplatePayload|NormalizedStorageMachineExtension|preparedAction|committedAction|dispatch\\.dropped" packages/core/src tests PLUGIN-SYSTEM-CHEATSHEET.md API-CHEATSHEET.md TYPES-CHEATSHEET.md
```

Найденные hits допустимы только если они относятся к актуальному final contract, явно негативному regression test или историческому журналу.

#### Не делать в этом этапе

- Не добавлять новые public capabilities.
- Не менять public API или public types без возврата к релевантному этапу и обновления acceptance tests.
- Не менять dispatch order, middleware semantics, actor behavior, snapshot/hydrate, routing или error codes.
- Не выполнять декоративные переименования, которые не снижают сложность и не убирают legacy мусор.
- Не запускать docs build.

#### Тесты этапа

- Focused runtime regression для plugin callbacks, owner-aware conflicts, storage builder validation, storage context typing fixtures, snapshot round-trip и hydrate edge cases.
- Focused type regression для `definePlugin`, `PluginMachineExtensions`, public storage builder, exported public surface и documentation fixture.
- Static/source audit:
  - `rg` audit по старым identifiers из контракта этапа;
  - audit unused imports через `pnpm run lint`;
  - `git diff --check`.
- Если сложные участки runtime/kernel или type plumbing упрощены, сохранить или добавить tests, которые покрывают упрощенные branches.

#### Критерий завершения

- Refactor не меняет public behavior: focused runtime/type regressions проходят.
- Старый plugin/storage stable API contract отсутствует в active code paths и public examples.
- `pnpm run lint` проходит.
- `git diff --check` проходит.
- Оставшиеся search hits по старым identifiers находятся только в historical logs, актуальном final contract или явно допустимых regression-аудитах.
- Журнал реализации фиксирует, какие модули очищены, какие проверки запускались и какие hits search audit оставлены осознанно.

## 6. Критерий полной готовности

Работа считается завершенной, если выполнены все условия:

- `definePlugin` имеет новый observer typing contract.
- Runtime delivery plugin callbacks не фильтруется по generics.
- Flat namespace сохранен, automatic prefixing отсутствует.
- Duplicate key errors указывают обоих owner-ов.
- `defineStorageRuntime<Extension>()` поддерживает `runtimeState`, `templateData`, `snapshotData`, `invocation`, `identity`.
- Runtime-only поля не попадают в `PluginMachineExtensions`.
- Storage contexts имеют generic public typing и доступны inline.
- `StorageTemplate<TemplateData>` экспортируется.
- `createPublicInitialState()` проверяется через `publicState`.
- `resolveInvocations()` возвращает `readonly Invocation[]`.
- Storage `dehydrate()` использует `{ snapshot }`, а не `{ storage }`.
- Storage `hydrate(ctx)` получает `ctx.machines` и `ctx.snapshot`.
- Top-level `MachineManagerSnapshot` сохраняет `storage: Record<string, unknown> | undefined`.
- `routeMetaKeys` остается `readonly string[]` с runtime validation.
- `PLUGIN-SYSTEM-CHEATSHEET.md`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md` обновлены.
- Этап рефакторинга, чистки и полировки завершен: legacy мусор удален, сложные участки упрощены, unused imports/dead code отсутствуют.
- Все новые и существующие runtime/type tests проходят.

Финальные проверки:

```bash
pnpm run test
pnpm run test:types
pnpm run check-types
pnpm run lint
git diff --check
```

Запрещенные docs build команды не запускать.
