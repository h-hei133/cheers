/**
 * Program Status Protocol (OSC 7501) and terminal progress indicator (OSC 9;4).
 *
 * A program reports whether it is idle, working, blocked on the user, done,
 * or failed via OSC 7501, and emits indeterminate progress via OSC 9;4;3.
 */

export type ProgramStatusState = "idle" | "working" | "blocked" | "done" | "error" | "clear";
export type ProgramStatusBlockedKind = "permission" | "question" | "auth";

export interface ProgramStatus {
  /** `clear` removes the status instead of reporting one. */
  readonly state: ProgramStatusState;
  /** Stable program name, `[A-Za-z0-9_.+-]{1,32}`. Other values are omitted. */
  readonly app?: string;
  /** What a blocked program waits for. Omitted for other states. */
  readonly kind?: ProgramStatusBlockedKind;
  /** One human-readable line. Control characters become spaces; truncated to 2048 UTF-8 bytes. */
  readonly message?: string;
}

/** Feature detection query; a supporting terminal echoes the same body. */
export const PROGRAM_STATUS_QUERY = "\x1b]7501;?\x1b\\";

/** Indeterminate terminal progress bar (ConEmu / Windows Terminal / Ghostty / iTerm2). */
export const TERMINAL_PROGRESS_ACTIVE = "\x1b]9;4;3\x07";
export const TERMINAL_PROGRESS_CLEAR = "\x1b]9;4;0\x07";
export const TERMINAL_PROGRESS_KEEPALIVE_MS = 1000;

const APP_PATTERN = /^[A-Za-z0-9_.+-]{1,32}$/;
const REPLY_PATTERN = /^\x1b\]7501;\?(?::[^\x07\x1b]*)?(?:\x07|\x1b\\)$/;
const MAX_MESSAGE_BYTES = 2048;

export function isProgramStatusReply(sequence: string): boolean {
  return REPLY_PATTERN.test(sequence);
}

function replaceControlCharacters(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    out += code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f) ? " " : text[i];
  }
  return out;
}

function truncateUtf8(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  let bytes = 0;
  let end = 0;
  for (const ch of text) {
    const size = Buffer.byteLength(ch, "utf8");
    if (bytes + size > maxBytes) break;
    bytes += size;
    end += ch.length;
  }
  return text.slice(0, end);
}

/** Encode an OSC 7501 status report. */
export function formatProgramStatus(status: ProgramStatus): string {
  const pairs = [`state=${status.state}`];
  if (status.app !== undefined && APP_PATTERN.test(status.app)) {
    pairs.push(`app=${status.app}`);
  }
  if (status.state === "blocked" && status.kind) {
    pairs.push(`kind=${status.kind}`);
  }
  const message = truncateUtf8(replaceControlCharacters(status.message ?? "").trim(), MAX_MESSAGE_BYTES);
  if (message) {
    pairs.push(`msg=${Buffer.from(message, "utf8").toString("base64")}`);
  }
  return `\x1b]7501;${pairs.join(":")}\x1b\\`;
}

/** Tracks OSC 9;4 progress keepalives and OSC 7501 program-status probe/buffering. */
export class TerminalStatusController {
  private progressActive = false;
  private progressTimer: ReturnType<typeof setInterval> | undefined;
  private queryPending = false;
  private supported = false;
  private statusActive = false;
  private pendingStatus: ProgramStatus | undefined;

  beginProbe(write: (data: string) => void): void {
    this.queryPending = true;
    this.supported = false;
    this.pendingStatus = undefined;
    write(PROGRAM_STATUS_QUERY);
  }

  expireProbe(): void {
    this.queryPending = false;
    this.pendingStatus = undefined;
  }

  confirmSupported(write: (data: string) => void): void {
    this.supported = true;
    this.queryPending = false;
    const queued = this.pendingStatus;
    this.pendingStatus = undefined;
    if (queued) this.setProgramStatus(queued, write);
  }

  get isProbePending(): boolean {
    return this.queryPending;
  }

  setProgress(active: boolean, write: (data: string) => void): void {
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = undefined;
    }
    if (active) {
      this.progressActive = true;
      write(TERMINAL_PROGRESS_ACTIVE);
      this.progressTimer = setInterval(() => write(TERMINAL_PROGRESS_ACTIVE), TERMINAL_PROGRESS_KEEPALIVE_MS);
      this.progressTimer.unref?.();
      return;
    }
    if (this.progressActive) {
      this.progressActive = false;
      write(TERMINAL_PROGRESS_CLEAR);
    }
  }

  setProgramStatus(status: ProgramStatus, write: (data: string) => void): void {
    if (this.supported) {
      this.statusActive = status.state !== "clear";
      write(formatProgramStatus(status));
      return;
    }
    if (this.queryPending) {
      this.pendingStatus = status.state === "clear" ? undefined : status;
    }
  }

  consumeClearSequence(): string {
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = undefined;
    }
    const clearProgress = this.progressActive ? TERMINAL_PROGRESS_CLEAR : "";
    this.progressActive = false;
    const clearStatus = this.statusActive ? formatProgramStatus({ state: "clear", app: "cheers" }) : "";
    this.statusActive = false;
    return `${clearProgress}${clearStatus}`;
  }
}
