import { createEntitiesRtsScene, RTS_CANVAS, type PhaserApi } from "./components/phaser-scene";
import { DEFAULT_GAME_CONFIG, makeStore, type AppStore, type GameConfig } from "./store";
import { createRtsMetricsAdapter, type MetricsAdapter } from "./store/metrics";

type GameLike = {
  destroy: (removeCanvas?: boolean, noReturn?: boolean) => void;
  scale?: {
    resize?: (width: number, height: number) => void;
  };
};

export type RtsApp = {
  store: AppStore;
  metrics: MetricsAdapter;
  mountScene: (container: HTMLElement) => () => void;
};

export type CreateRtsAppOptions = {
  autoStart?: boolean;
  initialConfig?: GameConfig;
};

export function createRtsApp({ autoStart = false, initialConfig }: CreateRtsAppOptions = {}): RtsApp {
  const metrics = createRtsMetricsAdapter(() => performance.now());
  const store = makeStore({
    metrics,
    random: Math.random,
    renderer: { reset: () => undefined },
  });

  if (autoStart) {
    store.transition({
      type: "GAME_START",
      payload: {
        enemyCount: initialConfig?.enemyCount ?? DEFAULT_GAME_CONFIG.enemyCount,
        allyCount: initialConfig?.allyCount ?? DEFAULT_GAME_CONFIG.allyCount,
        seed: initialConfig?.seed ?? DEFAULT_GAME_CONFIG.seed,
        ...(initialConfig?.playerUnitHp === undefined ? {} : { playerUnitHp: initialConfig.playerUnitHp }),
      },
    });
  }

  const mountScene = (container: HTMLElement) => {
    let disposed = false;
    let game: GameLike | undefined;

    const preventContextMenu = (event: MouseEvent) => event.preventDefault();
    const readContainerSize = () => ({
      width: Math.max(1, Math.floor(container.clientWidth || RTS_CANVAS.width)),
      height: Math.max(1, Math.floor(container.clientHeight || RTS_CANVAS.height)),
    });
    const resizeGame = () => {
      const size = readContainerSize();
      game?.scale?.resize?.(size.width, size.height);
    };
    const resizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(resizeGame);

    container.addEventListener("contextmenu", preventContextMenu);
    resizeObserver?.observe(container);
    window.addEventListener("resize", resizeGame);

    void (async () => {
      const Phaser = (await import("phaser")) as PhaserApi;
      if (disposed) return;
      const size = readContainerSize();

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: container,
        width: size.width,
        height: size.height,
        backgroundColor: "#101612",
        render: {
          antialias: false,
          pixelArt: true,
          roundPixels: false,
        },
        scale: {
          mode: Phaser.Scale.RESIZE,
        },
        scene: createEntitiesRtsScene(Phaser, store, metrics),
      }) as GameLike;
      
      resizeGame();
    })();

    return () => {
      disposed = true;
      container.removeEventListener("contextmenu", preventContextMenu);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", resizeGame);
      game?.destroy(true);
    };
  };

  return { store, metrics, mountScene };
}
