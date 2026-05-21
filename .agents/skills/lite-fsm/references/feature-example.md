# Feature Example: Login

Пример показывает, как разложить продуктовую фичу на машины разных типов. Все четыре машины работают в одном `MachineManager` и общаются только через события.

## Карта фичи

| Machine | Тип | Ответственность |
|---|---|---|
| `session` | domain | Источник истины: авторизован ли пользователь и его данные |
| `loginModal` | view | Видимость модалки логина |
| `loginFlow` | process | Lifecycle логина: запрос, успех, отказ |
| `authFlowEntry` | technical | Фиксирует path в момент открытия модалки для возврата после логина |

Observer-машины (`analytics`, `errors`) подключаются отдельно и описаны в `machine-patterns.md`.

## `session` (domain)

Источник истины. Слушает `LOGIN_SUBMIT_RESOLVED` от `loginFlow` и `LOGOUT` от UI; ничего не знает о том, как именно произошел логин.

```ts
// src/store/machines/session/index.ts
import type { FSMEvent } from "@lite-fsm/core";
import { createMachine } from "../create-machine";

type User = { id: string; email: string };

export type Events = FSMEvent<"LOGOUT">;

type Context = { user: User | null };

const initialContext: Context = { user: null };

export const session = createMachine({
  config: {
    IDLE: { LOGIN_SUBMIT_RESOLVED: "AUTHORIZED", LOGOUT: null },
    AUTHORIZED: { LOGOUT: "IDLE" },
  },
  initialState: "IDLE",
  initialContext,
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "LOGIN_SUBMIT_RESOLVED":
        state.context.user = action.payload.user;
        return;
      case "LOGOUT":
        state.context.user = null;
        return;
    }
  },
});
```

## `loginModal` (view)

View хранит только видимость. Закрытие при успехе — реакция на доменный факт `LOGIN_SUBMIT_RESOLVED`, а не решение UI-компонента.

```ts
// src/store/machines/login-modal/index.ts
import type { FSMEvent } from "@lite-fsm/core";
import { createMachine } from "../create-machine";

export type Events = FSMEvent<"OPEN_LOGIN_MODAL"> | FSMEvent<"CLOSE_LOGIN_MODAL">;

export const loginModal = createMachine({
  config: {
    HIDDEN: { OPEN_LOGIN_MODAL: "VISIBLE" },
    VISIBLE: {
      CLOSE_LOGIN_MODAL: "HIDDEN",
      LOGIN_SUBMIT_RESOLVED: "HIDDEN",
    },
  },
  initialState: "HIDDEN",
  initialContext: {},
  reducer: (state, _action, { nextState }) => {
    state.state = nextState;
  },
});
```

## `loginFlow` (process)

Process владеет жизненным циклом запроса. Повторный submit пресекается на уровне UI через `disabled` по inline `useAppSelector((s) => s.loginFlow.state === "LOGIN_PENDING")`, поэтому effect остается простым.

```ts
// src/store/machines/login-flow/index.ts
import type { FSMEvent } from "@lite-fsm/core";
import { createMachine } from "../create-machine";

type Credentials = { email: string; password: string };
type User = { id: string; email: string };

export type Events =
  | FSMEvent<"LOGIN_SUBMIT", Credentials>
  | FSMEvent<"LOGIN_SUBMIT_RESOLVED", { user: User }>
  | FSMEvent<"LOGIN_SUBMIT_REJECTED", { error: string }>;

type Context = { lastError: string | null };

const initialContext: Context = { lastError: null };

export const loginFlow = createMachine({
  config: {
    IDLE: { LOGIN_SUBMIT: "LOGIN_PENDING" },
    LOGIN_PENDING: {
      LOGIN_SUBMIT_RESOLVED: "IDLE",
      LOGIN_SUBMIT_REJECTED: "IDLE",
    },
  },
  initialState: "IDLE",
  initialContext,
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "LOGIN_SUBMIT":
        state.context.lastError = null;
        return;
      case "LOGIN_SUBMIT_REJECTED":
        state.context.lastError = action.payload.error;
        return;
    }
  },
  effects: {
    LOGIN_PENDING: async ({ action, api, transition }) => {
      try {
        const user = await api.login(action.payload);
        transition({ type: "LOGIN_SUBMIT_RESOLVED", payload: { user } });
      } catch (error) {
        transition({
          type: "LOGIN_SUBMIT_REJECTED",
          payload: { error: error instanceof Error ? error.message : String(error) },
        });
      }
    },
  },
});
```

## `authFlowEntry` (technical)

Technical-машина фиксирует path в момент `OPEN_LOGIN_MODAL`. Если читать `router.context.current.path` после успешного логина, значение успеет смениться. Исторический факт нужно записать в момент его актуальности.

