import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createServer, type Server } from 'node:http';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createUnifiedBrowserToolDefinition } from './definition.js';
import { browserSession } from '../session/pool.js';
import { downloadUrl, TRANSFER_BYTES } from '../session/download.js';
import { captureScreenshot } from '../session/screenshot.js';
import { ArtifactManager } from '../../core/session/artifactManager.js';
import type { PwPage } from '../playwrightRuntime.js';
import { preparationContext } from '../../turn/preparation.js';
import { captureWorkspaceRoot } from '../../core/workspace/roots.js';

let root: string;
let server: Server | undefined;
const contexts: Array<{ workspaceRoot: string; sessionId: string; taskId: string }> = [];
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'browser-features-')); });
afterEach(async () => {
  for (const context of contexts.splice(0)) await browserSession(context).closeSession();
  if (server) await new Promise<void>(resolve => { server!.closeAllConnections(); server!.close(() => resolve()); });
  server = undefined; vi.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true });
});

function setup(sessionId = 'test') {
  const context = { workspaceRoot: root, sessionId, taskId: 'browser' }; contexts.push(context);
  const handlers = new Map<string, (event?: unknown) => void>();
  const setInputFiles = vi.fn(async () => {});
  const page = { url: () => 'http://localhost/page', title: async () => 'page', close: async () => {},
    on: (name: string, handler: (event?: unknown) => void) => handlers.set(name, handler), setInputFiles } as unknown as PwPage;
  const manager = browserSession(context); manager.tabs.register(page);
  return { context, manager, page, setInputFiles, handlers, tool: createUnifiedBrowserToolDefinition() };
}

it('previews every source and sends exact verified buffers, including a read-only additional root', async () => {
  const fixture = setup();
  const extra = path.join(root, 'extra'); await fs.mkdir(extra);
  // An additional grant outside the primary root is needed for this source.
  const primary = path.join(root, 'project'); await fs.mkdir(primary);
  const context = { ...fixture.context, workspaceRoot: primary, workspaceRoots: [captureWorkspaceRoot(extra, root, 'read')] };
  contexts.push(context);
  const manager = browserSession(context); manager.tabs.register(fixture.page);
  const bytes = Buffer.from([0, 255, 128, 13, 10]); await fs.writeFile(path.join(extra, 'source.bin'), bytes);
  const preparation = fixture.tool.prepare!({ action: 'upload', selector: '#file', files: [path.join(extra, 'source.bin')] }, context);
  expect(preparation.preview).toContain(path.join(extra, 'source.bin'));
  expect(preparation.preview).toContain('Selected tab/document:');
  const result = await preparation.execute(context);
  expect(result.success).toBe(true);
  const files = fixture.setInputFiles.mock.calls[0]![1] as unknown as Array<{ buffer: Buffer }>;
  expect(files[0]!.buffer).toEqual(bytes);
  expect(JSON.stringify(fixture.setInputFiles.mock.calls)).not.toContain(path.join(extra, 'source.bin'));
});

it('enforces source read denials before approval and rechecks them after approval', async () => {
  const fixture = setup(); await fs.writeFile(path.join(root, 'secret.bin'), 'secret');
  const args = { action: 'upload', selector: '#file', files: ['secret.bin'] };
  const denied = preparationContext('browser', { ...fixture.context, denyRules: [{ tool: 'read', pattern: 'secret.bin' }] });
  expect(() => fixture.tool.prepare!(args, denied)).toThrow('Refused by a rule');
  const preparation = fixture.tool.prepare!(args, fixture.context);
  const result = await preparation.execute({ ...fixture.context, assertFileAccess: () => { throw new Error('source denied after approval'); } });
  expect(result.success).toBe(false); expect(fixture.setInputFiles).not.toHaveBeenCalled();
});

it('rejects changed upload sources and a document changed while queued', async () => {
  const fixture = setup(); const source = path.join(root, 'source.bin'); await fs.writeFile(source, 'before');
  const args = { action: 'upload', selector: '#file', files: ['source.bin'] };
  const changed = fixture.tool.prepare!(args, fixture.context); await fs.writeFile(source, 'after');
  expect(await changed.execute(fixture.context)).toMatchObject({ success: false, error: expect.stringContaining('source or grant changed after approval') });
  let release!: () => void;
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const held = fixture.manager.run({}, () => new Promise<void>(resolve => { release = resolve; started(); }));
  await ready;
  const queued = fixture.tool.prepare!(args, fixture.context).execute(fixture.context);
  fixture.manager.tabs.invalidate(fixture.page); release(); await held;
  const result = await queued;
  expect(result).toMatchObject({ success: false, error: expect.stringContaining('tab or document changed after approval') }); expect(fixture.setInputFiles).not.toHaveBeenCalled();
});

