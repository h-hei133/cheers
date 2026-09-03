import { recordLastAssistantResponse } from "../../core/commands/copyCommandRuntime.js";
import type { QueryEvent } from "../../core/query/runtime/events.js";
import type { RendererSink } from "../../renderer/StreamingRenderer.js";
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

/** Rough tokens per character, used only for the in-flight estimate. */
const CHARS_PER_TOKEN = 4;

export class TurnSink implements RendererSink {
  private readonly transcript: Transcript;
  private readonly onChange: () => void;
  private readonly now: () => number;

  private turnStartedAt = 0;
  private running = false;
  private cancelling = false;
  private label = "working";
  private streamedChars = 0;
  private assistant: Block | undefined;
  private thinking: Block | undefined;
  private thinkingStartedAt = 0;
  private prose: Block | undefined;
  private readonly tools: ToolCards;
  private proseKind: "command" | "error" = "command";
  private proseTitle = "";
  private failed = false;

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
    this.streamedChars = 0;
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
    this.cancelling = false;
    if (discard) this.failed = false;
    else this.transcript.finalizeAll();
    this.assistant = undefined;
    this.thinking = undefined;
    this.prose = undefined;
    this.tools.clear();
    this.streamedChars = 0;
    if (!discard) this.onChange();
  }

  /**
   * Record a short fact that belongs in the transcript but is not turn output —
   * a clipboard write, say. Finalized immediately, so it retires with the rest.
   */
  notify(text: string): void {
    this.transcript.append({ kind: "notice", text, finalized: true });
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
    return {
      startedAt: this.turnStartedAt,
      label: this.label,
      tokens: Math.floor(this.streamedChars / CHARS_PER_TOKEN),
      cancelling: this.cancelling,
      estimated: true,
    };
  }

  line(text: string): void {
    const trimmed = text.replace(/\s+$/, "");
    if (!trimmed) return;
    const block = this.prose ?? this.openProse();
    block.text = block.text ? `${block.text}\n${trimmed}` : trimmed;
    splitFencedDiff(block);
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
    this.streamedChars += text.length;
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
    this.assistant = this.transcript.append({ kind: "assistant", text: "", finalized: false });
    return this.assistant;
  }

  private finalizeAssistant(): void {
    // Whatever the model was working through is settled once it starts answering.
    if (this.thinking) {
      this.thinking.finalized = true;
      this.thinking = undefined;
      this.label = "working";
    }
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
    this.tools.finish(taskId, success, failureReason, output);
    this.label = "working";
    this.onChange();
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
