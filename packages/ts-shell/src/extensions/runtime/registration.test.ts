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

let fixture: string; let workspace: string; let registry: string;
const closes: Array<() => void> = [];
beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'registered-skills-')); workspace = path.join(fixture, 'workspace'); fs.mkdirSync(workspace);
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
