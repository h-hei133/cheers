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
import { capturePromptSources } from '../../context/request/sources.js';
import { ExtensionService } from '../service.js';
import { ExtensionStore } from '../store/state.js';
import * as execution from './execute.js';
import type { ToolExecutionResult } from '../../tools/types.js';

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

it.each([false,true])('reduces installed before-tree scripts against their original envelope (cancel=%s)', async cancel => {
  const active={digest:digest('tree-events'),manifest:{name:'tree-events',scripts:[{name:'first',path:'first.ts'},{name:'second',path:'second.ts'}],commands:[],tools:[],skills:[]}} as unknown as VersionRecord;
  const owned=versionPath(active,registry); fs.mkdirSync(owned,{recursive:true});
  Object.assign(active,{files:{},directories:[],storage:storageIdentity(owned)});
  const record={name:'tree-events',active,activation:{[workspace]:{enabled:true,grants:['script:first','script:second']}}} as unknown as PackageRecord;
  const payload=Object.freeze({type:'session_before_tree',targetEntryId:'target'}), seen:unknown[]=[], scripts:string[]=[];
  closes.push(registerPackage({root:workspace,sessionId:'events',file:registry,current:() => {},withheld:() => {},run:async () => '',tool:() => {throw new Error('No tool');},
    event:async (_record,script,_event,original) => {seen.push(original);scripts.push(script);return script==='first'?{cancel,summary:{summary:'Installed custom summary'}}:{cancel:false};}},record));
  const result=await catalogContributions(workspace,'events')[0]!.onEvent!('session_before_tree',payload);
  expect(seen.every(event => event===payload)).toBe(true);
  expect(result).toEqual(cancel?{cancel:true}:{cancel:false,summary:{summary:'Installed custom summary'}});
  expect(scripts).toEqual(cancel?['first']:['first','second']);
});

it.each(['transform', 'handled', 'block', 'retry'] as const)('reduces native input across installed scripts (%s)', async mode => {
  const active = { digest: digest('input-events'), manifest: { name: 'input-events',
    scripts: [{ name: 'first', path: 'first.ts' }, { name: 'second', path: 'second.ts' }], commands: [], tools: [], skills: [] } } as unknown as VersionRecord;
  const owned = versionPath(active, registry); fs.mkdirSync(owned, { recursive: true });
  Object.assign(active, { files: {}, directories: [], storage: storageIdentity(owned) });
  const record = { name: 'input-events', active, activation: { [workspace]: { enabled: true, grants: ['script:first', 'script:second'] } } } as unknown as PackageRecord;
  const image = Object.freeze({ type: 'image', data: 'opaque-image-data', mimeType: 'image/png' });
  const payload = Object.freeze({ type: 'input', text: 'Original', prompt: 'Original', sessionId: 'input-events',
    workspaceRoot: workspace, timestamp: 'original', source: 'sdk', images: Object.freeze([image]) });
  const seen: unknown[] = [], scripts: string[] = [];
  closes.push(registerPackage({ root: workspace, sessionId: 'input-events', file: registry, current: () => {}, withheld: () => {},
    run: async () => '', tool: () => { throw new Error('No tool'); }, event: async (_record, script, _event, value) => {
      seen.push(value); scripts.push(script);
      if (script === 'second') return { action: 'transform', text: 'Final', images: [] };
      return mode === 'transform' ? { action: 'transform', text: 'First', source: 'extension', sessionId: 'replacement' }
        : mode === 'handled' ? { action: 'handled' } : { decision: mode, reason: 'PRIVATE_INPUT_REASON' };
    } }, record));
  const pending = catalogContributions(workspace, 'input-events')[0]!.onEvent!('input', payload);
  if (mode === 'block' || mode === 'retry') {
    await expect(pending).rejects.toMatchObject({ name: 'InputRefusal', message: 'Extension input was refused.' });
  } else {
    expect(await pending).toEqual(mode === 'handled' ? { action: 'handled' } : { action: 'transform', text: 'Final', images: [] });
  }
  expect(scripts).toEqual(mode === 'transform' ? ['first', 'second'] : ['first']);
  expect(seen).toEqual(mode === 'transform' ? [payload, { ...payload, text: 'First', prompt: 'First' }] : [payload]);
});

