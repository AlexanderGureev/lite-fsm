# Machine Patterns

Канонические шаблоны для одного machine. Адаптируй имена, payload и deps под проект.

## Domain machine

```ts
import type { FSMEvent } from "@lite-fsm/core";
import { createMachine } from "../create-machine";

export type Events =
  | FSMEvent<"MESSAGE_SENT", { message: { id: string; text: string; sentAt: number } }>
  | FSMEvent<"HISTORY_CLEARED", { clearedAt: number }>;

const initialContext: { messages: Array<{ id: string; text: string; sentAt: number }>; updatedAt: number | null } = {
  messages: [],
  updatedAt: null,
};

export const chatThread = createMachine({
  config: {
    EMPTY: { MESSAGE_SENT: "ACTIVE", HISTORY_CLEARED: null },
    ACTIVE: { MESSAGE_SENT: null, HISTORY_CLEARED: "EMPTY" },
  },
  initialState: "EMPTY",
  initialContext,
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "MESSAGE_SENT":
        state.context.messages.push(action.payload.message);
        state.context.updatedAt = action.payload.message.sentAt;
        return;
      case "HISTORY_CLEARED":
        state.context.messages = [];
        state.context.updatedAt = action.payload.clearedAt;
        return;
    }
  },
});
```

## Process machine with `latest` effect

```ts
import type { FSMEvent } from "@lite-fsm/core";
import { createConfig, createEffect, createMachine } from "../create-machine";

type Request = { key: string };
type Page = { items: string[] };

export type Events =
  | FSMEvent<"FETCH_ITEMS", Request>
  | FSMEvent<"FETCH_ITEMS_RESOLVED", { request: Request; page: Page }>
  | FSMEvent<"FETCH_ITEMS_REJECTED", { request: Request; error: { message: string } }>;

const initialContext: { lists: Record<string, { status: "idle" | "loading" | "error"; pages: Page[]; error?: string }> } = {
  lists: {},
};

const config = createConfig({
  READY: { FETCH_ITEMS: "FETCH_ITEMS_PENDING" },
  FETCH_ITEMS_PENDING: { FETCH_ITEMS_RESOLVED: "READY", FETCH_ITEMS_REJECTED: "READY" },
});

const fetchItems = createEffect<typeof config, "FETCH_ITEMS_PENDING">({
  type: "latest",
  effect: async ({ action, api, transition }) => {
    try {
      const page = await api.loadItems(action.payload);
      transition({ type: "FETCH_ITEMS_RESOLVED", payload: { request: action.payload, page } });
    } catch (error) {
      transition({
        type: "FETCH_ITEMS_REJECTED",
        payload: { request: action.payload, error: { message: error instanceof Error ? error.message : String(error) } },
      });
    }
  },
});

export const itemList = createMachine({
  config,
  initialState: "READY",
  initialContext,
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "FETCH_ITEMS":
        state.context.lists[action.payload.key] = { status: "loading", pages: [] };
        return;
      case "FETCH_ITEMS_RESOLVED": {
        const entry = state.context.lists[action.payload.request.key];
        if (!entry) return;
        entry.pages.push(action.payload.page);
        entry.status = "idle";
        return;
      }
      case "FETCH_ITEMS_REJECTED":
        if (!state.context.lists[action.payload.request.key]) return;
        state.context.lists[action.payload.request.key].status = "error";
        state.context.lists[action.payload.request.key].error = action.payload.error.message;
        return;
    }
  },
  effects: {
    FETCH_ITEMS_PENDING: fetchItems,
  },
});
```

## Guard-through-reducer

Используй `null`, когда событие принимается, но target state зависит от payload или context.

```ts
export const checkout = createMachine({
  config: {
    READY: { SUBMIT_ORDER: null },
    SUBMIT_ORDER_PENDING: { SUBMIT_ORDER_RESOLVED: "DONE", SUBMIT_ORDER_REJECTED: "READY" },
    DONE: {},
  },
  initialState: "READY",
  initialContext: { error: null as string | null },
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "SUBMIT_ORDER":
        state.state = action.payload.items.length > 0 ? "SUBMIT_ORDER_PENDING" : "READY";
        state.context.error = action.payload.items.length > 0 ? null : "Order is empty";
        return;
    }
  },
});
```

## Observer machine

Observer слушает доменные события и выполняет side effect: аналитика, логирование, метрики. Не меняет бизнес-состояние и не отправляет доменные события.

Подписка через `"*"` уместна, когда машина — наблюдатель: ей нужны все committed events для switch по типу.

