/** The CLI lifetime owns these temporary taps; original writes and callbacks are forwarded unchanged. */
export function observeTerminalStreams(stdout: NodeJS.WriteStream, stderr: NodeJS.WriteStream,
  output: (data: Buffer | string, stream: 'stdout' | 'stderr') => void, resize: () => void): () => void {
  const releases: (() => void)[] = [];
  for (const [stream, name] of [[stdout, 'stdout'], [stderr, 'stderr']] as const) {
    const original = stream.write;
    const tapped: typeof original = function (this: typeof stream, ...args: [string | Uint8Array, (BufferEncoding | ((error?: Error | null) => void))?, ((error?: Error | null) => void)?]) {
      const result = Reflect.apply(original, this, args);
      const data = args[0]; output(typeof data === 'string' ? Buffer.from(data, typeof args[1] === 'string' ? args[1] : 'utf8') : Buffer.from(data), name); return result;
    };
    stream.write = tapped;
    releases.push(() => { if (stream.write === tapped) stream.write = original; });
  }
  stdout.on('resize', resize); releases.push(() => stdout.off('resize', resize));
  return () => { for (const release of releases.reverse()) release(); };
}
