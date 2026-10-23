import type { MouseReport } from '../input/mouse.js';
import { visibleWidth } from '../text/measure.js';
import type { CommandReport } from '../../../core/commands/report/contract.js';
import { layoutReport } from '../report/renderer.js';
import { stripAnsi } from '../text/ansi.js';
import { defaultTheme } from "../../theme/theme.js";
import { padToWidth, truncateToWidth } from "../text/layout.js";
import { renderMarkdown } from "../transcript/markdown.js";
import { layoutDiff } from "../transcript/diff.js";
import {
  countDiffLines,
  diffNeedsFullView,
  nextDiffPage,
  type DiffPage,
} from "../transcript/diffPage.js";

/**
 * A read-only report host and full-screen reader for long legacy output.
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
 * Open every semantic report in its adaptive view; long legacy text keeps the
 * existing full-screen threshold. Reports retain their source in a collapsed
 * transcript block, while legacy text leaves its existing summary.
 */
export function pageLongOutput(pager: Pager, title: string, block: PageableBlock, transcript?: { clearDiff(block: PageableBlock): void; setText(block: PageableBlock, text: string): void; setCollapsed?(block: PageableBlock, collapsed: boolean): void }): boolean {
  const lines = block.text.split("\n").length;
  if (!block.report && block.diff && diffNeedsFullView(block.diff)) {
    pager.openDiff(title, block.diff);
    summarisePagedBlock(block, lines, countDiffLines(block.diff), transcript);
    return true;
  }
  if (!block.report && lines < PAGER_THRESHOLD_ROWS) return false;
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
    transcript.setText(block, `${lines} lines — shown in a full-screen view; esc closes it.`);
  } else {
    block.text = `${lines} lines — shown in a full-screen view; esc closes it.`;
  }
  return true;
}

function summarisePagedBlock(
  block: PageableBlock,
  lines: number,
  diffLines: number,
  transcript?: { clearDiff(block: PageableBlock): void; setText(block: PageableBlock, text: string): void },
): void {
  const summary = [
    lines > 0 ? `${lines} ${lines === 1 ? "line" : "lines"}` : "",
    diffLines > 0 ? `${diffLines} diff ${diffLines === 1 ? "line" : "lines"}` : "",
  ].filter(Boolean).join(" and ");
  const text = `${summary} - shown in a full-screen view; esc closes it.`;
  if (transcript) {
    transcript.clearDiff(block);
    transcript.setText(block, text);
  } else {
    block.text = text;
    block.diff = undefined;
  }
}

export interface PageableBlock {
  text: string;
  readonly report?: CommandReport;
  collapsed?: boolean;
  diff?: string;
}

export class Pager {
  private title = "";
  private rows: readonly { readonly text: string; readonly source: number }[] = [];
  private source = "";
  private top = 0;
  private width = 0;
  private revision = -1;
  private report: CommandReport | undefined;
  private filter = "";
  private pageRows = 1;
  private wholeScreen = true;
  private diff: string | undefined;
  private diffPageIndex = 0;
  private diffPages: DiffPage[] = [];

  get active(): boolean {
    return this.rows.length > 0;
  }

  get fullScreen(): boolean { return this.active && this.wholeScreen; }

  /** The text being shown, for a copy that should not include the chrome. */
  get text(): string {
    return this.source;
  }

  open(title: string, markdown: string, report?: CommandReport): void {
    this.diff = undefined;
    this.diffPageIndex = 0;
    this.diffPages = [];
    this.report = report;
    this.title = title;
    this.source = markdown;
    this.filter = "";
    this.top = 0;
    this.width = 0;
    this.wholeScreen = true;
    this.rows = [{ text: "", source: -1 }];
  }

  /** Open a bounded full reader for a diff preview that exceeded its inline budget. */
  openDiff(title: string, diff: string): void {
    this.open(title, diff);
    this.diff = diff;
  }

  close(): void {
    this.report = undefined;
    this.rows = [];
    this.source = "";
    this.filter = "";
    this.diff = undefined;
    this.diffPageIndex = 0;
    this.diffPages = [];
  }

