# TypedCreateMachineFn plugin source — ТЗ для реализации

## 1. Цель

Сделать `TypedCreateMachineFn` единой public точкой сборки типизированного `createMachine` для приложений с plugins.

Третий generic `TypedCreateMachineFn<P, D, Plugins>` должен принимать только plugin source:

- plugin value;
- plugin union;
- readonly plugin tuple;
- отсутствие третьего generic для core-only wrapper.

Ручная передача extension union в `TypedCreateMachineFn` удаляется из public API. `PluginMachineExtensions<Plugins>` удаляется из public API. `MachineRuntimeExtension` тоже перестает быть public root API для ручной сборки wrapper. Публичным storage-author контрактом остается `StorageRuntimeExtension`.

Основной public pattern:

```ts
const plugins = [entitiesPlugin({ spawn }), cachePlugin()] as const;

type MachineEvents = AppEvents | PluginManagerEvents<typeof plugins>;
type MachineDeps = EffectDeps<AppDeps, typeof plugins>;

export const createMachine: TypedCreateMachineFn<
  MachineEvents,
  MachineDeps,
  typeof plugins
> = createLiteFsmMachine;
```

ТЗ закрывает текущий type gap для `EntityMachineExtension`: entity plugin должен иметь возможность получить точные `initialContext` и `spawnSchema` каждого `storage: "entity"` template в phantom metadata результата без entity-specific hardcode в `@lite-fsm/core`.

## 2. Как выполнять это ТЗ

Реализация идет по этапам. Следующий этап начинается только после выполнения `stage gate` текущего этапа.

Запрещенные для агента проверки:

- `pnpm run build`;
- `pnpm --filter @lite-fsm/docs build`;
- `pnpm run docs:build`;
- `pnpm run pages:build*`;
- любой `next build` внутри `apps/docs`.

Для package build использовать только `pnpm run build:packages`, если изменение public type surface требует build-проверки и команда не запускает docs build.

### Область работ

- `packages/core/src/createMachine.types.ts`;
- `packages/core/src/types.ts`;
- `packages/core/src/pluginStorageTypes.ts`;
- `packages/core/src/pluginHelpers.ts`;
- `packages/core/src/plugin.ts`;
- `packages/core/src/index.ts`;
- `tests/types/`;
- `API-CHEATSHEET.md`;
- `TYPES-CHEATSHEET.md`.

### Вне области работ

- Реализация `packages/entities`.
- Runtime entity storage, entity spawn, routing, snapshots, React hooks.
- Изменение runtime behavior `createMachine`, `MachineManager`, plugin storage callbacks.
- Автоматическое добавление `PluginManagerEvents<Plugins>` в `P`.
- Автоматическое добавление `EffectDeps<AppDeps, Plugins>` в `D`.
- Добавление lifecycle events в public `AppEvents`.
- Hardcode для `EntityMachineExtension`, `storage: "entity"`, `entityContextSchema` или `entitySpawnSchema` внутри `@lite-fsm/core`.
- Отдельные package-specific wrappers вроде `TypedEntityCreateMachineFn`.

### Общие инварианты

- Прямой public `createMachine<AppEvents>(...)` остается core-only.
- Plugin-aware typing доступен через app wrapper `TypedCreateMachineFn<P, D, typeof plugins>`.
- `storage: "instance"` и wrapper без third generic сохраняют текущее поведение.
- `TypedCreateMachineFn<P, D>` без third generic не требует plugins, не принимает custom plugin storage kinds и сохраняет все существующие core-only type tests для обычных domain machines и actor templates.
- `internalEvents` не становятся public manager events.
- Phantom keys `__liteFsmRuntime` и `__liteFsmDependencies` остаются type-only и не появляются в runtime value.
- Runtime validation storage plugins остается источником runtime ошибок; TypeScript inference не заменяет validation.
- Public API не содержит двух способов собрать plugin-aware wrapper.

## 3. Целевой public API

Форма public type:

```ts
export type TypedCreateMachineFn<
  P extends AnyEvent = AnyEvent,
  D extends AnyRecord = {},
  Plugins extends PluginSource = never,
> = ...
```

`Plugins` интерпретируется так:

- `never` или отсутствующий generic: core-only typing;
- `LiteFsmPlugin`: plugin-aware typing для одного plugin;
- `LiteFsmPlugin` union: plugin-aware typing для union plugins;
- readonly tuple plugins: plugin-aware typing для app plugin tuple;
- широкий `readonly LiteFsmPlugin[]`: допускается, но не обязан сохранять plugin-specific inference;
- любой non-plugin third generic: type-level error.

