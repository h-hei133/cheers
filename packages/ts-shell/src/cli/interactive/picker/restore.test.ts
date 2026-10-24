import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureRecoveryAuthorityRecord } from '../../../edit/recovery/recoveryAuthorityStore.js';
import { snapshotRoot } from '../../../edit/recovery/root.js';
import { tokenizeCommandArgs } from '../../../core/commands/arguments.js';
import { parseRestoreCommandArgs, runRestoreLocalCommand } from '../../../core/commands/restoreCommandRuntime.js';
import { restorePicker } from './restore.js';
import { OverlayHost } from '../overlay.js';
import { parseKeyEvent } from '../../../presentation/tui/input/keys.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "restore space ' $` "));
  roots.push(root);
  return root;
}

async function capture(root: string, authorityId: string, recordId: string, beforeState: 'exists' | 'absent' = 'exists') {
  const result = await captureRecoveryAuthorityRecord({
    mode: 'non-default', ledgerRoot: snapshotRoot(root), authorityId, recordId,
    workspaceRelativePath: `${recordId}.txt`, operationKind: beforeState === 'exists' ? 'update' : 'create',
    beforeState, ...(beforeState === 'exists' ? { beforeContent: 'before\n' } : {}),
    expectedCurrentState: 'exists', expectedCurrentContent: 'after\n',
    createdAt: '2026-10-21T01:00:00.000Z',
  });
  expect(result.status).toBe('captured');
}

describe('restore selection contract', () => {
  it('round-trips special project paths and submits an actual read-only preview', async () => {
    const root = workspace();
    await capture(root, 'edit-a', 'record-a');
    fs.writeFileSync(path.join(root, 'record-a.txt'), 'after\n');
    const picker = restorePicker(root);
    const rows = await picker.load();
    const outcome = await picker.apply([rows[0]!.id]);
    const args = tokenizeCommandArgs(outcome!.draft!).slice(1);
    expect(parseRestoreCommandArgs(args, { cwd: root })).toMatchObject({
      mode: 'preview', ledgerRoot: snapshotRoot(root), workspaceRoot: root,
      authorityId: 'edit-a', recordSelection: { kind: 'records', recordIds: ['record-a'] },
      dryRun: true, requireExplicitExecute: false,
    });
    const result = await runRestoreLocalCommand(args, { cwd: root });
    expect(result.output).toContain('Would restore');
    expect(result.output).toContain('Nothing was written.');
    expect(fs.readFileSync(path.join(root, 'record-a.txt'), 'utf8')).toBe('after\n');
  });

  it('distinguishes identical record IDs from different edits', async () => {
    const root = workspace();
    await capture(root, 'edit-a', 'same');
    await capture(root, 'edit-b', 'same');
    const picker = restorePicker(root);
    const rows = await picker.load();
    expect(new Set(rows.map(row => row.id)).size).toBe(2);
    for (const row of rows) {
      const opening = restorePicker(root); await opening.load();
      const outcome = await opening.apply([row.id]);
      expect(outcome?.draft).toBeDefined();
      const parsed = parseRestoreCommandArgs(tokenizeCommandArgs(outcome!.draft!).slice(1), { cwd: root });
      expect(row.searchText).toContain(parsed.authorityId);
      expect(parsed.recordSelection).toEqual({ kind: 'records', recordIds: ['same'] });
    }
    expect((await picker.apply(rows.map(row => row.id)))?.note).toContain('different edits');
  });

  it('preserves supported dash-leading authority and record IDs as option values', async () => {
    const root = workspace();
    await capture(root, '-edit-a', '-record-a');
    const picker = restorePicker(root);
    const rows = await picker.load();
    const outcome = await picker.apply([rows[0]!.id]);
    expect(parseRestoreCommandArgs(tokenizeCommandArgs(outcome!.draft!).slice(1), { cwd: root })).toMatchObject({
      mode: 'preview', authorityId: '-edit-a', recordSelection: { kind: 'records', recordIds: ['-record-a'] },
    });
  });

  it('keeps every recorded snapshot available to scrolling and filtering', async () => {
    const root = workspace();
    for (let index = 0; index < 45; index++) await capture(root, 'edit-a', `record-${index}`);
    const picker = restorePicker(root);
    const rows = await picker.load();
    expect(rows).toHaveLength(45);
    expect(picker.status?.(rows)).toContain('45');
    expect(rows.find(row => row.label === 'record-44.txt')).toBeDefined();
    const host = new OverlayHost(() => {});
    host.open({ ...picker, load: async () => rows });
    await Promise.resolve();
    host.handlePaste('record-44');
    expect(host.render(120, 40).join('\n')).toContain('record-44.txt');
    const applied: string[][] = [];
    host.handleKey(parseKeyEvent('\x1b'), (_picker, ids) => applied.push([...ids]));
    expect(host.active).toBe(false);
    expect(applied).toEqual([]);
  });

  it('allows previewing restoration of an absent original without a content blob', async () => {
    const root = workspace();
    await capture(root, 'edit-a', 'new-file', 'absent');
    const picker = restorePicker(root);
    const rows = await picker.load();
    expect(rows[0]?.disabled).toBe(false);
    expect((await picker.apply([rows[0]!.id]))?.draft).toContain('/restore preview');
  });

  it('pages beyond one hundred snapshots and searches records outside the current page', async () => {
    const root = workspace();
    for (let index = 0; index < 105; index++) await capture(root, 'edit-a', `record-${String(index).padStart(3, '0')}`);
    const picker = restorePicker(root);
    const first = await picker.load();
    expect(first).toHaveLength(101);
    expect(picker.status?.(first)).toContain('105');
    const more = first.find(row => row.note !== 'restorable' && row.label === 'More snapshots')!;
    expect((await picker.apply([first[0]!.id, more.id]))?.draft).toBeUndefined();
    const next = (await picker.apply([more.id]))!.next!;
    expect(await next.load()).toHaveLength(5);
    await expect(picker.load()).rejects.toThrow('closed');
    const searchPicker = restorePicker(root); await searchPicker.load();
    const matches = await searchPicker.search!('record-104');
    expect(matches.map(row => row.id)).toEqual(['edit-a:record-104']);
    expect(searchPicker.onSearchClear!()).toHaveLength(101);
    await searchPicker.search!('record-104');
    expect((await searchPicker.apply([matches[0]!.id]))?.draft).toContain('--record=record-104');

    const allPicker = restorePicker(root); await allPicker.load();
    const allMatches = await allPicker.search!('record-');
    const searchedNext = (await allPicker.apply([allMatches.at(-1)!.id]))!.next!;
    expect(searchedNext.initialFilter).toBe('record-');
    await searchedNext.load();
    expect(await searchedNext.search!('record-')).toHaveLength(5);
    expect(searchedNext.onSearchClear!()).toHaveLength(101);

    const changedPicker = restorePicker(root);
    const changedFirst = await changedPicker.load();
    const changedMore = changedFirst.find(row => row.note !== 'restorable' && row.label === 'More snapshots')!;
    await capture(root, 'edit-a', 'another-record');
    const changedNext = (await changedPicker.apply([changedMore.id]))!.next!;
    await expect(changedNext.load()).rejects.toThrow('changed');
  });

  it('does not publish a delayed search after the query was cleared', async () => {
    const root = workspace();
    await capture(root, 'edit-a', 'record-a');
    const picker = restorePicker(root);
    const rows = await picker.load();
    picker.onSearchChange!('no-match');
    expect((await picker.apply([rows[0]!.id]))?.draft).toBeUndefined();
    const delayed = picker.search!('no-match');
    expect(picker.onSearchClear!()).toHaveLength(1);
    await expect(delayed).rejects.toThrow('changed');
    expect((await picker.apply([rows[0]!.id]))?.draft).toContain('--record=record-a');
  });

  it('keeps initial loading successful when a query is typed during the scan', async () => {
    const root = workspace();
    await capture(root, 'edit-a', 'record-a');
    const picker = restorePicker(root);
    const loading = picker.load();
    picker.onSearchChange!('record-a');
    const rows = await loading;
    expect(rows).toHaveLength(1);
    expect((await picker.apply([rows[0]!.id]))?.draft).toBeUndefined();
    expect(await picker.search!('record-a')).toHaveLength(1);
    expect((await picker.apply([rows[0]!.id]))?.draft).toContain('--record=record-a');
  });

  it.each([false, true])('renders no matches separately from an empty ledger with queued wrapper=%s', async queued => {
    const root = workspace();
    await capture(root, 'edit-a', 'record-a');
    const picker = restorePicker(root);
    const host = new OverlayHost(() => {});
    host.open(queued ? { ...picker, exclusive: true } : picker);
    try {
      await vi.waitFor(() => expect(host.render(120, 40).join('\n')).toContain('record-a.txt'));
      host.handlePaste('no-matching-snapshot');
      await vi.waitFor(() => expect(picker.status?.([])).toContain('of 0 snapshots'));
      const rendered = host.render(120, 40).join('\n');
      expect(rendered).toContain('No edit snapshots match this search.');
      expect(rendered).not.toContain('No edit snapshots recorded for this project yet.');
      picker.onSearchClear!();
      expect(picker.empty).toBe('No edit snapshots to show.');
    } finally { host.close(); }
  });

  it('rejects a selection whose record changed or disappeared while the chooser was open', async () => {
    const root = workspace();
    await capture(root, 'edit-a', 'record-a');
    const picker = restorePicker(root);
    const rows = await picker.load();
    const recordPath = path.join(snapshotRoot(root), 'edit-a', 'records', 'record-a.json');
    const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
    fs.writeFileSync(recordPath, JSON.stringify({ ...record, workspaceRelativePath: 'different.txt' }));
    expect((await picker.apply([rows[0]!.id]))?.note).toContain('changed');
    fs.rmSync(recordPath);
    const missing = restorePicker(root);
    expect(await missing.load()).toEqual([]);
    const result = await picker.apply([rows[0]!.id]);
    expect(result).toBeUndefined();
    expect(result?.draft).toBeUndefined();
  });

  it('invalidates selection when expected bytes or modes change without changing the displayed row', async () => {
    const root = workspace();
    await capture(root, 'edit-a', 'record-a');
    const picker = restorePicker(root);
    const rows = await picker.load();
    const file = path.join(snapshotRoot(root), 'edit-a', 'records', 'record-a.json');
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, JSON.stringify({ ...record, expectedCurrentContentHash: '0'.repeat(64), expectedCurrentMode: 0o600 }));
    const result = await picker.apply([rows[0]!.id]);
    expect(result?.note).toContain('changed');
    expect(result?.draft).toBeUndefined();
  });

  it('reports unreadable ledger and partial record listings separately from an empty ledger', async () => {
    const root = workspace();
    fs.mkdirSync(path.dirname(snapshotRoot(root)), { recursive: true });
    fs.writeFileSync(snapshotRoot(root), 'not a directory');
    await expect(restorePicker(root).load()).rejects.toThrow();
    fs.rmSync(snapshotRoot(root));
    await capture(root, 'edit-a', 'record-a');
    fs.writeFileSync(path.join(snapshotRoot(root), 'edit-a', 'records', 'broken.json'), '{broken');
    const picker = restorePicker(root);
    const rows = await picker.load();
    expect(rows).toHaveLength(1);
    expect(picker.status?.(rows)).toContain('unavailable');
    fs.rmSync(path.join(snapshotRoot(root), 'edit-a', 'records', 'record-a.json'));
    await expect(restorePicker(root).load()).rejects.toThrow('could be read');
  });

  it('does not produce a draft for an unoffered or disabled identity', async () => {
    const root = workspace();
    await capture(root, 'edit-a', 'record-a');
    fs.rmSync(path.join(snapshotRoot(root), 'edit-a', 'blobs'), { recursive: true });
    const picker = restorePicker(root);
    const rows = await picker.load();
    expect(rows[0]?.disabled).toBe(true);
    expect((await picker.apply([rows[0]!.id]))?.draft).toBeUndefined();
    expect((await picker.apply(['unoffered']))?.draft).toBeUndefined();
  });

  it('cancels listing without publishing an empty successful catalogue', async () => {
    const root = workspace();
    const controller = new AbortController();
    controller.abort(new Error('listing cancelled'));
    await expect(restorePicker(root).load(controller.signal)).rejects.toThrow('listing cancelled');
  });
});
