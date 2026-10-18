import { PassThrough, type Readable, pipeline } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

/** Fetch decodes response bytes, including error responses, while retaining wire headers. */
export function decodedBody(body: Readable, headers: Headers, signal: AbortSignal): ReadableStream<Uint8Array> {
  const encodings = (headers.get('content-encoding') ?? '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
  if (encodings.length > 5) {
    discardBody(body);
    throw new TypeError('Too many response content encodings');
  }
  const supported = encodings.every(encoding => ['gzip', 'x-gzip', 'deflate', 'br'].includes(encoding));
  if (!supported || encodings.length === 0) return webBody(body, signal);
  const decoders = encodings.reverse().map(encoding => encoding === 'br' ? createBrotliDecompress()
    : encoding === 'deflate' ? createInflate() : createGunzip());
  const output = new PassThrough();
  const result = webBody(output, signal);
  // pipeline owns propagation and destruction in both directions, including reader cancellation.
  pipeline([body, ...decoders, output], () => {});
  return result;
}

function webBody(body: Readable, signal: AbortSignal): ReadableStream<Uint8Array> {
  const iterator = body[Symbol.asyncIterator]();
  let settled = false;
  let sink: ReadableStreamDefaultController<Uint8Array>;
  const fail = (error: unknown) => {
    if (settled) return;
    settled = true;
    signal.removeEventListener('abort', abort);
    sink.error(signal.aborted ? signal.reason : new TypeError('terminated', { cause: error }));
  };
  const abort = () => { fail(signal.reason); body.destroy(); };
  return new ReadableStream({
    start(controller) {
      sink = controller;
      // Invalidate already queued bytes even when backpressure prevents another pull.
      // Keep the guarded listener through native destruction so late errors are consumed.
      body.on('error', fail);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    },
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (settled) return;
        if (next.done) {
          settled = true;
          signal.removeEventListener('abort', abort);
          controller.close();
        } else controller.enqueue(next.value);
      } catch (error) { fail(error); }
    },
    async cancel() {
      settled = true;
      signal.removeEventListener('abort', abort);
      body.destroy();
      try { await iterator.return?.(); } catch { /* Cancellation already destroyed the source. */ }
    },
  // Fetch cancellation remains active until consumption observes EOF. Avoid
  // prefetching EOF into a closed native stream while unread bytes remain queued.
  }, { highWaterMark: 0 });
}

export function discardBody(body: Readable): void {
  body.on('error', () => {});
  body.destroy();
}
