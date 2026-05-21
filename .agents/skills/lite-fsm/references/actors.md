# Actors

Actor template используй для множества независимых экземпляров одного процесса, когда каждому экземпляру нужны собственные `state`, `context`, effects, cancel/retry, terminal lifecycle или routing.

Для простого набора данных без независимого lifecycle используй dictionary в domain context.

## Минимальный contract

Machine становится actor template, если в `config` есть literal `__INIT`.

```ts
import type { FSMEvent } from "@lite-fsm/core";
import { createMachine } from "../create-machine";

export type Events =
  | FSMEvent<"START_TRACK_DOWNLOAD", { trackId: string }>
  | FSMEvent<"DOWNLOAD_TICK", { trackId: string; progress: number }>
  | FSMEvent<"TRACK_DOWNLOAD_RESOLVED", { trackId: string }>
  | FSMEvent<"CANCEL_TRACK_DOWNLOAD", { trackId: string }>
  | FSMEvent<"RESET_DOWNLOADS">;

const initialContext: {
  trackId: string;
  progress: number;
} = {
  trackId: "",
  progress: 0,
};

export const trackDownload = createMachine({
  groupTag: "track-download",
  config: {
    __INIT: { START_TRACK_DOWNLOAD: "DOWNLOAD_PENDING" },
    DOWNLOAD_PENDING: {
      DOWNLOAD_TICK: null,
      TRACK_DOWNLOAD_RESOLVED: "__RESOLVED",
      CANCEL_TRACK_DOWNLOAD: "__CANCELLED",
      RESET_DOWNLOADS: "__CANCELLED",
    },
  },
  initialState: "__INIT",
  initialContext,
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "START_TRACK_DOWNLOAD":
        state.context.trackId = action.payload.trackId;
        state.context.progress = 0;
        return;
      case "DOWNLOAD_TICK":
        state.context.progress = action.payload.progress;
        return;
    }
  },
});
```

Правила:

- `initialState` всегда `"__INIT"`.
- Новый actor создается, когда событие match-ит transition из `__INIT`.
- Target в `__INIT` не может быть `null` или сам `__INIT`.
- `__RESOLVED`, `__REJECTED`, `__CANCELLED` — terminal target, актор удаляется из runtime state.
- Actor templates работают только внутри `MachineManager`.
- Wildcard `"*"` не наследуется для `__INIT`.

## Runtime state

Public actor record выглядит как:

```ts
state.trackDownload[actorId] = {
  state,
  context,
  meta: { actorId, groupId, groupTag },
};
```

Если результат нужен после удаления actor, сохрани его в domain machine через событие. Terminal actor сам исчезнет.

## Custom actor id

По умолчанию `MachineManager` присваивает actor id вида `templateKey/0`, `templateKey/1`. Если в проекте удобно использовать доменный id (например, id пользователя или трека из payload), задай `generateActorId` на уровне manager:

```ts
const manager = MachineManager<AppMachines, AppEvents>(machines, {
  middleware: [immerMiddleware],
  generateActorId: ({ templateKey, action, counter }) => {
    if (action.type === "START_TRACK_DOWNLOAD") {
      return `${templateKey}/${action.payload.trackId}`;
    }
    return `${templateKey}/${counter}`;
  },
});
```

Generator получает `{ templateKey, groupTag, counter, originId, action }` и должен вернуть непустую строку. Возврат уже занятого id блокируется ошибкой `LITE_FSM_INVALID_GENERATED_ID`; counter инкрементируется всегда.

Доменный id упрощает routing: UI знает `trackId` и сразу отправляет `meta: { actorId: "trackDownload/" + trackId }` без отдельного lookup-словаря из payload в actor id.

`generateGroupId` работает по тем же правилам, но используется только при unscoped spawn — для большинства приложений достаточно `generateActorId`.

## Routing

Routing задается в `action.meta`:

```ts
manager.transition({ type: "CANCEL_TRACK_DOWNLOAD", payload: { trackId }, meta: { actorId } });
manager.transition({ type: "RESET_DOWNLOADS", meta: { groupTag: "track-download" } });
```

Priority: `actorId > groupId > groupTag > unscoped`. Каждое поле принимает строку или массив строк.

Delivery:

- `actorId`: только конкретные actors; новые actors не создаются.
- `groupId`: actors внутри групп; подходящий `__INIT` может создать actor в группе.
- `groupTag`: все активные группы с тегом; подходящий `__INIT` может создать actors в группах.
- unscoped: domain machines, активные actors и новая группа для подходящего `__INIT`.

Неизвестный actor route ничего не меняет в actors, но domain machines все равно получают committed event.

## Actor effects

Actor effect получает `self` и actor-aware transition:

```ts
effects: {
  DOWNLOAD_PENDING: async ({ action, getState, self, transition }) => {
    let progress = 0;

    while (progress < 100) {
      await new Promise<void>((resolve) => setTimeout(resolve, 300));
      if (getState().trackDownload[self.actorId]?.state !== "DOWNLOAD_PENDING") return;

      progress += 10;
      transition({ type: "DOWNLOAD_TICK", payload: { trackId: action.payload.trackId, progress } });
    }

    transition.actor(self.actorId, {
      type: "TRACK_DOWNLOAD_RESOLVED",
      payload: { trackId: action.payload.trackId },
    });
  },
}
```

В actor effect обычный `transition(action)` по умолчанию сохраняет routing в группу текущего actor. Используй:

- `transition.actor(actorId, action)` для точечной доставки;
- `transition.group(groupId, action)` для группы;
- `transition.tag(groupTag, action)` для всех групп тега;
- `transition.unscoped(action)` чтобы снять routing.

## UI и actor routing

Selector может вернуть `actorId` как часть view item. UI может отправить domain intent для конкретного item:

```ts
transition({
  type: "CANCEL_TRACK_DOWNLOAD",
  payload: { trackId: item.trackId },
  meta: { actorId: item.actorId },
});
```

UI не должен искать actors сам или строить сложный broadcast/group routing. Это responsibility эффекта или system machine.

## Persistence

Actors runtime-only по умолчанию: `dehydrate()` их пропускает.

Добавляй `persistence: "snapshot"` только если actor представляет durable data/process, который должен восстановиться после reload.

```ts
export const draftTask = createMachine({
  persistence: "snapshot",
  groupTag: "draft-task",
  config: {
    __INIT: { OPEN_DRAFT: "EDITING" },
    EDITING: { CLOSE_DRAFT: "__RESOLVED" },
  },
  initialState: "__INIT",
  initialContext: { id: "", text: "" },
});
```

Не сохраняй timers, subscriptions и in-flight requests как durable actor state без отдельного restore plan.
