# Hydration / RSC / Persist Race Cases

Рабочий чеклист сценариев, которые важно держать в голове при развитии `lite-fsm/react` и будущего persist API.

## Термины

| Термин | Смысл |
| --- | --- |
| `getSnapshot` | Live state manager-а после hydration и в обычной клиентской жизни. |
| `getServerSnapshot` | Frozen state, по которому был построен server HTML. Используется React во время SSR/hydration. |
| `FSMHydrationBoundary` render overlay | Preview snapshot для первого render-а subtree и client navigation. |
| `FSMHydrationBoundary` server overlay | Snapshot для SSR/hydration descendants; должен жить даже после layout-effect commit. |
| Persist restore | Восстановление из `localStorage` / `sessionStorage` / `IndexedDB` / custom storage. Может быть sync или async. |

## Базовое правило

Первый client render во время hydration должен совпасть с server HTML.

```txt
server HTML state == hydration render state
```

После hydration React может прочитать live state и сделать обычный update.

```txt
hydration render -> getServerSnapshot
after hydration  -> getSnapshot
```

## Сценарии

### 1. Первый вход / hard reload

Сервер уже отдал HTML, React на клиенте приклеивается к существующей DOM.

Риск:

```txt
server HTML: old/empty state
client live manager: restored/new state
hydration render: restored/new state
=> hydration mismatch
```

Решение:

- `useSelector` должен передавать React стабильный `getServerSnapshot`.
- `getServerSnapshot` должен возвращать состояние, соответствующее server HTML.
- Live update разрешён только после hydration.

### 2. Streaming / Suspense при первом входе

Provider может гидрироваться раньше, а delayed RSC/Suspense subtree позже.

Риск:

```txt
0s: server HTML для subtree построен по state A
0s: Provider уже живёт на клиенте
2s: live manager перешёл в state B
5s: delayed subtree гидрируется
=> subtree не должен читать live B во время hydration
```

Решение:

- Для app shell: Provider `getServerSnapshot`.
- Для segment/page subtree: `FSMHydrationBoundary` server overlay.
- Boundary server overlay должен оставаться доступным delayed descendants даже после layout-effect commit.

### 3. Клиентская навигация

React уже владеет DOM. Next получает RSC payload и React сам обновляет дерево.

Обычно hydration mismatch здесь нет, потому что нет чужого HTML, к которому React приклеивается.

Риск другой:

```txt
new page first render читает старый/пустой global manager
server data применяются позже
=> flicker / stale UI / неправильный порядок snapshot-ов
```

Решение:

- Для route/segment data использовать `FSMHydrationBoundary`.
- `useEffect` hydration допустим только если первый пустой render приемлем.
- `getServerSnapshot` сам по себе client navigation не чинит.

### 4. Root Provider + данные ниже по дереву

Типичная архитектура:

```tsx
<RootLayout>
  <FSMContextProvider>
    <ServerComponentThatLoadsData>
      <ClientInitializer />
      <Page />
    </ServerComponentThatLoadsData>
  </FSMContextProvider>
</RootLayout>
```

Риск:

- Provider default `getServerSnapshot` фиксирует state слишком рано.
- Render-phase `transition()` ниже Provider-а может не попасть в server snapshot Provider-а.

Решение:

- App-shell данные, известные на уровне Provider-а, класть в manager до `<FSMContextProvider>`.
- Route/segment данные ниже Provider-а передавать через `FSMHydrationBoundary`.
- Не полагаться на render-phase `transition()` ниже Provider-а как на SSR-safe contract.

### 5. Pre-initialized manager

Данные известны до Provider render-а:

```tsx
if (storeRef.current === null) {
  storeRef.current = makeStore();
  storeRef.current.transition({ type: "INITIAL_PROFILE_SESSION", payload: profile });
}

return <FSMContextProvider machineManager={storeRef.current}>{children}</FSMContextProvider>;
```

Это корректно.

Правило:

- Provider default snapshot должен фиксировать уже подготовленный manager state.
- Если live manager изменится до delayed hydration, descendants всё равно должны видеть pre-initialized server snapshot.

### 6. Custom `getServerSnapshot`

Нужен, когда Provider получает manager и server state раздельно.

```tsx
<FSMContextProvider
  machineManager={manager}
  getServerSnapshot={() => serverState}
/>
```

Правила:

- Возвращает `MachinesState<S>`, не `MachineManagerSnapshot<S>`.
- Должен быть stable/cached для hydration pass.
- Имеет приоритет над Provider default initial snapshot.

### 7. `FSMHydrationBoundary`

Использовать, когда snapshot должен быть виден subtree уже на первом render-е.

```tsx
<FSMHydrationBoundary snapshot={serverSnapshot}>
  <Page />
</FSMHydrationBoundary>
```

Что обязан делать boundary:

- Render overlay: `useSelector` видит preview snapshot до layout-effect commit.
- Server overlay: hydration descendants видят snapshot, соответствующий server HTML.
- Server overlay живёт пока boundary смонтирован, даже если render overlay уже исчез.
- После layout-effect commit live manager получает snapshot.

### 8. Nested boundaries

Пример:

```tsx
<FSMHydrationBoundary snapshot={gridSnapshot}>
  <FSMHydrationBoundary snapshot={widgetSnapshot}>
    <Widget />
  </FSMHydrationBoundary>
</FSMHydrationBoundary>
```

Правила:

- Child preview считается поверх parent preview.
- Child server snapshot считается поверх parent server snapshot.
- Не вкладывать boundaries с разными snapshot на один и тот же machine key, если порядок commit-а важен.

### 9. Sibling boundaries с одним machine key

Пример:

