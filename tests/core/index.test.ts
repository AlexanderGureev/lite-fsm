import { describe, it, expect, vi } from "vitest";
import { createMachine, createReducer, createConfig, createEffect } from "../../src/core/index";

describe("createMachine", () => {
  it("должен возвращать объект конфигурации", () => {
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
  it("должен возвращать функцию редьюсера", () => {
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
  it("должен возвращать объект конфигурации", () => {
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
  it("должен создавать эффект с типом 'every' по умолчанию", () => {
    const effect = vi.fn();
    const wrappedEffect = createEffect({ effect });

    const transition = vi.fn();
    wrappedEffect({ transition, action: { type: "TEST" }, condition: vi.fn() });

    expect(effect).toHaveBeenCalledOnce();
    expect(transition).not.toHaveBeenCalled();
  });

  it("должен передавать функцию transition в эффект", () => {
    const effectMock = vi.fn(({ transition }) => {
      transition({ type: "NEXT" });
    });

    const wrappedEffect = createEffect({ effect: effectMock });
    const transitionMock = vi.fn();

    wrappedEffect({ transition: transitionMock, action: { type: "TEST" }, condition: vi.fn() });

    expect(effectMock).toHaveBeenCalledOnce();
    expect(transitionMock).toHaveBeenCalledWith({ type: "NEXT" });
  });

  it("должен корректно обрабатывать эффекты типа latest", () => {
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

  it("должен корректно обрабатывать эффекты типа every", () => {
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

  it("должен отменять эффект, когда cancelFn возвращает true", () => {
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

  it("должен игнорировать вызовы transition из устаревших эффектов типа latest", async () => {
    // Создаем промисы для контроля выполнения эффектов
    let firstResolve!: (value: void) => void;
    let secondResolve!: (value: void) => void;

    const firstPromise = new Promise<void>((resolve) => {
      firstResolve = resolve;
    });
    const secondPromise = new Promise<void>((resolve) => {
      secondResolve = resolve;
    });

    let firstEffectResolved = false;
    let secondEffectResolved = false;

    // Создаем функцию эффекта с контролируемым временем выполнения
    const effectFn = vi.fn(async (deps) => {
      const isFirst = deps.action.type === "FIRST";

      if (isFirst) {
        await firstPromise;
        firstEffectResolved = true;
      } else {
        await secondPromise;
        secondEffectResolved = true;
      }

      deps.transition({ type: isFirst ? "TEST_FIRST" : "TEST_SECOND" });
    });

    // Создаем эффект с типом latest
    const latestEffect = createEffect({
      type: "latest",
      effect: effectFn,
    });

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

    // Проверяем, что второй эффект завершился и вызвал transition
    expect(secondEffectResolved).toBe(true);
    expect(originalTransition).toHaveBeenCalledTimes(1);
    expect(originalTransition).toHaveBeenCalledWith({ type: "TEST_SECOND" });

    // Сбрасываем счетчик вызовов
    originalTransition.mockClear();

    // Теперь разрешаем первый эффект
    firstResolve();
    await firstPromise;

    // Проверяем, что первый эффект выполнился, но его вызов transition был проигнорирован
    expect(firstEffectResolved).toBe(true);
    expect(originalTransition).not.toHaveBeenCalled();
  });
});
