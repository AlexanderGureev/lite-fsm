import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

const createTestRect = (): DOMRect =>
  ({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    toJSON: () => ({}),
  }) as DOMRect;

const createTestRectList = (): DOMRectList => {
  const rect = createTestRect();

  return {
    0: rect,
    length: 1,
    item: (index: number) => (index === 0 ? rect : null),
    [Symbol.iterator]: function* () {
      yield rect;
    },
  } as unknown as DOMRectList;
};

if (typeof Range !== "undefined") {
  Range.prototype.getBoundingClientRect ??= createTestRect;
  Range.prototype.getClientRects ??= createTestRectList;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
