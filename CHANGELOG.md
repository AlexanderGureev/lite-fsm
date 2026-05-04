# Changelog

История релизов `lite-fsm`. Этот файл является единственным источником для страницы документации `/releases`.

## 2.0.0

Крупный релиз с flat actors: actor templates остаются обычными машинами, а `MachineManager` умеет запускать их как плоские runtime actors с маршрутизацией, lifecycle-состояниями и совместимостью с middleware.

### Flat actors

- BREAKING: имена состояний `__INIT`, `__RESOLVED`, `__REJECTED`, `__CANCELLED` зарезервированы для actor templates и terminal lifecycle.
- BREAKING: события `MachineManager` используют `ManagerAction<P>` с опциональным routing `meta`.
- Машина с `__INIT` в `config` теперь считается actor template и может создавать плоские runtime actors внутри `MachineManager`.
- Добавлена маршрутизация через `meta.actorId`, `meta.groupId`, `meta.groupTag`, actor effect `self` и transition sugar для actor events.
- BREAKING: runtime actor slice теперь имеет форму `{ state, context, meta }`; persisted actor template snapshots без `slice.meta` больше не подходят для `replaceReducer`/DevTools JUMP/future hydration restore.
- Добавлен `createActorMeta()` для ручной сборки readonly actor identity в replacement/hydration input.
- Actor targets `__RESOLVED`, `__REJECTED`, `__CANCELLED` схлопываются в terminal lifecycle.
- `createEffect`, `condition()`, Immer reducer support и DevTools time-travel стали actor-aware через public `slice.meta`.
- Удалены internal DevTools restore exports/transport: `actorDevtools.ts`, `DEVTOOLS_API`, `ACTOR_RESTORE`, `__liteFsmActor`.
- Actor templates остаются runtime-only для hydration: `dehydrate()` пропускает templates, явный actor dehydrate бросает ошибку, а hydrate snapshots с actor keys в DEV пропускаются с warning.
- Domain-only machines сохраняют прежнюю форму `{ state, context }` и runtime-поведение.

Migration для persisted actor records: пересоздать snapshot после обновления или добавить `meta` вручную через `createActorMeta({ actorId: recordKey, groupId, groupTag })`.

### Spawn id customization

- Добавлены опции `MachineManagerOptions.originId`, `generateActorId`, `generateGroupId` для P2P, multi-tab, server↔client и шард-сценариев распределенного спавна.
- `originId` (строка без `#`) добавляется ко всем созданным менеджером id в формате `${originId}#${templateKey}/${counter}`; чужие id (с другим owner-префиксом или без него) при `hydrate` не двигают локальные счетчики.
- `generateActorId` и `generateGroupId` принимают `SpawnIdContext<P>` (`{ templateKey, groupTag, counter, originId, action }`) и возвращают доменный id, например `${originId}#player/${userId}`. Counter инкрементируется всегда; collision-check блокирует duplicate id через новый код `LITE_FSM_INVALID_GENERATED_ID`.
- Невалидный `originId` (пустой или содержащий `#`) бросает `LITE_FSM_INVALID_OPTIONS`.
- Изменение обратно совместимое: менеджер без новых опций продолжает выдавать `templateKey/0` и принимать любые opaque external id в `hydrate`.

## 1.2.0

В этой версии добавлен snapshot/SSR hydration API, а типовая система стала строже и проще для сопровождения.

### Snapshot / SSR hydration

- `MachineManager` получил `getSnapshot()`, `getHydratedState()`, `hydrate()` и `dehydrate()` с envelope-формой `{ schemaVersion, machines }`.
- Машины могут задавать `hydrate` и `dehydrate` hooks для custom transport shape, merge/replace политики и content-noop идемпотентности.
- `hydrate` не проходит через middleware и не запускает effects; подписчики видят system action `@@lite-fsm/HYDRATE`.
- React entrypoint получил `useHydrateSnapshot` и `FSMHydrationBoundary`: boundary даёт `useSelector` временный snapshot уже на первом render, а затем до первого paint переносит snapshot в настоящий manager.
- Playground содержит новый `/ssr-demo-3` как reference для manifest-first SSR на snapshot API.

Сервер может собрать transport snapshot:

```ts
const snapshot = manager.dehydrate({ machines: ["profileSession"] });
```

Клиент может восстановить его напрямую:

```ts
manager.hydrate(snapshot);
```

Для React SSR/RSC удобнее обернуть subtree:

```tsx
<FSMHydrationBoundary snapshot={snapshot}>
  <Profile />
</FSMHydrationBoundary>
```

Boundary можно вкладывать под `Suspense`: дочерний snapshot считается поверх родительского preview, поэтому widget видит и grid seed, и свой seed на первом render.

