# lite-fsm — Types Cheat Sheet

Краткий справочник по всему публичному типовому API `lite-fsm`. Построен "от сигнатуры к тестам" — каждая секция ссылается на тестовый файл, который формально закрепляет поведение. Если захочешь переписать типы с нуля — проверочный контур и есть этот набор тестов.

- Тесты против `src/`: `npm run test:types`
- Тесты против `dist/`: `npm run test:types:dist`
- Полный цикл: `npm run test:types:all`

## Соглашения по generic-параметрам

| Параметр | Роль |
|---|---|
| `C` | Карта переходов FSM (тип конфига), `C extends object`, дополнительно `C extends CFG<C, P>` для valid-graph constraint |
| `P` | Событие машины, `P extends AnyEvent` (т.е. `{ type: string; payload?: unknown }`) |
| `T` | Контекст машины, `T extends AnyRecord` (т.е. `Record<string, unknown>`) |
| `D` | Пользовательские зависимости эффекта, `D extends AnyRecord = {}` |
| `N` | Имя состояния (`StateName<C>`) или `WILDCARD` (`"*"`) |
| `S` | Либо произвольный state (в `Reducer`/`Middleware`), либо карта машин в `MachineManager` (`S extends MachineStore`) |
| `R` | Результат селектора в React-хуках |

## Точки входа

| Импорт | Что экспортирует (runtime) | Что экспортирует (types) |
|---|---|---|
| `lite-fsm` | `Machine`, `MachineManager`, `defineMachine`, `createMachine`, `createConfig`, `createReducer`, `createEffect` | Все core-типы и интерфейсы (`CFG`, `MachineConfig`, `MachineReducer`, `MachineEffect`, `DefaultDeps`, `FSMEvent`, `AnyEvent`, `AnyRecord`, `StateType`, `State`, `StateName`, `SType`, `WILDCARD`, `EffectType`, `Reducer`, `Middleware`, `MiddlewareApi`, `GenericMiddleware`, `VoidReducerMiddleware`, `Subscriber`, `TransitionSubscriber`, `IncomingEventTypes`, `ActionForState`, `MachineManagerSnapshot`, `MachineManagerRuntimeSnapshot`, `MachineRuntimeSnapshot`, `MachineSnapshot`, `HydrateStrategy`, `HydrateOptions`, `HydratePreviewOptions`, `DehydrateOptions`, `HydrateMeta`, `HydrateAction`, `ManagerCommitAction`, `UnknownMachineKeyContext`, `IMachine`, `IMachineManager`, `MachineStore`, `MachineEvents`, `MachineDependencies`, `MachinesState`, `TypedCreate*Fn`). `MachineState<C, T>` остаётся как backward-compat alias к `StateType<C, T>`. |
| `lite-fsm/middleware` | `immerMiddleware`, `devToolsMiddleware` (barrel) | — |
| `lite-fsm/middleware/immer` | `immerMiddleware` | — |
| `lite-fsm/middleware/devTools` | `devToolsMiddleware` | — |
| `lite-fsm/react` | `FSMContext`, `FSMContextProvider`, `FSMHydrationBoundary`, `useHydrateSnapshot`, `useManager`, `useSelector`, `useTransition`, `defineMachine` | `FSMContextType`, `FSMHydrationBoundaryProps`, `TypedUseManagerHook`, `TypedUseMachineHook`, `TypedUseSelectorHook`, `TypedUseTransitionHook` |

## Утилитарные типы

Источник: [`tests/types/utility-types.tst.ts`](tests/types/utility-types.tst.ts)

| Тип | Определение | Ключевое поведение |
|---|---|---|
| `SType` | `string \| number \| symbol` | набор ключей объекта |
| `WILDCARD` | `"*"` | буквальная строка, маркер "любое состояние/событие" |
| `State<S>` | `Exclude<S, WILDCARD \| number \| symbol>` | отсекает `"*"`, числа, символы; `State<"*">` → `never` |
| `StateName<C>` | `State<keyof C & SType>` | публичные state-имена машины (без `"*"`/числа/символа) |
| `AnyEvent` | `{ type: string; payload?: unknown }` | безопасный дефолт для event-shape (используется во всех `... = AnyEvent` дефолтах) |
| `AnyRecord` | `Record<string, unknown>` | дефолт `T` / `D` в сигнатурах |
| `StateType<C, T>` | `{ state: StateName<C>; context: T }` | форма состояния одной машины (канонический тип) |
| `MachineState<C, T>` | `= StateType<C, T>` | backward-compat alias — те же поля |
| `EffectType` | `"every" \| "latest"` | режим работы `createEffect` |
| `Reducer<S, P>` | `(state: S, action: P) => S` | `S` свободен, `P` по умолчанию `AnyEvent` |

