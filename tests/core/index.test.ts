import { describe, it, expect, vi } from "vitest";
import { createMachine, createReducer, createConfig, createEffect } from "../../src/core/index";

describe("createMachine", () => {
  it("should return the configuration object", () => {
    const config = {
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

    const result = createMachine(config);
    expect(result).toEqual(config);
  });
});

describe("createReducer", () => {
  it("should return the reducer function", () => {
    const reducer = (state: any, action: any) => {
      if (action.type === "INCREMENT") {
        return {
          ...state,
          context: {
            ...state.context,
            count: state.context.count + 1,
          },
        };
      }
      return state;
    };

    const result = createReducer(reducer);
    expect(result).toBe(reducer);
  });
});

describe("createConfig", () => {
  it("should return the configuration object", () => {
    const config = {
      IDLE: {
        GO: "ACTIVE",
      },
      ACTIVE: {
        STOP: "IDLE",
      },
    } as const;

    const result = createConfig(config);
    expect(result).toEqual(config);
  });
});

describe("createEffect", () => {
  it("should create effect with 'every' type by default", () => {
    const effect = vi.fn();
    const wrappedEffect = createEffect({ effect });

    const transition = vi.fn();
    wrappedEffect({ transition, action: { type: "TEST" }, condition: vi.fn() });

    expect(effect).toHaveBeenCalledOnce();
    expect(transition).not.toHaveBeenCalled();
  });

  it("should pass transition function to the effect", () => {
    const effectMock = vi.fn(({ transition }) => {
      transition({ type: "NEXT" });
    });

    const wrappedEffect = createEffect({ effect: effectMock });
    const transitionMock = vi.fn();

    wrappedEffect({ transition: transitionMock, action: { type: "TEST" }, condition: vi.fn() });

    expect(effectMock).toHaveBeenCalledOnce();
    expect(transitionMock).toHaveBeenCalledWith({ type: "NEXT" });
  });

  it("should handle latest effects correctly", () => {
    const effectMock = vi.fn();
    const cancelFnMock = vi.fn(() => () => false);

    const wrappedEffect = createEffect({
      effect: effectMock,
      type: "latest",
      cancelFn: cancelFnMock,
    });

    const deps = { transition: vi.fn(), action: { type: "TEST" }, condition: vi.fn() };
    wrappedEffect(deps);
    wrappedEffect(deps); // Второй вызов должен перезаписать первый (latest)

    expect(effectMock).toHaveBeenCalledTimes(2);
    expect(cancelFnMock).toHaveBeenCalledTimes(2);
  });

  it("should handle every effects correctly", () => {
    const effectMock = vi.fn();

    const wrappedEffect = createEffect({
      effect: effectMock,
      type: "every",
    });

    const deps = { transition: vi.fn(), action: { type: "TEST" }, condition: vi.fn() };
    wrappedEffect(deps);
    wrappedEffect(deps);

    expect(effectMock).toHaveBeenCalledTimes(2);
  });

  it("should cancel effect when cancelFn returns true", () => {
    let shouldCancel = false;

    const effectMock = vi.fn(({ transition }) => {
      transition({ type: "NEXT" });
    });

    const cancelFnMock = vi.fn(() => () => shouldCancel);

    const wrappedEffect = createEffect({
      effect: effectMock,
      cancelFn: cancelFnMock,
    });

    const transitionMock = vi.fn();
    const deps = { transition: transitionMock, action: { type: "TEST" }, condition: vi.fn() };

    // Эффект должен выполниться
    wrappedEffect(deps);
    expect(transitionMock).toHaveBeenCalledWith({ type: "NEXT" });

    // Сброс моков и установка флага отмены
    transitionMock.mockClear();
    effectMock.mockClear();
    shouldCancel = true;

    // Эффект должен быть отменен
    wrappedEffect(deps);
    expect(effectMock).toHaveBeenCalledOnce();
    // Transition не должен быть вызван, так как cancelFn вернул true
    expect(transitionMock).not.toHaveBeenCalled();
  });

  it("should ignore transition calls from outdated 'latest' effects", async () => {
    // Создаем флаги для отслеживания статуса эффектов
    let firstEffectResolved = false;
    let secondEffectResolved = false;

    // Создаем промисы для контроля выполнения эффектов
    let firstResolve!: (value: void | PromiseLike<void>) => void;
    let secondResolve!: (value: void | PromiseLike<void>) => void;

    // Инициализация промисов
    const firstPromise = new Promise<void>((resolve) => {
      firstResolve = resolve;
    });

    const secondPromise = new Promise<void>((resolve) => {
      secondResolve = resolve;
    });

    // Создаем функцию эффекта с контролируемым временем выполнения
    const effectFn = vi.fn(async (deps) => {
      // Определяем какой это эффект по параметру action.type
      const isFirst = deps.action.type === "FIRST";

      // Ждем, пока соответствующий промис будет разрешен
      if (isFirst) {
        await firstPromise;
        firstEffectResolved = true;
      } else {
        await secondPromise;
        secondEffectResolved = true;
      }

      // Вызываем transition (для первого эффекта этот вызов должен быть отменен)
      deps.transition({ type: isFirst ? "TEST_FIRST" : "TEST_SECOND" });
    });

    // Создаем эффект с типом latest
    const latestEffect = createEffect({
      type: "latest",
      effect: effectFn,
    });

    // Создаем mock для transition
    const originalTransition = vi.fn();

    // Запускаем первый эффект
    latestEffect({
      transition: originalTransition,
      action: { type: "FIRST" },
      condition: vi.fn(),
    });

    // Запускаем второй эффект (это должно сделать первый эффект устаревшим)
    latestEffect({
      transition: originalTransition,
      action: { type: "SECOND" },
      condition: vi.fn(),
    });

    // Сначала разрешаем второй эффект
    secondResolve();
    await secondPromise;

    // Проверяем, что второй эффект завершился
    expect(secondEffectResolved).toBe(true);

    // Проверяем, что второй эффект вызвал transition
    expect(originalTransition).toHaveBeenCalledTimes(1);
    expect(originalTransition).toHaveBeenCalledWith({ type: "TEST_SECOND" });

    // Сбрасываем счетчик вызовов
    originalTransition.mockClear();

    // Теперь разрешаем первый эффект
    firstResolve();
    await firstPromise;

    // Проверяем, что первый эффект также выполнился
    expect(firstEffectResolved).toBe(true);

    // Но его вызов transition должен быть проигнорирован из-за условия
    // if (type === "latest" && currentId !== lastId)
    expect(originalTransition).not.toHaveBeenCalled();
  }, 10000); // Увеличиваем таймаут для теста
});
