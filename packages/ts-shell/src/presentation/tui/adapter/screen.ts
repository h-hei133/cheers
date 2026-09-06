import { visibleWidth } from "../text/measure.js";

const MAX_WRITE_CHARS = 1024 * 1024;

export class BoundedWriter {
  private buffer = "";
  private readonly write: (data: string) => void;

  constructor(write: (data: string) => void) {
    this.write = write;
  }

  append(value: string): void {
    let offset = 0;
    while (offset < value.length) {
      const capacity = MAX_WRITE_CHARS - this.buffer.length;
      if (capacity === 0) {
        this.flush();
        continue;
      }
      let end = Math.min(value.length, offset + capacity);
      if (
        end < value.length &&
        value.charCodeAt(end - 1) >= 0xd800 &&
        value.charCodeAt(end - 1) <= 0xdbff &&
        value.charCodeAt(end) >= 0xdc00 &&
        value.charCodeAt(end) <= 0xdfff
      ) {
        end--;
      }
      if (end === offset) {
        this.flush();
        continue;
      }
      this.buffer += value.slice(offset, end);
      offset = end;
      if (this.buffer.length === MAX_WRITE_CHARS) this.flush();
    }
  }

  flush(): void {
    if (!this.buffer) return;
    this.write(this.buffer);
    this.buffer = "";
  }
}

export interface MainScreenState {
  readonly previousLines: readonly string[];
  readonly previousWidth: number;
  readonly previousHeight: number;
  readonly viewportTop: number;
}

export interface MainScreenFrame {
  readonly width: number;
  readonly height: number;
  readonly lines: readonly string[];
  readonly previous: MainScreenState;
}

export interface MainScreenDiff {
  readonly firstChanged: number;
  readonly lastChanged: number;
  readonly appended: boolean;
  readonly noChange: boolean;
}

export function diffLines(previous: readonly string[], next: readonly string[]): MainScreenDiff {
  let firstChanged = -1;
  let lastChanged = -1;
  const maxLines = Math.max(previous.length, next.length);
  for (let i = 0; i < maxLines; i++) {
    const oldLine = i < previous.length ? previous[i] : "";
    const newLine = i < next.length ? next[i] : "";
    if (oldLine !== newLine) {
      if (firstChanged === -1) firstChanged = i;
      lastChanged = i;
    }
  }
  const appended = next.length > previous.length;
  if (appended) {
    if (firstChanged === -1) firstChanged = previous.length;
    lastChanged = next.length - 1;
  }
  return { firstChanged, lastChanged, appended, noChange: firstChanged === -1 };
}

export function renderAppendChunk(
  lines: readonly string[],
  from: number,
  width: number,
): { readonly text: string; readonly rows: number } {
  let text = "";
  let rows = 0;
  for (let i = from; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (visibleWidth(line) > width) {
      throw new Error(`Rendered line ${i} exceeds terminal width (${visibleWidth(line)} > ${width}).`);
    }
    text += (rows > 0 ? "\r\n" : "") + "\x1b[2K" + line;
    rows++;
  }
  return { text, rows };
}

export function viewportFor(
  totalLines: number,
  height: number,
  previousTop: number,
): { readonly top: number; readonly bottom: number } {
  const top = Math.max(0, Math.min(previousTop, Math.max(0, totalLines - height)));
  return { top, bottom: top + height - 1 };
}
