# Техническое задание: множественные persist statuses в React

## Цель

Доработать интеграцию `@lite-fsm/react` и `@lite-fsm/persist/react`, чтобы один `FSMContextProvider` мог запускать несколько persist lifecycle и отдавать React-компонентам статусы каждого entry в порядке массива `persist`.

Целевой пользовательский код:

```tsx
<FSMContextProvider machineManager={manager} persist={[localPersist, remotePersist]}>
  {children}
</FSMContextProvider>
```

```tsx
import { usePersistStatuses } from "@lite-fsm/persist/react";

function Readout() {
  const [localStatus, remoteStatus] = usePersistStatuses();

  if (localStatus?.phase === "idle" || localStatus?.phase === "restoring") {
    return <LocalSkeleton />;
  }

  return remoteStatus?.phase === "ready" ? <RemoteView /> : <RemoteSkeleton />;
}
```

Задача решает сценарий, где разные части состояния сохраняются в разные хранилища и UI должен уметь разблокировать независимые части интерфейса по мере готовности соответствующего persist controller.

## Общие ограничения

- Изменение является breaking change.
- Старую реализацию `usePersistStatus` удалить.
- Обратную совместимость для `usePersistStatus` и одиночного `persist={controller}` не поддерживать.
- Не добавлять хранение persist controller в `window`, module global state пользователя или `useManager`.
- Не добавлять зависимость `@lite-fsm/react` от `@lite-fsm/persist`.
- Не расширять `PersistStatus` системным статусом `"none"`.
- Не добавлять новый публичный тип для status-capable persist entry.
- Новая чистая логика и модули с контрактами без сайд-эффектов должны иметь 100% coverage по statements, branches, functions и lines.
- Не запускать docs build, `pnpm run build`, `pnpm run docs:build`, `pnpm run pages:build*` и `next build` внутри `apps/docs`.

## Область работ

Изменить:

- `packages/react/src/persistContext.ts`;
- `packages/react/src/FSMProvider.tsx`;
- `packages/persist/src/react.ts`;
- `packages/persist/README.md`;
- `packages/react/README.md`, если в нём есть устаревшее описание provider-а;
- `API-CHEATSHEET.md`;
- `TYPES-CHEATSHEET.md`;
- `tests/react/persist.test.tsx`;
- `tests/react/persist.ssr.test.tsx`;
- `tests/types/persist-api.tst.tsx`;
- `tests/smoke/esm.mjs`;
- `tests/smoke/cjs.cjs`;
- `tests/smoke/types.ts`;
- `apps/docs`, если там найдутся упоминания старого API.

Не изменять:

- `PersistController` runtime contract;
- `PersistStatus` shape;
- `persistManager` public methods;
- `MachineManager` и `useManager`;
- docs build pipeline.

## Публичный API

### `FSMContextProvider`

`FSMContextProvider.persist` должен принимать только массив lifecycle entries:

```ts
type FSMContextProviderProps<S, P> = React.PropsWithChildren<{
  machineManager: IMachineManager<S, P>;
  getServerSnapshot?: () => MachinesState<S>;
  persist?: readonly FSMPersistLifecycle[];
}>;
```

`FSMPersistLifecycle` остаётся минимальным structural contract:

```ts
type FSMPersistLifecycle = {
  start(): () => void;
};
```

Валидный код:

```tsx
<FSMContextProvider machineManager={manager} persist={[persist]}>
  {children}
</FSMContextProvider>
```

```tsx
<FSMContextProvider machineManager={manager} persist={[localPersist, remotePersist]}>
  {children}
</FSMContextProvider>
```

`persist={[]}` разрешён и означает, что provider запускает ноль lifecycle entries.

### `@lite-fsm/persist/react`

Public export surface должен стать:

```ts
usePersistStatuses
useIsPersistRestoring
```

`usePersistStatus` удалить из public surface.

`usePersistStatuses`:

```ts
usePersistStatuses(): readonly (PersistStatus | null)[];
```

Контракт:

- хук не принимает аргументы;
- хук работает только через ближайший `FSMContextProvider`;
- длина возвращаемого массива равна длине текущего `FSMContextProvider.persist`;
- порядок возвращаемого массива совпадает с порядком `FSMContextProvider.persist`;
- entry без `getStatus()` и `subscribeStatus()` возвращается как `null`;
- если provider есть, но `persist` не передан, возвращается `[]`;
- если provider есть и `persist={[]}`, возвращается `[]`;
- если hook вызван вне `FSMContextProvider`, он бросает provider error.

`useIsPersistRestoring`:

