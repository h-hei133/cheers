import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readStructuredLogs, traceRows } from './diagnostics.js';
import { RotatingFileSink } from './rotatingFileSink.js';

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
});
