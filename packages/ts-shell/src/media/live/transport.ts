import WebSocket from 'ws';
import { liveLimits } from './model.js';
import { decodeLiveEvent, type LiveEvent } from './protocol.js';

export interface LiveTarget { readonly url: string; readonly headers: Readonly<Record<string, string>> }
export class LiveTransport {
  private socket?: WebSocket;
  private ended = false;
  private events = 0;
  constructor(readonly target: LiveTarget, readonly admission: () => string | undefined,
    readonly event: (event: LiveEvent) => void, readonly failure: (reason: string) => void) {}
  open(start: object): void {
    if (this.ended || this.socket || this.admission()) throw new Error('Voice connection admission changed.');
    const socket = this.socket = new WebSocket(this.target.url, { headers: this.target.headers, followRedirects: false,
      perMessageDeflate: false, maxPayload: liveLimits.messageBytes, handshakeTimeout: 5000 });
    socket.on('open', () => { try { this.send({ type: 'session.start', session: start }); } catch { this.failure('Voice startup was refused or disconnected.'); } });
    socket.on('message', (raw, binary) => {
      if (this.ended) return;
      try {
        if (binary || ++this.events > liveLimits.events) throw new Error('Voice protocol event limit exceeded.');
        const data = Array.isArray(raw) ? Buffer.concat(raw) : Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        this.event(decodeLiveEvent(data));
      } catch { this.failure('Voice protocol was rejected or exceeded a limit.'); }
    });
    socket.on('error', () => { if (!this.ended) this.failure('Voice provider connection failed.'); });
    socket.on('close', () => { if (!this.ended) this.failure('Voice connection closed before final usage.'); });
  }
  send(event: object, closing = false): void {
    const socket = this.socket; const encoded = JSON.stringify(event);
    if (this.ended || !socket || socket.readyState !== WebSocket.OPEN || !closing && this.admission()) throw new Error('Voice send admission changed.');
    if (Buffer.byteLength(encoded) > liveLimits.messageBytes || socket.bufferedAmount + Buffer.byteLength(encoded) > liveLimits.transportBytes)
      throw new Error('Voice transport backlog exceeded.');
    socket.send(encoded, error => { if (error && !this.ended) this.failure('Voice send failed.'); });
  }
  close(): void { this.ended = true; this.socket?.terminate(); }
}
