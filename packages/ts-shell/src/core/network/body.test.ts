import { PassThrough } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { expect, it, vi } from 'vitest';
import { responseBody } from './body.js';

vi.mock('node:zlib', async () => {
  const { Transform } = await vi.importActual<typeof import('node:stream')>('node:stream');
  return {
    createBrotliDecompress: () => new Transform(),
    createGunzip: () => new Transform({
      transform(_chunk, _encoding, callback) {
        callback(null, Buffer.alloc(512, 65));
        queueMicrotask(() => this.destroy(new Error('decoder cleanup failed')));
      },
    }),
    createInflate: () => new Transform(),
  };
});

it('preserves the decoded response limit when decoder cleanup also fails', async () => {
  const message = new PassThrough() as PassThrough & { headers: IncomingMessage['headers'] };
  message.headers = { 'content-encoding': 'gzip' };

  const body = responseBody(message as IncomingMessage, 256);
  message.end(Buffer.from('compressed fixture'));

  await expect(new Response(body).text()).rejects.toMatchObject({ code: 'response_limit' });
});
