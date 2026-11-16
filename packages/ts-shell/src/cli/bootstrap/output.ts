import { takeOverStdout, type StdoutGuard } from '../../core/shell/outputGuard.js';

type OutputDevice = NonNullable<Parameters<typeof takeOverStdout>[0]>;

interface CliOutput {
  readonly guard?: StdoutGuard;
  exit(code: number): never;
  cancel(): void;
  run<T>(operation: () => Promise<T>, cleanup?: () => Promise<void>): Promise<T>;
}

class OutputExit extends Error {
  readonly kind = 'cli-output-exit';
  constructor(readonly owner: symbol, readonly code: number) { super('CLI exit requested.'); }
}

/** Cycle and signal shutdown share the same captured drain and restoration. */
export function createCliOutput(input: {
  readonly enabled: boolean;
  readonly stdout: Pick<NodeJS.WriteStream, 'write'>;
  readonly stderr: Pick<NodeJS.WriteStream, 'write'>;
  readonly writeError: (message: string) => void;
  readonly exit: (code: number) => never;
}): CliOutput {
  const guard = input.enabled
    ? takeOverStdout(input.stdout as unknown as OutputDevice, input.stderr as unknown as OutputDevice) : undefined;
  let closing: Promise<void> | undefined;
  let outputFailure: { error: unknown } | undefined;
  let secondaryReported = false;
  const owner = Symbol('cli-output');
  const originalExit = input.exit.bind(input);
  let pendingExit: OutputExit | undefined;
  let exitInvoked = false;
  const reportFailure = (message: string): void => {
    try { input.writeError(message); }
    catch { /* Keep the first failure when the diagnostic device is unavailable. */ }
  };
  const finishExit = (request: OutputExit | undefined, failed: boolean): never => {
    if (request && !exitInvoked) {
      exitInvoked = true;
      originalExit(request.code === 0 && failed ? 1 : request.code);
    }
    throw new Error('CLI exit did not terminate the process.');
  };
  const close = (): Promise<void> => {
    if (!guard) return Promise.resolve();
    return closing ??= (async () => {
      try { await guard.flush(); }
      catch (error) { outputFailure = { error }; throw error; }
      finally { guard.restore(); }
    })();
  };
  return {
    ...(guard ? { guard } : {}),
    exit(code): never {
      pendingExit ??= new OutputExit(owner, code);
      throw pendingExit;
    },
    cancel: () => { guard?.restore(); },
    async run(operation, cleanup) {
      let request: OutputExit | undefined;
      let failure: { error: unknown } | undefined;
      let cleanupFailure: { error: unknown } | undefined;
      try { return await operation(); }
      catch (error) {
        if (error instanceof OutputExit && error.owner === owner) request = error;
        else { failure = { error }; throw error; }
      }
      finally {
        try { await cleanup?.(); }
        catch (error) { cleanupFailure = { error }; }
        const primary = failure ?? cleanupFailure;
        try { await close(); }
        catch (error) {
          if (!primary && !request) throw error;
          if ((!primary || error !== primary.error) && !secondaryReported) {
            secondaryReported = true;
            reportFailure('Output cleanup also failed; delivery was not verified.');
          }
        }
        if (failure && cleanupFailure && cleanupFailure.error !== failure.error
          && (!outputFailure || cleanupFailure.error !== outputFailure.error)) {
          reportFailure('Resource cleanup also failed; cleanup was not verified.');
        }
        if (request && cleanupFailure && (!outputFailure || cleanupFailure.error !== outputFailure.error)) {
          reportFailure('Resource cleanup failed; process exit was not verified.');
        }
        if (!failure && cleanupFailure && !request) throw cleanupFailure.error;
      }
      return finishExit(request, Boolean(cleanupFailure || outputFailure));
    },
  };
}
