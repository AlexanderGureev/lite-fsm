# Техническое задание: SSR-safe persist для Next.js

## Цель

Доработать `@lite-fsm/persist` и `@lite-fsm/react`, чтобы persist можно было подключать в Next.js App Router без ручного `typeof window` в `makeStore()` и без падения persist-хуков во время server prerender.

Целевой пользовательский код:

```ts
export const makeStore = () => {
  const manager = MachineManager<AppMachines, AppEvents>(machines, {
    middleware: [immerMiddleware, devToolsMiddleware()],
  });

  manager.setDependencies({
    getState: manager.getState,
  });

  const persist = persistManager(manager, {
    storage: createJsonStorage<AppMachines>({
      key: "app:v1",
      storage: () => window.localStorage,
    }),
    machines: ["profile"],
    throttleMs: 300,
  });

  return { manager, persist };
};
```

```tsx
<FSMContextProvider machineManager={store.manager} persist={store.persist}>
  {children}
</FSMContextProvider>
```

## Область работ

Изменить:

- `packages/persist/src/index.ts`;
- `packages/react/src/persistContext.ts`;
- `packages/react/src/FSMProvider.tsx`;
- `tests/persist/persistManager.test.ts`;
- `tests/react/persist.test.tsx`;
- `tests/react/persist.ssr.test.tsx` или другой отдельный node-env SSR test file;
- `tests/types/persist-api.tst.tsx`;
- `apps/playground/app/examples/persist/store/index.ts`;
- `API-CHEATSHEET.md`;
- `TYPES-CHEATSHEET.md`;
- `packages/persist/README.md`;
- `apps/docs/app/packages/persist/page.mdx`;
- `apps/docs/app/persist/page.mdx`;
- `apps/docs/app/api/persist/page.mdx`;
- `apps/docs/app/usage/nextjs/page.mdx`.

Не изменять:

- `PersistStorage` runtime contract;
- `PersistController` runtime contract;
- `persistManager` environment model;
- public export surface;
- docs build pipeline.

## Публичный API

### `createJsonStorage`

`createJsonStorage` должен принимать только ленивый storage factory:

```ts
type JsonStorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

type JsonStorageInput = () => JsonStorageLike;

createJsonStorage<S>({
  key: string,
  storage: JsonStorageInput,
}): PersistStorage<S>;
```

Валидный код:

```ts
createJsonStorage<Store>({
  key: "app:v1",
  storage: () => window.localStorage,
});
```

Невалидный код:

```ts
createJsonStorage<Store>({
  key: "app:v1",
  storage: window.localStorage,
});
```

### Exports

`@lite-fsm/persist` должен экспортировать только:

```ts
createJsonStorage
persistManager
```

`@lite-fsm/persist/react` должен экспортировать только:

```ts
usePersistStatus
useIsPersistRestoring
```

Новые public helpers не добавлять.

## Runtime-требования

### `createJsonStorage`

`createJsonStorage` обязан:

- не вызывать `storage()` во время создания adapter-а;
- вызывать `storage()` при каждом `get()`;
- вызывать `storage()` при каждом `set(record)`;
- вызывать `storage()` при каждом `remove()`;
- не кешировать результат `storage()`;
- не проверять `window`, `globalThis`, `localStorage`, `sessionStorage`;
- не добавлять `subscribe`;
- пробрасывать ошибки из `storage()`, `getItem`, `setItem`, `removeItem`, `JSON.parse`, `JSON.stringify` в существующие error paths.

`get()` должен возвращать:

- `undefined`, если `storage().getItem(key)` вернул `null`;
- parsed `PersistedRecord<S>`, если значение найдено;
- ошибку, если значение невалидный JSON.

`set(record)` должен записывать `JSON.stringify(record)` по `key`.

`remove()` должен вызывать `storage().removeItem(key)`.

### `persistManager`

`persistManager` не должен:

- знать про browser/server environment;
- проверять `typeof window`;
- становиться no-op на сервере;
- менять свои public methods или статусы.

