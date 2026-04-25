# SSR demo · архитектура и флоу данных

Пример показывает, как с `lite-fsm` устроена гидрация **двух разных типов store** в Next.js App Router:

- `profileSession` — **long-lived** app-session store, seed один раз в корневом `layout`.
- `widgetFeed` — **cache-like** per-widget store, seed на каждый widget при рендере route.

Оба живут в одном `MachineManager`.

## Слои приложения

```
app/
  layout.tsx                         ← server, loadDemoProfile()
    StoreProvider                    ← client, создаёт MachineManager через useRef
      StoreSeedInitialize            ← client, применяет profileSession seed

  ssr-demo/
    layout.tsx                       ← server, рисует SSRDemoTopBar
    page.tsx                         ← server, index со ссылками на routes
    featured/page.tsx                ← server, <SSRDemoScreen screen=... />
    night/page.tsx                   ← server, <SSRDemoScreen screen=... />
    _components/
      SSRDemoTopBar                  ← client, useSelector(profileSession)
      SSRDemoScreen                  ← server, grid + Suspense per widget
      SSRDemoWidgetLoader            ← async server, loadWidgetSeed(widget)
        SSRDemoWidgetInitialize      ← client bridge, INITIAL_WIDGET_FEED_DATA
          SSRDemoWidget              ← client, contentType dispatcher + view

src/store/
  index.ts                           ← makeStore() + MachineManager
  initial-seeds.ts                   ← applyStoreInitialSeeds(store, seeds)
  machines/profileSession.ts         ← long-lived store
  machines/widgetFeed.ts             ← cache-like store + LOADING effect
```

## Где живёт `MachineManager`

Важный нюанс: `"use client"` в Next.js App Router не значит «не работает на сервере». Клиентские компоненты **тоже рендерятся на сервере** при SSR, чтобы отдать initial HTML. Разница в том, что выполняется, а что — нет:

| Код                                          | SSR (server render of client tree) | Client hydration |
| -------------------------------------------- | ---------------------------------- | ---------------- |
| render body (в т.ч. `useRef`, `useContext`)  | ✅ выполняется                      | ✅ выполняется    |
| `useEffect` / `useLayoutEffect`              | ❌ не выполняется                   | ✅ выполняется    |

Оба bridge-компонента (`StoreSeedInitialize` и `SSRDemoWidgetInitialize`) применяют seed **в render**, а не в effect. Поэтому и `profileSession`, и `widgetFeed` заполнены уже на сервере до того, как отрисуется потребитель:

| Runtime       | Manager                                             | Что видно в store                                                                           |
| ------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Server render | новый на каждый server-render (через `useRef`)      | оба канала гидрированы, initial HTML `TopBar` и `FeedWidget` берёт из store                 |
| Client        | один на сессию, `useRef` в `StoreProvider`          | после hydration оба канала заполнены, manager переживает route navigation                   |

Сервер и клиент **не делят** один manager через RSC — на каждый server render создаётся свой экземпляр. Данные из server-only fetch попадают в client tree как `props` (RSC payload) и гидрируются через client-boundary компоненты `StoreSeedInitialize` / `SSRDemoWidgetInitialize`.

## Флоу данных при заходе на `/ssr-demo/featured`

### 1. Server render (Next)

Server components + SSR of client tree выполняются в одном проходе. Manager на сервере создаётся и частично заполняется:

1. `app/layout.tsx` — server: `await loadDemoProfile()` → `DemoProfile`.
2. `StoreProvider` — client, **рендерится и на сервере тоже**: `useRef` создаёт новый `MachineManager` для этого запроса.
3. `StoreSeedInitialize` — client, в render вызывает `applyStoreInitialSeeds(manager, { profileSession })` → `INITIAL_PROFILE_SESSION`. Это происходит **и на сервере**, поэтому `profileSession` в store уже заполнен до рендера детей.
4. `app/ssr-demo/layout.tsx` — server: в дерево попадает `<SSRDemoTopBar />`. Он тоже отрендерится при SSR и через `useSelector(...)` прочитает `profile` **из server-side store** → имя профиля попадает в initial HTML.
5. `app/ssr-demo/featured/page.tsx` — server: `<SSRDemoScreen screen=... />`.
6. `SSRDemoScreen` — server: для каждого widget оборачивает в `<Suspense fallback=.../>` и рендерит `<SSRDemoWidgetLoader widget=... />` (async server).
7. `SSRDemoWidgetLoader` — async server: `await loadWidgetSeed(widget)` → `WidgetSeed`. Отдаёт `<SSRDemoWidgetInitialize seed=...><SSRDemoWidget /></>`; seed кладётся в RSC payload как props клиентских компонентов.
8. `SSRDemoWidgetInitialize` — client, в render проверяет `state.widgetFeed.context.feeds[feedId]` и делает `transition(INITIAL_WIDGET_FEED_DATA)`, если entry нет. Это **тоже выполняется при SSR**, поэтому entry появляется в server-side store до рендера детей.
9. `SSRDemoWidget` / `FeedWidget` через `useSelector(selectWidgetFeedEntry(request))` читает entry **из server-side store** и отдаёт полноценный HTML со списком.
10. Сервер стримит HTML и RSC payload клиенту.

