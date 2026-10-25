import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SkillLoader } from './skillLoader.js';
import { SkillDiscovery } from './discovery.js';
import { resolveSkillCatalog } from './skillCatalog.js';
import { registerCatalogContribution } from '../catalog/contributions.js';
import { capturePromptSources } from '../../context/request/sources.js';
import * as snapshots from '../../runtime/execution/snapshot.js';

let root: string;
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true }); root = fs.mkdtempSync('/tmp/cheers-test/skill-observation-');
  const home = path.join(root, 'home'); fs.mkdirSync(home); vi.stubEnv('CHEERS_TEST_ROOT', home); vi.stubEnv('USERPROFILE', home);
  fs.mkdirSync(path.join(root, '.git'));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it('reports raw manifest bytes before decoding and observes disabled candidates too', async () => {
  const file = path.join(root, 'method.md'); const disabled = path.join(root, 'disabled.md');
  const raw = Buffer.concat([Buffer.from('---\nname: method\ndescription: from file\n---\n  '), Buffer.from([0xff])]);
  fs.writeFileSync(file, raw); fs.writeFileSync(disabled, '---\nenabled: false\n---\nnot offered');
  const seen = new Map<string, Buffer>();
  const loaded = await new SkillLoader(root, { disableDiscovery: true, extraPaths: [file, disabled],
    onSource: (target, bytes) => { if (bytes) seen.set(target, bytes); } }).loadDetailed();
  expect(loaded.skills.get('method')?.body).toBe('\ufffd'); expect(loaded.skills.has('disabled')).toBe(false);
  expect(seen.get(file)).toEqual(raw); expect(seen.get(disabled)).toEqual(fs.readFileSync(disabled));
});

it('binds a discovered nested manifest even when metadata and decoded text stay equal', async () => {
  const directory = path.join(root, '.agents', 'skills', 'group', 'method'); fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'SKILL.md'); const prefix = Buffer.from('---\nname: method\ndescription: discovered\n---\n');
  const raw = Buffer.concat([prefix, Buffer.from([0xff])]); fs.writeFileSync(file, raw);
  const stat = fs.statSync.bind(fs); const lstat = fs.lstatSync.bind(fs);
  const metadata = stat(file, { bigint: true }); const entry = lstat(file, { bigint: true });
  vi.spyOn(fs, 'statSync').mockImplementation(((target, options) => String(target) === file && options?.bigint ? metadata : stat(target, options)) as typeof fs.statSync);
  vi.spyOn(fs, 'lstatSync').mockImplementation(((target, options) => String(target) === file && options?.bigint ? entry : lstat(target, options)) as typeof fs.lstatSync);
  const sources = capturePromptSources();
  const catalog = await resolveSkillCatalog({ workspaceRoot: root }, sources.track);
  expect(catalog.skills.get('method')?.body).toBe('\ufffd'); await sources.verifyContent(new AbortController().signal);
  fs.writeFileSync(file, Buffer.concat([prefix, Buffer.from([0xfe])])); expect(() => catalog.verify?.()).not.toThrow();
  expect(() => sources.verify()).not.toThrow(); await expect(sources.verifyContent(new AbortController().signal)).rejects.toThrow('bytes changed');
});

it('retains the enclosing observer when a loader supplies a separate local observer', async () => {
  const file = path.join(root, 'method.md'); fs.writeFileSync(file, '---\nname: method\ndescription: synthetic\n---\nbody');
  const enclosing = vi.fn(); const local = vi.fn(); const reader = new SkillDiscovery(undefined, undefined, enclosing);
  await new SkillLoader(root, { disableDiscovery: true, extraPaths: [file], discovery: reader, onSource: local }).load();
  expect(enclosing).toHaveBeenCalledWith(file, fs.readFileSync(file)); expect(local).toHaveBeenCalledWith(file, fs.readFileSync(file));
  expect(enclosing.mock.calls.filter(([, bytes]) => bytes)).toHaveLength(1); expect(local.mock.calls.filter(([, bytes]) => bytes)).toHaveLength(1);
});

it('deduplicates the same enclosing and local observer and stops before a local observer on cancellation', () => {
  const same = vi.fn(); const reader = new SkillDiscovery(undefined, undefined, same);
  reader.observe('file', Buffer.from('body'), same); expect(same).toHaveBeenCalledTimes(1);
  const controller = new AbortController(); const local = vi.fn();
  const cancelled = new SkillDiscovery(controller.signal, undefined, () => controller.abort());
  expect(() => cancelled.observe('file', Buffer.from('body'), local)).toThrow(); expect(local).not.toHaveBeenCalled();
});

it('reports content from an extension loader through the enclosing discovery observer', async () => {
  const file = path.join(root, 'extension.md'); fs.writeFileSync(file, '---\nname: extension\ndescription: extension\n---\nbody');
  const unregister = registerCatalogContribution({ root, sessionId: 'capture', tools: [], commands: [], skills: async (signal, discovery) =>
    [...(await new SkillLoader(root, { disableDiscovery: true, extraPaths: [file], abortSignal: signal, discovery }).load()).values()],
  });
  const seen = vi.fn();
  try {
    const catalog = await resolveSkillCatalog({ workspaceRoot: root, sessionId: 'capture' }, seen);
    expect(catalog.skills.has('extension')).toBe(true);
    expect(seen).toHaveBeenCalledWith(file, fs.readFileSync(file));
  } finally { unregister(); }
});

