# @lite-fsm/entities lazy deps provider — ТЗ для реализации

## 1. Цель

Устранить цикл типов при едином `MachineDeps` и единой фабрике `createMachine` для приложения, где `MachineDeps` содержит типизированный read-доступ к entity stores.

Целевой контракт:

- пользователь объявляет read-доступ в deps как provider-функцию:

```ts
type MachineDeps = {
  readonly getState: () => AppState;
  readonly entities: () => EntityAccess<AppMachines>;
  readonly sprites: SpriteAdapter;
  readonly clock: ClockAdapter;
};
```

- `AppMachines = typeof machines` и `AppState = MachinesState<AppMachines>` компилируются без `TS2502`, `TS2456` и implicit `any`;
- внутри обычных автоматов, actor templates, entity effects и entity reactions доступ используется как `entities().get(...)`;
- внешний manager API также становится provider-функцией: `manager.entities().get(...)`;
- `@lite-fsm/entities` больше не выводит `AppMachines` из `AppDeps.entities` через `EntityAccessMachinesFromDeps`;
- typed scoped read-доступ в entity effects/reactions сохраняет runtime semantics `createScopedEntityAccess(...)`.

## 2. Как выполнять это ТЗ

Перед началом реализации прочитать:

- `packages/entities/src/machine-extension.ts`;
- `packages/entities/src/plugin.ts`;
- `packages/entities/src/runtime/access.ts`;
- `packages/entities/src/runtime/effects.ts`;
- `packages/entities/src/runtime/reactions.ts`;
- `packages/entities/src/runtime/state.ts`;
- `packages/entities/src/react/index.ts`;
- `packages/core/src/createMachine.types.ts`;
- `ecs_example/store/deps.ts`;
- `ecs_example/store/index.ts`;
- `ecs_example/store/machines/enemy-sprite-actor.ts`;
- `tests/types/entities-api.tst.ts`;
- `tests/entities/entities-plugin.test.ts`;
- `tests/react/entities.test.tsx`;
- `packages/entities/README.md`;
- `API-CHEATSHEET.md`;
- `TYPES-CHEATSHEET.md`.

Запрещенные проверки:

- `pnpm run build`;
- `pnpm --filter @lite-fsm/docs build`;
- `pnpm run docs:build`;
- `pnpm run pages:build*`;
- любой `next build` внутри `apps/docs`.

Для package build использовать только `pnpm run build:packages` или более узкие package commands, если они нужны для gate.

### Область работ

- public types и storage extension typing в `packages/entities/src/machine-extension.ts`;
- manager extension typing и runtime factory в `packages/entities/src/plugin.ts`;
- scoped access runtime wiring в `packages/entities/src/runtime/effects.ts` и `packages/entities/src/runtime/reactions.ts`;
- React integration в `packages/entities/src/react/index.ts`;
- при необходимости локальные type exports в `packages/entities/src/index.ts`;
- примеры и демо-код `packages/entities/examples/**`, `ecs_example/**`, `tests/bench/entities/**`;
- type tests `tests/types/entities-api.tst.ts` и связанные regression type tests;
- runtime tests `tests/entities/entities-plugin.test.ts` и React tests, если они используют scoped `entities`;
- `packages/entities/README.md`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`.

### Вне области работ

- поддержка одновременно `entities.get(...)` и `entities().get(...)` внутри deps callbacks;
- поддержка одновременно `manager.entities.get(...)` и `manager.entities().get(...)`;
- legacy fallback, deprecated overloads, transitional union types и runtime auto-detection старой формы;
- возвращение к `EntityAccess<AppState>`;
- завязка `EntityAccess` на наличие `getState`;
- ручной `AppEntities` registry, который пользователь должен поддерживать рядом с `machines`;
- изменение columnar storage, spawn semantics, despawn lifecycle, snapshot/hydrate форматов и React hook API.

## 3. Целевой public API

### Внутри deps callbacks

`entities` в пользовательских deps является provider-функцией. Если приложение хочет typed read access в callbacks, оно объявляет этот ключ явно:

```ts
import type { EntityAccess } from "@lite-fsm/entities";

