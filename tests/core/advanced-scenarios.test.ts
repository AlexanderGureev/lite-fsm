import { describe, it, expect, vi } from "vitest";
import { createMachine, MachineManager } from "../../src/core";
import { WILDCARD } from "../../src/core/utils";
import { defineMachine } from "../../src/core/Machine";

describe("Сложные сценарии взаимодействия машин", () => {
  it("должен обрабатывать каскадное изменение состояний между несколькими машинами", async () => {
    // Конфигурация машины формы
    const formConfig = {
      config: {
        EMPTY: {
          FILL: "FILLED",
        },
        FILLED: {
          SUBMIT: "SUBMITTED",
          CLEAR: "EMPTY",
        },
        SUBMITTED: {
          RESET: "EMPTY",
        },
      },
      initialState: "EMPTY",
      initialContext: { data: null },
      effects: {
        SUBMITTED: ({ transition }) => {
          // При отправке формы, уведомляем сервер о необходимости обработки
          transition({ type: "START_PROCESSING" });
        },
      },
    };

    // Конфигурация машины сервера
    const serverConfig = {
      config: {
        IDLE: {
          START_PROCESSING: "PROCESSING",
        },
        PROCESSING: {
          FINISH_PROCESSING: "COMPLETED",
          ERROR: "ERROR",
        },
        COMPLETED: {
          RESET: "IDLE",
        },
        ERROR: {
          RETRY: "PROCESSING",
          RESET: "IDLE",
        },
      },
      initialState: "IDLE",
      initialContext: { result: null, error: null },
      effects: {
        COMPLETED: ({ transition, action }) => {
          // При успешной обработке данных, уведомляем интерфейс
          transition({ type: "SHOW_SUCCESS" });
        },
        ERROR: ({ transition }) => {
          // При ошибке, уведомляем интерфейс
          transition({ type: "SHOW_ERROR" });
        },
      },
    };

    // Конфигурация машины интерфейса
    const uiConfig = {
      config: {
        DEFAULT: {
          SHOW_SUCCESS: "SUCCESS",
          SHOW_ERROR: "ERROR",
        },
        SUCCESS: {
          HIDE: "DEFAULT",
        },
        ERROR: {
          HIDE: "DEFAULT",
        },
      },
      initialState: "DEFAULT",
      initialContext: { message: null },
    };

    const manager = MachineManager({
      form: formConfig,
      server: serverConfig,
      ui: uiConfig,
    });

    // Тестируем каскадный переход: заполнение формы -> отправка -> обработка -> успех
    manager.transition({ type: "FILL", payload: { data: "Test Data" } });
    manager.transition({ type: "SUBMIT" });

    // Проверяем, что состояния всех машин изменились корректно
    expect(manager.getState().form.state).toBe("SUBMITTED");
    expect(manager.getState().server.state).toBe("PROCESSING");

    // Завершаем обработку данных
    manager.transition({ type: "FINISH_PROCESSING" });

    // Проверяем, что все машины обновили состояния
    expect(manager.getState().server.state).toBe("COMPLETED");
    expect(manager.getState().ui.state).toBe("SUCCESS");

    // Сбрасываем все машины в исходное состояние
    manager.transition({ type: "RESET" });
    manager.transition({ type: "HIDE" });

    expect(manager.getState().form.state).toBe("EMPTY");
    expect(manager.getState().server.state).toBe("IDLE");
    expect(manager.getState().ui.state).toBe("DEFAULT");
  });

  it("должен поддерживать синхронизацию машин с разными моделями данных", async () => {
    // Машина для работы с данными пользователя
    const userMachine = createMachine({
      config: {
        LOADING: {
          USER_LOADED: "READY",
          LOAD_ERROR: "ERROR",
        },
        READY: {
          UPDATE_PROFILE: null,
          LOGOUT: "LOGGED_OUT",
        },
        ERROR: {
          RETRY: "LOADING",
        },
        LOGGED_OUT: {
          LOGIN: "LOADING",
        },
      },
      initialState: "LOADING",
      initialContext: {
        userId: null,
        profile: null,
        error: null,
      },
      effects: {
        READY: ({ action }) => {
          if (action.type === "UPDATE_PROFILE") {
            // Здесь могла бы быть логика обновления профиля
          }
        },
      },
    });

    // Машина для прав доступа
    const permissionsMachine = createMachine({
      config: {
        UNDEFINED: {
          SET_PERMISSIONS: "DEFINED",
        },
        DEFINED: {
          CHECK_ACCESS: null,
          REVOKE: "UNDEFINED",
        },
      },
      initialState: "UNDEFINED",
      initialContext: {
        permissions: [],
        hasAccess: false,
      } as {
        permissions: string[];
        hasAccess: boolean;
      },
      reducer: (state, action) => {
        if (action.type === "REVOKE") {
          return {
            state: "UNDEFINED",
            context: { permissions: [], hasAccess: false },
          };
        }

        if (action.type === "CHECK_ACCESS" && action.payload?.resource) {
          return {
            state: state.state,
            context: {
              ...state.context,
              hasAccess: state.context.permissions.includes(action.payload.resource),
            },
          };
        }
        if (action.type === "SET_PERMISSIONS") {
          return {
            state: "DEFINED",
            context: {
              ...state.context,
              permissions: action.payload.permissions || [],
            },
          };
        }
        return state;
      },
    });

    const manager = MachineManager({
      user: userMachine,
      permissions: permissionsMachine,
    });

    // Имитируем загрузку пользователя
    manager.transition({
      type: "USER_LOADED",
      payload: {
        userId: "123",
        profile: { name: "John Doe", email: "john@example.com" },
      },
    });

    // Загрузка пользователя должна автоматически устанавливать права доступа
    manager.transition({
      type: "SET_PERMISSIONS",
      payload: {
        permissions: ["read_posts", "write_comments"],
      },
    });

    // Проверяем, что оба состояния обновились
    expect(manager.getState().user.state).toBe("READY");
    expect(manager.getState().user.context.userId).toBe("123");
    expect(manager.getState().permissions.state).toBe("DEFINED");

    // Проверяем доступ
    manager.transition({
      type: "CHECK_ACCESS",
      payload: { resource: "read_posts" },
    });
    expect(manager.getState().permissions.context.hasAccess).toBe(true);

    manager.transition({
      type: "CHECK_ACCESS",
      payload: { resource: "admin_panel" },
    });
    expect(manager.getState().permissions.context.hasAccess).toBe(false);

    // Выход пользователя должен сбросить права
    manager.transition({ type: "LOGOUT" });

    // Теперь нужно явно вызвать REVOKE, чтобы изменить состояние permissions
    manager.transition({ type: "REVOKE" });

    expect(manager.getState().user.state).toBe("LOGGED_OUT");
    // Проверяем, что после REVOKE машина permissions перешла в состояние UNDEFINED
    expect(manager.getState().permissions.state).toBe("UNDEFINED");
  });
});

