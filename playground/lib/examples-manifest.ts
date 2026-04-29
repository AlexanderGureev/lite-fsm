export type ExampleTag = "basics" | "effects" | "actors" | "ssr";

export type ExampleCategoryId = "basics" | "effects" | "actors" | "ssr";

export type ExampleIconKey =
  | "lamp"
  | "heart"
  | "actors"
  | "network"
  | "gamepad"
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
    ssr: [],
  };
  for (const example of examples) map[example.category].push(example);
  return map;
})();

export const exampleById = (id: string) => examples.find((entry) => entry.id === id);

export const examplePath = (id: string) => `/examples/${id}`;

type CategoryStyle = {
  text: string;
  bgSoft: string;
  border: string;
  accent: string;
  ring: string;
};

export const categoryStyle: Record<ExampleCategoryId, CategoryStyle> = {
  basics: {
    text: "text-accent-basics",
    bgSoft: "bg-accent-basics-soft",
    border: "border-accent-basics/30",
    accent: "bg-accent-basics",
    ring: "ring-accent-basics/40",
  },
  effects: {
    text: "text-accent-effects",
    bgSoft: "bg-accent-effects-soft",
    border: "border-accent-effects/30",
    accent: "bg-accent-effects",
    ring: "ring-accent-effects/40",
  },
  actors: {
    text: "text-accent-actors",
    bgSoft: "bg-accent-actors-soft",
    border: "border-accent-actors/30",
    accent: "bg-accent-actors",
    ring: "ring-accent-actors/40",
  },
  ssr: {
    text: "text-accent-ssr",
    bgSoft: "bg-accent-ssr-soft",
    border: "border-accent-ssr/30",
    accent: "bg-accent-ssr",
    ring: "ring-accent-ssr/40",
  },
};
