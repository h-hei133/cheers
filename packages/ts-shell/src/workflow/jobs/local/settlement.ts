import type { OutputSink } from './output.js';
/** A stalled spill cannot indefinitely hold shutdown or imply a complete artifact. */
export async function closeOutput(sink: OutputSink, finalText = ''): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([(async () => { if (finalText) await sink.append(finalText); await sink.close(); })(), new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Local output settlement is unavailable.')), 2000);
    })]);
  } catch (error) { sink.abort?.(); throw error; }
  finally { clearTimeout(timer); }
}
