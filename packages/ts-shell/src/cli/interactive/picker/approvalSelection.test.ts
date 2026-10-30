import { expect, it, vi } from 'vitest';
import { approvalPicker, promptApproval } from './approval.js';
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
  expect((await first.load()).map(option => option.id)).toEqual(['choose-groups', 'allow-once', 'deny']);
  await first.apply!(['choose-groups']);
  const second = opened[1]!;
  const groups = await second.load();
  expect(groups.map(option => option.id)).toEqual(['group-a', 'group-b']);
  expect(groups.every(option => option.selected)).toBe(true);
  await second.apply!(['group-b']);
  expect(await result).toEqual({ decision: 'allow-once', selected: ['group-b'] });
});

it('binds a whole-plan approval to the full preview revision', async () => {
  const revisedPrompt: EscalationPrompt = {
    ...prompt,
    context: { ...prompt.context, selectionRevision: 'full-revision' },
  };
  const opened: Picker[] = [];
  const host = {
    pager: { open: () => undefined, close: () => undefined },
    overlay: { open: (picker: Picker) => { opened.push(picker); }, close: () => undefined },
    render: () => undefined,
  };
  const result = promptApproval(revisedPrompt, host);
  await opened[0]!.apply!(['allow-once']);
  expect(await result).toEqual({
    decision: 'allow-once',
    selected: ['group-a', 'group-b'],
    selectionRevision: 'full-revision',
  });
});

it('keeps the three-choice picker when there is only one group', async () => {
  const single = { ...prompt, context: { ...prompt.context, selections: [{ id: 'only', label: 'Update a.txt' }] } };
  const opened: Picker[] = [];
  const host = { pager: { open: () => undefined, close: () => undefined },
    overlay: { open: (picker: Picker) => { opened.push(picker); }, close: () => undefined }, render: () => undefined };
  const result = promptApproval(single, host);
  expect((await opened[0]!.load()).map(option => option.id)).toEqual(['allow-once', 'deny']);
  await opened[0]!.apply!(['allow-once']);
  expect(await result).toEqual({ decision: 'allow-once', selected: ['only'] });
});

it('shows the exact selected-subset preview before final approval', async () => {
  const refinedPrompt: EscalationPrompt = {
    ...prompt,
    context: {
      ...prompt.context,
      selectionPreview: selection => ({
        preview: `selected:${selection.join(',')}`,
        revision: 'subset-revision',
      }),
    },
  };
  const opened: Picker[] = [];
  const pagerOpens: string[] = [];
  const host = {
    pager: {
      open: (title: string) => { pagerOpens.push(title); },
      close: () => undefined,
    },
    overlay: { open: (picker: Picker) => { opened.push(picker); }, close: () => undefined },
    render: () => undefined,
  };
  const result = promptApproval(refinedPrompt, host);
  await opened[0]!.apply!(['choose-groups']);
  await opened[1]!.apply!(['group-b']);

  expect(opened).toHaveLength(3);
  expect(pagerOpens).toContain('Review file plan — close to choose approval');
  await opened[2]!.apply!(['allow-once']);
  expect(await result).toEqual({
    decision: 'allow-once',
    selected: ['group-b'],
    selectionRevision: 'subset-revision',
  });
});

it.each(['approval', 'groups', 'refined'] as const)('settles cancelled %s approval without late authorization or navigation', async stage => {
  const controller = new AbortController(), opened: Picker[] = [];
  const host = { pager: { open: vi.fn(), close: vi.fn() },
    overlay: { open: (picker: Picker) => { opened.push(picker); }, close: vi.fn() }, render: vi.fn() };
  const revised = { ...prompt, context: { ...prompt.context, preview: 'Exact public fixture plan',
    selectionPreview: () => ({ preview: 'Selected public fixture plan', revision: 'subset' }) } };
  const pending = promptApproval(revised, host, controller.signal);
  const observe = vi.fn(); void pending.then(observe);
  if (stage !== 'approval') await opened[0]!.apply!(['choose-groups']);
  const groups = stage !== 'approval' ? opened[1] : undefined;
  if (stage === 'refined') await groups!.apply!(['group-b']);
  const active = opened.at(-1)!;
  controller.abort(); await Promise.resolve();
  expect(observe).toHaveBeenCalledWith({ decision: 'deny', reason: 'Operation cancelled before approval.' });
  const count = opened.length, previews = host.pager.open.mock.calls.length;
  await active.apply!(['allow-once']);
  await opened[0]!.apply!(['choose-groups']);
  await groups?.apply?.(['group-a']);
  expect(opened).toHaveLength(count); expect(host.pager.open).toHaveBeenCalledTimes(previews);
  expect(await pending).toEqual({ decision: 'deny', reason: 'Operation cancelled before approval.' });
});