it('propagates content observation rejection without skipping the skill or publishing private details', async () => {
  const file = path.join(root, 'method.md'); fs.writeFileSync(file, '---\nname: method\ndescription: synthetic\n---\nbody');
  const loader = new SkillLoader(root, { disableDiscovery: true, extraPaths: [file], onSource: (_target, bytes) => {
    if (bytes) throw new Error('PRIVATE_CALLBACK_DETAIL');
  } });
  await expect(loader.loadDetailed()).rejects.toMatchObject({ name: 'SkillSourceError', message: 'Skill source observation failed; no complete catalog is available.' });
  await expect(resolveSkillCatalog({ workspaceRoot: root, noSkills: true, skillPaths: [file] }, (_target, bytes) => {
    if (bytes) throw new Error('PRIVATE_CALLBACK_DETAIL');
  })).rejects.toThrow('no complete catalog');
});

it('rechecks cancellation after observation and never starts another manifest', async () => {
  const files = ['one', 'two'].map(name => { const file = path.join(root, `${name}.md`); fs.writeFileSync(file, `---\nname: ${name}\ndescription: synthetic\n---\nbody`); return file; });
  const controller = new AbortController(); const seen = vi.fn((_target: string, bytes?: Buffer) => { if (bytes) controller.abort(); });
  await expect(new SkillLoader(root, { disableDiscovery: true, extraPaths: files, abortSignal: controller.signal, onSource: seen }).load()).rejects.toMatchObject({ name: 'AbortError' });
  expect(seen.mock.calls.filter(([, bytes]) => bytes)).toHaveLength(1); expect(seen.mock.calls.some(([target]) => target === files[1])).toBe(false);
});

it('keeps the shared verified reader raw, bounded and cancellable', async () => {
  const file = path.join(root, 'raw'); const raw = Buffer.from([0xef, 0xbb, 0xbf, 0xff]); fs.writeFileSync(file, raw);
  expect(await new SkillDiscovery().content(root, file)).toEqual(raw);
  fs.writeFileSync(file, Buffer.alloc(512 * 1024 + 1));
  await expect(new SkillDiscovery().content(root, file)).rejects.toThrow('byte limit');
  const controller = new AbortController(); controller.abort();
  await expect(new SkillDiscovery(controller.signal).content(root, file)).rejects.toMatchObject({ name: 'AbortError' });
});

it('observes the named alias as well as the canonical bytes', async () => {
  const file = path.join(root, 'method.md'); const alias = path.join(root, 'alias.md'); const second = path.join(root, 'second.md');
  const raw = '---\nname: method\ndescription: synthetic\n---\nbody'; fs.writeFileSync(file, raw); fs.writeFileSync(second, raw); fs.symlinkSync(file, alias);
  const sources = capturePromptSources(); await resolveSkillCatalog({ workspaceRoot: root, noSkills: true, skillPaths: [alias] }, sources.track);
  await sources.verifyContent(new AbortController().signal); fs.unlinkSync(alias); fs.symlinkSync(second, alias);
  await expect(sources.verifyContent(new AbortController().signal)).rejects.toThrow('source changed');
});

it('accounts serial manifest and byte-verification reads separately from synchronous metadata checks', async () => {
  const files = ['one', 'two'].map(name => { const file = path.join(root, `${name}.md`); fs.writeFileSync(file, `---\nname: ${name}\ndescription: synthetic\n---\n${name.repeat(100)}`); return file; });
  const original = snapshots.readBinarySnapshot; let active = 0; let peak = 0; let bytes = 0;
  const read = vi.spyOn(snapshots, 'readBinarySnapshot').mockImplementation(async (...args) => {
    active++; peak = Math.max(peak, active);
    try { const result = await original(...args); bytes += result.length; return result; }
    finally { active--; }
  });
  const sources = capturePromptSources(); const catalog = await resolveSkillCatalog({ workspaceRoot: root, noSkills: true, skillPaths: files }, sources.track);
  const expected = files.reduce((total, file) => total + fs.statSync(file).size, 0);
  expect(bytes).toBe(expected); expect(read).toHaveBeenCalledTimes(2); expect(active).toBe(0);
  for (let i = 0; i < 20; i++) { catalog.verify?.(); sources.verify(); }
  expect(bytes).toBe(expected); expect(read).toHaveBeenCalledTimes(2);
  await sources.verifyContent(new AbortController().signal);
  expect(bytes).toBe(expected * 2); expect(read).toHaveBeenCalledTimes(4); expect(peak).toBe(1); expect(active).toBe(0);
  expect(read.mock.calls.slice(2).map(([, maximum]) => maximum)).toEqual(files.map(file => fs.statSync(file).size));
});
