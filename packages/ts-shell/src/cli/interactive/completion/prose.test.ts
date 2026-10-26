import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { catalogRequest, catalogSuggestions } from './request.js';
import { pathCatalog } from './paths.js';
import { slashSuggestions } from '../slashSuggestions.js';
import { replaceDraft } from '../../../presentation/tui/editor/replacement.js';
import { createCatalogLoader } from './catalog.js';
import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
let root: string;
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true });
  root = fs.mkdtempSync('/tmp/cheers-test/prose-');
  fs.mkdirSync(path.join(root, 'home space', 'child'), { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
function request(marked: string) {
  const cursor = marked.indexOf('|'); const text = marked.replace('|', '');
  return catalogRequest({ text, cursor: cursor < 0 ? text.length : cursor, revision: 1 });
}

it('suppresses suggestions inside a fenced example and restores local skill/path suggestions after its complete closing line', () => {
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

it('keeps a real /home path alongside a same-name skill without fuzzy description capture', () => {
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
