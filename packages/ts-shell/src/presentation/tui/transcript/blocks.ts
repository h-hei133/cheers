import { defaultTheme } from "../../theme/theme.js";
import { wrapToWidth } from "../text/layout.js";
import { visibleWidth } from "../text/measure.js";
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

export type BlockKind = "notice" | "user" | "assistant" | "tool" | "command" | "error";

export type ToolStatus = "running" | "ok" | "failed";

export interface Block {
  readonly kind: BlockKind;
  /** Tool or command name; unused by prose blocks. */
  title?: string;
  text: string;
  /** Unified diff rendered below the body, for edit-shaped tools. */
  diff?: string;
  status?: ToolStatus;
  /** False while the block may still change, which blocks retirement. */
  finalized: boolean;
  /**
   * Self-rendering override, for blocks whose presentation depends on the frame
   * width in a way plain re-wrapping cannot reproduce — an elided path, say.
   * Called with the current width on every reflow.
   */
  rows?: (width: number) => readonly string[];
}

const GUTTER = "  ";
const BODY_INDENT = "    ";

const STATUS_GLYPH: Record<ToolStatus, string> = { running: "◐", ok: "✔", failed: "✗" };

/** Rows for one block at `width`, including its trailing separator row. */
export function renderBlock(block: Block, width: number): readonly string[] {
  if (block.rows) return [...block.rows(width), ""];
  switch (block.kind) {
    case "user":
      return renderUser(block, width);
    case "tool":
      return renderTool(block, width);
    case "command":
      return renderLabelled(block, defaultTheme.fg("accent", "⌘"), width);
    case "error":
      return renderLabelled(block, defaultTheme.fg("error", "!"), width);
    case "notice":
      return [...prose(block.text, width, ""), ""];
    default:
      return [...renderAssistant(block, width), ""];
  }
}

/**
 * The prompt echo, marked by an accent rail rather than a full-width shade.
 *
 * A shade has to pad every row out to the frame width, and that padding is what
 * a terminal hands over when the user drags across several rows — the pasted
 * text comes back separated by runs of spaces. The rail reads just as clearly and
 * emits no trailing cells at all.
 */
function renderUser(block: Block, width: number): readonly string[] {
  const rail = defaultTheme.fg("accent", "▌");
  const rows: string[] = [];
  const bodyWidth = Math.max(1, width - 4);
  const wrapped = block.text.split("\n").flatMap((line) => wrapToWidth(line, bodyWidth));
  for (const line of wrapped) {
    rows.push(`${GUTTER}${rail} \x1b[97m${line}\x1b[39m`);
  }
  rows.push("");
  return rows;
}

/** One tool invocation: status glyph, name, argument summary, then its output. */
function renderTool(block: Block, width: number): readonly string[] {
  const status = block.status ?? "running";
  const glyph = status === "ok" ? defaultTheme.fg("success", STATUS_GLYPH.ok)
    : status === "failed" ? defaultTheme.fg("error", STATUS_GLYPH.failed)
    : defaultTheme.fg("warning", STATUS_GLYPH.running);
  const header = `${GUTTER}${glyph} ${defaultTheme.bold(block.title ?? "tool")}`;
  const rows = [header];
  if (block.text) rows.push(...prose(block.text, width, BODY_INDENT));
  if (block.diff) rows.push(...renderDiff(block.diff, width - BODY_INDENT.length).map((row) => `${BODY_INDENT}${row}`));
  rows.push("");
  return rows;
}

/** A named non-tool block: slash command output, or a runtime error notice. */
function renderLabelled(block: Block, glyph: string, width: number): readonly string[] {
  const rows = [`${GUTTER}${glyph} ${defaultTheme.bold(block.title ?? "")}`];
  rows.push(...prose(block.text, width, BODY_INDENT));
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
