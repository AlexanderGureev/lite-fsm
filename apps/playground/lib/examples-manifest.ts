export type ExampleTag = "basics" | "effects" | "actors" | "persist" | "ssr";

export type ExampleCategoryId = "basics" | "effects" | "actors" | "persist" | "ssr";

export type ExampleIconKey =
  | "lamp"
  | "heart"
  | "actors"
  | "network"
  | "gamepad"
  | "download"
  | "persist"
  | "streaming"
  | "grid"
  | "snapshot";

export type ExampleManifestEntry = {
  id: string;
  title: string;
  kicker: string;
  description: string;
  tags: ExampleTag[];
  category: ExampleCategoryId;
  iconKey: ExampleIconKey;
};

export type ExampleCategory = {
  id: ExampleCategoryId;
  label: string;
  short: string;
  description: string;
};

export const categories = [
  {
    id: "basics",
    label: "Старт",
    short: "Basics",
    description: "Базовая форма машины: состояния, события, переходы, контекст.",
  },
  {
    id: "effects",
    label: "Async-эффекты",
    short: "Effects",
    description: "Оптимистичные апдейты, pending-состояния и обработка ошибок.",
  },
  {
    id: "actors",
    label: "Actors",
    short: "Actors",
    description: "Live actor-инстансы, actor-группы, hydration между store.",
  },
  {
    id: "persist",
    label: "Persist",
    short: "Persist",
    description: "Сохранение MachineManager snapshot-а, restore и синхронизация вкладок через storage adapter.",
  },
  {
    id: "ssr",
    label: "SSR & streaming",
    short: "SSR",
    description: "Стриминг виджетов, manifest-first и snapshot-first hydration.",
  },
] as const satisfies readonly ExampleCategory[];

export const examples = [
  {
    id: "lamp",
    title: "Лампа: переключатель ON/OFF",
    kicker: "С чего начать",
    description:
      "Простейшая FSM из двух состояний и счётчика переключений. Удобно посмотреть форму машины: события, переходы, контекст.",
    tags: ["basics"],
    category: "basics",
    iconKey: "lamp",
  },
  {
    id: "likes",
    title: "Лайки: оптимистичные апдейты",
    kicker: "Async-эффекты",
    description:
      "Клик по LIKE мгновенно меняет UI, в фоне идёт fetch. Pending-счётчик и ошибки живут в отдельной машине — никаких гонок и моргания.",
    tags: ["effects"],
    category: "effects",
    iconKey: "heart",
  },
  {
    id: "likes-v2",
    title: "Лайки на actor-шаблонах",
    kicker: "Actors вместо pending-машины",
    description:
      "Та же оптимистичная схема без отдельной pending-машины: каждый запрос — живой actor, в полёте = сколько актёров живо.",
    tags: ["actors", "effects"],
    category: "actors",
    iconKey: "actors",
  },
  {
    id: "actor-canvas",
    title: "Совместный рисунок: Alice ↔ Bob",
    kicker: "Hydration через snapshots",
    description:
      "Два независимых store обмениваются snapshot-ами штрихов. Тот же канал годится для BroadcastChannel, WebRTC или backend-а.",
    tags: ["actors"],
    category: "actors",
    iconKey: "network",
  },
  {
    id: "roguelite",
    title: "Roguelite на Phaser",
    kicker: "Actor-группы в реальном времени",
    description:
      "Игрок, враги и снаряды живут как actor-группы lite-fsm. Phaser отвечает только за рендер, вся логика — в машинах.",
    tags: ["actors"],
    category: "actors",
    iconKey: "gamepad",
  },
  {
    id: "album-download",
    title: "Релиз: закачка альбома и треков",
    kicker: "Actors для download-задач",
    description:
      "Каждый трек скачивается отдельным actor-инстансом: прогресс, пауза, resume и сброс собираются в общий прогресс релиза.",
    tags: ["actors", "effects"],
    category: "actors",
    iconKey: "download",
  },
  {
    id: "persist",
    title: "Persist: мини-чат в localStorage",
    kicker: "Storage adapter",
    description:
      "История чата сохраняется через persistManager, а соседние вкладки подтягивают snapshot через localStorage event.",
    tags: ["persist"],
    category: "persist",
    iconKey: "persist",
  },
  {
    id: "ssr-demo",
    title: "SSR: streaming-виджеты + кеш",
    kicker: "Long-lived store",
    description:
      "Сессия пользователя грузится один раз в layout, виджеты страниц стримятся независимо и кешируются как у React Query.",
    tags: ["ssr"],
    category: "ssr",
    iconKey: "streaming",
  },
  {
    id: "ssr-demo-2",
    title: "SSR: grid-пагинация со streaming",
    kicker: "Manifest + независимые виджеты",
    description:
      "Сервер отдаёт первую страницу grid-манифеста, каждый виджет стримится сам по себе, дальнейшая пагинация — на клиенте.",
    tags: ["ssr"],
    category: "ssr",
    iconKey: "grid",
  },
  {
    id: "ssr-demo-3",
    title: "SSR: hydration через snapshots",
    kicker: "FSMHydrationBoundary",
    description:
      "Manifest и seed виджетов приходят с сервера как готовые MachineManager-снапшоты. На клиенте — никаких повторных запросов.",
    tags: ["ssr"],
    category: "ssr",
    iconKey: "snapshot",
  },
] as const satisfies readonly ExampleManifestEntry[];

