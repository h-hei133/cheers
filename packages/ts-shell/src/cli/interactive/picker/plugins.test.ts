import { beforeEach, expect, it, vi } from 'vitest';
import { pluginPicker } from './plugins.js';
import { opensPicker, pickerFor, type PickerHost } from './registry.js';
import type { ExtensionInspection, ExtensionManager, ExtensionSnapshot } from '../../../extensions/view/model.js';

let inspection: ExtensionInspection;
const apply = vi.fn(async () => 'Effect: saved; durability: confirmed.');
const prepare = vi.fn(async () => ({ title: 'disable alpha', preview: ['Exact alpha@1.0.0'], apply }));
const snapshot: ExtensionSnapshot = { version: 'v1', mutationBlocked: false,
  install: { id: 'install', label: 'install', detail: 'exact signed release', input: 'release' }, notices: [],
  partial: false, omitted: { notices: 0, detailLines: 0, actions: 0 },
  items: [{ id: 'opaque-alpha', label: 'alpha', description: 'first', status: 'enabled', detail: ['deep searchable detail'],
    actions: [{ id: 'disable-alpha', label: 'disable alpha', detail: 'one item' },
      { id: 'update-alpha', label: 'update alpha', detail: 'exact release', input: 'release' }] }] };
const manager: ExtensionManager = { read: () => inspection, prepare, subscribe: () => () => {} };

beforeEach(() => { vi.clearAllMocks(); inspection = { state: 'ready', snapshot }; });

async function actions() {
  const picker = pluginPicker(manager); await picker.load();
  return (await picker.apply(['opaque-alpha']))!.next!;
}
async function confirm() {
  const picker = await actions(); await picker.load();
  return (await picker.apply(['disable-alpha']))!.next!;
}

it('opens plugin and extensions through one port and preserves argument routes', async () => {
  const host = { extensions: manager } as PickerHost;
  for (const command of ['/plugin', '/plugins', '/extensions']) {
    expect(opensPicker(command)).toBe(true);
    expect(await pickerFor(command, host)!.load()).toHaveLength(2);
    expect(opensPicker(`${command} disable alpha`)).toBe(false);
  }
  expect(opensPicker('/reload-plugins')).toBe(false);
});

it('opens read-only, searches full details and selects one exact offered identity', async () => {
  const picker = pluginPicker(manager);
  const rows = await picker.load();
  expect(rows[1]!.searchText).toContain('deep searchable detail');
  expect(prepare).not.toHaveBeenCalled(); expect(apply).not.toHaveBeenCalled();
  expect(await picker.apply(['opaque-alpha', 'unexpected'])).toBeUndefined();
  const child = (await picker.apply(['opaque-alpha']))!.next!;
  expect(child.title).toContain('alpha');
  expect(prepare).not.toHaveBeenCalled();
  expect(await child.apply(['disable-alpha'])).toBeUndefined();
  await child.load();
  expect(await child.apply(['disable-alpha', 'update-alpha'])).toBeUndefined();
  expect(await child.apply(['unoffered'])).toBeUndefined();
  expect(prepare).not.toHaveBeenCalled();
});

it('confirms one operation, defaults to cancel and cannot reuse cancellation', async () => {
  const picker = await confirm();
  expect(prepare).toHaveBeenCalledWith('v1', { item: 'opaque-alpha', action: 'disable-alpha' });
  expect(apply).not.toHaveBeenCalled();
  expect(picker.initialSelection).toBe('cancel');
  expect(await picker.apply(['continue'])).toBeUndefined();
  expect((await picker.load())[0]!.id).toBe('cancel');
  expect(await picker.apply(['continue', 'cancel'])).toBeUndefined();
  expect(await picker.apply(['cancel'])).toBeUndefined();
  expect(await picker.apply(['continue'])).toBeUndefined();
  expect(apply).not.toHaveBeenCalled();
});

it('retains actual approval result once, including denied and durability unknown', async () => {
  for (const output of ['Denied by ordinary approval.', 'Effect: published; durability: unknown.']) {
    apply.mockResolvedValueOnce(output);
    const picker = await confirm(); await picker.load();
    expect(await picker.apply(['continue'])).toEqual({ note: output });
    expect(await picker.apply(['continue'])).toBeUndefined();
  }
  expect(apply).toHaveBeenCalledTimes(2);
});