```tsx
<FSMHydrationBoundary snapshot={freshWidgetSnapshot}>
  <Widget id="fresh" />
</FSMHydrationBoundary>
<FSMHydrationBoundary snapshot={slowWidgetSnapshot}>
  <Widget id="slow" />
</FSMHydrationBoundary>
```

Риск:

- Оба snapshot пишут в один machine key, например `entityList`.
- Default `merge` сливает верхний уровень `machines`, но не знает как deep-merge-ить `context.lists`.
- Второй widget snapshot может заменить весь `entityList.context.lists` и стереть первый widget.
- Стертый widget увидит empty live state, покажет второй skeleton и запустит client fetch.

Решение:

- Для record/map-like context добавлять machine `hydrate` hook.
- `hydrate` hook должен merge-ить элементы по id/key и сохранять уже применённые sibling snapshots.
- Достаточно shallow identity guard: если те же entry-ссылки уже лежат в state, вернуть `prev`.
- Если нужен replace-mode, явно учитывать `meta.strategy`.

### 10. `useManager().getState()` в render

Это live read.

Риск:

- Обходит `useSyncExternalStore`.
- Не использует `getServerSnapshot`.
- Не видит boundary overlays.
- Может вернуть live state во время hydration и сломать SSR contract.

Правило:

- SSR-safe чтение в render делать через `useSelector`.
- `useManager().getState()` использовать в handlers/effects/debug или там, где live read осознанно нужен.

### 11. `useEffect` hydration

Пример:

```tsx
useEffect(() => {
  manager.hydrate(snapshot);
}, [manager, snapshot]);
```

Поведение:

- На client navigation hydration error не будет.
- Первый render будет пустой/старый.
- После effect будет update.

Риск:

- На первом входе может быть mismatch, если server HTML уже содержал данные.
- Даёт flicker.

Использовать только если late update приемлем.

### 12. Persist из browser storage

Сервер не знает `localStorage` / `sessionStorage` / `IndexedDB`.

Риск:

```txt
server HTML: neutral state
client restore: persisted state
hydration render читает persisted state
=> mismatch
```

Решения:

- Во время hydration показывать server/neutral state, persisted state применять после hydration.
- Для async restore иметь `isRestoring` / gate / restore policy.
- Для UI, который должен сразу показывать browser-only state, использовать client-only island.
- Если состояние нужно в server HTML, хранить его в server-readable source: cookie, server DB, RSC payload.

### 13. Async storage restore

Например IndexedDB.

Риск:

```txt
restore завершился до delayed RSC hydration
live manager уже содержит persisted state
delayed subtree должен всё равно гидрироваться по server snapshot
```

Решение:

- Provider/boundary server overlays защищают hydration.
- Persist layer должен уметь отложить apply или явно помечать `isRestoring`.
- Merge policy должна быть осознанной: server snapshot vs persisted snapshot.

### 14. Client-only island

Подходит для browser-only состояния, которое сервер не может знать.

Примеры:

- download status из IndexedDB;
- media query / viewport;
- local-only draft;
- offline queue.

Поведение:

- Нет server HTML для этого subtree.
- Нет hydration mismatch для этого subtree.
- Есть отдельный loading/empty UX.

### 15. Server-readable persisted state

Если persisted state должен быть в первом HTML, источник должен быть доступен серверу.

Подходы:

- cookie;
- server DB;
- request-bound cache;
- RSC payload;
- embedded snapshot.

Тогда snapshot можно передать в Provider или Boundary.

### 16. Actor snapshots

Те же правила применимы к actor templates с `persistence: "snapshot"`.

Важно:

- Runtime actors без snapshot persistence остаются skip-by-design.
- Snapshot actors должны восстанавливаться через `FSMHydrationBoundary` / manager `hydrate`.
- Server overlay должен показывать actor snapshot до commit-а, если subtree рендерит actor state.

## Что тестировать

Минимальный набор regression-сценариев:

- Provider default server snapshot при delayed hydration.
- Provider custom `getServerSnapshot`.
- Pre-initialized manager до Provider render.
- Boundary first `hydrateRoot` render читает boundary server snapshot.
- Boundary delayed descendant после layout-effect commit и live race.
- Nested boundaries: first hydrate render и delayed race.
- Sibling boundaries с одним machine key и custom `hydrate` merge по id/key.
- Client navigation: boundary render overlay виден на первом render-е.
- Raw `FSMContext.Provider` fallback без server snapshot context.
- `useManager().getState()` не считать SSR-safe render API.
- Persist restore: sync/async restore не должен участвовать в hydration render server-rendered subtree.

## Правило выбора API

| Задача | API |
| --- | --- |
| Глобальный app shell state известен до Provider-а | Подготовить manager до `FSMContextProvider`. |
| Нужно явно передать state, соответствующий server HTML | `FSMContextProvider getServerSnapshot`. |
| Route/segment data загружены ниже root layout-а | `FSMHydrationBoundary`. |
| Только применить snapshot после mount | `useHydrateSnapshot`. |
| Browser-only persisted state | Persist restore gate или client-only island. |
| SSR-safe render read | `useSelector`. |
| Live imperative read | `useManager().getState()`. |

## Будущий persist API: вопросы

- Когда restore должен стартовать: при создании manager-а, в Provider-е, вручную?
- Должен ли restore блокировать subtree (`PersistGate`) или только выставлять `isRestoring`?
- Как задавать precedence: server snapshot важнее persisted или persisted важнее server?
- Как merge-ить persisted snapshot с route snapshot?
- Как throttling/debounce save работает с `@@lite-fsm/HYDRATE`?
- Как мигрировать schema/version?
- Как исключать machines из persist?
- Как обрабатывать async storage failure?
- Как синхронизировать multi-tab?
