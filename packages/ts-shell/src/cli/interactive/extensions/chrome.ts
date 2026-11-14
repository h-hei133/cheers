import { dialogText, MAX_UI_CHROME_BYTES, MAX_UI_KEY_BYTES, MAX_UI_TEXT_BYTES, MAX_UI_WIDGET_LINES, singleLine, textBytes } from './limits.js';

interface Widget {
  readonly lines: readonly string[];
  readonly placement: 'aboveEditor' | 'belowEditor';
  readonly bytes: number;
}

/** Bound retained chrome before it can reach the per-frame projection. */
export class ExtensionChromeState {
  private readonly statuses = new Map<string, { readonly text: string; readonly bytes: number }>();
  private readonly widgets = new Map<string, Widget>();
  private bytes = 0;

  setStatus(key: string, text: string | undefined): void {
    const keyBytes = textBytes(key, MAX_UI_KEY_BYTES);
    const previous = this.statuses.get(key);
    if (text === undefined) { this.bytes -= previous?.bytes ?? 0; this.statuses.delete(key); return; }
    const bytes = keyBytes + textBytes(text) + 1;
    if (!previous && this.statuses.size >= 32) throw new Error('Extension UI accepts at most 32 statuses.');
    this.checkTotal(bytes - (previous?.bytes ?? 0));
    const rendered = singleLine(text);
    this.statuses.set(key, { text: rendered, bytes });
    this.bytes += bytes - (previous?.bytes ?? 0);
  }

  setWidget(key: string, lines: readonly string[] | undefined, placement: 'aboveEditor' | 'belowEditor'): void {
    const keyBytes = textBytes(key, MAX_UI_KEY_BYTES);
    const previous = this.widgets.get(key);
    if (lines === undefined) { this.bytes -= previous?.bytes ?? 0; this.widgets.delete(key); return; }
    if (!Array.isArray(lines) || lines.length > MAX_UI_WIDGET_LINES) throw new Error('Extension UI accepts at most 256 widget lines.');
    if (placement !== 'aboveEditor' && placement !== 'belowEditor') throw new Error('Extension UI widget placement is invalid.');
    if (!previous && this.widgets.size >= 16) throw new Error('Extension UI accepts at most 16 widgets.');
    let bytes = keyBytes;
    let lineCount = 0;
    const captured: string[] = [];
    for (let position = 0, count = lines.length; position < count; position++) {
      const line = lines[position]!;
      bytes += textBytes(line, MAX_UI_TEXT_BYTES) + 1;
      lineCount += 1;
      for (let index = 0; index < line.length; index++) {
        if (line[index] === '\n' || (line[index] === '\r' && line[index + 1] !== '\n')) lineCount += 1;
      }
      if (lineCount > MAX_UI_WIDGET_LINES) throw new Error('Extension UI accepts at most 256 widget lines.');
      this.checkTotal(bytes - (previous?.bytes ?? 0));
      captured.push(line);
    }
    const rendered: string[] = [];
    for (const line of captured) {
      rendered.push(...dialogText(line).split('\n').map(value => value.replace(/\t/g, ' ')));
      if (rendered.length > MAX_UI_WIDGET_LINES) throw new Error('Extension UI accepts at most 256 widget lines.');
    }
    this.checkTotal(bytes - (previous?.bytes ?? 0));
    this.widgets.set(key, { lines: rendered, placement, bytes });
    this.bytes += bytes - (previous?.bytes ?? 0);
  }

  read() {
    return {
      status: [...this.statuses.values()].map(value => value.text),
      aboveEditor: [...this.widgets.values()].filter(widget => widget.placement === 'aboveEditor').flatMap(widget => widget.lines),
      belowEditor: [...this.widgets.values()].filter(widget => widget.placement === 'belowEditor').flatMap(widget => widget.lines),
    };
  }

  clear(): void { this.statuses.clear(); this.widgets.clear(); this.bytes = 0; }

  private checkTotal(delta: number): void {
    if (this.bytes + delta > MAX_UI_CHROME_BYTES) throw new Error('Extension UI chrome exceeds 64 KiB.');
  }
}
