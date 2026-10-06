import fs from "node:fs";
import { drainInput } from "./input/drain.js";
import { QUERY_APPEARANCE, STOP_APPEARANCE } from "./input/appearance.js";
import { KeyboardNegotiation, type KeyboardProtocol } from "./input/keyboardProtocol.js";
import { detectTerminalCapabilities, type TerminalCapabilities } from "./terminalCapabilities.js";

/**
 * Terminal device driver.
 *
 * Owns raw mode, stdin fan-out, resize notification, and the mode-restore
 * battery that must run however the process leaves — including a crash, where
 * only an unbuffered `writeSync` is guaranteed to reach the device. Writes are
 * accounted so the renderer can back off instead of queueing frames a slow link
 * will never drain.
 */

/** Queued bytes past which the link is treated as gone rather than slow. */
const MAX_BACKLOG_BYTES = 64 * 1024 * 1024;

/** How long to wait for a keyboard-protocol reply before assuming there is none. */
const KEYBOARD_REPLY_TIMEOUT_MS = 250;

/**
 * Ask the terminal to bracket pasted text.
 *
 * Without this a pasted block arrives as ordinary keystrokes, so every newline in
 * it reads as Enter and submits — a five-line paste runs four turns and leaves
 * the last line in the prompt. The brackets are what make a paste one event.
 */
const ENABLE_BRACKETED_PASTE = "\x1b[?2004h";

/** Restores every private mode this driver may have set, in reverse order. */
const RESTORE_MODES = [
  STOP_APPEARANCE,
  "\x1b[?1049l", // alternate screen, in case a modal frame was up
  "\x1b[?2026l", // synchronized output
  "\x1b[?7h", // autowrap
  "\x1b[?1l\x1b>", // application cursor keys / keypad
  "\x1b[?2004l", // bracketed paste
  "\x1b[?1006l\x1b[?1003l\x1b[?1002l\x1b[?1000l", // mouse reporting
  "\x1b[?25h", // cursor visibility
  "\x1b[0m", // attributes
].join("");

export interface TerminalStartOptions {
  readonly onInputReady?: () => void;
  /** Leave stdin in cooked mode; {@link Terminal.enableInput} takes it over later. */
  readonly deferInput?: boolean;
}

export type InputHandler = (data: string) => void;
export type ResizeHandler = () => void;
export type DisconnectHandler = () => void;

/**
 * The surface the renderer depends on. Narrower than {@link Terminal} so a frame
 * can be rendered against a recording device in a test without a real tty.
 */
export interface TerminalDevice {
  readonly capabilities: TerminalCapabilities;
  /** Negotiated modifier-reporting protocol; absent devices are treated as legacy. */
  readonly keyboardProtocol?: KeyboardProtocol;
  getDimensions(): { readonly columns: number; readonly rows: number };
  getPendingOutputBytes(): number;
  write(data: string, onWritten?: () => void): void;
  start(
    onInput: InputHandler,
    onResize: ResizeHandler,
    onDisconnect: DisconnectHandler,
    options?: TerminalStartOptions,
  ): void;
  stop(): void;
  enableInput(): void;
  /** Consume late protocol reports before a graceful exit; crash cleanup stays synchronous. */
  drainInput?(): Promise<void>;
}

export class Terminal implements TerminalDevice {
  readonly capabilities: TerminalCapabilities;

  private keyboard = new KeyboardNegotiation();
  private draining = false;
  private started = false;
  private disconnected = false;
  private rawOwned = false;
  private inputEnabled = false;
  private pendingBytes = 0;
  private keyboardTimer: NodeJS.Timeout | undefined;
  private deferredInput: string[] = [];
  private inputReady?: () => void;

  private onInput: InputHandler = () => {};
  private onResize: ResizeHandler = () => {};
  private onDisconnect: DisconnectHandler = () => {};

  private readonly handleData = (chunk: Buffer | string): void => {
    if (this.draining) return;
    let text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    if (this.keyboard.pending) {
      const step = this.keyboard.consume(text);
      if (step.write) this.write(step.write);
      text = step.forward;
      if (text.length === 0) return;
    }
    if (!this.inputEnabled) {
      this.deferredInput.push(text);
      return;
    }
    this.onInput(text);
  };

  private readonly handleResize = (): void => {
    this.onResize();
  };

  private readonly handleEnd = (): void => {
    this.fireDisconnect();
  };

  private readonly handleExit = (): void => {
    this.restoreSync();
  };

  constructor(capabilities: TerminalCapabilities = detectTerminalCapabilities()) {
    this.capabilities = capabilities;
  }

  /** Whether there is no terminal attached, so nothing should be painted. */
  get headless(): boolean {
    return !process.stdout.isTTY;
  }

  get columns(): number {
    return process.stdout.columns || 80;
  }

  get rows(): number {
    return process.stdout.rows || 24;
  }

  getDimensions(): { readonly columns: number; readonly rows: number } {
    return { columns: this.columns, rows: this.rows };
  }

  getPendingOutputBytes(): number {
    return this.pendingBytes;
  }

