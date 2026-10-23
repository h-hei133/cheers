/** POST operations cannot resume. Drop only SSE resumption IDs; SDK retains framing. */
export function withoutResumptionIds(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  let pending = '';
  const decoder = new TextDecoder('utf-8', { fatal: true }); const encoder = new TextEncoder();
  const consume = (text: string, controller: TransformStreamDefaultController<Uint8Array>) => {
    pending += text;
    let ending: RegExpExecArray | null;
    while ((ending = /\r\n|\r(?!$)|\n/.exec(pending))) {
      const line = pending.slice(0, ending.index);
      pending = pending.slice(ending.index + ending[0].length);
      if (line !== 'id' && !line.startsWith('id:')) controller.enqueue(encoder.encode(line + ending[0]));
    }
  };
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) { consume(decoder.decode(chunk, { stream: true }), controller); },
    flush(controller) {
      consume(decoder.decode(), controller);
      const line = pending.endsWith('\r') ? pending.slice(0, -1) : pending;
      if (line !== 'id' && !line.startsWith('id:')) controller.enqueue(encoder.encode(pending));
    },
  }));
}

export function classifyEventStreamContentType(value: string | undefined): "event-stream" | "other" | "invalid-charset" {
  const [mediaType, ...parameters] = (value ?? '').split(';').map(part => part.trim());
  if (mediaType?.toLowerCase() !== 'text/event-stream') return 'other';
  const charset = parameters
    .map(parameter => /^charset\s*=\s*"?([^";]+)"?$/i.exec(parameter)?.[1])
    .find((candidate): candidate is string => candidate !== undefined);
  return charset === undefined || /^utf-?8$/i.test(charset) ? 'event-stream' : 'invalid-charset';
}
