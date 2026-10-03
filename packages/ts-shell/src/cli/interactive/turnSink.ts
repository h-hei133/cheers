import { recordLastAssistantResponse } from "../../core/commands/copyCommandRuntime.js";
import type { QueryEvent } from "../../core/query/runtime/events.js";
import type { RendererSink } from "../../presentation/terminal/streaming.js";
import { splitFencedDiff, type Block } from "../../presentation/tui/transcript/blocks.js";
import { ToolCards } from "./toolCards.js";
import type { Transcript } from "../../presentation/tui/transcript/container.js";
import type { TurnActivity } from "../../presentation/tui/transcript/live.js";

/**
 * Turn output router.
 *
 * Two channels arrive while a turn runs: structured query events, and prose the
 * runtime writes for anything the event stream does not model (slash command
 * output, blocked/interrupted/error notices). This router turns both into
 * transcript blocks and maintains the live activity row, and is the only place
 * that decides which channel owns which content — so nothing is shown twice.
 */

/**
 * How often a running tool's output repaints.
 *
 * Fast enough to look live, slow enough that a command emitting thousands of
 * chunks a second cannot spend the frame budget on redraws.
 */
const OUTPUT_FLUSH_MS = 100;

export class TurnSink implements RendererSink {
  private readonly transcript: Transcript;
  private readonly onChange: () => void;
  private readonly now: () => number;

  private turnStartedAt = 0;
  private running = false;
  private cancelling = false;
  private label = "working";
  private assistant: Block | undefined;
  private thinking: Block | undefined;
  private thinkingStartedAt = 0;
  private prose: Block | undefined;
  private readonly tools: ToolCards;
  private outputBuffer = new Map<string, string>();
  private outputFlushAt = 0;
  private proseKind: "command" | "error" = "command";
  private proseTitle = "";
  private failed = false;
  private lastNotice: { block: Block; tag?: string; timestamp: number } | undefined;
  constructor(transcript: Transcript, onChange: () => void, now: () => number = Date.now) {
    this.transcript = transcript;
    this.onChange = onChange;
    this.now = now;
    this.tools = new ToolCards(transcript, onChange);
  }

  /** Open a block that collects prose for one submitted input. */
  begin(kind: "command" | "turn", title: string): void {
    this.prose = undefined;
    this.assistant = undefined;
    this.thinking = undefined;
    this.tools.clear();
    this.cancelling = false;
    this.failed = false;
    this.label = kind === "turn" ? "working" : title;
    this.turnStartedAt = this.now();
    this.running = true;
    this.proseKind = kind === "turn" ? "error" : "command";
    this.proseTitle = title;
    this.onChange();
  }

  /**
   * The prompt a retry should run, or nothing with a note saying why not.
   *
   * A retry that re-ran a turn which had in fact succeeded would duplicate work
   * and spend tokens, so the failure is a precondition rather than an assumption.
   * `previousFailed` is passed in because starting this turn already cleared the
   * flag for the turn that is now running.
   */
  retryTarget(lastPrompt: string | undefined, previousFailed: boolean): string | undefined {
    if (lastPrompt === undefined) {
      this.notify("Nothing to retry — nothing has been asked yet.");
      return undefined;
    }
    if (!previousFailed) {
      this.notify("Nothing to retry — the last answer came back fine. Rephrase and ask again to try a different approach.");
      return undefined;
    }
    this.transcript.append({ kind: "user", text: lastPrompt, finalized: true });
    return lastPrompt;
  }

  /**
   * Close the turn: everything still live becomes retirable.
   *
   * `discard` is for when the transcript itself is being thrown away — there is
   * nothing to finalize, and the failure flag goes with it.
   */
  end(discard = false): void {
    this.running = false;
    // An interrupted turn ends without a terminal event of its own, so the
    // interruption is recorded here — once, and only if nothing else already
    // explained why the turn stopped.
    if (this.cancelling && !this.failed && !discard) {
      this.failed = true;
      this.finalizeAssistant();
      this.transcript.append({ kind: "notice", text: "Interrupted before completion.", finalized: true });
    }
    this.cancelling = false;
    if (discard) this.failed = false;
    else this.transcript.finalizeAll();
    this.assistant = undefined;
    this.thinking = undefined;
    this.prose = undefined;
    this.tools.clear();
    if (!discard) this.onChange();
  }