it('invalidates closed stages and refuses changed or never offered packages', async () => {
  const picker = pluginPicker(manager); await picker.load();
  inspection = { state: 'ready', snapshot: { ...snapshot, version: 'v2', items: [...snapshot.items, { ...snapshot.items[0]!, id: 'new' }] } };
  expect((await picker.apply(['opaque-alpha']))?.note).toContain('changed');
  expect(prepare).not.toHaveBeenCalled();
  const fresh = pluginPicker(manager); await fresh.load(); fresh.previewEnd!();
  expect(await fresh.apply(['new'])).toBeUndefined();
  inspection = { state: 'ready', snapshot };
  const confirmation = await confirm(); await confirmation.load(); confirmation.previewEnd!();
  expect(await confirmation.apply(['continue'])).toBeUndefined();
  expect(apply).not.toHaveBeenCalled();
});

it('distinguishes unavailable, empty, stale and no search matches', async () => {
  const unavailable = pluginPicker(undefined);
  expect(await unavailable.load()).toEqual([]);
  expect(unavailable.status!([])).toContain('unavailable');
  inspection = { state: 'ready', snapshot: { ...snapshot, items: [] } };
  const empty = pluginPicker(manager); await empty.load();
  expect(empty.status!([])).toContain('No extensions installed');
  inspection = { state: 'ready', snapshot };
  const picker = pluginPicker(manager); await picker.load();
  expect(picker.status!([], 'nomatch')).toContain('match this search');
  expect(picker.status!([], 'nomatch')).not.toContain('No extensions installed');
  inspection = { state: 'stale' }; await picker.load();
  expect(picker.status!([])).toContain('changed');
});

it('surfaces omitted extension actions instead of silently dropping management', async () => {
  inspection = { state: 'ready', snapshot: { ...snapshot, partial: true,
    omitted: { notices: 0, detailLines: 0, actions: 2 } } };
  const picker = pluginPicker(manager); await picker.load();
  expect(picker.status!([])).toContain('2 actions omitted');
  const child = (await picker.apply(['opaque-alpha']))!.next!;
  const rows = await child.load();
  expect(rows.at(-1)).toMatchObject({
    id: 'omitted-actions',
    disabled: true,
  });
  expect(child.status!([])).toContain('2 actions omitted');
  expect(child.detail!('omitted-actions').join(' ')).toContain('omitted by the projection budget');
});

it('requires an exact release and only prepares it after explicit input submission', async () => {
  const picker = pluginPicker(manager); await picker.load();
  const input = (await picker.apply(['install']))!.next!.input!;
  expect(input.validate('source:sample@latest')).toBeDefined();
  expect(await input.apply('source:sample@latest')).toBeUndefined();
  expect(prepare).not.toHaveBeenCalled();
  expect(input.validate('source:sample@1.0.0')).toBeUndefined();
  await input.apply('source:sample@1.0.0');
  expect(prepare).toHaveBeenCalledWith('v1', { action: 'install', input: 'source:sample@1.0.0' });
  expect(apply).not.toHaveBeenCalled();
});

it('withholds mutation on unknown durability and suppresses results for a changed binding', async () => {
  inspection = { state: 'ready', snapshot: { ...snapshot, mutationBlocked: true } };
  const picker = pluginPicker(manager);
  expect((await picker.load())[0]!.disabled).toBe(true);
  const child = (await picker.apply(['opaque-alpha']))!.next!;
  expect((await child.load()).every(option => option.disabled)).toBe(true);
  expect(await child.apply(['disable-alpha'])).toBeUndefined();
  expect(prepare).not.toHaveBeenCalled();
  inspection = { state: 'ready', snapshot };
  const confirmed = await confirm(); await confirmed.load();
  apply.mockImplementationOnce(async () => { inspection = { state: 'stale' }; return 'late result'; });
  expect(await confirmed.apply(['continue'])).toBeUndefined();
});
