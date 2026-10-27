import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { catalogRequest, catalogSuggestions } from './request.js';
import { pathCatalog } from './paths.js';
import { slashSuggestions } from '../slashSuggestions.js';
import { replaceDraft } from '../../../presentation/tui/editor/replacement.js';
import { createCatalogLoader } from './catalog.js';
import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import { getRuntimeConfig } from '../../../config/runtimeConfig.js';
import { getSlashInvocation, registerSlashCommand } from '../../../entrypoints/slashCommandRegistry.js';
import { routeSlashCommand } from '../../../core/commands/slashRouter.js';
import { scanCommandArgs } from '../../../core/commands/arguments.js';
import { promptTokens } from '../../../core/prompts/tokens.js';
let root: string;
let scope: { root: string; runtimeConfig: ReturnType<typeof getRuntimeConfig> };
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true });
  root = fs.mkdtempSync('/tmp/cheers-test/prose-');
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
  scope = { root, runtimeConfig: getRuntimeConfig(root) };
  fs.mkdirSync(path.join(root, 'home space', 'child'), { recursive: true });
});
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});
function request(marked: string) {
  const cursor = marked.indexOf('|'); const text = marked.replace('|', '');
  return catalogRequest({ text, cursor: cursor < 0 ? text.length : cursor, revision: 1 }, scope);
}
function mockPathTarget(target: string, kind: 'file' | 'directory') {
  const original = fs.statSync.bind(fs) as typeof fs.statSync;
  vi.spyOn(fs, 'statSync').mockImplementation(((candidate: Parameters<typeof fs.statSync>[0],
    options?: Parameters<typeof fs.statSync>[1]) => {
    if (String(candidate) === target) {
      return { isFile: () => kind === 'file', isDirectory: () => kind === 'directory' } as fs.Stats;
    }
    return original(candidate, options as never);
  }) as typeof fs.statSync);
}

it('suppresses suggestions inside a fenced example and restores local skill/path suggestions after its complete closing line', () => {
  mockPathTarget('/home', 'directory');
  const code = '````text\nexample ```` /skill:missing\n/ho\n```` trailing\n`````';
  expect(request(`${code.replace('/ho', '/ho|')}\n正文 /skill:a`)).toBeUndefined();
  const req = request(`${code}\n正文 /rev|\n后文`)!;
  expect(req.kind).toBe('prose');
  const item = catalogSuggestions(req, [{ value: '/skill:review-b', label: '/skill:review-b', kind: 'skill' }])[0]!;
  expect(replaceDraft(req.snapshot, item.edit!)?.text).toBe(`${code}\n正文 /skill:review-b\n后文`);
  expect(request(`${code}\n正文 /home|`)?.query).toBe('/');
});

it.each([' /mod', '\n/mod', '正文 /mod', '正文\n/model', ' /thinking h'])(
  'limits functional discovery to source offset zero: %s', text => expect(slashSuggestions(text)).toBeNull());

it.each(['https://example.com/home', 'word/home', '正文 `/home`', '正文 \\/home', '```\n/home\n```', '~~~\n/home\n~~~', '"/skill:review"', '/settings x /skill:review'])(
  'leaves literal and functional argument positions alone: %s', text => expect(request(text)).toBeUndefined());

it('preserves prefix, suffix and newlines through consecutive quoted directory replacements', async () => {
  const req = request(`阅读 ${root}/ho|me\n后文 👩‍💻`)!;
  const context = { cwd: root, projectRoot: root, session: { id: 'fixture' }, runtimeConfig: {}, skillOptions: { noSkills: true } } as ShellRuntimeContext;
  const load = createCatalogLoader(() => context, {} as never, []);
  const matches = catalogSuggestions(req, await load(req.kind, new AbortController().signal, req.query));
  const next = replaceDraft(req.snapshot, matches[0]!.edit!)!;
  expect(next.text).toBe(`阅读 "${root}/home space/"\n后文 👩‍💻`);
  expect(next.text[next.cursor]).toBe('"');
  const childRequest = catalogRequest(next)!;
  const child = catalogSuggestions(childRequest, await load(childRequest.kind, new AbortController().signal, childRequest.query))[0]!;
  expect(replaceDraft(next, child.edit!)?.text).toBe(`阅读 "${root}/home space/child/"\n后文 👩‍💻`);
});

