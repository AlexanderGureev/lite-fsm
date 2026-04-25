# lite-fsm — API Cheat Sheet

Краткий справочник по runtime-поведению публичного API `lite-fsm`. Парный документ к [`TYPES-CHEATSHEET.md`](TYPES-CHEATSHEET.md): там — про типы, здесь — про то, что код реально делает.

- Юнит-тесты: `npm run test`
- Покрытие: `npm run test:coverage`
- Полный релиз-цикл: `npm run verify:release`

## Точки входа (runtime)

| Импорт                         | Экспортирует                                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `lite-fsm`                     | `Machine`, `createMachine`, `defineMachine`, `MachineManager`, `createConfig`, `createReducer`, `createEffect` |
| `lite-fsm/middleware`          | `immerMiddleware`, `devToolsMiddleware` (barrel)                                                               |
| `lite-fsm/middleware/immer`    | `immerMiddleware`                                                                                              |
| `lite-fsm/middleware/devTools` | `devToolsMiddleware`                                                                                           |
| `lite-fsm/react`               | `FSMContext`, `FSMContextProvider`, `useManager`, `useSelector`, `useTransition`, `defineMachine`              |

> Примечание: `lite-fsm/react` помечен `"use client"`. В SSR импорт безопасен, а runtime-хуки и провайдер используются только на клиенте.

## Жизненный цикл события

Источники: [`tests/core/createMachine.test.ts`](tests/core/createMachine.test.ts), [`tests/core/MachineManager.test.ts`](tests/core/MachineManager.test.ts).

При вызове `transition(action)`:

1. `wrappedTransition` (compose всех middleware) запускается над action.
2. `rootReducer` пересчитывает `state` всех машин (или одной — для `createMachine`).
3. Выбрасывается `VOID_REDUCER_ERROR`, если результат `undefined` (без `immerMiddleware`).
4. В DEV — `deepFreeze(state)` нового снимка.
5. Синхронно вызываются все `onTransition`-подписчики: `(prev, current, action)`.
6. Запускаются эффекты: для каждой машины, если `prev.state !== current.state` и есть эффект для current — вызывается он; иначе — wildcard-эффект `"*"`, если задан.
7. Эффекты исполняются как `Promise.catch(opts.onError)` — ошибки не ломают работу машины.

## `Machine(cfg)` — чистая фабрика (он же `CreateMachine`)

Источник: [`tests/core/Machine.test.ts`](tests/core/Machine.test.ts).

`Machine(cfg)` возвращает 3 чистые функции — без подписки, без внутреннего state:

| Метод                            | Что делает                                                         |
| -------------------------------- | ------------------------------------------------------------------ |
| `config`                         | ссылка на переданный `cfg.config` (тот же объект, не копия)        |
| `transition(state, action)`      | синхронно вычисляет следующий `{ state, context }`                 |
| `invokeEffect(prev, curr, deps)` | `Promise<void>` — вызывает нужный эффект (или `void`, если нечего) |

### Правила `transition`

