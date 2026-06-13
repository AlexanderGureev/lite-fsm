import type { SpawnEvents } from "./spawn-events";
import type * as blinkActor from "./machines/blink-actor";
import type * as enemyActor from "./machines/enemy-actor";
import type * as worldMachine from "./machines/world-machine";

export type AppEvents = SpawnEvents | worldMachine.Events | blinkActor.Events | enemyActor.Events;
