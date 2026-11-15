import { acquireRawMode, drainInput, releaseRawMode } from "./input/drain.js";
import { QUERY_APPEARANCE, STOP_APPEARANCE } from "./input/appearance.js";
import { CELL_SIZE_QUERY } from "./input/cellSize.js";
import type { KeyboardProtocol } from "./input/keyboardProtocol.js";
import type { ProgramStatus } from './input/programStatus.js';
import { TerminalInput } from './terminal/input.js';
import { TerminalOutput } from './terminal/output.js';
import {
  PendingColorQuery,
  TERMINAL_COLOR_QUERY,
  type ColorQueryOptions,
  type TerminalColors,
} from "./input/terminalColors.js";
import type { StdinBuffer } from './input/stdinBuffer.js';
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
  setProgress?(active: boolean): void;
  setProgramStatus?(status: ProgramStatus): void;
  queryTerminalColors?(options?: ColorQueryOptions): Promise<TerminalColors>;
  queryCellSize?(): void;
  /** Use the host's existing paste-aware framing for terminal report collection. */
  bindProtocolInput?(input: StdinBuffer): () => void;
  /** Settle the initial keyboard/status query before synchronous initialization. */
  waitForProtocol?(): Promise<void>;
}

export class Terminal implements TerminalDevice {
  readonly capabilities: TerminalCapabilities;

  private draining = false;
  private started = false;
  private generation = 0;
  private disconnected = false;
  private rawOwned = false;
  private keyboardTimer: NodeJS.Timeout | undefined;
  private inputReady?: () => void;
  private readonly input = new TerminalInput({ write: data => this.write(data), colors: () => this.colorQuery });
  private readonly output = new TerminalOutput(() => this.disconnected, () => this.fireDisconnect());
  private readonly status = this.input.status;
  private readonly protocol = this.input.protocol;
  private colorQuery: PendingColorQuery | undefined;
  private onResize?: ResizeHandler;
  private onDisconnect?: DisconnectHandler;
  private readonly handleData = this.input.receive.bind(this.input);
  private readonly handleEnd = this.fireDisconnect.bind(this);
  private readonly handleExit = this.restoreSync.bind(this);

  constructor(capabilities: TerminalCapabilities = detectTerminalCapabilities()) {
    this.capabilities = capabilities;
  }