### `FSMEvent<Name, Payload>`

| Вариант `Payload` | Итоговый тип | Ключ `payload` |
|---|---|---|
| опущен | `{ type: Name }` | отсутствует |
| `never` | `{ type: Name }` | отсутствует (`never` — подтип sentinel) |
| `undefined` | `{ type: Name; payload: undefined }` | **обязателен** |
| `any` | `{ type: Name; payload: any }` | **обязателен** |
| `unknown` | `{ type: Name; payload: unknown }` | **обязателен** |
| `null` | `{ type: Name; payload: null }` | **обязателен** |
| `void` | `{ type: Name; payload: void }` | **обязателен** |
| `X \| undefined` | `{ type: Name; payload: X \| undefined }` | **обязателен** |
| примитив / литерал / объект / tuple | `{ type: Name; payload: Payload }` | **обязателен** |

Distribution и edge-cases:
- `FSMEvent<"A" \| "B">` = `{ type: "A" } \| { type: "B" }` (distributive по `Name`).
- `FSMEvent<"A" \| "B", P>` = `{ type: "A"; payload: P } \| { type: "B"; payload: P }`.
- `FSMEvent<never>` = `never` (zero-distribution).
- `FSMEvent<string>` = `{ type: string }` (голое `string` не распадается, но и не схлопывается).
- `FSMEvent<string, P>` = `{ type: string; payload: P }`.

## `CFG<R, P, K>` — карта переходов

Источник: [`tests/types/cfg-and-config.tst.ts`](tests/types/cfg-and-config.tst.ts) (секция `CFG structural constraints`)

```ts
type CFG<R extends object, P extends AnyEvent, K extends SType = keyof R & SType> = {
  [state in K]?: state extends keyof R
    ? Partial<Record<P["type"], State<K> | null>> & {
        [Event in Exclude<keyof R[state], P["type"]>]: never;
      }
    : Partial<Record<P["type"], State<K> | null>>;
};
```

Внутренние `TransitionMap` и `StrictTransitionMap` остались строительными блоками `CFG`, но не экспортируются.

Правила (по тестам):

| Конструкция | Поведение |
|---|---|
| `{}` | пустой CFG — валиден |
| `{ "*": { RESET: "idle" } }` | wildcard как ключ — валиден |
| `idle: { X: null }` | `null` = self-transition (без смены) — валиден |
| `idle: { X: "idle" }` | явная ссылка на само себя — валиден |
| `{ idle: { X: "running" }, running: {} }` | частичная карта событий — валиден |
| `idle: { UNKNOWN: ... }` | событие вне `P["type"]` — **reject** |
| `idle: { X: "missing" }` | target state отсутствует в карте — **reject** |
| `idle: { X: "*" }` | wildcard как target — **reject** (`State<K>` исключает `"*"`) |
| `idle: { X: 1 }` / `Symbol()` | non-string target — **reject** |

## `MachineConfig<C, T, P, D, Snapshot>`

Источник: `cfg-and-config.tst.ts`, `runtime-api.tst.ts`.

Поля:

| Поле | Обязательное | Тип |
|---|---|---|
| `config` | ✓ | `C` |
| `initialState` | ✓ | `StateName<C>` — не `"*"`, не число, не symbol |
| `initialContext` | ✓ | `T` (строго совпадает с заявленным) |
| `reducer` | — | `MachineReducer<C, P, T>` |
| `hydrate` | — | `(prev: StateType<C, T>, snapshot: Snapshot, meta: HydrateMeta) => StateType<C, T>` |
| `dehydrate` | — | `(state: StateType<C, T>) => Snapshot` |
| `effects` | — | `{ [k in StateName<C> \| WILDCARD]?: MachineEffect<k, C, P, D> }` |

