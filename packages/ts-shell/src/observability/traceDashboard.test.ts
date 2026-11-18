import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RotatingFileSink } from './rotatingFileSink.js';
import { closeTraceDashboard, openTraceDashboard } from './traceDashboard.js';
import { setStructuredLogSink, StructuredLogger } from './structuredLogger.js';
import { InMemoryTraceStore } from './tracing/span.js';
import { JsonlTraceStore } from './tracing/jsonlStore.js';
import type { TelemetryStore, TraceQuery } from './tracing/types.js';
import { createProfileContext, withProfile } from '../core/paths/profile/context.js';
import { runTraceCommand } from '../core/commands/traceCommandRuntime.js';
import { setGlobalRotatingFileSink } from './rotatingFileSink.js';
import { runTraceScope } from './tracing/context.js';
import { createComponentLogger } from './structuredLogger.js';

describe('trace dashboard lifecycle', () => {
  it('binds loopback and requires explicit close', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-trace-'));
    const sink = new RotatingFileSink({ logDir: directory, filePrefix: 'trace', pid: 2345 });
    const dashboard = await openTraceDashboard(directory, sink.getCurrentFilePath());
    expect(new URL(dashboard.url).hostname).toBe('127.0.0.1');
    expect(await (await fetch(`${dashboard.url}data`)).text()).toContain('rows');
    expect(await closeTraceDashboard()).toBe(true);
    expect(await closeTraceDashboard()).toBe(false);
    sink.flushAndClose();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('scrubs logger metadata before both trace JSON and HTML publication', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-trace-metadata-'));
    const sink = new RotatingFileSink({ logDir: directory, filePrefix: 'trace', pid: 2346 });
    setStructuredLogSink(entry => sink.write(entry));
    try {
      const logger = new StructuredLogger('component token=PRIVATE_COMPONENT', { traceId: 'token=PRIVATE_TRACE', spanId: 'password=PRIVATE_SPAN' });
      logger.info('recorded', { requestId: 'token=PRIVATE_REQUEST', toolCallId: 'password=PRIVATE_TOOL' });
      const dashboard = await openTraceDashboard(directory, sink.getCurrentFilePath());
      for (const route of ['', 'data']) {
        const output = await (await fetch(dashboard.url + route)).text();
        expect(output).toContain('recorded');
        expect(output).not.toMatch(/PRIVATE_(?:COMPONENT|TRACE|SPAN|REQUEST|TOOL)/);
        expect(output).toContain('[redacted]');
      }
    } finally {
      setStructuredLogSink(null); await closeTraceDashboard(); sink.flushAndClose();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps spans and ordinary logs in the same captured session scope', async () => {
    const directory = fs.mkdtempSync(path.join('/tmp/cheers-test', 'trace-scope-'));
    const sink = new RotatingFileSink({ logDir: directory, filePrefix: 'trace', pid: 2347 });
    const store = new InMemoryTraceStore();
    await store.startSpan({ name: 'selected-span', attributes: { sessionId: 'selected' } }, () => {});
    await store.startSpan({ name: 'other-span', attributes: { sessionId: 'other' } }, () => {});
    sink.write({ timestamp: new Date().toISOString(), level: 'info', component: 'selected', message: 'selected-log',
      traceId: 'selected-trace', spanId: 'selected-log-span', fields: { sessionId: 'selected' } });
    sink.write({ timestamp: new Date().toISOString(), level: 'info', component: 'other', message: 'other-log',
      traceId: 'other-trace', spanId: 'other-log-span', fields: { sessionId: 'other' } });
    sink.write({ timestamp: new Date().toISOString(), level: 'info', component: 'unknown', message: 'unowned-log', fields: {} });
    try {
      const dashboard = await openTraceDashboard(directory, sink.getCurrentFilePath(), store, { sessionId: 'selected' });
      for (const route of ['', 'data']) {
        const result = await (await fetch(dashboard.url + route)).text();
        expect(result).toContain('selected-log'); expect(result).toContain('selected-span');
        expect(result).not.toContain('other-log'); expect(result).not.toContain('other-span'); expect(result).not.toContain('unowned-log');
      }
    } finally { await closeTraceDashboard(); sink.flushAndClose(); fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it('keeps admitted log rows when newer entries from other sessions fill the row limit', async () => {
    const directory = fs.mkdtempSync(path.join('/tmp/cheers-test', 'trace-row-limit-'));
    const sink = new RotatingFileSink({ logDir: directory });
    const base = { timestamp: new Date().toISOString(), level: 'info' as const, component: 'runtime' };
    try {
      sink.write({ ...base, message: 'selected-record', fields: { sessionId: 'selected' } });
      for (let index = 0; index < 210; index += 1) {
        sink.write({ ...base, message: 'foreign-record', fields: { sessionId: 'other' } });
      }
      const dashboard = await openTraceDashboard(directory, sink.getCurrentFilePath(), undefined, { sessionId: 'selected' });
      const { rows } = await (await fetch(dashboard.url + 'data')).json() as { rows: { message: string }[] };
      expect(rows.map(row => row.message)).toEqual(['selected-record']);
    } finally {
      await closeTraceDashboard();
      sink.flushAndClose();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('applies component and error filters before the log row limit', async () => {
    const directory = fs.mkdtempSync(path.join('/tmp/cheers-test', 'trace-filter-limit-'));
    const sink = new RotatingFileSink({ logDir: directory });
    const base = { timestamp: new Date().toISOString(), fields: { sessionId: 'selected' } };
    try {
      sink.write({ ...base, level: 'error', component: 'wanted', message: 'selected-error' });
      for (let index = 0; index < 210; index += 1) {
        sink.write({ ...base, level: 'info', component: 'noise', message: 'noise' });
      }
      const dashboard = await openTraceDashboard(directory, sink.getCurrentFilePath(), undefined, { sessionId: 'selected' });
      const { rows, status } = await (await fetch(dashboard.url + 'data?name=wanted&errors=true')).json() as
        { rows: { message: string }[]; status: string };
      expect(rows.map(row => row.message)).toEqual(['selected-error']);
      expect(status).toBe('reported');
    } finally {
      await closeTraceDashboard();
      sink.flushAndClose();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps a retained span when newer ordinary logs fill the span row budget', async () => {
    const directory = fs.mkdtempSync(path.join('/tmp/cheers-test', 'trace-span-budget-'));
    const sink = new RotatingFileSink({ logDir: directory });
    const attributes = { sessionId: 'bound', workspaceRoot: directory };
    try {
      await new JsonlTraceStore({ sink }).startSpan({ name: 'retained-span', attributes }, () => {});
      const log = { timestamp: '2026-11-18T00:00:00.000Z', level: 'debug' as const, component: 'run',
        message: 'note', fields: attributes };
      for (let index = 0; index < 2000; index += 1) sink.write(log);
      sink.write({ ...log, component: 'span', fields: { ...attributes, storedSpan: { name: 'invalid' } } });
      const reader = new JsonlTraceStore({ sink, ...attributes });
      const { traces } = await reader.findTraces();
      expect(traces.flatMap(trace => trace.spans.map(span => span.name))).toEqual(['retained-span']);
    } finally {
      sink.flushAndClose();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('publishes each persisted span on its own dashboard page', async () => {
    const directory = fs.mkdtempSync(path.join('/tmp/cheers-test', 'trace-sink-page-'));
    const sink = new RotatingFileSink({ logDir: directory });
    setGlobalRotatingFileSink(sink);
    const attributes = { sessionId: 'bound', workspaceRoot: directory };
    try {
      const writer = new JsonlTraceStore({ sink });
      for (const name of ['first-span', 'second-span']) {
        await writer.startSpan({ name, attributes }, () => {});
      }
      sink.write({ timestamp: '2026-11-18T00:00:00.000Z', level: 'info', component: 'run',
        message: 'ordinary-log', fields: attributes });
      const result = await runTraceCommand(['open'], { cwd: directory, sessionId: attributes.sessionId });
      const url = result.output.match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0];
      expect(url).toBeDefined();
      const read = async (suffix: string) => (await fetch(url + 'data?limit=1' + suffix)).json() as
        Promise<{ rows: { component: string; message: string }[]; cursor?: string }>;
      const first = await read('');
      expect(first.cursor).toBeDefined();
      expect(first.rows.map(row => row.message)).toEqual(['settled', 'ordinary-log']);
      const second = await read('&cursor=' + encodeURIComponent(first.cursor!));
      expect(second.cursor).toBeUndefined();
      expect(second.rows.map(row => row.message)).toEqual(['settled', 'ordinary-log']);
      expect([first.rows[0]?.component, second.rows[0]?.component].sort()).toEqual(['first-span', 'second-span']);
    } finally {
      await closeTraceDashboard();
      setGlobalRotatingFileSink(null);
      sink.flushAndClose();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('continues bounded trace pages until it fills the workspace-scoped view', async () => {
    const directory = fs.mkdtempSync(path.join('/tmp/cheers-test', 'trace-page-scope-'));
    const currentPath = path.join(directory, 'trace.log');
    const workspaceRoot = path.join(directory, 'selected');
    const foreign = Array.from({ length: 50 }, (_, index) => ({ traceId: index.toString(16).padStart(32, '0'),
      spans: [{ id: index.toString(16).padStart(16, '0'), traceId: index.toString(16).padStart(32, '0'),
        name: 'foreign-span', startedMs: index, endedMs: index + 1, attributes: { sessionId: 'selected', workspaceRoot: path.join(directory, 'other') },
        status: { status: 'ok' as const }, events: [], links: [] }] }));
    const selected = { traceId: 'f'.repeat(32), spans: [{ id: 'f'.repeat(16), traceId: 'f'.repeat(32),
      name: 'selected-span', startedMs: 100, endedMs: 101,
      attributes: { sessionId: 'selected', workspaceRoot }, status: { status: 'ok' as const }, events: [], links: [] }] };
    const cursors: (string | undefined)[] = [];
    const store: TelemetryStore = {
      async findTraces(query = {}) {
        cursors.push(query.cursor);
        return query.cursor === undefined ? { traces: foreign, cursor: 'next' } : { traces: [selected] };
      },
      async getTrace() { return undefined; },
    };
    try {
      const dashboard = await openTraceDashboard(directory, currentPath, store,
        { sessionId: 'selected', workspaceRoot });
      const body = await (await fetch(dashboard.url + 'data')).json() as { rows: { component: string }[] };
      expect(cursors).toEqual([undefined, 'next']);
      expect(body.rows.map(row => row.component)).toContain('selected-span');
      expect(body.rows.map(row => row.component)).not.toContain('foreign-span');
    } finally {
      await closeTraceDashboard();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([false, true])('omits a repeating cursor and reports incomplete with a full page=%s', async fullPage => {
    const directory = fs.mkdtempSync(path.join('/tmp/cheers-test', 'trace-repeat-cursor-'));
    const foreign = { traceId: '1'.repeat(32), spans: [{ id: '1'.repeat(16), traceId: '1'.repeat(32),
      name: 'foreign', startedMs: 1, endedMs: 2, attributes: { sessionId: 'selected', workspaceRoot: '/other' },
      status: { status: 'ok' as const }, events: [], links: [] }] };
    let calls = 0;
    const store: TelemetryStore = {
      async findTraces() {
        calls += 1;
        const traces = calls === 3 && fullPage ? [{ ...foreign, spans: foreign.spans.map(span => ({ ...span,
          attributes: { ...span.attributes, workspaceRoot: '/selected' },
        })) }] : [foreign];
        return { traces, cursor: calls === 1 ? 'first-page' : calls === 2 ? 'second-page' : 'first-page' };
      },
      async getTrace() { return undefined; },
    };
    try {
      const dashboard = await openTraceDashboard(directory, path.join(directory, 'trace.log'), store,
        { sessionId: 'selected', workspaceRoot: '/selected' });
      const value = await (await fetch(dashboard.url + 'data?limit=1')).json() as { cursor?: string; incomplete: boolean };
      expect(calls).toBe(3);
      expect(value.cursor).toBeUndefined();
      expect(value.incomplete).toBe(true);
    } finally {
      await closeTraceDashboard();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('stops scoped trace page reads after admission is revoked', async () => {
    const directory = fs.mkdtempSync(path.join('/tmp/cheers-test', 'trace-page-revoked-'));
    let calls = 0, admitted = true;
    const foreign = { traceId: '2'.repeat(32), spans: [{ id: '2'.repeat(16), traceId: '2'.repeat(32),
      name: 'foreign', startedMs: 1, endedMs: 2, attributes: { sessionId: 'selected', workspaceRoot: '/other' },
      status: { status: 'ok' as const }, events: [], links: [] }] };
    const store: TelemetryStore = {
      async findTraces() { calls += 1; admitted = false; return { traces: [foreign], cursor: 'next' }; },
      async getTrace() { return undefined; },
    };
    try {
      const dashboard = await openTraceDashboard(directory, path.join(directory, 'trace.log'), store,
        { sessionId: 'selected', workspaceRoot: '/selected', admission: () => admitted ? undefined : 'revoked' });
      const response = await fetch(dashboard.url + 'data');
      expect(response.status).toBe(409);
      expect(calls).toBe(1);
    } finally {
      await closeTraceDashboard();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('distinguishes long workspace paths after persistence', async () => {
    const directory = fs.mkdtempSync(path.join('/tmp/cheers-test', 'trace-workspace-'));
    const sink = new RotatingFileSink({ logDir: directory });
    const prefix = path.join(directory, 'a'.repeat(130), 'b'.repeat(130));
    const sessionId = 'same-session';
    const workspaceRoot = path.join(prefix, 'selected');
    setStructuredLogSink(entry => sink.write(entry));
    try {
      const writer = new JsonlTraceStore({ sink });
      const logger = new StructuredLogger('test');
      await runTraceScope(writer, { sessionId, workspaceRoot, sink }, { name: 'selected-span' }, () => logger.info('selected-log'));
      await runTraceScope(writer, { sessionId, workspaceRoot: path.join(prefix, 'other'), sink },
        { name: 'other-span' }, () => logger.info('other-log'));
      const reader = new JsonlTraceStore({ sink, sessionId, workspaceRoot });
      expect(reader.readAllSpans().map(span => span.name)).toEqual(['selected-span']);
      const dashboard = await openTraceDashboard(directory, sink.getCurrentFilePath(), reader, { sessionId, workspaceRoot });
      const body = await (await fetch(dashboard.url + 'data')).text();
      expect(body).toContain('selected-span');
      expect(body).toContain('selected-log');
      expect(body).not.toContain('other-span');
      expect(body).not.toContain('other-log');
    } finally {
      setStructuredLogSink(null);
      await closeTraceDashboard();
      sink.flushAndClose();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('refuses reusing an open dashboard for a different source or session', async () => {
    const directory = fs.mkdtempSync(path.join('/tmp/cheers-test', 'trace-owner-'));
    const sink = new RotatingFileSink({ logDir: directory, filePrefix: 'trace', pid: 2348 });
    const store = new InMemoryTraceStore();
    try {
      const first = await openTraceDashboard(directory, sink.getCurrentFilePath(), store, { sessionId: 'first' });
      expect(await openTraceDashboard(directory, sink.getCurrentFilePath(), store, { sessionId: 'first' })).toBe(first);
      await expect(openTraceDashboard(directory, sink.getCurrentFilePath(), store, { sessionId: 'second' })).rejects.toThrow('different');
      const second = path.join(directory, 'second');
      await expect(openTraceDashboard(second, path.join(second, 'trace.log'), store, { sessionId: 'first' })).rejects.toThrow('different');
    } finally { await closeTraceDashboard(); sink.flushAndClose(); fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it('forwards bounded trace filters and never lets a URL override the captured session', async () => {
    const directory = fs.mkdtempSync(path.join('/tmp/cheers-test', 'trace-query-'));
    const sink = new RotatingFileSink({ logDir: directory, filePrefix: 'trace', pid: 2349 });
    const queries: TraceQuery[] = [], store: TelemetryStore = {
      async findTraces(query = {}) { queries.push(query); return { traces: [] }; }, async getTrace() { return undefined; },
    };
    try {
      const dashboard = await openTraceDashboard(directory, sink.getCurrentFilePath(), store, { sessionId: 'captured' });
      const response = await fetch(dashboard.url + 'data?name=provider.request&errors=true&limit=9999&sessionId=other');
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(queries.at(-1)).toMatchObject({ name: 'provider.request', errors: true, limit: 50, attributes: { sessionId: 'captured' } });
    } finally { await closeTraceDashboard(); sink.flushAndClose(); fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it('refuses stale read publication after a pending store query', async () => {
    const directory = fs.mkdtempSync(path.join('/tmp/cheers-test', 'trace-publish-'));
    const sink = new RotatingFileSink({ logDir: directory, filePrefix: 'trace', pid: 2350 });
    let release!: () => void, entered!: () => void, current = true;
    const pending = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
    const store: TelemetryStore = { async findTraces() { entered(); await pending; return { traces: [] }; }, async getTrace() { return undefined; } };
    try {
      const dashboard = await openTraceDashboard(directory, sink.getCurrentFilePath(), store, { sessionId: 'captured', admission: () => current ? undefined : 'source-changed' });
      const response = fetch(dashboard.url + 'data'); await started; current = false; release();
      const result = await response; expect(result.status).toBe(409); expect(await result.text()).not.toContain('rows');
    } finally { release(); await closeTraceDashboard(); sink.flushAndClose(); fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it('retires the original dashboard after an observed admission failure', async () => {
    const directory = fs.mkdtempSync(path.join('/tmp/cheers-test', 'trace-revoked-'));
    const sink = new RotatingFileSink({ logDir: directory, filePrefix: 'trace', pid: 2350 });
    let admitted = true;
    try {
      const scope = { sessionId: 'retired', admission: () => admitted ? undefined : 'revoked' };
      const first = await openTraceDashboard(directory, sink.getCurrentFilePath(), undefined, scope);
      admitted = false;
      expect((await fetch(first.url + 'data')).status).toBe(409);
      admitted = true;
      const stale = await fetch(first.url + 'data').catch(() => undefined);
      expect(stale?.ok).not.toBe(true);
      const second = await openTraceDashboard(directory, sink.getCurrentFilePath(), undefined, scope);
      expect(second).not.toBe(first);
      expect((await fetch(second.url + 'data')).status).toBe(200);
    } finally { await closeTraceDashboard(); sink.flushAndClose(); fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it('retires an opening dashboard before publishing its URL', async () => {
    const directory = fs.mkdtempSync(path.join('/tmp/cheers-test', 'trace-opening-'));
    const currentPath = path.join(directory, 'trace.log');
    try {
      const opening = openTraceDashboard(directory, currentPath);
      const refused = expect(opening).rejects.toThrow('unavailable');
      expect(await closeTraceDashboard()).toBe(true);
      await refused;
      const replacement = await openTraceDashboard(directory, currentPath);
      expect((await fetch(replacement.url + 'data')).status).toBe(200);
    } finally { await closeTraceDashboard(); fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it('keeps the captured store session filter even on direct-file reads and memory fallback', async () => {
    const directory = fs.mkdtempSync(path.join('/tmp/cheers-test', 'trace-file-scope-'));
    const filePath = path.join(directory, 'trace.jsonl');
    const writer = new JsonlTraceStore({ filePath });
    await writer.startSpan({ name: 'first-only', attributes: { sessionId: 'first' } }, () => {});
    await writer.startSpan({ name: 'second-only', attributes: { sessionId: 'second' } }, () => {});
    try {
      const reader = new JsonlTraceStore({ filePath, sessionId: 'first' });
      expect((await reader.findTraces()).traces.flatMap(trace => trace.spans).map(span => span.name)).toEqual(['first-only']);
      expect(reader.readAllSpans().map(span => span.name)).toEqual(['first-only']);
      const retained = new JsonlTraceStore({ filePath: path.join(directory, 'missing.jsonl'), sessionId: 'first' });
      await retained.startSpan({ name: 'other-memory', attributes: { sessionId: 'second' } }, () => {});
      expect((await retained.findTraces()).traces).toHaveLength(0);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it.each(['profile', 'logs', 'linked logs'])('revokes a named-profile dashboard after its %s directory is replaced', async target => {
    const directory = fs.mkdtempSync(path.join('/tmp/cheers-test', 'trace-profile-'));
    const profile = createProfileContext({ name: 'original', homeDir: directory, env: {} });
    let sink: RotatingFileSink | undefined;
    try {
      const dashboard = await withProfile(profile, async () => {
        sink = new RotatingFileSink();
        sink.write({ timestamp: new Date().toISOString(), level: 'info', component: 'profile', message: 'original-profile-record', fields: { sessionId: 'bound' } });
        return openTraceDashboard(sink.getLogDir(), sink.getCurrentFilePath(), undefined, { sessionId: 'bound' });
      });
      expect(await (await fetch(dashboard.url + 'data')).text()).toContain('original-profile-record');
      const replaced = target === 'profile' ? profile.root : sink!.getLogDir();
      fs.renameSync(replaced, replaced + '-old');
      if (target === 'linked logs') fs.symlinkSync(replaced + '-old', replaced, 'dir');
      else fs.mkdirSync(replaced);
      if (target === 'logs') {
        sink!.write({ timestamp: new Date().toISOString(), level: 'info', component: 'profile', message: 'replacement-profile-record', fields: { sessionId: 'bound' } });
      }
      const result = await fetch(dashboard.url + 'data'); expect(result.status).toBe(409); expect(await result.text()).not.toContain('original-profile-record');
    } finally { await closeTraceDashboard(); sink?.flushAndClose(); fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it('omits symlinked log shards without dropping the admitted log', async () => {
    const directory = fs.mkdtempSync(path.join('/tmp/cheers-test', 'trace-shard-'));
    const logDir = path.join(directory, 'logs');
    const sink = new RotatingFileSink({ logDir });
    const entry = { timestamp: new Date().toISOString(), level: 'info' as const, component: 'source', fields: { sessionId: 'bound' } };
    sink.write({ ...entry, message: 'admitted-record' });
    const outside = path.join(directory, 'outside.log');
    fs.writeFileSync(outside, JSON.stringify({ ...entry, message: 'outside-record' }) + '\n');
    fs.symlinkSync(outside, path.join(logDir, 'archived.log.1'));
    try {
      const dashboard = await openTraceDashboard(logDir, sink.getCurrentFilePath(), undefined, { sessionId: 'bound' });
      const result = await fetch(dashboard.url + 'data');
      expect(result.status).toBe(200);
      const body = await result.text();
      expect(body).toContain('admitted-record');
      expect(body).not.toContain('outside-record');
      expect(JSON.parse(body).status).toBe('partial');
    } finally { await closeTraceDashboard(); sink.flushAndClose(); fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it('uses the actual trace command session and preserves unknown log ownership', async () => {
    const directory = fs.mkdtempSync(path.join('/tmp/cheers-test', 'trace-command-'));
    const sink = new RotatingFileSink({ logDir: directory, filePrefix: 'trace', pid: 2351 });
    setGlobalRotatingFileSink(sink);
    for (const sessionId of ['bound', 'other']) sink.write({ timestamp: new Date().toISOString(), level: 'info', component: 'command',
      message: sessionId + '-record', fields: { sessionId, workspaceRoot: directory } });
    sink.write({ timestamp: new Date().toISOString(), level: 'info', component: 'command',
      message: 'old-workspace-record', fields: { sessionId: 'bound', workspaceRoot: path.join(directory, 'old') } });
    const writer = new JsonlTraceStore({ sink });
    await writer.startSpan({ name: 'new-workspace-span', attributes: { sessionId: 'bound', workspaceRoot: directory } }, () => {});
    await writer.startSpan({ name: 'old-workspace-span', attributes: { sessionId: 'bound', workspaceRoot: path.join(directory, 'old') } }, () => {});
    try {
      const result = await runTraceCommand(['open'], { cwd: directory, sessionId: 'bound' });
      const url = result.output.match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0]; expect(url).toBeDefined();
      const text = await (await fetch(url + 'data')).text(); expect(text).toContain('bound-record'); expect(text).not.toContain('other-record');
      expect(text).toContain('new-workspace-span');
      expect(text).not.toContain('old-workspace');
      for (const action of ['open', 'status', 'close']) {
        const other = await runTraceCommand([action], { cwd: directory, sessionId: 'other' });
        expect(other.output).not.toContain(url);
        expect(other.output).toContain('different session');
      }
      const otherWorkspace = await runTraceCommand(['close'], { cwd: path.join(directory, 'old'), sessionId: 'bound' });
      expect(otherWorkspace.output).toContain('different session or source');
      expect((await fetch(url + 'data')).status).toBe(200);
    } finally { await closeTraceDashboard(); setGlobalRotatingFileSink(null); sink.flushAndClose(); fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it('prevents two concurrent opens from publishing different dashboards', async () => {
    const directory = fs.mkdtempSync(path.join('/tmp/cheers-test', 'trace-opening-'));
    const sink = new RotatingFileSink({ logDir: directory, filePrefix: 'trace', pid: 2352 });
    const opened = await Promise.all([openTraceDashboard(directory, sink.getCurrentFilePath()), openTraceDashboard(directory, sink.getCurrentFilePath())]);
    try { expect(opened[0]).toBe(opened[1]); }
    finally { for (const item of opened) await item.close(); sink.flushAndClose(); fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it('joins concurrent slash-command opens for the same source and session', async () => {
    const directory = fs.mkdtempSync(path.join('/tmp/cheers-test', 'trace-command-opening-'));
    const sink = new RotatingFileSink({ logDir: directory });
    setGlobalRotatingFileSink(sink);
    try {
      const context = { cwd: directory, sessionId: 'bound' };
      const results = await Promise.all([runTraceCommand(['open'], context), runTraceCommand(['open'], context)]);
      const urls = results.map(result => result.output.match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0]);
      expect(urls[0]).toBeDefined();
      expect(urls[1]).toBe(urls[0]);
    } finally { await closeTraceDashboard(); setGlobalRotatingFileSink(null); sink.flushAndClose(); fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it('admits initial log creation and later rotation without replacing the dashboard', async () => {
    const directory = fs.mkdtempSync(path.join('/tmp/cheers-test', 'trace-rotation-'));
    const logDir = path.join(directory, 'logs');
    const sink = new RotatingFileSink({ logDir, maxFileSizeMb: 0.0004 });
    setGlobalRotatingFileSink(sink);
    const context = { cwd: directory, sessionId: 'bound' };
    const entry = { timestamp: new Date().toISOString(), level: 'info' as const, component: 'command',
      fields: { sessionId: 'bound', workspaceRoot: directory } };
    try {
      const result = await runTraceCommand(['open'], context);
      const url = result.output.match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0];
      expect(url).toBeDefined();
      expect(fs.existsSync(logDir)).toBe(false);
      sink.write({ ...entry, message: 'initial-record' });
      const firstPath = sink.getCurrentFilePath();
      sink.write({ ...entry, message: 'rotated-record'.padEnd(300, '.') });
      expect(sink.getCurrentFilePath()).not.toBe(firstPath);
      const reopened = await runTraceCommand(['open'], context);
      expect(reopened.output).toContain(url);
      const body = await (await fetch(url + 'data')).text();
      expect(body).toContain('initial-record');
      expect(body).toContain('rotated-record');
    } finally { await closeTraceDashboard(); setGlobalRotatingFileSink(null); sink.flushAndClose(); fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it('lets a successor open a dashboard when the original slash-command admission retires', async () => {
    const directory = fs.mkdtempSync(path.join('/tmp/cheers-test', 'trace-command-successor-'));
    const sink = new RotatingFileSink({ logDir: directory });
    setGlobalRotatingFileSink(sink);
    let current = 'first';
    const command = (action: string, sessionId: string) => runTraceCommand([action], {
      cwd: directory, sessionId, admission: () => sessionId === current ? undefined : 'session changed',
    });
    try {
      const first = (await command('open', 'first')).output.match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0];
      expect(first).toBeDefined();
      current = 'second';
      expect((await fetch(first + 'data')).status).toBe(409);
      expect((await command('status', 'second')).output).toContain('is not running');
      const second = (await command('open', 'second')).output.match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0];
      expect(second).toBeDefined();
      expect((await fetch(second + 'data')).status).toBe(200);
      await expect(fetch(first + 'data')).rejects.toThrow();
    } finally { await closeTraceDashboard(); setGlobalRotatingFileSink(null); sink.flushAndClose(); fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it('captures ordinary production log ownership instead of trusting supplied session fields', async () => {
    const directory = fs.mkdtempSync(path.join('/tmp/cheers-test', 'trace-logger-owner-'));
    const sink = new RotatingFileSink({ logDir: directory, filePrefix: 'trace', pid: 2353 });
    const recorder = new InMemoryTraceStore();
    setStructuredLogSink(entry => sink.write(entry));
    try {
      await runTraceScope(recorder, { sessionId: 'original', workspaceRoot: directory }, { name: 'session.run' }, async () => {
        const logger = createComponentLogger('consumer'); logger.info('inherited-log');
        logger.info('misstated-log', { sessionId: 'other', workspaceRoot: '/other' });
      });
      const dashboard = await openTraceDashboard(directory, sink.getCurrentFilePath(), recorder, { sessionId: 'original' });
      const text = await (await fetch(dashboard.url + 'data')).text();
      expect(text).toContain('inherited-log'); expect(text).toContain('misstated-log');
      const rows = sink.getRecentLines(10).map(line => JSON.parse(line));
      expect(rows.every(row => row.fields.sessionId === 'original' && row.fields.workspaceRoot === directory)).toBe(true);
    } finally { setStructuredLogSink(null); await closeTraceDashboard(); sink.flushAndClose(); fs.rmSync(directory, { recursive: true, force: true }); }
  });
});
