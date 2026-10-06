import type { CommandReport } from '../../../core/commands/report/contract.js';
import { renderReport } from '../report/renderer.js';
import { stripAnsi } from '../text/ansi.js';
import { defaultTheme } from "../../theme/theme.js";
import { padToWidth, truncateToWidth } from "../text/layout.js";
import { renderMarkdown } from "../transcript/markdown.js";

/**
 * A full-screen reader for output too long to belong in the transcript.
 *
 * A command that answers with forty rows pushes the conversation off the screen to
 * say something the user will read once. Putting that in its own view keeps the
 * conversation where it was and gives the output room to be read — scrolled,
 * searched, and then dismissed, leaving a single line behind.
 *
 * The alternate screen is borrowed for it, so the transcript underneath is
 * untouched and comes back exactly as it was.
 */

/** Rows past which output is worth a view of its own rather than the transcript. */
export const PAGER_THRESHOLD_ROWS = 18;

/**
 * Move a block's text into the pager when it is long enough to be worth a view of
 * its own, leaving a one-line summary in the transcript. Returns whether it moved.
 */
export function pageLongOutput(pager: Pager, title: string, block: PageableBlock, transcript?: { clearDiff(block: PageableBlock): void; setText(block: PageableBlock, text: string): void; setCollapsed?(block: PageableBlock, collapsed: boolean): void }): boolean {
  const lines = block.text.split("\n").length;
  if (lines < PAGER_THRESHOLD_ROWS) return false;
  pager.open(title, block.text, block.report);
  if (block.report) {
    if (transcript?.setCollapsed) transcript.setCollapsed(block, true);
    else block.collapsed = true;
    return true;
  }
  // Routed through the transcript's own setters when there is one, because the
  // block's cached rows are keyed by width and theme and do not know that its
  // text changed underneath them.
  if (transcript) {
    transcript.clearDiff(block);
    transcript.setText(block, `${lines} lines — shown in a full-screen view; esc closes it.`);
  } else {
    block.text = `${lines} lines — shown in a full-screen view; esc closes it.`;
    block.diff = undefined;
  }
  return true;
}

export interface PageableBlock {
  text: string;
  readonly report?: CommandReport;
  collapsed?: boolean;
  diff?: string;
}

export class Pager {
  private title = "";
  private rows: readonly string[] = [];
  private source = "";
  private top = 0;
  private width = 0;
  private revision = -1;
  private report: CommandReport | undefined;
  private filter = "";

  get active(): boolean {
    return this.rows.length > 0;
  }

  /** The text being shown, for a copy that should not include the chrome. */
  get text(): string {
    return this.source;
  }

  open(title: string, markdown: string, report?: CommandReport): void {
    this.report = report;
    this.title = title;
    this.source = markdown;
    this.filter = "";
    this.top = 0;
    this.width = 0;
    this.rows = [""];
  }

  close(): void {
    this.report = undefined;
    this.rows = [];
    this.source = "";
    this.filter = "";
  }

  /** Route one key. Returns false when the pager is closed and did not claim it. */
  handleKey(keyId: string, text: string | undefined, height: number): boolean {
    if (!this.active) return false;
    const page = Math.max(1, height - 3);
    switch (keyId) {
      case "escape":
      case "enter":
      case "q":
        // Enter dismisses as well as Escape. Typing filters, which means someone
        // who did not notice the view is up would otherwise see their next command
        // silently become a search term.
        this.close();
        return true;
      case "down":
      case "ctrl+n":
        this.scroll(1, page);
        return true;
      case "up":
      case "ctrl+p":
        this.scroll(-1, page);
        return true;
      case "pagedown":
      case "space":
        this.scroll(page, page);
        return true;
      case "pageup":
        this.scroll(-page, page);
        return true;
      case "home":
        this.top = 0;
        return true;
      case "end":
        this.top = Math.max(0, this.visible().length - page);
        return true;
      case "backspace":
        this.filter = this.filter.slice(0, -1);
        this.top = 0;
        return true;
      default:
        // Typing filters, which is what "search" means in a view this size: the
        // rows that do not match are simply not shown.
        if (text && text !== " ") {
          this.filter += text;
          this.top = 0;
        }
        return true;
    }
  }

  /** Rows for the whole screen. */
  render(width: number, height: number): string[] {
    const inner = Math.max(8, width);
    if (this.width !== inner || this.revision !== defaultTheme.colorRevision) {
      this.rows = this.report ? renderReport(this.report, inner - 4) : renderMarkdown(this.source, inner - 4);
      this.revision = defaultTheme.colorRevision;
      this.width = inner;
    }
    const body = this.visible();
    const page = Math.max(1, height - 3);
    this.top = Math.max(0, Math.min(this.top, Math.max(0, body.length - page)));
    const shown = body.slice(this.top, this.top + page);
    const position = body.length > page ? `${this.top + 1}–${this.top + shown.length} of ${body.length}` : "";
    const head = `  ${defaultTheme.bold(this.title)}${this.filter ? ` ${defaultTheme.fg("accent", this.filter)}` : ""}`;
    const foot = defaultTheme.dim("  ↑↓ scroll  ·  type to filter  ·  enter or esc close");
    const rows = [
      truncateToWidth(`${head}${gap(head, position, inner)}${defaultTheme.dim(position)}`, inner),
      "",
      ...shown.map((row) => `  ${row}`),
    ];
    while (rows.length < height - 1) rows.push("");
    rows.push(truncateToWidth(foot, inner));
    return rows.map((row) => padToWidth(row, inner));
  }

  private visible(): readonly string[] {
    if (!this.filter) return this.rows;
    const needle = this.filter.toLowerCase();
    return this.rows.filter((row) => stripAnsi(row).toLowerCase().includes(needle));
  }

  private scroll(by: number, page: number): void {
    const body = this.visible();
    this.top = Math.max(0, Math.min(this.top + by, Math.max(0, body.length - page)));
  }
}

/** Spacing that right-aligns `right` on a row that starts with `left`. */
function gap(left: string, right: string, width: number): string {
  const used = left.replace(/\x1b\[[0-9;]*m/g, "").length + right.length;
  return " ".repeat(Math.max(1, width - used - 2));
}