`Snapshot` по умолчанию равен `StateType<C, T>`. Если `dehydrate` возвращает transport shape, отличный от runtime slice, задайте пятый generic или дайте TypeScript вывести форму из литерала машины.

`keyof MachineConfig<...>` = `"config" \| "initialState" \| "initialContext" \| "reducer" \| "hydrate" \| "dehydrate" \| "effects"`.

Невалидно:
- `initialState: "*"` — wildcard не публичное состояние;
- `initialState: "missing"` — ключа нет в `config`;
- `initialContext` с несовместимой формой;
- `effects: { missing: ... }` — ключа нет в `config` и он не `"*"`.

## `MachineReducer<C, P, T>`

Источник: `cfg-and-config.tst.ts` (секция `MachineReducer return contract`).

```ts
(
  state: StateType<C, T>,
  payload: P,
  meta: { nextState: StateName<C>; config: C }
) => StateType<C, T> | void
```

| Возврат | Допустим? |
|---|---|
| `{ state, context }` с валидным `state` | ✓ |
| `void` (мутация, напр. через immer) | ✓ |
| Смесь `void` и object в разных ветках | ✓ |
| `{ state: "missing", ... }` | ✗ |
| `{ state: "*", ... }` | ✗ |
| Объект без `state`/`context` или с лишними полями | ✗ |

## `DefaultDeps<N, C, P>`

Источник: `cfg-and-config.tst.ts` (секция `DefaultDeps structural contract`).

Ровно 3 ключа: `transition`, `action`, `condition`.

| Ключ | Тип |
|---|---|
| `transition` | `(data: P) => P` |
| `condition` | `(predicate: (a: P) => boolean) => Promise<boolean>` |
| `action` | см. таблицу ниже |

Сужение `action` (зависит от `N`):

| `N` | `action` |
|---|---|
| `WILDCARD` (`"*"`) | `P` целиком |
| конкретное состояние, есть входящие события | `Extract<P, { type: <имена этих событий> }>` |
| конкретное состояние, входящих нет | `P` целиком (fallback) |
| Union состояний | события, ведущие в любое из них |

## `MachineEffect<N, C, P, D>`

Источник: `cfg-and-config.tst.ts` (секция `MachineEffect return type`).

```ts
(deps: D & DefaultDeps<N, C, P>) => Promise<void> | void
```

| Форма | Допустима? |
|---|---|
| `() => void` / `async () => {}` | ✓ |
| `D = {}` → в `deps` только `DefaultDeps` | ✓ |
| `D = { api, clock }` → `deps` интерсекция (все 5 ключей) | ✓ |
| `N = "*"` → `deps.action` = весь union `P` | ✓ |

## Производные типы

Источник: [`tests/types/derived-and-interfaces.tst.ts`](tests/types/derived-and-interfaces.tst.ts).

### `MachineEvents<S>`

Внутренне работает в три ступени fallback'а на каждой машине, чтобы не схлопывать generic-параметр `P`:

```ts
// упрощённо: для каждой машины пытаемся вытащить P в порядке
//   1) reducer-инференция, 2) MachineConfig-инференция, 3) AnyEvent
type MachineEvents<S> = {
  [k in keyof S]:
    EventFromReducer<S[k]> extends never
      ? EventFromMachineConfig<S[k]> extends never
        ? AnyEvent
        : EventFromMachineConfig<S[k]>
      : EventFromReducer<S[k]>;
}[keyof S];
```

| Вход | Результат |
|---|---|
| `{}` | `never` |
| `{ x: MachineX }` | `XEvent` |
| `{ x: MachineX; y: MachineY; z: MachineZ }` | `XEvent \| YEvent \| ZEvent` |
| `{ x1: MachineX; x2: MachineX }` | `XEvent` (дубли схлопываются) |
| Машина без `reducer` и без явного `P` | `AnyEvent` (безопасный fallback) |

### `MachineDependencies<S>`

Собирает `D`-параметры всех эффектов через **UnionToIntersection**, удаляя ключи `DefaultDeps`.

| Вход | Результат |
|---|---|
| `{}` | `{}` (пустой стор не накладывает требований) |
| Машина без `effects` | `{}` (не добавляет требований) |
| 1 машина с эффектом, требующим `{ api }` | `{ api: ... }` |
| 2 машины: `{ api }` + `{ logger }` | `{ api: ...; logger: ... }` |
| 2 машины c перекрывающимся ключом `api` | `{ api: ... }` (один ключ) |

