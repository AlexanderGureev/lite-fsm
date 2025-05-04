import { describe, it, expect, vi } from "vitest";
import { CreateMachine } from "../../src/core/Machine";
import { MachineManager } from "../../src/core/MachineManager";
import { WILDCARD } from "../../src/core/utils";

describe("MachineManager", () => {
  // Базовая конфигурация для тестов
  const toggleConfig = {
    config: {
      INACTIVE: {
        TOGGLE: "ACTIVE",
      },
      ACTIVE: {
        TOGGLE: "INACTIVE",
      },
    },
    initialState: "INACTIVE",
    initialContext: { toggled: false },
  };

  const counterConfig = {
    config: {
      IDLE: {
        INCREMENT: null,
        DECREMENT: null,
        RESET: null,
      },
    },
    initialState: "IDLE",
    initialContext: { count: 0 },
    reducer: (state, action) => {
      switch (action.type) {
        case "INCREMENT":
          return {
            state: state.state,
            context: { count: state.context.count + 1 },
          };
        case "DECREMENT":
          return {
            state: state.state,
            context: { count: state.context.count - 1 },
          };
        case "RESET":
          return {
            state: state.state,
            context: { count: 0 },
          };
        default:
          return state;
      }
    },
  };

  it("должен создавать менеджер машин с машинами", () => {
    const manager = MachineManager({
      toggle: toggleConfig,
      counter: counterConfig,
    });

    const state = manager.getState();
    expect(state.toggle.state).toBe("INACTIVE");
    expect(state.toggle.context).toEqual({ toggled: false });
    expect(state.counter.state).toBe("IDLE");
    expect(state.counter.context).toEqual({ count: 0 });
  });

  it("должен корректно обрабатывать переходы для всех машин", () => {
    const manager = MachineManager({
      toggle: toggleConfig,
      counter: counterConfig,
    });

    // Переключение toggle машины
    manager.transition({ type: "TOGGLE" });
    expect(manager.getState().toggle.state).toBe("ACTIVE");

    // Инкремент counter машины
    manager.transition({ type: "INCREMENT" });
    expect(manager.getState().counter.context.count).toBe(1);

    // Декремент counter машины
    manager.transition({ type: "DECREMENT" });
    expect(manager.getState().counter.context.count).toBe(0);

    // Переключение обратно в INACTIVE
    manager.transition({ type: "TOGGLE" });
    expect(manager.getState().toggle.state).toBe("INACTIVE");
  });

  it("должен вызывать подписчиков при переходе", () => {
    const manager = MachineManager({
      toggle: toggleConfig,
      counter: counterConfig,
    });

    const subscriber = vi.fn();
    const unsubscribe = manager.onTransition(subscriber);

    // Подписка должна работать
    manager.transition({ type: "TOGGLE" });

    expect(subscriber).toHaveBeenCalledOnce();
    const [prevState, currentState, action] = subscriber.mock.calls[0];

    expect(prevState.toggle.state).toBe("INACTIVE");
    expect(currentState.toggle.state).toBe("ACTIVE");
    expect(action).toEqual({ type: "TOGGLE" });

    // Отписка должна работать
    subscriber.mockClear();
    unsubscribe();

    manager.transition({ type: "INCREMENT" });
    expect(subscriber).not.toHaveBeenCalled();
  });

  it("должен позволять устанавливать зависимости", () => {
    const loggerMock = vi.fn();

    const toggleWithEffectConfig = {
      config: {
        INACTIVE: {
          TOGGLE: "ACTIVE",
        },
        ACTIVE: {
          TOGGLE: "INACTIVE",
        },
      },
      initialState: "INACTIVE",
      initialContext: { toggled: false },
      effects: {
        ACTIVE: ({ services }) => services.logger("Activated"),
        INACTIVE: ({ services }) => services.logger("Deactivated"),
      },
    };

    const manager = MachineManager({
      toggle: toggleWithEffectConfig,
    });

    manager.setDependencies({
      services: { logger: loggerMock },
    });

    // Эффект должен получить доступ к зависимостям
    manager.transition({ type: "TOGGLE" });
    expect(loggerMock).toHaveBeenCalledWith("Activated");

    // Следующий эффект тоже должен использовать зависимости
    manager.transition({ type: "TOGGLE" });
    expect(loggerMock).toHaveBeenCalledWith("Deactivated");
  });

  it("должен корректно обрабатывать middleware", () => {
    // Middleware для логирования
    const logMiddleware = vi.fn((api) => (next) => (action) => next(action));

    // Middleware для добавления данных к action
    const enhanceMiddleware = vi.fn((api) => (next) => (action) => {
      if (action.type === "INCREMENT") {
        return next({ ...action, payload: { amount: 5 } });
      }
      return next(action);
    });

    const manager = MachineManager(
      {
        toggle: toggleConfig,
        counter: counterConfig,
      },
      {
        middleware: [logMiddleware, enhanceMiddleware],
      },
    );

    // Проверка, что middleware были вызваны при создании
    expect(logMiddleware).toHaveBeenCalledOnce();
    expect(enhanceMiddleware).toHaveBeenCalledOnce();

    // Проверка работы enhanceMiddleware
    const customCounterConfig = {
      config: {
        IDLE: {
          INCREMENT: null,
        },
      },
      initialState: "IDLE",
      initialContext: { count: 0 },
      reducer: (state, action) => {
        if (action.type === "INCREMENT") {
          const amount = action.payload?.amount || 1;
          return {
            state: state.state,
            context: { count: state.context.count + amount },
          };
        }
        return state;
      },
    };

    const customManager = MachineManager(
      {
        counter: customCounterConfig,
      },
      {
        middleware: [enhanceMiddleware],
      },
    );

    customManager.transition({ type: "INCREMENT" });
    expect(customManager.getState().counter.context.count).toBe(5); // Благодаря enhanceMiddleware
  });

  it("должен предоставлять функцию condition для эффектов", () => {
    const conditionFnSpy = vi.fn();

    const waitForToggleEffect = vi.fn(({ condition }) => {
      // Проверяем, что condition функция передана и сохраняем ссылку
      expect(typeof condition).toBe("function");
      conditionFnSpy(condition);
    });

    const toggleWithEffectConfig = {
      config: {
        INACTIVE: {
          TOGGLE: "ACTIVE",
        },
        ACTIVE: {
          TOGGLE: "INACTIVE",
          COMPLETED: null,
        },
      },
      initialState: "INACTIVE",
      initialContext: { toggled: false },
      effects: {
        ACTIVE: waitForToggleEffect,
      },
    };

    const manager = MachineManager({
      toggle: toggleWithEffectConfig,
    });

    manager.transition({ type: "TOGGLE" });

    expect(waitForToggleEffect).toHaveBeenCalledOnce();
    expect(conditionFnSpy).toHaveBeenCalledOnce();
    expect(typeof conditionFnSpy.mock.calls[0][0]).toBe("function");
  });

  it("должен корректно настраивать обработчик ошибок", () => {
    const errorHandler = vi.fn();

    const manager = MachineManager({ toggle: toggleConfig }, { onError: errorHandler });

    // Проверяем, что manager был создан успешно
    expect(manager).toBeDefined();
    expect(manager.getState).toBeDefined();
    expect(manager.transition).toBeDefined();
  });

  it("должен позволять заменять редьюсер", () => {
    const manager = MachineManager({
      toggle: toggleConfig,
      counter: counterConfig,
    });

    // Определим расширенный тип для контекста toggle машины
    type ExtendedToggleContext = { toggled: boolean; specialAction?: boolean };

    // Замена корневого редьюсера
    manager.replaceReducer((originalReducer) => (state, action) => {
      if (action.type === "SPECIAL") {
        return {
          ...state,
          toggle: {
            ...state.toggle,
            context: {
              ...state.toggle.context,
              specialAction: true,
            } as ExtendedToggleContext,
          },
        };
      }
      return originalReducer(state, action);
    });

    // Проверяем, что оригинальная логика все еще работает
    manager.transition({ type: "TOGGLE" });
    expect(manager.getState().toggle.state).toBe("ACTIVE");

    // Проверяем новую логику
    manager.transition({ type: "SPECIAL" });
    expect((manager.getState().toggle.context as ExtendedToggleContext).specialAction).toBe(true);
  });

  it("должен обрабатывать установку зависимостей через функцию", () => {
    const counterMock = vi.fn();

    const toggleWithEffectConfig = {
      config: {
        INACTIVE: { TOGGLE: "ACTIVE" },
        ACTIVE: { TOGGLE: "INACTIVE" },
      },
      initialState: "INACTIVE",
      initialContext: { toggled: false },
      effects: {
        ACTIVE: ({ services }) => services.counter(),
      },
    };

    const manager = MachineManager({
      toggle: toggleWithEffectConfig,
    });

    // Установка зависимостей через функцию
    manager.setDependencies((currentDeps) => ({
      ...currentDeps,
      services: { counter: counterMock },
    }));

    manager.transition({ type: "TOGGLE" });
    expect(counterMock).toHaveBeenCalledOnce();
  });

  it("должен продолжать работу после выброса ошибки в эффекте", async () => {
    const errorHandler = vi.fn();

    const effectConfig = {
      config: {
        IDLE: { START: "ACTIVE" },
        ACTIVE: { STOP: "IDLE" },
      },
      initialState: "IDLE",
      initialContext: {},
      effects: {
        ACTIVE: () => {
          throw new Error("Effect error");
        },
      },
    };

    const manager = MachineManager(
      { test: effectConfig },
      {
        onError: errorHandler,
      },
    );

    manager.transition({ type: "START" });

    await vi.waitFor(() => {
      expect(errorHandler).toHaveBeenCalledOnce();
    });
  });

  it("должен корректно обрабатывать отклонение функции condition", async () => {
    const errorHandler = vi.fn();

    const conditionConfig = {
      config: {
        IDLE: { START: "ACTIVE" },
        ACTIVE: { COMPLETE: "IDLE" },
      },
      initialState: "IDLE",
      initialContext: {},
      effects: {
        ACTIVE: async ({ condition }) => {
          await condition(() => {
            throw new Error("Condition error");
          });
        },
      },
    };

    const manager = MachineManager(
      { test: conditionConfig },
      {
        onError: errorHandler,
      },
    );

    manager.transition({ type: "START" });
    manager.transition({ type: "TRIGGER_ERROR" });

    await vi.waitFor(() => {
      expect(errorHandler).toHaveBeenCalledOnce();
    });
  });

  it("должен обрабатывать успешное завершение condition", async () => {
    const effectCompletedSpy = vi.fn();

    const conditionConfig = {
      config: {
        IDLE: { START: "ACTIVE" },
        ACTIVE: { COMPLETE: "IDLE" },
      },
      initialState: "IDLE",
      initialContext: {},
      effects: {
        ACTIVE: async ({ condition }) => {
          await condition((action) => action.type === "COMPLETE");
          effectCompletedSpy();
        },
      },
    };

    const manager = MachineManager({
      test: conditionConfig,
    });

    manager.transition({ type: "START" });
    manager.transition({ type: "COMPLETE" });

    await vi.waitFor(() => {
      expect(effectCompletedSpy).toHaveBeenCalledOnce();
    });

    expect(manager.getState().test.state).toBe("IDLE");
  });
});
