import type { AnyEvent, GenericMiddleware, MiddlewareApi } from "../core/types";

type DevToolsOptions = {
  blacklistActions?: string[];
};

type ReduxDevToolsExtension<S> = {
  connect: (options: unknown) => {
    init: (state: S) => void;
    send: (action: AnyEvent, state: S) => void;
    subscribe: (cb: (message: { type?: string; state?: string; payload?: { type?: string } }) => void) => void;
  };
};

export const devToolsMiddleware = ({ blacklistActions = [] }: DevToolsOptions = {}): GenericMiddleware => {
  const middleware: GenericMiddleware = <S, P extends AnyEvent>(api: MiddlewareApi<S, P>) => {
    if (typeof window === "undefined") {
      return (next) => (action) => next(action);
    }

    const extension = (globalThis as { window?: { __REDUX_DEVTOOLS_EXTENSION__?: ReduxDevToolsExtension<S> } }).window
      ?.__REDUX_DEVTOOLS_EXTENSION__;
    const devTools = extension?.connect({
      features: {
        pause: true,
        export: true,
        test: true,
        jump: true,
        skip: false,
        live: true,
      },
      autoPause: false,
      latency: 500,
    });

    if (!devTools) {
      return (next) => (action) => next(action);
    }

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
              ...(action.payload as object),
            };
          default:
            return reducer(state, action);
        }
      };
    });

    devTools.subscribe((message) => {
      if (message.type === "DISPATCH" && message.state) {
        try {
          const devToolsActionType = message.payload?.type;
          if (!devToolsActionType) return;

          api.transition({
            type: `${DEVTOOLS_ACTION_PREFIX}/${devToolsActionType}`,
            payload: JSON.parse(message.state),
          } as P);
        } catch (err) {
          console.error("[devToolsMiddleware]", err);
        }
      }
    });

    devTools.init(api.getState());

    return (next) => (action) => {
      const result = next(action);

      if (!action.type.startsWith(DEVTOOLS_ACTION_PREFIX) && !blacklistActions.includes(action.type)) {
        devTools.send(action, api.getState());
      }

      return result;
    };
  };

  return middleware;
};