### `MachinesState<S>`

```ts
type MachinesState<S> = {
  [k in keyof S]: { state: StateName<S[k]["config"] & object>; context: S[k]["initialContext"] };
};
```

| Вход | Результат |
|---|---|
| `{}` | `{}` |
| `{ only: MachineZ }` | `{ only: { state: "p" \| "q"; context: CtxZ } }` |
| `{ x: MachineX; y: MachineY }` | `{ x: {...}; y: {...} }` |

## Подписчики

Источник: `derived-and-interfaces.tst.ts`.

| Тип | Сигнатура |
|---|---|
| `Subscriber<C, T, P>` | `(prev: StateType<C, T>, curr: StateType<C, T>, action: P) => void` |
| `TransitionSubscriber<S, P>` | `(prev: MachinesState<S>, curr: MachinesState<S>, action: ManagerCommitAction<S, P>) => void` |

## `IMachine<C, T, P, D>`

Источник: `derived-and-interfaces.tst.ts` (секция `IMachine`).

Ровно 3 ключа: `transition`, `invokeEffect`, `config`.

| Ключ | Тип |
|---|---|
| `config` | `C` (литерал сохраняется) |
| `transition` | `(state: StateType<C, T>, action: P) => StateType<C, T>` |
| `invokeEffect` | `(prev: StateName<C>, curr: StateName<C>, deps: D & DefaultDeps<StateName<C> \| WILDCARD, C, P>) => Promise<void>` |

Когда `D = {}`, `deps` состоит только из `DefaultDeps`.

## `IMachineManager<S, P = MachineEvents<S>>`

Источник: `derived-and-interfaces.tst.ts`, `runtime-api.tst.ts`.

Ровно 9 ключей.

| Ключ | Тип |
|---|---|
| `transition` | `(payload: P) => P` |
| `getState` | `() => MachinesState<S>` |
| `getSnapshot` | `() => MachineManagerRuntimeSnapshot<S>` |
| `getHydratedState` | `(snapshot: MachineManagerSnapshot<S>, opts?: HydratePreviewOptions<S>) => MachinesState<S>` |
| `hydrate` | `(snapshot: MachineManagerSnapshot<S>, opts?: HydrateOptions) => void` |
| `dehydrate` | `(opts?: DehydrateOptions<S>) => MachineManagerSnapshot<S>` |
| `onTransition` | `(cb: TransitionSubscriber<S, P>) => () => void` |
| `replaceReducer` | `(cb: (r: Reducer<MachinesState<S>, P>) => Reducer<MachinesState<S>, P>) => void` |
| `setDependencies` | `(d: MachineDependencies<S> \| ((deps: MachineDependencies<S>) => MachineDependencies<S>)) => void` |

Дефолт `P` = `MachineEvents<S>`. `IMachineManager<S>` и `IMachineManager<S, MachineEvents<S>>` — эквивалентны по форме.

## Фабрики (core)

Источник: [`tests/types/factories.tst.ts`](tests/types/factories.tst.ts).

| Функция | Сигнатура | Когда нужна `Typed*Fn`-обёртка |
|---|---|---|
| `createConfig(cfg)` | identity, сохраняет литерал `CFG` | чтобы заранее сузить допустимые события через `TypedCreateConfigFn<P>` |
| `createReducer(reducer)` | identity над `MachineReducer`; без `P` → `action: AnyEvent` | `TypedCreateReducerFn<P>` сужает `action` до `P` |
| `createMachine(cfg)` | identity над `MachineConfig`; выводит `C`, `T` из литерала | `TypedCreateMachineFn<P, D>` фиксирует `P` и `D` |
| `createEffect({ effect, type?, cancelFn? })` | оборачивает `MachineEffect<N, C, P, D>`; `type` = `"every" \| "latest"` | `TypedCreateEffectFn<P, D>` фиксирует `P`/`D` |

Детали по `createEffect`:

| Опция | Тип |
|---|---|
| `effect` | `MachineEffect<N, C, P, D>` (обязательна) |
| `type` | `EffectType` (`"every" \| "latest"`) — необязательна |
| `cancelFn` | `(deps) => () => boolean` — необязательна, сигнатура `deps` совпадает с `Parameters<MachineEffect<...>>[0]` |

