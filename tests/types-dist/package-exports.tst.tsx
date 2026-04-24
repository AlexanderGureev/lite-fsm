import React from "react";
import { describe, expect, test } from "tstyche";
import {
  Machine,
  MachineManager,
  createConfig,
  createEffect,
  createMachine,
  createReducer,
  defineMachine,
  type CFG,
  type DefaultDeps,
  type EffectType,
  type FSMEvent,
  type IMachine,
  type IMachineManager,
  type MachineConfig,
  type MachineDependencies,
  type MachineEffect,
  type MachineEvents,
  type MachineReducer,
  type MachinesState,
  type Middleware,
  type MiddlewareApi,
  type Reducer,
  type SType,
  type State,
  type StateType,
  type Subscriber,
  type TransitionSubscriber,
  type TypedCreateConfigFn,
  type TypedCreateEffectFn,
  type TypedCreateMachineFn,
  type TypedCreateReducerFn,
  type WILDCARD,
} from "lite-fsm";
import { devToolsMiddleware as devToolsFromAll, immerMiddleware as immerFromAll } from "lite-fsm/middleware";
import { devToolsMiddleware } from "lite-fsm/middleware/devTools";
import { immerMiddleware } from "lite-fsm/middleware/immer";
import {
  FSMContext,
  FSMContextProvider,
  defineMachine as defineReactMachine,
  useManager,
  useSelector,
  useTransition,
  type FSMContextType,
  type TypedUseMachineHook,
  type TypedUseSelectorHook,
  type TypedUseTransitionHook,
} from "lite-fsm/react";

type ModalEvent = FSMEvent<"OPEN"> | FSMEvent<"CLOSE"> | FSMEvent<"PATCH", { count: number }>;
type ModalContext = { count: number };
type ModalDeps = { logger: (event: ModalEvent) => void };

const createModalConfig: TypedCreateConfigFn<ModalEvent> = createConfig;
const createModalMachine: TypedCreateMachineFn<ModalEvent, ModalDeps> = createMachine;
const createModalReducer: TypedCreateReducerFn<ModalEvent> = createReducer;
const createModalEffect: TypedCreateEffectFn<ModalEvent, ModalDeps> = createEffect;

const modalConfig = createModalConfig({
  closed: {
    OPEN: "open",
  },
  open: {
    CLOSE: "closed",
    PATCH: null,
  },
});

const modalReducer = createModalReducer<typeof modalConfig, ModalContext>((state, action, meta) => {
  if (action.type === "PATCH") {
    expect(action.payload.count).type.toBe<number>();
    return { state: state.state, context: { count: action.payload.count } };
  }

  return { state: meta.nextState, context: state.context };
});

const openEffect = (({ action, logger, transition }) => {
  expect(action.type).type.toBe<"OPEN">();
  logger(action);
  transition({ type: "PATCH", payload: { count: 1 } });

  // @ts-expect-error!
  transition({ type: "PATCH" });
}) satisfies MachineEffect<"open", typeof modalConfig, ModalEvent, ModalDeps>;

const closedEffect = createModalEffect<typeof modalConfig, "closed">({
  type: "every",
  effect: ({ action }) => {
    expect(action.type).type.toBe<"CLOSE">();
  },
});

const modalMachineConfigWithoutEffects = createModalMachine({
  config: modalConfig,
  initialState: "closed",
  initialContext: { count: 0 },
  reducer: modalReducer,
});

const modalMachineConfig = {
  config: modalConfig,
  initialState: "closed",
  initialContext: { count: 0 },
  reducer: modalReducer,
  effects: {
    open: openEffect,
  },
} satisfies MachineConfig<typeof modalConfig, ModalContext, ModalEvent, ModalDeps>;

const machines = {
  modal: modalMachineConfig,
};

type ModalMachines = typeof machines;
type ModalState = StateType<typeof modalConfig, ModalContext>;
type AppState = MachinesState<ModalMachines>;

