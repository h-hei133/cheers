import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { afterEach, beforeEach, expect, it } from 'vitest';

let root: string;
const children: ChildProcessWithoutNullStreams[] = [];
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'config-process-')); });
afterEach(() => { for (const child of children.splice(0)) child.kill(); fs.rmSync(root, { recursive: true, force: true }); });

/** Both independent processes hold their original baseline before either can save. */
function writer(file: string, patch: unknown) {
  const module = path.resolve('src/config/runtimeConfig.ts');
  const child = spawn(process.execPath, [createRequire(import.meta.url).resolve('tsx/cli'), '--eval', `
    const config = require(${JSON.stringify(module)});
    const base = config.readRuntimeConfigEditAt(${JSON.stringify(file)});
    process.stdout.write('ready\\n');
    process.stdin.once('data', () => {
      try { config.writeRuntimeConfigFileAt(${JSON.stringify(file)}, { ...base.values, ...${JSON.stringify(patch)} }, base); process.stdout.write('saved\\n'); }
      catch (error) { process.stdout.write(error.code + ':' + error.state + '\\n'); }
      process.stdin.destroy();
    });
  `], { env: process.env, stdio: 'pipe' });
  children.push(child);
  let output = ''; let errors = '';
  child.stderr.on('data', data => { errors += data; });
  const ready = new Promise<void>((resolve, reject) => {
    child.stdout.on('data', data => { output += data; if (output.includes('ready\n')) resolve(); });
    child.on('error', reject);
    child.on('exit', () => { if (!output.includes('ready\n')) reject(new Error(errors || 'writer exited before baseline')); });
  });
  const done = new Promise<string>((resolve, reject) => {
    child.on('error', reject);
    // `close` fires after the stdio streams finish, while `exit` can arrive
    // before the last chunk has been delivered: resolving on exit sometimes
    // returned 'ready\n' without the 'saved\n' the child had already written.
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error(errors || `writer exit ${code}`)));
  });
  // Attach a handler immediately; readiness may fail before the caller awaits exit.
  void done.catch(() => undefined);
  return { child, ready, done };
}

it.each([false, true])('retains disjoint two-process writes (initially absent: %s)', async absent => {
  const file = path.join(root, 'config.json');
  if (!absent) fs.writeFileSync(file, '{/* retained */"theme":"old","maxTurns":5}');
  const one = writer(file, { theme: 'dark' }); const two = writer(file, { maxTurns: 9 });
  await Promise.all([one.ready, two.ready]);
  one.child.stdin.write('go'); two.child.stdin.write('go');
  expect(await Promise.all([one.done, two.done])).toEqual(['ready\nsaved\n', 'ready\nsaved\n']);
  const text = fs.readFileSync(file, 'utf8');
  expect(text).toContain('"dark"'); expect(text).toMatch(/"maxTurns"\s*:\s*9/);
  if (!absent) expect(text).toContain('/* retained */');
  expect(fs.readdirSync(root)).toEqual(['config.json']);
}, 20000);

it('admits one same-field writer and reports the other conflict without overwriting it', async () => {
  const file = path.join(root, 'config.json'); fs.writeFileSync(file, '{"theme":"old"}');
  const one = writer(file, { theme: 'one' }); const two = writer(file, { theme: 'two' });
  await Promise.all([one.ready, two.ready]);
  one.child.stdin.write('go'); two.child.stdin.write('go');
  const results = await Promise.all([one.done, two.done]);
  expect(results.filter(value => value === 'ready\nsaved\n')).toHaveLength(1);
  expect(results.filter(value => value === 'ready\nconflict:unchanged\n')).toHaveLength(1);
  expect(JSON.parse(fs.readFileSync(file, 'utf8')).theme).toBe(results[0] === 'ready\nsaved\n' ? 'one' : 'two');
}, 20000);