Public helper status:

- `PluginManagerEvents<Plugins>` остается явным способом расширить `P`;
- `EffectDeps<AppDeps, Plugins>` остается явным способом расширить `D`;
- `PluginMachineExtensions<Plugins>` удаляется из public exports и cheatsheets;
- `MachineRuntimeExtension` удаляется из public root exports и cheatsheets;
- internal machine-facing extension type должен быть private implementation detail core/plugin storage typing;
- machine-facing extension extraction остается internal helper для реализации `TypedCreateMachineFn`.

### Storage author contract для cfg-dependent typing

Machine-facing поля storage extension имеют две формы.

Fixed field:

```ts
type CacheStorageExtension = {
  input: {
    ttl: number;
    initialContext: { token: string };
  };
  resultMetadata: { storage: "cache" };
  effectDeps: { cacheApi: { read(): string } };
  publicState: { ready: boolean; value: string };
};
```

Dependent field:

```ts
type EntityTemplateInput = {
  storage: "entity";
  initialState: "__INIT";
  initialContext: EntitySchema;
  spawnSchema: EntitySchema;
};

type EntityStorageExtension = {
  input: EntityTemplateInput;
  resultMetadata: <Input extends EntityTemplateInput>(input: Input) => {
    entityContextSchema: Input["initialContext"];
    entitySpawnSchema: Input["spawnSchema"];
  };
  reducerContext: <Input extends EntityTemplateInput>(input: Input) => EntityReducerContext<Input["spawnSchema"]>;
  effectDeps: <Input extends EntityTemplateInput>(input: Input) => EntityEffectDeps<Input["initialContext"]>;
  reactionDeps: <Input extends EntityTemplateInput>(input: Input) => EntityReactionDeps<Input["initialContext"]>;
  publicState: <Input extends EntityTemplateInput>(input: Input) => EntityMachinePublicState<Input["initialContext"]>;
};
```

Правила:

- dependent form разрешена только для `resultMetadata`, `reducerContext`, `effectDeps`, `reactionDeps` и `publicState`;
- `input` остается fixed object shape и является источником contextual typing для storage-specific полей `createMachine(...)`;
- `internalEvents` остается fixed field и не зависит от concrete template input;
- функция dependent field является type-only function signature внутри extension type; runtime не создает и не вызывает эту функцию;
- core применяет dependent field к concrete storage input текущего template по правилу `Field extends (input: ConcreteInput) => infer Result ? Result : Field`;
- `ConcreteInput` включает `storage` и поля из storage `input`, выведенные из object literal `createMachine(...)`;
- return type dependent field должен соответствовать контракту исходного поля: object для `resultMetadata`, `reducerContext`, `effectDeps`, `reactionDeps`; любой non-function value для `publicState`.

## 4. Целевая архитектура

`TypedCreateMachineFn` должен нормализовать `Plugins` в набор storage typing rules:

1. Если `Plugins` равен `never`, используется core-only overload.
2. Если `Plugins` является plugin source, core извлекает storage definitions из plugin definition.
3. Для каждого storage definition core строит storage-specific overload по `kind`.
4. Для fixed machine-facing fields core использует поля storage extension как есть.
5. Для dependent machine-facing fields core применяет function signature поля к concrete storage input текущего template.

Cfg-dependent typing является общим plugin protocol, а не entity-specific правилом. Для storage author это advanced type-only contract внутри `defineStorageRuntime<Extension>().create(...)`: machine-facing поля могут быть fixed object types или dependent field signatures от concrete storage input.

Минимальный ожидаемый outcome для будущего entity storage:

```ts
const plugins = [entitiesPlugin({ spawn })] as const;

export const createMachine: TypedCreateMachineFn<
  AppEvents | PluginManagerEvents<typeof plugins>,
  EffectDeps<AppDeps, typeof plugins>,
  typeof plugins
> = createLiteFsmMachine;

const projectile = createMachine({
  storage: "entity",
  initialState: "__INIT",
  initialContext: projectileContextSchema,
  spawnSchema: projectileSpawnSchema,
  config: { __INIT: { ENTITY_SPAWNED: "alive" }, alive: {} },
});

const enemy = createMachine({
  storage: "entity",
  initialState: "__INIT",
  initialContext: enemyContextSchema,
  spawnSchema: enemySpawnSchema,
  config: { __INIT: { ENTITY_SPAWNED: "alive" }, alive: {} },
});
```