it('keeps session owners separate and invalidates refs on selection/navigation; records dialog dismissal', async () => {
  const fixture = setup(); const other = setup('other');
  expect(fixture.manager).not.toBe(other.manager);
  const ref = fixture.manager.tabs.ref('#button');
  fixture.manager.tabs.invalidate(fixture.page);
  expect(() => fixture.manager.resolveSelector(ref)).toThrow('stale');
  const newer = fixture.manager.tabs.ref('#button'); expect(newer).not.toBe(ref);
  fixture.manager.tabs.select('t1'); expect(() => fixture.manager.resolveSelector(newer)).toThrow('stale');
  const dismiss = vi.fn(async () => {}); fixture.handlers.get('dialog')!({ dismiss });
  await vi.waitFor(() => expect(fixture.manager.tabs.dialogs).toEqual([{ state: 'dismissed' }]));
  for (let index = 0; index < 17; index++) {
    const closed = setup(`retired-${index}`);
    expect((await closed.manager.closeSession()).ok).toBe(true);
  }
});

it('returns no screenshot if a required mask disappears during capture', async () => {
  const png = Buffer.alloc(24); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png); png.writeUInt32BE(1, 16); png.writeUInt32BE(1, 20);
  const count = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0);
  const page = { viewportSize: () => ({ width: 1, height: 1 }), locator: (selector: string) => selector === '#required' ? { count } : { count: async () => 0 }, screenshot: async () => png } as unknown as PwPage;
  await expect(captureScreenshot(page, ['#required'])).rejects.toThrow('disappeared');
});

it('downloads exact binary bytes through redirects without credentials and refuses compressed overflow and disallowed redirect hops', async () => {
  const bytes = Buffer.from([0, 255, 13, 10, 128]); const received: Array<string | undefined> = [];
  server = createServer((request, response) => {
    received.push(request.headers.cookie);
    if (request.url === '/redirect') { response.writeHead(302, { location: '/file' }); response.end(); }
    else if (request.url === '/blocked') { response.writeHead(302, { location: 'http://169.254.169.254/secret' }); response.end(); }
    else if (request.url === '/gzip') { response.writeHead(200, { 'content-encoding': 'gzip' }); response.end(gzipSync(Buffer.alloc(TRANSFER_BYTES + 1))); }
    else response.end(bytes);
  });
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as { port: number }).port;
  const store = new ArtifactManager(root, 'download'); const policy = { allowedOrigins: [], allowPrivateNetwork: false };
  const result = await downloadUrl(`http://127.0.0.1:${port}/redirect`, policy, store);
  expect(await fs.readFile(result.path)).toEqual(bytes);
  expect(result).toMatchObject({ sha256: createHash('sha256').update(bytes).digest('hex'), publication: 'verified', format: 'bin' });
  expect(store.resolve(result.uri)).toBe(result.path); expect(received).toEqual([undefined, undefined]);
  await expect(downloadUrl(`http://127.0.0.1:${port}/blocked`, policy, store)).rejects.toMatchObject({ code: 'denied' });
  await expect(downloadUrl(`http://127.0.0.1:${port}/gzip`, policy, store)).rejects.toMatchObject({ code: 'response_limit' });
  expect((await fs.readdir(store.directory)).filter(entry => !entry.includes('.tmp-'))).toHaveLength(1);
});

async function downloadServer(): Promise<string> {
  server = createServer((_request, response) => response.end(Buffer.from([0, 255, 128])));
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', () => resolve()));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}/file`;
}

it('preserves unverified artifact publication evidence when cancellation follows the exclusive link', async () => {
  const fixture = setup(); const controller = new AbortController(); const url = await downloadServer();
  const link = fs.link.bind(fs);
  vi.spyOn(fs, 'link').mockImplementationOnce(async (source, target) => { await link(source, target); controller.abort(); });
  const result = await fixture.tool.execute({ action: 'download', url }, { ...fixture.context, abortSignal: controller.signal });
  expect(result).toMatchObject({ success: false, metadata: { browserAction: { state: 'cancelled', effect: 'possible' }, artifactPublication: { state: 'unverified', retained: true } } });
  const directory = ArtifactManager.getShared(root, fixture.context.sessionId).directory;
  const files = (await fs.readdir(directory)).filter(file => file.endsWith('.bin'));
  expect(files).toHaveLength(1); expect(await fs.readFile(path.join(directory, files[0]!))).toEqual(Buffer.from([0, 255, 128]));
});

it('blocks browser reuse on unknown artifact handle cleanup and requires a verified close retry', async () => {
  const fixture = setup(); const url = await downloadServer(); const open = fs.open.bind(fs);
  let failClose = true;
  vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
    const handle = await open(...args);
    if (String(args[0]) === root) {
      const close = handle.close.bind(handle);
      vi.spyOn(handle, 'close').mockImplementation(async () => { if (failClose) throw new Error('synthetic close failure'); await close(); });
    }
    return handle;
  });
  try {
    expect(await fixture.tool.execute({ action: 'download', url }, fixture.context)).toMatchObject({ success: false,
      metadata: { artifactPublication: { state: 'verified', cleanup: 'unknown', retained: true } } });
    expect(await fixture.tool.execute({ action: 'download', url }, fixture.context)).toMatchObject({ success: false, error: expect.stringContaining('cleanup is unconfirmed') });
    expect((await fixture.tool.execute({ action: 'close' }, fixture.context)).success).toBe(false);
    failClose = false;
    expect((await fixture.tool.execute({ action: 'close' }, fixture.context)).success).toBe(true);
    expect(fixture.manager.retainedCleanup.size).toBe(0);
  } finally { failClose = false; }
});
