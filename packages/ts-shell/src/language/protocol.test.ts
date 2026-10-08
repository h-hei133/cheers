import { describe, expect, it, vi } from 'vitest';
import { languageLimits } from './contract.js';
import { MessageFrames, RpcConnection } from './protocol.js';

function frame(value: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(value));
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]);
}

describe('language Content-Length protocol', () => {
  it('counts bytes and parses fragmented UTF-8 and multiple messages exactly once', () => {
    const receive = vi.fn(); const stream = new MessageFrames(receive);
    const messages = [{ jsonrpc: '2.0', id: 1, result: 'héllo 🌍' }, { jsonrpc: '2.0', id: 2, result: null }];
    for (const byte of Buffer.concat(messages.map(frame))) stream.push(Buffer.from([byte]));
    expect(receive.mock.calls.map(([value]) => value)).toEqual(messages);
  });

  it.each(['Content-Length: -1\r\n\r\n', 'Content-Length: 1\r\nContent-Length: 1\r\n\r\n', `Content-Length: ${languageLimits.frameBytes + 1}\r\n\r\n`])('refuses malformed or oversized frames without exposing their body', header => {
    expect(() => new MessageFrames(() => {}).push(Buffer.from(header))).toThrow(/Language server/);
  });

  it('cancels timed out requests and ignores their late responses', async () => {
    const sent: Buffer[] = [];
    const rpc = new RpcConnection({ write: async bytes => { sent.push(bytes); }, end() {} }, () => {});
    await expect(rpc.request('test/stall', {}, undefined, 10)).rejects.toMatchObject({ kind: 'timeout' });
    rpc.frames.push(frame({ jsonrpc: '2.0', id: 1, result: 'late' }));
    expect(Buffer.concat(sent).toString()).toContain('$/cancelRequest');
    rpc.close(new Error('done'));
  });

  it('bounds pending requests and settles every pending call on a crash', async () => {
    const rpc = new RpcConnection({ write: async () => {}, end() {} }, () => {});
    const requests = Array.from({ length: languageLimits.pending }, () => rpc.request('stall', {}).catch(error => error));
    await expect(rpc.request('overflow', {})).rejects.toMatchObject({ kind: 'unavailable' });
    rpc.close(new Error('crashed'));
    expect((await Promise.all(requests)).every(error => error.message === 'crashed')).toBe(true);
  });
});