`MachineResultMetadata<typeof projectile>` и `MachineResultMetadata<typeof enemy>` должны хранить разные schema types. `MachinesState`, reducer meta, effect deps и reaction deps должны использовать metadata concrete template.

## 5. Этапы реализации

### Этап 1 - Public API collapse to plugin source

#### Цель

Убрать public extension-union path из `TypedCreateMachineFn` и сделать plugin source единственным third generic.

#### Зависит от

- Актуальная plugin system type surface.
- Существующие tests для `TypedCreateMachineFn`, `PluginManagerEvents` и `EffectDeps`.

#### Контракт этапа

- `TypedCreateMachineFn<P, D>` сохраняет core-only поведение.
- `TypedCreateMachineFn<P, D>` без third generic не зависит от plugin types и не требует изменения existing core-only app wrappers.
- `TypedCreateMachineFn<P, D, typeof plugins>` извлекает storage typing из plugin tuple.
- `TypedCreateMachineFn<P, D, typeof pluginA | typeof pluginB>` поддерживает plugin union.
- `TypedCreateMachineFn<P, D, readonly LiteFsmPlugin[]>` не обязан сохранять plugin-specific inference для широких arrays.
- `TypedCreateMachineFn<P, D, MachineRuntimeExtension>` больше не является public supported API.
- `TypedCreateMachineFn<P, D, PluginMachineExtensions<typeof plugins>>` должен стать type-level error.
- `PluginMachineExtensions<Plugins>` удаляется из root exports и public cheatsheets.
- `MachineRuntimeExtension` удаляется из root exports и public cheatsheets; если core нужен аналогичный shape внутри, он должен быть internal type, не экспортируемый из root entrypoint.
- Internal helper для извлечения machine-facing extensions может остаться private type alias.
- Plugin source не должен автоматически менять `P` и `D`; пользователь явно задает `PluginManagerEvents` и `EffectDeps`.

#### Не делать в этом этапе

- Не добавлять cfg-dependent entity typing.
- Не менять runtime `createMachine.ts`.
- Не менять plugin runtime value shape.
- Не менять `PluginManagerEvents` и `EffectDeps` public names.
- Не документировать `@lite-fsm/entities` как готовый package.

#### Тесты этапа

- Tstyche: core-only wrapper сохраняет существующее поведение.
- Tstyche: `TypedCreateMachineFn<P, D>` без third generic поддерживает обычную domain machine, обычный actor template с `__INIT` и `storage: "instance"`.
- Tstyche: `TypedCreateMachineFn<P, D>` без third generic не принимает custom plugin storage kind.
- Tstyche: `TypedCreateMachineFn<P, D, typeof plugins>` принимает storage kind из plugin tuple.
- Tstyche: plugin union работает как tuple union.
- Tstyche: широкий plugin array теряет plugin-specific inference по текущему contract.
- Tstyche: third generic с unknown object shape отклоняется.
- Tstyche: direct extension union как third generic отклоняется.
- Tstyche: `PluginMachineExtensions` нельзя импортировать из root entrypoint.
- Tstyche: `MachineRuntimeExtension` нельзя импортировать из root entrypoint.
- Existing plugin-aware type tests обновлены на `TypedCreateMachineFn<P, D, typeof plugins>`.

#### Критерий завершения

- `TypedCreateMachineFn` принимает plugin source как единственный third generic.
- `TypedCreateMachineFn<P, D>` без third generic проходит existing core-only regression tests.
- Public exports больше не содержат `PluginMachineExtensions` и `MachineRuntimeExtension`.
- Type tests этапа проходят.

### Этап 2 - Cfg-dependent machine-facing fields

#### Цель

Добавить общий type-level contract, который позволяет storage plugin вывести `resultMetadata`, `reducerContext`, `effectDeps`, `reactionDeps` и `publicState` из concrete storage input конкретного `createMachine(...)`.

#### Зависит от

- Этап 1.

#### Контракт этапа