  /**
   * Record a short fact that belongs in the transcript but is not turn output —
   * a clipboard write, say. Finalized immediately, so it retires with the rest.
   */
  notify(text: string, tag?: string): void {
    const now = Date.now();
    if (tag && this.lastNotice?.tag === tag && now - this.lastNotice.timestamp < 10_000) {
      // The notice block is finalized, so its rows are cached; the write goes
      // through the transcript so the cache follows the change.
      this.transcript.setText(this.lastNotice.block, text);
      this.lastNotice.timestamp = now;
      this.onChange();
      return;
    }
    const block: Block = { kind: "notice", text, finalized: true };
    this.transcript.append(block);
    this.lastNotice = { block, tag, timestamp: now };
    this.onChange();
  }

  /** Mark cancellation requested so the activity row stops implying progress. */
  markCancelling(): void {
    if (!this.running) return;
    this.cancelling = true;
    this.onChange();
  }

  /**
   * Whether the last turn ended without finishing — failed, errored, or
   * interrupted. What `/retry` and its key ask before offering to run it again.
   */
  get lastTurnFailed(): boolean {
    return this.failed;
  }

  /**
   * This turn's command output, when the turn was a command rather than an
   * exchange. Long output is moved out of the transcript by the caller.
   */
  get commandOutput(): { readonly title: string; readonly block: Block } | undefined {
    if (this.proseKind !== "command" || !this.prose) return undefined;
    return { title: this.proseTitle || "output", block: this.prose };
  }

  /** The live activity row state, or undefined when idle. */
  activity(): TurnActivity | undefined {
    if (!this.running) return undefined;
    // No token figure while streaming: a count that ticks up with every
    // character is a guess dressed as a measurement. The band shows the
    // provider's own numbers once the request has been accounted for.
    return {
      startedAt: this.turnStartedAt,
      label: this.label,
      tokens: 0,
      cancelling: this.cancelling,
    };
  }

  line(text: string): void {
    const trimmed = text.replace(/\s+$/, "");
    if (!trimmed) return;
    const block = this.prose ?? this.openProse();
    block.text = block.text ? `${block.text}\n${trimmed}` : trimmed;
    // Through the transcript, like the tool-card path: the split moves text out
    // of the body and into a diff, and a block whose rows are already cached
    // would keep showing the body that no longer has the diff in it. Prose here
    // is open rather than finalized, so today the cache is not consulted — the
    // argument is what keeps that from being the thing this depends on.
    splitFencedDiff(block, this.transcript);
    this.onChange();
  }

  /**
   * Collect what the model is working through. Kept in its own collapsed block:
   * a turn that produced only reasoning should not look like a turn that produced
   * nothing, and reasoning that runs longer than the answer should not bury it.
   */
  think(text: string): void {
    if (!text) return;
    if (!this.thinking) {
      this.thinkingStartedAt = this.now();
      this.thinking = this.transcript.append({
        kind: "thinking",
        text: "",
        finalized: false,
        collapsed: true,
      });
      this.label = "thinking";
    }
    this.thinking.text += text;
    this.thinking.elapsedMs = this.now() - this.thinkingStartedAt;
    this.onChange();
  }

  chunk(text: string): void {
    if (!text) return;
    const block = this.assistant ?? this.openAssistant();
    block.text += text;
    this.onChange();
  }

  handleEvent(event: QueryEvent): void {
    switch (event.type) {
      case "message.delta":
        this.chunk(event.delta);
        return;
      case "message.replace":
        this.replaceAssistant(event.text);
        return;
      case "reasoning.delta":
        this.think(event.delta);
        return;
      case "tool.started":
        this.openTool(event.toolName, event.taskId, event.args);
        return;
      case "approval.requested":
        this.tools.note(event.taskId, "awaiting approval");
        return;
      case "approval.resolved":
        this.tools.note(event.taskId, `approval ${event.outcome}`);
        return;
      case "tool.output":
        this.bufferToolOutput(event.taskId, event.chunk);
        return;
      case "tool.settled":
        // The call stopped; its card stops looking busy now. Output follows on
        // tool.result, which is when the card is finally closed.
        this.tools.settle(event.taskId, event.success);
        return;
      case "tool.result":
        this.closeTool(event.taskId, event.success, event.failureReason, event.output);
        return;
      case "query.retrying":
        this.label = `retrying (attempt ${event.attempt})`;
        this.onChange();
        return;
      case "turn.started":
        this.label = event.role === "planner" ? "planning" : "working";
        this.onChange();
        return;
      case "query.completed":
        // A completed event can carry a refusal before any model message exists.
        // Keep stopped results visible and eligible for an explicit retry.
        if (event.result.status !== "completed" && !this.failed) {
          this.finalizeAssistant();
          this.failed = true;
          this.transcript.append({
            kind: event.result.terminalClassification === "error" ? "error" : "notice",
            title: event.result.terminalClassification === "error" ? "error" : "stopped",
            text: event.result.stopReason || event.result.status,
            finalized: true,
          });
          this.onChange();
        }
        return;
      case "lifecycle.cancelled":
      case "lifecycle.error":
      case "query.failed":
        this.recordFailure(event);
        return;
      default:
        return;
    }
  }

