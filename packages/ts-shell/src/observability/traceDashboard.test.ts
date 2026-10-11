import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RotatingFileSink } from './rotatingFileSink.js';
import { closeTraceDashboard, openTraceDashboard } from './traceDashboard.js';

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
});