it.each(['pick-quote"dir', 'pick-back\\dir', 'pick-tick`dir', 'pick-组合 "\\`\'$dir'].flatMap(name =>
  ['', '阅读 ', 'path="'].map(prefix => ({ name, prefix }))))(
  'continues escaped directory replacements for $name after $prefix', async ({ name, prefix }) => {
    const directory = path.join(root, name);
    const child = path.join(directory, 'child "叶\\`$');
    const file = path.join(child, 'report "\\`\'$.md');
    fs.mkdirSync(child, { recursive: true });
    fs.writeFileSync(file, 'fixture');
    const embedded = prefix === 'path="';
    const before = embedded ? 'path=' : prefix;
    const suffix = `${embedded ? 'tail' : ''}\n后文 /skill:follow 👩‍💻`;
    const initial = `${prefix}${root}/pick-|stale${embedded ? '"' : ''}${suffix}`;
    const context = { cwd: root, projectRoot: root, session: { id: 'fixture' }, runtimeConfig: {},
      skillOptions: { noSkills: true } } as ShellRuntimeContext;
    const load = createCatalogLoader(() => context, {} as never, []);
    let req = request(initial)!;
    for (const target of [directory + '/', child + '/', file]) {
      const items = catalogSuggestions(req, await load(req.kind, new AbortController().signal, req.query));
      const item = items.find(candidate => candidate.value === target);
      expect(item, `missing ${target}`).toBeDefined();
      const next = replaceDraft(req.snapshot, item!.edit!)!;
      expect(next.text.startsWith(before)).toBe(true);
      expect(next.text.endsWith(suffix)).toBe(true);
      const inserted = next.text.slice(before.length, -suffix.length);
      expect(scanCommandArgs(inserted).map(token => token.value)).toEqual([target]);
      expect(promptTokens(next.text).find(token => token.raw === '/skill:follow')).toMatchObject({ from: next.text.indexOf('/skill:follow') });
      expect(promptTokens(next.text).find(token => token.raw === '/skill:follow')?.literal).toBeUndefined();
      if (target === file) {
        expect(next.cursor).toBe(before.length + inserted.length);
      } else {
        expect(next.text[next.cursor]).toBe('"');
        req = catalogRequest(next, scope)!;
        expect(req?.kind).toBe('path');
        expect(req?.token.value).toBe(target);
        expect(req?.query).toBe(target);
      }
    }
  });

it.each(['C:\\Users\\work space/', '\\\\server\\share\\work space/', 'C:/work `space/', '//server/share/work `space/'])(
  'decodes generated quoted Windows paths without escape growth: %s', directory => {
    let req = request('读取 "' + directory + '|"\n后文 /skill:follow')!;
    for (const value of [directory, directory + 'child/', directory + 'child/report.txt']) {
      const item = catalogSuggestions(req, [{ value, label: value, kind: 'path' }])[0]!;
      expect(item).toBeDefined();
      const next = replaceDraft(req.snapshot, item.edit!)!;
      expect(scanCommandArgs(next.text.slice(3, next.text.indexOf('\n'))).map(token => token.value)).toEqual([value]);
      expect(next.text.endsWith('\n后文 /skill:follow')).toBe(true);
      if (value.endsWith('/')) {
        req = catalogRequest(next, scope)!;
        expect(req?.kind).toBe('path');
        expect(req?.token.value).toBe(value);
        expect(req?.query).toBe(value);
        expect(next.text[next.cursor]).toBe('"');
      }
    }
  });

