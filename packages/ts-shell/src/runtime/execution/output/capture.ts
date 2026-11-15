import { StringDecoder } from 'node:string_decoder';
import { createOutputSink, type OutputSinkSnapshot, type OutputSpill } from './sink.js';

export type CommandOutputStream = 'stdout' | 'stderr';
export type CommandOutputView = CommandOutputStream | 'combined';
export interface CommandOutputSnapshot extends OutputSinkSnapshot { readonly totalRawBytes: number }
export interface CommandOutputCapture {
  append(stream: CommandOutputStream, bytes: Buffer): void | Promise<void>;
  onChunk(listener: (stream: CommandOutputStream, bytes: Buffer) => void): () => void;
  finish(incomplete?: boolean): Promise<void>;
  snapshot(stream: CommandOutputView): CommandOutputSnapshot;
  source(stream: CommandOutputView): AsyncIterable<Uint8Array>;
  dispose(): Promise<void>;
  readonly complete: boolean;
}

/** Attached before spawn and retained by that process through foreground promotion. */
export function createCommandOutputCapture(options: {
  readonly limitBytes?: number;
  readonly openSpill?: () => Promise<OutputSpill>;
  readonly combinedOutput?: boolean;
} = {}): CommandOutputCapture {
  const make = () => ({ decoder: new StringDecoder('utf8'), totalRawBytes: 0,
    sink: createOutputSink({ capture: true, limitBytes: options.limitBytes ?? 100 * 1024, label: 'command',
      ...(options.openSpill ? { openSpill: options.openSpill } : {}) }) });
  const streams = { stdout: make(), stderr: make() };
  const combined = options.combinedOutput ? make() : undefined;
  const states = [...Object.values(streams), ...(combined ? [combined] : [])];
  const selected = (view: CommandOutputView) => {
    const state = view === 'combined' ? combined : streams[view];
    if (!state) throw new Error('Combined command output was not captured.');
    return state;
  };
  const listeners = new Set<(stream: CommandOutputStream, bytes: Buffer) => void>();
  let finished = false;
  let sealed = false;
  let incomplete = false;
  let finishing: Promise<void> | undefined;

  return {
    append(stream, bytes) {
      if (finished) throw new Error('Cannot append to finished command output.');
      const state = streams[stream];
      state.totalRawBytes += bytes.length;
      const text = state.decoder.write(bytes);
      const pending = state.sink.append(text);
      if (combined) combined.totalRawBytes += bytes.length;
      const merged = combined?.sink.append(text);
      for (const listener of listeners) listener(stream, bytes);
      return pending || merged ? Promise.all([pending, merged]).then(() => {}) : undefined;
    },
    onChunk(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    finish(outputIncomplete = false) {
      incomplete ||= outputIncomplete;
      if (finishing) return finishing;
      finished = true;
      listeners.clear();
      finishing = settleCapture([(async () => {
        for (const state of Object.values(streams)) {
          const tail = state.decoder.end();
          if (tail) { await state.sink.append(tail); await combined?.sink.append(tail); }
        }
        await Promise.all(states.map(state => state.sink.close()));
      })()]).then(() => { sealed = true; }).catch(error => {
        incomplete = true;
        for (const state of states) state.sink.abort?.();
        throw error;
      });
      return finishing;
    },
    snapshot(stream) { const state = selected(stream); return { ...state.sink.snapshot(), totalRawBytes: state.totalRawBytes }; },
    async *source(stream) {
      if (!finished || incomplete) throw new Error('Complete command output is unavailable.');
      await finishing;
      yield* selected(stream).sink.source();
    },
    dispose() { return settleCapture(states.map(state => state.sink.dispose())); },
    get complete() { return sealed && !incomplete && states.every(state => state.sink.complete); },
  };
}

/** A stalled storage owner cannot indefinitely retain a completed command. */
async function settleCapture(pending: readonly Promise<void>[]): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([Promise.all(pending), new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Command output settlement is unavailable.')), 2000);
    })]);
  } finally { clearTimeout(timer); }
}