- Machine-facing fields extension могут оставаться fixed object types, как сейчас.
- Для cfg-dependent storage fields extension может объявить dependent field как generic function signature `<Input extends Extension["input"]>(input: Input) => Result`.
- Core применяет dependent field только на type level; runtime config и runtime plugin definition не получают новых обязательных полей.
- Concrete storage input должен выводиться из object literal `cfg` с учетом storage-specific fields.
- Dependent fields разрешены только для `resultMetadata`, `reducerContext`, `effectDeps`, `reactionDeps` и `publicState`.
- `internalEvents` и storage `kind` остаются fixed и не получают dependent form.
- `ExtensionCreateMachineInput` должен давать contextual typing storage-specific fields и одновременно позволять этим fields участвовать в inference concrete input.
- `ExtensionCreateMachineResult` должен записывать в `__liteFsmRuntime` поля, вычисленные из concrete input.
- `reducer` третий аргумент должен использовать concrete `reducerContext`.
- `effects` deps должны использовать concrete `effectDeps` и `reactionDeps`.
- `MachinesState<S>` должен использовать concrete `publicState`.
- Fixed storage extensions остаются supported внутри plugin source и не обязаны объявлять dependent fields.
- Unknown storage extension keys и missing `storage` продолжают отклоняться типами.

#### Не делать в этом этапе

- Не добавлять entity-specific names.
- Не менять runtime validation.
- Не менять storage callback runtime context.
- Не добавлять automatic plugin events/deps в `P`/`D`.
- Не возвращать public extension-union path.

#### Тесты этапа

- Tstyche: generic test storage выводит разные `MachineResultMetadata` для двух templates с разными `initialContext`, `spawnSchema` и literal field.
- Tstyche: `reducer` видит concrete payload helper в meta.
- Tstyche: `effects` видят deps, связанные с concrete input.
- Tstyche: `MachinesState<{ key: typeof template }>` использует concrete `publicState`.
- Tstyche: union из cfg-dependent storage и fixed storage выбирается по `storage`.
- Tstyche: fixed storage extension из plugin source не требует dependent fields.
- Tstyche: dependent form для `internalEvents` отклоняется или игнорируется как invalid extension shape.

#### Критерий завершения

- Cfg-dependent regression test проходит и падает на старой fixed-extension модели.
- Tests фиксируют exact dependent field shape через function signature на machine-facing field.
- Existing fixed storage extension tests проходят через plugin source.
- Runtime files не изменены без необходимости.

### Этап 3 - Entity-facing proof без `@lite-fsm/entities`

#### Цель

Проверить, что новый core protocol закрывает будущий entity сценарий без реализации пакета `@lite-fsm/entities`.

#### Зависит от

- Этапы 1-2.

#### Контракт этапа

- Добавить fake entity storage/plugin в type tests.
- Fake entity plugin подключается через `TypedCreateMachineFn<P, D, typeof plugins>`.
- Два `storage: "entity"` templates с разными `initialContext` и `spawnSchema` получают разные phantom metadata.
- `MachineResultMetadata<M>` содержит `entityContextSchema` и `entitySpawnSchema` concrete template.
- Fake `payloadFor(entity)` в reducer meta возвращает payload, выведенный из concrete `spawnSchema`.
- Fake `publicState` использует concrete `initialContext`.
- Recommended path не использует `PluginMachineExtensions`.

#### Не делать в этом этапе

- Не импортировать `@lite-fsm/entities`.
- Не добавлять schema descriptor runtime.
- Не документировать descriptors `f32`, `i16`, `i32`, `u8`, `string`, `optional` как доступные.
- Не запускать docs build.

#### Тесты этапа

- Tstyche: entity-facing proof с plugin tuple.
- Static assertion: metadata первого template не совместима с metadata второго template при разных schema keys.
- Static assertion: `MachineResultMetadata<typeof template>` не является `any` и не схлопывается в broad `Record<string, unknown>`.
- Static assertion: `TypedCreateMachineFn<P, D, typeof plugins>` поддерживает обычную domain machine и обычный actor template в том же wrapper.

#### Критерий завершения

- Entity-facing proof проходит без entity package.
- Обычные machines и actors работают в plugin-aware wrapper.
- Recommended path не требует ручного machine extension helper.

### Этап 4 - Документация public API

#### Цель

Обновить cheatsheets под единый plugin-aware `TypedCreateMachineFn` и удалить public документацию extension-union path.

#### Зависит от

- Этапы 1-3.

#### Контракт этапа