type MachineDeps = {
  readonly getState: () => AppState;
  readonly entities: () => EntityAccess<AppMachines>;
  readonly sprites: SpriteAdapter;
  readonly clock: ClockAdapter;
};
```

Использование:

```ts
reactions: {
  TICK: ({ entities, self }) => {
    const enemies = entities().get("enemyActor");
    for (const entity of self.indices) {
      const position = {
        x: enemies.x[entity],
        y: enemies.y[entity],
      };
      void position;
    }
  },
}
```

Если `MachineDeps` не объявляет `entities`, callbacks не получают типизированный `entities`. `@lite-fsm/entities` не добавляет этот ключ в public deps types автоматически.

### Инициализация manager

Store factory не должен требовать `entities` от внешнего пользователя до создания manager. Если приложение разделяет полный `MachineDeps` и внешние runtime deps, оно может исключить `getState` и `entities` из аргумента factory и заполнить их после создания manager:

```ts
type RuntimeDeps = Omit<MachineDeps, "getState" | "entities">;

manager.setDependencies({
  ...deps,
  getState: manager.getState,
  entities: manager.entities,
});
```

### Manager API

`manager.entities` является provider-функцией `() => EntityAccess<AppMachines>`:

```ts
const enemies = manager.entities().get("enemyActor");
```

`manager.entities` должен быть stable function. Повторные вызовы `manager.entities()` должны возвращать тот же root access object для текущего manager.

## 4. Целевая архитектура

### Источник типа entity access

`EntityAccess<AppMachines>` остается типом read-доступа, основанным на machine registry. `EntityAccess<AppState>` не используется как источник для `entities`.

`machine-extension.ts` не должен содержать helper, который извлекает `AppMachines` из `AppDeps.entities`:

```ts
type EntityAccessMachinesFromDeps<AppDeps> = ...
```

Запрещено заменять этот helper другим conditional type, который infer-ит `AppMachines` из `AppDeps`.

### Entity effect deps

`EntityEffectDeps` должен описывать только plugin-owned runtime helpers:

- `self`;
- `transition`.

`entities` не синтезируется внутри `EntityEffectDeps`. Если callback видит `entities`, этот ключ приходит из `AppDeps` как `() => EntityAccess<AppMachines>`.

### Manager extension provider

`entitiesPlugin()` регистрирует manager extension `entities` как provider-функцию:

```ts
manager.entities(): EntityAccess<AppMachines>;
```

Требования:

- `EntityAccessManagerExtension` возвращает `() => EntityAccess<AppMachines>`;
- runtime factory `manager.entities(ctx)` возвращает stable function;
- provider-функция возвращает stable root access object из entity runtime;
- `getEntityRuntimeState(...)` для внутренних tests и React integration получает root access object через `manager.entities()`;
- `manager.entities.get(...)` не поддерживается.

### Entity reaction deps

`EntityReactionDeps` должен сохранять:

- `action`;
- `self`;
- пользовательские deps из `AppDeps`, кроме plugin-owned reserved keys.

`EntityReactionUserDeps<AppDeps>` не должен исключать `entities`. Ключ `entities` приходит из `AppDeps` как есть и остается provider-функцией.

Reserved keys для reactions:

- `action`;
- `condition`;
- `self`;
- `transition`.

`entities` не входит в reserved keys на уровне public types.

### Runtime scoped access

В entity effects и reactions runtime обязан подставлять scoped provider под тот же deps-ключ:

```ts
const scopedEntities = createScopedEntityAccess(runtime, scope);

