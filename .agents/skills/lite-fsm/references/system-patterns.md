# System Patterns

Читай этот файл, когда machine интегрирует внешнюю среду, координирует несколько owners или строит selector projection.

## Technical bridge machine

```ts
export type Events = FSMEvent<"DO_INIT"> | FSMEvent<"VISIBILITY_CHANGED", { status: "visible" | "hidden" }> | FSMEvent<"VISIBILITY_LISTEN_RESOLVED">;

export const visibility = createMachine({
  config: {
    IDLE: { DO_INIT: "VISIBILITY_LISTEN_PENDING" },
    VISIBILITY_LISTEN_PENDING: {
      VISIBILITY_CHANGED: null,
      VISIBILITY_LISTEN_RESOLVED: "READY",
    },
    READY: { VISIBILITY_CHANGED: null },
  },
  initialState: "IDLE",
  initialContext: { status: "visible" as "visible" | "hidden" },
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "VISIBILITY_CHANGED":
        state.context.status = action.payload.status;
        return;
      case "DO_INIT":
      case "VISIBILITY_LISTEN_RESOLVED":
        return;
    }
  },
  effects: {
    VISIBILITY_LISTEN_PENDING: ({ browser, transition }) => {
      const sync = () => {
        transition({ type: "VISIBILITY_CHANGED", payload: { status: browser.visibilityState() } });
      };
      browser.onVisibilityChange(sync);
      sync();
      transition({ type: "VISIBILITY_LISTEN_RESOLVED" });
    },
  },
});
```

## Coordinator/system machine

Заводи coordinator только когда orchestration стала самостоятельной ответственностью. Не создавай его по умолчанию для каждого cross-machine чтения.

```ts
export const downloadSystem = createMachine({
  config: { READY: { RESET_DOWNLOADS: "RESET_DOWNLOADS_PENDING" }, RESET_DOWNLOADS_PENDING: { RESET_DOWNLOADS_RESOLVED: "READY" } },
  initialState: "READY",
  initialContext: {},
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "RESET_DOWNLOADS":
      case "RESET_DOWNLOADS_RESOLVED":
        return;
    }
  },
  effects: {
    RESET_DOWNLOADS_PENDING: ({ getState, transition }) => {
      for (const actorId of Object.keys(getState().trackDownload)) {
        transition({ type: "CANCEL_TRACK_DOWNLOAD", meta: { actorId } });
      }
      transition({ type: "RESET_DOWNLOADS_RESOLVED" });
    },
  },
});
```

## Sub-process через handshake

Когда у process-машины появляется самостоятельный подсценарий — несколько состояний, async, своя ошибка, свой reset — выноси его в отдельную параллельную машину. Owner входит в `*_PENDING`, в effect отправляет инициирующее событие, sub-process выполняет свою цепочку и финальным `*_RESOLVED` возвращает owner-а в следующее состояние. Получается имитация вложенности на плоских автоматах через общий `MachineManager`, без statecharts и без введения coordinator.

Контракт handshake:

- owner добавляет одно `*_PENDING` состояние и в effect эмитит `INIT_*` событие, инициирующее sub-process;
- sub-process слушает `INIT_*` из `IDLE` и в финальном состоянии эмитит `*_RESOLVED`;
- owner ловит `*_RESOLVED` как transition в следующее состояние; sub-process никогда не пишет в чужой slice;
- ошибочные события sub-process (`*_REJECTED`) тоже видны owner-у: он сам решает откат, retry или переход в `ERROR`;
- через `"*"` sub-process сбрасывается в `IDLE` на reset-события owner (новый запрос, отмена, destroy), чтобы новый цикл не наслаивался на хвост старого.

```ts
export const player = createMachine({
  config: {
    SELECT_SOURCE_PENDING: { SELECT_SOURCE_RESOLVED: "RESUME_AUDIO_PENDING" },
    RESUME_AUDIO_PENDING: {
      RESUME_AUDIO_RESOLVED: "READY",
      LOAD_META_REJECTED: "SELECT_SOURCE_PENDING",
    },
    READY: {},
  },
  initialState: "SELECT_SOURCE_PENDING",
  initialContext: {},
  reducer: (state, _action, { nextState }) => {
    state.state = nextState;
  },
  effects: {
    RESUME_AUDIO_PENDING: ({ transition }) => {
      transition({ type: "INIT_RESUME_AUDIO" });
    },
  },
});

export const resumeAudio = createMachine({
  config: {
    "*": { CHANGE_TRACK: "IDLE" },
    IDLE: { INIT_RESUME_AUDIO: "LOAD_META_PENDING" },
    LOAD_META_PENDING: {
      LOAD_META_RESOLVED: "LAUNCH_SETUP_PENDING",
      LOAD_META_REJECTED: "IDLE",
    },
    LAUNCH_SETUP_PENDING: { LAUNCH_SETUP_RESOLVED: "DONE" },
    DONE: { RESUME_AUDIO_RESOLVED: "IDLE" },
  },
  initialState: "IDLE",
  initialContext: {},
  reducer: (state, _action, { nextState }) => {
    state.state = nextState;
  },
  effects: {
    LOAD_META_PENDING: async ({ playerService, transition }) => {
      try {
        await playerService.loadMeta();
        transition({ type: "LOAD_META_RESOLVED" });
      } catch (error) {
        transition({ type: "LOAD_META_REJECTED", payload: { error: String(error) } });
      }
    },
    LAUNCH_SETUP_PENDING: ({ playerService, transition }) => {
      playerService.launch();
      transition({ type: "LAUNCH_SETUP_RESOLVED" });
    },
    DONE: ({ transition }) => {
      transition({ type: "RESUME_AUDIO_RESOLVED" });
    },
  },
});
```

`player` владеет одним переходом `RESUME_AUDIO_PENDING → READY` и реакцией на failure (`LOAD_META_REJECTED` откатывает в `SELECT_SOURCE_PENDING`). `resumeAudio` владеет внутренней цепочкой шагов. Sub-process сам по себе тоже может быть owner: `resumeAudio` дальше делает handshake с `quality` через `INIT_QUALITY` / `QUALITY_INITIALIZATION_RESOLVED` — это transitive вложенность.

Когда sub-process не нужен:

- подсценарий — один-два transition без своей ошибки → оставь в owner;
- нужно дождаться нескольких независимых событий → `condition(...)` в effect owner-а (`effects.md`);
- orchestration касается трёх и более машин с собственным lifecycle → coordinator из этого файла.

## Selector projection

```ts
import type { AppState } from "..";

export const selectDownloadView = (state: AppState) => {
  const downloads = Object.entries(state.trackDownload).map(([actorId, slice]) => ({
    actorId,
    trackId: slice.context.trackId,
    progress: slice.context.progress,
    state: slice.state,
  }));

  return {
    downloads,
    isBusy: downloads.some((item) => item.state === "DOWNLOAD_PENDING"),
  };
};
```