describe("dist package exports", () => {
  test("root export declarations keep public type contracts", () => {
    expect<SType>().type.toBe<string | number | symbol>();
    expect<WILDCARD>().type.toBe<"*">();
    expect<State<"closed" | "open" | "*" | 1 | symbol>>().type.toBe<"closed" | "open">();
    expect<EffectType>().type.toBe<"every" | "latest">();
    expect<typeof modalConfig>().type.toBeAssignableTo<CFG<typeof modalConfig, ModalEvent>>();
    expect<DefaultDeps<"open", typeof modalConfig, ModalEvent>["action"]>().type.toBe<FSMEvent<"OPEN">>();
    expect(openEffect).type.toBeAssignableTo<MachineEffect<"open", typeof modalConfig, ModalEvent, ModalDeps>>();
    expect(closedEffect).type.toBe<MachineEffect<"closed", typeof modalConfig, ModalEvent, ModalDeps>>();
    expect<MachineReducer<typeof modalConfig, ModalEvent, ModalContext>>().type.toBe<typeof modalReducer>();
    expect<Reducer<ModalContext, FSMEvent<"PATCH", ModalContext>>>().type.toBe<
      (state: ModalContext, action: FSMEvent<"PATCH", ModalContext>) => ModalContext
    >();
    expect<MachineEvents<ModalMachines>>().type.toBe<ModalEvent>();
    expect<MachineDependencies<ModalMachines>>().type.toBe<ModalDeps>();
    expect<ModalState>().type.toBe<{ state: "closed" | "open"; context: ModalContext }>();
    expect(modalMachineConfigWithoutEffects).type.toBeAssignableTo<
      MachineConfig<typeof modalConfig, ModalContext, ModalEvent, ModalDeps>
    >();

    const pureMachine = Machine<typeof modalConfig, ModalContext, ModalEvent["type"], ModalEvent, ModalDeps>(modalMachineConfig);
    expect(pureMachine).type.toBeAssignableTo<IMachine<typeof modalConfig, ModalContext, ModalEvent, ModalDeps>>();
    expect(pureMachine.transition({ state: "closed", context: { count: 0 } }, { type: "OPEN" })).type.toBe<ModalState>();

    // @ts-expect-error!
    pureMachine.transition({ state: "closed", context: { count: 0 } }, { type: "UNKNOWN" });
  });

  test("stateful machine and manager declarations keep event and state contracts", () => {
    const machine = defineMachine<ModalEvent, ModalDeps>({
      dependencies: {
        logger: (event) => {
          expect(event).type.toBe<ModalEvent>();
        },
      },
    }).create(modalMachineConfig);

    const inferredManager = MachineManager(machines);
    const manager = MachineManager<ModalMachines, ModalEvent>(machines, {
      middleware: [immerMiddleware, immerFromAll, devToolsMiddleware(), devToolsFromAll()],
    });

    const subscriber: Subscriber<typeof modalConfig, ModalContext, ModalEvent> = (prevState, currentState, action) => {
      expect(prevState).type.toBe<ModalState>();
      expect(currentState).type.toBe<ModalState>();
      expect(action).type.toBe<ModalEvent>();
    };

    const transitionSubscriber: TransitionSubscriber<ModalMachines, ModalEvent> = (prevState, currentState, action) => {
      expect(prevState).type.toBe<AppState>();
      expect(currentState).type.toBe<AppState>();
      expect(action).type.toBe<ModalEvent>();
    };

    const middlewareApi: MiddlewareApi<AppState, ModalEvent> = {
      getState: manager.getState,
      transition: manager.transition,
      replaceReducer: manager.replaceReducer,
      onTransition: manager.onTransition,
      condition: async () => true,
    };

    const middleware: Middleware<AppState, ModalEvent> = (api) => (next) => (action) => {
      expect(api.getState()).type.toBe<AppState>();
      return next(action);
    };

    expect(machine.getState()).type.toBe<ModalState>();
    expect(machine.transition).type.toBe<(payload: ModalEvent) => ModalEvent>();
    expect(machine.onTransition(subscriber)).type.toBe<() => void>();
    expect(manager).type.toBe<IMachineManager<ModalMachines, ModalEvent>>();
    expect(inferredManager).type.toBe<IMachineManager<ModalMachines, ModalEvent>>();
    expect(manager.getState()).type.toBe<AppState>();
    expect(manager.onTransition(transitionSubscriber)).type.toBe<() => void>();
    expect(middlewareApi).type.toBe<MiddlewareApi<AppState, ModalEvent>>();
    expect(middleware).type.toBe<Middleware<AppState, ModalEvent>>();

    manager.setDependencies({
      logger: (event) => {
        expect(event).type.toBe<ModalEvent>();
      },
    });

    // @ts-expect-error!
    inferredManager.transition({ type: "PATCH" });

    // @ts-expect-error!
    manager.setDependencies({ logger: "wrong" });

    // @ts-expect-error!
    devToolsMiddleware({ blacklistActions: [1] });
  });

  test("react export declarations keep provider, hooks and hook-machine contracts", () => {
    const manager = MachineManager(machines);
    const useModalTransition: TypedUseTransitionHook<ModalEvent> = useTransition;
    const useModalSelector: TypedUseSelectorHook<AppState> = useSelector;
    const useModalManager: TypedUseMachineHook<ModalMachines, ModalEvent> = useManager;
    const reactMachine = defineReactMachine<ModalEvent, ModalDeps>({
      dependencies: {
        logger: () => undefined,
      },
    }).create(modalMachineConfig);

    function useHookExamples() {
      const currentManager = useModalManager();
      const transition = useModalTransition();
      const count = useModalSelector((state) => state.modal.context.count);
      const stateName = reactMachine((state) => state.state);

      expect(currentManager).type.toBe<FSMContextType<ModalMachines, ModalEvent>>();
      expect(count).type.toBe<number>();
      expect(stateName).type.toBe<"closed" | "open">();

      transition({ type: "OPEN" });
      reactMachine.transition({ type: "PATCH", payload: { count: 2 } });

      // @ts-expect-error!
      transition({ type: "PATCH" });

      return { count, stateName };
    }

    const providerElement = (
      <FSMContextProvider machineManager={manager}>
        <span>dist provider</span>
      </FSMContextProvider>
    );

    expect(providerElement).type.toBeAssignableTo<React.JSX.Element>();
    expect(FSMContext).type.toBeAssignableTo<React.Context<FSMContextType | null>>();
    expect(useHookExamples).type.toBe<() => { count: number; stateName: "closed" | "open" }>();
  });
});