```ts
useIsPersistRestoring(): boolean;
```

Контракт:

- хук не принимает аргументы;
- возвращает `true`, если хотя бы один non-null статус имеет `phase === "restoring"`;
- игнорирует `null` entries;
- возвращает `false` для `[]`.

Сообщение ошибки вне provider-а:

```txt
Hooks from @lite-fsm/persist/react require FSMContextProvider from @lite-fsm/react.
```

## Runtime-требования

### Provider lifecycle

`FSMContextProvider` должен сохранить существующую модель запуска lifecycle:

- на mount/effect вызывает `start()` у каждого entry из `persist`;
- на cleanup вызывает stop-функции, возвращённые `start()`;
- при смене `persist` prop останавливает старые lifecycle entries и запускает новые;
- если `persist` не передан, не запускает lifecycle entries;
- если `persist={[]}`, запускает ноль lifecycle entries.

Provider должен сравнивать `persist` как последовательность entries, а не как reference массива. Inline usage не должен перезапускать lifecycle при каждом parent render, если состав массива не изменился:

```tsx
<FSMContextProvider machineManager={manager} persist={[localPersist, remotePersist]}>
  {children}
</FSMContextProvider>
```

Требования:

- новый wrapper array с теми же entries в том же порядке не должен вызывать stop/start;
- изменение длины массива должно вызывать stop/start;
- замена любого entry по identity должна вызывать stop/start;
- изменение порядка entries должно вызывать stop/start;
- status context должен сохранять тот же смысл: форма и порядок статусов соответствуют текущей последовательности entries.

`persist` должен отражаться в status context уже на render:

```tsx
persist={[a, b]} -> usePersistStatuses().length === 2
persist={[a]}    -> usePersistStatuses().length === 1
persist={[]}     -> usePersistStatuses().length === 0
persist={undefined} -> usePersistStatuses().length === 0
```

Запуск `start()` остаётся effect-side behavior и не должен влиять на форму массива статусов в render.

### Status entries

Внутренний status source определяется структурно:

```ts
type FSMPersistStatusSource = {
  getStatus(): unknown;
  subscribeStatus(listener: () => void): () => void;
};
```

Entry считается status-capable только при наличии обеих функций:

- `getStatus`;
- `subscribeStatus`.

`@lite-fsm/react` не импортирует `PersistStatus`, поэтому внутренний structural source типизирован через `unknown`. Runtime contract для custom status-capable lifecycle остаётся строгим: `getStatus()` должен возвращать значение, совместимое с `PersistStatus` из `@lite-fsm/persist`. Shape validation не выполняется; некорректный status value считается ошибкой пользовательского lifecycle.

Для массива:

```tsx
<FSMContextProvider persist={[lifecycleOnly, localPersist, remotePersist]}>
```

`usePersistStatuses()` должен вернуть:

```ts
[null, localStatus, remoteStatus]
```

`null` означает, что соответствующий `persist` entry не предоставляет status source. Это не состояние persist controller и не часть `PersistStatus`.

Некорректные значения вроде `null as any` не поддерживаются отдельным runtime-контрактом. `persist` должен соответствовать типу `readonly FSMPersistLifecycle[]`.

### Подписки

`usePersistStatuses()` должен использовать `useSyncExternalStore` и подписываться на все non-null status sources из текущего context.

Требования:

- при изменении любого non-null source компонент должен перерендериться;
- hook возвращает новый массив при изменении любого source;
- `getSnapshot` и `getServerSnapshot` не должны создавать новый массив на каждый вызов;
- aggregate store должен возвращать тот же array reference, пока набор entries и прочитанные статусы не изменились;
- новый array reference создаётся при смене набора entries или после notification от source, если повторное чтение статусов меняет хотя бы одну позицию;
- `null` позиции сохраняются;
- snapshot собирается через текущие `getStatus()` всех non-null sources;
- server snapshot не должен обращаться к storage;
- объекты `PersistStatus` берутся из controller-а без дополнительной нормализации.

Точечный selector-hook для отдельного индекса в этой итерации не добавлять.

### Изменение `persist` prop

При смене `persist` prop:

- context value должен сразу соответствовать новому массиву entries;
- подписки `usePersistStatuses()` должны переключиться на новые status sources;
- старые status sources не должны обновлять hook после переключения;
- старые lifecycle entries должны быть остановлены через существующий cleanup effect.

## SSR-требования

`usePersistStatuses()` должен быть SSR-safe.

Если `FSMContextProvider` отрисовывается без `persist`, hook возвращает `[]` и на сервере, и на клиенте:

