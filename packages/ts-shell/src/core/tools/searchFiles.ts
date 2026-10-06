import path from 'node:path';
import { statSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import { executeLocally } from '../../runtime/execution/local.js';
import { verifyPathContainment } from '../security/pathJail.js';

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
  binary: string; args: readonly string[]; workspaceRoot: string;
  assertFileAccess: (target: string) => void; abortSignal?: AbortSignal; timeoutMs?: number;
}): Promise<{ ok: true; files: readonly string[] } | { ok: false; reason: 'failed' | 'execution-failure' | 'cancelled' | 'timeout' | 'output-limit' }> {
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
    const result = await executeLocally({ command: input.binary, args: [...input.args],
      cwd: input.workspaceRoot, abortSignal: controller.signal, timeoutMs: input.timeoutMs ?? 30_000,
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
