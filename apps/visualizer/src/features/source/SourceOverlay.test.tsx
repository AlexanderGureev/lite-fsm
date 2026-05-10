import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SourceOverlay, sourceOverlayOpenChange } from "./SourceOverlay";

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

    expect(screen.getByText("missing source")).toBeTruthy();
    expect(screen.getByText("source v3 · anchors 2")).toBeTruthy();
    expect(screen.getByTestId("visualizer-source-overlay-fallback").textContent).toContain("Source range is not available");

    fireEvent.click(screen.getByTestId("visualizer-source-overlay-close"));
    fireEvent.click(screen.getByText("Close"));

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("рендерит selected source snippet", () => {
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

    expect(screen.getByTestId("visualizer-source-snippet").textContent).toContain("flowMachine");
    expect(screen.getByText("10")).toBeTruthy();
    expect(screen.getByText("11")).toBeTruthy();
  });
});