```ts
import type { FSMEvent } from "@lite-fsm/core";
import { createMachine } from "../create-machine";

export type Events = FSMEvent<never>;

export const analytics = createMachine({
  config: {
    IDLE: {
      LOGIN_SUBMIT_RESOLVED: null,
      LOGIN_SUBMIT_REJECTED: null,
      LOGOUT: null,
    },
  },
  initialState: "IDLE",
  initialContext: {},
  reducer: (state, _action, { nextState }) => {
    state.state = nextState;
  },
  effects: {
    "*": ({ action, analytics }) => {
      switch (action.type) {
        case "LOGIN_SUBMIT_RESOLVED":
          analytics.track("login_success", { userId: action.payload.user.id });
          return;
        case "LOGIN_SUBMIT_REJECTED":
          analytics.track("login_failure", { reason: action.payload.error });
          return;
        case "LOGOUT":
          analytics.track("logout");
          return;
      }
    },
  },
});
```

`"*"` effect получает каждое event, принятое `config`. Перечисляй события в `config` явно: список становится контрактом того, что машина наблюдает.

Если observer накапливает много несвязанных кейсов в одном `switch`, разбей его на несколько узких machines по типам событий (например, отдельная machine на каждое аналитическое событие). Каждая узкая machine остается observer'ом, но имеет одну причину измениться.

## Error catcher

Один владелец сбора ошибок: принимает разнообразные `*_REJECTED` события, сохраняет последнюю ошибку и репортит ее во внешний сервис.

```ts
import type { FSMEvent } from "@lite-fsm/core";
import { createMachine } from "../create-machine";

export type Events = FSMEvent<"ERROR_REPORTED">;

type Context = { lastError: string | null };

const initialContext: Context = { lastError: null };

export const errors = createMachine({
  config: {
    IDLE: {
      LOGIN_SUBMIT_REJECTED: "REPORT_PENDING",
      FETCH_PROFILE_REJECTED: "REPORT_PENDING",
      FETCH_ITEMS_REJECTED: "REPORT_PENDING",
    },
    REPORT_PENDING: { ERROR_REPORTED: "IDLE" },
  },
  initialState: "IDLE",
  initialContext,
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "LOGIN_SUBMIT_REJECTED":
      case "FETCH_PROFILE_REJECTED":
      case "FETCH_ITEMS_REJECTED":
        state.context.lastError = action.payload.error;
        return;
    }
  },
  effects: {
    REPORT_PENDING: ({ action, errorReporter, transition }) => {
      errorReporter.report(action.payload.error);
      transition({ type: "ERROR_REPORTED" });
    },
  },
});
```

Catcher не исправляет чужой state и не дублирует доменную реакцию. Если ошибка должна вернуть процесс в `IDLE`, это уже сделал владелец процесса в своем reducer. Catcher отвечает только за внешнюю репортинг-логику.

## View modal machine

Модалка владеет только своей видимостью и локальным payload, нужным для отображения. Бизнес-логику (создание плейлиста, логин, подписка) держит соответствующая process-машина; модалка реагирует на ее доменные события.

Базовая форма — два state, `CLOSED ↔ VISIBLE`:

```ts
export const regModal = createMachine({
  config: {
    CLOSED: { OPEN_REG_MODAL: "VISIBLE" },
    VISIBLE: {
      CLOSE_REG_MODAL: "CLOSED",
      OPEN_IAM_LOGIN_MODAL: "CLOSED",
    },
  },
  initialState: "CLOSED",
  initialContext: {},
  reducer: (state, _action, { nextState }) => {
    state.state = nextState;
  },
});
```

`VISIBLE → CLOSED` по чужому `OPEN_IAM_LOGIN_MODAL` — это handoff между модалками через события, без прямого вызова "открыть другую модалку".

Если модалке нужен payload (track id, ошибка, режим), храни его в context и сбрасывай при закрытии:

```ts
export const createPlaylistModal = createMachine({
  config: {
    CLOSED: { OPEN_CREATE_PLAYLIST_MODAL: "VISIBLE" },
    VISIBLE: {
      CLOSE_CREATE_PLAYLIST_MODAL: "CLOSED",
      CREATE_PLAYLIST_RESOLVED: "CLOSED",
      CREATE_PLAYLIST_REJECTED: "CLOSED",
    },
  },
  initialState: "CLOSED",
  initialContext: { trackId: undefined as number | undefined },
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "OPEN_CREATE_PLAYLIST_MODAL":
        state.context.trackId = action.payload.trackId;
        return;
      case "CLOSE_CREATE_PLAYLIST_MODAL":
      case "CREATE_PLAYLIST_RESOLVED":
      case "CREATE_PLAYLIST_REJECTED":
        state.context.trackId = undefined;
        return;
    }
  },
});
```

Модалка закрывается по `*_RESOLVED`/`*_REJECTED` владельца процесса. Сама она не отправляет финальное доменное событие — это делает форма внутри UI через `transition({ type: "CREATE_PLAYLIST", payload: {...} })`, а реакция на результат уже централизована в config.

Если открытие условное (feature flag, whitelist, "уже показывали"), вводи gate-state. Триггер переводит в gate, effect решает и эмитит `*_RESOLVED`/`*_REJECTED`:

