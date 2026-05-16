import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useRef, type RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOverflowFade } from "./use-overflow-fade";

const setMetric = (element: HTMLElement, key: keyof HTMLElement, value: number): void => {
  Object.defineProperty(element, key, { configurable: true, value });
};

const setHorizontalMetrics = (
  element: HTMLElement,
  metrics: { scrollWidth: number; clientWidth: number; scrollLeft: number },
): void => {
  setMetric(element, "scrollWidth", metrics.scrollWidth);
  setMetric(element, "clientWidth", metrics.clientWidth);
  setMetric(element, "scrollLeft", metrics.scrollLeft);
};

const setVerticalMetrics = (
  element: HTMLElement,
  metrics: { scrollHeight: number; clientHeight: number; scrollTop: number },
): void => {
  setMetric(element, "scrollHeight", metrics.scrollHeight);
  setMetric(element, "clientHeight", metrics.clientHeight);
  setMetric(element, "scrollTop", metrics.scrollTop);
};

const OverflowProbe = ({
  direction,
  configure,
}: {
  direction?: "horizontal" | "vertical";
  configure: (element: HTMLElement) => void;
}) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (ref.current) configure(ref.current);
  }, [configure]);
  useOverflowFade(ref, direction);

  return <div ref={ref} data-testid="overflow-probe" />;
};

const MissingElementProbe = ({ refObject }: { refObject: RefObject<HTMLElement | null> }) => {
  useOverflowFade(refObject);

  return null;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useOverflowFade", () => {
  it("ничего не делает пока ref еще не указывает на element", () => {
    const refObject = { current: null };

    render(<MissingElementProbe refObject={refObject} />);

    expect(refObject.current).toBeNull();
  });

  it("обновляет horizontal fade flags при scroll", () => {
    render(
      <OverflowProbe
        configure={(element) => setHorizontalMetrics(element, { scrollWidth: 300, clientWidth: 100, scrollLeft: 0 })}
      />,
    );
    const element = screen.getByTestId("overflow-probe");

    expect(element.dataset.fadeLeft).toBe("false");
    expect(element.dataset.fadeRight).toBe("true");

    setHorizontalMetrics(element, { scrollWidth: 300, clientWidth: 100, scrollLeft: 100 });
    fireEvent.scroll(element);

    expect(element.dataset.fadeLeft).toBe("true");
    expect(element.dataset.fadeRight).toBe("true");

    setHorizontalMetrics(element, { scrollWidth: 100, clientWidth: 100, scrollLeft: 0 });
    fireEvent.scroll(element);

    expect(element.dataset.fadeLeft).toBe("false");
    expect(element.dataset.fadeRight).toBe("false");
  });

  it("обновляет vertical fade flags и отключает их в конце scroll range", () => {
    render(
      <OverflowProbe
        direction="vertical"
        configure={(element) => setVerticalMetrics(element, { scrollHeight: 320, clientHeight: 120, scrollTop: 80 })}
      />,
    );
    const element = screen.getByTestId("overflow-probe");

    expect(element.dataset.fadeTop).toBe("true");
    expect(element.dataset.fadeBottom).toBe("true");

    setVerticalMetrics(element, { scrollHeight: 320, clientHeight: 120, scrollTop: 200 });
    fireEvent.scroll(element);

    expect(element.dataset.fadeTop).toBe("true");
    expect(element.dataset.fadeBottom).toBe("false");
  });

  it("подписывается на ResizeObserver когда он доступен", () => {
    const observe = vi.fn();
    const disconnect = vi.fn();

    class ResizeObserverMock {
      observe = observe;
      disconnect = disconnect;
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);

    const { unmount } = render(
      <OverflowProbe
        configure={(element) => setHorizontalMetrics(element, { scrollWidth: 160, clientWidth: 100, scrollLeft: 0 })}
      />,
    );
    const element = screen.getByTestId("overflow-probe");

    expect(observe).toHaveBeenCalledWith(element);

    unmount();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