```tsx
function Readout() {
  const statuses = usePersistStatuses();
  return <span>{statuses.length}</span>;
}

renderToString(
  <FSMContextProvider machineManager={manager}>
    <Readout />
  </FSMContextProvider>,
);
```

Результат: server render завершается без ошибки, HTML содержит `0`.

Если `persist` содержит `PersistController` от `persistManager`, server render должен читать только `controller.getStatus()` и не должен вызывать storage factory. `createJsonStorage({ storage: () => window.localStorage })` не должен обращаться к `window` во время render.

Отдельный synthetic server fallback `{ phase: "idle" }` больше не нужен. Отсутствие `persist` выражается пустым массивом статусов.

## Внутренняя архитектура

### Shared context

Shared context между `@lite-fsm/react` и `@lite-fsm/persist/react` должен перейти на новую форму:

```ts
type FSMPersistStatusEntry = FSMPersistStatusSource | null;

React.Context<readonly FSMPersistStatusEntry[] | null>
```

Смысл значений:

- `null` как значение context: provider отсутствует;
- `[]`: provider есть, но observable status entries нет;
- `[null, source]`: provider есть, первый lifecycle entry без status source, второй entry со status source.

Global symbol key заменить на новый:

```ts
Symbol.for("@lite-fsm/react.persistStatusesContext")
```

Старый key:

```ts
Symbol.for("@lite-fsm/react.persistContext")
```

не использовать для новой формы context-а.

### Имена внутренних сущностей

Внутренние имена должны отражать множественную модель:

- `FSMPersistContext` переименовать в `FSMPersistStatusesContext`;
- `resolvePersistStatusSource` заменить на `resolvePersistStatusSources`;
- единичный тип `FSMPersistStatusSource` можно оставить для одного source;
- добавить внутренний alias для entry, если это упрощает код:

```ts
type FSMPersistStatusEntry = FSMPersistStatusSource | null;
```

`resolvePersistStatusSources`:

```ts
resolvePersistStatusSources(
  persist: readonly FSMPersistLifecycle[] | undefined,
): readonly FSMPersistStatusEntry[];
```

Ожидаемое поведение:

```ts
undefined -> []
[] -> []
[lifecycleOnly] -> [null]
[controller] -> [controller]
[lifecycleOnly, controller] -> [null, controller]
[firstController, secondController] -> [firstController, secondController]
```

## Документация

Обновить все публичные упоминания:

- заменить `usePersistStatus` на `usePersistStatuses`;
- заменить `persist={persist}` на `persist={[persist]}`;
- описать, что `FSMContextProvider.persist` принимает только массив;
- описать, что `usePersistStatuses()` возвращает массив той же длины и в том же порядке, что `persist`;
- описать `null` для lifecycle entries без status source;
- описать, что `useIsPersistRestoring()` проверяет только `phase === "restoring"`.

Для UI, который блокирует первый restore, документация должна явно учитывать оба состояния:

```ts
const [status] = usePersistStatuses();

const pending = status?.phase === "idle" || status?.phase === "restoring";
```

Для aggregate overlay:

```ts
const restoring = useIsPersistRestoring();
```

`useIsPersistRestoring()` не должен описываться как проверка полной готовности persist, потому что он не считает `"idle"` состоянием restoring.

`API-CHEATSHEET.md` и `TYPES-CHEATSHEET.md` обновить обязательно, потому что меняются публичный API и публичные типы.

## Тестирование

### Runtime tests

Обновить `tests/react/persist.test.tsx`.

Тесты должны покрывать все новые способы использования публичного API:

- provider без `persist`;
- provider с `persist={[]}`;
- provider с одним entry `persist={[persist]}`;
- provider с несколькими entries `persist={[first, second]}`;
- mixed entries `persist={[lifecycleOnly, controller]}`;
- глубокий компонент, который читает статусы только через `usePersistStatuses()`;
- глобальный индикатор, который читает aggregate restoring через `useIsPersistRestoring()`.

Покрыть:

