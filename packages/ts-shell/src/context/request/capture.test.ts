import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { capturePromptSources } from './sources.js';
import { loadAppendedInstructionFiles, loadInstructionFiles } from '../instructions/projectInstructions.js';
import { expandImports } from '../instructions/importExpansion.js';
import { TemplateLoader } from '../../core/prompts/templateLoader.js';

let root: string;
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true }); root = fs.mkdtempSync('/tmp/cheers-test/prompt-capture-');
  const home = path.join(root, 'home'); fs.mkdirSync(home); vi.stubEnv('CHEERS_TEST_ROOT', home); vi.stubEnv('USERPROFILE', home);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it('captures instruction and appended raw bytes before BOM removal and budget truncation', async () => {
  fs.mkdirSync(path.join(root, '.git')); const rule = path.join(root, 'AGENTS.md'); const append = path.join(root, 'APPEND_SYSTEM.md');
  const raw = Buffer.from([0xef, 0xbb, 0xbf, 0x61, 0xff]); fs.writeFileSync(rule, raw); fs.writeFileSync(append, raw);
  const sources = capturePromptSources(); const seen = new Map<string, Buffer>();
  const onSource = (target: string, content?: Buffer) => { sources.track(target, content); if (content) seen.set(target, content); };
  const options = { cwd: root, homeDir: path.join(root, 'home'), maxBytes: 1, onSource };
  expect(loadInstructionFiles(options).files[0]?.content).toBe('a');
  expect(loadAppendedInstructionFiles(options).files[0]?.content).toBe('a');
  expect(seen.get(rule)).toEqual(raw); expect(seen.get(append)).toEqual(raw);
  await sources.verifyContent(new AbortController().signal);
});

it('captures imported bytes against their original alias and nested source', async () => {
  const file = path.join(root, 'rules.md'); const alias = path.join(root, 'alias.md'); const nested = path.join(root, 'nested.md');
  fs.writeFileSync(file, '@./nested.md'); fs.writeFileSync(nested, Buffer.from([0xff])); fs.symlinkSync(file, alias);
  const sources = capturePromptSources(); const seen = new Map<string, Buffer>();
  const expanded = expandImports('@./alias.md', { baseDirectory: root, projectRoot: root,
    onSource: (target, content) => { sources.track(target, content); if (content) seen.set(target, content); } });
  expect(expanded.content).toBe('\ufffd'); expect(seen.get(alias)?.toString()).toBe('@./nested.md');
  expect(seen.get(nested)).toEqual(Buffer.from([0xff])); await sources.verifyContent(new AbortController().signal);
});

it('captures template frontmatter and body before transformation', async () => {
  fs.mkdirSync(path.join(root, '.git')); const directory = path.join(root, '.agents', 'prompts'); fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'method.md'); const raw = Buffer.concat([Buffer.from('---\ncomposable: true\n---\n  body '), Buffer.from([0xff])]);
  fs.writeFileSync(file, raw); const sources = capturePromptSources(); const seen = new Map<string, Buffer>();
  const templates = new TemplateLoader(root, (target, content) => { sources.track(target, content); if (content) seen.set(target, content); }).load();
  expect(templates.get('method')?.content).toBe('body \ufffd'); expect(seen.get(file)).toEqual(raw);
  await sources.verifyContent(new AbortController().signal);
});

it('propagates post-read admission failures from every loader instead of skipping a changed source', () => {
  fs.mkdirSync(path.join(root, '.git')); fs.writeFileSync(path.join(root, 'AGENTS.md'), 'rules');
  fs.writeFileSync(path.join(root, 'APPEND_SYSTEM.md'), 'append'); fs.writeFileSync(path.join(root, 'import.md'), 'import');
  const directory = path.join(root, '.agents', 'prompts'); fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, 'method.md'), 'method');
  const failure = new Error('Source admission rejected.');
  const onSource = (_target: string, content?: Buffer) => { if (content) throw failure; };
  expect(() => loadInstructionFiles({ cwd: root, homeDir: path.join(root, 'home'), onSource })).toThrow(failure);
  expect(() => loadAppendedInstructionFiles({ cwd: root, onSource })).toThrow(failure);
  expect(() => expandImports('@./import.md', { baseDirectory: root, projectRoot: root, onSource })).toThrow(failure);
  expect(() => new TemplateLoader(root, onSource).load()).toThrow(failure);
});

it('rejects a mutation between source discovery and post-read admission', () => {
  fs.mkdirSync(path.join(root, '.git')); const file = path.join(root, 'AGENTS.md'); fs.writeFileSync(file, 'before');
  const sources = capturePromptSources(); let changed = false;
  const onSource = (target: string, content?: Buffer) => {
    sources.track(target, content);
    if (target === file && !content && !changed) { changed = true; fs.writeFileSync(file, 'after'); }
  };
  expect(() => loadInstructionFiles({ cwd: root, homeDir: path.join(root, 'home'), onSource })).toThrow('changed during capture');
});