it('keeps a real /home path alongside a same-name skill without fuzzy description capture', () => {
  mockPathTarget('/home', 'directory');
  const req = request('阅读 /home')!;
  expect(req).toMatchObject({ kind: 'prose', query: '/' });
  const matches = catalogSuggestions(req, [
    { value: '/home/', label: '/home/', kind: 'path' },
    { value: '/skill:home', label: '/skill:home', kind: 'skill' },
    { value: '/skill:unrelated', label: '/skill:unrelated', kind: 'skill', detail: 'home folder tools' },
  ]);
  expect(matches.map(item => item.value)).toEqual(['/home/', '/skill:home']);
  expect(matches.map(item => item.edit?.text)).toEqual(['/home/', '/skill:home ']);
});

it('keeps real skill-namespaced paths distinct from explicit skill completions', () => {
  const req = request('读取 /skill:rev|')!;
  expect(req).toMatchObject({ kind: 'prose', query: '/' });
  const matches = catalogSuggestions(req, [
    { value: '/skill:review', label: '/skill:review', kind: 'path', identity: '/skill:review', detail: 'file' },
    { value: '/skill:review', label: '/skill:review', kind: 'skill', detail: 'review sources' },
  ]);
  expect(matches.map(item => item.kind)).toEqual(['path', 'skill']);
  expect(matches.map(item => item.edit?.text)).toEqual(['"/skill:review" ', '/skill:review ']);

  const quoted = request('读取 "/skill:rev|"')!;
  expect(quoted).toMatchObject({ kind: 'path', query: '/' });
  const path = catalogSuggestions(quoted, [
    { value: '/skill:review', label: '/skill:review', kind: 'path', identity: '/skill:review', detail: 'file' },
  ])[0]!;
  expect(path.edit?.text).toBe('"/skill:review" ');
});

it('reads only prefix-matching template bodies for ambiguous path completion', () => {
  const prompts = path.join(root, '.agents', 'prompts');
  fs.mkdirSync(prompts, { recursive: true });
  fs.writeFileSync(path.join(prompts, 'home-method.md'), '---\ncomposable: true\n---\nHome method.');
  fs.writeFileSync(path.join(prompts, 'unrelated.md'), '---\ncomposable: true\n---\nUnrelated method.');
  const read = vi.spyOn(fs, 'readFileSync');
  const req = request('阅读 /home')!;
  const matches = catalogSuggestions(req, [
    { value: '/home/', label: '/home/', kind: 'path', identity: path.join(root, 'home space'), detail: 'directory' },
  ]);
  expect(matches.map(item => item.value)).toEqual(['/home/', '/home-method']);
  const projectReads = read.mock.calls
    .map(call => String(call[0]))
    .filter(target => target.startsWith(prompts));
  expect(projectReads).toEqual([path.join(prompts, 'home-method.md')]);
});

it('keeps composed prose completion on exact and prefix template reads', () => {
  const prompts = path.join(root, '.agents', 'prompts');
  fs.mkdirSync(prompts, { recursive: true });
  fs.writeFileSync(path.join(prompts, 'method.md'), '---\ncomposable: true\n---\nMethod.');
  fs.writeFileSync(path.join(prompts, 'home-method.md'), '---\ncomposable: true\n---\nHome method.');
  fs.writeFileSync(path.join(prompts, 'unrelated.md'), '---\ncomposable: true\n---\nUnrelated method.');
  const read = vi.spyOn(fs, 'readFileSync');
  const req = request('/method 检查证据 /home')!;
  const matches = catalogSuggestions(req, [
    { value: '/home/', label: '/home/', kind: 'path', identity: path.join(root, 'home space'), detail: 'directory' },
  ]);
  expect(matches.map(item => item.value)).toEqual(['/home/', '/home-method']);
  const projectReads = read.mock.calls
    .map(call => String(call[0]))
    .filter(target => target.startsWith(prompts));
  expect(projectReads).toEqual([
    path.join(prompts, 'method.md'),
    path.join(prompts, 'method.md'),
    path.join(prompts, 'home-method.md'),
  ]);
});

it('resolves a built-in command before an oversized same-name template', () => {
  const prompts = path.join(root, '.agents', 'prompts');
  fs.mkdirSync(prompts, { recursive: true });
  fs.writeFileSync(path.join(prompts, 'review.md'), 'x'.repeat(512 * 1024 + 1));
  expect(getSlashInvocation('review', scope)).toMatchObject({ commandName: 'review' });
});