- `TYPES-CHEATSHEET.md` должен показывать `TypedCreateMachineFn<P, D, typeof plugins>` как единственный plugin-aware pattern.
- `TYPES-CHEATSHEET.md` должен явно сказать, что `P` и `D` расширяются пользователем через `PluginManagerEvents` и `EffectDeps`.
- `PluginMachineExtensions<Plugins>` должен отсутствовать в public cheatsheets.
- `MachineRuntimeExtension` должен отсутствовать в public cheatsheets.
- Документация должна указать, что plugin tuple path поддерживает storage-specific machine typing.
- Dependent field signatures для storage authors должны быть описаны как advanced storage author API.
- `API-CHEATSHEET.md` должен удалить упоминания public `PluginMachineExtensions`, public `MachineRuntimeExtension` и third generic как extension union.

#### Не делать в этом этапе

- Не писать entity package README.
- Не обещать автоматическое добавление plugin events/deps.
- Не оставлять два равноправных способа собрать wrapper.
- Не запускать docs build.

#### Тесты этапа

- Source audit: examples не используют `PluginMachineExtensions` для app wrapper.
- Source audit: docs не обещают runtime entity package.
- Source audit: docs не описывают `TypedCreateMachineFn<P, D, Extensions>`.
- Source audit: docs не описывают `MachineRuntimeExtension` как public API.
- `git diff --check`.

#### Критерий завершения

- Cheatsheets отражают единый recommended API.
- Public docs не содержат `PluginMachineExtensions` и `MachineRuntimeExtension`.
- Docs build не запускался.

### Этап 5 - Рефакторинг, чистка и полировка

#### Цель

Убрать временные type helpers и привести core type graph к одному владельцу plugin source normalization и cfg-dependent field resolution.

#### Зависит от

- Этапы 1-4.

#### Контракт этапа

Must fix:

- временные aliases, transitional branches и TODO в `createMachine.types.ts`;
- дублирование logic определения plugin source;
- дублирование logic выбора storage branch;
- дублирование logic применения fixed/dependent machine-facing fields к concrete input;
- public exports, tests или docs с `PluginMachineExtensions` или `MachineRuntimeExtension`;
- stale comments, где third generic описан как `Extensions`.

Inspect only:

- декоративные переименования public helper types;
- перенос logic между файлами без снижения сложности;
- изменение runtime storage dispatch или plugin registry;
- micro-optimizations type aliases без измеримого DX выигрыша.

Expected remaining hits:

- Исторические specs и журналы могут упоминать старый path через `PluginMachineExtensions`.
- Новое ТЗ и журнал могут упоминать старую модель как удаляемый scope.

#### Не делать в этом этапе

- Не менять runtime behavior.
- Не расширять scope на `@lite-fsm/entities`.
- Не менять public API names ради эстетики.
- Не удалять regression tests, добавленные на этапах 1-3.

#### Тесты этапа

- `pnpm run test:types`.
- `pnpm run check-types`.
- `pnpm run lint`, если изменены exported types или comments в linted files.
- `git diff --check`.
- Source audit по `TypedCreateMachineFn`, `PluginMachineExtensions`, `MachineRuntimeExtension` и новым source normalization helper names.

#### Критерий завершения

- Нет временных type helpers и stale comments в active scope.
- Regression tests остаются сфокусированными и не зависят от `@lite-fsm/entities`.
- Existing type tests и check-types проходят.
- `git diff --check` проходит.

## 6. Критерий полной готовности

- `TypedCreateMachineFn<P, D, typeof plugins>` является единственным plugin-aware API.
- `TypedCreateMachineFn<P, D>` без third generic остается core-only API и не ломает использование lite-fsm без plugins.
- `TypedCreateMachineFn<P, D, Extensions>` не поддерживается.
- `PluginMachineExtensions<Plugins>` отсутствует в public exports и документации.
- `MachineRuntimeExtension` отсутствует в public root exports и документации.
- Plugin tuple path поддерживает fixed storage extensions и cfg-dependent storage typing.
- Обычные domain machines, обычные actor templates, entity-like storage templates и другие plugin storages работают в одном wrapper.
- `MachineResultMetadata<M>`, `MachinesState<S>`, reducer meta и effects deps используют concrete storage input там, где plugin объявил cfg-dependent typing.
- Direct `createMachine` остается core-only public API.
- Нет entity-specific hardcode в `@lite-fsm/core`.
- Type tests покрывают positive, negative, plugin tuple, plugin union, broad plugin array и entity-facing proof scenarios.
- `API-CHEATSHEET.md` и `TYPES-CHEATSHEET.md` обновлены.
- Запрещенные docs build команды не запускались.
