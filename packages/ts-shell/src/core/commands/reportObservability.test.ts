import { describe, expect, it, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runReportCommand } from './reportCommandRuntime.js';
import { RotatingFileSink, setGlobalRotatingFileSink } from '../../observability/rotatingFileSink.js';

describe('/report observability facts', () => {
  let sink: RotatingFileSink | undefined;
  afterEach(() => { sink?.flushAndClose(); setGlobalRotatingFileSink(null); });
  it('uses actual structured logs and available tools', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-report-facts-'));
    sink = new RotatingFileSink({ logDir: root, filePrefix: 'report', pid: 4567 });
    setGlobalRotatingFileSink(sink);
    sink.write({ timestamp: new Date().toISOString(), level: 'info', traceId: 'trace', spanId: 'span', component: 'test', message: 'recorded', fields: {} });
    const target = path.join(root, 'report.zip');
    await runReportCommand([target], { cwd: root, getToolPool: async () => new Map([['read', {} as never]]) } as never);
    const report = JSON.parse(execFileSync('unzip', ['-p', target, 'report.json'], { encoding: 'utf8' })) as { observability: { logs: { entries: number }; tools: { count: number } } };
    expect(report.observability.logs.entries).toBeGreaterThan(0);
    expect(report.observability.tools.count).toBe(1);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('scrubs external tool names in every extracted archive member and reports the redaction', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-report-tools-'));
    try {
      sink = new RotatingFileSink({ logDir: root, filePrefix: 'report', pid: 4568 }); setGlobalRotatingFileSink(sink);
      const target = path.join(root, 'report.zip');
      const names = ['read', 'external.token=PRIVATE_TOOL_NAME', 'external.sk-syntheticPrivateKey12345'];
      const result = await runReportCommand([target], { cwd: root, getToolPool: async () => new Map(names.map(name => [name, {} as never])) } as never);
      const contents = execFileSync('unzip', ['-p', target], { encoding: 'utf8' });
      expect(contents).not.toMatch(/PRIVATE_TOOL_NAME|syntheticPrivateKey12345/);
      const report = JSON.parse(execFileSync('unzip', ['-p', target, 'report.json'], { encoding: 'utf8' }));
      expect(report.observability.tools).toMatchObject({ status: 'reported', count: 3 });
      expect(report.observability.tools.names).toContain('read'); expect(result.output).toContain('unsafe-content');
    } finally { sink?.flushAndClose(); fs.rmSync(root, { recursive: true, force: true }); }
  });
});
