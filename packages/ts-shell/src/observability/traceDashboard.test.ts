import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RotatingFileSink } from './rotatingFileSink.js';
import { closeTraceDashboard, openTraceDashboard } from './traceDashboard.js';
import { setStructuredLogSink, StructuredLogger } from './structuredLogger.js';

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
});