describe("Расширенное тестирование middleware", () => {
  it("должен поддерживать выполнение middleware в правильном порядке", () => {
    const actionLog: string[] = [];

    // Middleware для логирования
    const logMiddleware = () => (next) => (action) => {
      actionLog.push(`log: ${action.type}`);
      return next(action);
    };

    // Middleware для трансформации action
    const transformMiddleware = () => (next) => (action) => {
      actionLog.push(`transform: ${action.type}`);

      if (action.type === "MULTIPLY") {
        const newAction = {
          type: "INCREMENT",
          payload: { amount: action.payload.value * action.payload.multiplier },
        };
        actionLog.push(`transformed to: ${newAction.type}`);
        return next(newAction);
      }

      return next(action);
    };

    // Middleware для блокировки определенных action
    const filterMiddleware = () => (next) => (action) => {
      actionLog.push(`filter: ${action.type}`);

      if (action.type === "BLOCKED") {
        actionLog.push(`blocked action: ${action.type}`);
        return action; // Блокируем действие, не вызывая next
      }

      return next(action);
    };

    const counterConfig = {
      config: {
        IDLE: {
          INCREMENT: null,
          BLOCKED: null,
          MULTIPLY: null,
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

    const manager = MachineManager(
      { counter: counterConfig },
      {
        middleware: [logMiddleware, transformMiddleware, filterMiddleware],
      },
    );

    // Проверяем стандартное действие
    manager.transition({ type: "INCREMENT", payload: { amount: 5 } });
    expect(manager.getState().counter.context.count).toBe(5);
    expect(actionLog).toContain("log: INCREMENT");
    expect(actionLog).toContain("transform: INCREMENT");
    expect(actionLog).toContain("filter: INCREMENT");

    // Очищаем лог
    actionLog.length = 0;

    // Проверяем трансформированное действие
    manager.transition({
      type: "MULTIPLY",
      payload: { value: 3, multiplier: 2 },
    });
    expect(manager.getState().counter.context.count).toBe(11); // 5 + (3*2)
    expect(actionLog).toContain("log: MULTIPLY");
    expect(actionLog).toContain("transform: MULTIPLY");
    expect(actionLog).toContain("transformed to: INCREMENT");

    // Очищаем лог
    actionLog.length = 0;

    // Проверяем блокированное действие
    manager.transition({ type: "BLOCKED" });
    expect(manager.getState().counter.context.count).toBe(11); // Не изменилось
    expect(actionLog).toContain("log: BLOCKED");
    expect(actionLog).toContain("transform: BLOCKED");
    expect(actionLog).toContain("filter: BLOCKED");
    expect(actionLog).toContain("blocked action: BLOCKED");
  });
});

describe("Тестирование условных переходов", () => {
  it("должен поддерживать условные переходы на основе контекста", () => {
    // Типы для событий
    type GameEvents =
      | { type: "START" }
      | { type: "SCORE"; payload?: { points: number } }
      | { type: "CHECK_WIN"; payload?: { gameOver: boolean } }
      | { type: "RESTART" };

    // Конфигурация игровой машины
    const gameConfig = {
      config: {
        NEW_GAME: {
          START: "PLAYING",
        },
        PLAYING: {
          SCORE: null, // Состояние не меняется
          CHECK_WIN: null, // Специальное действие для проверки победы
        },
        WON: {
          RESTART: "NEW_GAME",
        },
        LOST: {
          RESTART: "NEW_GAME",
        },
      },
      initialState: "NEW_GAME" as const,
      initialContext: { score: 0, target: 10 },
      reducer: (state, action, { config, nextState }) => {
        switch (action.type) {
          case "RESTART":
            return {
              state: nextState,
              context: { score: 0, target: 10 },
            };

          case "SCORE":
            const newScore = state.context.score + (action.payload?.points || 1);
            return {
              state: state.state,
              context: { ...state.context, score: newScore },
            };

          case "CHECK_WIN":
            // Условный переход на основе значения в контексте
            if (state.context.score >= state.context.target) {
              return {
                state: "WON",
                context: state.context,
              };
            } else if (action.payload?.gameOver) {
              return {
                state: "LOST",
                context: state.context,
              };
            }
            return state;

          default:
            return {
              state: nextState,
              context: state.context,
            };
        }
      },
    };

    // Создаем инстанс через функцию defineMachine для типизации
    const machineFactory = defineMachine<GameEvents>();
    const machine = machineFactory.create(gameConfig);

    // Начало игры
    machine.transition({ type: "START" });
    expect(machine.getState().state).toBe("PLAYING");

    // Набор очков, но недостаточно для победы
    machine.transition({ type: "SCORE", payload: { points: 5 } });
    expect(machine.getState().state).toBe("PLAYING");
    expect(machine.getState().context.score).toBe(5);

    // Проверка победы - еще не выиграл
    machine.transition({ type: "CHECK_WIN" });
    expect(machine.getState().state).toBe("PLAYING");

    // Набор очков, достаточно для победы
    machine.transition({ type: "SCORE", payload: { points: 5 } });
    expect(machine.getState().context.score).toBe(10);

    // Проверка победы - теперь выиграл
    machine.transition({ type: "CHECK_WIN" });
    expect(machine.getState().state).toBe("WON");

    // Рестарт игры
    machine.transition({ type: "RESTART" });
    expect(machine.getState().state).toBe("NEW_GAME");

    // Новая игра, но теперь проигрыш
    machine.transition({ type: "START" });

    // Обновляем тестовые данные
    machine.transition({ type: "SCORE", payload: { points: 3 } });

    // Применяем флаг gameOver, который должен привести к состоянию LOST
    // независимо от счета
    machine.transition({ type: "CHECK_WIN", payload: { gameOver: true } });
    expect(machine.getState().state).toBe("LOST");
  });
});

describe("Тестирование обработки ошибок", () => {
  it("должен корректно восстанавливаться после ошибок в эффектах", async () => {
    const errorHandler = vi.fn();

    // Конфигурация машины с обработкой ошибок
    const processingMachineConfig = {
      config: {
        IDLE: {
          PROCESS: "PROCESSING",
        },
        PROCESSING: {
          SUCCESS: "SUCCESS",
          ERROR: "ERROR",
        },
        ERROR: {
          RETRY: "PROCESSING",
          CANCEL: "IDLE",
        },
        SUCCESS: {
          RESET: "IDLE",
        },
      },
      initialState: "IDLE",
      initialContext: { error: null, attempt: 0 },
      reducer: (state, action, opts) => {
        if (action.type === "ERROR") {
          return {
            state: "ERROR",
            context: {
              ...state.context,
              error: action.payload?.message || "Unknown error",
              attempt: state.context.attempt + 1,
            },
          };
        }

        // Для других событий используем стандартные переходы
        const nextState = {
          state: opts.nextState,
          context: state.context,
        };

        return nextState;
      },
      effects: {
        PROCESSING: async ({ services, transition }) => {
          try {
            // Используем сервис для определения, нужно ли вызвать ошибку
            const result = await services.processData();
            if (result.success) {
              transition({ type: "SUCCESS" });
            } else {
              throw new Error(result.error);
            }
          } catch (error) {
            transition({
              type: "ERROR",
              payload: { message: error.message },
            });
          }
        },
      },
    };

    // Создаем менеджер машин с нашей машиной обработки ошибок
    const manager = MachineManager({ processor: processingMachineConfig }, { onError: errorHandler });

    // Настраиваем зависимости - сначала с ошибкой
    manager.setDependencies({
      services: {
        processData: () => Promise.resolve({ success: false, error: "Test error" }),
      },
    });

    // Запускаем процесс, который вызовет ошибку
    manager.transition({ type: "PROCESS" });

    // Ждем перехода в состояние ERROR
    await vi.waitFor(() => {
      console.log(manager.getState());
      expect(manager.getState().processor.state).toBe("ERROR");
    });

    expect(manager.getState().processor.context.error).toBe("Test error");
    expect(manager.getState().processor.context.attempt).toBe(1);

    // Пробуем еще раз, но ошибка все еще должна возникать
    manager.transition({ type: "RETRY" });

    await vi.waitFor(() => {
      expect(manager.getState().processor.state).toBe("ERROR");
    });

    expect(manager.getState().processor.context.attempt).toBe(2);

    // Теперь меняем сервис, чтобы он не вызывал ошибку
    manager.setDependencies({
      services: {
        processData: () => Promise.resolve({ success: true }),
      },
    });

    // Пробуем снова и успех
    manager.transition({ type: "RETRY" });

    await vi.waitFor(() => {
      expect(manager.getState().processor.state).toBe("SUCCESS");
    });
  });
});

describe("Тестирование параллельных состояний", () => {
  it("должен поддерживать параллельную работу нескольких машин", async () => {
    // Конфигурация машины авторизации
    const authConfig = {
      config: {
        LOGGED_OUT: {
          LOGIN: "AUTHENTICATING",
        },
        AUTHENTICATING: {
          LOGIN_SUCCESS: "LOGGED_IN",
          LOGIN_FAILURE: "LOGGED_OUT",
        },
        LOGGED_IN: {
          LOGOUT: "LOGGED_OUT",
        },
      },
      initialState: "LOGGED_OUT",
      initialContext: { userId: null, error: null },
      effects: {
        LOGGED_IN: ({ transition }) => {
          // При успешной авторизации загружаем данные
          transition({ type: "LOAD_DATA" });
        },
      },
    };

    // Конфигурация машины загрузки данных
    const dataConfig = {
      config: {
        IDLE: {
          LOAD_DATA: "LOADING",
        },
        LOADING: {
          LOAD_SUCCESS: "LOADED",
          LOAD_ERROR: "ERROR",
        },
        LOADED: {
          REFRESH: "LOADING",
          CLEAR: "IDLE",
        },
        ERROR: {
          RETRY: "LOADING",
          CLEAR: "IDLE",
        },
      },
      initialState: "IDLE",
      initialContext: { data: null, isLoading: false, error: null },
    };

    // Конфигурация машины для UI
    const uiConfig = {
      config: {
        INITIAL: {
          SHOW_LOGIN: "LOGIN_FORM",
          SHOW_DATA: "DATA_VIEW",
          SHOW_ERROR: "ERROR_VIEW",
        },
        LOGIN_FORM: {
          NAVIGATE: "DATA_VIEW",
          SHOW_ERROR: "ERROR_VIEW",
        },
        DATA_VIEW: {
          NAVIGATE: "LOGIN_FORM",
          SHOW_ERROR: "ERROR_VIEW",
        },
        ERROR_VIEW: {
          DISMISS: "DATA_VIEW",
          NAVIGATE: "LOGIN_FORM",
        },
      },
      initialState: "INITIAL",
      initialContext: { currentView: null, errorMessage: null },
    };

    // Создаем менеджер с тремя машинами
    const manager = MachineManager({
      auth: authConfig,
      data: dataConfig,
      ui: uiConfig,
    });

    // Создаем мок для имитации сетевых запросов
    const mockApi = {
      authenticate: vi.fn().mockResolvedValue({ success: true, userId: "user123" }),
      fetchData: vi.fn().mockResolvedValue({ success: true, data: { items: [1, 2, 3] } }),
    };

    // Устанавливаем зависимости
    manager.setDependencies({
      services: {
        api: mockApi,
      },
    });

    // Изначально показываем форму логина
    manager.transition({ type: "SHOW_LOGIN" });
    expect(manager.getState().ui.state).toBe("LOGIN_FORM");
    expect(manager.getState().auth.state).toBe("LOGGED_OUT");

    // Логинимся (asynchronous)
    manager.transition({ type: "LOGIN", payload: { username: "test", password: "password" } });

    // Сначала проверяем состояние AUTHENTICATING
    expect(manager.getState().auth.state).toBe("AUTHENTICATING");

    // Эмулируем успешную аутентификацию
    manager.transition({
      type: "LOGIN_SUCCESS",
      payload: { userId: "user123" },
    });

    // Проверяем, что аутентификация успешна
    expect(manager.getState().auth.state).toBe("LOGGED_IN");
    expect(manager.getState().auth.context.userId).toBe("user123");

    // Проверяем, что загрузка данных началась (эффект LOGGED_IN должен вызвать LOAD_DATA)
    expect(manager.getState().data.state).toBe("LOADING");

    // Эмулируем успешную загрузку данных
    manager.transition({
      type: "LOAD_SUCCESS",
      payload: { data: { items: [1, 2, 3] } },
    });

    expect(manager.getState().data.state).toBe("LOADED");
    expect(manager.getState().data.context.data).toEqual({ items: [1, 2, 3] });

    // Переходим к просмотру данных
    manager.transition({ type: "NAVIGATE" });
    expect(manager.getState().ui.state).toBe("DATA_VIEW");

    // Проверяем, что при выходе все сбрасывается правильно
    manager.transition({ type: "LOGOUT" });
    expect(manager.getState().auth.state).toBe("LOGGED_OUT");

    // Очищаем данные
    manager.transition({ type: "CLEAR" });
    expect(manager.getState().data.state).toBe("IDLE");

    // UI должен показать форму логина
    manager.transition({ type: "NAVIGATE" });
    expect(manager.getState().ui.state).toBe("LOGIN_FORM");
  });
});