```tsx
<FSMHydrationBoundary snapshot={gridSnapshot}>
  {items.map((item) => (
    <Suspense key={item.id} fallback={<WidgetSkeleton />}>
      <FSMHydrationBoundary snapshot={createWidgetSnapshot(item)}>
        <Widget item={item} />
      </FSMHydrationBoundary>
    </Suspense>
  ))}
</FSMHydrationBoundary>
```

Машина сама решает, как мержить и когда не будить подписчиков:

```ts
hydrate: (prev, snapshot) => {
  if (prev.context.version === snapshot.version) return prev;
  return { ...prev, context: { ...prev.context, ...snapshot } };
};
```

### Типы и DX

- `FSMEvent` теперь корректно различает события с payload и без payload, нормально распределяется по union имён событий и схлопывается в `never` для `FSMEvent<never>`.
- Типы effects стали точнее: orphan state больше не получает весь union событий, если в состояние нет входящих переходов.
- Пустые зависимости менеджера выводятся как `{}`, а не `unknown`.
- React hooks больше не проваливаются в silent `any`: базовые `useManager` и `useTransition` получают безопасные defaults.
- Defaults для middleware стали безопаснее: `Middleware` использует `unknown` и `AnyEvent`, а reusable middleware можно описывать через `GenericMiddleware`.
- Внутренняя типовая модель упрощена вокруг `StateType`, `StateName`, `IncomingEventTypes` и связанных helper-типов; часть внутренних строительных типов убрана из публичного экспорта.

### Примеры изменений

`FSMEvent<"SAVE", any>` больше не делает `payload` опциональным:

```ts
// До
type E = FSMEvent<"SAVE", any>;
// { type: "SAVE"; payload?: any }

// После
type E = FSMEvent<"SAVE", any>;
// { type: "SAVE"; payload: any }
```

Union имён событий теперь становится discriminated union:

```ts
// До
type E = FSMEvent<"START" | "STOP">;
// { type: "START" | "STOP" }

// После
type E = FSMEvent<"START" | "STOP">;
// { type: "START" } | { type: "STOP" }
```

`FSMEvent<never>` больше не создаёт бесполезный объект:

```ts
// До
type E = FSMEvent<never>;
// { type: never }

// После
type E = FSMEvent<never>;
// never
```

Orphan state больше не получает весь union событий:

```ts
// До
type Action = DefaultDeps<"orphan", Config, Event>["action"];
// Event

// После
type Action = DefaultDeps<"orphan", Config, Event>["action"];
// never
```

Пустые зависимости менеджера стали понятнее:

```ts
// До
type Deps = MachineDependencies<{}>;
// unknown

// После
type Deps = MachineDependencies<{}>;
// {}
```

React hooks и middleware больше не проваливаются в silent `any`:

```ts
// До
useManager();
// IMachineManager<any, any>

useTransition();
// (payload: any) => any

type M = Middleware;
// Middleware<any, { type: any; payload?: any }>

// После
useManager();
// IMachineManager<MachineStore, AnyEvent>

useTransition();
// (payload: AnyEvent) => AnyEvent

type M = Middleware;
// Middleware<unknown, AnyEvent>
```

Для строгого app-level API типы по-прежнему можно фиксировать явно:

```ts
const manager = useManager<AppMachines, AppEvent>();
const transition = useTransition<AppEvent>();
```

Reusable middleware теперь описывается отдельно:

```ts
type M = GenericMiddleware;
```

## 1.1.0-beta.2 - 25 сентября 2025

- Второй beta-релиз ветки `1.1.0`.

## 1.1.0-beta.1 - 5 мая 2025

- Первый beta-релиз ветки `1.1.0`.

## 1.0.0 - 27 января 2025

- Первый стабильный релиз `lite-fsm`.

## 0.0.6 - 23 ноября 2023

- Поддерживающий релиз ранней ветки `0.0.x`.

## 0.0.5 - 10 октября 2023

- Поддерживающий релиз ранней ветки `0.0.x`.

## 0.0.4 - 23 июня 2023

- Поддерживающий релиз ранней ветки `0.0.x`.

## 0.0.3 - 23 июня 2023

- Поддерживающий релиз ранней ветки `0.0.x`.

## 0.0.2 - 23 июня 2023

- Поддерживающий релиз ранней ветки `0.0.x`.

## 0.0.1 - 21 июня 2023

- Первый npm-релиз `lite-fsm`.

## До 0.0.1 - 2022

- В 2022 году идея библиотеки проходила проверку в production: подход тестировался поверх Redux Toolkit в видеоплеере для телеканалов с высокой нагрузкой.
