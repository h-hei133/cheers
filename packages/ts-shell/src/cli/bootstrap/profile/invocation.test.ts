import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { freshExecutable } from './invocation.js';
import { executeLocally } from '../../../runtime/execution/local.js';

it('runs a TypeScript source entry in the admitted PID without an intermediate launcher', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-source-pid-'));
  try {
    // The source CLI belongs to an ESM package. Without this, the temporary
    // fixture becomes CommonJS, which the Node 20.3 ESM loader does not own.
    fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
    const entry = path.join(root, 'entrypoints/cli.tsx'); fs.mkdirSync(path.dirname(entry));
    fs.writeFileSync(path.join(root, 'entrypoints/pid.ts'), 'export const runtimePid: number = process.pid;');
    fs.writeFileSync(entry, 'import { runtimePid } from "./pid.js"; console.log(runtimePid);');
    const invocation = freshExecutable(process.execPath, entry); let started: number | undefined;
    const result = await executeLocally({ command: invocation.command, args: [...invocation.prefix], cwd: root,
      env: { PATH: process.env.PATH ?? '', HOME: root, USERPROFILE: root }, onStarted: pid => { started = pid; }, timeoutMs: 10000 });
    expect(result.status, result.stderr).toBe('completed'); expect(Number(result.stdout.trim())).toBe(started);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
