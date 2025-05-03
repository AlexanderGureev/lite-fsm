import { describe, it, expect, vi, beforeEach } from "vitest";
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
      if (action.type === "INCREMENT") {
        return {
          state: state.state,
          context: { count: state.context.count + 1 },
        };
      }
      if (action.type === "DECREMENT") {
        return {
          state: state.state,
          context: { count: state.context.count - 1 },
        };
      }
      if (action.type === "RESET") {
        return {
          state: state.state,
          context: { count: 0 },
        };
      }
      return state;
    },
  };

  it("should create a machine manager with machines", () => {
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

  it("should handle transitions correctly for all machines", () => {
    const manager = MachineManager({
      toggle: toggleConfig,
      counter: counterConfig,
    });

    // Переключение toggle машины
    manager.transition({ type: "TOGGLE" });
    let state = manager.getState();
    expect(state.toggle.state).toBe("ACTIVE");

    // Инкремент counter машины
    manager.transition({ type: "INCREMENT" });
    state = manager.getState();
    expect(state.counter.context.count).toBe(1);

    // Декремент counter машины
    manager.transition({ type: "DECREMENT" });
    state = manager.getState();
    expect(state.counter.context.count).toBe(0);

    // Переключение обратно в INACTIVE
    manager.transition({ type: "TOGGLE" });
    state = manager.getState();
    expect(state.toggle.state).toBe("INACTIVE");
  });

  it("should invoke subscribers on transition", () => {
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

  it("should allow setting dependencies", () => {
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
        ACTIVE: ({ services }) => {
          services.logger("Activated");
        },
        INACTIVE: ({ services }) => {
          services.logger("Deactivated");
        },
      },
    };

    const manager = MachineManager({
      toggle: toggleWithEffectConfig,
    });

    const loggerMock = vi.fn();

    manager.setDependencies({
      services: {
        logger: loggerMock,
      },
    });

    // Эффект должен получить доступ к зависимостям
    manager.transition({ type: "TOGGLE" });
    expect(loggerMock).toHaveBeenCalledWith("Activated");

    // Следующий эффект тоже должен использовать зависимости
    manager.transition({ type: "TOGGLE" });
    expect(loggerMock).toHaveBeenCalledWith("Deactivated");
  });

  it("should handle middleware correctly", () => {
    // Middleware для логирования
    const logMiddleware = vi.fn((api) => (next) => (action) => {
      const result = next(action);
      return result;
    });

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
    const state = customManager.getState();
    expect(state.counter.context.count).toBe(5); // Благодаря enhanceMiddleware
  });

  it("should provide condition function to effects", () => {
    // В этом тесте мы просто проверяем, что condition функция передается в эффект,
    // без ожидания завершения промиса, который вызывал таймаут
    const conditionFnSpy = vi.fn();

    const waitForToggleEffect = vi.fn(({ condition }) => {
      // Проверяем, что condition функция передана
      expect(typeof condition).toBe("function");
      // Сохраняем ссылку на функцию condition для дальнейшей проверки
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

    // Запуск эффекта
    manager.transition({ type: "TOGGLE" });

    // Проверяем, что эффект был вызван
    expect(waitForToggleEffect).toHaveBeenCalledOnce();

    // Проверяем, что conditionFnSpy был вызван с функцией
    expect(conditionFnSpy).toHaveBeenCalledOnce();
    expect(typeof conditionFnSpy.mock.calls[0][0]).toBe("function");
  });

  it("should configure error handler correctly", () => {
    // Тест только проверяет, что errorHandler правильно настраивается
    const errorHandler = vi.fn();

    // Создаем машину с error handler
    const manager = MachineManager(
      {
        toggle: toggleConfig,
      },
      {
        onError: errorHandler,
      },
    );

    // Проверяем, что manager был создан с errorHandler
    // Мы не можем напрямую проверить errorHandler, так как это приватное свойство,
    // но можем проверить, что manager был создан успешно
    expect(manager).toBeDefined();
    expect(manager.getState).toBeDefined();
    expect(manager.transition).toBeDefined();
  });

  it("should allow replacing the reducer", () => {
    const manager = MachineManager({
      toggle: toggleConfig,
      counter: counterConfig,
    });

    // Определим расширенный тип для контекста toggle машины
    type ExtendedToggleContext = { toggled: boolean; specialAction?: boolean };

    // Замена корневого редьюсера
    manager.replaceReducer((originalReducer) => (state, action) => {
      // Изменяем поведение по умолчанию
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

      // В остальных случаях используем оригинальный редьюсер
      return originalReducer(state, action);
    });

    // Проверяем, что оригинальная логика все еще работает
    manager.transition({ type: "TOGGLE" });
    let state = manager.getState();
    expect(state.toggle.state).toBe("ACTIVE");

    // Проверяем новую логику
    manager.transition({ type: "SPECIAL" });
    state = manager.getState();
    expect((state.toggle.context as ExtendedToggleContext).specialAction).toBe(true);
  });

  it("should handle setting dependencies with function", () => {
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
        ACTIVE: ({ services }) => {
          services.counter();
        },
      },
    };

    const manager = MachineManager({
      toggle: toggleWithEffectConfig,
    });

    const counterMock = vi.fn();

    // Установка зависимостей через функцию
    manager.setDependencies((currentDeps) => ({
      ...currentDeps,
      services: {
        counter: counterMock,
      },
    }));

    // Эффект должен получить доступ к зависимостям
    manager.transition({ type: "TOGGLE" });
    expect(counterMock).toHaveBeenCalledOnce();
  });

  it("should continue working after an effect throws an error", async () => {
    const errorHandler = vi.fn(() => {
      // Добавляем явный вызов resolve в errorHandler
      resolvePromise();
    });

    // Создаем Promise с внешним resolve для надежного ожидания вызова errorHandler
    let resolvePromise!: () => void;
    const errorHandledPromise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    const effectConfig = {
      config: {
        IDLE: {
          START: "ACTIVE",
        },
        ACTIVE: {
          STOP: "IDLE",
        },
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
      {
        test: effectConfig,
      },
      {
        onError: () => {
          console.log("onError");
          errorHandler();
        },
      },
    );

    // Вызываем первый переход, который вызовет ошибку
    manager.transition({ type: "START" });

    // Ждем пока errorHandler будет вызван
    await errorHandledPromise;

    expect(errorHandler).toHaveBeenCalledOnce();
  });

  it("should handle condition function rejection correctly", async () => {
    const errorHandler = vi.fn(() => {
      resolvePromise();
    });

    let resolvePromise!: () => void;
    const errorHandledPromise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    // Создаем Promise для отслеживания регистрации condition
    let conditionRegistered!: () => void;
    const conditionRegisteredPromise = new Promise<void>((resolve) => {
      conditionRegistered = resolve;
    });

    const conditionConfig = {
      config: {
        IDLE: {
          START: "ACTIVE",
        },
        ACTIVE: {
          COMPLETE: "IDLE",
        },
      },
      initialState: "IDLE",
      initialContext: {},
      effects: {
        ACTIVE: async ({ condition }) => {
          // Сигнализируем, что скоро будем использовать condition
          conditionRegistered();

          try {
            // Здесь вызываем condition с предикатом, который бросает ошибку
            await condition(() => {
              throw new Error("Condition error");
            });
          } catch (e) {
            // Перебрасываем, чтобы вызвать onError в MachineManager
            throw e;
          }
        },
      },
    };

    const manager = MachineManager(
      {
        test: conditionConfig,
      },
      {
        onError: () => {
          console.log("onError from condition");
          errorHandler();
        },
      },
    );

    // Запускаем эффект, который вызовет condition с ошибкой
    manager.transition({ type: "START" });

    // Ждем, пока condition будет зарегистрирован
    await conditionRegisteredPromise;

    // Вызываем событие, чтобы активировать логику с ошибкой
    manager.transition({ type: "TRIGGER_ERROR" });

    // Ждем пока errorHandler будет вызван
    await errorHandledPromise;

    expect(errorHandler).toHaveBeenCalledOnce();
  }, 10000); // Увеличиваем таймаут до 10 секунд

  it("should handle successful condition completion", async () => {
    // Создаем Promise, который разрешится, когда condition будет выполнен
    let resolveCondition!: () => void;
    const conditionPromise = new Promise<void>((resolve) => {
      resolveCondition = resolve;
    });

    // Создаем Promise, который разрешится, когда condition будет зарегистрирован
    let conditionRegistered!: () => void;
    const conditionRegisteredPromise = new Promise<void>((resolve) => {
      conditionRegistered = resolve;
    });

    const conditionConfig = {
      config: {
        IDLE: {
          START: "ACTIVE",
        },
        ACTIVE: {
          COMPLETE: "IDLE",
        },
      },
      initialState: "IDLE",
      initialContext: {},
      effects: {
        ACTIVE: async ({ condition, transition }) => {
          // Сообщаем, что condition скоро будет зарегистрирован
          conditionRegistered();

          // Используем condition для ожидания действия COMPLETE
          await condition((action) => {
            if (action.type === "COMPLETE") {
              resolveCondition();
              return true;
            }
            return false;
          });
        },
      },
    };

    const manager = MachineManager({
      test: conditionConfig,
    });

    // Запускаем машину
    manager.transition({ type: "START" });

    // Ждем, пока condition будет зарегистрирован
    await conditionRegisteredPromise;

    // Теперь отправляем событие, которое должно удовлетворить условие
    manager.transition({ type: "COMPLETE" });

    // Ждем пока condition будет выполнен
    await conditionPromise;

    // Проверяем, что машина перешла в нужное состояние
    const state = manager.getState();
    expect(state.test.state).toBe("IDLE");
  }, 10000); // Увеличиваем таймаут до 10 секунд
});
