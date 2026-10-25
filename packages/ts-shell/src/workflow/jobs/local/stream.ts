import type { StringDecoder } from 'node:string_decoder';
import type { OutputSink } from './output.js';
import type { BackgroundTask, LocalJournalPort } from './model.js';

const PENDING_OUTPUT_LIMIT = 65536;

/** Output state shared by a live child and its eventual journal publication. */
export interface OperationOutput {
  readonly sink: OutputSink;
  readonly stdout: StringDecoder;
  readonly stderr: StringDecoder;
  readonly pendingOutput: Buffer[];
  pendingBytes: number;
  pendingTruncated: boolean;
}

/** Retain a bounded original prefix until the existing child is promoted. */
export function appendAdoptedOutput(
  id: string,
  text: string,
  operation: OperationOutput,
  tasks: Map<string, BackgroundTask>,
  journal: LocalJournalPort | undefined,
  promoted: boolean,
): void {
  const bytes = Buffer.from(text);
  if (promoted) journal?.output(id, 'stdout', bytes);
  else {
    const remaining = PENDING_OUTPUT_LIMIT - operation.pendingBytes;
    if (remaining > 0) {
      const prefix = utf8Prefix(bytes, remaining);
      if (prefix.length > 0) {
        operation.pendingOutput.push(prefix);
        operation.pendingBytes += prefix.length;
      }
      if (prefix.length < bytes.length) operation.pendingTruncated = true;
    } else {
      operation.pendingTruncated = true;
    }
  }
  void operation.sink.append(text);
  tasks.set(id, { ...tasks.get(id)!, output: operation.sink.tail, outputTruncated: operation.sink.truncated,
    get outputPath() { return operation.sink.spillPath; } });
}

/** Journal original bytes before decoding the live text projection. */
export function appendOutput(
  id: string,
  stream: 'stdout' | 'stderr',
  bytes: Buffer,
  operation: OperationOutput,
  tasks: Map<string, BackgroundTask>,
  journal: LocalJournalPort | undefined,
): void | Promise<void> {
  journal?.output(id, stream, bytes);
  const pending = operation.sink.append(operation[stream].write(bytes));
  tasks.set(id, { ...tasks.get(id)!, output: operation.sink.tail, outputTruncated: operation.sink.truncated,
    get outputPath() { return operation.sink.spillPath; } });
  return pending;
}

/** Keep a prefix that ends on a complete UTF-8 code point. */
function utf8Prefix(bytes: Buffer, maxBytes: number): Buffer {
  if (bytes.length <= maxBytes) return bytes;
  let end = Math.max(0, maxBytes);
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end);
}
