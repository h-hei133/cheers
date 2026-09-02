import type { Block } from "../../presentation/tui/transcript/blocks.js";
import type { Transcript } from "../../presentation/tui/transcript/container.js";

/**
 * The live cards for tool calls in flight.
 *
 * One card per call, opened when the call starts and closed when its result comes
 * back. Keyed by task id rather than by tool name, because the same tool can be
 * running twice at once and a result must land on the call that produced it — a
 * result for a call that was never opened is dropped rather than guessed at.
 */
export class ToolCards {
  private readonly cards = new Map<string, Block>();

  constructor(
    private readonly transcript: Transcript,
    private readonly onChange: () => void,
  ) {}

  /** Open a card for a call that just started. */
  start(toolName: string, taskId: string): void {
    this.cards.set(
      taskId,
      this.transcript.append({
        kind: "tool",
        title: toolName,
        text: "",
        status: "running",
        finalized: false,
      }),
    );
    this.onChange();
  }

  /** Add a line to an open card — an approval pause, a progress note. */
  note(taskId: string, note: string): void {
    const block = this.cards.get(taskId);
    if (!block) return;
    block.text = block.text ? `${block.text}\n${note}` : note;
    this.onChange();
  }

  /** Close a card with its outcome. */
  finish(taskId: string, success: boolean, failureReason?: string): void {
    const block = this.cards.get(taskId);
    if (!block) return;
    block.status = success ? "ok" : "failed";
    if (!success && failureReason) block.text = failureReason;
    block.finalized = true;
    this.cards.delete(taskId);
    this.onChange();
  }

  /** Forget every open card; the turn is over or the transcript is gone. */
  clear(): void {
    this.cards.clear();
  }
}
