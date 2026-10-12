import path from 'node:path';
import { statSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import { executeLocally } from '../../runtime/execution/local.js';
import { verifyPathContainment } from '../security/pathJail.js';
import { withNativeReadView, type NativeReadPlan } from '../../runtime/execution/view/index.js';
import { WalkBudget, WalkLimitError } from '../../runtime/execution/walk/budget.js';
import { ReadCleanupError } from '../../runtime/execution/read.js';

export function permittedSearchFile(root: string, file: string, check: (target: string) => void): string | undefined {
  const target = verifyPathContainment(path.resolve(root, file), root);
  if (!target.allowed) return undefined;
  try {
    if (!statSync(target.resolvedPath).isFile()) return undefined;
    let current = target.resolvedPath;
    for (;;) {
      check(current);
      if (current === root) break;
      const parent = path.dirname(current);
      if (parent === current) return undefined;
      current = parent;
    }
    return path.relative(root, target.resolvedPath);
  } catch { return undefined; }
}

/** Enumerate names with the native ignore semantics, without searching file contents. */
export async function collectSearchFiles(input: {
  binary: string; args: readonly string[]; workspaceRoot: string; searchPath?: string;
  assertFileAccess: (target: string) => void; abortSignal?: AbortSignal; timeoutMs?: number;
}): Promise<{ ok: true; files: readonly string[] } | { ok: false; reason: 'failed' | 'execution-failure' | 'read-cleanup-failed' | 'cancelled' | 'timeout' | 'output-limit'; readCleanupFailed?: true }> {
  const budget = new WalkBudget(input.abortSignal, { timeoutMs: input.timeoutMs });
  let executionFailed = false;
  try {
    return await withNativeReadView({ root: input.workspaceRoot, assertFileAccess: input.assertFileAccess,
      abortSignal: input.abortSignal, budget,
    }, async (sources, plan, materialize) => {
      const prepared = plan(input.binary, input.args, input.workspaceRoot);
      const preserveIgnored = input.args.some((arg, index) => input.args[index - 1] === '--glob' && !arg.startsWith('!'));
      await materialize({ native: 'search', directory: path.resolve(input.workspaceRoot, input.searchPath || '.'), preserveIgnored });
      sources.verify();
      const result = await collectNativeFiles(input, prepared, budget);
      executionFailed = !result.ok && result.reason === 'execution-failure';
      if (result.ok) sources.verify();
      return result;
    });
  } catch (error) {
    if (executionFailed) return { ok: false, reason: 'execution-failure', ...(error instanceof ReadCleanupError ? { readCleanupFailed: true } : {}) };
    if (error instanceof ReadCleanupError) return { ok: false, reason: 'read-cleanup-failed' };
    if (input.abortSignal?.aborted) return { ok: false, reason: 'cancelled' };
    if (error instanceof WalkLimitError) return { ok: false, reason: error.reason === 'deadline' ? 'timeout' : 'output-limit' };
    return { ok: false, reason: 'failed' };
  }
}

async function collectNativeFiles(input: Parameters<typeof collectSearchFiles>[0], plan: NativeReadPlan, budget: WalkBudget)
  : Promise<Awaited<ReturnType<typeof collectSearchFiles>>> {
  const controller = new AbortController();
  const onAbort = (): void => controller.abort();
  input.abortSignal?.addEventListener('abort', onAbort, { once: true });
  if (input.abortSignal?.aborted) controller.abort();
  const decoder = new StringDecoder('utf8');
  const files = new Set<string>();
  let pending = '';
  let bytes = 0;
  let oversized = false;
  try {
    const result = await executeLocally({ ...plan,
      abortSignal: controller.signal, timeoutMs: budget.timeRemaining(input.timeoutMs ?? 30_000),
      captureOutput: false, onStdout: (chunk) => {
        if (controller.signal.aborted) return;
        bytes += chunk.length;
        if (bytes > 16 * 1024 * 1024) { oversized = true; controller.abort(); return; }
        pending += decoder.write(chunk);
        let end: number;
        while ((end = pending.indexOf('\0')) >= 0) {
          const name = pending.slice(0, end); pending = pending.slice(end + 1);
          const allowed = permittedSearchFile(input.workspaceRoot, name, input.assertFileAccess);
          if (allowed !== undefined) files.add(allowed);
        }
      },
    });
    if (result.failureKind === 'execution_failure') return { ok: false, reason: 'execution-failure' };
    if (input.abortSignal?.aborted) return { ok: false, reason: 'cancelled' };
    if (oversized) return { ok: false, reason: 'output-limit' };
    if (result.status === 'timeout') return { ok: false, reason: 'timeout' };
    if (result.status === 'completed' || result.status === 'failed') await plan.verifyExit(result.exitCode);
    if (pending || (result.status !== 'completed' && !(result.status === 'failed' && result.exitCode === 1))) {
      return { ok: false, reason: 'failed' };
    }
    return { ok: true, files: [...files] };
  } finally { input.abortSignal?.removeEventListener('abort', onAbort); }
}

/** Keep argv below conservative platform limits; no shell quoting is involved. */
export function searchFileBatches(files: readonly string[]): readonly string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let length = 0;
  for (const file of files) {
    const size = Buffer.byteLength(file) + 3;
    if (batch.length && (length + size > 16_000 || batch.length >= 64)) { batches.push(batch); batch = []; length = 0; }
    batch.push(file); length += size;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
