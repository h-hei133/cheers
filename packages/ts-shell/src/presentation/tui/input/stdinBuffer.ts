import { ESC, ESCAPE_INCOMPLETE, ESCAPE_OVERLONG, resolveEscapeEnd, scalarLength } from "./escape.js";
import { parseKeyEvent, type ParsedKeyEvent } from "./keys.js";
import { isMouseSequence, parseMouseReport, type MouseReport } from "./mouse.js";

/**
 * Raw stdin reassembler.
 *
 * Turns an arbitrary byte stream into discrete keystrokes and paste blocks. Two
 * ambiguities make this more than a split: a partial escape sequence is
 * indistinguishable from a finished one until its tail arrives, and a lone ESC
 * is indistinguishable from the head of a sequence that has not arrived yet.
 * Both are resolved by holding the partial briefly — long enough for the tail of
 * a split sequence, short enough that pressing Escape still feels immediate.
 */

const BRACKETED_PASTE_START = "\x1b[200~";
const BRACKETED_PASTE_END = "\x1b[201~";

/** How long a dangling partial sequence is held before it is treated as typed. */
const PARTIAL_HOLD_MS = 40;
/** How long an unterminated paste block is held before it is released as text. */
const PASTE_HOLD_MS = 1000;

export type KeyListener = (event: ParsedKeyEvent) => void;
export type PasteListener = (text: string) => void;
export type MouseListener = (report: MouseReport) => void;

export interface StdinBufferOptions {
  readonly partialHoldMs?: number;
  readonly pasteHoldMs?: number;
  readonly setTimer?: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
}

export class StdinBuffer {
  private buffer = "";
  private pasting = false;
  private pasteBuffer = "";
  private partialTimer: unknown;
  private pasteTimer: unknown;