  start(
    onInput: InputHandler,
    onResize: ResizeHandler,
    onDisconnect: DisconnectHandler,
    options?: TerminalStartOptions,
  ): void {
    if (this.started) return;
    this.started = true;
    this.draining = false;
    this.keyboard = new KeyboardNegotiation();
    // However the process leaves — clean exit, crash, or a signal — the terminal
    // must not be left in raw mode with the cursor hidden and autowrap off.
    process.once("exit", this.handleExit);
    this.disconnected = false;
    this.onInput = onInput;
    this.onResize = onResize;
    this.onDisconnect = onDisconnect;
    this.inputEnabled = options?.deferInput !== true;
    this.inputReady = options?.onInputReady;

    process.stdout.on("resize", this.handleResize);
    if (!process.stdin.isTTY) return;

    if (this.inputEnabled) this.takeRawMode();
    if (this.capabilities.supportsBracketedPaste) this.write(ENABLE_BRACKETED_PASTE);
    process.stdin.on("data", this.handleData);
    process.stdin.on("end", this.handleEnd);
    process.stdin.on("close", this.handleEnd);
    process.stdin.resume();
    if (this.inputEnabled) {
      const ready = this.inputReady; this.inputReady = undefined; ready?.();
    }
    // Ask for modifier reporting before the first keystroke: without it the
    // terminal cannot express Shift+Enter at all, and a bare Escape is
    // indistinguishable from the head of a sequence.
    if (this.capabilities.supportsBracketedPaste) {
      this.write(this.keyboard.query);
      if (process.stdout.isTTY) this.write(QUERY_APPEARANCE);
      this.keyboardTimer = setTimeout(() => this.expireKeyboardNegotiation(), KEYBOARD_REPLY_TIMEOUT_MS);
      this.keyboardTimer.unref?.();
    }
  }

  /** Stop inspecting input for replies that are evidently not coming. */
  private expireKeyboardNegotiation(): void {
    const held = this.keyboard.expire();
    if (held.length > 0) this.handleData(held);
  }

  /** Which modifier-reporting protocol negotiation settled on. */
  get keyboardProtocol(): KeyboardProtocol {
    return this.keyboard.active;
  }

  /** Take over stdin after a deferred start and replay anything typed meanwhile. */
  enableInput(): void {
    if (this.inputEnabled) return;
    this.inputEnabled = true;
    this.takeRawMode();
    if (this.started && process.stdin.isTTY) {
      const ready = this.inputReady; this.inputReady = undefined; ready?.();
    }
    const buffered = this.deferredInput;
    this.deferredInput = [];
    for (const chunk of buffered) this.onInput(chunk);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.inputReady = undefined;
    if (this.keyboardTimer) clearTimeout(this.keyboardTimer);
    this.keyboardTimer = undefined;
    process.off("exit", this.handleExit);
    process.stdout.off("resize", this.handleResize);
    process.stdin.off("data", this.handleData);
    process.stdin.off("end", this.handleEnd);
    process.stdin.off("close", this.handleEnd);
    this.writeSync(`${this.keyboard.stop()}${RESTORE_MODES}`);
    this.releaseRawMode();
  }

  async drainInput(): Promise<void> {
    if (!this.started || !process.stdin.isTTY || this.disconnected) return;
    this.draining = true;
    if (this.keyboardTimer) clearTimeout(this.keyboardTimer);
    this.keyboardTimer = undefined;
    this.deferredInput = [];
    // Stop generating reports before waiting for those already in flight.
    this.writeSync(this.keyboard.stop() + STOP_APPEARANCE);
    await drainInput(process.stdin);
  }

  /** Unbuffered restore for exit and crash handlers, where queued writes are lost. */
  restoreSync(): void {
    this.writeSync(`${this.keyboard.stop()}${RESTORE_MODES}`);
    this.releaseRawMode();
  }

  write(data: string, onWritten?: () => void): void {
    if (this.disconnected || data.length === 0) return;
    const bytes = Buffer.byteLength(data, "utf8");
    if (this.pendingBytes + bytes > MAX_BACKLOG_BYTES) {
      this.fireDisconnect();
      return;
    }
    this.pendingBytes += bytes;
    process.stdout.write(data, (error) => {
      this.pendingBytes = Math.max(0, this.pendingBytes - bytes);
      if (!error) onWritten?.();
    });
  }

  writeSync(data: string): void {
    if (!process.stdout.isTTY) return;
    try {
      fs.writeSync(1, data);
    } catch {
      try {
        process.stdout.write(data);
      } catch {
        // The device is gone; nothing further can be restored.
      }
    }
  }

  hideCursor(): void {
    this.write("\x1b[?25l");
  }

  showCursor(): void {
    this.write("\x1b[?25h");
  }

  private takeRawMode(): void {
    if (typeof process.stdin.setRawMode !== "function") return;
    if (!process.stdin.isRaw) {
      process.stdin.setRawMode(true);
      this.rawOwned = true;
    }
  }

  private releaseRawMode(): void {
    try {
      if (this.rawOwned && typeof process.stdin.setRawMode === "function") {
        process.stdin.setRawMode(false);
      }
      this.rawOwned = false;
      process.stdin.pause();
    } catch {
      // Best-effort: the stream may already be torn down.
    }
  }

  private fireDisconnect(): void {
    if (this.disconnected) return;
    this.disconnected = true;
    this.onDisconnect();
  }
}

export const processTerminal = new Terminal();
