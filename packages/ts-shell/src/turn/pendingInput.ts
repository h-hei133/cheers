import type { TurnInput } from "./session.js";

/**
 * A run's input handle, from before the run exists.
 *
 * A turn is not ready the moment the caller asks for it: a real provider is
 * checked for readiness first, and the MCP tool snapshot is awaited before the
 * tool pool is built. Input typed in that window has nowhere to go yet, and
 * dropping it would silently lose the user's message — so it is held here and
 * delivered when the run's own handle appears.
 *
 * One implementation rather than one per call site. Two copies of this existed,
 * and they had already drifted: the copy that only read its own buffer reported
 * an empty queue while the run held the messages, so text the user typed was
 * invisible to `pending()` and unrecoverable through `clearQueue()` — which is
 * what the interrupt path uses to hand undelivered input back to the editor.
 */
export interface PendingTurnInput {
  /** The handle callers get now. Safe to use before {@link PendingTurnInput.adopt}. */
  readonly input: TurnInput;
  /**
   * Bind the run's own handle, delivering whatever was typed before it existed.
   *
   * A run that takes no input leaves the buffer in place instead of adopting
   * nothing: "this run reads no input" and "the run has not started" are
   * different, and only the second has somewhere to deliver to later.
   */
  adopt(run: { readonly input?: TurnInput } | undefined): void;
}

export function pendingTurnInput(): PendingTurnInput {
  const steering: string[] = [];
  const followUps: string[] = [];
  // The run's own handle once it exists. Everything below reads and writes
  // through it when it is set, so the queue reported and the queue drained are
  // the run's — the queue that actually holds the messages.
  let live: TurnInput | undefined;

  const input: TurnInput = {
    steer: (text) => {
      if (live) live.steer(text);
      else steering.push(text);
    },
    followUp: (text) => {
      if (live) live.followUp(text);
      else followUps.push(text);
    },
    pending: () =>
      live?.pending() ?? { steering: [...steering], followUps: [...followUps] },
    clearQueue: () => {
      // Emptied as it is read: the interrupt path hands this text back to the
      // editor, and a second read must not hand it over twice.
      const taken = [...steering.splice(0), ...followUps.splice(0)];
      return [...taken, ...(live?.clearQueue() ?? [])];
    },
  };

  return {
    input,
    adopt: (run) => {
      if (!run?.input) return;
      live = run.input;
      for (const text of steering.splice(0)) live.steer(text);
      for (const text of followUps.splice(0)) live.followUp(text);
    },
  };
}
