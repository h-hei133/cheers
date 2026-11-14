import type { ParsedKeyEvent } from "../input/keys.js";
import type { OverlayComponent } from "../render/overlayStack.js";
import { padToWidth, truncateToWidth } from "../text/layout.js";
import { graphemeBoundaries, sliceWithWidth, visibleWidth } from "../text/measure.js";
import { defaultTheme } from "../../theme/theme.js";

/**
 * Lightweight Pi-style OverlayComponents: SingleLineInput, CancellableLoader,
 * and bordered overlay frame helpers.
 */

const CURSOR_MARKER = "\x1b_c\x07";
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 80;

export class SingleLineInput implements OverlayComponent {
  focused = false;
  private value = "";
  private cursor = 0;

  onSubmit?: (value: string) => void;
  onCancel?: () => void;
  onChange?: (value: string) => void;

  constructor(private readonly placeholder = "") {}

  getValue(): string {
    return this.value;
  }

  setValue(value: string): void {
    this.value = value.replace(/[\r\n]/g, " ");
    const bounds = graphemeBoundaries(this.value);
    const clamped = Math.min(this.cursor, this.value.length);
    this.cursor = bounds.reduce((best, b) => (b <= clamped ? b : best), 0);
    this.onChange?.(this.value);
  }

  handleKey(event: ParsedKeyEvent): boolean {
    if (event.keyId === "escape" || event.keyId === "ctrl+c") {
      this.onCancel?.();
      return true;
    }
    if (event.keyId === "enter") {
      this.onSubmit?.(this.value);
      return true;
    }
    if (event.keyId === "backspace") {
      if (this.cursor > 0) {
        const prev = this.prevBoundary();
        this.value = this.value.slice(0, prev) + this.value.slice(this.cursor);
        this.cursor = prev;
        this.onChange?.(this.value);
      }
      return true;
    }
    if (event.keyId === "delete") {
      if (this.cursor < this.value.length) {
        const next = this.nextBoundary();
        this.value = this.value.slice(0, this.cursor) + this.value.slice(next);
        this.onChange?.(this.value);
      }
      return true;
    }
    if (event.keyId === "left") {
      this.cursor = this.prevBoundary();
      return true;
    }
    if (event.keyId === "right") {
      this.cursor = this.nextBoundary();
      return true;
    }
    if (event.keyId === "home" || event.keyId === "ctrl+a") {
      this.cursor = 0;
      return true;
    }
    if (event.keyId === "end" || event.keyId === "ctrl+e") {
      this.cursor = this.value.length;
      return true;
    }
    if (event.keyId === "ctrl+u") {
      this.value = this.value.slice(this.cursor);
      this.cursor = 0;
      this.onChange?.(this.value);
      return true;
    }
    if (event.keyId === "ctrl+k") {
      this.value = this.value.slice(0, this.cursor);
      this.onChange?.(this.value);
      return true;
    }
    if (event.text) {
      const clean = event.text.replace(/[\r\n]/g, " ");
      this.value = this.value.slice(0, this.cursor) + clean + this.value.slice(this.cursor);
      this.cursor += clean.length;
      this.onChange?.(this.value);
      return true;
    }
    return false;
  }

  handlePaste(text: string): boolean {
    const clean = text.replace(/[\r\n]+/g, " ");
    if (!clean) return true;
    this.value = this.value.slice(0, this.cursor) + clean + this.value.slice(this.cursor);
    this.cursor += clean.length;
    this.onChange?.(this.value);
    return true;
  }

  render(width: number): string[] {
    const promptPrefix = "> ";
    const avail = Math.max(1, width - promptPrefix.length);
    if (!this.value && this.placeholder) {
      const ph = truncateToWidth(this.placeholder, Math.max(1, avail - 1));
      const marker = this.focused ? CURSOR_MARKER : "";
      return [`${promptPrefix}${marker}${defaultTheme.dim(ph)}`];
    }
    const beforeCursor = this.value.slice(0, this.cursor);
    const cursorCols = visibleWidth(beforeCursor);
    const scrollCol = Math.max(0, cursorCols - Math.max(1, avail - 1));
    const visibleBefore = sliceWithWidth(beforeCursor, scrollCol, avail).text;
    const remaining = Math.max(0, avail - visibleWidth(visibleBefore));
    const visibleAfter = remaining > 0 ? sliceWithWidth(this.value.slice(this.cursor), 0, remaining).text : "";
    const marker = this.focused ? CURSOR_MARKER : "";
    return [`${promptPrefix}${visibleBefore}${marker}${visibleAfter}`];
  }

  private prevBoundary(): number {
    const bounds = graphemeBoundaries(this.value);
    let prev = 0;
    for (const b of bounds) {
      if (b >= this.cursor) break;
      prev = b;
    }
    return prev;
  }

  private nextBoundary(): number {
    const bounds = graphemeBoundaries(this.value);
    for (const b of bounds) {
      if (b > this.cursor) return b;
    }
    return this.value.length;
  }
}

export class CancellableLoader implements OverlayComponent {
  focused = false;
  private frameIndex = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly controller = new AbortController();

  onAbort?: () => void;

  constructor(
    private message = "Working...",
    private readonly onTick?: () => void,
    private readonly cancelHint = "Esc to cancel",
  ) {
    this.start();
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get aborted(): boolean {
    return this.controller.signal.aborted;
  }

  setMessage(message: string): void {
    this.message = message;
    this.onTick?.();
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % SPINNER_FRAMES.length;
      this.onTick?.();
    }, SPINNER_INTERVAL_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  dispose(): void {
    this.stop();
  }

  handleKey(event: ParsedKeyEvent): boolean {
    if (event.keyId === "escape" || event.keyId === "ctrl+c") {
      this.stop();
      if (!this.controller.signal.aborted) {
        this.controller.abort();
        this.onAbort?.();
      }
      return true;
    }
    return true;
  }

  render(width: number): string[] {
    const innerWidth = Math.max(1, width - 4);
    const spinner = defaultTheme.fg("accent", SPINNER_FRAMES[this.frameIndex]!);
    const text = `${spinner} ${truncateToWidth(this.message, Math.max(1, innerWidth - 2))}`;
    const body = [text, defaultTheme.dim(truncateToWidth(this.cancelHint, innerWidth))];
    return wrapOverlayBox(body, width);
  }
}

/** Frame any overlay body lines with a themed border, optional title, and footer. */
export function wrapOverlayBox(
  lines: readonly string[],
  width: number,
  title?: string,
  footer?: string,
): string[] {
  const safeWidth = Math.max(4, width);
  const innerWidth = safeWidth - 4;
  const topTitle = title ? ` ${truncateToWidth(title, Math.max(1, safeWidth - 6))} ` : "";
  const topFill = Math.max(0, safeWidth - 2 - visibleWidth(topTitle));
  const topBorder = defaultTheme.fg("border", `┌${topTitle}${"─".repeat(topFill)}┐`);
  const bottomNote = footer ? ` ${truncateToWidth(footer, Math.max(1, safeWidth - 6))} ` : "";
  const bottomFill = Math.max(0, safeWidth - 2 - visibleWidth(bottomNote));
  const bottomBorder = defaultTheme.fg("border", `└${bottomNote}${"─".repeat(bottomFill)}┘`);

  const framed = lines.map((line) => {
    const fitted = padToWidth(line, innerWidth);
    return `${defaultTheme.fg("border", "│")} ${fitted} ${defaultTheme.fg("border", "│")}`;
  });
  return [topBorder, ...framed, bottomBorder];
}
