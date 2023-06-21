import { Middleware } from "~/core/types";

export const devToolsMiddleware: Middleware = (api) => {
  const devTools = (window as any).__REDUX_DEVTOOLS_EXTENSION__?.connect({
    features: {
      pause: true,
      export: true,
      test: true,
      jump: true,
      skip: false,
    },
    autoPause: true,
    latency: 500,
  });

  const DEVTOOLS_ACTION_PREFIX = "@devtools";
  const JUMP_ACTION = `${DEVTOOLS_ACTION_PREFIX}/JUMP_TO_ACTION`;
  const ROLLBACK_ACTION = `${DEVTOOLS_ACTION_PREFIX}/ROLLBACK`;

  api.replaceReducer((reducer) => {
    return (state, action) => {
      switch (action.type) {
        case JUMP_ACTION:
        case ROLLBACK_ACTION:
          return {
            ...state,
            ...action.payload,
          };
        default:
          return reducer(state, action);
      }
    };
  });

  devTools?.subscribe((message: any) => {
    if (message.type === "DISPATCH" && message.state) {
      try {
        const payload = JSON.parse(message.state);

        api.transition({
          type: `${DEVTOOLS_ACTION_PREFIX}/${message.payload.type}`,
          payload,
        });
      } catch (err) {
        console.error("[devToolsMiddleware]", err);
      }
    }
  });

  devTools?.init(api.getState());

  return (next) => (action: { type: string }) => {
    next(action);

    if (!action.type.startsWith(DEVTOOLS_ACTION_PREFIX)) {
      devTools?.send(action, api.getState());
    }
  };
};
