import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createSecurityHarness, cleanupSecurityHarnesses } from '../test-utils/security.js';
import { cleansePicker } from '../cli/interactive/picker/cleanse.js';
import { OverlayHost } from '../cli/interactive/overlay.js';
import { decodeSecurity } from './findings/store.js';
import { securityInspection } from './view/inspection.js';

afterEach(cleanupSecurityHarnesses);

describe('security inspection', () => {
  it('returns stable identities and distinguishes an orphaned pending scan', () => {
    const h = createSecurityHarness();
    const id = h.plan();
    h.boundStore.write(state => ({ ...state, scans: state.scans.map(scan => ({ ...scan, status: 'running' as const })) }));
    const snapshot = h.service.inspection();
    expect(snapshot.identity).toEqual({ sessionId: h.session.id, workspaceRoot: h.root });
    expect(snapshot.items[0]).toMatchObject({ identity: `${h.session.id}/scan/${id}`, status: 'unknown', owner: 'none' });
    expect(snapshot.items[0]!.detail.join('\n')).toContain('no live local owner');
  });

  it('publishes a new structured snapshot and releases listeners', () => {
    const h = createSecurityHarness();
    const listener = vi.fn();
    const release = h.service.subscribeInspection(() => listener(h.service.inspection()));
    h.plan();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]![0].items[0]!.kind).toBe('scan');
    const version = listener.mock.calls[0]![0].version;
    release();
    h.plan();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(version).toMatch(/^[a-f0-9]{64}$/);
  });

  it('retains post-effect durability unknown while rejecting a failed preview publication', async () => {
    const h = createSecurityHarness();
    h.setStore({ read: h.boundStore.read, write: () => { throw new Error('synthetic preview save failure'); } });
    expect(h.plan).toThrow('could not be saved');
    expect(h.service.inspection().items).toEqual([]);
    h.setStore(h.boundStore); const id = h.plan();
    h.setStore({ read: h.boundStore.read, write: update => {
      if (h.run.mock.calls.length) throw new Error('synthetic post-effect save failure');
      h.boundStore.write(update);
    } });
    await h.service.scan(id);
    expect(h.service.inspection().items[0]).toMatchObject({ id, status: 'completed', durability: 'unknown', owner: 'none' });
  });

  it('does not start, cancel or write while a live approval is inspected and closed', async () => {
    const h = createSecurityHarness(); const id = h.plan();
    let answer!: (value: { decision: 'deny' }) => void;
    h.setApproval(() => new Promise(resolve => { answer = resolve; }));
    const scan = h.service.scan(id);
    await vi.waitFor(() => expect(answer).toBeDefined());
    const cancel = vi.spyOn(h.service, 'cancel');
    const statePath = path.join(h.manager.getSessionDirPath(h.session.id), 'state.json');
    const bytes = fs.readFileSync(statePath); const fileBytes = fs.readFileSync(h.file);
    const picker = cleansePicker({ read: () => ({ state: 'ready', snapshot: h.service.inspection() }),
      subscribe: listener => h.service.subscribeInspection(() => listener({ state: 'ready', snapshot: h.service.inspection() })) });
    const row = (await picker.load())[0]!;
    expect(row.note).toContain('permission-pending · live');
    const overlay = new OverlayHost(() => undefined); overlay.open(picker);
    await vi.waitFor(() => expect(picker.detail?.(row.id)?.join('\n')).toContain('permission-pending'));
    overlay.close();
    expect(cancel).not.toHaveBeenCalled(); expect(h.run).not.toHaveBeenCalled();
    expect(fs.readFileSync(statePath)).toEqual(bytes); expect(fs.readFileSync(h.file)).toEqual(fileBytes);
    answer({ decision: 'deny' }); await scan;
    expect(h.service.inspection().items[0]).toMatchObject({ status: 'denied', owner: 'none' });
  });

  it('bounds and redacts long findings and preserves orphaned remediation as unknown', async () => {
    const h = createSecurityHarness(); const id = h.plan(); await h.service.scan(id);
    const scan = h.service.scanRecord(id); const finding = scan.findings[0]!;
    h.boundStore.write(state => ({ ...state, scans: [{ ...scan, findings: Array.from({ length: 40 }, (_, index) => ({ ...finding, message: `api_key=synthetic-secret \x1b[31m ${index}` })) }],
      remediations: [{ id: 'proposal', scanId: id, fingerprint: finding.fingerprint, input: '', digest: 'd', expectedHashes: {}, afterHashes: {}, preview: 'token=synthetic-secret', status: 'permission-pending' }] }));
    const snapshot = h.service.inspection();
    expect(snapshot.items).toHaveLength(2);
    expect(snapshot.items[0]!.detail.length).toBeLessThan(40);
    const text = snapshot.items.flatMap(item => item.detail).join('\n');
    expect(text).toContain('20 additional findings');
    expect(text).not.toContain('synthetic-secret'); expect(text).not.toContain('\x1b');
    expect(snapshot.items[1]).toMatchObject({ status: 'unknown', owner: 'none' });
  });

  it('never displays arbitrary retained remediation status as terminal controls or credentials', async () => {
    const h = createSecurityHarness();
    const malicious = 'applied\x1b[31m api_key=synthetic-canary';
    const saved = decodeSecurity({ version: 1, scans: [], dispositions: [], remediations: [{
      id: 'proposal', scanId: 'scan', fingerprint: 'finding', status: malicious, input: '', digest: 'd', expectedHashes: {}, afterHashes: {}, preview: malicious,
    }] });
    const snapshot = securityInspection(saved, { sessionId: h.session.id, workspaceRoot: h.root });
    expect(snapshot.items[0]!.status).toBe('unknown');
    const picker = cleansePicker({ read: () => ({ state: 'ready', snapshot }), subscribe: () => () => undefined });
    const rows = await picker.load();
    expect(rows[0]!.note).toBe('unknown');
    const text = JSON.stringify(snapshot.items) + JSON.stringify(rows) + picker.detail?.(rows[0]!.id)?.join('\n');
    expect(text).not.toContain('synthetic-canary'); expect(text).not.toContain('\\u001b'); expect(text).not.toContain('\x1b');
  });
});