Без явных generic'ов у `createMachine` **всё равно** выводит `C` и `T` из формы литерала (не схлопывается в `any`).

## Runtime API

### `Machine<C, T, E, P, D>(cfg)` — чистая фабрика

Источник: [`tests/types/runtime-api.tst.ts`](tests/types/runtime-api.tst.ts) (секция `Machine(cfg) — pure factory`).

Возвращает `IMachine<C, T, P, D>` (ровно 3 ключа: `transition`, `invokeEffect`, `config`). Никакой подписки или внутреннего состояния — только чистые функции.

### `defineMachine<P, D>(opts?).create(cfg)` — core

Источник: `runtime-api.tst.ts` (секция `defineMachine(opts).create(cfg)`).

```ts
defineMachine<P, D>(opts?: { onError?: (err: unknown) => void; dependencies?: D })
  .create(cfg: MachineConfig<C, T, P, D>)
```

Возвращает API с 4 ключами:

| Ключ | Тип |
|---|---|
| `transition` | `(action: P) => P` |
| `getState` | `() => StateType<C, T>` |
| `onTransition` | `(cb: Subscriber<C, T, P>) => () => void` |
| `addMiddleware` | `(...mw: Middleware<StateType<C, T>, P>[]) => void` |

`dependencies` обязательно при непустом `D`; опция `onError` принимает `(err: unknown) => void`.

### `MachineManager<S, P = MachineEvents<S>>(machines, opts?)`

Источник: `runtime-api.tst.ts` (секция `MachineManager`).

Возвращает `IMachineManager<S, P>` (9 ключей).

`opts`:

| Опция | Тип |
|---|---|
| `onError` | `(err: unknown) => void` |
| `middleware` | `Middleware<MachinesState<S>, P>[]` |
| `snapshot` | `MachineManagerSnapshot<S>` |
| `schemaVersion` | `number` |
| `onUnknownMachineKey` | `(key: string, context: "hydrate" \| "opts.snapshot") => void` |
| `onSchemaVersionMismatch` | `(incoming: number \| undefined, current: number \| undefined) => void` |

- `MachineManager({})` → `IMachineManager<{}, never>`.
- Без явного `P` — вычисляется `MachineEvents<S>`.
- `transition` принимает только события из `P`.
- `onTransition` получает `ManagerCommitAction<S, P>`: user action или system action `@@lite-fsm/HYDRATE`.
- `setDependencies` требует `MachineDependencies<S>` или updater.

### Snapshot-типы

| Тип | Роль |
|---|---|
| `MachineManagerSnapshot<S>` | dehydrated/transport envelope `{ schemaVersion?, machines }`; per-machine shape берётся из `dehydrate`, затем `hydrate`, иначе runtime slice |
| `MachineManagerRuntimeSnapshot<S>` | runtime envelope для `getSnapshot()`; каждая машина всегда `StateType<C, T>` |
| `MachineSnapshot<M>` / `SnapshotForMachine<M>` | inferred serialized shape одной машины |
| `MachineRuntimeSnapshot<C, T>` | alias к `StateType<C, T>` для runtime slice |
| `HydrateStrategy` | `"replace" \| "merge"` |
| `HydratePreviewOptions<S>` | `{ strategy?: HydrateStrategy; baseState?: MachinesState<S> }` для pure `getHydratedState` preview |
| `HydrateAction<S>` | system action `@@lite-fsm/HYDRATE`, видимый в subscriber/inspection path |

## Middleware

Источник: [`tests/types/middleware.tst.ts`](tests/types/middleware.tst.ts).

### `Middleware<S = unknown, P extends AnyEvent = AnyEvent>`

```ts
(api: MiddlewareApi<S, P>) => (next: (action: P) => P) => (action: P) => P
```

По умолчанию: `S = unknown`, `P = AnyEvent` (т.е. `{ type: string; payload?: unknown }`). Никаких `any` в дефолтах.

`GenericMiddleware` — отдельная public-форма для middleware, которое работает с произвольными `S/P` (используется как возвращаемый тип `devToolsMiddleware()`):

```ts
type GenericMiddleware = <S, P extends AnyEvent>(
  api: MiddlewareApi<S, P>,
) => (next: (action: P) => P) => (action: P) => P;
```