it.each(['then-getter', 'thenable', 'mixed-decision'] as const)('refuses installed callback %s before consuming it', async kind => {
  const active = { digest: digest('input-callbacks'), manifest: { name: 'input-callbacks',
    scripts: [{ name: 'first', path: 'first.ts' }, { name: 'second', path: 'second.ts' }], commands: [], tools: [], skills: [] } } as unknown as VersionRecord;
  const owned = versionPath(active, registry); fs.mkdirSync(owned, { recursive: true });
  Object.assign(active, { files: {}, directories: [], storage: storageIdentity(owned) });
  const record = { name: 'input-callbacks', active, activation: { [workspace]: { enabled: true, grants: ['script:first', 'script:second'] } } } as unknown as PackageRecord;
  const payload = Object.freeze({ type: 'input', text: 'Original', prompt: 'Original', sessionId: 'input-callbacks',
    workspaceRoot: workspace, timestamp: 'original', source: 'sdk' });
  let touched = 0; const scripts: string[] = [];
  const value = kind === 'then-getter' ? Object.defineProperty({ action: 'continue' }, 'then', { get: () => { touched++; return undefined; } })
    : kind === 'thenable' ? { then: (resolve: (value: unknown) => void) => { touched++; resolve({ action: 'continue' }); } }
    : { action: 'handled', decision: 'unknown' };
  closes.push(registerPackage({ root: workspace, sessionId: 'input-callbacks', file: registry, current: () => {}, withheld: () => {},
    run: async () => '', tool: () => { throw new Error('No tool'); }, event: ((_record: PackageRecord, script: string) => {
      scripts.push(script); return value;
    }) as never }, record));
  const outcome = await catalogContributions(workspace, 'input-callbacks')[0]!.onEvent!('input', payload)
    .then(result => ({ result }), error => ({ error }));
  expect(touched).toBe(0);
  expect(outcome).toMatchObject({ error: { name: 'InputRefusal', message: 'Extension input was refused.' } });
  expect(scripts).toEqual(['first']);
});

it.each(['block', 'retry', 'unknown', 'invalid'] as const)(
  'keeps an installed legacy UserPromptSubmit %s from being erased by a later script allow', async decision => {
    const active = { digest: digest('legacy-input-chain'), manifest: { name: 'legacy-input-chain',
      scripts: [{ name: 'first', path: 'first.ts' }, { name: 'second', path: 'second.ts' }], commands: [], tools: [], skills: [] } } as unknown as VersionRecord;
    const owned = versionPath(active, registry); fs.mkdirSync(owned, { recursive: true });
    Object.assign(active, { files: {}, directories: [], storage: storageIdentity(owned) });
    const record = { name: 'legacy-input-chain', active,
      activation: { [workspace]: { enabled: true, grants: ['script:first', 'script:second'] } } } as unknown as PackageRecord;
    const payload = Object.freeze({ eventName: 'UserPromptSubmit', sessionId: 'legacy-input-chain', workspaceRoot: workspace,
      timestamp: 'original', prompt: 'Original prompt' });
    const refusal = { decision, reason: 'Original refusal', feedback: 'Keep this decision' };
    const seen: unknown[] = [], scripts: string[] = [];
    closes.push(registerPackage({ root: workspace, sessionId: 'legacy-input-chain', file: registry, current: () => {}, withheld: () => {},
      run: async () => '', tool: () => { throw new Error('No tool'); }, event: async (_record, script, _event, value) => {
        seen.push(value); scripts.push(script);
        return script === 'first' ? refusal : { decision: 'allow', feedback: 'Must not replace refusal' };
      } }, record));
    const pending = catalogContributions(workspace, 'legacy-input-chain')[0]!.onEvent!('UserPromptSubmit', payload);
    if (decision === 'invalid') await expect(pending).rejects.toMatchObject({ name: 'InputRefusal', message: 'Extension input was refused.' });
    else expect(await pending).toEqual(refusal);
    expect(scripts).toEqual(['first']); expect(seen).toEqual([payload]);
    expect(seen.every(value => Object.isFrozen(value))).toBe(true);
  });

