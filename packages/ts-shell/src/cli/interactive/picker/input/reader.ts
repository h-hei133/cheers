import { Editor } from '../../../../presentation/tui/editor.js';
import { CURSOR_MARKER } from '../../../../presentation/tui/render/paint.js';

const PAGE_UNITS = 4096;
export const READ_ONLY_MAX_BYTES = 4 * 1024 * 1024;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Source pages bound grapheme layout, including a single long logical line. */
export class InputReader {
  private editor = new Editor();
  private readonly starts = [0];
  private index = 0;
  private next = 0;
  private top = 0;
  private width = 0;
  private height = 1;
  private follow = true;

  constructor(private readonly source: string) { this.load(0); }

  get position(): string { return this.starts.length > 1 || this.next < this.source.length ? `Part ${this.index + 1}${this.next < this.source.length ? ' · more follows' : ' · end'}` : ''; }

  render(width: number, height: number): string[] {
    if (height <= 0 || width <= 0) return [];
    if (this.width !== width) this.follow = true;
    this.width = width; this.height = height;
    const rows = this.editor.layout(width).rows.map(row => row.rendered);
    const caret = rows.findIndex(row => row.includes(CURSOR_MARKER));
    if (this.follow) {
      if (caret < this.top) this.top = caret;
      if (caret >= this.top + height) this.top = caret - height + 1;
    }
    this.top = Math.max(0, Math.min(this.top, Math.max(0, rows.length - height)));
    this.follow = false;
    return rows.slice(this.top, this.top + height);
  }

  key(key: string): void {
    if (key === 'ctrl+home' || key === 'ctrl+end') {
      if (key === 'ctrl+end') while (this.discover()) { /* bounded source pages, no editor layout */ }
      this.load(key === 'ctrl+home' ? 0 : this.starts.length - 1, key === 'ctrl+end');
    } else if (key === 'pageup' || key === 'pagedown') this.pan((key === 'pageup' ? -1 : 1) * this.height);
    else {
      const move = key === 'home' || key === 'ctrl+a' ? 'line-start' : key === 'end' || key === 'ctrl+e' ? 'line-end' : key;
      if (!['left', 'right', 'up', 'down', 'line-start', 'line-end'].includes(move)) return;
      const changed = this.editor.move(move as 'left' | 'right' | 'up' | 'down' | 'line-start' | 'line-end');
      if (!changed && ['left', 'up', 'right', 'down'].includes(move)) this.changePage(move === 'left' || move === 'up' ? -1 : 1);
      this.follow = true;
    }
  }

  /** Wheel/page motion pans the actual viewport; it never edits or submits. */
  pan(by: number): void {
    if (!this.width) return;
    const layout = this.editor.layout(this.width), max = Math.max(0, layout.rows.length - this.height);
    const target = Math.max(0, Math.min(max, this.top + by));
    if (target === this.top && ((by < 0 && this.top === 0) || (by > 0 && this.top === max))) {
      this.changePage(by < 0 ? -1 : 1);
      return;
    }
    this.top = target;
    const caret = layout.rows.findIndex(row => row.rendered.includes(CURSOR_MARKER));
    const row = layout.rows[Math.max(target, Math.min(target + this.height - 1, caret))];
    if (row && (caret < target || caret >= target + this.height)) this.editor.setCursorOffset(row.sourceStart);
    this.follow = false;
  }

  private changePage(direction: -1 | 1): void {
    if (direction < 0 && this.index > 0) this.load(this.index - 1, true);
    if (direction > 0 && (this.index + 1 < this.starts.length || this.discover())) this.load(this.index + 1);
  }

  private discover(): boolean {
    const start = this.starts[this.starts.length - 1]!;
    const end = this.endAt(start);
    if (end >= this.source.length) return false;
    this.starts.push(end); return true;
  }

  private load(index: number, end = false): void {
    const start = this.starts[index]!;
    const next = this.endAt(start);
    // A boundary newline is represented by the page transition, not an extra empty row.
    const text = this.source.slice(start, next);
    this.editor = new Editor();
    this.editor.setText(next < this.source.length && text.endsWith('\n') ? text.slice(0, -1) : text);
    this.editor.move(end ? 'doc-end' : 'doc-start');
    this.index = index; this.next = next;
    this.top = end ? Number.MAX_SAFE_INTEGER : 0; this.follow = true;
  }

  private endAt(start: number): number {
    if (this.source.length - start <= PAGE_UNITS) return this.source.length;
    const newline = this.source.slice(start, start + PAGE_UNITS).lastIndexOf('\n');
    if (newline >= PAGE_UNITS / 2) return start + newline + 1;
    const sample = this.source.slice(start, start + PAGE_UNITS * 2 + 2);
    if (/^[\x20-\x7e]*$/.test(sample)) return start + PAGE_UNITS;
    let end = 0;
    for (const { index } of segmenter.segment(sample)) {
      if (index > PAGE_UNITS) break;
      end = index;
    }
    if (!end) throw new Error('A character exceeds the read-only view limit. Inspect the configuration file instead.');
    return start + end;
  }
}