`VoidReducerMiddleware = GenericMiddleware & { __liteFsmAllowVoidReducer: true }` — форма для middleware, разрешающего `void`-возврат из reducer'а (например, `immerMiddleware`).

### `MiddlewareApi<S, P>` — ровно 5 ключей

| Ключ | Тип |
|---|---|
| `getState` | `() => S` |
| `transition` | `(action: P) => P` |
| `replaceReducer` | `(cb: (r: Reducer<S, P>) => Reducer<S, P>) => void` |
| `onTransition` | `(cb: (prev: S, curr: S, action: P) => void) => () => void` |
| `condition` | `(predicate: (a: P) => boolean) => Promise<boolean>` |

### `immerMiddleware`

- Совместим с `Middleware<S, P>` для любой пары `S/P`.
- Несёт маркер `__liteFsmAllowVoidReducer: true` — включает поддержку `void`-возврата в reducer'е.

### `devToolsMiddleware(options?)`

- Без аргументов возвращает `Middleware`.
- `options.blacklistActions: string[]` — допустимо. Не-string массив — ошибка типа.
- Неизвестные опции — ошибка типа.
- Маркер `__liteFsmAllowVoidReducer` отсутствует.

## React API

Источник: [`tests/types/react-api.tst.tsx`](tests/types/react-api.tst.tsx).

### `FSMContext` / `FSMContextType<S, P>`

```ts
FSMContext: React.Context<unknown>
type FSMContextType<
  S extends MachineStore = MachineStore,
  P extends AnyEvent = AnyEvent,
> = IMachineManager<S, P>
```

`FSMContextType` без аргументов = `IMachineManager<MachineStore, AnyEvent>`. Внутри значение контекста хранится как `unknown` и сужается до `FSMContextType<S, P>` через `useManager` (или ваш собственный hook).

### `<FSMContextProvider<S, P> machineManager={...}>`

```ts
props: React.PropsWithChildren<{ machineManager: IMachineManager<S, P> }>
```

`children` опционален (как любой `PropsWithChildren`). Невалидный `machineManager` — ошибка типа.

### Хуки

| Хук | Сигнатура | Без generic'ов |
|---|---|---|
| `useHydrateSnapshot<S>(snapshot, opts?)` | `(snapshot: MachineManagerSnapshot<S>, opts?: HydrateOptions) => void` | требует явный `S`, если snapshot не выводится из аргумента |
| `useManager<S, P>()` | `() => IMachineManager<S, P>` | `IMachineManager<MachineStore, AnyEvent>` |
| `useSelector<S, R>(selector, equalityFn?)` | `(selector: (state: MachinesState<S>) => R, equalityFn?: (a: R, b: R) => boolean) => R` | требует явных `<S, R>` |
| `useTransition<P>()` | `() => (payload: P) => P` | `(payload: AnyEvent) => AnyEvent` |

### `<FSMHydrationBoundary<S> snapshot={...}>`

```tsx
<FSMHydrationBoundary<Store> snapshot={snapshot} strategy="merge">
  <Consumer />
</FSMHydrationBoundary>
```

`snapshot` типизируется как `MachineManagerSnapshot<S>`, `strategy` — `"merge"` или `"replace"`. Boundary прозрачен для `children`: во время render `useSelector` читает staged overlay state, а настоящий manager коммитится в layout effect. `useManager`, `useTransition`, effects и middleware overlay не видят.

Snapshot-объекты в React hydration API ожидаются immutable: при изменении содержимого передавайте новый object reference. Повторная ссылка с той же `strategy` может быть пропущена helper'ами; идемпотентность одинакового содержимого обеспечивается machine `hydrate` hook'ами через `return prev`.

`Typed*Hook`-обёртки для фиксации типов на уровне проекта:

| Alias | Что фиксирует |
|---|---|
| `TypedUseManagerHook<S, P>` | хук, возвращающий `IMachineManager<S, P>` |
| `TypedUseMachineHook<S, P>` | backward-compatible alias к `TypedUseManagerHook<S, P>` |
| `TypedUseSelectorHook<S>` | фиксирует карту машин (`S extends MachineStore`), селектор получает `MachinesState<S>`, `R` остаётся обобщённым |
| `TypedUseTransitionHook<P>` | фиксирует payload-тип |