it('keeps original legacy UserPromptSubmit data while combining installed script feedback', async () => {
  const active = { digest: digest('legacy-input-feedback'), manifest: { name: 'legacy-input-feedback',
    scripts: [{ name: 'first', path: 'first.ts' }, { name: 'second', path: 'second.ts' }], commands: [], tools: [], skills: [] } } as unknown as VersionRecord;
  const owned = versionPath(active, registry); fs.mkdirSync(owned, { recursive: true });
  Object.assign(active, { files: {}, directories: [], storage: storageIdentity(owned) });
  const record = { name: 'legacy-input-feedback', active,
    activation: { [workspace]: { enabled: true, grants: ['script:first', 'script:second'] } } } as unknown as PackageRecord;
  const payload = { eventName: 'UserPromptSubmit', sessionId: 'legacy-input-feedback', workspaceRoot: workspace,
    timestamp: 'original', prompt: 'Original prompt' };
  const seen: unknown[] = [];
  closes.push(registerPackage({ root: workspace, sessionId: 'legacy-input-feedback', file: registry, current: () => {}, withheld: () => {},
    run: async () => '', tool: () => { throw new Error('No tool'); }, event: async (_record, script, _event, value) => {
      seen.push(value); return { decision: 'allow', feedback: `${script} feedback` };
    } }, record));
  const result = await catalogContributions(workspace, 'legacy-input-feedback')[0]!.onEvent!('UserPromptSubmit', payload);
  expect(seen).toEqual([payload, payload]); expect(seen.every(value => Object.isFrozen(value))).toBe(true);
  expect(result).toMatchObject({ decision: 'allow', feedback: expect.stringContaining('first feedback') });
  expect(result).toMatchObject({ feedback: expect.stringContaining('second feedback') });
});

it.each((['input', 'UserPromptSubmit'] as const).flatMap(eventName =>
  (['failed', 'unknown-cleanup', 'missing-cleanup', 'invalid-json', 'legacy-block', 'transform', 'handled'] as const)
    .map(mode => ({ eventName, mode }))))(
  'keeps installed $eventName callback admission tied to execution and cleanup ($mode)', async ({ eventName, mode }) => {
    const result: ToolExecutionResult = { success: mode !== 'failed', output: 'PRIVATE_EXECUTION_DETAIL',
      metadata: {
        ...(mode === 'missing-cleanup' ? {} : { cleanup: mode === 'unknown-cleanup' ? 'unknown' : 'confirmed' }),
        eventOutput: mode === 'invalid-json' ? '{' : JSON.stringify(mode === 'legacy-block'
          ? { decision: 'block', reason: 'PRIVATE_INPUT_REASON' }
          : eventName === 'UserPromptSubmit' ? { decision: 'allow', feedback: 'Installed feedback' }
          : mode === 'handled' ? { action: 'handled' } : { action: 'transform', text: 'Installed input' }),
      } };
    vi.spyOn(execution, 'executeScript').mockResolvedValue(result);
    const store = new ExtensionStore(registry);
    const service = new ExtensionService({ root: workspace, store, check: () => {}, offline: () => false,
      denyRules: () => [], assertWorkspace: () => {}, gate: () => ({ sessionId: 'input-events', workspaceRoot: workspace }) as never });
    vi.spyOn(service, 'current').mockImplementation(() => {});
    const event = { type: 'input', text: 'Original', prompt: 'Original', sessionId: 'input-events', workspaceRoot: workspace,
      timestamp: 'original', source: 'sdk' };
    try {
      const consumer = service as unknown as { dispatchEvent(record: PackageRecord, script: string, event: string,
        payload: unknown, aliases: readonly string[] | undefined, epoch: number): Promise<unknown> };
      const pending = consumer.dispatchEvent({ active: { manifest: { permissions: { workspace: 'read' } } } } as PackageRecord,
        'input', eventName, event, undefined, 0);
      if (mode === 'transform' || mode === 'handled' || eventName === 'UserPromptSubmit' && mode === 'legacy-block') {
        expect(await pending).toEqual(mode === 'legacy-block' ? { decision: 'block', reason: 'PRIVATE_INPUT_REASON' }
          : eventName === 'UserPromptSubmit' ? { decision: 'allow', feedback: 'Installed feedback' }
          : mode === 'handled' ? { action: 'handled' } : { action: 'transform', text: 'Installed input' });
      } else {
        await expect(pending).rejects.toMatchObject({ name: 'InputRefusal', message: 'Extension input was refused.' });
      }
      expect(execution.executeScript).toHaveBeenCalledTimes(1);
    } finally { await service.close(); }
  });

