import { expect, it, vi } from 'vitest';
import { serverPicker } from './servers.js';
import type { CliMcpGateway } from '../../../entrypoints/cliMcpModule.js';
import type { McpClientSnapshot, ScopedMcpServerConfig } from '../../../core/mcp/types.js';

const config: ScopedMcpServerConfig = { scope: 'user', transport: 'stdio', command: 'fixture', env: { SECRET: 'synthetic-private-config' } };
const snapshot = (name = 'fixture'): McpClientSnapshot => ({ clients: [{ name, config, type: 'connected' }], tools: [] });
function setup(value = snapshot(), admission = () => undefined as string | undefined) {
  const read = vi.fn(async (_admission?: unknown, _signal?: AbortSignal) => value);
  const refresh = vi.fn(async (_name: string, _expected: ScopedMcpServerConfig, _admission?: () => string | undefined) => value);
  const gateway = { snapshot: read, refresh: vi.fn() } as unknown as CliMcpGateway;
  return { read, refresh, picker: serverPicker({ gateway, root: '/server-picker', admission, refresh }) };
}

it('projects server metadata and pending tool knowledge while preserving exact local identities', async () => {
  const name = 'password=synthetic-sensitive-server';
  const value: McpClientSnapshot = { clients: [{ name, config, type: 'failed', error: 'file:///server-picker/private sk-\x1b[31msynthetic-sensitive-error' },
    { name: 'waiting', config, type: 'pending' }], tools: [] };
  const { picker } = setup(value), rows = await picker.load();
  expect(rows[0]?.id).toBe(name);
  expect(JSON.stringify(rows.map(({ id: _id, ...visible }) => visible))).not.toContain('synthetic-sensitive');
  expect(rows[0]?.detail).toContain('[project]/private');
  expect(rows[1]?.detail).toMatch(/connecting|unknown/); expect(rows[1]?.detail).not.toBe('0 tools');
  expect(JSON.stringify(rows)).not.toContain('synthetic-private-config');
});

it('rejects an expired original binding before and after server discovery', async () => {
  let current = false;
  const { picker, read } = setup(snapshot(), () => current ? undefined : 'changed');
  expect(await picker.load()).toEqual([]); expect(read).not.toHaveBeenCalled();
  current = true;
  read.mockImplementationOnce(async () => { current = false; return snapshot(); });
  expect(await picker.load()).toEqual([]); expect(read).toHaveBeenCalledOnce();
});

it('passes the original admission and view signal and rejects pre-aborted discovery', async () => {
  const admission = vi.fn(() => undefined), { picker, read } = setup(snapshot(), admission);
  const controller = new AbortController(); controller.abort();
  await expect(picker.load(controller.signal)).rejects.toThrow(); expect(read).not.toHaveBeenCalled();
  const active = new AbortController(); await picker.load(active.signal);
  expect(read).toHaveBeenCalledWith(admission, active.signal);
});

it('requires one offered server and consumes refresh before awaiting its result', async () => {
  const { picker, refresh } = setup();
  expect(await picker.apply(['fixture'])).toBeUndefined(); expect(refresh).not.toHaveBeenCalled();
  await picker.load();
  expect(await picker.apply(['not-offered'])).toBeUndefined();
  expect(await picker.apply(['fixture', 'extra'])).toBeUndefined(); expect(refresh).not.toHaveBeenCalled();
  let finish!: (value: McpClientSnapshot) => void;
  refresh.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = picker.apply(['fixture']);
  expect(await picker.apply(['fixture'])).toBeUndefined(); expect(refresh).toHaveBeenCalledOnce();
  expect(refresh).toHaveBeenCalledWith('fixture', config, expect.any(Function));
  finish(snapshot()); await pending;
});

it('projects a refresh report without exporting raw server definitions', async () => {
  const { picker } = setup(); await picker.load();
  const outcome = await picker.apply(['fixture']);
  expect(outcome?.report?.title).toContain('MCP');
  expect(JSON.stringify(outcome)).not.toContain('synthetic-private-config');
  expect(outcome?.report?.facts).toBeDefined(); expect(outcome?.note).toBeUndefined();
});

it('projects rejected refresh metadata before the host displays it', async () => {
  const { picker, refresh } = setup(); await picker.load();
  refresh.mockRejectedValueOnce(new Error('file:///server-picker/private password=synthetic-sensitive-error sk-\x1b[31msyntheticSensitiveKey123456'));
  const error = await picker.apply(['fixture']).catch(error => error);
  expect(error).toBeInstanceOf(Error);
  expect(error.message).toContain('[project]/private password=[redacted]');
  expect(error.message).not.toMatch(/synthetic-sensitive|syntheticSensitive|\x1b/);
});

it('rejects refresh and late publication when the original binding expires', async () => {
  let current = true;
  const { picker, refresh } = setup(snapshot(), () => current ? undefined : 'changed');
  await picker.load(); current = false;
  expect(await picker.apply(['fixture'])).toBeUndefined(); expect(refresh).not.toHaveBeenCalled();
  current = true; await picker.load();
  refresh.mockImplementationOnce(async () => { current = false; return snapshot(); });
  expect(await picker.apply(['fixture'])).toBeUndefined();
});

it('offers the existing add wizard without executing it on load or an unoffered selection', async () => {
  const { read } = setup(); const add = vi.fn(() => ({ title: 'Add fixture', empty: '', load: async () => [], apply: async () => undefined }));
  const picker = serverPicker({ gateway: { snapshot: read } as unknown as CliMcpGateway, root: '/server-picker', refresh: vi.fn(), add });
  expect(await picker.apply(['__add__'])).toBeUndefined(); expect(add).not.toHaveBeenCalled();
  await picker.load(); expect(add).not.toHaveBeenCalled();
  expect((await picker.apply(['__add__']))?.next?.title).toBe('Add fixture'); expect(add).toHaveBeenCalledOnce();
});
