import { defaultTheme } from "../../theme/theme.js";
import { formatCommandLine, formatToolDetail } from "../../theme/commandHighlight.js";
import { padToWidth, wrapToWidth } from "../text/layout.js";
import { visibleWidth } from "../text/measure.js";
import type { ImageContent } from "../../../model-adapters/multimodal.js";
import { imageIdForData, inlineImageSequence, type ImageProtocol } from "../image.js";
import { renderDiff } from "./diff.js";
import { renderMarkdown, trimPartialFence } from "./markdown.js";

/**
 * Transcript block model.
 *
 * A block is one semantic unit of the conversation — a prompt, an assistant
 * answer, one tool invocation, one command's output. Blocks are the granularity
 * at which the transcript retires content into the terminal's scrollback, so a
 * block must be renderable from its own state alone and must render identically
 * every time once finalized.
 */

export type BlockKind = "notice" | "user" | "assistant" | "thinking" | "tool" | "command" | "error";

export type ToolStatus = "running" | "ok" | "failed";

export interface Block {
  readonly kind: BlockKind;
  /** Tool or command name; unused by prose blocks. */
  title?: string;
  /**
   * One line saying what this call is actually doing — the command for a shell
   * call, the path for a read, the pattern for a search. A card that shows only
   * the tool's name says that something happened, not what.
   */
  detail?: string;
  text: string;
  /** Unified diff rendered below the body, for edit-shaped tools. */
  diff?: string;
  status?: ToolStatus;
  /** False while the block may still change, which blocks retirement. */
  finalized: boolean;
  /**
   * Collapsed blocks show one summary row instead of their body. Reasoning is
   * collapsed by default: it is how the answer was reached, not the answer.
   */
  collapsed?: boolean;
  /** Milliseconds the block's work took, when that is a fact worth showing. */
  elapsedMs?: number;
  /**
   * Images attached to the message the block echoes. Rendered inline when the
   * terminal speaks a graphics protocol, named in text when it does not — the
   * placeholder token alone says a picture travelled, not what it is.
   */
  readonly images?: readonly ImageContent[];
  /**
   * Self-rendering override, for blocks whose presentation depends on the frame
   * width in a way plain re-wrapping cannot reproduce — an elided path, say.
   * Called with the current width on every reflow.
   */
  rows?: (width: number) => readonly string[];
}

/**
 * What the renderer needs to know about the terminal drawing its rows.
 *
 * Carried per render call rather than read from the environment inside, so a
 * caller (and every test) can state what the terminal said once, and a change
 * of terminal mid-session re-renders rather than half-remembers.
 */
export interface BlockRenderOptions {
  /** Inline-image protocol the terminal speaks, or nothing. */
  readonly imageProtocol?: ImageProtocol;
}

/**
 * Nothing is indented.
 *
 * Indentation is real cells, and cells are what a copy takes: two leading spaces on
 * every row is two spaces in front of every pasted line. Structure is carried by
 * the markers instead — a rail, a glyph, a status character — which sit *in* the
 * first column rather than pushing the text out of it.
 */
const GUTTER = "";
const BODY_INDENT = "";

const STATUS_GLYPH: Record<ToolStatus, string> = { running: "◐", ok: "✔", failed: "✗" };

/** Rows for one block at `width`, including its trailing separator row. */
export function renderBlock(
  block: Block,
  width: number,
  options: BlockRenderOptions = {},
): readonly string[] {
  if (block.rows) return [...block.rows(width), ""];
  switch (block.kind) {
    case "user":
      return renderUser(block, width, options);
    case "thinking":
      return renderThinking(block, width);
    case "tool":
      return renderTool(block, width);
    case "command":
      return renderLabelled(block, defaultTheme.fg("accent", "⌘"), width);
    case "error":
      return renderLabelled(block, defaultTheme.fg("error", "!"), width);
    case "notice":
      // Indented like every other block, and indented by the renderer rather than
      // by whoever wrote the text — a caller that prefixes its own spaces loses
      // them the moment the line wraps.
      return [...prose(block.text, width, GUTTER), ""];
    default:
      return [...renderAssistant(block, width), ""];
  }
}