```ts
export const pwaModal = createMachine({
  config: {
    "*": { CHECK_PWA_RESOLVED: "CHECK_ACTIVE" },
    CHECK_ACTIVE: {
      CHECK_ACTIVE_RESOLVED: "VISIBLE",
      CHECK_ACTIVE_REJECTED: "CLOSED",
    },
    VISIBLE: { CLOSE_PWA_MODAL: "CLOSED" },
    CLOSED: { OPEN_PWA_MODAL: "VISIBLE" },
  },
  initialState: "CLOSED",
  initialContext: {},
  reducer: (state, _action, { nextState }) => {
    state.state = nextState;
  },
  effects: {
    CHECK_ACTIVE: ({ getState, storage, transition }) => {
      const { isInstallAvailable } = getState().pwa.context;
      const alreadyShown = storage.getItem("pwa-modal-shown");
      const allowed = isInstallAvailable && !alreadyShown;
      transition({ type: allowed ? "CHECK_ACTIVE_RESOLVED" : "CHECK_ACTIVE_REJECTED" });
    },
    CLOSED: ({ action, storage }) => {
      if (action.type === "CLOSE_PWA_MODAL") storage.setItem("pwa-modal-shown", true);
    },
  },
});
```

Один-shot side effect ("запомнить, что показали") — единственное место, где модалка трогает внешний мир, и только относительно собственной видимости.

## Command machine

Кнопка-машина — это headless command, который собирает данные, нормализует ошибку и превращает UI-intent в одно или несколько доменных событий. Hover/pressed/disabled остаются в UI; машина владеет короткой orchestration-цепочкой.

Базовая форма — `IDLE → *_PROCESSING → IDLE`:

```ts
export const addToQueueButton = createMachine({
  config: {
    IDLE: {
      ADD_TO_QUEUE_CLICK: "ADD_TO_QUEUE_CLICK_PROCESSING",
      QUEUE_SET_NEXT_CLICK: "ADD_TO_QUEUE_CLICK_PROCESSING",
    },
    ADD_TO_QUEUE_CLICK_PROCESSING: {
      ADD_TO_QUEUE_CLICK_RESOLVED: "IDLE",
      ADD_TO_QUEUE_CLICK_REJECTED: "IDLE",
    },
  },
  initialState: "IDLE",
  initialContext: {},
  reducer: (state, _action, { nextState }) => {
    state.state = nextState;
  },
  effects: {
    ADD_TO_QUEUE_CLICK_PROCESSING: ({ action, getState, transition }) => {
      try {
        const target = action.type === "ADD_TO_QUEUE_CLICK" ? "ADD_TO_QUEUE" : "QUEUE_SET_NEXT";
        const tracks = resolveTracks(action.payload, getState());
        transition({ type: target, payload: { tracks } });
        transition({ type: "ADD_TO_QUEUE_CLICK_RESOLVED" });
      } catch {
        transition({ type: "ADD_TO_QUEUE_CLICK_REJECTED" });
      }
    },
  },
});
```

`*_PROCESSING` блокирует повторные клики, гарантирует одно событие за раз и даёт UI явный busy-state. Терминалом может быть собственный `*_RESOLVED` или доменное событие, которое и так означает завершение (`CHANGE_TRACK`, `PLAYBACK_TOGGLE`) — тогда оно прописано как exit из `*_PROCESSING`.

Подвид — gate-кнопка: машина не обрабатывает клик, а вычисляет доступность CTA на маунте и навигации:

```ts
export const goAppButton = createMachine({
  config: {
    "*": { NAVIGATION_SUCCESS: "GO_APP_INIT" },
    IDLE: { DO_INIT: "GO_APP_INIT" },
    GO_APP_INIT: {
      GO_APP_INIT_RESOLVED: "READY",
      GO_APP_INIT_REJECTED: "DISABLED",
    },
    READY: { GO_APP_INIT_RESOLVED: "READY" },
    DISABLED: {},
  },
  initialState: "IDLE",
  initialContext: { store: "google" as "google" | "apple" | "huawei" },
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    if (action.type === "GO_APP_INIT_RESOLVED") {
      state.context.store = action.payload;
    }
  },
  effects: {
    GO_APP_INIT: ({ browser, getState, transition }) => {
      const allowed = isWhitelistedRoute(browser.pathname()) && getState().features.context.data.GO_APP_BUTTON;
      transition(allowed ? { type: "GO_APP_INIT_RESOLVED", payload: browser.detectStore() } : { type: "GO_APP_INIT_REJECTED" });
    },
  },
});
```

UI читает `state === "READY"` чтобы решить, показывать ли кнопку, и `context.store` чтобы выбрать ссылку. Сам клик в gate-варианте остаётся обычным внешним переходом — машина уже подготовила решение.

Когда command machine не нужна:

- click ведёт прямо к одному `transition` без сбора данных и веток → отправляй событие из UI;
- кнопка только показывает/скрывает модалку → достаточно View modal machine;
- нужно несколько параллельных экземпляров (по item) → actor template (`actors.md`).
