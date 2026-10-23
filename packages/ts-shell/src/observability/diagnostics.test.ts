import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LOG_TAIL_BYTES, LOG_TOTAL_BYTES, readStructuredLogs, traceRows } from './diagnostics.js';
import { RotatingFileSink } from './rotatingFileSink.js';
import { readMetrics } from './metrics/reader.js';

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

  it('bounds log and metric enumeration with an explicit partial result', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-diag-bounded-'));
    try {
      const record = { timestamp: 't', level: 'info', traceId: 'trace', spanId: 'span', component: 'tool', message: 'm', fields: {} };
      const metric = { timestamp: 't', level: 'info', traceId: 'trace', spanId: 'span', component: 'metric',
        message: 'latency', fields: { metric: 'ms', value: 1 } };
      for (let index = 0; index < 40; index++) {
        fs.writeFileSync(path.join(directory, `${String(index).padStart(2, '0')}.log`),
          `${JSON.stringify(index % 2 ? metric : record)}\n`);
      }
      const logs = readStructuredLogs(directory, path.join(directory, '39.log'));
      expect(logs).toMatchObject({ status: 'partial', filesTruncated: true });
      expect(logs.filesInspected).toBeLessThanOrEqual(32);
      const metrics = readMetrics(directory, path.join(directory, '39.log'), 200);
      expect(metrics).toMatchObject({ status: 'partial', filesTruncated: true });
      expect(metrics.filesInspected).toBeLessThanOrEqual(32);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it('bounds cumulative log and metric reads across every inspected shard', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-diag-bytes-'));
    try {
      for (let index = 0; index < 6; index++) {
        fs.writeFileSync(path.join(directory, `${index}.log`), 'x'.repeat(LOG_TAIL_BYTES));
      }
      const current = path.join(directory, '5.log');
      const logs = readStructuredLogs(directory, current, 100_000);
      expect(logs).toMatchObject({ status: 'partial', filesTruncated: true, bytesRead: LOG_TOTAL_BYTES });
      const metrics = readMetrics(directory, current, 100_000);
      expect(metrics).toMatchObject({ status: 'partial', filesTruncated: true, bytesRead: LOG_TOTAL_BYTES });
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
});