Ошибки lazy storage factory должны обрабатываться как обычные storage errors:

- direct `restore()` reject-ится и вызывает `onError(error, "restore")`;
- background restore из `start()` переводит статус в `{ phase: "error", error }` и вызывает `onError(error, "restore")`;
- direct `save()` reject-ится и вызывает `onError(error, "save")`;
- background save переводит статус в `{ phase: "error", error }` и вызывает `onError(error, "save")`;
- `clear()` reject-ится и вызывает `onError(error, "clear")`.

### `PersistStorage.subscribe`

`PersistStorage` остаётся расширяемым вручную:

```ts
const storage: PersistStorage<Store> = {
  ...createJsonStorage<Store>({
    key: "app:v1",
    storage: () => window.localStorage,
  }),
  subscribe: (cb) => {
    const handle = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      if (event.key !== "app:v1" && event.key !== null) return;
      cb();
    };

    window.addEventListener("storage", handle);
    return () => window.removeEventListener("storage", handle);
  },
};
```

`createJsonStorage` не должен реализовывать этот `subscribe`.

## React SSR-требования

### Provider fallback

`FSMContextProvider` должен предоставлять persist status source `{ phase: "idle" }` только при одновременном выполнении условий:

- render выполняется на сервере;
- `persist` prop строго равен `undefined`.

Требуемое поведение:

```tsx
function Readout() {
  const status = usePersistStatus();
  return <span>{status.phase}</span>;
}

renderToString(
  <FSMContextProvider machineManager={manager}>
    <Readout />
  </FSMContextProvider>,
);
```

Результат: server render завершается без ошибки, HTML содержит `idle`.

### Ошибки, которые нельзя скрывать

`usePersistStatus()` и `useIsPersistRestoring()` без явного controller-а должны продолжать бросать provider error:

- на клиенте, если `FSMContextProvider` не получил status-capable `persist`;
- на сервере, если `persist` передан как plain lifecycle без `getStatus` и `subscribeStatus`;
- на сервере, если `persist` array содержит больше одного status-capable controller;
- вне `FSMContextProvider`.

Сообщение ошибки должно остаться прежним:

```txt
Hooks from @lite-fsm/persist/react require a PersistController argument or FSMContextProvider persist context.
```

### `useIsPersistRestoring`

`useIsPersistRestoring(controller?)` должен остаться точным сокращением:

```ts
usePersistStatus(controller).phase === "restoring"
```

Для UI, который должен скрывать данные до завершения первого restore, документация должна использовать:

```tsx
const status = usePersistStatus();
const loading = status.phase === "idle" || status.phase === "restoring";
```

## Реализация

### `packages/persist/src/index.ts`

Ввести локальные типы:

```ts
type JsonStorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

type JsonStorageSource = () => JsonStorageLike;
```

Сигнатура `createJsonStorage`:

```ts
export const createJsonStorage = <S extends MachineStore>({
  key,
  storage,
}: {
  key: string;
  storage: JsonStorageSource;
}): PersistStorage<S> => ...
```

Каждая операция должна резолвить storage заново:

```ts
const resolveJsonStorage = (source: JsonStorageSource): JsonStorageLike => source();
```

### `packages/react/src/persistContext.ts`

Добавить internal idle status source без импорта типов из `@lite-fsm/persist`.

Расширить `resolvePersistStatusSource`:

```ts
export const resolvePersistStatusSource = (
  persist: FSMPersistLifecycle | ReadonlyArray<FSMPersistLifecycle> | undefined,
  options?: { serverFallback?: boolean },
) => ...
```

Требования:

- `persist === undefined && options?.serverFallback === true` -> idle status source;
- `persist === undefined && options?.serverFallback !== true` -> `null`;
- один status-capable item -> этот item;
- ни одного status-capable item -> `null`;
- больше одного status-capable item -> `null`.

### `packages/react/src/FSMProvider.tsx`

Передать server fallback flag:

