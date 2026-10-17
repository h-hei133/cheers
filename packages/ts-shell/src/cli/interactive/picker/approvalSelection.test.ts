import { expect, it } from 'vitest';
import { promptApproval } from './approval.js';
import type { EscalationPrompt } from '../../../core/shell/approval/contract.js';
import type { Picker } from '../overlay.js';

const prompt: EscalationPrompt = {
  id: 'esc_groups', title: 'apply patch', message: 'apply patch', context: { toolName: 'apply_patch', operation: 'write', target: 'a.txt',
    selections: [{ id: 'group-a', label: 'Update a.txt (1 hunk)', files: ['a.txt'] }, { id: 'group-b', label: 'Update b.txt (1 hunk)', files: ['b.txt'] }] },
  options: [], defaultOption: 'deny', recommendedAction: 'deny', severity: 'medium',
};

it('lets the user apply a subset of patch groups', async () => {
  const opened: Picker[] = [];
  const host = { pager: { open: () => undefined, close: () => undefined },
    overlay: { open: (picker: Picker) => { opened.push(picker); }, close: () => undefined }, render: () => undefined };
  const result = promptApproval(prompt, host);
  const first = opened[0]!;
  expect((await first.load()).map(option => option.id)).toEqual(['choose-groups', 'allow-once', 'allow-always', 'deny']);
  await first.apply!(['choose-groups']);
  const second = opened[1]!;
  const groups = await second.load();
  expect(groups.map(option => option.id)).toEqual(['group-a', 'group-b']);
  expect(groups.every(option => option.selected)).toBe(true);
  await second.apply!(['group-b']);
  expect(await result).toEqual({ decision: 'allow-once', selected: ['group-b'] });
});

it('keeps the three-choice picker when there is only one group', async () => {
  const single = { ...prompt, context: { ...prompt.context, selections: [{ id: 'only', label: 'Update a.txt' }] } };
  const opened: Picker[] = [];
  const host = { pager: { open: () => undefined, close: () => undefined },
    overlay: { open: (picker: Picker) => { opened.push(picker); }, close: () => undefined }, render: () => undefined };
  const result = promptApproval(single, host);
  expect((await opened[0]!.load()).map(option => option.id)).toEqual(['allow-once', 'allow-always', 'deny']);
  await opened[0]!.apply!(['allow-once']);
  expect(await result).toEqual({ decision: 'allow-once', selected: ['only'] });
});
