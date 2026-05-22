# Effects

## Pipeline события

Каждый `manager.transition(action)` проходит через фиксированный pipeline:

1. **middleware (pre-next)** — каждое middleware до вызова `next(action)`, в порядке регистрации. Видит prev state, может заблокировать (`return` без `next`) или подменить action.
2. **reducer** — routing → domain reducers → spawn/route actors → commit нового `{ state, context }`.
3. **subscribers** — `onTransition` callbacks (sync).
4. **middleware (post-next)** — код после `next(action)` в обратном порядке. Видит committed state и результат subscribers.
5. **effects** — после возврата всей middleware-цепочки: domain effects на каждый dispatch + actor effects для delivered/spawned actors.

Что важно для дизайна:

- `transition(action)` возвращает action, дошедший до reducer (после возможной подмены в middleware).
- Effects запускаются **после** commit state — `getState()` в effect видит уже новое состояние.
- Reentrant `transition` из middleware/subscriber/effect разрешен и проходит обычный pipeline заново.
- `@@lite-fsm/*` префикс зарезервирован — через `transition` отправлять нельзя.

## Effect contract

Effect запускается при входе в target state. Reducer фиксирует состояние, effect выполняет внешнюю работу и отправляет результат новым событием.

Rules:

- Effect не меняет state напрямую.
- Effect может читать root через `getState`.
- Effect отправляет events через `transition`.
- После `await` проверяй актуальность state, если процесс мог быть отменен, перезапущен или удален.
- Не проверяй `action.type` повторно, если у effect один target state и `config` уже направил event в него.
- Сервисный слой в deps должен быть тонким adapter layer.

## One-shot inline vs repeatable latest

Для one-shot процесса, который нельзя повторно запустить до завершения через `config` и UI, пиши обычную inline async-функцию. Это делает модель честной: читатель не ищет скрытую конкурентность там, где ее нет.

```ts
effects: {
  LOGIN_PENDING: async ({ api, transition }) => {
    try {
      const user = await api.login();
      transition({ type: "LOGIN_RESOLVED", payload: { user } });
    } catch (error) {
      transition({
        type: "LOGIN_REJECTED",
        payload: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  },
},
```

Не оборачивай такой effect в `createEffect` ради перестраховки или единого стиля.

Используй `latest` только когда есть реальная возможность повторного запуска до завершения и последний запуск должен победить: поиск по мере ввода, refresh/refetch поверх текущего запроса, автосохранение, ручной retry без ожидания старого результата.

Перед `latest` проверь, что повторный trigger реально приводит к новому запуску effect. `null` self-transition в том же state не перезапускает state effect. Если процесс строго one-shot до `*_RESOLVED`/`*_REJECTED`, используй inline async effect.

```ts
const searchItemsEffect = createEffect({
  type: "latest",
  effect: async ({ action, api, transition }) => {
    try {
      const results = await api.searchItems(action.payload.query);
      transition({ type: "SEARCH_ITEMS_RESOLVED", payload: { query: action.payload.query, results } });
    } catch (error) {
      transition({
        type: "SEARCH_ITEMS_REJECTED",
        payload: {
          query: action.payload.query,
          error: { message: error instanceof Error ? error.message : String(error) },
        },
      });
    }
  },
});

config: {
  READY: { SEARCH_ITEMS: "SEARCH_PENDING" },
  SEARCH_PENDING: {
    SEARCH_ITEMS: "SEARCH_RESTART",
    SEARCH_ITEMS_RESOLVED: "READY",
    SEARCH_ITEMS_REJECTED: "READY",
  },
  SEARCH_RESTART: { SEARCH_ITEMS: "SEARCH_PENDING" },
},
effects: {
  SEARCH_PENDING: searchItemsEffect,
  SEARCH_RESTART: ({ action, transition }) => {
    transition(action);
  },
},
```

`latest` не отменяет promise/request/timer. Он блокирует поздний `transition`. Для actor effect guard изолирован на actor instance.

Если используешь `createEffect`, держи вызов inline внутри `effects`, пока он читается. Выноси в отдельную константу только при большой длине или переиспользовании.

Если нужна ручная отмена, используй `cancelFn` только когда есть ясный cancel condition; все равно моделируй cancel event в `config`.

## `condition(...)`

`condition(predicate)` нужен, когда effect должен дождаться ближайшего события перед продолжением.

```ts
effects: {
  CHECK_READY_PENDING: async ({ condition, getState, transition }) => {
    await condition((event) => event.type === "PROFILE_LOADED");
    const state = getState();
    if (!state.profile.context.user) return;
    transition({ type: "CHECK_READY_RESOLVED" });
  },
}
```

После `await condition(...)` заново читай `getState`, потому что состояние могло измениться. Не используй `condition` для обычного API request lifecycle, где достаточно `*_PENDING` -> `*_RESOLVED`/`*_REJECTED`.

## Dependencies

`AppDeps` описывает внешние adapters. `store/index.ts` вызывает `manager.setDependencies(...)`.

```ts
manager.setDependencies({
  ...deps,
  getState: manager.getState,
});
```

Guidelines:

- `getState` обычно добавляет `makeStore`.
- Нестабильные зависимости передавай функциями.
- Группируй adapters: `api`, `browser`, `analytics`, `clock`, `random`, `storage`.
- Не держи бизнес-правила в deps.

## Middleware

Baseline manager использует `immerMiddleware`; это обязательная рекомендация для Immer-style reducers.

```ts
MachineManager<AppMachines, AppEvents>(machines, {
  middleware: [immerMiddleware],
  onError: console.error,
});
```

`devToolsMiddleware` подключай только когда пользователь просит DevTools/debugging или проект уже его использует.

### Custom middleware

Custom middleware решает cross-cutting задачи на уровне всего dispatch: access gates, глобальная фильтрация, трассировка, интеграция с lifecycle платформы. Логика конкретной фичи (retry, rollback, lifecycle) живет в machines/effects, не в middleware.

Пример access gate: перед выполнением gated-события middleware проверяет сессию и подменяет action на открытие модалки логина.

```ts
// src/store/middleware/check-access.ts
import type { Middleware } from "@lite-fsm/core";
import type { AppState, AppEvents } from "..";

const GATED: AppEvents["type"][] = ["FETCH_PROFILE", "SAVE_PROFILE", "ADD_TO_FAVORITES"];

export const checkAccess: Middleware<AppState, AppEvents> = (api) => (next) => (action) => {
  if (!GATED.includes(action.type)) return next(action);

  if (!api.getState().session.context.user) {
    return next({ type: "OPEN_LOGIN_MODAL" });
  }

  return next(action);
};
```

Middleware подключается в `makeStore`:

```ts
const manager = MachineManager<AppMachines, AppEvents>(machines, {
  middleware: [immerMiddleware, checkAccess],
});
```

Middleware не знает деталей конкретной фичи, только глобальный инвариант "эти события требуют сессию". Решение, что делать дальше (открыть модалку, показать paywall), остается короткой подменой action; сложная логика — у соответствующей machine.