it('does not publish a prompt for an already cancelled run', async () => {
  const controller = new AbortController(); controller.abort();
  const host = { pager: { open: vi.fn(), close: vi.fn() }, overlay: { open: vi.fn(), close: vi.fn() }, render: vi.fn() };
  let answer: unknown;
  void promptApproval(prompt, host, controller.signal).then(value => { answer = value; });
  await Promise.resolve();
  expect(answer).toEqual({ decision: 'deny', reason: 'Operation cancelled before approval.' });
  expect(host.overlay.open).not.toHaveBeenCalled(); expect(host.render).not.toHaveBeenCalled();
});

it('retires cancellation after the user answers and leaves later surfaces alone', async () => {
  const controller = new AbortController(), opened: Picker[] = [];
  const remove = vi.spyOn(controller.signal, 'removeEventListener');
  const host = { pager: { open: vi.fn(), close: vi.fn() },
    overlay: { open: (picker: Picker) => { opened.push(picker); }, close: vi.fn() }, render: vi.fn() };
  const pending = promptApproval(prompt, host, controller.signal);
  await opened[0]!.apply!(['allow-once']);
  expect(await pending).toMatchObject({ decision: 'allow-once' });
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  const calls = host.overlay.close.mock.calls.length;
  controller.abort(); expect(host.overlay.close).toHaveBeenCalledTimes(calls);
});

it('settles cancellation even when closing the approval surface throws', async () => {
  const controller = new AbortController(), opened: Picker[] = [];
  const host = { pager: { open: vi.fn(), close: vi.fn() },
    overlay: { open: (picker: Picker) => { opened.push(picker); }, close: vi.fn(() => { throw new Error('controlled device failure'); }) },
    render: vi.fn() };
  const pending = promptApproval(prompt, host, controller.signal), observe = vi.fn(); void pending.then(observe);
  expect(() => controller.abort()).not.toThrow(); await Promise.resolve();
  expect(observe).toHaveBeenCalledWith({ decision: 'deny', reason: 'Operation cancelled before approval.' });
});

it('rejects an approval answer when closing its surface fails before cancellation', async () => {
  const controller = new AbortController(), opened: Picker[] = [], failure = new Error('controlled device failure');
  const host = { pager: { open: vi.fn(), close: vi.fn() },
    overlay: { open: (picker: Picker) => { opened.push(picker); }, close: vi.fn(() => { throw failure; }) }, render: vi.fn() };
  const pending = promptApproval(prompt, host, controller.signal);
  const rejected = expect(pending).rejects.toBe(failure);
  await opened[0]!.apply!(['allow-once']); await rejected;
  controller.abort(); expect(host.overlay.close).toHaveBeenCalledOnce();
});

it('retires cancellation when publishing the approval fails', async () => {
  const controller = new AbortController(), failure = new Error('controlled publication failure');
  const host = { pager: { open: vi.fn(), close: vi.fn() },
    overlay: { open: vi.fn(() => { throw failure; }), close: vi.fn() }, render: vi.fn() };
  await expect(promptApproval(prompt, host, controller.signal)).rejects.toBe(failure);
  controller.abort(); expect(host.overlay.close).not.toHaveBeenCalled();
});

it('cannot choose patch groups when the prompt offers only denial', async () => {
  const settle = vi.fn(), choose = vi.fn();
  const picker = approvalPicker({ ...prompt, options: [{ value: 'deny', label: 'Deny', description: 'Refuse this request' }] }, settle, choose);
  expect((await picker.load()).map(row => row.id)).toEqual(['deny']);
  await picker.apply!(['choose-groups']);
  expect(choose).not.toHaveBeenCalled(); expect(settle).toHaveBeenCalledWith({ decision: 'deny' });
});
