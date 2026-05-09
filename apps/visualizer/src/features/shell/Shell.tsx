import { Activity, FileCode, FileText, Radio, RefreshCw, Search, Send, Terminal, TriangleAlert } from "lucide-react";
import { useWorkbenchContext } from "../../app/workbench-context";
import { useWorkbenchSelector } from "../../app/use-workbench-selector";
import {
  selectActiveTab,
  selectConsolePanel,
  selectCurrentEmptyPanel,
  selectTabItems,
  type VisualizerTab,
} from "../../workbench";

const STYLE_FIXTURE_ROWS = [
  {
    layer: "cfg",
    className: "layer-config",
    event: "AUTH_RESPONSE",
    target: "LOGGED_IN | LOGGED_OUT",
    meta: "2 reducer branches",
  },
  {
    layer: "eff",
    className: "layer-effect",
    event: "TRACK_LOAD",
    target: "actor:track",
    meta: "routing actor",
  },
  {
    layer: "sim",
    className: "layer-simulation",
    event: "QUEUE_EMPTY",
    target: "STOPPED",
    meta: "available now",
  },
] as const;

const LONG_EVENT_LABEL = "PLAYER_TRACK_BUFFERING_PROGRESS_REPORTED_FROM_ACTOR_TEMPLATE_INSTANCE";

export const Shell = () => {
  const { dispatch } = useWorkbenchContext();
  const activeTab = useWorkbenchSelector(selectActiveTab);
  const tabs = useWorkbenchSelector(selectTabItems);
  const emptyPanel = useWorkbenchSelector(selectCurrentEmptyPanel);
  const consolePanel = useWorkbenchSelector(selectConsolePanel);

  return (
    <main className="visualizer-shell">
      <header className="visualizer-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            lf
          </span>
          <div>
            <p className="eyebrow">lite-fsm visualizer</p>
            <h1>Stage 12b style fixture</h1>
          </div>
        </div>
        <div className="header-status">
          <span className="status-pill">
            <FileCode size={14} aria-hidden="true" />
            sample.ts
          </span>
          <span className="status-pill status-pill--ready">
            <Activity size={14} aria-hidden="true" />
            style ready
          </span>
          <button
            className="console-toggle"
            type="button"
            aria-pressed={consolePanel.open}
            onClick={() => dispatch({ type: "panel.console.toggled" })}
          >
            <Terminal size={14} aria-hidden="true" />
            Console
          </button>
        </div>
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
        <article className="fixture-panel fixture-panel--source" aria-labelledby="source-fixture-title">
          <header className="fixture-panel__header">
            <span className="panel-kicker">Source</span>
            <h2 id="source-fixture-title">{emptyPanel.title}</h2>
            <span className="panel-spacer" />
            <button className="icon-button" type="button" aria-label="Reset source fixture">
              <RefreshCw size={14} aria-hidden="true" />
            </button>
          </header>
          <div className="source-preview" aria-label="Representative source snippet">
            <div className="source-line">
              <span className="source-line__number">12</span>
              <code>AUTHENTICATING: {'{ AUTH_RESPONSE: "LOGGED_IN" }'}</code>
            </div>
            <div className="source-line source-line--selected">
              <span className="source-line__number">13</span>
              <code>
                if (action.payload.reason === &quot;network_error&quot;) state.state = &quot;LOGGED_OUT&quot;;
              </code>
            </div>
            <div className="source-line">
              <span className="source-line__number">14</span>
              <code>transition({'{ type: "TRACK_LOAD", meta: { actorId: trackId } }'});</code>
            </div>
          </div>
          <p className="fixture-note">{emptyPanel.body}</p>
        </article>

        <article className="fixture-panel fixture-panel--workbench" aria-labelledby="workbench-fixture-title">
          <header className="fixture-panel__header">
            <span className="panel-kicker">{activeTab}</span>
            <h2 id="workbench-fixture-title">Machine card grammar</h2>
            <span className="badge badge--actor">actor</span>
            <span className="badge badge--state">@ BUFFERING</span>
          </header>

          <section className="machine-card" aria-label="Representative machine card">
            <div className="machine-card__header">
              <div>
                <p className="machine-card__eyebrow">trackInstance</p>
                <h3>Grouped state rows</h3>
              </div>
              <button className="icon-button" type="button" aria-label="View source for trackInstance">
                <FileText size={14} aria-hidden="true" />
              </button>
            </div>

            <div className="state-block" data-current="true">
              <div className="state-block__header">
                <span className="state-dot" aria-hidden="true" />
                <strong>BUFFERING</strong>
                <span className="badge badge--muted">current</span>
                <span className="badge badge--routing">routing actor</span>
              </div>
              <div className="row-list">
                {STYLE_FIXTURE_ROWS.map((row) => (
                  <button className="workbench-row" type="button" key={`${row.layer}-${row.event}`}>
                    <span className={`layer-tag ${row.className}`}>{row.layer}</span>
                    <span className="event-name">{row.event}</span>
                    <span className="row-arrow">to</span>
                    <span className="target-name">{row.target}</span>
                    <span className="row-meta">{row.meta}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="long-label-sample" aria-label="Long label wrapping sample">
              <Search size={13} aria-hidden="true" />
              <span>{LONG_EVENT_LABEL}</span>
            </div>
          </section>
        </article>

        <aside
          className="console-panel"
          data-open={consolePanel.open ? "true" : "false"}
          aria-label="Visualizer console"
          role="region"
        >
          <div className="console-panel__header">
            <div>
              <p className="panel-kicker">Diagnostics</p>
              <h2>Console</h2>
            </div>
            <button type="button" onClick={() => dispatch({ type: "panel.console.toggled", open: false })}>
              Close
            </button>
          </div>
          {consolePanel.entries.length === 0 ? (
            <div className="console-list" aria-label="Representative console entries">
              <button className="console-entry console-entry--warning" type="button">
                <TriangleAlert size={14} aria-hidden="true" />
                <span className="console-entry__origin">analyzer</span>
                <span>Reducer branch is visible as a diagnostic badge.</span>
              </button>
              <button className="console-entry console-entry--info" type="button">
                <Radio size={14} aria-hidden="true" />
                <span className="console-entry__origin">simulator</span>
                <span>Manual cascade waits for an explicit row click.</span>
              </button>
            </div>
          ) : (
            <ol className="console-list">
              {consolePanel.entries.map((entry) => (
                <li key={entry.entryId}>{entry.message}</li>
              ))}
            </ol>
          )}

          <div className="timeline-fixture" aria-label="Representative timeline">
            <div className="timeline-fixture__header">
              <span>Event timeline</span>
              <button type="button">
                <Send size={13} aria-hidden="true" />
                send
              </button>
            </div>
            <button className="timeline-step" type="button">
              <span className="timeline-step__seq">#1</span>
              <span className="event-name">TRACK_LOAD</span>
              <span className="timeline-step__source">manual · player</span>
            </button>
          </div>
        </aside>
      </section>
    </main>
  );
};