it.each(['confirmed', 'failed', 'unknown-cleanup', 'invalid'] as const)(
  'binds installed tool result decoding to the private event output and confirmed worker settlement (%s)', async mode => {
    const result: ToolExecutionResult = { success: mode !== 'failed',
      output: JSON.stringify({ output: 'Wrong output channel' }),
      metadata: { cleanup: mode === 'unknown-cleanup' ? 'unknown' : 'confirmed',
        eventOutput: JSON.stringify(mode === 'invalid' ? { isError: false, output: 'Invalid replacement' }
          : { output: 'Installed replacement', feedback: 'Installed feedback' }) } };
    vi.spyOn(execution, 'executeScript').mockResolvedValue(result);
    const store = new ExtensionStore(registry);
    const service = new ExtensionService({ root: workspace, store, check: () => {}, offline: () => false,
      denyRules: () => [], assertWorkspace: () => {}, gate: () => ({ sessionId: 'tool-result', workspaceRoot: workspace }) as never });
    vi.spyOn(service, 'current').mockImplementation(() => {});
    try {
      const consumer = service as unknown as { dispatchEvent(record: PackageRecord, script: string, event: string,
        payload: unknown, aliases: readonly string[] | undefined, epoch: number): Promise<unknown> };
      const pending = consumer.dispatchEvent({ active: { manifest: { permissions: { workspace: 'read' } } } } as PackageRecord,
        'result', 'tool_result', { type: 'tool_result' }, undefined, 0);
      if (mode === 'confirmed') {
        await expect(pending).resolves.toEqual({ output: 'Installed replacement', feedback: 'Installed feedback' });
      } else {
        await expect(pending).rejects.toThrow(/cleanup is unverified|returned invalid data/);
      }
      expect(execution.executeScript).toHaveBeenCalledOnce();
    } finally { await service.close(); }
  });

it('enforces the shared manifest budget for cold and prewarmed extension catalogs', async () => {
  installed('alpha'); installed('beta');
  await expect(resolveSkillCatalog({ workspaceRoot: workspace, sessionId: 'capture' })).rejects.toThrow(/no complete catalog/);
  for (const contribution of catalogContributions(workspace, 'capture')) expect(await contribution.skills()).toHaveLength(9);
  await expect(resolveSkillCatalog({ workspaceRoot: workspace, sessionId: 'capture' })).rejects.toThrow(/no complete catalog/);
});

it('observes actual installed manifest bytes on cold acquisition and retains warm inventory freshness', async () => {
  const file = installed('alpha', 1, 32); const sources = capturePromptSources(); const observed = vi.fn(sources.track);
  const cold = await resolveSkillCatalog({ workspaceRoot: workspace, sessionId: 'capture' }, observed);
  expect(observed).toHaveBeenCalledWith(file, fs.readFileSync(file)); await sources.verifyContent(new AbortController().signal);
  const warmObserved = vi.fn(); const warm = await resolveSkillCatalog({ workspaceRoot: workspace, sessionId: 'capture' }, warmObserved);
  expect(warmObserved.mock.calls.some(([, bytes]) => Buffer.isBuffer(bytes))).toBe(false);
  expect(warm.skills.get('alpha-0')?.isCurrent?.()).toBe(true);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('cached', 'edited'));
  expect(cold.skills.get('alpha-0')?.isCurrent?.()).toBe(false); expect(warm.skills.get('alpha-0')?.isCurrent?.()).toBe(false);
});

it('propagates an installed skill observer rejection without invoking ordinary withholding', async () => {
  installed('alpha', 1, 32);
  await expect(resolveSkillCatalog({ workspaceRoot: workspace, sessionId: 'capture' }, (_target, bytes) => {
    if (bytes) throw new Error('PRIVATE_OBSERVER_DETAIL');
  })).rejects.toMatchObject({ name: 'SkillSourceError', message: 'Skill source observation failed; no complete catalog is available.' });
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
