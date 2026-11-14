import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, expect, it } from 'vitest';

const directories: string[] = [];
const loader = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function temporaryDirectory(): string {
  const root = '/tmp/cheers-test';
  fs.mkdirSync(root, { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, 'trace-runtime-'));
  directories.push(directory);
  return directory;
}

function runChild(source: string, directory: string, expectedReports: readonly string[]): Promise<{
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  killed: boolean;
  reports: readonly boolean[];
}> {
  // A fresh, isolated environment preserves Node's default rejection policy and
  // enables product persistence without borrowing credentials or profile state.
  return new Promise(resolve => {
    execFile(process.execPath, ['--import', loader, '--input-type=module', '--eval', source], {
      cwd: directory,
      env: { PATH: process.env.PATH, HOME: directory, USERPROFILE: directory,
        TMPDIR: directory, TSX_DISABLE_CACHE: '1' },
      timeout: 8000,
      killSignal: 'SIGKILL',
      maxBuffer: 32 * 1024,
    }, (error, stdout) => {
      const lines = stdout.split(/\r?\n/);
      // Never propagate arbitrary child stderr or source into the test report.
      resolve({ exitCode: error ? typeof error.code === 'number' ? error.code : null : 0,
        signal: error?.signal ?? null, killed: error?.killed === true,
        reports: expectedReports.map(report => lines.includes(report)) });
    });
  });
}

it('keeps exact product outcomes and exits normally after asynchronous settlement observer rejection', async () => {
  const directory = temporaryDirectory();
  const productReport = JSON.stringify({ productValue: true, productError: true, calls: 2 });
  const settledReport = JSON.stringify({ settled: true });
  const source = String.raw`
    import assert from 'node:assert/strict';
    import { InMemoryTraceStore } from ${JSON.stringify(new URL('./span.ts', import.meta.url).href)};
    import { recordSpan } from ${JSON.stringify(new URL('./safe.ts', import.meta.url).href)};
    assert.equal(process.env.VITEST, undefined);
    assert.equal(process.env.NODE_ENV, undefined);
    assert.equal(process.env.NODE_OPTIONS, undefined);
    const store = new InMemoryTraceStore({ onSpanSettled: async () => {
      await Promise.resolve();
      throw new Error('fixture observer failed');
    } });
    const value = { observed: true };
    const original = new Error('fixture product failure');
    let calls = 0;
    const actual = await recordSpan(store, { name: 'product.success' }, () => { calls++; return value; });
    assert.equal(actual, value);
    let caught;
    try { await recordSpan(store, { name: 'product.failure' }, () => { calls++; throw original; }); }
    catch (error) { caught = error; }
    assert.equal(caught, original);
    assert.equal(calls, 2);
    console.log(${JSON.stringify(productReport)});
    // No rejection handler is installed: Node must survive its normal checkpoint.
    await new Promise(resolve => setTimeout(resolve, 25));
    console.log(${JSON.stringify(settledReport)});
  `;
  const result = await runChild(source, directory, [productReport, settledReport]);
  expect(result.reports[0]).toBe(true);
  expect(result).toEqual({ exitCode: 0, signal: null, killed: false, reports: [true, true] });
}, 10_000);

