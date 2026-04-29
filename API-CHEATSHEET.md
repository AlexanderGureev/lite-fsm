# lite-fsm — API Cheat Sheet

Сжатый справочник по runtime API. Типы — в [`TYPES-CHEATSHEET.md`](TYPES-CHEATSHEET.md).

## Точки входа

| Импорт                                                       | Runtime exports                                                                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lite-fsm`                                                   | `createMachine`, `createConfig`, `createReducer`, `createEffect`, `createActorMeta`, `Machine`, `defineMachine`, `MachineManager`, `LiteFsmError` |
| `lite-fsm/middleware`                                        | `immerMiddleware`, `devToolsMiddleware`                                                                                                           |
| `lite-fsm/middleware/immer` · `lite-fsm/middleware/devTools` | per-feature entry points                                                                                                                          |
| `lite-fsm/react`                                             | `FSMContext`, `FSMContextProvider`, `FSMHydrationBoundary`, `useHydrateSnapshot`, `useManager`, `useSelector`, `useTransition`, `defineMachine`   |

`lite-fsm/react` помечен `"use client"`. Импортировать можно из SSR/RSC, hooks/provider — только в client tree.

## Mental model

| Термин         | Форма                                                              |
| -------------- | ------------------------------------------------------------------ |
| Event / action | `{ type: string; payload?: unknown; meta?: FSMEventMeta }`         |
| Domain slice   | `{ state, context }`                                               |
| Actor slice    | `{ state, context, meta: { actorId, groupId, groupTag } }`         |
| Manager state  | `{ [machineKey]: domainSlice \| Record<actorId, actorSlice> }`     |
| Snapshot       | `{ schemaVersion?: number; machines: { [machineKey]: snapshot } }` |

Pipeline события: `middleware (pre next) → reducer graph → subscribers → middleware (post next) → effects`. Middleware "оборачивает" reducer + subscribers; effects идут уже после возврата всей middleware-цепочки. `transition(action)` возвращает action, дошедший до reducer-а.

## Фазы обработки события (transition)

Что происходит внутри `manager.transition(action)`.

| #   | Фаза                    | Что происходит                                                                             |
| --- | ----------------------- | ------------------------------------------------------------------------------------------ |
| 0   | pre-normalize           | sender / default routing; late-dispatch отбрасывается                                      |
| 1   | middleware (pre next)   | каждое middleware до `next(action)` в порядке регистрации                                  |
| 2   | post-normalize          | committed action фиксируется в `ctx.committed`                                             |
| 3–7 | root reducer            | routing → domain reducers → spawn actors → reduce routed actors → collapse terminal actors |
| 9   | commit                  | `state` + sidecar обновляются атомарно                                                     |
| 10  | resolve effects targets | список domain + delivered/spawned actors для фазы 12                                       |
| 11  | subscribers             | `onTransition` (sync)                                                                      |
| —   | middleware (post next)  | каждое middleware после `next(action)` в обратном порядке                                  |
| 12  | effects                 | domain effects на каждом dispatch + actor effects для delivered/spawned                    |

Фазы 2–11 проходят внутри middleware-чейна (через `next` → `_transition`). Effects (12) — после возврата всей цепочки. Standalone-машина из `Machine.ts` использует подмножество: middleware → reducer → subscribers → middleware (post) → effects, без actor-фаз 5–7, 10, 12.

## Описание машины

```ts
const counter = createMachine({
  config: {
    idle: { INC: "idle", RESET: null },
    "*": { BOOT: "idle" },
  },
  initialState: "idle",
  initialContext: { count: 0 },
  reducer: (slice, action, { nextState }) => ({
    state: nextState,
    context: { count: action.type === "RESET" ? 0 : slice.context.count + 1 },
  }),
  effects: {
    idle: ({ action }) => console.log(action.type),
    "*": ({ action }) => console.log("any", action.type),
  },
});
```

| Поле                              | Назначение                                                                |
| --------------------------------- | ------------------------------------------------------------------------- |
| `config`                          | граф `{ [state]: { [eventType]: target } }`; `"*"` — fallback transitions |
| `initialState` · `initialContext` | стартовое `state` / `context`                                             |
| `reducer?`                        | собирает следующее `{ state, context }`                                   |
| `effects?`                        | sync/async side-effects по target state или `"*"`                         |
| `hydrate?` · `dehydrate?`         | кастомная форма snapshot; дефолт — `{ state, context }`                   |
| `groupTag?`                       | actor template only — tag группы                                          |
| `persistence?`                    | actor template only — `"runtime"` (default) или `"snapshot"`              |

### Targets

| Target                                            | Поведение                                                             |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| `"next"`                                          | переход в `"next"`                                                    |
| `null`                                            | self-transition (state не меняется, action дойдёт до reducer/effects) |
| `undefined` / нет ключа                           | action игнорируется                                                   |
| `"__RESOLVED"` · `"__REJECTED"` · `"__CANCELLED"` | actor terminal — actor удаляется                                      |

Явный `config[state][type]` важнее `"*"`. У actor template `__INIT` не наследует `"*"`: spawn только через явный `__INIT` transition.

## Reducer

```ts
reducer: (slice, action, { nextState, config }) => ({
  state: nextState,
  context: { ...slice.context, ...action.payload },
});
```

Без `reducer` runtime делает default merge: `{ state: target ?? current, context: { ...context, ...action.payload } }`.

`undefined` из reducer-а бросает `VOID_REDUCER_ERROR`, кроме случая, когда подключён `immerMiddleware` или middleware с маркером `__liteFsmAllowVoidReducer`.

## Effects

```ts
effects: {
  saving: async ({ action, transition, condition, api }) => {
    await api.save(action.payload);
    await condition((e) => e.type === "ACK");
    transition({ type: "DONE" });
  },
  "*": ({ action }) => console.log(action.type),
}
```

Effect получает один объект:

| Ключ                   | Что даёт                                                                |
| ---------------------- | ----------------------------------------------------------------------- |
| `action`               | action, прошедший middleware                                            |
| `transition(action)`   | dispatch нового события                                                 |
| `condition(predicate)` | promise, резолвится на ближайший matching action                        |
| `self`                 | (actor only) `{ actorId, groupId, groupTag }`                           |
| user deps              | из `defineMachine({ dependencies })` или `manager.setDependencies(...)` |

State effect приоритетнее `"*"`. Wildcard срабатывает и на self-transition. Ошибки и reject из `condition` уходят в `onError`.

## Factories

Все фабрики — typed identity helpers. Runtime ничего не создают, только сужают типы.

| Factory                                      | Назначение                                       |
| -------------------------------------------- | ------------------------------------------------ |
| `createMachine(cfg)`                         | полный machine config                            |
| `createConfig(cfg)`                          | только граф переходов                            |
| `createReducer(fn)`                          | reducer с фиксированным action union             |
| `createActorMeta(meta)`                      | frozen `Readonly<ActorMeta>` для replacement/time-travel input |
| `createEffect({ effect, type?, cancelFn? })` | оборачивает effect политикой запуска             |

### `createEffect`

```ts
const load = createEffect({
  type: "latest",
  cancelFn:
    ({ signal }) =>
    () =>
      signal.aborted,
  effect: async ({ transition }) => transition({ type: "DONE" }),
});
```

| Опция                     | Поведение                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------ |
| `type: "every"` (default) | каждый запуск может dispatch-ить                                                     |
| `type: "latest"`          | старый запуск продолжает работать, его `transition` подавляется после нового запуска |
| `cancelFn(deps)`          | возвращает `cancel(): boolean` — `true` подавляет любой `transition`                 |

В actor effect guard покрывает и `transition.unscoped/actor/group/tag`.

## `Machine(cfg)` — pure machine

Низкоуровневая фабрика без state, middleware, подписок.

```ts
const machine = Machine(counter);
const next = machine.transition({ state: "idle", context: { count: 0 } }, { type: "INC" });
await machine.invokeEffect("idle", next.state, deps);
```

| Метод                               | Что делает                      |
| ----------------------------------- | ------------------------------- |
| `config`                            | ссылка на `cfg.config`          |
| `transition(slice, action)`         | следующее `{ state, context }`  |
| `invokeEffect(prev, current, deps)` | вызывает state effect или `"*"` |

Actor templates standalone не работают — только в `MachineManager`.

## `defineMachine(opts?).create(cfg)` — standalone stateful

```ts
const machine = defineMachine<AppEvent, Deps>({ dependencies, onError }).create(counter);

