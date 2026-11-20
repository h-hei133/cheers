import { DesktopError } from './model.js';
import { desktopEnvironment, verifyDesktopConfig } from './config.js';
import type { DesktopConfig, DesktopScope, NativeFile, RunNative } from '../api.d.ts';

/** Fixed utilities/argv only; bounded stdout never becomes execution display output. */
export async function desktopCommand(run: RunNative, config: DesktopConfig, root: string, scope: DesktopScope, utility: NativeFile,
  args: readonly string[], maxBytes = 64 * 1024, effect = false, input?: Buffer): Promise<Buffer> {
  scope.check(); verifyDesktopConfig(config);
  const chunks: Buffer[] = []; let bytes = 0; let overflow = false; let stderrBytes = 0;
  if (effect) scope.evidence.effect = 'possible';
  const result = await run({ command: utility.path, args, cwd: root, effect,
    signal: scope.signal, timeoutMs: scope.remaining(), env: desktopEnvironment(config),
    onStdout: chunk => { bytes += chunk.length; if (bytes > maxBytes) { overflow = true; throw new Error(); } chunks.push(Buffer.from(chunk)); },
    onStderr: chunk => { stderrBytes += chunk.length; if (stderrBytes > 64 * 1024) { overflow = true; throw new Error(); } },
    ...(input ? { onStdin: pipe => { void pipe.write(input).then(() => pipe.end(), () => { scope.cancel(); pipe.end(); }); } } : {}),
  });
  if (result.terminationFailed) {
    scope.evidence.cleanup = 'unknown';
    if (scope.signal.aborted) scope.evidence.state = 'cancelled';
    throw new DesktopError('cleanup', 'Native process cleanup is unconfirmed. Desktop control remains blocked.');
  }
  if (result.status === 'completed' && result.exitCode === 0 && effect) scope.evidence.effect = 'confirmed';
  scope.check();
  if (overflow) throw new DesktopError('limit', 'Native desktop output exceeded its byte budget.');
  if (result.status !== 'completed' || result.exitCode !== 0) throw new DesktopError(scope.evidence.effect === 'none' ? 'unavailable' : 'command',
    'Native desktop access failed; display, system permission or utility support is unavailable.');
  return Buffer.concat(chunks, bytes);
}