Рекомендуемый DX для приложения — типизировать локальные hooks прямым присваиванием, без wrapper-функций и `as`:

```ts
import type { TypedUseManagerHook, TypedUseSelectorHook, TypedUseTransitionHook } from "lite-fsm/react";
import { useManager as baseUseManager, useSelector as baseUseSelector, useTransition as baseUseTransition } from "lite-fsm/react";

import type { FSMConfigType } from "./store";
import type { AppEvents } from "./types";

export const useTransition: TypedUseTransitionHook<AppEvents> = baseUseTransition;
export const useSelector: TypedUseSelectorHook<FSMConfigType> = baseUseSelector;
export const useManager: TypedUseManagerHook<FSMConfigType, AppEvents> = baseUseManager;
```

Важно: `TypedUseSelectorHook<S>` принимает **тип карты машин**, а не уже вычисленный `MachinesState<S>` / `AppState`. Это симметрично обычному `useSelector<S, R>()`, где `S` — `MachineStore`, а `state` внутри селектора уже выводится как `MachinesState<S>`.

### `defineMachine<P, D>(opts?).create(cfg)` — react

Возвращает **функцию-хук** с прикреплённым API машины.

- Вызов хука: `use(selector, equalityFn?)` — селектор получает `StateType<C, T>`, возвращает `R`.
- Хук также содержит `transition`, `getState`, `onTransition`, `addMiddleware` (как в core-версии `defineMachine`).
- `equalityFn` типизирован относительно `R`; передача `(a: string)` при `R = number` — ошибка типа.
- `dependencies` должен соответствовать `D` (ошибка типа при несовпадении).

## Правила вывода типов и подводные камни

Закреплено в `derived-and-interfaces.tst.ts` и `runtime-api.tst.ts`; возникло из реального прогона тестов.

1. **Всегда описывай машину через `satisfies MachineConfig<C, T, P, D>`**.
   Без этого TS часто теряет generic-параметры на производных типах (`MachineEvents`, `MachineDependencies`, `MachinesState`) и схлопывает их до `any`/`unknown`. Минимальный рабочий шаблон:

   ```ts
   const reducer: MachineReducer<Cfg, Evt, Ctx> = (s, _a, meta) => ({ state: meta.nextState, context: s.context });
   const machine = {
     config: { idle: { GO: "done" }, done: {} } as Cfg,
     initialState: "idle" as const,
     initialContext: { n: 0 } as Ctx,
     reducer,
   } satisfies MachineConfig<Cfg, Ctx, Evt>;
   ```

2. **`initialState` → `as const`**, иначе расширяется до `string` и `State<keyof C>` перестаёт работать.
3. **`initialContext` → `as Ctx`** (или типизированный const), иначе поля расширяются до базовых типов и ломается вывод в `MachinesState`.
4. **Payload в `FSMEvent`** — везде обязателен, кроме случая, когда payload вообще опущен или передан как `never`. `any`, `unknown`, `null`, `void`, `X | undefined` — ключ `payload` обязателен в литерале.
5. **`MachineDependencies<S>`** — это **интерсекция** по всем эффектам. Машина без эффектов не ослабляет требований (возвращает `{}`). Пустая карта машин (`MachineDependencies<{}>`) тоже даёт `{}`, а не `unknown`.
6. **`MachineManager({})`** типизируется как `IMachineManager<{}, never>` — `transition` становится принципиально непригодным к вызову (что логично: событий нет).
7. **`Middleware`** по умолчанию использует `S = unknown` и `P = AnyEvent` (`{ type: string; payload?: unknown }`). Никаких silent-`any` в дефолтах — это важно при передаче в `immerMiddleware` / `devToolsMiddleware` без явных generic'ов.
8. **`immerMiddleware`** распознаётся в runtime через маркер `__liteFsmAllowVoidReducer`. При написании собственного middleware, разрешающего `void`-возврат из reducer'а, нужно выставить такой же маркер.
9. **`WILDCARD = "*"`** — литерал, не просто `string`. `State<"*">` = `never`, поэтому wildcard никогда не пройдёт как валидный target/initialState.
10. **Typed*Fn-обёртки не меняют runtime** — это только identity-функции с жёсткими типами. Их назначение — закрепить `P`/`D` на уровне проекта, чтобы все `create*` возвращали узкий тип.
