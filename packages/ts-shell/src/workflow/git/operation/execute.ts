import { NativeGit } from '../read/native.js';
import { assertGitSnapshot, readGitSnapshot } from '../read/snapshot.js';
import type { GitPlan, GitOperationResult } from './model.js';
import { hashBytes } from '../read/fingerprint.js';
import { sanitizeExecutionReportText } from '../../../runtime/execution/error.js';

export async function executeGitPlan(git: NativeGit, plan: GitPlan, signal?: AbortSignal): Promise<GitOperationResult> {
  signal?.throwIfAborted();
  await assertGitSnapshot(git, plan.snapshot);
  if (plan.run) {
    try { return await plan.run(signal); }
    catch { return { status: 'unknown', note: 'Git operation began but its final outcome could not be confirmed. Inspect the retained operation before retrying.' }; }
  }
  let result;
  try { result = await git.run({ args: plan.args, cwd: plan.snapshot.root, ...(plan.input ? { input: plan.input } : {}), approved: true, signal }); }
  catch { return { status: 'unknown', note: 'Native Git dispatch did not return a final result. Inspect the repository before retrying; no operation was retried.' }; }
  const receipts = [result.receipt];
  const ok = result.status === 'completed' && result.exitCode === 0;
  if (plan.commitIndex) {
    try {
      const current = await readGitSnapshot(git);
      if (current.head && current.head !== plan.snapshot.head) {
        const tree = await git.text(['ls-tree', '--full-tree', '-r', '-z', current.head], { cwd: current.root });
        const index = tree.replace(/(^|\0)(\d+) (?:blob|commit) ([a-f\d]+)\t/g, '$1$2 $3 0\t');
        const parents = (await git.text(['rev-list', '--parents', '-n', '1', current.head])).trim().split(' ').slice(1);
        const verified = hashBytes(index) === plan.commitIndex && (plan.snapshot.head ? parents.length === 1 && parents[0] === plan.snapshot.head : parents.length === 0);
        return { status: ok && verified ? 'succeeded' : 'partial', hash: current.head, receipts,
          note: verified ? `Commit read back: ${current.head}.${ok ? '' : ' Git returned a failure after the commit; inspect hook output before new work.'}` : `Commit ${current.head} exists, but its tree or parent differs from the approved index. Inspect the hook effects.` };
      }
    } catch { return { status: 'unknown', note: 'Commit outcome could not be read back. Inspect HEAD before retrying.', receipts }; }
  }
  if (!ok) {
    let changed = false;
    try { changed = (await readGitSnapshot(git)).fingerprint !== plan.snapshot.fingerprint; }
    catch { return { status: 'unknown', note: 'Git failed and the resulting repository state could not be read back. No retry was attempted.', receipts }; }
    return { status: ['timeout', 'cancelled'].includes(result.status) || result.terminationFailed ? 'unknown' : changed ? 'partial' : 'failed', receipts,
      note: `${plan.summary}: ${result.status}, exit ${result.exitCode ?? 'unknown'}. ${sanitizeExecutionReportText(result.stderr).slice(0, 2000)} No retry was attempted.` };
  }
  return { status: 'succeeded', note: `${plan.summary} completed.`, receipts };
}
