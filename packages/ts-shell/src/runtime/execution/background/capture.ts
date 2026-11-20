import type { CommandOutputCapture } from '../output/capture.js';
import type { OutputSink } from '../output/sink.js';

/** Read-only job projection over the exact capture attached before the process spawned. */
export function capturedOutputSink(capture: CommandOutputCapture): OutputSink {
  return {
    append() { throw new Error('Captured command output already has a stream owner.'); },
    get tail() {
      const bytes = Buffer.from(capture.snapshot('stdout').tail + capture.snapshot('stderr').tail);
      let start = Math.max(0, bytes.length - 65536);
      while (start < bytes.length && (bytes[start]! & 0xc0) === 0x80) start++;
      return bytes.subarray(start).toString('utf8');
    },
    get truncated() {
      return capture.snapshot('stdout').totalBytes + capture.snapshot('stderr').totalBytes > 65536;
    },
    get spillPath() { return undefined; },
    close() { return capture.finish(); },
  };
}
