import { expect, it, vi } from 'vitest';
import { mcpAddWizard } from './mcpAdd.js';
import type { Picker } from '../overlay.js';

async function choose(picker: Picker, id: string): Promise<Picker> {
  await picker.load(); return (await picker.apply([id]))!.next!;
}
async function enter(picker: Picker, text: string): Promise<Picker> {
  await picker.load(); return (await picker.input!.apply(text))!.next!;
}
async function connection(add = vi.fn(async () => 'persisted'), transport = 'stdio', admission?: () => string | undefined) {
  const scope = mcpAddWizard(add, admission);
  const name = await choose(scope, 'project'); const kind = await enter(name, 'local');
  return { add, scope, name, kind, value: await choose(kind, transport) };
}

it('collects an executable and exact argv, then requests publication once', async () => {
  const f = await connection();
  expect(f.name.title).toContain('Step 2'); expect(f.value.title).toContain('Step 4');
  const args = await enter(f.value, '/a folder/server');
  expect(args.title).toContain('Step 5');
  const confirm = await enter(args, '["--path", "two words", "", "$(literal)"]');
  const options = await confirm.load();
  expect(options.map(option => option.id)).toEqual(['cancel', 'add']);
  expect(confirm.initialSelection).toBe('cancel');
  expect(f.add).not.toHaveBeenCalled();
  expect(await confirm.apply(['add'])).toEqual({ note: 'persisted' });
  expect(await confirm.apply(['add'])).toBeUndefined();
  expect(f.add).toHaveBeenCalledTimes(1);
  expect(f.add).toHaveBeenCalledWith('project', 'local', { command: '/a folder/server', args: ['--path', 'two words', '', '$(literal)'] });
});

it('retains the exact HTTP URL but omits its query from the confirmation', async () => {
  const f = await connection(undefined, 'http');
  const url = 'https://example.test/mcp?credential=synthetic-private-query';
  const confirm = await enter(f.value, url); const options = await confirm.load();
  expect(JSON.stringify([options, confirm.detail?.('add')])).not.toContain('synthetic-private-query');
  expect(JSON.stringify(options)).toContain('query omitted');
  expect(await confirm.apply(['add'])).toEqual({ note: 'persisted' });
  expect(f.add).toHaveBeenCalledWith('project', 'local', { url });
});

it('does not display argument values in the review', async () => {
  const f = await connection(); const args = await enter(f.value, 'server');
  const confirm = await enter(args, '["synthetic-private-argument"]');
  expect(JSON.stringify([await confirm.load(), confirm.detail?.('add')])).not.toContain('synthetic-private-argument');
});

it.each(['http://remote.invalid/mcp', 'https://user:pass@example.test/mcp', 'file:///tmp/server', 'https://example.test/#fragment', '\u009b31m', '', 'https://example.test/\npath'])('refuses invalid URL %j before advancing', async text => {
  const f = await connection(undefined, 'http'); await f.value.load();
  expect(f.value.input!.validate(text)).toBeDefined();
  expect(await f.value.input!.apply(text)).toBeUndefined(); expect(f.add).not.toHaveBeenCalled();
});

it.each(['bad name', '__add__', '__proto__', 'constructor', 'prototype', '', 'a'.repeat(65)])('refuses invalid name %j before advancing', async text => {
  const add = vi.fn(); const name = await choose(mcpAddWizard(add), 'user'); await name.load();
  expect(name.input!.validate(text)).toBeDefined(); expect(await name.input!.apply(text)).toBeUndefined(); expect(add).not.toHaveBeenCalled();
});

it.each(['[1]', '{}', 'null', '["unterminated]', '["\\u0000"]', JSON.stringify(Array(257).fill('a')), ' '.repeat(32769)])('refuses invalid argv %j before advancing', async text => {
  const f = await connection(); const args = await enter(f.value, 'server'); await args.load();
  expect(args.input!.validate(text)).toBeDefined(); expect(await args.input!.apply(text)).toBeUndefined(); expect(f.add).not.toHaveBeenCalled();
});

it('requires one offered selection and never reuses a consumed or cancelled step', async () => {
  const add = vi.fn(); const scope = mcpAddWizard(add);
  expect(await scope.apply(['project'])).toBeUndefined(); await scope.load();
  expect(await scope.apply(['project', 'user'])).toBeUndefined(); expect(await scope.apply(['forged'])).toBeUndefined();
  const name = (await scope.apply(['project']))!.next!;
  expect(await scope.apply(['user'])).toBeUndefined();
  expect(await name.input!.apply('local')).toBeUndefined(); await name.load(); name.previewEnd?.();
  expect(await name.input!.apply('local')).toBeUndefined(); expect(add).not.toHaveBeenCalled();
});

it.each(['cancel', 'close'])('cannot replay the final %s', async action => {
  const f = await connection(undefined, 'http'); const confirm = await enter(f.value, 'http://127.0.0.1:1/mcp');
  expect(await confirm.apply(['add'])).toBeUndefined(); await confirm.load();
  expect(await confirm.apply(['add', 'cancel'])).toBeUndefined();
  if (action === 'cancel') await confirm.apply(['cancel']); else confirm.previewEnd?.();
  expect(await confirm.apply(['add'])).toBeUndefined(); expect(f.add).not.toHaveBeenCalled();
});

it('consumes confirmation before awaiting the ordinary writer and suppresses a stale result', async () => {
  let blocked = false, release!: () => void;
  const add = vi.fn(async () => { await new Promise<void>(resolve => { release = resolve; }); return 'persisted'; });
  const f = await connection(add, 'http', () => blocked ? 'changed' : undefined);
  const confirm = await enter(f.value, 'https://example.test/mcp'); await confirm.load();
  const result = confirm.apply(['add']); expect(await confirm.apply(['add'])).toBeUndefined();
  blocked = true; release(); expect(await result).toBeUndefined(); expect(add).toHaveBeenCalledTimes(1);
});

it('refuses stale owner steps and refuses a stale final confirmation', async () => {
  let blocked = false; const f = await connection(undefined, 'http', () => blocked ? 'changed' : undefined);
  const confirm = await enter(f.value, 'https://example.test/mcp'); await confirm.load(); blocked = true;
  expect(f.value.isCurrent?.()).toBe(false); expect(await confirm.apply(['add'])).toBeUndefined(); expect(f.add).not.toHaveBeenCalled();
});
