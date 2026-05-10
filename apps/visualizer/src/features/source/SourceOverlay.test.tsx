import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VISUALIZER_TEST_IDS } from "../../test-ids";
import { SourceOverlay, sourceOverlayOpenChange } from "./SourceOverlay";

const ids = VISUALIZER_TEST_IDS;

describe("SourceOverlay", () => {
  it("вызывает close handler только при закрытии Dialog", () => {
    const onClose = vi.fn();

    sourceOverlayOpenChange(true, onClose);
    sourceOverlayOpenChange(false, onClose);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("не рендерит dialog content для closed view", () => {
    render(<SourceOverlay view={{ open: false }} onClose={vi.fn()} />);

    expect(screen.queryByTestId("visualizer-source-overlay")).toBeNull();
  });

  it("рендерит fallback и закрывается через header/footer controls", () => {
    const onClose = vi.fn();
    render(
      <SourceOverlay
        view={{
          open: true,
          title: "missing source",
          sourceVersion: 3,
          anchorCount: 2,
          lines: [],
          fallback: "Source range is not available for this graph item.",
        }}
        onClose={onClose}
      />,
    );

    expect(screen.getByTestId(ids.source.overlayTitle)).toBeTruthy();
    expect(screen.getByTestId(ids.source.overlayDescription).getAttribute("data-source-version")).toBe("3");
    expect(screen.getByTestId(ids.source.overlayDescription).getAttribute("data-anchor-count")).toBe("2");
    expect(screen.getByTestId(ids.source.overlayFallback).getAttribute("data-fallback")).toBe("true");

    fireEvent.click(screen.getByTestId(ids.source.overlayClose));
    fireEvent.click(screen.getByTestId(ids.source.overlayFooterClose));

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("рендерит selected source snippet через read-only CodeMirror", () => {
    render(
      <SourceOverlay
        view={{
          open: true,
          title: "flowMachine",
          sourceVersion: 4,
          anchorCount: 1,
          lines: [
            { line: 10, code: "const flowMachine = createMachine({", selected: true },
            { line: 11, code: "});", selected: false },
          ],
        }}
        onClose={vi.fn()}
      />,
    );

    const snippet = screen.getByTestId(ids.source.snippet);

    expect(snippet.querySelector(".cm-editor")).toBeTruthy();
    expect(snippet.querySelector(".cm-lineNumbers")).toBeTruthy();
    expect(snippet.querySelector(".cm-sourceOverlaySelectedLine")).toBeTruthy();
    expect(snippet.getAttribute("data-readonly")).toBe("true");
    expect(snippet.getAttribute("data-first-line-number")).toBe("10");
    expect(snippet.getAttribute("data-highlighted-line-numbers")).toBe("1");
    expect(snippet.querySelectorAll(".cm-line")).toHaveLength(2);
  });
});
