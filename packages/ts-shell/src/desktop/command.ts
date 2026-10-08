import type { ExecutionService } from '../runtime/execution/types.js';
import { DesktopError, type DesktopEvidence } from './model.js';
import { desktopEnvironment, verifyDesktopConfig, type DesktopConfig, type NativeFile } from './config.js';

/** One desktop action deadline covers all native queries and input through the existing executor. */
export class DesktopScope {
  readonly controller = new AbortController();
  readonly signal = this.controller.signal;
  readonly stopped: Promise<void>;
  readonly evidence: DesktopEvidence = { state: 'completed', effect: 'none', cleanup: 'complete' };
  private readonly deadline = Date.now() + 30_000;
  private readonly timer = setTimeout(() => this.controller.abort(), 30_000);
  private readonly cancel = () => this.controller.abort();
  constructor(private readonly parent?: AbortSignal) {
    this.stopped = new Promise(resolve => { this.signal.addEventListener('abort', () => resolve(), { once: true }); });
    parent?.addEventListener('abort', this.cancel, { once: true }); if (parent?.aborted) this.cancel();
  }
  check(): void {
    if (Date.now() >= this.deadline) this.controller.abort();
    if (this.signal.aborted) { this.evidence.state = 'cancelled'; throw new DesktopError('cancelled', 'Desktop action cancelled; external effects are not rolled back.'); }
  }
  remaining(): number { this.check(); return Math.max(1, this.deadline - Date.now()); }
  dispose(): void { clearTimeout(this.timer); this.parent?.removeEventListener('abort', this.cancel); }
}

/** Fixed utilities/argv only; bounded stdout never becomes execution display output. */
export async function desktopCommand(service: ExecutionService, config: DesktopConfig, root: string, scope: DesktopScope, utility: NativeFile,
  args: readonly string[], maxBytes = 64 * 1024, effect = false, input?: Buffer): Promise<Buffer> {
  scope.check(); verifyDesktopConfig(config);
  const chunks: Buffer[] = []; let bytes = 0; let overflow = false; let stderrBytes = 0;
  if (effect) scope.evidence.effect = 'possible';
  const result = await service.runCommand({ operationKind: 'command.run', command: utility.path, args, cwd: root, workspaceRoot: root,
    authority: { mode: 'command-allowlisted', source: 'tool-runtime-approval', reason: 'Approved bounded native desktop operation.' },
    caller: 'desktop', reason: 'Execute the selected native desktop utility.', reportSafeCommand: `desktop:${effect ? 'input' : 'inspect'}`,
    abortSignal: scope.signal, timeoutMs: scope.remaining(), captureOutput: false, cleanupTreeOnExit: true, env: desktopEnvironment(config),
    onStdout: chunk => { bytes += chunk.length; if (bytes > maxBytes) { overflow = true; throw new Error(); } chunks.push(Buffer.from(chunk)); },
    onStderr: chunk => { stderrBytes += chunk.length; if (stderrBytes > 64 * 1024) { overflow = true; throw new Error(); } },
    ...(input ? { onStdin: pipe => { void pipe.write(input).then(() => pipe.end(), () => { scope.controller.abort(); pipe.end(); }); } } : {}),
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
