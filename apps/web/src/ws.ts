import { useEffect, useRef, useSyncExternalStore } from "react";
import { WsMessageSchema, type WsMessage } from "@cutonce/schemas";
import { clearToken, getToken, subscribeToken } from "./auth";

export type StreamStatus = "idle" | "connecting" | "open" | "closed";
type Listener = (msg: WsMessage) => void;

const BACKOFF_MIN_MS = 500;
const BACKOFF_MAX_MS = 10_000;
/** Keep the socket briefly after the last subscriber leaves, so page changes do not reconnect. */
const LINGER_MS = 1_000;
/** The server closes with this code when the token is wrong. */
const CLOSE_BAD_TOKEN = 4401;

function randomId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return "web_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * One shared connection to the global stream, however many components subscribe.
 * It reconnects with exponential backoff, and replays the last `presence` message to late
 * subscribers (the server only sends presence on connect and when the client list changes).
 */
class StreamClient {
  readonly clientId = randomId();
  private ws: WebSocket | null = null;
  private status: StreamStatus = "idle";
  private attempts = 0;
  private retryTimer: number | undefined;
  private lingerTimer: number | undefined;
  private lastPresence: WsMessage | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly statusListeners = new Set<() => void>();

  constructor() {
    // A new token (typed in after a rejection) should connect straight away.
    subscribeToken(() => {
      if (this.listeners.size === 0) return;
      this.disconnect();
      this.attempts = 0;
      this.connect();
    });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    window.clearTimeout(this.lingerTimer);
    if (this.lastPresence) listener(this.lastPresence);
    if (!this.ws && this.retryTimer === undefined) this.connect();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        window.clearTimeout(this.lingerTimer);
        this.lingerTimer = window.setTimeout(() => {
          if (this.listeners.size === 0) {
            this.disconnect();
            this.setStatus("idle");
          }
        }, LINGER_MS);
      }
    };
  }

  subscribeStatus = (listener: () => void): (() => void) => {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  };

  getStatus = (): StreamStatus => this.status;

  private setStatus(s: StreamStatus): void {
    if (this.status === s) return;
    this.status = s;
    for (const l of this.statusListeners) l();
  }

  private url(token: string): string {
    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    const qs = new URLSearchParams({ token, client: "web", id: this.clientId });
    return `${scheme}://${window.location.host}/v1/stream?${qs.toString()}`;
  }

  private connect(): void {
    window.clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    const token = getToken();
    if (!token) {
      this.setStatus("closed");
      return; // The token listener reconnects once one is typed in.
    }
    this.setStatus("connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url(token));
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.attempts = 0;
      this.setStatus("open");
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws || typeof ev.data !== "string") return;
      let raw: unknown;
      try {
        raw = JSON.parse(ev.data);
      } catch {
        console.warn("[ws] dropped a message that was not JSON");
        return;
      }
      const parsed = WsMessageSchema.safeParse(raw);
      if (!parsed.success) {
        console.warn("[ws] dropped a message that did not match WsMessage", raw, parsed.error.issues);
        return;
      }
      if (parsed.data.type === "presence") this.lastPresence = parsed.data;
      for (const l of [...this.listeners]) {
        try {
          l(parsed.data);
        } catch (e) {
          console.error("[ws] a listener threw", e);
        }
      }
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.lastPresence = null;
      this.setStatus("closed");
      if (ev.code === CLOSE_BAD_TOKEN) {
        clearToken(true); // Shows the token prompt again; typing a new one reconnects.
        return;
      }
      if (this.listeners.size > 0) this.scheduleReconnect();
    };
    ws.onerror = () => {
      // onclose always follows; reconnecting is handled there.
    };
  }

  private scheduleReconnect(): void {
    const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** this.attempts);
    const delay = base / 2 + Math.random() * (base / 2);
    this.attempts += 1;
    window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = undefined;
      if (this.listeners.size > 0) this.connect();
    }, delay);
  }

  private disconnect(): void {
    window.clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    const ws = this.ws;
    this.ws = null;
    this.lastPresence = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try {
        ws.close(1000, "client closing");
      } catch {
        // ignore
      }
    }
  }
}

let client: StreamClient | null = null;
function getClient(): StreamClient {
  client ??= new StreamClient();
  return client;
}

/** Subscribe to the live stream for the life of the component. The latest `onMessage` is always used. */
export function useStream(onMessage: (msg: WsMessage) => void): void {
  const ref = useRef(onMessage);
  ref.current = onMessage;
  useEffect(() => getClient().subscribe((m) => ref.current(m)), []);
}

/** Connection status of the shared stream, for a "live / reconnecting" badge. */
export function useStreamStatus(): StreamStatus {
  const c = getClient();
  return useSyncExternalStore(c.subscribeStatus, c.getStatus, () => "idle" as const);
}