/**
 * The prompt echo as a full-width bubble, the way a reader tells the turn
 * apart at a glance.
 *
 * The text is padded out to the frame width and the whole row painted with the
 * user-message background — text plus padding, one continuous board. Interior
 * attribute resets re-open the background so the board never gaps (the reset
 * inside a highlight would otherwise punch a hole in it). Copies are safe:
 * the drag-to-copy path trims trailing cells before rebuilding text, so the
 * padding never reaches the clipboard.
 */
function renderUser(block: Block, width: number, options: BlockRenderOptions = {}): readonly string[] {
  const rail = defaultTheme.fg("accent", "▌");
  const bg = defaultTheme.bgOpen("userMessageBg");
  const bodyWidth = Math.max(1, width - 4);
  const wrapped = block.text.split("\n").flatMap((line) => wrapToWidth(line, bodyWidth));
  const rows = wrapped.map((line) => {
    const padded = padToWidth(`${GUTTER}${rail} ${defaultTheme.fg("userMessageText", line)}`, width);
    return `${bg}${padded.replaceAll("\x1b[0m", `\x1b[0m${bg}`)}\x1b[0m`;
  });
  // Images drawn inline ride on their own rows, after the words: the protocol
  // sequence occupies zero cells, so the bubble's styling wraps around it
  // without shifting a single column, and the wrap leaves the sequence whole.
  for (const image of block.images ?? []) {
    if (options.imageProtocol) {
      const sequence = inlineImageSequence(options.imageProtocol, image.data, {
        columns: Math.max(4, Math.min(bodyWidth, 48)),
        imageId: imageIdForData(image.data),
      });
      const padded = padToWidth(`${GUTTER}${rail} `, width);
      rows.push(`${bg}${padded}${sequence}\x1b[0m`);
    } else {
      const label = `${image.mimeType}, ${Math.round((image.data.length * 3) / 4 / 1024)} KB`;
      const padded = padToWidth(`${GUTTER}${rail} ${defaultTheme.fg("userMessageText", `image attachment: ${label}`)}`, width);
      rows.push(`${bg}${padded.replaceAll("\x1b[0m", `\x1b[0m${bg}`)}\x1b[0m`);
    }
  }
  rows.push("");
  return rows;
}

/**
 * What the model worked through, collapsed to one row by default.
 *
 * A reasoning model's working can be longer than its answer, so showing it in full
 * would bury what was asked for; hiding it entirely makes a turn that produced only
 * reasoning look like a turn that produced nothing. One row says it happened and
 * how long it took, and expanding shows it.
 */
function renderThinking(block: Block, width: number): readonly string[] {
  const seconds = block.elapsedMs ? ` ${(block.elapsedMs / 1000).toFixed(1)}s` : "";
  const head = `${GUTTER}${defaultTheme.dim(`● thought${seconds}`)}`;
  if (block.collapsed !== false) {
    return [`${head} ${defaultTheme.dim("· click to expand")}`, ""];
  }
  const bodyWidth = Math.max(8, width - visibleWidth(BODY_INDENT));
  const rows = [head, ""];
  // The reasoning text has its own token rather than borrowing the muted one.
  // Reasoning is a distinct kind of content — it is the model's working, not
  // commentary about it — and a theme author who wants to pull it back or push
  // it forward has nowhere to say so if it shares a colour with the hints.
  for (const row of wrapAll(block.text, bodyWidth)) {
    rows.push(`${BODY_INDENT}${defaultTheme.fg("thinkingText", row)}`);
  }
  rows.push("");
  return rows;
}

/** Every line of `text`, soft-wrapped to `width`. */
function wrapAll(text: string, width: number): string[] {
  const rows: string[] = [];
  for (const line of text.replace(/\s+$/, "").split("\n")) {
    for (const wrapped of wrapToWidth(line, width)) rows.push(wrapped);
  }
  return rows;
}

/**
 * One tool invocation: status, name, what it was asked to do, and its output.
 *
 * The output is folded away by default and the header says how much is behind it.
 * A tool that printed six hundred lines of test output would otherwise push the
 * answer off the screen, and a card showing nothing at all cannot be checked
 * against what the model claimed the tool said.
 */
function renderTool(block: Block, width: number): readonly string[] {
  const status = block.status ?? "running";
  const glyph = status === "ok" ? defaultTheme.fg("success", STATUS_GLYPH.ok)
    : status === "failed" ? defaultTheme.fg("error", STATUS_GLYPH.failed)
    : defaultTheme.fg("warning", STATUS_GLYPH.running);
  const name = defaultTheme.bold(defaultTheme.fg("toolTitle", block.title ?? "tool"));
  const rawDetail = block.detail ? elide(block.detail, headroom(width, block.title)) : "";
  const detail = rawDetail ? ` ${formatToolDetail(block.title, rawDetail)}` : "";
  const body = block.text.replace(/\s+$/, "");

  // Folded only once the call is over. While it is running the body holds status notes.
  if (block.collapsed === true) {
    const rows = [`${GUTTER}${glyph} ${name}${detail}`];
    if (block.diff) {
      rows.push(...renderDiff(block.diff, width - BODY_INDENT.length).map((row) => `${BODY_INDENT}${row}`));
    } else if (body) {
      const lines = body.split("\n").length;
      rows.push(`${GUTTER}${defaultTheme.dim(`  ↳ ${lines} ${lines === 1 ? "line" : "lines"} · click to expand`)}`);
    }
    rows.push("");
    return rows;
  }

  // Expanded: framed command box with dark border and distinct divider
  const inner = Math.max(16, width - 2);
  const headTitle = ` ${glyph} ${name} `;
  const fill = Math.max(0, inner - visibleWidth(headTitle));
  const topBar = defaultTheme.fg("border", "╭") + headTitle + defaultTheme.fg("border", `${"─".repeat(fill)}╮`);
  const rows: string[] = [topBar];

  if (block.detail) {
    const formattedCmd = block.title === "bash" ? formatCommandLine(block.detail) : defaultTheme.fg("filename", block.detail);
    for (const wrapped of wrapToWidth(formattedCmd, inner - 2)) {
      rows.push(`${defaultTheme.fg("border", "│")} ${padToWidth(wrapped, inner - 2)} ${defaultTheme.fg("border", "│")}`);
    }
  }

  if (body) {
    const divLabel = " Output ";
    const divFill = Math.max(0, inner - visibleWidth(divLabel));
    rows.push(defaultTheme.fg("borderAccent", `├${divLabel}${"─".repeat(divFill)}┤`));
    for (const line of body.split("\n")) {
      for (const wrapped of wrapToWidth(line, inner - 2)) {
        rows.push(`${defaultTheme.fg("border", "│")} ${padToWidth(defaultTheme.fg("toolOutput", wrapped), inner - 2)} ${defaultTheme.fg("border", "│")}`);
      }
    }
  }

  if (block.diff) {
    const diffLabel = " Changes ";
    const diffFill = Math.max(0, inner - visibleWidth(diffLabel));
    rows.push(defaultTheme.fg("borderAccent", `├${diffLabel}${"─".repeat(diffFill)}┤`));
    for (const diffRow of renderDiff(block.diff, inner - 2)) {
      rows.push(`${defaultTheme.fg("border", "│")} ${padToWidth(diffRow, inner - 2)} ${defaultTheme.fg("border", "│")}`);
    }
  }

  rows.push(defaultTheme.fg("border", `╰${"─".repeat(inner)}╯`));
  rows.push("");
  return rows;
}
/** Cells left on the header row for the detail, after the status and the name. */
function headroom(width: number, title: string | undefined): number {
  return Math.max(8, width - (title?.length ?? 4) - 4);
}

/** `text` shortened from the middle, which is where a long path or command repeats. */
function elide(text: string, limit: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat;
  if (limit <= 3) return flat.slice(0, limit);
  const head = Math.ceil((limit - 1) / 2);
  return `${flat.slice(0, head)}…${flat.slice(flat.length - (limit - 1 - head))}`;
}

/**
 * A named non-tool block: slash command output, or a runtime error notice.
 *
 * Command output is Markdown — the runtimes emit headings, tables, and fenced
 * blocks — so it is rendered as Markdown rather than dumped as prose. That is the
 * difference between a wall of text with literal `##` in it and something a
 * reader can scan.
 */
function renderLabelled(block: Block, glyph: string, width: number): readonly string[] {
  const rows = [`${GUTTER}${glyph} ${defaultTheme.bold(block.title ?? "")}`];
  const bodyWidth = Math.max(8, width - visibleWidth(BODY_INDENT));
  for (const row of renderMarkdown(block.text.replace(/\s+$/, ""), bodyWidth)) {
    rows.push(`${BODY_INDENT}${row}`);
  }
  if (block.diff) {
    rows.push(...renderDiff(block.diff, bodyWidth).map((row) => `${BODY_INDENT}${row}`));
  }
  rows.push("");
  return rows;
}

/**
 * Assistant prose, rendered as Markdown. A block that can still change has its
 * trailing partial fence dropped, so a fence marker arriving one character at a
 * time does not make the block flicker between styled and unstyled.
 */
function renderAssistant(block: Block, width: number): readonly string[] {
  const source = block.finalized ? block.text : trimPartialFence(block.text);
  if (!source.trim()) return [];
  const bodyWidth = Math.max(8, width - visibleWidth(GUTTER));
  return renderMarkdown(source.replace(/\s+$/, ""), bodyWidth).map((row) => `${GUTTER}${row}`);
}

/** Body text wrapped to the remaining width behind `indent`. */
function prose(text: string, width: number, indent: string): string[] {
  if (!text) return [];
  const bodyWidth = Math.max(1, width - visibleWidth(indent));
  const rows: string[] = [];
  for (const line of text.replace(/\s+$/, "").split("\n")) {
    for (const wrapped of wrapToWidth(line, bodyWidth)) rows.push(`${indent}${wrapped}`);
  }
  return rows;
}

/** A finalized block carrying plain text. */
export function textBlock(kind: BlockKind, text: string, title?: string): Block {
  return { kind, text, title, finalized: true };
}

const DIFF_FENCE = /```diff\n([\s\S]*?)```/;

/**
 * Move a fenced diff out of a block's prose and into its diff field.
 *
 * Commands that report changes already produce unified diffs; leaving them
 * fenced renders them as a generic code block, losing the per-line colouring and
 * the intra-line emphasis that make a diff readable at a glance.
 */
/**
 * Move a fenced diff out of the prose and into the diff field.
 *
 * The caller supplies the transcript's own setters when the block is in one,
 * so the cached rows the change invalidates are dropped; a block outside a
 * transcript has no cache to forget.
 */
export function splitFencedDiff(
  block: Block,
  transcript?: { setDiff(block: Block, diff: string): void; setText(block: Block, text: string): void },
): void {
  if (block.diff) return;
  const match = DIFF_FENCE.exec(block.text);
  if (!match) return;
  const diff = match[1]!.replace(/\s+$/, "");
  const text = block.text.replace(match[0], "").replace(/\n{3,}/g, "\n\n").trim();
  if (transcript) {
    transcript.setDiff(block, diff);
    transcript.setText(block, text);
  } else {
    block.diff = diff;
    block.text = text;
  }
}
