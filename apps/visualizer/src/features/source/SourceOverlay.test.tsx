import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VISUALIZER_TEST_IDS } from "../../test-ids";
import { SourceOverlay, sourceOverlayOpenChange } from "./SourceOverlay";

const ids = VISUALIZER_TEST_IDS;

describe("компонент SourceOverlay", () => {
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

  it("рендерит fallback, закрывается через header control и блокирует переключение в full mode без source", () => {
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
    expect(screen.getByTestId(ids.source.overlayDescription).getAttribute("data-location-label")).toBe("");
    expect(screen.getByTestId(ids.source.overlayFallback).getAttribute("data-fallback")).toBe("true");

    expect(screen.queryByTestId("visualizer-source-overlay-footer-close")).toBeNull();
    expect(screen.getByTestId(ids.source.overlayModeFull).getAttribute("data-disabled")).toBe("");

    fireEvent.click(screen.getByTestId(ids.source.overlayClose));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("рендерит selected source snippet через read-only CodeMirror", () => {
    render(
      <SourceOverlay
        view={{
          open: true,
          title: "flowMachine",
          sourceVersion: 4,
          anchorCount: 1,
          locationLabel: "line 10, column 1",
          lines: [
            { line: 10, code: "const flowMachine = createMachine({", selected: true },
            { line: 11, code: "});", selected: false },
          ],
        }}
        onClose={vi.fn()}
      />,
    );

    const snippet = screen.getByTestId(ids.source.snippet);

    expect(screen.getByTestId(ids.source.overlayDescription).textContent).toContain("line 10, column 1");
    expect(screen.getByTestId(ids.source.overlayDescription).getAttribute("data-location-label")).toBe("line 10, column 1");
    expect(snippet.querySelector(".cm-editor")).toBeTruthy();
    expect(snippet.querySelector(".cm-lineNumbers")).toBeTruthy();
    expect(snippet.querySelector(".cm-sourceOverlaySelectedLine")).toBeTruthy();
    expect(snippet.getAttribute("data-readonly")).toBe("true");
    expect(snippet.getAttribute("data-first-line-number")).toBe("10");
    expect(snippet.getAttribute("data-highlighted-line-numbers")).toBe("1");
    expect(snippet.querySelectorAll(".cm-line")).toHaveLength(2);
  });

  it("переключает между snippet и full file режимами при наличии fullSource", () => {
    const fullSource = ["one", "two", "three", "four", "five"].join("\n");
    render(
      <SourceOverlay
        view={{
          open: true,
          title: "flow",
          sourceVersion: 7,
          anchorCount: 1,
          locationLabel: "line 3, column 1",
          lines: [
            { line: 2, code: "two", selected: false },
            { line: 3, code: "three", selected: true },
            { line: 4, code: "four", selected: false },
          ],
          fullSource,
        }}
        onClose={vi.fn()}
      />,
    );

    const snippetButton = screen.getByTestId(ids.source.overlayModeSnippet);
    const fullButton = screen.getByTestId(ids.source.overlayModeFull);
    expect(snippetButton.getAttribute("data-state")).toBe("on");
    expect(fullButton.getAttribute("data-disabled")).toBeNull();

    let snippet = screen.getByTestId(ids.source.snippet);
    expect(snippet.getAttribute("data-first-line-number")).toBe("2");
    expect(snippet.getAttribute("data-highlighted-line-numbers")).toBe("2");

    fireEvent.click(fullButton);
    expect(fullButton.getAttribute("data-state")).toBe("on");

    snippet = screen.getByTestId(ids.source.snippet);
    expect(snippet.getAttribute("data-first-line-number")).toBe("1");
    expect(snippet.getAttribute("data-highlighted-line-numbers")).toBe("3");
    expect(snippet.querySelectorAll(".cm-line")).toHaveLength(5);

    fireEvent.click(snippetButton);
    expect(snippetButton.getAttribute("data-state")).toBe("on");
    snippet = screen.getByTestId(ids.source.snippet);
    expect(snippet.getAttribute("data-first-line-number")).toBe("2");
  });
});
