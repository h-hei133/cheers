import type { StringDecoder } from 'node:string_decoder';
import type { OutputSink } from './output.js';
import type { BackgroundTask, LocalJournalPort } from './model.js';
import type { CommandOutputCapture, CommandOutputStream } from '../../../runtime/execution/output/capture.js';

const PENDING_OUTPUT_LIMIT = 65536;

/** Output state shared by a live child and its eventual journal publication. */
export interface OperationOutput {
  readonly sink: OutputSink;
  readonly stdout: StringDecoder;
  readonly stderr: StringDecoder;
  readonly pendingOutput: { readonly stream: CommandOutputStream; readonly bytes: Buffer }[];
  readonly pendingBytes: Record<CommandOutputStream, number>;
  readonly pendingTruncated: Record<CommandOutputStream, boolean>;
  readonly capture?: CommandOutputCapture;
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
  retainAdoptedBytes(id, 'stdout', bytes, operation, journal, promoted);
  void operation.sink.append(text);
  tasks.set(id, { ...tasks.get(id)!, output: operation.sink.tail, outputTruncated: operation.sink.truncated,
    get outputPath() { return operation.sink.spillPath; } });
}

/** A shared pre-spawn capture already consumed these bytes; only journal and project them here. */
export function observeCapturedOutput(id: string, stream: CommandOutputStream, bytes: Buffer, operation: OperationOutput,
  tasks: Map<string, BackgroundTask>, journal: LocalJournalPort | undefined, promoted: boolean): void {
  retainAdoptedBytes(id, stream, bytes, operation, journal, promoted);
  tasks.set(id, { ...tasks.get(id)!, output: operation.sink.tail, outputTruncated: operation.sink.truncated });
}

function retainAdoptedBytes(id: string, stream: CommandOutputStream, bytes: Buffer, operation: OperationOutput,
  journal: LocalJournalPort | undefined, promoted: boolean): void {
  if (promoted) journal?.output(id, stream, bytes);
  else {
    const remaining = PENDING_OUTPUT_LIMIT - operation.pendingBytes[stream];
    if (remaining > 0) {
      // Typed streams retain original bytes, including an unfinished UTF-8 code
      // point. Legacy decoded callbacks already arrive at a character boundary.
      const prefix = operation.capture ? bytes.subarray(0, remaining) : utf8Prefix(bytes, remaining);
      if (prefix.length > 0) {
        operation.pendingOutput.push({ stream, bytes: Buffer.from(prefix) });
        operation.pendingBytes[stream] += prefix.length;
      }
      if (prefix.length < bytes.length) operation.pendingTruncated[stream] = true;
    } else {
      operation.pendingTruncated[stream] = true;
    }
  }
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
