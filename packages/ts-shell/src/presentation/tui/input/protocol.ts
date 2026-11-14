import { KeyboardNegotiation, type KeyboardProtocol } from './keyboardProtocol.js';
import { PendingColorQuery, TerminalProtocolReader, consumeTerminalReply } from './terminalColors.js';
import type { StdinBuffer } from './stdinBuffer.js';

interface ProtocolHost {
  readonly write: (data: string) => void;
  readonly forward: (data: string) => void;
  readonly colorQuery: () => PendingColorQuery | undefined;
  readonly programStatusReply: () => (() => void) | undefined;
}

/** Device-generation ownership for reports framed by the host's stdin parser. */
export class TerminalInputProtocol {
  private keyboard = new KeyboardNegotiation();
  private reader: TerminalProtocolReader;
  private input?: StdinBuffer;
  private releaseInput?: () => void;
  private started = false;
  private draining = false;

  constructor(private readonly host: ProtocolHost) {
    this.reader = this.createReader();
  }

  start(): void {
    this.started = true;
    this.draining = false;
    this.keyboard = new KeyboardNegotiation();
    this.reader.dispose();
    this.reader = this.createReader();
  }

  begin(): string { return this.keyboard.begin(); }

  get keyboardProtocol(): KeyboardProtocol { return this.keyboard.active; }

  process(chunk: string): string {
    return this.releaseInput ? chunk : this.reader.process(chunk, this.host.colorQuery(), this.host.programStatusReply());
  }

  expire(): void {
    const owner = this.keyboard;
    const pending = owner.pending;
    const matches = (prefix: string): boolean => pending && owner.isReplyPrefix(prefix) && !prefix.startsWith('\x1b[?997;');
    const residual = `${owner.expire()}${this.reader.flushPartial(matches)}`;
    this.input?.flushPartial(matches);
    if (residual) this.forward(residual);
  }

  retire(): void {
    this.started = false;
    this.input?.flushPartial(prefix => this.keyboard.isReplyPrefix(prefix) && !prefix.startsWith('\x1b[?997;'), true);
    this.reader.flush();
    this.reader.dispose();
  }

  drain(): string {
    this.draining = true;
    this.reader.flushPartial(() => true, true);
    this.input?.flushPartial(() => true, true);
    return this.keyboard.stop();
  }

  restore(): string { return this.keyboard.stop(); }

  bind(input: StdinBuffer): () => void {
    this.releaseInput?.();
    this.reader.dispose();
    this.input = input;
    const releaseColor = input.onColorReply(color => {
      if (this.started && !this.draining) this.host.colorQuery()?.consumeColor(color);
    });
    const releaseSequence = input.onSequence((sequence, pasted) => {
      if (!this.started || this.draining || pasted) return;
      if (this.consumeKeyboardReply(sequence)) return true;
      if (/^\x1b\](?:10|11|4);/.test(sequence)) return;
      return consumeTerminalReply(sequence, this.host.colorQuery(), this.host.programStatusReply());
    });
    const releaseHold = input.onPartialHold(prefix => this.holdsSequence(prefix));
    const owned = (): void => {
      releaseSequence(); releaseColor(); releaseHold();
      if (this.releaseInput === owned) { this.releaseInput = undefined; this.input = undefined; }
    };
    this.releaseInput = owned;
    return owned;
  }

  private createReader(): TerminalProtocolReader {
    return new TerminalProtocolReader(data => this.forward(data),
      sequence => this.consumeKeyboardReply(sequence), prefix => this.holdsSequence(prefix));
  }

  private consumeKeyboardReply(sequence: string): boolean {
    if (!this.started || this.draining) return false;
    const step = this.keyboard.consumeSequence(sequence);
    if (step.write) this.host.write(step.write);
    return step.forward.length === 0;
  }

  private holdsSequence(prefix: string): boolean {
    return this.started && !this.draining && this.keyboard.holdsSequence(prefix);
  }

  private forward(data: string): void {
    if (this.started && !this.draining) this.host.forward(data);
  }
}
