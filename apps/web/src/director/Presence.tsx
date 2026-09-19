import type { Presence as PresenceClient } from "@cutonce/schemas";
import { ago, useNow } from "../format";
import type { StreamStatus } from "../ws";

export function Presence({ clients, status }: { clients: PresenceClient[]; status: StreamStatus }) {
  const now = useNow(1000);
  const live = status === "open";
  const quests = clients.filter((c) => c.kind === "quest");
  const headsetOn = live && quests.length > 0;
  const sorted = [...clients].sort((a, b) => (a.kind === b.kind ? a.connected_at.localeCompare(b.connected_at) : a.kind === "quest" ? -1 : 1));

  return (
    <section className="card presence">
      <div className={`headset ${headsetOn ? "on" : "off"}`}>
        <span className={`dot ${headsetOn ? "green" : "grey"}`} />
        <span className="headset-label">Headset: {headsetOn ? "connected" : "not connected"}</span>
        {headsetOn && quests[0] && <span className="muted">{quests[0].id} · {ago(quests[0].connected_at, now)}</span>}
      </div>
      <div className="presence-stream">
        <span className={`dot ${live ? "green" : "grey"}`} />
        <span>Live stream: {status === "open" ? "connected" : status === "connecting" ? "connecting…" : "disconnected, retrying"}</span>
      </div>
      {sorted.length > 0 && (
        <ul className="client-list">
          {sorted.map((c) => (
            <li key={`${c.kind}:${c.id}`}>
              <span className={`dot ${live ? "green" : "grey"}`} />
              <span className="client-kind">{c.kind}</span>
              <span className="mono">{c.id}</span>
              <span className="muted">connected {ago(c.connected_at, now)}</span>
            </li>
          ))}
        </ul>
      )}
      {!live && sorted.length > 0 && <p className="muted small">Shown grey because this list is from before the stream dropped.</p>}
    </section>
  );
}
