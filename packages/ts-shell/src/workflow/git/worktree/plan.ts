import fs from 'node:fs';
import path from 'node:path';
import { GitWorktreeManager } from '../../../core/workflow/gitWorktreeManager.js';
import { NativeGit } from '../read/native.js';
import type { GitSnapshot } from '../read/model.js';
import { readGitSnapshot, assertGitSnapshot } from '../read/snapshot.js';
import { gitPlan, prepareBranch } from '../operation/plan.js';
import type { GitPlan, GitOperationResult } from '../operation/model.js';
import { applyTransfer, captureTransfer, verifyTransfer } from './transfer.js';
import { checkoutIdentity, sameCheckout } from './identity.js';
import { CheckoutGuard, treeIndex } from './guard.js';

export interface WorktreeBinding { readonly migrate: (target: string) => { changed: boolean; note: string }; readonly owns: (target: string, branch?: string, head?: string | null) => boolean; readonly remember: (target: string, branch: string, head: string) => void; readonly forget?: (target: string) => void }
function targetPath(git: NativeGit, raw: string, existing: boolean): string {
  const target = path.resolve(git.root, raw);
  const parent = path.dirname(target);
  if (fs.realpathSync(parent) !== parent || existing && fs.realpathSync(target) !== target) throw new Error('Worktree target is redirected.');
  if (!existing && fs.existsSync(target)) throw new Error('Worktree target already exists. Nothing was overwritten.');
  return target;
}
function managerFor(git: NativeGit): GitWorktreeManager {
  return new GitWorktreeManager(git.root, { runCommand: request => git.run({ args: request.args, cwd: request.cwd, approved: true, signal: request.abortSignal }) });
}
async function hasIgnoredFiles(git: NativeGit): Promise<boolean> {
  return !!await git.text(['ls-files', '--full-name', '--others', '--ignored', '--exclude-standard', '-z']);
}
export async function prepareWorktree(git: NativeGit, snapshot: GitSnapshot, action: 'create' | 'migrate', raw: string, branch: string, binding: WorktreeBinding): Promise<GitPlan> {
  if (!snapshot.head) throw new Error('Create the first commit before creating a worktree.');
  await prepareBranch(git, snapshot, 'create', branch);
  if (snapshot.branches.includes(branch)) throw new Error('Worktree branch already exists.');
  const target = targetPath(git, raw, false);
  const parentStat = fs.statSync(path.dirname(target));
  const transfer = action === 'migrate' ? await captureTransfer(git, snapshot) : undefined;
  const cleanIndex = treeIndex(await git.text(['ls-tree', '--full-tree', '-r', '-z', snapshot.head], { cwd: snapshot.root }));
  const plan = gitPlan(snapshot, ['worktree', 'add', '-b', branch, target, snapshot.head], []);
  return { ...plan, nativeTargets: [target, ...(transfer ? [...transfer.files.map(file => path.join(target, file.name)), ...transfer.absent.map(name => path.join(target, name))] : [])], ...(transfer ? { sources: [...transfer.files.map(file => path.join(snapshot.root, file.name)), ...transfer.absent.map(name => path.join(snapshot.root, name))] } : {}), preview: plan.preview + `\n${transfer ? `git read-tree --empty; git update-index -z --index-info (literal frozen index); copy ${transfer.files.length} exact file bytes/modes/links and ${transfer.absent.length} deletions, SHA-256 ${transfer.digest}; source retained. Then rebind the same session.` : 'Create a clean worktree; current session stays.'}`,
    run: async signal => {
      if (fs.existsSync(target) || fs.realpathSync(path.dirname(target)) !== path.dirname(target)
        || fs.statSync(path.dirname(target)).ino !== parentStat.ino) throw new Error('Worktree target changed after approval.');
      const manager = managerFor(git);
      let created = false;
      let owned: ReturnType<typeof checkoutIdentity> | undefined;
      try {
        await manager.createCheckout(target, branch, snapshot.head!, signal); created = true;
        owned = checkoutIdentity(target);
        const destination = new CheckoutGuard(new NativeGit(target, git.execution), owned, branch, snapshot.head!, cleanIndex);
        await destination.clean();
        binding.remember(target, branch, snapshot.head!);
        await destination.clean();
        if (transfer) {
          const verifySource = async () => {
            await assertGitSnapshot(git, snapshot, false, { branch, head: snapshot.head! });
            const current = await readGitSnapshot(git);
            if (current.head !== snapshot.head || current.branch !== snapshot.branch || (await captureTransfer(git, current)).digest !== transfer.digest) throw new Error('Source changed during worktree creation; migration refused.');
          };
          await verifySource(); await applyTransfer(git, target, transfer, destination, signal);
          await verifySource(); signal?.throwIfAborted(); await verifyTransfer(git, target, transfer, destination);
          const rebound = binding.migrate(target);
          return { status: rebound.changed ? 'succeeded' : 'partial', target, note: `${rebound.note} Source changes retained${rebound.changed ? '.' : '; destination retained for inspection.'}` };
        }
        await destination.finish(); return { status: 'succeeded', target, note: `Created worktree ${target} on ${branch}; current session retained.` };
      } catch (error) {
        const note = error instanceof Error ? error.message : 'Worktree operation failed.';
        if (!created) return { status: 'unknown', target, note: `${note} Creation was not confirmed; inspect target and branch. Source retained.` };
        try {
          const targetGit = new NativeGit(target, git.execution);
          if (!owned || !sameCheckout(target, owned)) return { status: 'partial', target, note: `${note} Original checkout identity changed; replacement and original destinations retained. Source retained.` };
          const state = await readGitSnapshot(targetGit);
          if (owned && sameCheckout(target, owned) && !state.files.length && state.head === snapshot.head && state.branch === branch) {
            if (await hasIgnoredFiles(targetGit)) return { status: 'partial', target, note: `${note} Destination contains ignored user files and was retained. Source retained.` };
            await new CheckoutGuard(targetGit, owned, branch, snapshot.head!, cleanIndex).clean();
            if (!sameCheckout(target, owned)) throw new Error('Owned destination changed before cleanup.');
            await manager.removeCheckout(target); binding.forget?.(target); return { status: 'failed', target, note: `${note} Clean owned destination removed; branch ${branch} retained. Source retained.` };
          }
        } catch { return { status: 'partial', target, note: `${note} Destination cleanup could not be confirmed; target retained. Source retained.` }; }
        return { status: 'partial', target, note: `${note} Destination contains transferred or new changes and was retained. Source retained.` };
      }
    } };
}
export async function prepareWorktreeSwitch(git: NativeGit, snapshot: GitSnapshot, raw: string, binding: WorktreeBinding): Promise<GitPlan> {
  const target = targetPath(git, raw, true); const destination = await readGitSnapshot(new NativeGit(target, git.execution));
  if (destination.commonDir !== snapshot.commonDir || destination.root !== target) throw new Error('Select a registered worktree of this repository.');
  return { ...gitPlan(snapshot, ['worktree', 'switch-session', target], []), run: async signal => {
    signal?.throwIfAborted(); await assertGitSnapshot(new NativeGit(target, git.execution), destination);
    const result = binding.migrate(target);
    return { status: result.changed ? 'succeeded' : 'partial', target, note: result.note };
  } };
}
export async function prepareWorktreeDelete(git: NativeGit, snapshot: GitSnapshot, raw: string, binding: WorktreeBinding): Promise<GitPlan> {
  const target = targetPath(git, raw, true);
  if (target === snapshot.root || !binding.owns(target)) throw new Error('Only an owned inactive worktree can be removed.');
  const targetGit = new NativeGit(target, git.execution); const destination = await readGitSnapshot(targetGit);
  if (destination.commonDir !== snapshot.commonDir || destination.files.length) throw new Error('Dirty or unrelated worktree retained.');
  if (!binding.owns(target, destination.branch, destination.head)) throw new Error('Owned worktree identity, branch or commit changed; directory retained.');
  if (await hasIgnoredFiles(targetGit)) throw new Error('Worktree contains ignored user files; directory retained.');
  return { ...gitPlan(snapshot, ['worktree', 'remove', target], []), nativeTargets: [target], run: async signal => {
    await assertGitSnapshot(targetGit, destination); signal?.throwIfAborted();
    if (await hasIgnoredFiles(targetGit)) return { status: 'blocked', target, note: 'Worktree contains ignored user files; directory retained. No removal was sent.' };
    if (!binding.owns(target, destination.branch, destination.head)) throw new Error('Owned worktree identity changed after approval.');
    try { await managerFor(git).removeCheckout(target, signal); binding.forget?.(target); return { status: 'succeeded', target, note: `Removed owned clean worktree ${target}. Branch retained.` }; }
    catch { return { status: 'unknown', target, note: 'Non-forced worktree removal did not confirm cleanup. Inspect target and Git registration before retrying.' }; }
  } };
}
