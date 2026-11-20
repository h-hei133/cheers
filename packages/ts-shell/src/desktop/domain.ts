import type { DesktopErrorCode, RunNative } from '@cheers/desktop';
import type { ExecutionService } from '../runtime/execution/types.js';

export type DesktopDomain = typeof import('@cheers/desktop');

export class DesktopAdmissionError extends Error {
  constructor(readonly code: DesktopErrorCode, message: string) {
    super(message);
    this.name = 'DesktopAdmissionError';
  }
}

export async function loadDesktop(): Promise<DesktopDomain> {
  try { return await import('@cheers/desktop'); }
  catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') {
      throw new DesktopAdmissionError('unavailable', 'Native desktop package is unavailable.');
    }
    throw error;
  }
}

export function desktopRunner(service: Pick<ExecutionService, 'runCommand'>): RunNative {
  return request => service.runCommand({
    operationKind: 'command.run', command: request.command, args: request.args, cwd: request.cwd, workspaceRoot: request.cwd,
    authority: { mode: 'command-allowlisted', source: 'tool-runtime-approval', reason: 'Approved bounded native desktop operation.' },
    caller: 'desktop', reason: 'Execute the selected native desktop utility.', reportSafeCommand: request.effect ? 'desktop:input' : 'desktop:inspect',
    abortSignal: request.signal, timeoutMs: request.timeoutMs, captureOutput: false, cleanupTreeOnExit: true, env: request.env,
    onStdout: request.onStdout, onStderr: request.onStderr, ...(request.onStdin ? { onStdin: request.onStdin } : {}),
  });
}