```ts
// src/store/machines/auth-flow-entry/index.ts
import type { FSMEvent } from "@lite-fsm/core";
import { createMachine } from "../create-machine";

export type Events = FSMEvent<"AUTH_FLOW_ENTRY_CAPTURED", { path: string | null }>;

type Context = { path: string | null };

const initialContext: Context = { path: null };

export const authFlowEntry = createMachine({
  config: {
    IDLE: { OPEN_LOGIN_MODAL: "CAPTURE_PENDING" },
    CAPTURE_PENDING: { AUTH_FLOW_ENTRY_CAPTURED: "IDLE" },
  },
  initialState: "IDLE",
  initialContext,
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    if (action.type === "AUTH_FLOW_ENTRY_CAPTURED") {
      state.context.path = action.payload.path;
    }
  },
  effects: {
    CAPTURE_PENDING: ({ getState, transition }) => {
      transition({
        type: "AUTH_FLOW_ENTRY_CAPTURED",
        payload: { path: getState().router.context.current?.path ?? null },
      });
    },
  },
});
```

## App events и сборка

```ts
// src/store/types.ts
import type * as session from "./machines/session";
import type * as loginModal from "./machines/login-modal";
import type * as loginFlow from "./machines/login-flow";
import type * as authFlowEntry from "./machines/auth-flow-entry";
import type * as router from "./machines/router";

export type AppEvents =
  | session.Events
  | loginModal.Events
  | loginFlow.Events
  | authFlowEntry.Events
  | router.Events;
```

Каждая машина экспортирует только union тех событий, которыми она владеет. События, которые машина слушает, ей не принадлежат и реэкспорта не требуют.

## UI

Узкие чтения — inline через `useAppSelector`. Именованные selectors для этой фичи не нужны: каждая projection — одна точка доступа к state.

```tsx
function LoginButton() {
  const transition = useAppTransition();
  return <button onClick={() => transition({ type: "OPEN_LOGIN_MODAL" })}>Login</button>;
}

function LoginModal() {
  const isVisible = useAppSelector((s) => s.loginModal.state === "VISIBLE");
  const isPending = useAppSelector((s) => s.loginFlow.state === "LOGIN_PENDING");
  const error = useAppSelector((s) => s.loginFlow.context.lastError);
  const transition = useAppTransition();

  if (!isVisible) return null;

  return (
    <Dialog onClose={() => transition({ type: "CLOSE_LOGIN_MODAL" })}>
      <LoginForm
        disabled={isPending}
        error={error}
        onSubmit={(credentials) => transition({ type: "LOGIN_SUBMIT", payload: credentials })}
      />
    </Dialog>
  );
}

function UserMenu() {
  const user = useAppSelector((s) => s.session.context.user);
  if (!user) return null;
  return <span>{user.email}</span>;
}
```

UI собирает payload и отправляет событие. Решение «закрыть модалку при успехе» принимает `loginModal`, а не обработчик `onSubmit`. `disabled={isPending}` пресекает повторный submit на уровне формы.

После успешного логина компонент-редиректор читает path для возврата:

```tsx
const returnPath = useAppSelector((s) => s.authFlowEntry.context.path);
useEffect(() => {
  if (returnPath) router.push(returnPath);
}, [returnPath]);
```

## Когда заводить именованный selector

Только если projection нетривиальна или переиспользуется. Пример — agregator из нескольких machines:

```ts
// src/store/selectors/index.ts
import type { AppState } from "..";

export const selectAuthSummary = (state: AppState) => ({
  isAuthorized: state.session.state === "AUTHORIZED",
  email: state.session.context.user?.email ?? null,
  returnPath: state.authFlowEntry.context.path,
  lastError: state.loginFlow.context.lastError,
});
```

Такой selector оправдан, если три-четыре компонента читают один и тот же агрегированный view модели аутентификации. Для одного экрана достаточно inline-чтений.

## Поток событий

```text
UI:                OPEN_LOGIN_MODAL
loginModal:        HIDDEN  -> VISIBLE
authFlowEntry:     IDLE    -> CAPTURE_PENDING  [effect читает router.context.current.path]
authFlowEntry:                AUTH_FLOW_ENTRY_CAPTURED -> IDLE  [path записан в context]

UI:                LOGIN_SUBMIT { email, password }
loginFlow:         IDLE    -> LOGIN_PENDING  [effect: api.login()]
loginFlow:                    LOGIN_SUBMIT_RESOLVED { user } -> IDLE
session:           IDLE    -> AUTHORIZED  [user записан в context]
loginModal:        VISIBLE -> HIDDEN  [автозакрытие на доменном факте]
```

Каждое событие проходит через все машины. Реагирует только та, у которой событие явно объявлено в `config` текущего state.

## Что осталось вне machines

- Управляемые inputs формы — локальный `useState` компонента.
- Стили, разметка, анимации — в компоненте.
- HTTP-клиент — за `AppDeps.api`, не как второй слой бизнес-логики.

## Чек-лист проектирования фичи

- Каждая машина имеет одну причину измениться.
- View закрывается на доменное событие, а не на handler в компоненте.
- Process сериализует ошибку в `*_REJECTED`; UI не делает retry/rollback.
- Technical фиксирует исторический факт на исходном событии.
