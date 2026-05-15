import { useEffect, type RefObject } from "react";

const OVERFLOW_EPSILON = 1;

export const useOverflowFade = (ref: RefObject<HTMLElement | null>): void => {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => {
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
  }, [ref]);
};
