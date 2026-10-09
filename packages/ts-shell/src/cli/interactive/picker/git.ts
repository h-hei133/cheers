import type { Picker, PickerOutcome } from '../overlay.js';
import type { GitWorkbench } from '../../../workflow/git/service.js';
import type { GitSnapshot, GitFile, GitArea } from '../../../workflow/git/read/model.js';
import { readGitDiff } from '../../../workflow/git/read/diff.js';
import { prepareFileChange, prepareCommit } from '../../../workflow/git/operation/plan.js';
import { gitDiffReport } from '../../../workflow/git/view/report.js';

export function gitPicker(workbench?: GitWorkbench): Picker {
  let snapshot: GitSnapshot;
  return { title: 'Git workbench', form: 'panel', holdInput: true, exclusive: true, empty: 'Index and worktree clean', loadError: 'Git state unavailable. No clean-tree claim was made.',
    footer: 'Enter inspect · Esc close · writes require native approval',
    async load() {
      if (!workbench) throw new Error('Bound Git runtime unavailable.'); snapshot = await workbench.snapshot();
      return [...snapshot.files.map(file => ({ id: `file:${file.path}`, label: `${file.index}${file.worktree} ${JSON.stringify(file.path)}`, detail: file.conflict ? 'Conflict · select explicit full-file resolution' : file.originalPath ? `Renamed from ${JSON.stringify(file.originalPath)}` : undefined })),
        { id: 'commit', label: 'Compose commit', detail: 'Current index only; no implicit stage or amend' },
        { id: 'branches', label: `Branches · ${snapshot.branch}`, detail: snapshot.branches.map(name => JSON.stringify(name)).join(', ') },
        { id: 'review', label: 'Request advisory review' }, { id: 'worktree', label: 'Worktrees' }, { id: 'goal', label: 'Current goal' }, { id: 'refresh', label: 'Refresh native Git state' }];
    },
    async apply(ids) {
      if (!workbench || !ids[0]) return undefined;
      if (ids[0] === 'refresh') return { next: gitPicker(workbench) };
      if (ids[0] === 'commit') return { next: commitComposer(workbench, snapshot) };
      if (ids[0] === 'branches') return { next: branchPicker(workbench, snapshot) };
      if (ids[0] === 'review') return { draft: '/review' };
      if (ids[0] === 'worktree') return { draft: '/wt' };
      if (ids[0] === 'goal') return { draft: '/git goal' };
      const file = snapshot.files.find(item => `file:${item.path}` === ids[0]);
      return file ? { next: filePicker(workbench, snapshot, file) } : { note: 'Selected path changed. Refresh /git.' };
    } };
}
function filePicker(workbench: GitWorkbench, snapshot: GitSnapshot, file: GitFile): Picker {
  return { title: `Git ${JSON.stringify(file.path)}`, form: 'panel', holdInput: true, exclusive: true, empty: '',
    load: async () => [
      ...(!['.', '?'].includes(file.index) ? [{ id: 'staged', label: 'Split staged diff · HEAD → index' }, { id: 'unstage', label: 'Unstage this file' }] : []),
      ...(file.worktree !== '.' ? [{ id: file.index === '?' ? 'untracked' : 'unstaged', label: 'Split worktree diff · index → worktree' }, { id: 'stage', label: 'Stage this file' }] : []),
      { id: 'back', label: 'Back to Git workbench' }],
    apply: async ids => {
      if (ids[0] === 'back') return { next: gitPicker(workbench) };
      if (ids[0] === 'stage' || ids[0] === 'unstage') {
        const result = await workbench.execute(await prepareFileChange(workbench.git(), snapshot, ids[0], file.path));
        return { note: `${result.status}: ${result.note}`, next: gitPicker(workbench) };
      }
      const area = ids[0] as GitArea; if (!['staged', 'unstaged', 'untracked'].includes(area)) return undefined;
      const diff = await readGitDiff(workbench.git(), snapshot, area, file.path);
      return { report: gitDiffReport(diff), ...(diff.hunks.length ? { next: hunkPicker(workbench, snapshot, file.path, area, diff.hunks.map(hunk => ({ id: hunk.id, label: `${hunk.header} · ${hunk.id}` }))) } : {}) };
    } };
}
function hunkPicker(workbench: GitWorkbench, snapshot: GitSnapshot, filePath: string, area: GitArea, hunks: readonly { id: string; label: string }[]): Picker {
  return { title: `${area === 'staged' ? 'Unstage' : 'Stage'} a frozen hunk`, form: 'panel', holdInput: true, exclusive: true, empty: '',
    load: async () => hunks, apply: async ids => {
      if (!ids[0] || !hunks.some(hunk => hunk.id === ids[0])) return undefined;
      const result = await workbench.execute(await prepareFileChange(workbench.git(), snapshot, area === 'staged' ? 'unstage' : 'stage', filePath, ids[0]));
      return { note: `${result.status}: ${result.note}`, next: gitPicker(workbench) };
    } };
}
function commitComposer(workbench: GitWorkbench, snapshot: GitSnapshot): Picker {
  return { title: 'Commit composer', form: 'panel', holdInput: true, exclusive: true, empty: '', load: async () => [], apply: async () => undefined,
    input: { initial: '', label: `Commit only index at ${snapshot.fingerprint}; paste multiline message`,
      validate: message => message.trim() ? undefined : 'A commit message is required.',
      apply: async message => {
        const result = await workbench.execute(await prepareCommit(workbench.git(), snapshot, message));
        return { note: `${result.status}: ${result.note}`, next: gitPicker(workbench) };
      } } };
}
function branchPicker(workbench: GitWorkbench, snapshot: GitSnapshot): Picker {
  return { title: 'Git branches', form: 'panel', holdInput: true, exclusive: true, empty: '',
    load: async () => [{ id: 'create', label: 'Create branch' }, ...snapshot.branches.map(name => ({ id: name, label: name, note: name === snapshot.branch ? 'current' : undefined }))],
    apply: async ids => {
      if (ids[0] === 'create') return { draft: '/git branch create ' };
      if (!ids[0] || !snapshot.branches.includes(ids[0])) return undefined;
      const branch = ids[0];
      return { next: { title: `Branch ${JSON.stringify(branch)}`, form: 'panel', empty: '', load: async () => [{ id: 'switch', label: 'Switch checkout' }, { id: 'delete', label: 'Delete merged inactive branch (non-forced)' }],
        apply: async actions => ({ draft: `/git branch ${actions[0]} ${JSON.stringify(branch)}` }) } };
    } };
}
