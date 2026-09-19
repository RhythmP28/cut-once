import type { WebSocket } from "ws";
import type { Presence, WsMessage } from "@cutonce/schemas";
import type { Store } from "../store/store.js";

interface Client { socket: WebSocket; presence: Presence }

/** One global stream. A new run needs no reconnect: clients get `assembly_changed` and carry on. */
export class Hub {
  private clients = new Set<Client>();
  private ping: NodeJS.Timeout;

  constructor(private store: Store) {
    store.bus.on("event_appended", ({ assembly, event, head }) => this.broadcast({ type: "event_appended", assembly_id: assembly.assembly_id, event, head }));
    store.bus.on("assembly_changed", ({ assembly }) => this.broadcast({ type: "assembly_changed", assembly }));
    store.bus.on("plan_ready", (m) => this.broadcast({ type: "plan_ready", ...m }));
    store.bus.on("broadcast", (m) => this.broadcast(m));
    // Phone hotspots drop idle connections; a ping every 20 s keeps the path open.
    this.ping = setInterval(() => { for (const c of this.clients) if (c.socket.readyState === c.socket.OPEN) c.socket.ping(); }, 20_000);
    this.ping.unref();
  }

  presence = (): Presence[] => [...this.clients].map((c) => c.presence);

  add(socket: WebSocket, kind: Presence["kind"], id: string) {
    const client: Client = { socket, presence: { kind, id, connected_at: new Date().toISOString() } };
    this.clients.add(client);
    socket.on("close", () => { this.clients.delete(client); this.broadcast({ type: "presence", clients: this.presence() }); });
    socket.on("error", () => socket.close());
    this.broadcast({ type: "presence", clients: this.presence() });
    const current = this.store.currentAssembly();
    if (current) this.send(client, { type: "assembly_changed", assembly: current }); // lets a reconnecting headset resync
  }

  private send(c: Client, msg: WsMessage) { if (c.socket.readyState === c.socket.OPEN) c.socket.send(JSON.stringify(msg)); }
  broadcast(msg: WsMessage) { for (const c of this.clients) this.send(c, msg); }
  close() { clearInterval(this.ping); for (const c of this.clients) c.socket.close(); }
}