export const examplesByCategory = (() => {
  const map: Record<ExampleCategoryId, ExampleManifestEntry[]> = {
    basics: [],
    effects: [],
    actors: [],
    persist: [],
    ssr: [],
  };
  for (const example of examples) map[example.category].push(example);
  return map;
})();

export const exampleById = (id: string) => examples.find((entry) => entry.id === id);

export const examplePath = (id: string) => `/examples/${id}`;

export const exampleSourcePath = (id: string) => `apps/playground/app/examples/${id}`;

type CategoryGlow = {
  h: number;
  s: number;
  l: number;
};

type CategoryStyle = {
  text: string;
  hoverText: string;
  bgSoft: string;
  border: string;
  accent: string;
  ring: string;
  glow: CategoryGlow;
};

export const categoryStyle: Record<ExampleCategoryId, CategoryStyle> = {
  basics: {
    text: "text-accent-basics",
    hoverText: "group-hover:text-accent-basics",
    bgSoft: "bg-accent-basics-soft",
    border: "border-accent-basics/30",
    accent: "bg-accent-basics",
    ring: "ring-accent-basics/40",
    glow: { h: 215, s: 26, l: 52 },
  },
  effects: {
    text: "text-accent-effects",
    hoverText: "group-hover:text-accent-effects",
    bgSoft: "bg-accent-effects-soft",
    border: "border-accent-effects/30",
    accent: "bg-accent-effects",
    ring: "ring-accent-effects/40",
    glow: { h: 212, s: 100, l: 54 },
  },
  actors: {
    text: "text-accent-actors",
    hoverText: "group-hover:text-accent-actors",
    bgSoft: "bg-accent-actors-soft",
    border: "border-accent-actors/30",
    accent: "bg-accent-actors",
    ring: "ring-accent-actors/40",
    glow: { h: 268, s: 92, l: 66 },
  },
  persist: {
    text: "text-accent-persist",
    hoverText: "group-hover:text-accent-persist",
    bgSoft: "bg-accent-persist-soft",
    border: "border-accent-persist/30",
    accent: "bg-accent-persist",
    ring: "ring-accent-persist/40",
    glow: { h: 174, s: 70, l: 34 },
  },
  ssr: {
    text: "text-accent-ssr",
    hoverText: "group-hover:text-accent-ssr",
    bgSoft: "bg-accent-ssr-soft",
    border: "border-accent-ssr/30",
    accent: "bg-accent-ssr",
    ring: "ring-accent-ssr/40",
    glow: { h: 30, s: 96, l: 54 },
  },
};