```ts
const persistStatusSource = React.useMemo(
  () => resolvePersistStatusSource(persist, { serverFallback: typeof window === "undefined" }),
  [persist],
);
```

Lifecycle effect оставить ref-count compatible:

- `persist === undefined` -> ничего не запускать;
- single persist -> вызвать `start()`;
- persist array -> вызвать `start()` у каждого item;
- cleanup -> вызвать все stop callbacks.

## Тестирование

Все новые названия `describe`, `it`, `test` писать на русском.

### Обязательный coverage

Для изменённой чистой логики требуется 100% coverage по:

- statements;
- branches;
- functions;
- lines.

Области строгого coverage:

- lazy storage path в `createJsonStorage`;
- status source resolution в `packages/react/src/persistContext.ts`;
- server fallback path в `FSMContextProvider`.

100% coverage не заменяет проверку сценариев. Все сценарии из тест-матрицы ниже должны быть покрыты отдельными осмысленными тестами или явно проверены через существующие тесты.

### Тест-матрица `createJsonStorage`

Обновить `tests/persist/persistManager.test.ts`.

Покрыть:

- factory не вызывается при создании adapter-а;
- factory вызывается один раз на каждый `get()`;
- factory вызывается один раз на каждый `set(record)`;
- factory вызывается один раз на каждый `remove()`;
- factory не кешируется между операциями;
- `get()` возвращает `undefined` при `getItem(key) === null`;
- `get()` возвращает parsed record при валидном JSON;
- `get()` пробрасывает ошибку factory;
- `get()` пробрасывает ошибку `getItem`;
- `get()` пробрасывает `JSON.parse` error;
- `set(record)` пишет `JSON.stringify(record)` по ключу;
- `set(record)` пробрасывает ошибку factory;
- `set(record)` пробрасывает `JSON.stringify` error;
- `set(record)` пробрасывает ошибку `setItem`;
- `remove()` вызывает `removeItem(key)`;
- `remove()` пробрасывает ошибку factory;
- `remove()` пробрасывает ошибку `removeItem`;
- `remove()` не падает, если backend не содержит ключ и storage сам это допускает.

### Тест-матрица `persistManager` + lazy storage errors

Обновить `tests/persist/persistManager.test.ts`.

Покрыть:

- direct `restore()` с ошибкой factory reject-ится;
- direct `restore()` вызывает `onError(error, "restore")`;
- background restore из `start()` с ошибкой factory переводит status в `"error"`;
- background restore из `start()` вызывает `onError(error, "restore")`;
- direct `save()` с ошибкой factory reject-ится;
- direct `save()` вызывает `onError(error, "save")`;
- background save с ошибкой factory переводит status в `"error"`;
- background save вызывает `onError(error, "save")`;
- `clear()` с ошибкой factory reject-ится;
- `clear()` вызывает `onError(error, "clear")`.

### Тест-матрица React SSR

Обновить `tests/react/persist.test.tsx` и добавить отдельный node-env SSR test file, например `tests/react/persist.ssr.test.tsx`.

Server fallback tests должны выполняться в окружении без `window`. Не проверять server-only fallback только через `renderToString` внутри jsdom, потому что `typeof window` там остаётся browser-like.

Покрыть:

- `renderToString` внутри `FSMContextProvider` без `persist` позволяет `usePersistStatus()` прочитать `"idle"`;
- `renderToString` внутри `FSMContextProvider` без `persist` позволяет `useIsPersistRestoring()` вернуть `false`;
- `renderToString` с `persistManager` и `createJsonStorage({ storage: () => window.localStorage })`-style lazy factory не вызывает `storage()`;
- `renderToString` с real `PersistController` из `persistManager` позволяет implicit `usePersistStatus()` прочитать `"idle"`;
- client render внутри `FSMContextProvider` без `persist` бросает provider error при `usePersistStatus()`;
- client render внутри `FSMContextProvider` без `persist` бросает provider error при `useIsPersistRestoring()`;
- SSR с plain lifecycle `persist` без status source бросает provider error;
- SSR с двумя status-capable controllers в `persist` array бросает provider error;
- SSR с одним status-capable controller в `persist` array работает;
- explicit controller argument имеет приоритет над provider context;
- смена `persist` prop переподписывает implicit hook на новый status source;
- lifecycle start/stop behavior existing tests остаётся зелёным.

