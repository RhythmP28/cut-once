import type { Presence as PresenceClient } from "@cutonce/schemas";
import { ago, useNow } from "../format";
import type { StreamStatus } from "../ws";

/** What the operator needs at a glance: is the headset on, and is this page still live. */
export function Presence({ clients, status }: { clients: PresenceClient[]; status: StreamStatus }) {
  const now = useNow(1000);
  const live = status === "open";
  const quest = clients.find((c) => c.kind === "quest");
  const headsetOn = live && !!quest;

  return (
    <section className="card presence">
      <div className={`headset ${headsetOn ? "on" : "off"}`}>
        <span className={`dot ${headsetOn ? "green" : "grey"}`} />
        <span className="headset-label">Headset {headsetOn ? "connected" : "not connected"}</span>
        {headsetOn && quest && <span className="muted">{ago(quest.connected_at, now)}</span>}
      </div>
      {!live && (
        <div className="presence-stream">
          <span className="dot grey" />
          <span>{status === "connecting" ? "Connecting to the server…" : "Lost the server, retrying"}</span>
        </div>
      )}
    </section>
  );
}