machine.transition({ type: "INC" });
machine.getState();
const off = machine.onTransition((prev, next, action) => {});
machine.addMiddleware(immerMiddleware);
```

| Метод                  | Что делает                                                         |
| ---------------------- | ------------------------------------------------------------------ |
| `getState()`           | текущее `{ state, context }`                                       |
| `transition(action)`   | middleware → reducer → subscribers → effects                       |
| `onTransition(cb)`     | подписка `(prev, current, action) => void`; возвращает unsubscribe |
| `addMiddleware(...mw)` | добавляет middleware в конец цепочки                               |

`defineMachine` фиксирует `P`, `D`, `opts` один раз; каждый `.create(cfg)` возвращает независимую машину.

## `MachineManager(machines, opts?)`

```ts
const manager = MachineManager(
  { counter, todos, syncActor },
  {
    middleware: [immerMiddleware, devToolsMiddleware()],
    schemaVersion: 1,
    snapshot: initialSnapshot,
    onError: console.error,
  },
);

manager.setDependencies({ api });
manager.transition({ type: "INC" });
```

| Опция                      | Назначение                                              |
| -------------------------- | ------------------------------------------------------- |
| `middleware?`              | цепочка middleware на все user actions                  |
| `snapshot?`                | начальный snapshot, применяется со strategy `"replace"` |
| `schemaVersion?`           | версия snapshot                                         |
| `onError?`                 | ошибки effects / `condition`                            |
| `onUnknownMachineKey?`     | unknown key в `hydrate` или initial snapshot            |
| `onSchemaVersionMismatch?` | mismatch `snapshot.schemaVersion`                       |

| Метод                               | Назначение                                                     |
| ----------------------------------- | -------------------------------------------------------------- |
| `getState()`                        | текущий manager state                                          |
| `transition(action)`                | dispatch user action; возвращает фактически применённый action |
| `onTransition(cb)`                  | `(prev, current, action) => void`                              |
| `setDependencies(deps \| updater)`  | задаёт user deps для effects                                   |
| `replaceReducer(enhancer)`          | подменяет root reducer (вызывается из middleware)              |
| `getSnapshot()`                     | runtime snapshot `{ schemaVersion, machines }` без hooks       |
| `dehydrate(opts?)`                  | snapshot с `dehydrate` hooks                                   |
| `hydrate(snapshot, opts?)`          | применяет snapshot без middleware/effects                      |
| `getHydratedState(snapshot, opts?)` | preview `hydrate` без мутации manager-а                        |

Action идёт во все domain machines; машина без подходящего transition остаётся без изменений (селекторы не дёргаются). Префикс `@@lite-fsm/*` зарезервирован — отправлять через `transition` нельзя.

## Hydration

```ts
const snapshot = manager.dehydrate({ machines: ["counter"] });
manager.hydrate(snapshot, { strategy: "merge" });

const preview = manager.getHydratedState(snapshot, {
  strategy: "replace",
  baseState: manager.getState(),
});
```

`dehydrate()` типизирует все snapshot-eligible machines как обязательные. `dehydrate({ machines: ["counter"] })` делает обязательными только выбранные literal keys; dynamic array остаётся partial envelope для безопасности.

| API                  | Hooks       | Mutates | Subscribers          | Effects |
| -------------------- | ----------- | ------- | -------------------- | ------- |
| `getSnapshot()`      | —           | —       | —                    | —       |
| `dehydrate()`        | `dehydrate` | —       | —                    | —       |
| `getHydratedState()` | `hydrate`   | —       | —                    | —       |
| `hydrate()`          | `hydrate`   | да      | `@@lite-fsm/HYDRATE` | —       |

| Strategy    | Поведение                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| `"merge"`   | применяет только keys из snapshot                                                                                        |
| `"replace"` | для actor templates сбрасывает actors, отсутствующих в snapshot; для domain machines форму replace решает `hydrate` hook |

Domain hooks:

```ts
const profile = createMachine({
  config: { ready: {} },
  initialState: "ready",
  initialContext: { user: null },
  dehydrate: (slice) => slice.context.user,
  hydrate: (prev, user) => (prev.context.user === user ? prev : { state: prev.state, context: { user } }),
});
```

Unknown machine keys пропускаются: в DEV — warning + `onUnknownMachineKey`. `schemaVersion` миграцию не делает, только триггерит `onSchemaVersionMismatch`. Snapshot объекты считайте immutable; hooks делайте идемпотентными и возвращайте `prev`, если данные те же.

## Actor templates

Машина становится actor template, если в `config` есть literal `__INIT`.

```ts
const request = createMachine({
  groupTag: "request",
  config: {
    __INIT: { START: "pending" },
    pending: { RESOLVE: "__RESOLVED", FAIL: "__REJECTED" },
  },
  initialState: "__INIT",
  initialContext: { id: "" },
});
```

| Правило          | Значение                                                  |
| ---------------- | --------------------------------------------------------- |
| `initialState`   | всегда `"__INIT"`                                         |
| spawn            | action должен match-ить `__INIT` transition               |
| public record    | `state.requests[actorId] = { state, context, meta }`      |
| terminal targets | `__RESOLVED` · `__REJECTED` · `__CANCELLED` удаляют actor |
| domain machines  | получают action независимо от actor routing               |
| standalone       | actor templates работают только в `MachineManager`        |

### Routing

```ts
manager.transition({ type: "RESOLVE", meta: { actorId: "request/0" } });
manager.transition({ type: "FAIL", meta: { groupId: "request/0" } });
manager.transition({ type: "CANCEL", meta: { groupTag: "request" } });
```

Приоритет: `actorId > groupId > groupTag > unscoped`. Все три принимают `string | string[]`.

Actor effect получает `self` и actor-aware dispatch:

```ts
effects: {
  pending: ({ self, transition }) => {
    transition.actor(self.actorId, { type: "RESOLVE" });
    transition.group(self.groupId, { type: "PING" });
    transition.tag(self.groupTag,   { type: "BROADCAST" });
    transition.unscoped({ type: "GLOBAL_DONE" });
  },
}
```

Action из actor effect без явного routing остаётся в своей группе. `transition.unscoped(...)` снимает routing.

### Persistence

По умолчанию actors живут только в runtime: `dehydrate()` их пропускает, `hydrate()` пропускает входящий actor key. Чтобы actors попали в snapshot — `persistence: "snapshot"`:

```ts
const request = createMachine({
  persistence: "snapshot",
  groupTag: "request",
  config: { __INIT: { START: "pending" }, pending: { DONE: "__RESOLVED" } },
  initialState: "__INIT",
  initialContext: { id: "" },
});
```

Без hooks snapshot actor использует дефолтный payload `{ state, context }`. Кастомные actor snapshot hooks видят пользовательский data-slice `{ state, context }`, payload snapshot и hydrate meta `{ strategy }`. `actorId`, `groupId` и `groupTag` сохраняет и восстанавливает `MachineManager` рядом с actor snapshot entry.

## Middleware

```ts
const logger: Middleware<AppState, AppEvent> = (api) => (next) => (action) => {
  const result = next(action);
  console.log(api.getState(), action);
  return result;
};
```

| `MiddlewareApi`            | Что даёт                       |
| -------------------------- | ------------------------------ |
| `getState()`               | текущий state                  |
| `transition(action)`       | дёрнуть всю цепочку middleware |
| `replaceReducer(enhancer)` | обернуть root reducer          |
| `onTransition(cb)`         | подписка из middleware         |
| `condition(predicate)`     | дождаться matching action      |

Правила:

- порядок pre-next = порядок регистрации, post-next — обратный (как в Redux);
- код до `next(action)` видит prev state, код после — committed state и уже отработавших subscribers;
- effects запускаются после возврата всей middleware-цепочки;
- чтобы заблокировать action — не вызывать `next(action)`;
- чтобы изменить — вызвать `next(modifiedAction)`;
- `transition` возвращает action, дошедший до reducer-а.

### `immerMiddleware`

```ts
MachineManager({ counter }, { middleware: [immerMiddleware] });
```

Оборачивает root reducer в `produce(...)`: можно мутировать draft и не возвращать ничего. Если reducer всё-таки вернул объект, top-level поля копируются в draft, неизменённые вложенные объекты сохраняют ссылки. Несёт маркер `__liteFsmAllowVoidReducer === true` — core разрешает `void` reducer.

### `devToolsMiddleware(options?)`

```ts
MachineManager({ counter }, { middleware: [devToolsMiddleware({ blacklistActions: ["TICK"] })] });
```

| Опция                         | Значение                                         |
| ----------------------------- | ------------------------------------------------ |
| `blacklistActions?: string[]` | action types, не отправляющиеся в Redux DevTools |

Без `window.__REDUX_DEVTOOLS_EXTENSION__` — pass-through. С extension: `connect` → `init` → `send` на каждый action; `JUMP_TO_ACTION` / `ROLLBACK` восстанавливают state через `replaceReducer`.

## React

```tsx
type Store = { counter: typeof counter };
const manager = MachineManager({ counter });

function App() {
  return (
    <FSMContextProvider machineManager={manager}>
      <Counter />
    </FSMContextProvider>
  );
}

function Counter() {
  const count = useSelector<Store, number>((s) => s.counter.context.count);
  const transition = useTransition<AppEvent>();
  return <button onClick={() => transition({ type: "INC" })}>{count}</button>;
}
```

| API                                        | Назначение                                                           |
| ------------------------------------------ | -------------------------------------------------------------------- |
| `FSMContextProvider`                       | кладёт manager в context                                             |
| `useManager<S, P>()`                       | manager из context                                                   |
| `useTransition<P>()`                       | `manager.transition`                                                 |
| `useSelector<S, R>(selector, equalityFn?)` | `useSyncExternalStoreWithSelector`-обёртка; default equality — `===` |
| `FSMHydrationBoundary`                     | preview snapshot уже на render + apply в layout effect               |
| `useHydrateSnapshot(snapshot, opts?)`      | apply snapshot в layout effect, без preview                          |
| `defineMachine`                            | standalone machine как hook                                          |

Внутри `FSMHydrationBoundary` selector читает overlay; `useManager().getState()` до layout effect — обычный state manager-а.

### Hydration в React

```tsx
<FSMHydrationBoundary snapshot={snapshot} strategy="merge">
  <Page />
</FSMHydrationBoundary>
```

| Когда                                                                      | API                    |
| -------------------------------------------------------------------------- | ---------------------- |
| snapshot должен быть виден subtree уже на первом render (SSR/RSC/Suspense) | `FSMHydrationBoundary` |
| только применить snapshot после mount                                      | `useHydrateSnapshot`   |

Не вкладывайте boundaries с разным snapshot на один и тот же machine key: preview идёт parent → child, а layout effect — child → parent, поэтому parent перезапишет child.

### React `defineMachine`

```tsx
const useCounter = defineMachine<AppEvent>().create(counter);

function Counter() {
  const count = useCounter((s) => s.context.count);
  return <button onClick={() => useCounter.transition({ type: "INC" })}>{count}</button>;
}
```

Hook-instance совмещает методы standalone machine (`transition`, `getState`, `onTransition`, `addMiddleware`). Несколько компонентов на один hook делят один state.

## Runtime notes

| Тонкость                 | Коротко                                                               |
| ------------------------ | --------------------------------------------------------------------- |
| DEV freeze               | snapshots из `getState()` deep-frozen при `NODE_ENV !== "production"` |
| Subscribers              | sync после изменения state; unsubscribe виден на следующем dispatch   |
| Effects                  | после subscribers; ошибки идут в `onError`, machine не падает         |
| Reentrant `transition`   | разрешён из middleware/subscriber/effect, проходит обычный pipeline   |
| Self-transition (`null`) | state не меняется; default reducer мержит payload в context           |
| Wildcard                 | fallback для transitions и effects; явный state приоритетнее          |
| Empty manager            | `MachineManager({})` валиден; state = `{}`                            |
| Reserved actions         | `@@lite-fsm/*` — только для core                                      |

## Команды

| Проверка             | Команда                  |
| -------------------- | ------------------------ |
| Unit tests           | `npm run test`           |
| Type tests           | `npm run test:types`     |
| Typecheck            | `npm run check-types`    |
| Lint                 | `npm run lint`           |
| Release verification | `npm run verify:release` |
