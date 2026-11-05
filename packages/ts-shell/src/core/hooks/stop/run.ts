import { spawn } from 'node:child_process';
import { planSandboxedCommand } from '../../../sandbox/osSandbox.js';
import type { HookDecision, StopPayload } from '../types.js';
import { normalizeStopResult, stopUnknown } from './result.js';
import { stopDeadline } from './deadline.js';

/** Late handler/approval results cannot resume a cancelled or expired check. */
export async function boundedStopOperation(
  operation: () => Promise<HookDecision>, timeoutMs: number, signal?: AbortSignal,
): Promise<HookDecision> {
  if (signal?.aborted) return stopUnknown('cancelled');
  let cancelDeadline: () => void = () => {};
  let abort: () => void = () => {};
  const boundary = new Promise<HookDecision>(resolve => {
    cancelDeadline = stopDeadline(timeoutMs, () => resolve(stopUnknown('timeout')));
    abort = () => resolve(stopUnknown('cancelled'));
    signal?.addEventListener('abort', abort, { once: true });
  });
  try { return await Promise.race([Promise.resolve().then(operation).catch(() => stopUnknown('handler_failed')), boundary]); }
  finally { cancelDeadline(); signal?.removeEventListener('abort', abort); }
}

/** Stop owns a hard deadline, including descendants holding inherited output pipes. */
export async function runStopCommand(command: string, payload: StopPayload, timeoutMs: number, signal?: AbortSignal): Promise<HookDecision> {
  if (signal?.aborted) return stopUnknown('cancelled');
  const sandbox = planSandboxedCommand({ shell: '/bin/sh', shellArgs: ['-c', command], workspaceRoot: payload.workspaceRoot });
  if (sandbox.state === 'refused') return stopUnknown('sandbox_refused');
  return new Promise(resolve => {
    let settled = false;
    let cancelDeadline: () => void = () => {};
    const finish = (result: HookDecision): void => {
      if (settled) return;
      settled = true;
      cancelDeadline();
      signal?.removeEventListener('abort', abort);
      resolve(result);
    };
    const stop = (code: string): void => {
      if (child.pid) {
        try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); }
        catch { child.kill('SIGKILL'); }
      }
      finish(stopUnknown(code));
    };
    const abort = (): void => stop('cancelled');
    const child = spawn(sandbox.command ?? '/bin/sh', [...(sandbox.args ?? ['-c', command])], {
      cwd: payload.workspaceRoot, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let bytes = 0;
    const capture = (chunk: string): boolean => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > 1024 * 1024) { stop('output_limit'); return false; }
      return !settled;
    };
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { if (capture(chunk)) stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { if (capture(chunk)) stderr += chunk; });
    child.on('error', () => finish(stopUnknown('process_failed')));
    child.on('close', code => {
      if (settled) return;
      if (code !== 0) {
        finish(code === 2 && stderr.trim() ? { decision: 'block', reasonCode: 'exit_2',
          reason: stderr.slice(0, 4_000) } : stopUnknown('process_failed'));
        return;
      }
      if (!stdout.trim()) { finish(stopUnknown('empty_output')); return; }
      try { finish(normalizeStopResult(JSON.parse(stdout))); }
      catch { finish(stopUnknown('invalid_output')); }
    });
    cancelDeadline = stopDeadline(timeoutMs, () => stop('timeout'));
    signal?.addEventListener('abort', abort, { once: true });
    child.stdin?.on('error', () => {});
    child.stdin?.end(JSON.stringify({ ...payload, hook_event_name: 'Stop', cwd: payload.workspaceRoot }));
    if (signal?.aborted) abort();
  });
}
