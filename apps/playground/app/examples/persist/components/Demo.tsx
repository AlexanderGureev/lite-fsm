"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Database,
  ExternalLink,
  HardDrive,
  KeyRound,
  RefreshCcw,
  SendHorizontal,
  Timer,
  Trash2,
} from "lucide-react";
import { FSMContextProvider } from "@lite-fsm/react";
import { useIsPersistRestoring, usePersistStatus } from "@lite-fsm/persist/react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import {
  makePersistChatRuntime,
  PERSIST_STORAGE_KEY,
  PERSIST_STORAGE_VERSION,
  PERSIST_THROTTLE_MS,
  type PersistChatRuntime,
} from "../store";
import { useSelector, useTransition } from "../store/hooks";
import type { ChatMessage } from "../store/types";

const timeFormatter = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
});

const formatTime = (value: number | null) => (value ? timeFormatter.format(value) : "—");

const createMessageId = (peerId: string) =>
  `${peerId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;

type MessageGroup = {
  peerId: string;
  author: string;
  color: string;
  messages: ChatMessage[];
};

const groupMessages = (messages: ChatMessage[]): MessageGroup[] => {
  const groups: MessageGroup[] = [];
  for (const message of messages) {
    const last = groups[groups.length - 1];
    if (last && last.peerId === message.peerId) {
      last.messages.push(message);
      continue;
    }
    groups.push({
      peerId: message.peerId,
      author: message.author,
      color: message.color,
      messages: [message],
    });
  }
  return groups;
};

function RuntimeSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center gap-3 py-24 text-center">
      <span className="grid size-11 place-items-center rounded-[10px] bg-accent-persist-soft text-accent-persist">
        <HardDrive className="size-5" strokeWidth={1.8} />
      </span>
      <p className="text-caption-strong text-ink">Подключаем browser storage…</p>
    </div>
  );
}

function SyncIndicator({
  phase,
  restored,
}: {
  phase: string;
  restored?: boolean;
}) {
  const label =
    phase === "restoring"
      ? "Restoring"
      : phase === "error"
        ? "Storage error"
        : restored
          ? "Synced"
          : "Live";
  const tone =
    phase === "restoring"
      ? "text-[#005e73] bg-[#dff8ff]"
      : phase === "error"
        ? "text-destructive bg-destructive/10"
        : "text-accent-persist bg-accent-persist-soft";
  const dot =
    phase === "restoring"
      ? "bg-[#0aa5c2] animate-pulse"
      : phase === "error"
        ? "bg-destructive"
        : "bg-accent-persist";

  return (
    <span className={cn("inline-flex items-center gap-2 rounded-pill px-2.5 py-1 text-fine-print font-medium", tone)}>
      <span className={cn("size-1.5 rounded-full", dot)} aria-hidden />
      {label}
    </span>
  );
}

function PeerChip({ name, color, prefix }: { name: string; color: string; prefix?: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-pill border border-hairline bg-canvas px-2.5 py-1 text-fine-print font-medium text-ink-muted-80">
      <span aria-hidden className="size-2 rounded-full" style={{ background: color }} />
      {prefix && <span className="text-ink-muted-48">{prefix}</span>}
      {name}
    </span>
  );
}

function HeroSection({ runtime }: { runtime: PersistChatRuntime }) {
  const openClone = () => {
    if (typeof window === "undefined") return;
    window.open(window.location.href, "_blank", "noopener,noreferrer");
  };

  return (
    <header className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <span className="inline-flex items-center gap-2 self-start rounded-pill bg-accent-persist-soft px-3 py-1 text-fine-print font-semibold tracking-wide text-accent-persist uppercase">
          <span className="size-1.5 rounded-full bg-accent-persist" aria-hidden />
          lite-fsm / persist
        </span>
        <h1 className="text-display-md text-ink">Чат, синхронизированный между вкладками</h1>
        <p className="max-w-2xl text-body text-ink-muted-48">
          История сообщений сохраняется через <span className="text-ink">persistManager</span> в{" "}
          <code className="rounded-sm bg-canvas-parchment px-1 text-ink">localStorage</code>. Соседние вкладки слушают
          <code className="ml-1 rounded-sm bg-canvas-parchment px-1 text-ink">storage</code>-event и подтягивают
          обновления через <span className="text-ink">restore()</span> — без серверов.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-accent-persist/20 bg-linear-to-br from-accent-persist-soft/70 via-canvas to-canvas p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-[10px] bg-accent-persist text-on-primary shadow-card">
            <ExternalLink className="size-4" strokeWidth={2} />
          </span>
          <div className="flex flex-col gap-0.5">
            <p className="text-caption-strong text-ink">Открой эту страницу ещё раз</p>
            <p className="text-caption text-ink-muted-48">
              Каждая вкладка — свой peer. Сообщения летят между ними через{" "}
              <code className="rounded-sm bg-canvas-parchment px-1 text-ink">localStorage</code>.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <PeerChip name={runtime.peer.name} color={runtime.peer.color} prefix="ты" />
          <Button
            type="button"
            onClick={openClone}
            className="h-9 gap-2 rounded-pill bg-accent-persist px-4 text-caption-strong text-on-primary hover:bg-accent-persist/90 active:scale-[0.97]"
          >
            Открыть копию
            <ExternalLink className="size-3.5" strokeWidth={2} />
          </Button>
        </div>
      </div>
    </header>
  );
}

function EmptyTranscript({ runtime }: { runtime: PersistChatRuntime }) {
  return (
    <div className="grid h-full place-items-center">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <span className="grid size-12 place-items-center rounded-[12px] bg-accent-persist-soft text-accent-persist">
          <Database className="size-5" strokeWidth={1.8} />
        </span>
        <div className="flex flex-col gap-1.5">
          <p className="text-caption-strong text-ink">Здесь пока пусто</p>
          <p className="text-caption text-ink-muted-48">
            Отправь первое сообщение от{" "}
            <span className="font-medium text-ink-muted-80">{runtime.peer.name}</span> — оно появится во всех вкладках,
            где открыт этот демо.
          </p>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  own,
  showTail,
  showTimestamp,
}: {
  message: ChatMessage;
  own: boolean;
  showTail: boolean;
  showTimestamp: boolean;
}) {
  return (
    <div className={cn(own ? "text-right" : "text-left")}>
      <div
        className={cn(
          "inline-block max-w-[78%] rounded-[18px] px-3.5 py-2 text-left text-caption leading-snug shadow-card align-top",
          own
            ? "bg-primary text-on-primary"
            : "border border-hairline bg-canvas text-ink",
          own && showTail && "rounded-br-[6px]",
          !own && showTail && "rounded-bl-[6px]",
        )}
      >
        <p className="whitespace-pre-wrap wrap-break-word">{message.text}</p>
      </div>
      {showTimestamp && (
        <div className={cn("mt-1 px-2 text-fine-print text-ink-muted-48", own ? "text-right" : "text-left")}>
          {formatTime(message.sentAt)}
        </div>
      )}
    </div>
  );
}

function GroupAvatar({ author, color }: { author: string; color: string }) {
  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-full text-fine-print font-semibold text-white shadow-card"
      style={{ background: color }}
    >
      {author.slice(0, 1).toUpperCase()}
    </span>
  );
}

function MessageGroupRow({
  group,
  ownPeerId,
}: {
  group: MessageGroup;
  ownPeerId: string;
}) {
  const own = group.peerId === ownPeerId;

  return (
    <div className={cn("flex gap-2.5", own && "flex-row-reverse")}>
      {own ? <span className="size-8 shrink-0" aria-hidden /> : <GroupAvatar author={group.author} color={group.color} />}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {!own && (
          <span className="px-2 text-fine-print font-medium text-ink-muted-80">{group.author}</span>
        )}
        {group.messages.map((message, index) => (
          <MessageBubble
            key={message.id}
            message={message}
            own={own}
            showTail={index === group.messages.length - 1}
            showTimestamp={index === group.messages.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

function Transcript({ runtime }: { runtime: PersistChatRuntime }) {
  const messages = useSelector((state) => state.chatThread.context.messages);
  const groups = useMemo(() => groupMessages(messages), [messages]);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  return (
    <div
      ref={scrollerRef}
      className="flex h-[400px] flex-col overflow-y-auto rounded-md bg-surface-pearl px-4 py-5"
    >
      {groups.length ? (
        <div className="mt-auto flex flex-col gap-4">
          {groups.map((group, index) => (
            <MessageGroupRow key={`${group.peerId}-${index}`} group={group} ownPeerId={runtime.peer.id} />
          ))}
        </div>
      ) : (
        <EmptyTranscript runtime={runtime} />
      )}
    </div>
  );
}

function Composer() {
  const transition = useTransition();
  const { draft } = useSelector((state) => state.chatComposer.context);
  const composerState = useSelector((state) => state.chatComposer.state);
  const canSend = draft.trim().length > 0;

  const peer = useSelector((state) => state.chatSession.context.peer);

  const sendMessage = () => {
    const text = draft.trim();
    if (!text) return;
    transition({
      type: "MESSAGE_SENT",
      payload: {
        message: {
          id: createMessageId(peer.id),
          peerId: peer.id,
          author: peer.name,
          color: peer.color,
          text,
          sentAt: Date.now(),
        },
      },
    });
  };

  const clearHistory = () => {
    transition({ type: "HISTORY_CLEARED", payload: { clearedAt: Date.now() } });
  };

  return (
    <div className="flex items-end gap-2 border-t border-hairline bg-canvas px-4 py-3">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title="Очистить историю"
        aria-label="Очистить историю"
        onClick={clearHistory}
        className="size-9 shrink-0 rounded-full text-ink-muted-48 hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-4" strokeWidth={1.9} />
      </Button>

      <div className="flex flex-1 flex-col rounded-[18px] border border-hairline bg-surface-pearl transition-colors focus-within:border-accent-persist/60 focus-within:bg-canvas focus-within:ring-2 focus-within:ring-accent-persist/15">
        <textarea
          value={draft}
          rows={1}
          onChange={(event) => {
            const value = event.target.value;
            transition(value.trim() ? { type: "DRAFT_CHANGED", payload: { value } } : { type: "DRAFT_CLEARED" });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              sendMessage();
            }
          }}
          placeholder={`Сообщение от ${peer.name}…`}
          className="max-h-32 min-h-9 resize-none bg-transparent px-4 py-2 text-caption text-ink outline-none placeholder:text-ink-muted-48"
        />
      </div>

      <Button
        type="button"
        disabled={!canSend}
        onClick={sendMessage}
        title={composerState === "WRITING" ? "Enter — отправить" : "Напиши сообщение"}
        className="size-9 shrink-0 rounded-full bg-primary text-on-primary shadow-card hover:bg-primary/90 active:scale-[0.94] disabled:bg-canvas-parchment disabled:text-ink-muted-48 disabled:shadow-none"
      >
        <SendHorizontal className="size-4" strokeWidth={2} />
      </Button>
    </div>
  );
}

function ChatPanel({ runtime }: { runtime: PersistChatRuntime }) {
  const status = usePersistStatus(runtime.persist);
  const peer = useSelector((state) => state.chatSession.context.peer);
  const messageCount = useSelector((state) => state.chatThread.context.messages.length);
  const updatedAt = useSelector((state) => state.chatThread.context.updatedAt);

  return (
    <Card className="overflow-hidden gap-0 rounded-lg bg-canvas py-0 ring-1 ring-hairline">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-4">
        <div className="flex items-center gap-3">
          <GroupAvatar author={peer.name} color={peer.color} />
          <div className="flex flex-col">
            <p className="text-caption-strong text-ink">{peer.name}</p>
            <p className="text-fine-print text-ink-muted-48">
              {messageCount > 0
                ? `${messageCount} сообщений · обновлено ${formatTime(updatedAt)}`
                : "Эта вкладка ещё ничего не написала"}
            </p>
          </div>
        </div>
        <SyncIndicator phase={status.phase} restored={status.phase === "ready" ? status.restored : undefined} />
      </header>

      <CardContent className="p-0">
        <Transcript runtime={runtime} />
      </CardContent>

      <Composer />
    </Card>
  );
}

function DataFlowHint() {
  const steps = [
    "MESSAGE_SENT",
    `throttle ${PERSIST_THROTTLE_MS}ms`,
    "localStorage.set",
    "storage event",
    "persist.restore()",
  ];

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-md border border-dashed border-hairline px-4 py-3 font-mono text-fine-print text-ink-muted-48">
      {steps.map((step, index) => (
        <span key={step} className="inline-flex items-center gap-2">
          <span
            className={cn(
              index === 0 || index === steps.length - 1 ? "text-accent-persist" : "text-ink-muted-80",
            )}
          >
            {step}
          </span>
          {index < steps.length - 1 && <span aria-hidden className="text-ink-muted-48">→</span>}
        </span>
      ))}
    </div>
  );
}

type TechFactProps = {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
};

function TechFact({ icon, label, value }: TechFactProps) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="grid size-7 shrink-0 place-items-center rounded-sm bg-canvas-parchment text-ink-muted-80">
        {icon}
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-fine-print text-ink-muted-48 uppercase tracking-wide">{label}</span>
        <span className="truncate font-mono text-caption text-ink">{value}</span>
      </div>
    </div>
  );
}

function SnapshotPanel({ runtime, expanded }: { runtime: PersistChatRuntime; expanded: boolean }) {
  const thread = useSelector((state) => state.chatThread);

  const snapshotText = useMemo(
    () =>
      JSON.stringify(
        {
          storageVersion: PERSIST_STORAGE_VERSION,
          snapshot: { machines: { chatThread: thread } },
        },
        null,
        2,
      ),
    [thread],
  );

  if (!expanded) return null;

  return (
    <div className="grid gap-3 border-t border-hairline px-5 pt-4 pb-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-2">
        <p className="text-fine-print uppercase tracking-wide text-ink-muted-48">storage record</p>
        <pre className="max-h-72 overflow-auto rounded-md border border-hairline bg-surface-pearl p-4 text-[12px] leading-relaxed text-ink-muted-80">
          <code>{snapshotText}</code>
        </pre>
        <p className="text-fine-print text-ink-muted-48">
          Это то, что лежит в <code className="rounded-sm bg-canvas-parchment px-1 text-ink">localStorage</code>{" "}
          и проигрывается через <span className="text-ink">manager.hydrate()</span>.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-fine-print uppercase tracking-wide text-ink-muted-48">persistManager config</p>
        <pre className="max-h-72 overflow-auto rounded-md bg-surface-black p-4 text-[12px] leading-relaxed text-white/80">
          <code>{`persistManager(manager, {
  storage,
  machines: ["chatThread"],
  throttleMs: ${PERSIST_THROTTLE_MS},
  shouldSave: ({ action }) =>
    action.type === "MESSAGE_SENT" ||
    action.type === "HISTORY_CLEARED",
})`}</code>
        </pre>
        <p className="text-fine-print text-ink-muted-48">
          В сторадж попадает только{" "}
          <code className="rounded-sm bg-canvas-parchment px-1 text-ink">chatThread</code> — composer и сессия живут
          только в этом runtime.
        </p>
      </div>
    </div>
  );
}

function TechRail({ runtime }: { runtime: PersistChatRuntime }) {
  const restoring = useIsPersistRestoring(runtime.persist);
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="gap-0 rounded-lg bg-canvas py-0 ring-1 ring-hairline">
      <div className="grid items-center gap-4 px-5 py-4 sm:grid-cols-[1fr_auto] sm:gap-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TechFact
            icon={<KeyRound className="size-3.5" strokeWidth={1.9} />}
            label="storage key"
            value={<span title={PERSIST_STORAGE_KEY}>{PERSIST_STORAGE_KEY}</span>}
          />
          <TechFact
            icon={<Timer className="size-3.5" strokeWidth={1.9} />}
            label="throttle"
            value={`${PERSIST_THROTTLE_MS}ms`}
          />
          <TechFact
            icon={<HardDrive className="size-3.5" strokeWidth={1.9} />}
            label="machines"
            value={`["chatThread"]${restoring ? " · restoring…" : ""}`}
          />
        </div>
        <div className="flex items-center gap-2 justify-self-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void runtime.persist.flush()}
            className="h-8 gap-1.5 rounded-sm border border-hairline px-3 text-caption text-ink-muted-80 hover:border-accent-persist/40 hover:text-accent-persist"
          >
            <RefreshCcw className="size-3.5" strokeWidth={1.9} />
            flush
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            className="h-8 gap-1.5 rounded-sm border border-hairline px-3 text-caption text-ink-muted-80 hover:border-accent-persist/40 hover:text-accent-persist"
          >
            {expanded ? "Скрыть snapshot" : "Показать snapshot"}
            <ChevronDown
              className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
              strokeWidth={1.9}
            />
          </Button>
        </div>
      </div>
      <SnapshotPanel runtime={runtime} expanded={expanded} />
    </Card>
  );
}

function ChatApp({ runtime }: { runtime: PersistChatRuntime }) {
  return (
    <section className="flex flex-col gap-8">
      <HeroSection runtime={runtime} />

      <div className="mx-auto w-full max-w-2xl">
        <ChatPanel runtime={runtime} />
      </div>

      <div className="mx-auto w-full max-w-3xl">
        <DataFlowHint />
      </div>

      <TechRail runtime={runtime} />
    </section>
  );
}

function PersistRuntime() {
  const runtimeRef = useRef<PersistChatRuntime | null>(null);
  if (!runtimeRef.current) runtimeRef.current = makePersistChatRuntime(window.localStorage);
  const runtime = runtimeRef.current;

  return (
    <FSMContextProvider machineManager={runtime.manager} persist={runtime.persist}>
      <ChatApp runtime={runtime} />
    </FSMContextProvider>
  );
}

export function Demo() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <RuntimeSkeleton />;
  return <PersistRuntime />;
}
