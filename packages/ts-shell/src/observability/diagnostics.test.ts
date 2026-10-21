import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readStructuredLogs, traceRows } from './diagnostics.js';
import { RotatingFileSink } from './rotatingFileSink.js';

afterEach(() => vi.restoreAllMocks());

describe('diagnostic trace projection', () => {
  it('preserves recorded request and tool IDs and labels missing IDs', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-diag-'));
    const sink = new RotatingFileSink({ logDir: directory, filePrefix: 'trace', pid: 1234 });
    sink.write({ timestamp: new Date().toISOString(), level: 'info', traceId: 'trace-a', spanId: 'span-a', component: 'provider', message: 'request', fields: { requestId: 'req-1' } });
    sink.write({ timestamp: new Date().toISOString(), level: 'info', traceId: 'trace-b', spanId: 'span-b', component: 'tool', message: 'tool', fields: { toolCallId: 'tool-1', durationMs: 12 } });
    const read = readStructuredLogs(directory, sink.getCurrentFilePath());
    const rows = traceRows(read.entries);
    expect(rows[0]?.requestId).toBe('req-1');
    expect(rows[1]?.toolId).toBe('tool-1');
    expect(rows[1]?.durationMs).toBe(12);
    expect(rows[0]?.toolId).toBeUndefined();
    sink.flushAndClose();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('reports files actually inspected when the recent-record limit stops scanning early', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-diag-'));
    try {
      const record = { timestamp: 't', level: 'info', traceId: 'trace', spanId: 'span', component: 'tool', message: 'm', fields: {} };
      for (let i = 0; i < 3; i++) fs.writeFileSync(path.join(directory, `${i}.log`), `${JSON.stringify(record)}\n`);
      const read = readStructuredLogs(directory, path.join(directory, '2.log'), 1);
      expect(read).toMatchObject({ status: 'reported', filesInspected: 1, unreadableFiles: 0 });
      expect(read.entries).toHaveLength(1);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it('reports unavailable when enumeration finds only unreadable files', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-diag-'));
    try {
      const file = path.join(directory, 'x.log');
      fs.symlinkSync(path.join(directory, 'missing'), file);
      expect(readStructuredLogs(directory, file)).toMatchObject({ status: 'unavailable', filesInspected: 1, unreadableFiles: 1 });
    } finally { vi.restoreAllMocks(); fs.rmSync(directory, { recursive: true, force: true }); }
  });
});