### 2. Client hydration

11. React выполняет client hydration. `StoreProvider` создаёт **новый** client-side `MachineManager` (server-side manager умер вместе с запросом).
12. `StoreSeedInitialize` в render снова вызывает `applyStoreInitialSeeds(manager, { profileSession })` — markup совпадает с SSR, mismatch'а нет.
13. `SSRDemoWidgetInitialize` в render снова делает `transition(INITIAL_WIDGET_FEED_DATA)` для своего `feedId` в client store.
14. `FeedWidget` через `useSelector(selectWidgetFeedEntry(request))` читает entry из client store и рисует тот же список.

### 3. Client interaction

15. Кнопка «Загрузить ещё» → `transition({ type: "FETCH_WIDGET_FEED", payload: request })` → переход в state `LOADING`.
16. Effect в `LOADING`: `fetchWidgetPage(request, { offset: nextOffset })` → `transition({ type: "WIDGET_FEED_FETCH_RESOLVED", payload: { request, page } })` → state `READY`, новая страница в `entry.pages`.
17. `useSelector` пере-рендерит виджет.

### 4. Client navigation на `/ssr-demo/night`

18. Root `layout.tsx` **не** перерендеривается, `StoreProvider` и client manager **те же**.
19. `SSRDemoScreen` приходит с другим widget, `SSRDemoWidgetLoader` грузит новый seed на сервере.
20. `SSRDemoWidgetInitialize` в render видит, что для нового `feedId` entry нет, и гидрирует в **тот же client manager**.
21. `profileSession` уже в store, `StoreSeedInitialize` проверяет `id` и ничего не делает.

## Две модели гидрации на одном manager

|                          | `profileSession` (long-lived)     | `widgetFeed` (cache-like)                       |
| ------------------------ | --------------------------------- | ----------------------------------------------- |
| Где грузится seed        | root `app/layout.tsx`             | `SSRDemoWidgetLoader` (async server per widget) |
| Событие hydration        | `INITIAL_PROFILE_SESSION`         | `INITIAL_WIDGET_FEED_DATA`                      |
| Где применяется в коде   | `StoreSeedInitialize` (client)    | `SSRDemoWidgetInitialize` (client)              |
| Фаза применения          | в render (sync)                   | в render (sync)                                 |
| Видно в initial SSR HTML | ✅ да, `TopBar` рисуется из store  | ✅ да, `FeedWidget` рисуется из store            |
| Частота                  | один раз на сессию                | на каждый widget / route                        |
| Идемпотентность          | по `profile.id`                   | по `feedId` в `state.widgetFeed.context.feeds`  |
| Что дальше на client     | ничего, профиль не меняется       | `FETCH_WIDGET_FEED` → pagination через effect   |

## Что в примере специально «кривовато»

Гидрация формально работает и на сервере, и на клиенте, но держится на **ручных bridge-компонентах в каждом виджете**:

- `SSRDemoWidgetInitialize` — client-компонент, вызывающий `manager.transition(...)` прямо в render, с проверкой «а не гидрирован ли уже этот feedId».
- На каждый новый route/widget приходится заводить такую же обёртку и руками писать `INITIAL_*_DATA` событие в домен-машине.
- Нет стандартного API ни для партиальной гидрации по ключам, ни для стратегий `merge` / `replace` при client navigation.

Это именно тот паттерн, который по плану [`snapshot-ssr-hydration`](../../../.cursor/plans/snapshot-ssr-hydration_b8a87565.plan.md) будет заменён на `FSMHydrationBoundary` + `manager.hydrate(snapshot, { strategy })`: синхронная повторяемая partial hydration существующего manager **в render** через общий core API, без ручного bridge-компонента и без доменного `INITIAL_*_DATA` события в каждой cache-like машине.
