import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConfigState } from '../../../../config/state.js';
import { getRuntimeConfig } from '../../../../config/runtimeConfig.js';
import { CoreMcpGateway } from '../../../../core/mcp/gateway.js';
import { CoreMcpClient } from '../../../../core/mcp/client.js';
import { configurationBinding } from '../../../../core/shell/configuration.js';
import type { ShellRuntimeContext } from '../../../../core/shell/runtimeContext.js';
import { projectTrust } from '../../../../core/security/projectTrust.js';
import { toolPoolFor } from '../../../runtime/tools.js';
import { stripAnsi } from '../../../../presentation/tui/text/ansi.js';
import { visibleWidth } from '../../../../presentation/tui/text/measure.js';
import { parseKeyEvent } from '../../../../presentation/tui/input/keys.js';
import { OverlayHost } from '../../overlay.js';
import { toolsPicker } from '../tools.js';

let root: string;
let log: string;
let gateway: CoreMcpGateway;
const server = path.resolve('src/core/mcp/fixtures/mockMcpServer.mjs');
const toolName = 'mcp__local__echo_message';

function records(): Array<{ event: string; pid: number }> {
  return fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function configure(hang = false, description = 'Echo a fixture message.') {
  const definition = path.join(root, 'tool.json');
  fs.writeFileSync(definition, JSON.stringify({ description }));
  fs.writeFileSync(path.join(root, '.cheers.mcp.json'), JSON.stringify({ mcpServers: { local: {
    transport: 'stdio', command: process.execPath,
    args: [server, '--log', log, '--tool-definition', definition, ...(hang ? ['--hang-list'] : [])],
  } } }));
  const binding = configurationBinding({ projectRoot: root, session: { id: 'tool-inspection' } });
  const configuration = new ConfigState({ ...getRuntimeConfig(root), enableMcpTools: true,
    allowedTools: [toolName], disabledTools: [], hiddenToolPrefixes: [] }, binding);
  return { cwd: root, projectRoot: root, session: { id: 'tool-inspection' }, configuration,
    get runtimeConfig() { return configuration.current.config; }, skillOptions: { noSkills: true },
  } as ShellRuntimeContext;
}

beforeEach(() => {
  const scratch = path.join(os.tmpdir(), 'cheers-test');
  fs.mkdirSync(scratch, { recursive: true });
  root = fs.mkdtempSync(path.join(scratch, 'tool-picker-'));
  log = path.join(root, 'protocol.jsonl');
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
  vi.spyOn(projectTrust, 'isProjectUntrusted').mockReturnValue(false);
  gateway = new CoreMcpGateway(root);
});

afterEach(async () => {
  await gateway.close();
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

it('rejects an already cancelled original command before acquiring a tool pool', async () => {
  const original = new AbortController(); original.abort();
  const getToolPool = vi.fn(async () => new Map());
  const picker = toolsPicker({ cwd: root, signal: original.signal, getToolPool });
  await expect(picker.load(new AbortController().signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(getToolPool).not.toHaveBeenCalled();
});

it.each(['original', 'overlay'] as const)('drains actual MCP acquisition after %s cancellation', async owner => {
  const runtime = configure(true), original = new AbortController();
  const read = toolPoolFor(runtime, gateway);
  let signal: AbortSignal | undefined;
  let settled = false;
  let requestFinished = false;
  const list = CoreMcpClient.prototype.listTools;
  vi.spyOn(CoreMcpClient.prototype, 'listTools').mockImplementation(async function (...args) {
    try { return await list.apply(this, args); } finally { requestFinished = true; }
  });
  const picker = toolsPicker({ cwd: root, signal: original.signal, getToolPool: async current => {
    signal = current;
    try { return await read(current); } finally { settled = true; }
  } });
  const changed = vi.fn(), overlay = new OverlayHost(changed);
  try {
    overlay.open(picker);
    await vi.waitFor(() => expect(records().filter(item => item.event === 'tools/list')).toHaveLength(1));
    expect(signal?.aborted).toBe(false);
    expect(requestFinished).toBe(false);
    if (owner === 'original') original.abort(); else overlay.close();
    expect(signal?.aborted).toBe(true);
    await vi.waitFor(() => expect(settled).toBe(true));
    await vi.waitFor(() => expect(requestFinished).toBe(true));
    await vi.waitFor(() => expect(records().filter(item => item.event === 'notifications/cancelled')).toHaveLength(1));
    expect(gateway.peekSnapshot()).toBeUndefined();
    expect((overlay as any).model.visible).toEqual([]);
    expect(stripAnsi(overlay.render(100, 24).join('\n'))).not.toContain(toolName);
    expect(records().filter(item => item.event === 'tools/call')).toEqual([]);
    // This gateway belongs to the runtime, so cancelling a view drains its
    // request but leaves connection teardown to that owner.
    expect(records().filter(item => item.event === 'start')).toHaveLength(1);
    expect(records().filter(item => item.event === 'start').every(item => alive(item.pid))).toBe(true);
    overlay.close(); changed.mockClear();
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(changed).not.toHaveBeenCalled();
    await gateway.close();
    expect(records().filter(item => item.event === 'start').every(item => !alive(item.pid))).toBe(true);
  } finally {
    // Close both owners even when a cancellation assertion is deliberately reversed.
    original.abort(); overlay.close(); await gateway.close();
    await vi.waitFor(() => expect(settled).toBe(true));
  }
});

it.each([32, 128 * 1024])('keeps actual catalogue, projection, drawing and close lifetimes distinct at %i description bytes', async bytes => {
  const runtime = configure(false, 'x'.repeat(bytes));
  const source = fs.readFileSync(path.join(root, '.cheers.mcp.json'));
  const definition = fs.readFileSync(path.join(root, 'tool.json'));
  const original = CoreMcpClient.prototype.listTools;
  const acquired: number[] = [];
  vi.spyOn(CoreMcpClient.prototype, 'listTools').mockImplementation(async function (...args) {
    const result = await original.apply(this, args);
    acquired.push(Buffer.byteLength(JSON.stringify(result), 'utf8'));
    return result;
  });
  const getToolPool = vi.fn(toolPoolFor(runtime, gateway));
  const overlay = new OverlayHost(() => {});
  try {
    for (let round = 0; round < 10; round++) {
      const picker = toolsPicker({ cwd: root, getToolPool });
      overlay.open(picker);
      await vi.waitFor(() => expect((overlay as any).model.visible.map((row: { id: string }) => row.id)).toEqual([toolName]));
      expect((overlay as any).baseOptions).toHaveLength(1);
      expect(Buffer.byteLength(JSON.stringify((overlay as any).baseOptions), 'utf8')).toBeLessThan(512);
      const protocol = fs.readFileSync(log);
      overlay.handlePaste('mcp__local');
      for (const width of [20, 40, 80, 120, 200]) for (const height of [8, 24, 40, 80]) {
        const frame = overlay.render(width, height);
        expect(frame.length).toBeLessThanOrEqual(height);
        expect(frame.every(line => visibleWidth(line) <= width)).toBe(true);
      }
      expect(fs.readFileSync(log)).toEqual(protocol);
      expect(acquired).toHaveLength(round + 1);
      const apply = vi.fn(); overlay.handleKey(parseKeyEvent('\x1b'), apply);
      expect(apply).not.toHaveBeenCalled();
      expect((overlay as any).baseOptions).toEqual([]);
      expect((overlay as any).model.visible).toEqual([]);
      expect((overlay as any).optionRows.size).toBe(0);
      expect(overlay.active).toBe(false);
      expect(fs.readFileSync(log)).toEqual(protocol);
    }
    expect(getToolPool).toHaveBeenCalledTimes(10);
    expect(records().filter(item => item.event === 'start')).toHaveLength(1);
    expect(records().filter(item => item.event === 'tools/list')).toHaveLength(10);
    expect(new Set(acquired).size).toBe(1);
    expect(acquired[0]).toBeGreaterThan(bytes);
    expect(acquired[0]).toBeLessThan(bytes + 1024);
    expect(gateway.peekSnapshot()?.tools).toHaveLength(1);
    expect(fs.readFileSync(path.join(root, '.cheers.mcp.json'))).toEqual(source);
    expect(fs.readFileSync(path.join(root, 'tool.json'))).toEqual(definition);
    expect(records().filter(item => item.event === 'tools/call')).toEqual([]);
    await gateway.close();
    expect(records().filter(item => item.event === 'start').every(item => !alive(item.pid))).toBe(true);
  } finally { overlay.close(); }
});
