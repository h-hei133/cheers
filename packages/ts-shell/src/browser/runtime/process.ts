import { executeLocally } from "../../runtime/execution/local.js";
import type { NormalizedExecutionResult } from "../../runtime/execution/types.js";

export type BrowserProcessCleanup = "closed" | "not-started" | "unknown";

export interface BrowserProcessResult extends NormalizedExecutionResult {
  readonly started: boolean;
  readonly cleanupStatus: BrowserProcessCleanup;
}

/** Explicit runner admission belongs to the caller; native lifetime belongs to execution/local. */
export async function runBrowserProcess(input: {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly request: unknown;
  readonly timeoutMs: number;
  readonly outputBudgetBytes: number;
  readonly stderrBudgetBytes?: number;
  readonly signal?: AbortSignal;
}): Promise<BrowserProcessResult> {
  let started = false;
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  const result = await executeLocally({
    command: input.command,
    args: [...input.args],
    cwd: input.cwd ?? process.cwd(),
    env: input.env,
    input: `${JSON.stringify(input.request)}\n`,
    timeoutMs: input.timeoutMs,
    abortSignal: input.signal,
    cleanupTreeOnExit: true,
    captureOutput: false,
    onStarted: () => { started = true; },
    onStdout: chunk => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > input.outputBudgetBytes) throw new Error("Runner stdout exceeded its byte limit.");
      stdout.push(Buffer.from(chunk));
    },
    onStderr: chunk => {
      stderrBytes += chunk.length;
      if (stderrBytes > (input.stderrBudgetBytes ?? input.outputBudgetBytes)) throw new Error("Runner stderr exceeded its byte limit.");
      stderr.push(Buffer.from(chunk));
    },
  });
  return {
    ...result,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8") || result.stderr,
    started,
    cleanupStatus: result.terminationFailed ? "unknown" : started ? "closed" : "not-started",
  };
}
