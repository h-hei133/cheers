import { expect, it } from 'vitest';
import { mcpAddWizard } from './mcpAdd.js';

it('collects scope, name, transport and value, then publishes once', async () => {
  const added: unknown[] = [];
  const wizard = mcpAddWizard(async (scope, name, definition) => { added.push({ scope, name, definition }); return 'persisted'; });
  const scope = await wizard.apply(['project']);
  const namePicker = scope!.next!;
  expect(namePicker.input!.validate('bad name')).toBeDefined();
  const transport = (await namePicker.input!.apply('local')).next!;
  const valuePicker = (await transport.apply(['stdio']))!.next!;
  expect(valuePicker.input!.validate('')).toBeDefined();
  const confirm = (await valuePicker.input!.apply('/usr/bin/server --flag'))!.next!;
  expect((await confirm.load()).map(option => option.id)).toEqual(['add']);
  const outcome = await confirm.apply(['add']);
  expect(outcome).toEqual({ note: 'persisted' });
  expect(added).toEqual([{ scope: 'project', name: 'local', definition: { command: '/usr/bin/server --flag', args: [] } }]);
});

it('publishes an http definition with the URL', async () => {
  const added: unknown[] = [];
  const wizard = mcpAddWizard(async (scope, name, definition) => { added.push({ scope, name, definition }); return undefined; });
  const name = (await wizard.apply(['user']))!.next!;
  const transport = (await name.input!.apply('remote'))!.next!;
  const url = (await transport.apply(['http']))!.next!;
  const confirm = (await url.input!.apply('https://example.test/mcp'))!.next!;
  await confirm.apply(['add']);
  expect(added).toEqual([{ scope: 'user', name: 'remote', definition: { url: 'https://example.test/mcp' } }]);
});
