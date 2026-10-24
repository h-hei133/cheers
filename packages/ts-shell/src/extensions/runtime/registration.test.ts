import fs, { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { registerPackage } from './registration.js';
import { catalogContributions } from '../../core/catalog/contributions.js';
import { resolveSkillCatalog } from '../../core/skills/skillCatalog.js';
import { prepareToolCall } from '../../core/agent/tools.js';
import { assertInventory } from '../archive/storage.js';
import { digest } from '../registry/validation.js';
import { versionPath, storageIdentity } from '../store/state.js';
import type { PackageRecord, VersionRecord } from '../model.js';
import { skillPicker } from '../../cli/interactive/picker/skills.js';
import { OverlayHost } from '../../cli/interactive/overlay.js';
import { parseKeyEvent } from '../../presentation/tui/input/keys.js';
import { visibleWidth } from '../../presentation/tui/text/measure.js';
import { stripAnsi } from '../../presentation/tui/text/ansi.js';

let fixture: string; let workspace: string; let registry: string;
const closes: Array<() => void> = [];
beforeEach(() => {
  const scratch = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(scratch, { recursive: true });
  fixture = fs.mkdtempSync(path.join(scratch, 'registered-skills-')); workspace = path.join(fixture, 'workspace'); fs.mkdirSync(workspace);
  execFileSync('git', ['init', '-q', workspace]); registry = path.join(fixture, 'owned', 'registry.json');
  vi.stubEnv('HOME', path.join(fixture, 'home')); vi.stubEnv('USERPROFILE', path.join(fixture, 'home'));
});
afterEach(() => { closes.splice(0).forEach(close => close()); vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(fixture, { recursive: true, force: true }); });

function installed(name: string, count = 9, bytes = 490 * 1024): string {
  const active = { manifest: { schema: 1, name, version: '1.0.0', description: 'Synthetic package', permissions: { workspace: 'read', network: 'none' },
    skills: Array.from({ length: count }, (_, index) => ({ path: `skill-${index}.md` })), scripts: [], commands: [], tools: [] },
    digest: digest(name), url: 'https://example.invalid/synthetic', source: 'synthetic', sourceIdentity: digest('source'),
    trustFingerprint: digest('trust'), files: {}, directories: [], storage: [] } as VersionRecord;
  const owned = versionPath(active, registry); fs.mkdirSync(owned, { recursive: true });
  for (const [index, skill] of active.manifest.skills.entries()) {
    const content = `---\nname: ${name}-${index}\ndescription: cached instructions\n---\n` + 'x'.repeat(bytes);
    fs.writeFileSync(path.join(owned, skill.path), content); (active.files as Record<string, string>)[skill.path] = digest(content);
  }
  (active as { storage: unknown }).storage = storageIdentity(owned);
  const record: PackageRecord = { name, active, history: [], activation: { [workspace]: { enabled: true, grants: ['prompt'], workspaceIdentity: 'synthetic' } } };
  closes.push(registerPackage({ root: workspace, sessionId: 'capture', file: registry, current: () => assertInventory(owned, active),
    withheld: () => { throw new Error('Resource or cleanup failures must propagate.'); },
    run: async () => { throw new Error('No tool execution'); }, tool: () => { throw new Error('No tools'); } }, record));
  return path.join(owned, active.manifest.skills[0]!.path);
}

it('enforces the shared manifest budget for cold and prewarmed extension catalogs', async () => {
  installed('alpha'); installed('beta');
  await expect(resolveSkillCatalog({ workspaceRoot: workspace, sessionId: 'capture' })).rejects.toThrow(/no complete catalog/);
  for (const contribution of catalogContributions(workspace, 'capture')) expect(await contribution.skills()).toHaveLength(9);
  await expect(resolveSkillCatalog({ workspaceRoot: workspace, sessionId: 'capture' })).rejects.toThrow(/no complete catalog/);
});

it('preserves actual manifest cleanup failure over concurrent cancellation before permission', async () => {
  const file = installed('alpha', 1, 16); const controller = new AbortController(); const permission = vi.fn();
  const open = fsp.open; let close: (() => Promise<void>) | undefined; let captured: Awaited<ReturnType<typeof open>> | undefined;
  vi.spyOn(fsp, 'open').mockImplementation(async (...args) => {
    const handle = await open(...args);
    if (args[0] === file) {
      captured = handle; close = handle.close.bind(handle);
      vi.spyOn(handle, 'close').mockImplementation(async () => { controller.abort(); throw new Error('PRIVATE_CLOSE_DETAIL'); });
    }
    return handle;
  });
  try {
    const result = await prepareToolCall([{ name: 'capture', prepareArguments: async (_args, signal) => {
      await resolveSkillCatalog({ workspaceRoot: workspace, sessionId: 'capture', abortSignal: signal }); return {};
    }, execute: async () => ({ output: 'unexpected execution', isError: false }) }], { role: 'assistant', content: [] },
      { id: 'capture', name: 'capture', args: {} }, { beforeToolCall: permission }, controller.signal);
    expect(result).toMatchObject({ kind: 'immediate', result: { isError: true, output: expect.stringMatching(/cleanup could not be verified/) } });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_CLOSE_DETAIL'); expect(permission).not.toHaveBeenCalled(); expect(captured!.fd).not.toBe(-1);
  } finally { await close?.(); }
});


it.each([32, 128 * 1024])('keeps installed skill cache checks separate from repeated picker rendering (%i body bytes)', async bytes => {
  const file = installed('alpha', 1, bytes), before = fs.readFileSync(file);
  const readSync = fs.readFileSync.bind(fs), open = fsp.open.bind(fsp);
  let inventoryBytes = 0, manifestBytes = 0, active = 0, closed = 0;
  vi.spyOn(fs, 'readFileSync').mockImplementation(((target, ...args) => {
    const result = readSync(target, ...args);
    if (String(target) === file) inventoryBytes += Buffer.byteLength(result);
    return result;
  }) as typeof fs.readFileSync);
  vi.spyOn(fsp, 'open').mockImplementation(async (...args) => {
    const handle = await open(...args);
    if (String(args[0]) !== file) return handle;
    active++;
    const read = handle.read.bind(handle), close = handle.close.bind(handle);
    handle.read = (async (buffer: Buffer, offset: number, length: number, position: number) => {
      const result = await read(buffer, offset, length, position); manifestBytes += result.bytesRead; return result;
    }) as typeof handle.read;
    handle.close = async () => { await close(); active--; closed++; };
    return handle;
  });
  for (let round = 0; round < 10; round++) {
    const picker = skillPicker({ cwd: workspace, sessionId: 'capture' });
    const load = vi.spyOn(picker, 'load'), changed = vi.fn(), host = new OverlayHost(changed);
    const priorInventory = inventoryBytes;
    host.open(picker);
    try {
      await load.mock.results[0]!.value;
      await vi.waitFor(() => expect(stripAnsi(host.render(80, 24).join('\n'))).toContain('alpha-0'));
      // A warm parsed cache still revalidates the installed inventory. Account
      // for those synchronous body reads separately from the descriptor loader.
      expect(inventoryBytes).toBeGreaterThan(priorInventory);
      expect(manifestBytes).toBe(before.length); expect(active).toBe(0); expect(closed).toBe(1);
      const retained = host as unknown as { baseOptions: readonly { id: string; detail?: string }[]; model: { total: number } };
      expect(retained.baseOptions).toHaveLength(1);
      expect(Buffer.byteLength(JSON.stringify(retained.baseOptions))).toBeLessThan(512);
      expect(JSON.stringify(retained.baseOptions)).not.toContain('x'.repeat(bytes));
      const acquired = inventoryBytes;
      host.handlePaste('alpha');
      for (const width of [20, 40, 80, 120, 200]) for (const height of [8, 24, 40, 80]) {
        const frame = host.render(width, height);
        expect(frame.length).toBeLessThanOrEqual(height); expect(frame.every(line => visibleWidth(line) <= width)).toBe(true);
      }
      const apply = vi.fn(); host.handleKey(parseKeyEvent('\x1b'), apply);
      expect(apply).not.toHaveBeenCalled(); expect(host.active).toBe(false);
      expect(retained.baseOptions).toEqual([]); expect(retained.model.total).toBe(0);
      await expect(picker.apply(['alpha-0'])).resolves.toBeUndefined();
      expect(inventoryBytes).toBe(acquired); expect(manifestBytes).toBe(before.length);
    } finally { host.close(); }
  }
  expect(readSync(file)).toEqual(before);
});

it.each(['dirty', 'unregistered'] as const)('withholds a cached installed skill %s after the picker accepted it', async change => {
  const file = installed('alpha', 1, 32), before = fs.readFileSync(file);
  const picker = skillPicker({ cwd: workspace, sessionId: 'capture' }), host = new OverlayHost(() => {});
  const load = vi.spyOn(picker, 'load'); host.open(picker);
  try {
    await load.mock.results[0]!.value;
    await vi.waitFor(() => expect(stripAnsi(host.render(80, 24).join('\n'))).toContain('alpha-0'));
    const apply = vi.fn(); host.handleKey(parseKeyEvent('\r'), apply);
    expect(apply).toHaveBeenCalledWith(picker, ['alpha-0']);
    if (change === 'dirty') fs.appendFileSync(file, '\nCHANGED_PRIVATE_BODY');
    else closes[0]!();
    const result = await picker.apply(['alpha-0']);
    expect(result?.draft).toBeUndefined(); expect(result?.note).not.toContain('x'.repeat(32));
    expect(result?.note).not.toContain('CHANGED_PRIVATE_BODY');
    expect(result?.note).toMatch(/unavailable|no longer available/);
    expect(fs.readFileSync(file)).toEqual(change === 'dirty' ? Buffer.concat([before, Buffer.from('\nCHANGED_PRIVATE_BODY')]) : before);
  } finally { host.close(); }
});
