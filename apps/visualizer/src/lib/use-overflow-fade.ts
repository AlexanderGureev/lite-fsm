import { useEffect, type RefObject } from "react";

const OVERFLOW_EPSILON = 1;

type OverflowFadeDirection = "horizontal" | "vertical";

export const useOverflowFade = (
  ref: RefObject<HTMLElement | null>,
  direction: OverflowFadeDirection = "horizontal",
): void => {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => {
      if (direction === "vertical") {
        const hasOverflow = element.scrollHeight - element.clientHeight > OVERFLOW_EPSILON;
        const atStart = element.scrollTop <= OVERFLOW_EPSILON;
        const atEnd = element.scrollTop + element.clientHeight >= element.scrollHeight - OVERFLOW_EPSILON;

        element.dataset.fadeTop = hasOverflow && !atStart ? "true" : "false";
        element.dataset.fadeBottom = hasOverflow && !atEnd ? "true" : "false";
        return;
      }

      const hasOverflow = element.scrollWidth - element.clientWidth > OVERFLOW_EPSILON;
      const atStart = element.scrollLeft <= OVERFLOW_EPSILON;
      const atEnd = element.scrollLeft + element.clientWidth >= element.scrollWidth - OVERFLOW_EPSILON;

      element.dataset.fadeLeft = hasOverflow && !atStart ? "true" : "false";
      element.dataset.fadeRight = hasOverflow && !atEnd ? "true" : "false";
    };

    update();
    element.addEventListener("scroll", update, { passive: true });

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : undefined;
    observer?.observe(element);

    return () => {
      observer?.disconnect();
      element.removeEventListener("scroll", update);
    };
  }, [ref, direction]);
};
