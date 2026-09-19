import { useCallback, useState } from "react";
import type { DirectorCommand } from "@cutonce/schemas";
import { ApiError, describeError, sendDirectorCommand } from "../api";

/** Post a DirectorCommand and keep the pending / error state for the button that sent it. */
export function useCommand(onDone?: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const send = useCallback(
    async (command: DirectorCommand, label: string): Promise<boolean> => {
      setBusy(true);
      setError(null);
      setSent(null);
      try {
        await sendDirectorCommand(command);
        setSent(label);
        onDone?.();
        return true;
      } catch (e) {
        setError(e instanceof ApiError && e.code === "no_op" ? "Nothing to change: the part is already in that state." : describeError(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [onDone],
  );

  return { send, busy, error, sent };
}