it('merges a real offset-zero path with command candidates and preserves command-only behavior without a path', () => {
  const remove = registerSlashCommand({ name: 'fixture-home', group: 'workflow', summary: 'fixture command' });
  const removeNoPath = registerSlashCommand({ name: 'fixture-no-path', group: 'workflow', summary: 'fixture command' });
  mockPathTarget('/fixture-home', 'directory');
  try {
    const req = request('/fixture-home')!;
    expect(catalogSuggestions(req, []).map(item => item.value)).toEqual(['/fixture-home']);
    const matches = catalogSuggestions(req, [
      { value: '/fixture-home/', label: '/fixture-home/', kind: 'path', identity: root, detail: 'directory' },
    ]);
    expect(matches.map(item => item.kind)).toEqual(['command', 'path']);
    expect(matches.map(item => item.value)).toEqual(['/fixture-home', '/fixture-home/']);
    expect(matches.find(item => item.kind === 'path')?.edit?.text).toBe('/fixture-home/');
    expect(request('/fixture-no-path')).toBeUndefined();
  } finally {
    removeNoPath();
    remove();
  }
});

it('quotes same-spelling path files so accepting the path cannot execute a command or hidden alias', () => {
  const remove = registerSlashCommand({
    name: 'fixture-owner',
    aliases: ['fixture-alias'],
    group: 'workflow',
    summary: 'fixture command',
  });
  mockPathTarget('/fixture-alias', 'file');
  try {
    const req = request('/fixture-alias')!;
    expect(req.kind).toBe('prose');
    const matches = catalogSuggestions(req, [
      { value: '/fixture-alias', label: '/fixture-alias', kind: 'path', identity: '/fixture-alias', detail: 'file' },
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ kind: 'path', edit: { text: '"/fixture-alias" ' } });
  } finally {
    remove();
  }
});

it('quotes a file when a longer command prefix makes direct submission look like a slash command', async () => {
  const remove = registerSlashCommand({ name: 'fixture-command', group: 'workflow', summary: 'fixture command' });
  mockPathTarget('/fixture', 'file');
  try {
    const req = request('/fixture')!;
    const path = catalogSuggestions(req, [
      { value: '/fixture', label: '/fixture', kind: 'path', identity: '/fixture', detail: 'file' },
    ]).find(item => item.kind === 'path')!;
    expect(path.edit?.text).toBe('"/fixture" ');
    expect(await routeSlashCommand(path.edit!.text.trimEnd(), { cwd: root })).toBeNull();
  } finally {
    remove();
  }
});

it('quotes a command-colliding prose file at a nonzero source offset', async () => {
  mockPathTarget('/brainstorm', 'file');
  const req = request('问题 /brainst|orm')!;
  const path = catalogSuggestions(req, [
    { value: '/brainstorm', label: '/brainstorm', kind: 'path', identity: '/brainstorm', detail: 'file' },
  ]).find(item => item.kind === 'path')!;
  expect(path.edit?.text).toBe('"/brainstorm" ');
  expect(await routeSlashCommand('问题 /brainstorm', { cwd: root })).toMatchObject({ kind: 'prompt' });
  expect(await routeSlashCommand('问题 "/brainstorm"', { cwd: root })).toBeNull();
});

it('quotes an isolated absolute file so first-position path acceptance remains a path', async () => {
  mockPathTarget('/fixture-solo', 'file');
  const req = request('/fixture-solo')!;
  const path = catalogSuggestions(req, [
    { value: '/fixture-solo', label: '/fixture-solo', kind: 'path', identity: '/fixture-solo', detail: 'file' },
  ]).find(item => item.kind === 'path')!;
  expect(path.edit?.text).toBe('"/fixture-solo" ');
  expect(await routeSlashCommand(path.edit!.text.trimEnd(), { cwd: root })).toBeNull();
});