- `FSMContextProvider` запускает и останавливает все entries из `persist={[first, second]}`;
- inline `persist={[first, second]}` не перезапускает lifecycle при parent rerender без изменения entries;
- новый порядок, новая длина или замена entry перезапускают lifecycle;
- `persist={[]}` не запускает lifecycle и даёт пустой массив статусов;
- provider без `persist` даёт пустой массив статусов;
- `usePersistStatuses()` возвращает статусы нескольких controllers в порядке массива;
- `usePersistStatuses()` возвращает `null` для lifecycle-only entry и сохраняет индекс;
- hook обновляется при изменении любого controller status;
- hook сохраняет тот же array reference между render-ами без изменения status entries;
- hook переподписывается при смене `persist` prop;
- старый controller не обновляет UI после смены prop;
- `useIsPersistRestoring()` возвращает `true`, если любой non-null status имеет `phase === "restoring"`;
- `useIsPersistRestoring()` игнорирует `null` entries;
- `useIsPersistRestoring()` возвращает `false` для `[]`;
- `usePersistStatuses()` вне provider-а бросает новое provider error.

Удалить или переписать тесты старого поведения:

- explicit `usePersistStatus(controller)`;
- `usePersistStatus()` как scalar status;
- provider error при нескольких status controllers;
- provider error внутри client provider без `persist`;
- одиночный `persist={controller}`.

### SSR tests

Обновить `tests/react/persist.ssr.test.tsx`.

Покрыть:

- provider без `persist` на server render отдаёт `[]`;
- provider с `persist={[]}` на server render отдаёт `[]`;
- provider с одним controller в `persist={[controller]}` отдаёт массив из одного статуса;
- provider с несколькими controllers отдаёт массив статусов в порядке `persist`;
- lifecycle-only entry на server render отдаёт `null` на своей позиции;
- `useIsPersistRestoring()` на server render возвращает `false` для `[]`;
- lazy `createJsonStorage({ storage: () => window.localStorage })` не вызывает storage factory во время server render.

Тесты старого synthetic idle fallback удалить или заменить на новый контракт `[]`.

### Type tests

Обновить `tests/types/persist-api.tst.tsx`.

Проверить:

- `@lite-fsm/persist/react` экспортирует только `usePersistStatuses` и `useIsPersistRestoring`;
- `usePersistStatuses()` имеет тип `readonly (PersistStatus | null)[]`;
- `useIsPersistRestoring()` имеет тип `boolean`;
- `FSMContextProviderProps.persist` имеет тип `readonly FSMPersistLifecycle[] | undefined`;
- `FSMContextProvider` принимает `persist={[lifecycle]}`;
- `FSMContextProvider` принимает `persist={[controller]}`;
- `FSMContextProvider` принимает `persist={[]}`.

Негативный type test на `persist={controller}` не добавлять.

### Smoke tests

Обновить:

- `tests/smoke/esm.mjs`;
- `tests/smoke/cjs.cjs`;
- `tests/smoke/types.ts`.

Smoke tests должны ожидать `usePersistStatuses` и не ожидать `usePersistStatus`.

### Coverage

Для новой чистой логики и contract helpers обеспечить 100% coverage по statements, branches, functions и lines.

Минимально это относится к:

- сравнению последовательности `persist` entries;
- построению status entries из `persist`;
- aggregate store/snapshot логике для `usePersistStatuses`;
- обработке `null` entries;
- переключению подписок при смене `persist` prop.

Если coverage tooling не позволяет изолировать эти модули отдельным порогом, тестовый набор должен явно покрывать все ветви перечисленной логики.

## Проверки

После реализации выполнить:

```sh
pnpm run test -- tests/react/persist.test.tsx tests/react/persist.ssr.test.tsx
pnpm run test:types
pnpm run check-types
pnpm run lint
pnpm run build:packages
```

Если точечный `pnpm run test -- ...` не поддерживается текущей конфигурацией, использовать эквивалентный Vitest filter.

Не выполнять:

```sh
pnpm run build
pnpm run docs:build
pnpm run pages:build
pnpm run pages:build:*
pnpm --filter @lite-fsm/docs build
next build
```

Если нужна проверка docs build, её должен выполнить пользователь.

## Acceptance criteria

- `usePersistStatus` удалён из public surface `@lite-fsm/persist/react`.
- `usePersistStatuses` добавлен в public surface `@lite-fsm/persist/react`.
- `FSMContextProvider.persist` принимает только массив lifecycle entries.
- `usePersistStatuses()` возвращает массив статусов и `null` entries в порядке `FSMContextProvider.persist`.
- `usePersistStatuses()` возвращает `[]` внутри provider-а без `persist` и при `persist={[]}`.
- `usePersistStatuses()` бросает provider error вне `FSMContextProvider`.
- `useIsPersistRestoring()` работает как aggregate по всем non-null statuses.
- SSR render не вызывает storage factory и не требует `window`.
- Документация, cheatsheets, runtime tests, type tests и smoke tests обновлены под новый контракт.
- Запрещённые docs/build команды не запускались агентом.
