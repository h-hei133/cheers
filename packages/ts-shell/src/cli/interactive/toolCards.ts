import { splitFencedDiff, type Block } from "../../presentation/tui/transcript/blocks.js";
import type { Transcript } from "../../presentation/tui/transcript/container.js";

/**
 * The live cards for tool calls in flight.
 *
 * One card per call, opened when the call starts and closed when its result comes
 * back. Keyed by task id rather than by tool name, because the same tool can be
 * running twice at once and a result must land on the call that produced it — a
 * result for a call that was never opened is dropped rather than guessed at.
 */
/** How many lines of live output a running card keeps on screen. */
const LIVE_OUTPUT_LINES = 40;

export class ToolCards {
  private readonly cards = new Map<string, Block>();

  constructor(
    private readonly transcript: Transcript,
    private readonly onChange: () => void,
  ) {}

  /** Open a card for a call that just started. */
  start(toolName: string, taskId: string, args?: Readonly<Record<string, unknown>>): void {
    const detail = summarize(toolName, args);
    this.cards.set(
      taskId,
      this.transcript.append({
        kind: "tool",
        title: toolName,
        ...(detail ? { detail } : {}),
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

  /**
   * Append output a running call has produced, and repaint.
   *
   * Kept in the card's body while the call is still open, so a long command shows
   * something as it goes rather than only once it is over. The final result
   * replaces nothing: `finish` appends what it has, and the body is already
   * carrying the same text.
   */
  append(taskId: string, chunk: string): void {
    const block = this.cards.get(taskId);
    if (!block) return;
    const text = chunk.replace(/\s+$/, "");
    if (!text) return;
    block.text = block.text ? `${block.text}\n${text}` : text;
    // A card the user opened to watch should keep showing the latest output, not
    // grow past the view. The body is clipped here rather than at finish, because
    // while running there is no "full output" to point at yet.
    const lines = block.text.split("\n");
    if (lines.length > LIVE_OUTPUT_LINES) {
      block.text = lines.slice(-LIVE_OUTPUT_LINES).join("\n");
    }
    this.onChange();
  }

  /**
   * Mark a card as no longer running, without closing it.
   *
   * The call has stopped, but what it printed arrives separately on its result
   * message. Closing here would lose the output; leaving the status running would
   * keep a finished call looking busy for as long as the rest of its batch takes.
   */
  settle(taskId: string, success: boolean): void {
    const block = this.cards.get(taskId);
    if (!block) return;
    block.status = success ? "ok" : "failed";
    this.onChange();
  }

  /**
   * Close a card with its outcome and what the tool printed.
   *
   * The output is kept on the card and folded away rather than dropped: a card
   * that shows only a tick cannot be checked against what the model said the tool
   * returned, and a card that shows everything buries the answer. A failed call
   * opens by default — its output is the reason it failed.
   */
  finish(taskId: string, success: boolean, failureReason?: string, output?: string): void {
    const block = this.cards.get(taskId);
    if (!block) return;
    block.status = success ? "ok" : "failed";
    const body = (output ?? (success ? "" : failureReason ?? "")).replace(/\s+$/, "");
    if (body) {
      block.text = block.text ? `${block.text}\n${body}` : body;
      splitFencedDiff(block);
      block.collapsed = success;
    }
    block.finalized = true;
    this.cards.delete(taskId);
    this.onChange();
  }

  /** Forget every open card; the turn is over or the transcript is gone. */
  clear(): void {
    this.cards.clear();
  }
}

/**
 * What a call is doing, in one line.
 *
 * The tool's name says a shell command ran; it does not say which one. The
 * argument that carries the intent differs per tool, so each is named — and
 * anything unrecognised falls back to the first short string argument rather than
 * to nothing, so a new tool is legible before this list learns about it.
 */
export function summarize(toolName: string, args?: Readonly<Record<string, unknown>>): string | undefined {
  if (!args) return undefined;
  const primary = named(toolName, args) ?? firstString(args);
  return primary ? `${primary}${detailSuffix(toolName, args)}` : undefined;
}

/** The argument this tool carries its intent in, if it sent one. */
function named(toolName: string, args: Readonly<Record<string, unknown>>): string | undefined {
  for (const key of KEYS_BY_TOOL[toolName] ?? []) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

/** The argument that carries the intent, per tool, most telling first. */
const KEYS_BY_TOOL: Readonly<Record<string, readonly string[]>> = {
  bash: ["command"],
  read: ["path", "file_path", "filePath"],
  write: ["path", "file_path", "filePath"],
  edit: ["path", "file_path", "filePath"],
  glob: ["pattern", "globPattern"],
  grep: ["pattern", "query"],
  web_fetch: ["url"],
  web_search: ["query"],
  browser: ["url", "goal"],
  task: ["prompt", "description"],
  todo: ["action"],
  lsp: ["operation", "path"],
  ask: ["question"],
};

/** Extra context worth appending, for tools whose primary argument is not enough. */
function detailSuffix(toolName: string, args: Readonly<Record<string, unknown>>): string {
  if (toolName !== "grep") return "";
  const where = args.path ?? args.glob;
  return typeof where === "string" && where.trim() ? ` in ${where.trim()}` : "";
}

/** The first short string argument, as a last resort. */
function firstString(args: Readonly<Record<string, unknown>>): string | undefined {
  for (const value of Object.values(args)) {
    if (typeof value === "string" && value.trim() && value.length <= 400) return value.trim();
  }
  return undefined;
}
