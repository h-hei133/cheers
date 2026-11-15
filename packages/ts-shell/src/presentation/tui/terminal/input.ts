import { StringDecoder } from 'node:string_decoder';
import { TerminalInputProtocol } from '../input/protocol.js';
import { TerminalStatusController } from '../input/programStatus.js';
import type { PendingColorQuery } from '../input/terminalColors.js';

interface InputHost {
  readonly write: (data: string) => void;
  readonly colors: () => PendingColorQuery | undefined;
}

/** UTF-8 decoding and deferred input share the terminal's one paste-aware protocol owner. */
export class TerminalInput {
  enabled = false;
  private active = false;
  private consumer?: (data: string) => void;
  private deferred: string[] = [];
  private decoder = new StringDecoder('utf8');
  readonly status = new TerminalStatusController();
  readonly protocol: TerminalInputProtocol;

  constructor(host: InputHost) {
    this.protocol = new TerminalInputProtocol({
      write: host.write,
      forward: data => this.forward(data),
      colorQuery: host.colors,
      programStatusReply: () => this.status.isProbePending ? () => this.status.confirmSupported(host.write) : undefined,
      programStatusProbeEnded: () => this.status.expireProbe(),
    });
  }

  start(consumer: (data: string) => void, enabled: boolean): void {
    this.active = true;
    this.consumer = consumer;
    this.enabled = enabled;
    this.decoder = new StringDecoder('utf8');
    this.protocol.start();
  }

  receive(chunk: Buffer | string): void {
    if (!this.active) return;
    let text: string;
    if (typeof chunk === 'string') {
      text = this.decoder.end() + chunk;
      this.decoder = new StringDecoder('utf8');
    } else text = this.decoder.write(chunk);
    if (!text) return;
    text = this.protocol.process(text);
    if (text) this.forward(text);
  }

  flushDeferred(): void {
    const buffered = this.deferred;
    this.deferred = [];
    for (const chunk of buffered) this.consumer?.(chunk);
  }

  retire(): void {
    this.active = false;
    this.protocol.retire();
  }

  drain(): string {
    this.active = false;
    this.deferred = [];
    return this.protocol.drain();
  }

  private forward(data: string): void {
    if (!this.active) return;
    if (!this.enabled) this.deferred.push(data);
    else this.consumer?.(data);
  }
}
