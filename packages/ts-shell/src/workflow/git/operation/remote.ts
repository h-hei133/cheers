import { NativeGit } from '../read/native.js';
import type { GitSnapshot } from '../read/model.js';
import { gitPlan } from './plan.js';
import type { GitPlan } from './model.js';
import type { GitRecord, GitStore } from './store.js';
import { retainGitRecord } from './store.js';
import { publishGitResult } from './publication.js';

function validateRemote(url: string, ref: string): void {
  if (!url || url.startsWith('-') || /[\x00-\x1f]/.test(url) || /^[a-z]+:\/\/[^/]*@/i.test(url) || /[?&#]/.test(url)) throw new Error('Remote URL must be literal and contain no embedded credentials or query secrets.');
  if (!ref.startsWith('refs/heads/') || /[\x00-\x20~^:?*\[\\]/.test(ref) || ref.includes('..') || ref.endsWith('/')) throw new Error('A complete literal refs/heads/<branch> target is required.');
}
async function observedRef(git: NativeGit, url: string, ref: string, signal?: AbortSignal): Promise<string | null> {
  const output = await git.text(['ls-remote', '--refs', '--', url, ref], { approved: true, signal });
  const rows = output.trim().split('\n').filter(Boolean).map(line => line.split('\t'));
  if (rows.some(row => row.length !== 2 || row[1] !== ref || !/^[a-f\d]{40,64}$/.test(row[0]!)) || rows.length > 1) throw new Error('Remote ref query was incomplete or ambiguous.');
  return rows[0]?.[0] ?? null;
}
export async function preparePush(git: NativeGit, snapshot: GitSnapshot, name: string, ref: string, store: GitStore): Promise<GitPlan> {
  if (!snapshot.head) throw new Error('No commit exists to push.');
  const url = (await git.text(['remote', 'get-url', '--push', '--', name])).trim();
  validateRemote(url, ref); await git.text(['check-ref-format', ref]);
  if (store.read().operations.some(record => record.root === snapshot.root && record.remote?.url === url && record.remote.ref === ref
    && ['unknown', 'permission-pending'].includes(record.result.status))) throw new Error('An earlier remote write is unknown. Use /git reconcile <operationId> before preparing another push.');
  const plan = gitPlan(snapshot, ['push', '--porcelain', '--', url, `${snapshot.head}:${ref}`], []);
  return { ...plan, preview: plan.preview + `\nFirst query this exact remote/ref, then non-forced push. No automatic retries.`, remote: { url, ref, before: null, desired: snapshot.head }, run: async signal => {
    let record: GitRecord = { id: plan.id, root: snapshot.root, summary: plan.summary,
      remote: { url, ref, desired: snapshot.head! }, result: { status: 'unknown', note: 'Remote operation admitted; actual write outcome must be reconciled.' } };
    retainGitRecord(store, record);
    let before: string | null;
    try { before = await observedRef(git, url, ref, signal); }
    catch { const result = { status: 'failed' as const, note: 'Remote ref query failed before push; no push was sent.' }; retainGitRecord(store, { ...record, result }); return result; }
    record = { ...record, remote: { ...record.remote!, before } }; retainGitRecord(store, record);
    signal?.throwIfAborted();
    const sent = await git.run({ args: plan.args, approved: true, signal });
    let result;
    if (sent.status === 'completed' && sent.exitCode === 0) {
      try {
        const observed = await observedRef(git, url, ref, signal);
        result = { status: observed === snapshot.head ? 'succeeded' as const : 'unknown' as const, note: observed === snapshot.head ? `Remote ${name} ${ref} read back at ${snapshot.head}.` : 'Push returned success but the exact remote ref did not confirm it. Reconcile before any new push.', receipts: [sent.receipt] };
      } catch { result = { status: 'unknown' as const, note: 'Push returned success but remote readback failed. Reconcile before any new push.', receipts: [sent.receipt] }; }
    } else result = { status: 'unknown' as const, note: 'Remote write outcome is unknown. Query this exact target with /git reconcile before any new push; no retry was attempted.', receipts: [sent.receipt] };
    return publishGitResult(result, final => retainGitRecord(store, { ...record, result: final }));
  } };
}
export function prepareRemoteReconciliation(git: NativeGit, snapshot: GitSnapshot, id: string, store: GitStore): GitPlan {
  const record = store.read().operations.find(item => item.id === id);
  if (!record?.remote || record.root !== snapshot.root || record.result.status !== 'unknown') throw new Error('Select an unknown remote operation of this repository.');
  const remote = record.remote; validateRemote(remote.url, remote.ref);
  return { ...gitPlan(snapshot, ['ls-remote', '--refs', '--', remote.url, remote.ref], []), run: async signal => {
    try {
      const observed = await observedRef(git, remote.url, remote.ref, signal);
      const result = { status: observed === remote.desired ? 'succeeded' as const : 'failed' as const,
        note: observed === remote.desired ? `Remote ref ${remote.ref} confirms ${remote.desired}. No write was retried.` : `Remote ref ${remote.ref} currently contains ${observed ?? '(absent)'}. Prior desired hash is not current; no write was retried.` };
      return publishGitResult(result, final => retainGitRecord(store, { ...record, result: final }));
    } catch { return { status: 'unknown', note: 'Remote query did not reconcile the earlier write. Uncertainty retained; no retry.' }; }
  } };
}