  /** Route one key. Returns false when the pager is closed and did not claim it. */
  handleKey(keyId: string, text: string | undefined, height: number): boolean {
    if (!this.active) return false;
    const page = this.width ? this.pageRows : Math.max(1, height - 3);
    switch (keyId) {
      case "escape":
      case "ctrl+c":
      case "enter":
        // Enter dismisses as well as Escape. Typing filters, which means someone
        // who did not notice the view is up would otherwise see their next command
        // silently become a search term.
        this.close();
        return true;
      case "q":
        if (!this.report) this.close();
        else this.handlePaste('q');
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
        this.page(1, page);
        return true;
      case "pageup":
        this.page(-1, page);
        return true;
      case "home":
        this.home();
        return true;
      case "end":
        this.end(page);
        return true;
      case "backspace":
        this.filter = Array.from(this.filter).slice(0, -1).join("");
        this.top = 0;
        return true;
      default:
        // Typing filters, which is what "search" means in a view this size: the
        // rows that do not match are simply not shown.
        if (text && text !== " ") {
          this.handlePaste(text);
        }
        return true;
    }
  }

  /** A reader owns pasted input, including while it fits above the composer. */
  handlePaste(text: string): boolean {
    if (!this.active) return false;
    this.filter += stripAnsi(text).replace(/[\r\n\t]+/g, ' ').replace(/[\x00-\x1f\x7f-\x9f]/g, '');
    this.top = 0;
    return true;
  }

  handlePointer(report: MouseReport): boolean {
    if (!this.active) return false;
    if (report.kind === 'wheel' && !report.ctrl && !report.alt && !report.shift) this.scroll(report.button * 3, this.pageRows);
    return true;
  }

  /** Choose the form from the same body and actual chrome capacity being drawn. */
  render(width: number, height: number, inlineCapacity = 0): string[] {
    if (!this.active || width <= 0 || height <= 0) return [];
    const padding = Math.min(2, Math.floor((width - 1) / 2));
    const inset = ' '.repeat(padding);
    const inner = Math.max(1, width - padding * 2);
    const reflow = this.width !== inner;
    if (reflow || this.revision !== defaultTheme.colorRevision) {
      const anchor = this.visible()[this.top]?.source;
      if (this.diff) {
        this.rows = this.diffRows(inner);
      } else if (this.report) {
        const layout = layoutReport(this.report, inner);
        this.rows = layout.rows.map((text, index) => ({ text, source: layout.sources[index]! }));
      } else this.rows = renderMarkdown(this.source, inner).map((text, index) => ({ text, source: index }));
      this.revision = defaultTheme.colorRevision;
      this.width = inner;
      if (this.report && reflow && anchor !== undefined) this.top = Math.max(0, this.visible().findIndex(row => row.source === anchor));
    }
    const body = this.visible();
    // Filtering cannot switch forms under the user's cursor. Geometry follows
    // the whole report, while the viewport follows the filtered result.
    this.wholeScreen = !this.report || this.rows.length + 3 > inlineCapacity;
    const capacity = this.wholeScreen ? height : Math.min(height, this.rows.length + 3);
    this.pageRows = Math.max(1, capacity - 3);
    this.top = Math.max(0, Math.min(this.top, Math.max(0, body.length - this.pageRows)));
    const shown = body.slice(this.top, this.top + this.pageRows);
    const position = [
      body.length > this.pageRows ? `${this.top + 1}–${this.top + shown.length} of ${body.length}` : '',
      this.diff ? `diff part ${this.diffPageIndex + 1}${this.currentDiffPage()?.next !== undefined ? '; more follows' : ''}` : '',
    ].filter(Boolean).join(' · ');
    const head = `${inset}${defaultTheme.bold(this.title)}${this.filter ? ` ${defaultTheme.fg('accent', this.filter)}` : ''}`;
    const navigation = body.length > this.pageRows || this.currentDiffPage()?.next !== undefined
      ? ' · ↑↓ / PgUp PgDn / wheel scroll' : '';
    const foot = defaultTheme.dim(`${inset}esc close${navigation} · type to filter`);
    const rows = [truncateToWidth(`${head}${gap(head, position, width)}${defaultTheme.dim(position)}`, width), '',
      ...shown.map(row => `${inset}${row.text}`)];
    while (rows.length < capacity - 1) rows.push('');
    rows.push(truncateToWidth(foot, width));
    return rows.slice(0, capacity).map(row => padToWidth(row, width));
  }