  private readonly keyListeners = new Set<KeyListener>();
  private readonly pasteListeners = new Set<PasteListener>();
  private readonly mouseListeners = new Set<MouseListener>();
  private readonly partialHoldMs: number;
  private readonly pasteHoldMs: number;
  private readonly setTimer: (callback: () => void, delayMs: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(options: StdinBufferOptions = {}) {
    this.partialHoldMs = options.partialHoldMs ?? PARTIAL_HOLD_MS;
    this.pasteHoldMs = options.pasteHoldMs ?? PASTE_HOLD_MS;
    this.setTimer = options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  onKey(listener: KeyListener): () => void {
    this.keyListeners.add(listener);
    return () => this.keyListeners.delete(listener);
  }

  onPaste(listener: PasteListener): () => void {
    this.pasteListeners.add(listener);
    return () => this.pasteListeners.delete(listener);
  }

  onMouse(listener: MouseListener): () => void {
    this.mouseListeners.add(listener);
    return () => this.mouseListeners.delete(listener);
  }

  feed(chunk: string): void {
    if (!chunk) return;
    this.clearTimer(this.partialTimer);
    this.partialTimer = undefined;
    this.buffer += chunk;
    this.drain();
    if (this.buffer.length > 0 && !this.pasting) {
      this.partialTimer = this.setTimer(() => this.releasePartial(), this.partialHoldMs);
    }
  }

  /** Release anything held, as if the hold timers had all expired. */
  flush(): void {
    this.clearTimer(this.partialTimer);
    this.partialTimer = undefined;
    if (this.pasting) this.abortPaste();
    this.releasePartial();
  }

  dispose(): void {
    this.clearTimer(this.partialTimer);
    this.clearTimer(this.pasteTimer);
    this.partialTimer = undefined;
    this.pasteTimer = undefined;
    this.keyListeners.clear();
    this.pasteListeners.clear();
    this.mouseListeners.clear();
  }

  /** Consume every sequence the buffer can complete, leaving any partial behind. */
  private drain(): void {
    while (this.buffer.length > 0) {
      if (this.pasting) {
        if (!this.consumePaste()) return;
        continue;
      }
      if (this.buffer.startsWith(BRACKETED_PASTE_START)) {
        this.buffer = this.buffer.slice(BRACKETED_PASTE_START.length);
        this.pasting = true;
        this.pasteBuffer = "";
        this.clearTimer(this.pasteTimer);
        this.pasteTimer = this.setTimer(() => this.abortPaste(), this.pasteHoldMs);
        continue;
      }
      if (BRACKETED_PASTE_START.startsWith(this.buffer)) return;
      if (this.buffer.charCodeAt(0) !== 0x1b) {
        // A terminal that still translates Enter to CRLF would otherwise submit
        // and then insert a newline into the next draft.
        if (this.buffer.startsWith("\r\n")) {
          this.buffer = `\r${this.buffer.slice(2)}`;
        }
        this.take(scalarLength(this.buffer, 0));
        continue;
      }
      // `ESC ESC` is a meta-Escape chord; take the first ESC alone so the
      // remainder is re-examined as a fresh sequence.
      if (this.buffer.charCodeAt(1) === 0x1b) {
        this.take(1);
        continue;
      }
      const end = resolveEscapeEnd(this.buffer, 0);
      if (end === ESCAPE_INCOMPLETE) return;
      if (end === ESCAPE_OVERLONG) {
        this.take(1);
        continue;
      }
      this.take(end);
    }
  }

  /** Consume one paste chunk, returning false while the terminator is missing. */
  private consumePaste(): boolean {
    const end = this.buffer.indexOf(BRACKETED_PASTE_END);
    if (end < 0) {
      const safe = Math.max(0, this.buffer.length - BRACKETED_PASTE_END.length + 1);
      this.pasteBuffer += this.buffer.slice(0, safe);
      this.buffer = this.buffer.slice(safe);
      return false;
    }
    this.pasteBuffer += this.buffer.slice(0, end);
    this.buffer = this.buffer.slice(end + BRACKETED_PASTE_END.length);
    this.pasting = false;
    this.clearTimer(this.pasteTimer);
    this.pasteTimer = undefined;
    const text = this.pasteBuffer;
    this.pasteBuffer = "";
    if (text.length > 0) for (const listener of this.pasteListeners) listener(text);
    return true;
  }

  /** Deliver an unterminated paste as text rather than holding it indefinitely. */
  private abortPaste(): void {
    this.clearTimer(this.pasteTimer);
    this.pasteTimer = undefined;
    if (!this.pasting) return;
    this.pasting = false;
    // Whatever is still buffered was withheld only in case the terminator was
    // split across chunks; with the paste abandoned it is content.
    const text = this.pasteBuffer + this.buffer;
    this.pasteBuffer = "";
    this.buffer = "";
    if (text.length > 0) for (const listener of this.pasteListeners) listener(text);
  }

  /**
   * The hold expired: the partial is not the head of a split sequence after all,
   * so deliver it. A lone ESC becomes the Escape key here.
   */
  private releasePartial(): void {
    this.partialTimer = undefined;
    while (this.buffer.length > 0) {
      const before = this.buffer.length;
      if (this.buffer.charCodeAt(0) === 0x1b) {
        const end = resolveEscapeEnd(this.buffer, 0);
        this.take(end > 0 ? end : this.buffer.length);
      } else {
        this.take(scalarLength(this.buffer, 0));
      }
      if (this.buffer.length === before) return;
    }
  }

  private take(length: number): void {
    const sequence = this.buffer.slice(0, length);
    this.buffer = this.buffer.slice(length);
    // A mouse report shares the CSI shape of a keystroke, so it has to be
    // recognised here or it reaches the editor as typed text.
    if (isMouseSequence(sequence)) {
      const report = parseMouseReport(sequence);
      if (report) for (const listener of this.mouseListeners) listener(report);
      return;
    }
    const event = parseKeyEvent(sequence);
    if (!event.keyId) return;
    for (const listener of this.keyListeners) listener(event);
  }
}