it('keeps already slash-delimited absolute files unquoted at source offset zero', () => {
  mockPathTarget('/tmp', 'directory');
  const req = request('/tmp')!;
  const path = catalogSuggestions(req, [
    { value: '/tmp/example.txt', label: '/tmp/example.txt', kind: 'path', identity: '/tmp/example.txt', detail: 'file' },
  ]).find(item => item.kind === 'path')!;
  expect(path.edit?.text).toBe('/tmp/example.txt ');
});

it('inserts canonical skills in the middle of source without replacing other invocations', () => {
  const req = request('请比较 /rev|iew\n/skill:research-a 继续')!;
  const item = catalogSuggestions(req, [{ value: '/skill:review-b', label: '/skill:review-b', kind: 'skill' }])[0]!;
  expect(replaceDraft(req.snapshot, item.edit!)?.text).toBe('请比较 /skill:review-b\n/skill:research-a 继续');
});

it('continues explicit relative and absolute path prefixes at source offset zero', async () => {
  expect(request('/home')).toMatchObject({ kind: 'prose', query: '/' });
  for (const text of ['./ho', '../ho', '~/ho', `${root}/ho`]) expect(request(text)?.kind).toBe('path');
  const paths = await pathCatalog(root, './', false, new AbortController().signal);
  expect(paths[0]).toMatchObject({ kind: 'path', value: './home space/' });
});

it('retains Windows separators in the path query without interpreting them as invocation escapes', () => {
  const req = request('读取 C:\\Users\\wa');
  expect(req).toMatchObject({ kind: 'path', token: { value: 'C:\\Users\\wa' } });
});

it('recognizes quoted Windows drive and UNC paths in prose', () => {
  expect(request('读取 "C:\\Users\\wa|')).toMatchObject({ kind: 'path', token: { value: 'C:\\Users\\wa' } });
  expect(request("读取 'C:/Users/wa|")).toMatchObject({ kind: 'path', token: { value: 'C:/Users/wa' } });
  expect(request('读取 "\\\\server\\share\\fo|')).toMatchObject({ kind: 'path' });
});

it.each(['C:\\Users\\$data\\`cache', '\\\\server\\share\\$data\\`cache'])(
  'keeps separators before special characters in raw quoted Windows input: %s', value => {
    for (const quote of ['"', "'"]) {
      const req = request(`读取 ${quote}${value}|${quote}`);
      expect(req?.kind).toBe('path');
      expect(req?.token.value).toBe(value);
    }
  });

it('completes a prefixed quoted path without replacing the prose prefix', () => {
  const req = request(`path="${root}/ho|me"tail suffix`)!;
  expect(req).toMatchObject({ kind: 'path', token: { from: 5, value: `${root}/ho` } });
  const item = catalogSuggestions(req, [{ value: `${root}/home space/`, label: 'home space',
    kind: 'path', identity: `${root}/home space` }])[0]!;
  expect(replaceDraft(req.snapshot, item.edit!)?.text).toBe(`path="${root}/home space/"tail suffix`);
});

it('does not request path catalogs for code, escape, or URL command arguments', () => {
  expect(request('/cd `/ho|`')).toBeUndefined();
  expect(request('/cd \\`/ho|\\`')).toBeUndefined();
  expect(request('/report https://example.test/fi|le')).toBeUndefined();
  expect(request('/export md fi|le')).toMatchObject({ kind: 'file' });
});

it('offers only declared inline commands and retains a real same-name path', () => {
  const req = request('问题 /deep')!;
  const matches = catalogSuggestions(req, [{ value: '/deep-research/', label: '/deep-research/', kind: 'path' }]);
  expect(matches.map(item => item.value)).toEqual(['/deep-research/', '/deep-research']);
  expect(matches.map(item => item.kind)).toEqual(['path', 'command']);
  const settings = request('问题 /set')!;
  expect(catalogSuggestions(settings, []).some(item => item.value === '/settings')).toBe(false);
});

it('offers review in prose only after its driver composition declaration', () => {
  const review = request('检查证据 /rev')!;
  expect(catalogSuggestions(review, []).some(item => item.value === '/review')).toBe(true);
  expect(catalogSuggestions(review, []).some(item => item.value === '/settings')).toBe(false);
});
