import { EditorView } from "@codemirror/view";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  DiagnosticsAlert,
  GraphRow,
  ChipPill,
  IconButton,
  LayerBadge,
  PaneScrollArea,
  Panel,
  PanelBody,
  PanelHeader,
  PanelKicker,
  SourceEditorShell,
  SourceSnippet,
  StatusBadge,
} from "./visualizer";

describe("UI primitives визуализатора", () => {
  it("рендерит panel, badge, row, snippet, alert и icon button primitives", () => {
    const onClick = vi.fn();

    render(
      <>
        <Panel rail data-testid="panel">
        <PanelHeader data-testid="panel-header">
          <PanelKicker data-testid="panel-kicker" />
          <StatusBadge data-testid="status-default" />
          <StatusBadge tone="diagnostic" data-testid="status-diagnostic" />
          <ChipPill tone="warning" data-testid="chip-pill">3</ChipPill>
          <LayerBadge layer="simulation" className="custom-layer" />
          </PanelHeader>
          <PanelBody data-testid="panel-body" />
        </Panel>
        <GraphRow data-testid="graph-row-selected" layer="config" event="START" target="done" meta="exact" selected />
        <GraphRow data-testid="graph-row-idle" layer="effect" event="DONE" target="idle" meta="partial" />
        <SourceSnippet
          data-testid="source-snippet"
          lines={[
            { line: 1, code: "const ready = true;", selected: true },
            { line: 2, code: "ready;", selected: false },
          ]}
        />
        <DiagnosticsAlert data-testid="diagnostics-alert" />
        <PaneScrollArea data-testid="pane-scroll-area" />
        <IconButton data-testid="icon-button" onClick={onClick} />
      </>,
    );

    expect(screen.getByTestId("panel")).toBeTruthy();
    expect(screen.getByTestId("panel-header")).toBeTruthy();
    expect(screen.getByTestId("panel-kicker")).toBeTruthy();
    expect(screen.getByTestId("panel-body")).toBeTruthy();
    expect(screen.getByTestId("status-default")).toBeTruthy();
    expect(screen.getByTestId("status-diagnostic")).toBeTruthy();
    expect(screen.getByTestId("chip-pill").textContent).toBe("3");
    expect(screen.getByTestId("graph-row-selected")).toBeTruthy();
    expect(screen.getByTestId("graph-row-idle")).toBeTruthy();
    expect(screen.getByTestId("source-snippet").querySelectorAll("code")).toHaveLength(2);
    expect(screen.getByTestId("diagnostics-alert")).toBeTruthy();
    expect(screen.getByTestId("pane-scroll-area")).toBeTruthy();

    fireEvent.click(screen.getByTestId("icon-button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("синхронизирует значение CodeMirror editor, handler ref и suppress-update guard", () => {
    const onValueChange = vi.fn();
    const nextValueChange = vi.fn();
    const { rerender } = render(
      <SourceEditorShell label="Editor under test" value="const first = 1;" textareaTestId="editor" onValueChange={onValueChange}>
        <span data-testid="editor-child" />
      </SourceEditorShell>,
    );
    const editor = screen.getByTestId("editor");
    const view = EditorView.findFromDOM(editor);
    if (!view) throw new Error("Missing CodeMirror view.");

    expect(editor.getAttribute("data-readonly")).toBe("false");
    expect(editor.getAttribute("data-first-line-number")).toBe("1");
    expect(editor.getAttribute("data-highlighted-line-numbers")).toBe("");
    expect(screen.getByTestId("editor-child")).toBeTruthy();

    act(() => {
      view.dispatch({ changes: { from: view.state.doc.length, insert: "\nconst second = 2;" } });
    });
    expect(onValueChange).toHaveBeenCalledTimes(1);

    act(() => {
      view.dispatch({ selection: { anchor: 0 } });
    });
    expect(onValueChange).toHaveBeenCalledTimes(1);

    rerender(
      <SourceEditorShell label="Editor under test" value="const parent = 3;" textareaTestId="editor" onValueChange={nextValueChange} />,
    );
    expect(nextValueChange).toHaveBeenCalledTimes(0);

    const currentView = EditorView.findFromDOM(editor);
    if (!currentView) throw new Error("Missing updated CodeMirror view.");
    act(() => {
      currentView.dispatch({ changes: { from: currentView.state.doc.length, insert: "\nconst third = 3;" } });
    });
    expect(nextValueChange).toHaveBeenCalledTimes(1);
  });

  it("рендерит read-only CodeMirror fragment с line offset и selected anchors без change handler", () => {
    render(
      <SourceEditorShell
        label="Read-only editor under test"
        value={"const first = 1;\nconst second = 2;"}
        textareaTestId="readonly-editor"
        readOnly
        firstLineNumber={10}
        highlightedLineNumbers={[2]}
      />,
    );
    const editor = screen.getByTestId("readonly-editor");
    const view = EditorView.findFromDOM(editor);
    if (!view) throw new Error("Missing read-only CodeMirror view.");

    expect(editor.getAttribute("data-readonly")).toBe("true");
    expect(editor.getAttribute("data-first-line-number")).toBe("10");
    expect(editor.getAttribute("data-highlighted-line-numbers")).toBe("2");
    expect(editor.querySelector(".cm-sourceOverlaySelectedLine")).toBeTruthy();

    act(() => {
      view.dispatch({ changes: { from: 0, insert: "// prefix\n" } });
    });
    expect(editor.querySelector(".cm-line")).toBeTruthy();
  });
});