| Сценарий                                                  | Результат                                                                                          |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `config[state][action.type]` определён                    | `nextState = config[state][action.type]`                                                           |
| Ключа нет у текущего state, но он есть у `"*"`            | wildcard-переход (`config["*"][action.type]`)                                                      |
| `nextState === null`                                      | self-transition: state не меняется, payload мержится в context (если без reducer'а)                |
| `nextState === undefined` (нет ни в state, ни в `"*"`)    | возвращается **тот же** объект state по ссылке                                                     |
| `cfg.reducer` задан                                       | вызывается `reducer(state, action, { nextState, config })`; ожидается возврат `{ state, context }` |
| `cfg.reducer` без явного reducer'а                        | `{ state: nextState, context: { ...state.context, ...action.payload } }`                           |
| `reducer` вернул `undefined`, и runtime не разрешает void | бросает `VOID_REDUCER_ERROR` (`/immerMiddleware/`)                                                 |

`meta.nextState` в reducer'е при self-transition (`null`) равен **текущему** state, не `null`.

### Правила `invokeEffect`

| Условие                                                            | Что вызывается                                       |
| ------------------------------------------------------------------ | ---------------------------------------------------- |
| `prev !== current` и `effects[current]` есть                       | `effects[current]`                                   |
| `prev !== current`, есть `effects["*"]`, но нет `effects[current]` | `effects["*"]`                                       |
| `prev === current`, есть `effects["*"]`                            | `effects["*"]` (self-transition активирует wildcard) |
| `prev === current`, нет `effects["*"]`                             | ничего                                               |
| `effects` отсутствует                                              | ничего, `Promise<undefined>`                         |

Явный эффект состояния всегда **приоритетнее** wildcard'а.

## `createMachine(cfg, opts?)` — stateful обёртка

Источник: [`tests/core/createMachine.test.ts`](tests/core/createMachine.test.ts).

```ts
createMachine(cfg, { onError?, dependencies? })
  → { getState, transition, onTransition, addMiddleware }
```

| Метод                  | Семантика                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `getState()`           | возвращает прямую ссылку на текущий снимок (стабильна между вызовами, меняется после `transition`)                                             |
| `transition(action)`   | прогоняет middleware-цепочку, обновляет state, синхронно вызывает подписчиков, асинхронно — эффекты; возвращает финальный action из middleware |
| `onTransition(cb)`     | подписка `(prev, current, action) => void`; возвращает `unsubscribe`                                                                           |
| `addMiddleware(...mw)` | добавляет middleware **в конец** существующей цепочки и пересобирает обёртку                                                                   |

### Контрактные детали

- В DEV (`process.env.NODE_ENV !== "production"`) каждый снимок проходит `deepFreeze`. Попытка мутировать его извне → `TypeError`.
- `transition` возвращает action **после** прохождения middleware (middleware может его модифицировать).
- Подписчики получают `(prev, current, action)` уже с обновлённым state. Отписка во время эмита **не** влияет на текущий цикл, но отключает следующий.
- Эффекты получают `deps = { ...opts.dependencies, transition, action, condition }`.
- `condition(predicate)` создаёт `Promise<boolean>`, который резолвится на ближайшем action, для которого `predicate` вернул `true`. Бросок в predicate → `reject` → `opts.onError`.
- Каскад: `transition` из эффекта углубляет стек; внешние эффекты дожидаются вложенных и видят уже финальный state. Эффекты разворачиваются LIFO.
- `addMiddleware` перевычисляет `allowVoidReducer` (см. `__liteFsmAllowVoidReducer`).

## `defineMachine<P, D>(opts?).create(cfg)` — core

Источник: [`tests/core/createMachine.test.ts`](tests/core/createMachine.test.ts) (секция `defineMachine (core)`).

Тонкая фабрика поверх `createMachine`: фиксирует `P`/`D`/`opts` один раз, дальше создаёт независимые машины:

```ts
const factory = defineMachine<Events, Deps>({ onError, dependencies });
const a = factory.create(cfgA);
const b = factory.create(cfgB);
```

- `a` и `b` — **независимые** stateful-машины (разный state, разные подписчики).
- `opts.dependencies` и `opts.onError` прокидываются в каждую `create(...)`.
- Набор методов совпадает с `createMachine`: `getState/transition/onTransition/addMiddleware`.

## `MachineManager(machines, opts?)` — оркестратор

Источник: [`tests/core/MachineManager.test.ts`](tests/core/MachineManager.test.ts).

```ts
MachineManager(machines, { onError?, middleware? })
  → { getState, transition, setDependencies, onTransition, replaceReducer }
```

### Поведение

- Initial state собирается как `{ [name]: { state: cfg.initialState, context: cfg.initialContext } }`.
- `transition(action)` прогоняет одно событие через **все** машины: каждая решает сама — реагировать или вернуть state как есть.
- Машины, для которых нет соответствия `state→event`, оставляют snapshot **по ссылке** (важно для referential equality в селекторах).
- В DEV — снимок целиком `deepFreeze`-ится.
- Порядок исполнения: rootReducer (по всем машинам) → подписчики → эффекты по каждой машине.
- Каскад: вложенные `transition` из эффектов работают как в одиночной машине — LIFO для возвратов, эффекты внешних машин видят финальное состояние.

### Методы

| Метод                                     | Что делает                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `getState()`                              | весь снимок (`{ [name]: { state, context } }`)                                                               |
| `transition(action)`                      | то же, что в `createMachine`, но по карте машин; возвращает финальный action                                 |
| `onTransition(cb)`                        | `(prev, current, action) => void`; возвращает `unsubscribe`                                                  |
| `replaceReducer((prev) => next)`          | оборачивает существующий root-reducer; внутри можно сделать short-circuit или мутацию state до делегирования |
| `setDependencies(deps \| (prev) => next)` | устанавливает или обновляет `D`, общий для всех эффектов                                                     |

### `setDependencies` — детали

- Объектом — полностью заменяет deps.
- Функцией — получает текущие deps, должна вернуть новые.
- В эффектах `deps` доступны как `(deps & DefaultDeps) → effect(deps)`. `DefaultDeps` (`transition`, `action`, `condition`) добавляются менеджером — их в `setDependencies` отправлять **не нужно**.

### Ошибки эффектов

- Эффект синхронный или async — итог в `Promise.catch(opts.onError)`. Машина не падает.
- Reject из `condition` (бросок в predicate) тоже идёт в `onError`.

### `replaceReducer` (публичный API)

Принимает функцию `(prev) => next`. Можно:

- сделать short-circuit на конкретный action: вернуть свой state без вызова `prev`;
- делегировать `prev(state, action)` для остальных случаев.

Используется внутри `immerMiddleware` и `devToolsMiddleware` через `MiddlewareApi.replaceReducer`.

## Identity-хелперы

Источник: [`tests/core/createEffect.test.ts`](tests/core/createEffect.test.ts) (секция `identity helpers`).

| Функция                                           | Поведение                                            | Когда нужна                                                                                                        |
| ------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `createConfig(cfg)`                               | возвращает `cfg` по ссылке                           | захватить узкий тип конфига; ничего не делает в runtime                                                            |
| `createReducer(reducer)`                          | возвращает reducer по ссылке                         | то же — фиксация типа                                                                                              |
| `createMachine(cfg)` _(публичный API `lite-fsm`)_ | возвращает `cfg` по ссылке                           | identity-фабрика для `MachineConfig`; в `MachineManager`/`Machine`/`defineMachine` передаются именно такие конфиги |
| `createEffect({ effect, type?, cancelFn? })`      | оборачивает эффект логикой `every`/`latest` + cancel | не identity — реально модифицирует поведение `transition` внутри                                                   |

> Внутри `src/core/Machine.ts` есть одноимённая **stateful** функция `createMachine`, наружу она экспортируется как `Machine` (`export { CreateMachine as Machine }`). Публичный `createMachine` из `lite-fsm` — всегда identity для `MachineConfig`.

### `createEffect` — детали

```ts
createEffect({ effect, type, cancelFn });
```

- `type: "every"` _(default)_ — `effect` запускается на каждый вызов; внутренний `transition` всегда проходит к оригинальному.
- `type: "latest"` — каждый запуск получает свой `id`; если на момент вызова `transition` (внутри эффекта) появился более новый запуск — `transition` **подавляется** (effect выполняется до конца, но его результат не доходит).
- `cancelFn(deps) => () => boolean` — вызывается на каждый запуск **до** эффекта; возвращённый `cancel()` проверяется при каждом `transition` внутри эффекта. `true` → `transition` подавляется.
- `effect`-функция получает `deps` от вызывающего (от `MachineManager`/`createMachine`), но `transition` подменяется на обёртку, учитывающую `type`/`cancelFn`.

## Middleware

Источники: [`tests/core/createMachine.test.ts`](tests/core/createMachine.test.ts) (секция `addMiddleware`), [`tests/core/MachineManager.test.ts`](tests/core/MachineManager.test.ts) (секция `middleware`).

Сигнатура:

```ts
type Middleware = (api: MiddlewareApi) => (next) => (action) => result;
```

Типовая ремарка: `Middleware` по умолчанию больше не использует silent `any`; базовый default — `Middleware<unknown, AnyEvent>`. Для middleware, совместимого с любой парой `state/action`, используется `GenericMiddleware`.

### `MiddlewareApi`

| Ключ                             | Что доступно из middleware                                         |
| -------------------------------- | ------------------------------------------------------------------ |
| `getState()`                     | актуальный state до и после `next`                                 |
| `transition(action)`             | redispatch — пройдёт **всю** цепочку middleware заново             |
| `replaceReducer((prev) => next)` | подменить root reducer (применяется к `MachinesState`/`StateType`) |
| `onTransition(cb)`               | подписка изнутри middleware                                        |
| `condition(predicate)`           | дождаться action по предикату                                      |

### Поведенческие правила

- Порядок вызова middleware совпадает с порядком регистрации (`opts.middleware: [a, b]` или `addMiddleware(a, b)`): сначала `a`, затем `b`.
- Middleware может **блокировать** action — не вызывая `next(action)`. Тогда state, подписчики и эффекты не запускаются.
- Middleware может **модифицировать** action — `next({ ...action, payload: ... })`. Изменения видны reducer'у, подписчикам и wildcard-эффектам.
- `api.transition` внутри middleware — это redispatch, проходящий через всю цепочку (не просто внутренний `_transition`).
- Контракт возврата из `transition` — **тот action, который дошёл до конца цепочки** (после всех модификаций).

### `addMiddleware` (для `createMachine`)

- Накапливает middleware; каждый вызов перевычисляет обёртку.
- Учитывает маркер `__liteFsmAllowVoidReducer` (см. `immerMiddleware`).

> В `MachineManager` middleware задаются один раз через `opts.middleware`. Динамическое добавление — только на уровне отдельной машины через `createMachine` + `addMiddleware`.

## `immerMiddleware`

Источник: [`tests/middleware/immer.test.ts`](tests/middleware/immer.test.ts).

| Поведение          | Детали                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------- |
| Маркер             | `immerMiddleware.__liteFsmAllowVoidReducer === true` — runtime разрешает reducer без `return` |
| `replaceReducer`   | оборачивает root reducer в `produce(...)`: можно мутировать draft без return                  |
| Top-level merge    | если reducer вернул объект — его top-level поля копируются в draft, `undefined` игнорируется  |
| Pass-through       | сам `(next) => next` — actions проходят без изменения                                         |
| Структурный шаринг | immer сохраняет ссылки у неизменённых вложенных объектов                                      |
| Без middleware     | reducer без return → `VOID_REDUCER_ERROR`                                                     |

Типичный паттерн:

```ts
reducer: (state, action, { nextState }) => {
  state.state = nextState;
  state.context.count += 1;
};
```

Без `immerMiddleware` такой reducer бросит `VOID_REDUCER_ERROR`.

## `devToolsMiddleware(options?)`

Источники: [`tests/middleware/devTools.test.ts`](tests/middleware/devTools.test.ts), [`tests/middleware/devTools-node.test.ts`](tests/middleware/devTools-node.test.ts).

| Окружение                                   | Поведение                                                                                                                        |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `typeof window === "undefined"` (SSR/Node)  | pass-through `(next) => (action) => next(action)`; ничего не подключает                                                          |
| `window` без `__REDUX_DEVTOOLS_EXTENSION__` | pass-through; `replaceReducer` всё ещё подключается → `JUMP/ROLLBACK` через `@devtools/...` actions работают                     |
| `window` + extension                        | подключение через `connect({...})` с фиксированным конфигом, `init(state)`, отправка обычных actions через `send(action, state)` |

Конфиг при подключении: `features: { pause, export, test, jump, live: true, skip: false }`, `autoPause: false`, `latency: 500`.

### Опции

```ts
devToolsMiddleware({ blacklistActions?: string[] })
```

- `blacklistActions` — типы действий, которые **не** отправляются в DevTools.
- Действия с префиксом `@devtools/` тоже не отправляются обратно (защита от петли).
- Без аргументов — `blacklistActions = []`.

### Сообщения от DevTools (через `subscribe`)

| `message`                                    | Эффект                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `type: "DISPATCH"` + `state` (валидный JSON) | менеджер получает action `@devtools/JUMP_TO_ACTION` или `@devtools/ROLLBACK` с `payload = JSON.parse(state)` |
| `type: "DISPATCH"` без `state`               | игнорируется молча                                                                                           |
| `type: "DISPATCH"` + невалидный JSON         | `console.error("[devToolsMiddleware]", err)`                                                                 |
| Любое `type !== "DISPATCH"`                  | игнорируется                                                                                                 |

### `replaceReducer` от devTools

Внутри установлен reducer:

```ts
case "@devtools/JUMP_TO_ACTION":
case "@devtools/ROLLBACK":
  return { ...state, ...action.payload };
default:
  return originalReducer(state, action);
```

Можно вручную инициировать тот же эффект — `manager.transition({ type: "@devtools/JUMP_TO_ACTION", payload: ... })` работает и без extension в окне.

> `devToolsMiddleware` **не** имеет маркера `__liteFsmAllowVoidReducer` — без `immerMiddleware` reducer без return по-прежнему упадёт.

## React API

### `FSMContext`, `FSMContextProvider`

Источник: [`tests/react/FSMContext.test.tsx`](tests/react/FSMContext.test.tsx).

- `FSMContext` — `React.Context<unknown>`. По умолчанию runtime-значение — `null`.
- Типизированный manager стирается при записи в context, а нужный `FSMContextType<S, P>` восстанавливается в `useManager<S, P>()`.
- `<FSMContextProvider machineManager={...}>` — мемоизирует переданный `machineManager` через `useMemo`. Меняется только при смене ссылки на `machineManager`.

### `useManager<S, P>()`

Источник: [`tests/react/hooks.test.tsx`](tests/react/hooks.test.tsx).

| Сценарий                    | Результат                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------ |
| Внутри `FSMContextProvider` | возвращает тот же `machineManager` по ссылке                                         |
| Без provider'а              | бросает `Error("Hooks from lite-fsm/react must be used within FSMContextProvider.")` |

Типовая ремарка: без generic-ов `useManager()` больше не возвращает `IMachineManager<any, any>`; default — безопасный `IMachineManager<MachineStore, AnyEvent>`. Для app-level строгости указывай `useManager<AppMachines, AppEvent>()`.

### `useTransition<P>()`

| Сценарий       | Результат                               |
| -------------- | --------------------------------------- |
| С provider'ом  | возвращает функцию `manager.transition` |
| Без provider'а | бросает ту же ошибку, что `useManager`  |

Возврат — **сам** `transition`, без обёрток. Можно сохранять в ref / пробрасывать как пропс.

Типовая ремарка: без generic-ов `useTransition()` возвращает `(payload: AnyEvent) => AnyEvent`, а не `(payload: any) => any`. Для строгого dispatch используй `useTransition<AppEvent>()`.

### `useSelector<S, R>(selector, equalityFn?)`

Под капотом — `useSyncExternalStoreWithSelector` (через `use-sync-external-store/shim/with-selector`).

| Поведение                | Детали                                                              |
| ------------------------ | ------------------------------------------------------------------- |
| Подписка                 | через `manager.onTransition`                                        |
| Снимок                   | `manager.getState()`                                                |
| Селектор                 | `(state) => R` — изоляция нужного среза                             |
| `equalityFn(prev, next)` | если возвращает `true` — компонент **не** ререндерится              |
| Без `equalityFn`         | сравнение по `===` — стабильные ссылки в state не вызывают ререндер |
| Без provider'а           | бросает ту же ошибку, что `useManager`                              |

### `defineMachine<P, D>(opts?).create(cfg)` — react-вариант

Источник: [`tests/react/defineMachine.test.tsx`](tests/react/defineMachine.test.tsx).

Возвращает **функцию-хук** с прикреплённым API:

```ts
const machine = defineMachine<Events, Deps>(opts).create(cfg);

const Probe = () => {
  const slice = machine((state) => state.context.n);  // хук
  return <span>{slice}</span>;
};

machine.transition({ type: "GO" });  // тот же машинный transition
machine.getState();
machine.onTransition(cb);
machine.addMiddleware(mw);
```

| Контракт                                                       | Поведение                                                  |
| -------------------------------------------------------------- | ---------------------------------------------------------- |
| `machine(selector, equalityFn?)`                               | то же, что `useSelector`, но привязан к этой машине        |
| `machine.transition / getState / onTransition / addMiddleware` | те же методы, что у `createMachine`                        |
| `addMiddleware`                                                | модифицирует поведение и итоговый slice, который видит хук |
| `onError`                                                      | ловит ошибки эффектов, как в core-варианте                 |
| `dependencies`                                                 | прокидываются в эффекты                                    |

Каждый вызов `defineMachine(...).create(cfg)` создаёт **независимую** машину. Несколько компонентов, использующих один и тот же `machine`, делят state.

## Тонкости и подводные камни

1. **`VOID_REDUCER_ERROR`** — текст: `"Reducer returned undefined. Return the next state, or use immerMiddleware to mutate draft state without return."`. Бросается, если ни `immerMiddleware`, ни custom-middleware с маркером `__liteFsmAllowVoidReducer === true` не подключены.
2. **DEV deepFreeze** — `process.env.NODE_ENV !== "production"`. Любая попытка мутации snapshot'а из `getState()` извне → `TypeError`. В prod — не замораживается ради скорости.
3. **Self-transition `null`** — не меняет `state`, мержит payload в context (если без reducer'а), активирует только wildcard effect (но не state-effect текущего состояния).
4. **Wildcard `"*"`** — приоритет: явный `state[event]` всегда выигрывает. Wildcard срабатывает только при отсутствии явного маппинга.
5. **Каскад `transition` из эффектов** — синхронный стек, эффекты разворачиваются **LIFO**; внешние эффекты видят финальный snapshot, в котором отработали все вложенные.
6. **Подписчики на момент эмита** — список подписчиков фиксируется на старте цикла. Отписка во время вызова отключает только следующий цикл.
7. **`condition` reject** — попадает в `onError` (или просто Promise.reject, если `onError` не задан). Сам `condition` отписывается автоматически после resolve/reject.
8. **`transition` возвращает action из middleware** — не исходный. Если middleware модифицирует payload, вернётся модифицированная версия.
9. **`MachineManager({})`** — корректный, но у `transition` нет ни одного валидного события (тип события — `never`); `getState()` возвращает `{}`.
10. **Маркер `__liteFsmAllowVoidReducer`** — runtime контракт между core и middleware. Чтобы написать своё middleware, разрешающее void-reducer, добавь свойство `mw.__liteFsmAllowVoidReducer = true` (см. `immerMiddleware` для примера).
11. **`devToolsMiddleware`: window есть, extension нет** — всё ещё устанавливает кастомный reducer для `@devtools/*` actions; можно «вручную» восстанавливать state, диспатча `@devtools/JUMP_TO_ACTION`. В SSR (нет `window`) — чистый pass-through, никаких побочных эффектов.
12. **`createMachine` в публичном API — identity** — для stateful-машины используй `Machine` или `defineMachine().create(...)`. Похожие имена внутри библиотеки решены через ре-экспорт `CreateMachine as Machine`.