  /** Whether there is no terminal attached, so nothing should be painted. */
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
    return this.output.pendingBytes;
  }

  start(
    onInput: InputHandler,
    onResize: ResizeHandler,
    onDisconnect: DisconnectHandler,
    options?: TerminalStartOptions,
  ): void {
    if (this.started) return;
    const generation = ++this.generation;
    this.started = true;
    this.draining = false;
    this.input.start(onInput, options?.deferInput !== true);
    // However the process leaves — clean exit, crash, or a signal — the terminal
    // must not be left in raw mode with the cursor hidden and autowrap off.
    process.once("exit", this.handleExit);
    this.disconnected = false;
    this.onResize = onResize;
    this.onDisconnect = onDisconnect;
    this.inputReady = options?.onInputReady;

    process.stdout.on("resize", onResize);
    if (!process.stdin.isTTY) return;

    if (this.input.enabled) this.rawOwned = acquireRawMode(this.rawOwned);
    if (this.capabilities.supportsBracketedPaste) this.write(ENABLE_BRACKETED_PASTE);
    if (!this.started || this.draining || this.disconnected || this.generation !== generation) return;
    process.stdin.on("data", this.handleData);
    process.stdin.on("end", this.handleEnd);
    process.stdin.on("close", this.handleEnd);
    process.stdin.resume();
    if (!this.started || this.draining || this.disconnected || this.generation !== generation) return;
    // Ask for modifier reporting before the first keystroke: without it the
    // terminal cannot express Shift+Enter at all, and a bare Escape is
    // indistinguishable from the head of a sequence.
    if (this.capabilities.supportsBracketedPaste) {
      const statusQuery = process.stdout.isTTY ? this.status.beginProbe() : '';
      this.write(this.protocol.begin(statusQuery, KEYBOARD_REPLY_TIMEOUT_MS));
      if (!this.started || this.draining || this.disconnected || this.generation !== generation) return;
      if (process.stdout.isTTY) {
        this.write(QUERY_APPEARANCE);
        if (!this.started || this.draining || this.disconnected || this.generation !== generation) return;
      }
      this.keyboardTimer = setTimeout(() => { this.status.expireProbe(); this.protocol.expire(); }, KEYBOARD_REPLY_TIMEOUT_MS);
      this.keyboardTimer.unref?.();
    }
    if (this.input.enabled) {
      const ready = this.inputReady; this.inputReady = undefined; ready?.();
    }
  }

  waitForProtocol(): Promise<void> { return this.protocol.waitForReply(); }

  /** Which modifier-reporting protocol negotiation settled on. */
  get keyboardProtocol(): KeyboardProtocol {
    return this.protocol.keyboardProtocol;
  }

  /** Take over stdin after a deferred start and replay anything typed meanwhile. */
  enableInput(): void {
    if (this.input.enabled) return;
    this.input.enabled = true;
    this.rawOwned = acquireRawMode(this.rawOwned);
    if (this.started && process.stdin.isTTY) {
      const ready = this.inputReady; this.inputReady = undefined; ready?.();
    }
    this.input.flushDeferred();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.inputReady = undefined;
    if (this.keyboardTimer) clearTimeout(this.keyboardTimer);
    this.keyboardTimer = undefined;
    this.colorQuery?.cancel();
    this.colorQuery = undefined;
    this.input.retire();
    process.off("exit", this.handleExit);
    if (this.onResize) process.stdout.off("resize", this.onResize);
    process.stdin.off("data", this.handleData);
    process.stdin.off("end", this.handleEnd);
    process.stdin.off("close", this.handleEnd);
    this.restoreSync();
  }

  async drainInput(): Promise<void> {
    if (!this.started || !process.stdin.isTTY || this.disconnected) return;
    this.draining = true;
    if (this.keyboardTimer) clearTimeout(this.keyboardTimer);
    this.keyboardTimer = undefined;
    // Stop generating reports before waiting for those already in flight.
    this.writeSync(this.input.drain() + this.status.consumeClearSequence() + STOP_APPEARANCE);
    await drainInput(process.stdin);
  }

  /** Unbuffered restore for exit and crash handlers, where queued writes are lost. */
  restoreSync(): void {
    this.draining = true;
    this.input.retire();
    const clear = this.status.consumeClearSequence();
    this.writeSync(`${this.protocol.restore()}${clear}${RESTORE_MODES}`);
    this.rawOwned = releaseRawMode(this.rawOwned);
  }

  write(data: string, onWritten?: () => void): void {
    this.output.write(data, onWritten);
  }

  writeSync(data: string): void {
    this.output.writeSync(data);
  }

  setProgress(active: boolean): void {
    if (!this.started || this.draining || this.disconnected || !process.stdout.isTTY) return;
    this.status.setProgress(active, (data) => this.write(data));
  }

  setProgramStatus(status: ProgramStatus): void {
    if (!this.started || this.draining || this.disconnected || !process.stdout.isTTY) return;
    this.status.setProgramStatus(status, (data) => this.write(data));
  }

  queryTerminalColors(options: ColorQueryOptions = {}): Promise<TerminalColors> {
    this.colorQuery?.cancel();
    return new Promise((resolve) => {
      const query = new PendingColorQuery(resolve, options);
      this.colorQuery = query;
      if (!this.protocol.expectColors(query, options.timeoutMs)) {
        query.cancel();
        if (this.colorQuery === query) this.colorQuery = undefined;
        return;
      }
      this.write(TERMINAL_COLOR_QUERY);
    });
  }

  queryCellSize(): void {
    this.write(CELL_SIZE_QUERY);
  }

  bindProtocolInput(input: StdinBuffer): () => void {
    return this.protocol.bind(input);
  }


  private fireDisconnect(): void {
    if (this.disconnected) return;
    this.disconnected = true;
    this.input.retire();
    this.status.consumeClearSequence();
    this.onDisconnect?.();
  }
}

export const processTerminal = new Terminal();