  private visible(): readonly { readonly text: string; readonly source: number }[] {
    if (!this.filter) return this.rows;
    const needle = this.filter.toLowerCase();
    if (!this.report) return this.rows.filter(row => stripAnsi(row.text).toLowerCase().includes(needle));
    // Match entire source entries so a narrow wrapped value keeps its label and
    // provenance, and a search is not limited to one visual row.
    const text = new Map<number, string>();
    for (const row of this.rows) text.set(row.source, (text.get(row.source) ?? '') + stripAnsi(row.text).toLowerCase());
    const matched = new Set([...text].filter(([, value]) => value.includes(needle)).map(([source]) => source));
    return this.rows.filter(row => matched.has(row.source));
  }

  private scroll(by: number, page: number): void {
    const body = this.visible();
    this.top = Math.max(0, Math.min(this.top + by, Math.max(0, body.length - page)));
  }

  private page(direction: -1 | 1, page: number): void {
    if (!this.diff) {
      this.scroll(direction * page, page);
      return;
    }
    const body = this.visible();
    if (direction > 0 && this.top + page >= body.length && this.currentDiffPage()?.next !== undefined) {
      this.diffPageIndex += 1;
      this.rows = this.diffRows(this.width);
      this.top = 0;
      return;
    }
    if (direction < 0 && this.top === 0 && this.diffPageIndex > 0) {
      this.diffPageIndex -= 1;
      this.rows = this.diffRows(this.width);
      this.top = Math.max(0, this.rows.length - page);
      return;
    }
    this.scroll(direction * page, page);
  }

  private home(): void {
    if (this.diff) {
      this.diffPageIndex = 0;
      this.rows = this.diffRows(this.width);
    }
    this.top = 0;
  }

  private end(page: number): void {
    if (this.diff) {
      while (this.currentDiffPage()?.next !== undefined) this.diffPageIndex += 1;
      this.rows = this.diffRows(this.width);
    }
    this.top = Math.max(0, this.visible().length - page);
  }

  private currentDiffPage(): DiffPage | undefined {
    if (!this.diff) return undefined;
    const existing = this.diffPages[this.diffPageIndex];
    if (existing) return existing;
    const previous = this.diffPages[this.diffPageIndex - 1];
    const page = nextDiffPage(
      this.diff,
      previous?.next ?? 0,
      previous?.oldLine ?? 0,
      previous?.newLine ?? 0,
      previous?.inHunk ?? false,
    );
    this.diffPages[this.diffPageIndex] = page;
    return page;
  }

  private diffRows(width: number): readonly { readonly text: string; readonly source: number }[] {
    const page = this.currentDiffPage();
    if (!page) return [];
    const previous = this.diffPages[this.diffPageIndex - 1];
    const safeWidth = Math.max(1, width);
    const layout = layoutDiff(page.text, safeWidth, {
      sideBySide: safeWidth >= 100,
      maxRows: 400,
      maxBytes: Math.max(1, Buffer.byteLength(page.text, "utf8")),
      initialLineNumbers: {
        oldLine: previous?.oldLine ?? 0,
        newLine: previous?.newLine ?? 0,
        inHunk: previous?.inHunk ?? false,
      },
    });
    return layout.rows.map((text, source) => ({ text, source }));
  }
}

/** Spacing that right-aligns `right` on a row that starts with `left`. */
function gap(left: string, right: string, width: number): string {
  const used = visibleWidth(left) + visibleWidth(right);
  return " ".repeat(Math.max(1, width - used - 2));
}