const deps = {
  ...userDeps,
  action,
  self,
  entities: () => scopedEntities,
  transition,
};
```

Требования:

- `scopedEntities` создается один раз на invocation/reaction deps object, а не заново при каждом `entities()`;
- `entities().get(key)` сохраняет dev validation captured scope через `createScopedEntityAccess`;
- `entities().maybe(key)` сохраняет текущую optional semantics `createScopedEntityAccess`;
- диагностический текст scoped access должен использовать новое написание `entities().get(...)`, если в сообщении упоминается public callback API;
- root `manager.entities()` не подменяет scoped access внутри entity effects/reactions.

## 5. Этапы реализации

### Этап 1 — Public types для deps provider

#### Цель

Разорвать type cycle, удалив восстановление `AppMachines` из `AppDeps.entities`, и сделать `entities` обычным пользовательским deps-ключом с типом provider-функции.

#### Зависит от

Нет.

#### Контракт этапа

- В `packages/entities/src/machine-extension.ts` удалить `EntityAccessMachinesFromDeps`.
- Удалить все использования `EntityAccessMachinesFromDeps<AppDeps>`.
- `EntityEffectDeps` больше не объявляет `entities`.
- `EntityReactionUserDeps<AppDeps>` больше не omits `entities`.
- `EntityReactionDeps` больше не получает generic `AppMachines` и не строит `EntityAccess<AppMachines>`.
- `EntityAccess<AppMachines>` остается неизмененным read API для `get` и `maybe`.
- `EntityMachineExtension` продолжает принимать `AppDeps` через `EntitiesPlugin<AppDeps>`.
- `EntityAccessManagerExtension` в `packages/entities/src/plugin.ts` меняется с `EntityAccess<AppMachines>` на `() => EntityAccess<AppMachines>`.
- `TypedCreateMachineFn<AppEvent, MachineDeps, EntitiesPlugin<MachineDeps>>` должен сохранять типизацию обычных deps.
- `MachineDeps.entities: () => EntityAccess<AppMachines>` не должен вызывать `TS2502`, `TS2456` или implicit `any` при `AppMachines = typeof machines`.
- Если `AppDeps` не содержит `entities`, `entities` не появляется в callback deps автоматически.
- `manager.entities` в public types является callable provider-функцией, а не объектом `EntityAccess`.

#### Не делать в этом этапе

- Не менять runtime wiring; runtime body manager/scoped providers реализуется в этапе 2.
- Не добавлять overloads для старого `entities.get(...)`.
- Не добавлять overloads для старого `manager.entities.get(...)`.
- Не переносить `EntityAccess` на `AppState`.
- Не менять core `createMachine` phantom dependency model без отдельной необходимости и отдельного теста.

#### Тесты этапа

- Обновить `tests/types/entities-api.tst.ts`:
  - `AppDeps.entities` заменить на `() => EntityAccess<AppMachines>`;
  - вызовы внутри callbacks заменить на `entities().get(...)` и `entities().maybe(...)`;
  - сохранить negative checks для non-entity machines и unknown keys.
- Добавить regression type test для unified `MachineDeps`:
  - общий `createMachine`;
  - `MachineDeps` содержит `getState: () => AppState` и `entities: () => EntityAccess<AppMachines>`;
  - `machines`, `AppMachines`, `AppState` выводятся без цикла;
  - `MachineDependencies<AppMachines, Plugins>` содержит provider-функцию.
- Добавить type test, что без `entities` в `AppDeps` callback не получает типизированный `entities`.
- Обновить manager type tests:
  - `manager.entities` assignable to `() => EntityAccess<AppMachines>`;
  - `manager.entities().get("movementActor")` typed;
  - `manager.entities.get(...)` является type error.

#### Критерий завершения

- Focused type tests по `tests/types/entities-api.tst.ts` проходят.
- `pnpm run test:types` проходит или зафиксирован более узкий успешный Tstyche gate, если полный запуск нецелесообразен в текущем цикле.
- В активном коде нет `EntityAccessMachinesFromDeps`.

### Этап 2 — Runtime providers

#### Цель

Перевести root manager access и scoped entity access на единый provider contract `() => EntityAccess<AppMachines>`.

#### Зависит от

Этап 1.

#### Контракт этапа

- В `invokeEntityEffect` заменить runtime deps shape с `entities: createScopedEntityAccess(...)` на `entities: () => scopedEntities`.
- В `createReactionDeps` заменить runtime deps shape с `entities: createScopedEntityAccess(...)` на `entities: () => scopedEntities`.
- `scopedEntities` должен создаваться один раз на объект deps.
- `createScopedEntityAccess` и его error semantics не меняются.
- Текст ошибки `createScopedEntityAccess` должен заменить старое написание `entities.get(...)` на `entities().get(...)`, не меняя код ошибки, условия броска и данные diagnostics.
- В `packages/entities/src/plugin.ts` manager extension `entities` должен возвращать stable provider-функцию.
- Повторные чтения `manager.entities` должны возвращать одну и ту же функцию, так как manager extension прикрепляется один раз.
- Повторные вызовы `manager.entities()` должны возвращать один и тот же root access object.
- React integration должна получать root access через `manager.entities()`.
- Внутренние tests и helpers должны передавать `getEntityRuntimeState(manager.entities())`, если им нужен root entity runtime.
- `entities().get(key)` в scoped effect/reaction сохраняет validation stale scope, missing actor row, source actor, event type и entity id.
- `entities().maybe(key)` сохраняет текущую behavior semantics.
- В runtime deps для reactions можно продолжать удалять или перезаписывать пользовательский root `entities`; итоговый объект обязан содержать scoped provider.
- `manager.entities.get(...)` не поддерживается.

#### Не делать в этом этапе

- Не менять код ошибки, условия броска и диагностические данные `createScopedEntityAccess`, кроме обновления public API spelling с `entities.get(...)` на `entities().get(...)`.
- Не менять lifecycle ordering effects/reactions.
- Не добавлять runtime compatibility layer для `entities.get(...)`.
- Не добавлять runtime compatibility layer для `manager.entities.get(...)`.

#### Тесты этапа

- Обновить runtime tests в `tests/entities/entities-plugin.test.ts`, где entity effect/reaction deps вручную типизируются как `EntityAccess<any>`, на `() => EntityAccess<any>`.
- Обновить вызовы в scoped callbacks на `entities().get(...)` и `entities().maybe(...)`.
- Обновить root manager runtime tests на `manager.entities().get(...)`.
- Обновить React tests на `manager.entities()`.
- Сохранить tests:
  - async effect сохраняет captured scope;
  - stale row diagnostics для `get`;
  - `maybe` возвращает live view без required-access diagnostics;
  - source actor, event type, requested key и entity id в dev error.
- Добавить или обновить runtime assertion, что `entities()` в одном deps object возвращает тот же scoped access object при повторном вызове.
- Добавить или обновить runtime assertion, что `manager.entities()` возвращает stable root access object.

#### Критерий завершения

- Focused Vitest по `tests/entities/entities-plugin.test.ts` проходит.
- Root tests для `manager.entities()` проходят с provider API.
- В runtime scoped callbacks больше нет вызовов `entities.get(...)`.
- В runtime root code больше нет вызовов `manager.entities.get(...)`.

### Этап 3 — Примеры, docs и cheatsheets

#### Цель

Привести public documentation и examples к новому deps API без legacy wording.

#### Зависит от

Этапы 1 и 2.

#### Контракт этапа

- Обновить `ecs_example/store/deps.ts`:
  - `entities: () => EntityAccess<AppMachines>`;
  - `RuntimeDeps = Omit<MachineDeps, "getState" | "entities"> & ...`.
- Обновить `ecs_example/store/index.ts`: `manager.setDependencies` добавляет `entities: manager.entities`.
- Обновить `ecs_example/store/machines/**`: scoped reads используют `entities().get(...)`.
- Обновить `ecs_example/run-example.ts` и `ecs_example/composition-lite-fsm.ts`: внешний root access использует `manager.entities().get(...)`.
- Обновить `packages/entities/examples/**` и `tests/bench/entities/**`, если они используют старые формы `entities.get(...)` или `manager.entities.get(...)`.
- Обновить `packages/entities/README.md`:
  - описать единый provider contract для deps и manager API;
  - описать, что `entities` должен быть объявлен в `AppDeps` явно;
  - описать, что scoped runtime подставляет provider в entity effects/reactions;
  - убрать текст, где `@lite-fsm/entities` автоматически восстанавливает `entities` из deps.
- Обновить `API-CHEATSHEET.md` и `TYPES-CHEATSHEET.md` как справочники текущего API, не changelog.

#### Не делать в этом этапе

- Не описывать старый `entities.get(...)` как поддерживаемый в callbacks.
- Не описывать старый `manager.entities.get(...)` как поддерживаемый manager API.
- Не добавлять migration guide с legacy fallback.
- Не запускать docs build.
- Не менять визуальный или runtime behavior examples, кроме вызова provider-функции.

#### Тесты этапа

- `pnpm exec tsc --noEmit -p ecs_example/tsconfig.json --pretty false`.
- Focused tests для entities examples, если они существуют в текущем test runner.
- `rg "entities\\.get" packages/entities ecs_example tests/bench tests/types tests/entities tests/react`:
  - активных совпадений быть не должно.
- `rg "manager\\.entities\\.get" packages/entities ecs_example tests/bench tests/types tests/entities tests/react`:
  - активных совпадений быть не должно.

#### Критерий завершения

- `ecs_example` компилируется без circular diagnostics.
- Документация не содержит callback examples со старым `entities.get(...)`.
- Cheatsheets отражают единый provider contract `entities().get(...)` и `manager.entities().get(...)`.

### Этап 4 — Рефакторинг, чистка и полировка

#### Цель

Удалить временные остатки и проверить, что у каждого контракта один владелец.

#### Зависит от

Этапы 1-3.

#### Контракт этапа

Must fix:

- мертвые imports, types и helpers после удаления `EntityAccessMachinesFromDeps`;
- stale comments про восстановление `AppMachines` из deps;
- дублирующие type aliases для `entities` provider без второго места использования;
- временные casts или `any`, добавленные только для прохождения промежуточных этапов;
- active source hits старого callback API `entities.get(...)`;
- active source hits старого manager API `manager.entities.get(...)`;
- tests, которые проходят за счет `as never` там, где новый public type должен быть строгим.

Inspect only:

- декоративные переименования без снижения сложности;
- перенос core typing без необходимости для нового контракта;
- изменение runtime allocation model `EntityAccess` beyond provider wrapper;
- изменение public docs вне entities/deps темы.

#### Не делать в этом этапе

- Не расширять API.
- Не менять error messages без тестовой необходимости.
- Не объединять root и scoped access в новый abstraction, если он нужен только в одном месте.
- Не трогать unrelated dirty worktree changes.

#### Тесты этапа

- `pnpm run lint`.
- `pnpm run check-types`.
- `git diff --check`.
- Source audit:
  - `rg "EntityAccessMachinesFromDeps" packages/entities ecs_example tests/types tests/entities tests/react API-CHEATSHEET.md TYPES-CHEATSHEET.md`;
  - `rg "entities\\.get" packages/entities ecs_example tests/bench tests/types tests/entities tests/react`;
  - `rg "manager\\.entities\\.get" packages/entities ecs_example tests/bench tests/types tests/entities tests/react`;
  - `rg "EntityAccess<AppState>" packages/entities ecs_example tests/types`.

Expected remaining hits:

- нет в active scope. Если audit запускается шире и включает `spec/`, допустимы совпадения в этом ТЗ, журнале и исторических спецификациях.

#### Критерий завершения

- Cleanup audit не показывает active stale API в callbacks.
- Lint и type checks проходят.
- Нет временного compatibility code для старого callback API.

### Этап 5 — Финальная проверка release scope

#### Цель

Проверить, что изменение public API и runtime scoped behavior готово к review.

#### Зависит от

Этапы 1-4.

#### Контракт этапа

- Выполнить full readiness checks без запрещенных docs build commands.
- Зафиксировать итоговые команды и результаты в журнале.
- Проверить, что public API изменение отражено в README и cheatsheets.
- Проверить, что `manager.entities` стал provider-функцией и используется как `manager.entities()`.
- Проверить, что cycle regression закрыт на `ecs_example`.

#### Не делать в этом этапе

- Не добавлять новые behavior changes.
- Не чинить unrelated failures без отдельного решения.
- Не запускать запрещенные docs build commands.

#### Тесты этапа

- `pnpm run test:types`.
- `pnpm run check-types`.
- `pnpm run lint`.
- `pnpm run test` или focused runtime suite, если полный запуск невозможен в текущем окружении; невозможность полного запуска должна быть зафиксирована.
- `pnpm run build:packages`, если нужен package build gate.

#### Критерий завершения

- Все обязательные checks пройдены или невозможность полного запуска явно зафиксирована с причиной.
- Нет активных source audit hits старого callback API.
- Журнал реализации обновлен до final readiness.

## 6. Критерий полной готовности

Готовность достигается только после выполнения всех условий:

- `MachineDeps.entities: () => EntityAccess<AppMachines>` компилируется с `AppMachines = typeof machines` и `AppState = MachinesState<AppMachines>`.
- `ecs_example` проходит `tsc --noEmit`.
- Внутри callbacks используется только `entities().get(...)` и `entities().maybe(...)`.
- `manager.entities().get(...)` остается рабочим и типизированным.
- `manager.setDependencies({ entities: manager.entities })` типизируется без wrapper.
- `EntityAccessMachinesFromDeps` отсутствует.
- `EntityAccess<AppState>` не используется как replacement source.
- Scoped runtime diagnostics entity effects/reactions сохранены.
- README, API cheatsheet и types cheatsheet описывают финальный контракт.
- Type tests и runtime tests покрывают новый deps provider contract.
- Запрещенные docs build commands не запускались.
