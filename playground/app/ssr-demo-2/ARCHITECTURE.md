# SSR demo 2 · manifest-first streaming

`ssr-demo-2` показывает тот же класс ручной render-phase hydration, что и `ssr-demo`, но меняет форму данных:

- `ssrDemo2Grid` хранит только manifest grid-слотов: порядок, `nextCursor`, `hasNext` и статус догрузки страницы.
- `entityList` хранит cursor-based данные каждого widget как unified domain cache.
- Сервер отдаёт первую страницу manifest и запускает отдельный `Suspense` на каждый widget seed.
- Клиент догружает следующие grid-страницы через `FETCH_GRID_PAGE`, а каждый новый slot сам запускает свой `FETCH_ENTITY_LIST`.

## Flow

1. Route вызывает `loadGridPage(screenId)` и получает только `GridPage`.
2. `SSRDemo2GridInitialize` в render кладёт manifest в `ssrDemo2Grid` через `INITIAL_GRID_PAGE_DATA`.
3. Для каждого item первой страницы `SSRDemo2WidgetSeedLoader` отдельно вызывает `loadWidgetSeed(item)`.
4. `SSRDemo2WidgetInitialize` в render кладёт seed в `entityList` через `INITIAL_ENTITY_LIST_DATA`.
5. `SSRDemo2WidgetSlot` читает `entityList`; если entry отсутствует у client-appended slot, он запускает `FETCH_ENTITY_LIST`.
6. `SSRDemo2GridAppend` добавляет новые manifest items через `FETCH_GRID_PAGE` и дизейблит кнопку при `grid.status === "loading"` или `!grid.hasNext`.

## Почему не ScreenChunk

Demo сознательно не собирает `ScreenChunk(grid + all widgets)`. Такой chunk блокировал бы весь initial render самым медленным widget. Здесь каждый widget seed живёт под своей `Suspense`-границей: медленный widget не задерживает соседей.

## SSR-first и client append

В Next.js App Router нет публичного API, который позволял бы после client interaction «достримить» новые server components в уже отрисованное дерево. Поэтому SSR-first items и client-appended items производятся разными путями, но читаются одним consumer-контрактом: `SSRDemo2WidgetSlot` + `entityList`.

## Cursor boundaries

У grid и у каждого widget свой курсор:

- grid cursor хранится в `ssrDemo2Grid.context.screens[screenId].nextCursor`;
- widget cursor хранится в последней странице `entityList.context.lists[listId].pages`;
- `FETCH_GRID_PAGE` не тянет widget data batch-ом, а только добавляет manifest items;
- каждый новый manifest item запускает отдельный `FETCH_ENTITY_LIST`.

## Demo 3

Этот пример специально остаётся на текущем публичном API `lite-fsm`: bridge-компоненты вызывают `manager.transition(...)` прямо в render и используют доменные события `INITIAL_*`. Следующий пример, `ssr-demo-3`, должен показать тот же UX на `FSMHydrationBoundary` и slice-based snapshot после появления этого API.