  private openProse(): Block {
    this.finalizeAssistant();
    this.prose = this.transcript.append({
      kind: this.proseKind,
      title: this.proseTitle,
      text: "",
      finalized: false,
    });
    return this.prose;
  }

  private openAssistant(): Block {
    this.prose = undefined;
    // The answer has started, so whatever the model was working through is done
    // being shown as live and the activity row goes back to the turn's own label.
    // Streamed text arrives through this path and never through `openProse`, so
    // skipping this here left the row reading "thinking" for the whole answer.
    this.settleThinking();
    this.assistant = this.transcript.append({ kind: "assistant", text: "", finalized: false });
    return this.assistant;
  }

  /**
   * Retire the live working block, if there is one.
   *
   * Both paths that begin the answer call this: prose written for a command, and
   * text streamed from the model. They used to disagree, and only one of them put
   * the label back.
   */
  private settleThinking(): void {
    if (!this.thinking) return;
    this.thinking.finalized = true;
    this.thinking = undefined;
    this.label = "working";
  }

  private finalizeAssistant(): void {
    // Whatever the model was working through is settled once it starts answering.
    this.settleThinking();
    if (!this.assistant) return;
    this.assistant.finalized = true;
    // `/copy` with no argument copies the last answer; without this it had
    // nothing recorded to copy.
    recordLastAssistantResponse(this.assistant.text);
    this.assistant = undefined;
  }

  /** Close a tool card and put the activity row back to the turn's own label. */
  private closeTool(
    taskId: string,
    success: boolean,
    failureReason?: string,
    output?: string,
  ): void {
    // Whatever has not been flushed belongs before the result, which carries the
    // whole output anyway; flushing first keeps the card's order honest.
    this.flushToolOutput();
    this.tools.finish(taskId, success, failureReason, output);
    this.label = "working";
    this.onChange();
  }

  /**
   * Collect a running tool's output, repainting at a fixed cadence.
   *
   * A command can emit thousands of small chunks a second. Repainting for each
   * one spends the frame budget on redraws nobody can read, and the screen ends
   * up further behind than the output. Everything is kept; only the repaint is
   * rate-limited, so nothing is lost by waiting.
   */
  private bufferToolOutput(taskId: string, chunk: string): void {
    this.outputBuffer.set(taskId, (this.outputBuffer.get(taskId) ?? "") + chunk);
    const now = this.now();
    if (now < this.outputFlushAt) return;
    this.outputFlushAt = now + OUTPUT_FLUSH_MS;
    this.flushToolOutput();
  }

  /** Move buffered output onto its cards, now. */
  private flushToolOutput(): void {
    if (this.outputBuffer.size === 0) return;
    const pending = [...this.outputBuffer.entries()];
    this.outputBuffer.clear();
    for (const [taskId, chunk] of pending) {
      this.tools.append(taskId, chunk);
    }
  }

  /** Open a tool card, closing out any prose the turn had been writing. */
  private openTool(
    toolName: string,
    taskId: string,
    args?: Readonly<Record<string, unknown>>,
  ): void {
    this.finalizeAssistant();
    this.prose = undefined;
    this.label = toolName;
    this.tools.start(toolName, taskId, args);
  }

  /**
   * Correct the streamed text in place.
   *
   * Sent when tool calls turned out to be embedded in the prose: the deltas were
   * honest as they arrived, and this is the same message without them. Rewriting
   * the block is right — appending would show the answer twice.
   */
  private replaceAssistant(text: string): void {
    const block = this.assistant ?? this.openAssistant();
    block.text = text;
    this.onChange();
  }

  private recordFailure(event: Extract<QueryEvent, { type: "lifecycle.cancelled" | "lifecycle.error" | "query.failed" }>): void {
    this.finalizeAssistant();
    this.failed = true;
    const cancelled = event.type === "lifecycle.cancelled";
    this.transcript.append({
      kind: cancelled ? "notice" : "error",
      title: cancelled ? "" : "error",
      text: cancelled ? "Interrupted before completion." : event.error,
      finalized: true,
    });
    this.onChange();
  }
}
