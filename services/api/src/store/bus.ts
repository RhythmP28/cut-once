import { EventEmitter } from "node:events";
import type { Assembly, BuildEvent, WsMessage } from "@cutonce/schemas";

export interface BusEvents {
  event_appended: [{ assembly: Assembly; event: BuildEvent; head: number; previous: BuildEvent | null }];
  assembly_changed: [{ assembly: Assembly }];
  plan_ready: [{ plan_id: string; revision: number }];
  broadcast: [WsMessage];
}

/** In-process pub/sub. The stream hub and the Elasticsearch indexer subscribe; routes never call them directly. */
export class Bus extends EventEmitter<BusEvents> {}
