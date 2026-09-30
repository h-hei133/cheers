/**
 * Keyboard protocol negotiation.
 *
 * Legacy terminals encode Shift+Enter, Ctrl+Enter, and a bare Escape
 * indistinguishably from Enter and from the head of an escape sequence: the
 * modifier is simply not transmitted. No amount of parsing recovers it. Two
 * protocols do transmit it, and both must be asked for:
 *
 * - The enhanced keyboard protocol (`CSI ? u` / `CSI > N u`), which reports every
 *   key as `CSI code ; modifiers u`.
 * - `modifyOtherKeys` level 2 (`CSI > 4 ; 2 m`), the xterm-family fallback, which
 *   reports modified keys as `CSI 27 ; modifiers ; code ~`.
 *
 * Support is decided by reply, not by a timeout: the query is followed by a
 * primary device attributes request, which every terminal answers. A DA1 reply
 * arriving with no enhanced-protocol reply proves the terminal does not speak it,
 * so the fallback engages at that moment rather than after a guessed delay.
 */

const QUERY_ENHANCED = "\x1b[?u";
const QUERY_DEVICE_ATTRIBUTES = "\x1b[c";

/** Disambiguate escape codes and report base-layout keys, without event types. */
const ENABLE_ENHANCED = "\x1b[>5u";
/** Windows console drops Shift+letter when alternate-key reporting is on. */
const ENABLE_ENHANCED_MINIMAL = "\x1b[>1u";
const DISABLE_ENHANCED = "\x1b[<u";

const ENABLE_MODIFY_OTHER_KEYS = "\x1b[>4;2m";
const DISABLE_MODIFY_OTHER_KEYS = "\x1b[>4;0m";

const ENHANCED_REPLY = /^\x1b\[\?(\d*)u/;
const DEVICE_ATTRIBUTES_REPLY = /^\x1b\[\?[\d;]*c/;

/**
 * A partial reply is only held once it has committed to being one. `ESC` and
 * `ESC [` are overwhelmingly more likely to be a keypress — Escape itself, or the
 * head of an arrow — and holding those swallows the key outright when no reply is
 * ever coming.
 */
const HELD_REPLY_PREFIX = /^\x1b\[\?[\d;]*$/;

/** Longest reply prefix worth holding while waiting for the rest of it. */
const MAX_HELD_REPLY = 32;

export type KeyboardProtocol = "enhanced" | "modify-other-keys" | "legacy";

export interface ProtocolStep {
  /** Input to hand to the application, with any negotiation reply removed. */
  readonly forward: string;
  /** Sequence to write to the device in response, if any. */
  readonly write: string;
}

export class KeyboardNegotiation {
  private held = "";
  private settled = false;
  private protocol: KeyboardProtocol = "legacy";
  private readonly minimal: boolean;

  /** `minimal` picks the reduced enhancement level required by Windows consoles. */
  constructor(minimal = process.platform === "win32") {
    this.minimal = minimal;
  }

  /** Sequences that open negotiation; write these once at startup. */
  get query(): string {
    return `${QUERY_ENHANCED}${QUERY_DEVICE_ATTRIBUTES}`;
  }

  /** The protocol in force once negotiation settled. */
  get active(): KeyboardProtocol {
    return this.protocol;
  }

  /** Whether replies are still expected, so input must be inspected. */
  get pending(): boolean {
    return !this.settled;
  }

  /** Sequences that restore the device; write these on shutdown. */
  get restore(): string {
    if (this.protocol === "enhanced") return DISABLE_ENHANCED;
    if (this.protocol === "modify-other-keys") return DISABLE_MODIFY_OTHER_KEYS;
    return "";
  }

  /** Disable once: a second pop could undo the parent program's protocol. */
  stop(): string {
    const restore = this.restore;
    this.protocol = "legacy";
    this.settled = true;
    this.held = "";
    return restore;
  }

  /**
   * Inspect one input chunk during negotiation, stripping any reply so it never
   * reaches the editor as typed text.
   */
  consume(chunk: string): ProtocolStep {
    if (this.settled) return { forward: chunk, write: "" };
    const buffer = this.held + chunk;
    this.held = "";
    let forward = "";
    let write = "";
    let index = 0;
    while (index < buffer.length) {
      if (buffer.charCodeAt(index) !== 0x1b) {
        forward += buffer[index];
        index += 1;
        continue;
      }
      const tail = buffer.slice(index);
      const enhanced = ENHANCED_REPLY.exec(tail);
      if (enhanced) {
        write += this.settle("enhanced");
        index += enhanced[0].length;
        continue;
      }
      const attributes = DEVICE_ATTRIBUTES_REPLY.exec(tail);
      if (attributes) {
        write += this.settle("modify-other-keys");
        index += attributes[0].length;
        continue;
      }
      // A reply split across chunks: hold the prefix rather than forwarding it,
      // but only while it could still become one.
      if (this.couldBecomeReply(tail)) {
        this.held = tail;
        return { forward, write };
      }
      forward += buffer[index];
      index += 1;
    }
    return { forward, write };
  }

  /** Release anything held, treating it as ordinary input. */
  flush(): string {
    const held = this.held;
    this.held = "";
    return held;
  }

  /**
   * Give up waiting. A terminal that answers neither query speaks neither
   * protocol, and inspecting every keystroke forever on the chance a reply is
   * still coming costs work and risks holding a key that will never be claimed.
   */
  expire(): string {
    if (this.settled) return "";
    this.settled = true;
    this.protocol = "legacy";
    return this.flush();
  }

  private settle(protocol: KeyboardProtocol): string {
    if (this.settled) return "";
    this.settled = true;
    if (protocol === "enhanced") {
      this.protocol = "enhanced";
      return this.minimal ? ENABLE_ENHANCED_MINIMAL : ENABLE_ENHANCED;
    }
    this.protocol = "modify-other-keys";
    return ENABLE_MODIFY_OTHER_KEYS;
  }

  /** Whether `tail` is a prefix of a reply this negotiation is waiting for. */
  private couldBecomeReply(tail: string): boolean {
    if (tail.length > MAX_HELD_REPLY) return false;
    return HELD_REPLY_PREFIX.test(tail);
  }
}
