import { useWorkbenchContext } from "../../app/workbench-context";
import { useWorkbenchSelector } from "../../app/use-workbench-selector";
import { selectActiveTab, selectConsolePanel, selectCurrentEmptyPanel, selectTabItems, type VisualizerTab } from "../../workbench";

export const Shell = () => {
  const { dispatch } = useWorkbenchContext();
  const activeTab = useWorkbenchSelector(selectActiveTab);
  const tabs = useWorkbenchSelector(selectTabItems);
  const emptyPanel = useWorkbenchSelector(selectCurrentEmptyPanel);
  const consolePanel = useWorkbenchSelector(selectConsolePanel);

  return (
    <main className="visualizer-shell">
      <header className="visualizer-header">
        <div>
          <p className="eyebrow">lite-fsm visualizer</p>
          <h1>Architecture foundation</h1>
        </div>
        <button
          className="console-toggle"
          type="button"
          aria-pressed={consolePanel.open}
          onClick={() => dispatch({ type: "panel.console.toggled" })}
        >
          Console
        </button>
      </header>

      <nav className="tab-list" aria-label="Visualizer sections">
        {tabs.map((tab) => (
          <button
            key={tab.tab}
            type="button"
            className="tab-button"
            data-selected={tab.selected ? "true" : "false"}
            onClick={() => dispatch({ type: "tab.selected", tab: tab.tab as VisualizerTab })}
          >
            <span>{tab.label}</span>
            {tab.count ? <span className="tab-count">{tab.count}</span> : null}
          </button>
        ))}
      </nav>

      <section className="workspace-grid" data-active-tab={activeTab}>
        <article className="empty-panel">
          <p className="panel-kicker">{activeTab}</p>
          <h2>{emptyPanel.title}</h2>
          <p>{emptyPanel.body}</p>
        </article>

        <aside className="console-panel" data-open={consolePanel.open ? "true" : "false"} aria-label="Visualizer console" role="region">
          <div className="console-panel__header">
            <h2>Console</h2>
            <button type="button" onClick={() => dispatch({ type: "panel.console.toggled", open: false })}>
              Close
            </button>
          </div>
          {consolePanel.entries.length === 0 ? (
            <p className="console-empty">No diagnostics yet.</p>
          ) : (
            <ol className="console-list">
              {consolePanel.entries.map((entry) => (
                <li key={entry.entryId}>{entry.message}</li>
              ))}
            </ol>
          )}
        </aside>
      </section>
    </main>
  );
};
