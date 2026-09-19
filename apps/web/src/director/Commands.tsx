import { useState } from "react";
import { useStream } from "../ws";
import { useCommand } from "./useCommand";

type Flag = "verification" | "offline";
const FLAGS: { flag: Flag; label: string }[] = [
  { flag: "verification", label: "Camera verification" },
  { flag: "offline", label: "Offline mode" },
];

/**
 * The headset owns the flags and the server does not store them, so a flag's value is unknown until
 * someone sets it. The buttons show the last value seen on the stream, from this page or another.
 */
export function Commands() {
  const [flags, setFlags] = useState<Partial<Record<Flag, boolean>>>({});
  const { send, busy, error, sent } = useCommand();

  useStream((msg) => {
    if (msg.type !== "director_command" || msg.command.type !== "set_flag") return;
    const { flag, value } = msg.command;
    if (flag === "verification" || flag === "offline") setFlags((f) => ({ ...f, [flag]: value }));
  });

  const setFlag = async (flag: Flag, value: boolean) => {
    if (await send({ type: "set_flag", flag, value }, `${flag} ${value ? "on" : "off"}`)) setFlags((f) => ({ ...f, [flag]: value }));
  };

  return (
    <section className="card commands">
      <h2>Headset commands</h2>
      <div className="row wrap">
        <button type="button" disabled={busy} onClick={() => void send({ type: "goto", demo_state: "REPLAY_INTRO" }, "replay intro")}>
          Replay intro
        </button>
        <button type="button" disabled={busy} onClick={() => void send({ type: "goto", demo_state: "HISTORY" }, "jump to history")}>
          Jump to history
        </button>
      </div>
      {FLAGS.map(({ flag, label }) => (
        <div className="row flag-row" key={flag}>
          <span className="flag-label">{label}</span>
          <div className="toggle" role="group" aria-label={label}>
            <button type="button" className={flags[flag] === true ? "active" : ""} aria-pressed={flags[flag] === true} disabled={busy} onClick={() => void setFlag(flag, true)}>On</button>
            <button type="button" className={flags[flag] === false ? "active" : ""} aria-pressed={flags[flag] === false} disabled={busy} onClick={() => void setFlag(flag, false)}>Off</button>
          </div>
          {flags[flag] === undefined && <span className="muted small">not set from here yet</span>}
        </div>
      ))}
      {error && <p className="error-text">{error}</p>}
      {sent && !error && <p className="ok-text small">Sent: {sent}</p>}
    </section>
  );
}
