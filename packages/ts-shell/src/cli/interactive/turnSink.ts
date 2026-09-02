import { recordLastAssistantResponse } from "../../core/commands/copyCommandRuntime.js";
import type { QueryEvent } from "../../core/query/runtime/events.js";
import type { RendererSink } from "../../renderer/StreamingRenderer.js";
import type { Block } from "../../presentation/tui/transcript/blocks.js";
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
  private prose: Block | undefined;
  private readonly tools = new Map<string, Block>();
  private proseKind: "command" | "error" = "command";
  private proseTitle = "";

  constructor(transcript: Transcript, onChange: () => void, now: () => number = Date.now) {
    this.transcript = transcript;
    this.onChange = onChange;
    this.now = now;
  }

  /** Open a block that collects prose for one submitted input. */
  begin(kind: "command" | "turn", title: string): void {
    this.prose = undefined;
    this.assistant = undefined;
    this.tools.clear();
    this.streamedChars = 0;
    this.cancelling = false;
    this.label = kind === "turn" ? "working" : title;
    this.turnStartedAt = this.now();
    this.running = true;
    this.proseKind = kind === "turn" ? "error" : "command";
    this.proseTitle = title;
    this.onChange();
  }

  /** Close the turn: everything still live becomes retirable. */
  end(): void {
    this.running = false;
    this.cancelling = false;
    this.transcript.finalizeAll();
    this.assistant = undefined;
    this.prose = undefined;
    this.tools.clear();
    this.onChange();
  }

  /** Mark cancellation requested so the activity row stops implying progress. */
  markCancelling(): void {
    if (!this.running) return;
    this.cancelling = true;
    this.onChange();
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
      case "tool.started":
        this.startTool(event.toolName, event.taskId);
        return;
      case "approval.requested":
        this.noteTool(event.taskId, "awaiting approval");
        return;
      case "approval.resolved":
        this.noteTool(event.taskId, `approval ${event.outcome}`);
        return;
      case "tool.result":
        this.finishTool(event.taskId, event.success, event.failureReason);
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
    if (!this.assistant) return;
    this.assistant.finalized = true;
    // `/copy` with no argument copies the last answer; without this it had
    // nothing recorded to copy.
    recordLastAssistantResponse(this.assistant.text);
    this.assistant = undefined;
  }

  private startTool(toolName: string, taskId: string): void {
    this.finalizeAssistant();
    this.prose = undefined;
    this.label = toolName;
    this.tools.set(
      taskId,
      this.transcript.append({ kind: "tool", title: toolName, text: "", status: "running", finalized: false }),
    );
    this.onChange();
  }

  private noteTool(taskId: string, note: string): void {
    const block = this.tools.get(taskId);
    if (!block) return;
    block.text = block.text ? `${block.text}\n${note}` : note;
    this.onChange();
  }

  private finishTool(taskId: string, success: boolean, failureReason?: string): void {
    const block = this.tools.get(taskId);
    if (!block) return;
    block.status = success ? "ok" : "failed";
    if (!success && failureReason) block.text = failureReason;
    block.finalized = true;
    this.tools.delete(taskId);
    this.label = "working";
    this.onChange();
  }

  private recordFailure(event: Extract<QueryEvent, { type: "lifecycle.cancelled" | "lifecycle.error" | "query.failed" }>): void {
    this.finalizeAssistant();
    const cancelled = event.type === "lifecycle.cancelled";
    this.transcript.append({
      kind: cancelled ? "notice" : "error",
      title: cancelled ? "" : "error",
      text: cancelled ? "  Interrupted before completion." : event.error,
      finalized: true,
    });
    this.onChange();
  }
}
