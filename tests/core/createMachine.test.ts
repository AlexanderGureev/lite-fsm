import { describe, it, expect, vi } from "vitest";
import { createMachine, defineMachine } from "../../src/core/Machine";
import { WILDCARD } from "../../src/core/utils";
import { FSMEvent } from "../../src/core/types";

describe("createMachine и defineMachine", () => {
  it("должен создавать машину с переданной конфигурацией", () => {
    const cfg = {
      config: {
        IDLE: {
          GO: "ACTIVE",
        },
        ACTIVE: {
          STOP: "IDLE",
        },
      },
      initialState: "IDLE",
      initialContext: { count: 0 },
    } as const;

    const machine = createMachine(cfg);

    expect(machine.getState()).toEqual({
      state: "IDLE",
      context: { count: 0 },
    });
  });

  it("должен обрабатывать переходы корректно", () => {
    const cfg = {
      config: {
        IDLE: {
          GO: "ACTIVE",
        },
        ACTIVE: {
          STOP: "IDLE",
          UPDATE: null, // null означает, что состояние не меняется
        },
      },
      initialState: "IDLE",
      initialContext: { count: 0 } as { count: number },
    } as const;

    const machine = createMachine(cfg);

    // Переход из IDLE в ACTIVE
    machine.transition({ type: "GO" });
    expect(machine.getState().state).toBe("ACTIVE");
    expect(machine.getState().context).toEqual({ count: 0 });

    // Переход с UPDATE не должен менять состояние
    machine.transition({ type: "UPDATE", payload: { count: 5 } });
    expect(machine.getState().state).toBe("ACTIVE");
    expect(machine.getState().context).toEqual({ count: 5 });

    // Переход обратно в IDLE
    machine.transition({ type: "STOP" });
    expect(machine.getState().state).toBe("IDLE");
    expect(machine.getState().context).toEqual({ count: 5 });
  });

  it("должен обрабатывать wildcard переходы", () => {
    // Определяем типы для FSM
    type Events = { type: "GO" } | { type: "STOP" } | { type: "RESET" };

    const machineFactory = defineMachine<Events>();

    const machine = machineFactory.create({
      config: {
        IDLE: {
          GO: "ACTIVE",
        },
        ACTIVE: {
          STOP: "IDLE",
        },
        [WILDCARD]: {
          RESET: "IDLE",
        },
      },
      initialState: "ACTIVE",
      initialContext: { count: 5 },
    });

    // Переход по wildcard из ACTIVE в IDLE
    machine.transition({ type: "RESET" });
    expect(machine.getState().state).toBe("IDLE");
  });

  it("должен возвращать текущее состояние, если переход не найден", () => {
    type Events = { type: "GO" } | { type: "STOP" } | { type: "UNKNOWN" };

    const machineFactory = defineMachine<Events>();

    const machine = machineFactory.create({
      config: {
        IDLE: {
          GO: "ACTIVE",
        },
        ACTIVE: {
          STOP: "IDLE",
        },
      },
      initialState: "IDLE",
      initialContext: { count: 0 },
    });

    // Неизвестный тип события
    machine.transition({ type: "UNKNOWN" });
    expect(machine.getState().state).toBe("IDLE");
  });

  it("должен вызывать эффекты при изменении состояния", async () => {
    const idleEffect = vi.fn();
    const activeEffect = vi.fn();
    const wildcardEffect = vi.fn();

    type Events = { type: "GO" } | { type: "STOP" };

    const machineFactory = defineMachine<Events>();

    const machine = machineFactory.create({
      config: {
        IDLE: {
          GO: "ACTIVE",
        },
        ACTIVE: {
          STOP: "IDLE",
        },
      },
      initialState: "IDLE",
      initialContext: { count: 0 },
      effects: {
        IDLE: idleEffect,
        ACTIVE: activeEffect,
        [WILDCARD]: wildcardEffect,
      },
    });

    // Эффект должен вызываться при изменении состояния
    machine.transition({ type: "GO" });

    // Ждем, чтобы убедиться, что асинхронные эффекты выполнились
    await vi.waitFor(() => {
      expect(activeEffect).toHaveBeenCalledOnce();
    });

    expect(idleEffect).not.toHaveBeenCalled();
    expect(wildcardEffect).not.toHaveBeenCalled();
  });

  it("должен тестировать обработку ошибок в эффектах", async () => {
    const errorSpy = vi.fn();
    const errorEffect = vi.fn().mockRejectedValue(new Error("Test error"));

    type Events = { type: "GO" };

    const machineFactory = defineMachine<Events>({
      onError: errorSpy,
    });

    const machine = machineFactory.create({
      config: {
        IDLE: {
          GO: "ACTIVE",
        },
        ACTIVE: {},
      },
      initialState: "IDLE",
      initialContext: {},
      effects: {
        ACTIVE: errorEffect,
      },
    });

    machine.transition({ type: "GO" });

    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalledOnce();
    });

    expect(errorEffect).toHaveBeenCalledOnce();
  });

  it("должен вызывать подписчиков при переходе", () => {
    const subscriberSpy = vi.fn();

    type Events = { type: "GO" } | { type: "STOP" };

    const machineFactory = defineMachine<Events>();

    const machine = machineFactory.create({
      config: {
        IDLE: {
          GO: "ACTIVE",
        },
        ACTIVE: {
          STOP: "IDLE",
        },
      },
      initialState: "IDLE",
      initialContext: { count: 0 },
    });

    const unsubscribe = machine.onTransition(subscriberSpy);

    machine.transition({ type: "GO" });
    expect(subscriberSpy).toHaveBeenCalledOnce();

    // Отписка от событий
    unsubscribe();

    machine.transition({ type: "STOP" });
    // Подписчик не должен быть вызван повторно
    expect(subscriberSpy).toHaveBeenCalledOnce();
  });

  it("должен поддерживать добавление middleware", () => {
    type Events = { type: "GO" } | { type: "STOP" };

    const logMiddleware = (api) => (next) => (action) => {
      const prevState = api.getState();
      const result = next(action);
      const nextState = api.getState();
      return result;
    };

    const machineFactory = defineMachine<Events>();

    const machine = machineFactory.create({
      config: {
        IDLE: {
          GO: "ACTIVE",
        },
        ACTIVE: {
          STOP: "IDLE",
        },
      },
      initialState: "IDLE",
      initialContext: { count: 0 },
    });

    machine.addMiddleware(logMiddleware);

    machine.transition({ type: "GO" });
    expect(machine.getState().state).toBe("ACTIVE");
  });

  it("должен поддерживать замену редьюсера через middleware", () => {
    type Events = { type: "INCREMENT" };

    const machineFactory = defineMachine<Events>();

    const machine = machineFactory.create({
      config: {
        IDLE: {
          INCREMENT: null,
        },
      },
      initialState: "IDLE",
      initialContext: { count: 0 },
    });

    const customMiddleware = ({ replaceReducer }) => {
      replaceReducer((originalReducer) => (state, action) => {
        if (action.type === "INCREMENT") {
          return {
            ...state,
            context: {
              ...state.context,
              count: state.context.count + 1,
            },
          };
        }
        return originalReducer(state, action);
      });

      return (next) => (action) => next(action);
    };

    machine.addMiddleware(customMiddleware);

    machine.transition({ type: "INCREMENT" });
    expect(machine.getState().context.count).toBe(1);

    machine.transition({ type: "INCREMENT" });
    expect(machine.getState().context.count).toBe(2);
  });

  it("должен поддерживать множественные middleware", () => {
    type Events = { type: "GO"; meta?: any };

    const firstMiddleware = vi.fn((api) => (next) => (action) => {
      action.meta = { ...action.meta, first: true };
      return next(action);
    });

    const secondMiddleware = vi.fn((api) => (next) => (action) => {
      action.meta = { ...action.meta, second: true };
      return next(action);
    });

    const machineFactory = defineMachine<Events>();

    const machine = machineFactory.create({
      config: {
        IDLE: {
          GO: "ACTIVE",
        },
        ACTIVE: {},
      },
      initialState: "IDLE",
      initialContext: {},
    });

    machine.addMiddleware(firstMiddleware, secondMiddleware);

    const action: Events = { type: "GO" };
    machine.transition(action);

    expect(firstMiddleware).toHaveBeenCalledOnce();
    expect(secondMiddleware).toHaveBeenCalledOnce();
  });

  it("должен поддерживать condition для ожидания условий", async () => {
    type Events = { type: "GO" } | { type: "COMPLETE" };

    const machineFactory = defineMachine<Events>();

    const machine = machineFactory.create({
      config: {
        IDLE: {
          GO: "ACTIVE",
        },
        ACTIVE: {
          COMPLETE: "COMPLETED",
        },
        COMPLETED: {},
      },
      initialState: "IDLE",
      initialContext: {},
      effects: {
        ACTIVE: async ({ transition, condition }) => {
          const completed = await condition((action) => action.type === "COMPLETE");
          expect(completed).toBe(true);
        },
      },
    });

    machine.transition({ type: "GO" });

    // Имитируем асинхронный процесс
    setTimeout(() => {
      machine.transition({ type: "COMPLETE" });
    }, 100);

    // Ждем завершения эффекта
    await vi.waitFor(() => {
      expect(machine.getState().state).toBe("COMPLETED");
    });
  });

  it("должен обрабатывать ошибки в condition", async () => {
    const errorSpy = vi.fn();

    type Events = { type: "GO" } | { type: "ANY_ACTION" };

    const machineFactory = defineMachine<Events>();

    const machine = machineFactory.create({
      config: {
        IDLE: {
          GO: "ACTIVE",
        },
        ACTIVE: {},
      },
      initialState: "IDLE",
      initialContext: {},
      effects: {
        ACTIVE: async ({ condition }) => {
          try {
            await condition((action) => {
              throw new Error("Test error in predicate");
            });
          } catch (error) {
            errorSpy(error);
          }
        },
      },
    });

    machine.transition({ type: "GO" });
    machine.transition({ type: "ANY_ACTION" });

    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalledOnce();
    });

    expect(errorSpy.mock.calls[0][0].message).toBe("Test error in predicate");
  });

  it("должен создавать фабрику машин с предустановленными опциями", () => {
    type Events = FSMEvent<"DO_INIT"> | FSMEvent<"DEBUG">;
    type Dependencies = {
      services: {
        logger: { log: (message: string) => void };
      };
    };

    const loggerMock = { log: vi.fn() };
    const errorSpy = vi.fn();

    const machineFactory = defineMachine<Events, Dependencies>({
      onError: errorSpy,
      dependencies: {
        services: {
          logger: loggerMock,
        },
      },
    });

    const machine = machineFactory.create({
      config: {
        IDLE: {
          DO_INIT: "READY",
        },
        READY: {},
      },
      initialState: "IDLE",
      initialContext: { value: 1 },
      effects: {
        READY: async ({ services }) => {
          services.logger.log("машина готова");
        },
      },
    });

    machine.transition({ type: "DO_INIT" });

    expect(machine.getState().state).toBe("READY");

    // Проверяем, что зависимости были переданы в эффект
    return vi.waitFor(() => {
      expect(loggerMock.log).toHaveBeenCalledWith("машина готова");
    });
  });

  it("должен обрабатывать ошибки в эффектах с фабрикой машин", async () => {
    const errorSpy = vi.fn();
    const errorEffect = vi.fn().mockRejectedValue(new Error("Test factory error"));

    type Events = { type: "GO" };

    const machineFactory = defineMachine<Events>({
      onError: errorSpy,
    });

    const machine = machineFactory.create({
      config: {
        IDLE: {
          GO: "ACTIVE",
        },
        ACTIVE: {},
      },
      initialState: "IDLE",
      initialContext: {},
      effects: {
        ACTIVE: errorEffect,
      },
    });

    machine.transition({ type: "GO" });

    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalledOnce();
    });

    expect(errorEffect).toHaveBeenCalledOnce();
  });

  it("должен тестировать создание различных машин из одной фабрики", () => {
    type Events = { type: "INCREMENT" } | { type: "DECREMENT" } | { type: "RESET" };

    const machineFactory = defineMachine<Events>();

    // Создаем первую машину
    const firstMachine = machineFactory.create({
      config: {
        IDLE: {
          INCREMENT: "COUNTING",
          DECREMENT: "COUNTING",
        },
        COUNTING: {
          RESET: "IDLE",
        },
      },
      initialState: "IDLE",
      initialContext: { count: 0 },
    });

    // Создаем вторую машину из той же фабрики
    const secondMachine = machineFactory.create({
      config: {
        START: {
          INCREMENT: "RUNNING",
        },
        RUNNING: {
          RESET: "START",
        },
      },
      initialState: "START",
      initialContext: { total: 100 },
    });

    // Проверяем что машины независимы друг от друга
    firstMachine.transition({ type: "INCREMENT" });
    expect(firstMachine.getState().state).toBe("COUNTING");
    expect(secondMachine.getState().state).toBe("START");

    secondMachine.transition({ type: "INCREMENT" });
    expect(secondMachine.getState().state).toBe("RUNNING");

    firstMachine.transition({ type: "RESET" });
    expect(firstMachine.getState().state).toBe("IDLE");
    expect(secondMachine.getState().state).toBe("RUNNING");
  });
});
