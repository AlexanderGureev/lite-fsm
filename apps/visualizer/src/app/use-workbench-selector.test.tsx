import { render } from "@testing-library/react";
import { memo } from "react";
import { describe, expect, it, vi } from "vitest";
import { createWorkbenchStore } from "../workbench";
import { useWorkbenchSelector } from "./use-workbench-selector";
import { WorkbenchProvider } from "./workbench-context";

const SelectedValueBase = ({ onRender }: { onRender: (value: string) => void }) => {
  const sourceHash = useWorkbenchSelector((snapshot) => snapshot.state.source.hash);
  onRender(sourceHash);

  return <span>{sourceHash}</span>;
};

const SelectedValue = memo(SelectedValueBase);

describe("useWorkbenchSelector", () => {
  it("не rerender-ит component при unchanged selected value", () => {
    const store = createWorkbenchStore();
    const onRender = vi.fn();

    render(
      <WorkbenchProvider store={store}>
        <SelectedValue onRender={onRender} />
      </WorkbenchProvider>,
    );

    expect(onRender).toHaveBeenCalledTimes(1);

    store.dispatch({ type: "tab.selected", tab: "events" });

    expect(onRender).toHaveBeenCalledTimes(1);
  });
});
