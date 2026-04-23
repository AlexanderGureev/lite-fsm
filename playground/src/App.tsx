import { useState } from "react";
import { FSMContextProvider } from "lite-fsm/react";

import type { LikeItem } from "./store/machines/likes";
import { manager, useSelector, useTransition } from "./store";

const LampPanel = () => {
  const transition = useTransition();
  const { state, context } = useSelector((rootState) => rootState.lamp);
  const isOn = state === "ON";

  return (
    <section className="panel">
      <header className="panelHeader">
        <p className="eyebrow">Lamp · sync FSM</p>
        <h2>Простой переключатель</h2>
      </header>

      <div className="lampStage">
        <div className={`lamp ${isOn ? "lamp--on" : "lamp--off"}`} aria-hidden />
        <span className="lampState">{state}</span>
      </div>

      <div className="controls">
        <button type="button" onClick={() => transition({ type: "TURN_ON" })} disabled={isOn}>
          TURN_ON
        </button>
        <button type="button" onClick={() => transition({ type: "TURN_OFF" })} disabled={!isOn}>
          TURN_OFF
        </button>
        <button type="button" className="ghostButton" onClick={() => transition({ type: "RESET" })}>
          RESET
        </button>
      </div>

      <p className="hint">Переключений: {context.toggleCount}</p>
    </section>
  );
};

const VoteButton = ({
  label,
  count,
  active,
  pending,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  pending: boolean;
  onClick: () => void;
}) => {
  const classes = ["voteBtn"];
  if (active) classes.push("voteBtn--active");
  if (pending) classes.push("voteBtn--pending");

  return (
    <button type="button" onClick={onClick} className={classes.join(" ")}>
      <span className="voteLabel">{label}</span>
      <span className="voteCount">{count}</span>
    </button>
  );
};

const LikeCard = ({ item }: { item: LikeItem }) => {
  const transition = useTransition();
  const isPending = item.current !== item.committed;

  return (
    <article className={`likeCard ${isPending ? "likeCard--pending" : ""}`}>
      <h3 className="likeTitle">{item.title}</h3>

      <div className="likeButtons">
        <VoteButton
          label="LIKE"
          count={item.likes}
          active={item.current === "like"}
          pending={isPending && item.current === "like"}
          onClick={() => transition({ type: "LIKE", payload: { itemId: item.id } })}
        />
        <VoteButton
          label="DISLIKE"
          count={item.dislikes}
          active={item.current === "dislike"}
          pending={isPending && item.current === "dislike"}
          onClick={() => transition({ type: "DISLIKE", payload: { itemId: item.id } })}
        />
      </div>
    </article>
  );
};

const LikesPanel = () => {
  const likes = useSelector((rootState) => rootState.likes);
  const likesPending = useSelector((rootState) => rootState.likesPending);
  const items = Object.values(likes.context.items) as LikeItem[];
  const pendingCount = likesPending.context.pendingCount;

  return (
    <section className="panel panel--wide">
      <header className="panelHeader">
        <p className="eyebrow">Likes · parallel async effects</p>
        <h2>Оптимистичное голосование</h2>
      </header>

      {likes.context.lastError ? <p className="errorText">{likes.context.lastError}</p> : null}

      <div className="pendingBar">
        <span className={`pendingDot ${pendingCount > 0 ? "pendingDot--active" : ""}`} />
        {pendingCount > 0 ? `Синхронизация: ${pendingCount}` : "Всё синхронизировано"}
      </div>

      <div className="likesGrid">
        {items.map((item) => (
          <LikeCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
};

type ExampleTab = "lamp" | "likes";

const tabs: Array<{ id: ExampleTab; label: string }> = [
  { id: "lamp", label: "Lamp" },
  { id: "likes", label: "Likes" },
];

function App() {
  const [activeTab, setActiveTab] = useState<ExampleTab>("lamp");

  return (
    <FSMContextProvider machineManager={manager}>
      <main className="app">
        <div className="tabs" role="tablist" aria-label="Примеры playground">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`tabButton ${activeTab === tab.id ? "tabButton--active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "lamp" ? <LampPanel /> : <LikesPanel />}
      </main>
    </FSMContextProvider>
  );
}

export default App;