it('keeps late ordinary logs in the captured sink when a custom recorder run outlives sink replacement', async () => {
  const directory = temporaryDirectory();
  const report = JSON.stringify({ originalLate: 1, successorLate: 0, successorCurrent: 1 });
  const source = String.raw`
    import assert from 'node:assert/strict';
    import path from 'node:path';
    import { InMemoryTraceStore } from ${JSON.stringify(new URL('./span.ts', import.meta.url).href)};
    import { runSessionTrace } from ${JSON.stringify(new URL('./runtime.ts', import.meta.url).href)};
    import { createComponentLogger } from ${JSON.stringify(new URL('../structuredLogger.ts', import.meta.url).href)};
    import { RotatingFileSink, setGlobalRotatingFileSink } from ${JSON.stringify(new URL('../rotatingFileSink.ts', import.meta.url).href)};
    assert.equal(process.env.VITEST, undefined);
    assert.equal(process.env.NODE_ENV, undefined);
    const first = new RotatingFileSink({ logDir: path.join(process.cwd(), 'first') });
    const second = new RotatingFileSink({ logDir: path.join(process.cwd(), 'second') });
    const recorder = new InMemoryTraceStore();
    const logger = createComponentLogger('fixture-owner');
    let entered;
    const started = new Promise(resolve => { entered = resolve; });
    let release;
    const barrier = new Promise(resolve => { release = resolve; });
    setGlobalRotatingFileSink(first);
    try {
      const run = runSessionTrace({ sessionId: 'original-run', workspaceRoot: process.cwd() }, async () => {
        entered();
        await barrier;
        logger.info('original-late', { sessionId: 'original-run' });
      }, recorder);
      await started;
      setGlobalRotatingFileSink(second);
      logger.info('successor-current', { sessionId: 'successor-run' });
      release();
      await run;
      const entries = sink => sink.getRecentLines(20).map(line => JSON.parse(line));
      const original = entries(first);
      const successor = entries(second);
      const counts = {
        originalLate: original.filter(entry => entry.message === 'original-late').length,
        successorLate: successor.filter(entry => entry.message === 'original-late').length,
        successorCurrent: successor.filter(entry => entry.message === 'successor-current').length,
      };
      console.log(JSON.stringify(counts));
      assert.equal(counts.originalLate, 1);
      assert.equal(counts.successorLate, 0);
      assert.equal(counts.successorCurrent, 1);
      const root = recorder.snapshot().find(span => span.name === 'session.run');
      assert.equal(original.find(entry => entry.message === 'original-late').traceId, root.traceId);
    } finally {
      release();
      setGlobalRotatingFileSink(null);
    }
  `;
  const result = await runChild(source, directory, [report]);
  expect(result).toEqual({ exitCode: 0, signal: null, killed: false, reports: [true] });
}, 10_000);

it('preserves product outcomes and normal process exit when asynchronous span methods reject', async () => {
  const directory = temporaryDirectory();
  const productReport = JSON.stringify({ productValue: true, productError: true, calls: 2, methods: 8 });
  const settledReport = JSON.stringify({ settled: true });
  const source = String.raw`
    import assert from 'node:assert/strict';
    import { InMemoryTraceStore } from ${JSON.stringify(new URL('./span.ts', import.meta.url).href)};
    import { recordSpan } from ${JSON.stringify(new URL('./safe.ts', import.meta.url).href)};
    const source = new InMemoryTraceStore();
    const invoked = [];
    const fail = async name => {
      invoked.push(name);
      await Promise.resolve();
      throw new Error('fixture method failed');
    };
    const recorder = { startSpan: (options, callback) => source.startSpan(options, span => callback({
      ...span,
      setAttributes: async () => fail('setAttributes'),
      setStatus: async () => fail('setStatus'),
      addEvent: async () => fail('addEvent'),
      addLink: async () => fail('addLink'),
    })) };
    const sideEffects = span => {
      span.setAttributes({ fixture: true });
      span.setStatus({ status: 'ok' });
      span.addEvent('fixture');
      span.addLink({ context: span });
    };
    const value = { observed: true };
    const original = new Error('fixture product failure');
    let calls = 0;
    const actual = await recordSpan(recorder, { name: 'product.success' }, span => {
      calls++; sideEffects(span); return value;
    });
    assert.equal(actual, value);
    let caught;
    try { await recordSpan(recorder, { name: 'product.failure' }, span => {
      calls++; sideEffects(span); throw original;
    }); } catch (error) { caught = error; }
    assert.equal(caught, original);
    assert.equal(calls, 2);
    assert.deepEqual(invoked, ['setAttributes', 'setStatus', 'addEvent', 'addLink',
      'setAttributes', 'setStatus', 'addEvent', 'addLink']);
    console.log(${JSON.stringify(productReport)});
    await new Promise(resolve => setTimeout(resolve, 25));
    console.log(${JSON.stringify(settledReport)});
  `;
  const result = await runChild(source, directory, [productReport, settledReport]);
  expect(result.reports[0]).toBe(true);
  expect(result).toEqual({ exitCode: 0, signal: null, killed: false, reports: [true, true] });
}, 10_000);