### Type tests

Обновить `tests/types/persist-api.tst.tsx`.

Покрыть:

- export surface `@lite-fsm/persist` равен `"createJsonStorage" | "persistManager"`;
- export surface `@lite-fsm/persist/react` равен `"useIsPersistRestoring" | "usePersistStatus"`;
- `createJsonStorage<Store>({ storage: () => object })` валиден;
- `createJsonStorage<Store>({ storage: object })` отклоняется типами;
- результат `createJsonStorage<Store>(...)` имеет тип `PersistStorage<Store>`;
- `PersistStorage<S>` contract не изменился;
- `PersistController` contract не изменился.

## Документация

Обновить все примеры `createJsonStorage`, чтобы использовать только factory form:

```ts
createJsonStorage<Store>({
  key: "app:v1",
  storage: () => window.localStorage,
});
```

Документация должна явно фиксировать:

- `storage` принимает только функцию;
- функция не вызывается при создании adapter-а;
- функция вызывается при каждом `get`, `set`, `remove`;
- `persistManager` не знает про browser/server environment;
- `FSMContextProvider` запускает persist lifecycle после mount;
- `useIsPersistRestoring()` проверяет только фазу `"restoring"`;
- для blocking UI до завершения первого restore использовать `idle || restoring`;
- `subscribe` добавляется вручную через `PersistStorage`.

Все runtime-примеры в репозитории, включая playground, должны использовать factory form. После изменения не должно остаться вызовов `createJsonStorage({ storage: someStorageObject })` в source, tests или docs, кроме negative type test.

## Проверочные команды

Обязательные команды:

```bash
pnpm exec vitest run tests/persist/persistManager.test.ts tests/react/persist.test.tsx tests/react/persist.ssr.test.tsx --coverage --coverage.include=packages/persist/src/index.ts --coverage.include=packages/react/src/persistContext.ts --coverage.include=packages/react/src/FSMProvider.tsx
pnpm --filter @lite-fsm/persist check-types
pnpm --filter @lite-fsm/react check-types
pnpm run test:types
```

Если выбран другой SSR test filename или coverage CLI не принимает несколько `--coverage.include`, использовать эквивалентную команду Vitest с таргетированным coverage include для изменённых runtime-файлов. Итоговый отчёт должен показывать 100% statements/branches/functions/lines для изменённой логики.

Разрешённая дополнительная package-проверка:

```bash
pnpm run build:packages
```

Запрещённые команды:

```bash
pnpm run build
pnpm --filter @lite-fsm/docs build
pnpm run docs:build
pnpm run pages:build
pnpm run pages:build:fast
next build
```

## Acceptance criteria

- `makeStore()` в Next-style коде создаёт `manager` и `persist` без `typeof window`.
- `createJsonStorage({ storage: () => window.localStorage })` не читает `window` при создании adapter-а.
- `renderToString` с `FSMContextProvider persist={persist}` не запускает lazy storage factory.
- `createJsonStorage({ storage: window.localStorage })` отклоняется типами.
- `createJsonStorage` не кеширует storage factory result.
- `persistManager` не содержит browser/server checks.
- `FSMContextProvider` без `persist` даёт server-only idle status source.
- Клиентский render без status-capable persist продолжает бросать provider error.
- Plain lifecycle persist не создаёт status context.
- Multiple status-capable controllers не выбираются неявно.
- `useIsPersistRestoring()` остаётся `phase === "restoring"`.
- Public export surface не изменился.
- Документация и cheatsheets обновлены.
- Все тесты из обязательной тест-матрицы реализованы.
- Изменённая логика имеет 100% statements/branches/functions/lines coverage.
- Обязательные проверочные команды проходят.
