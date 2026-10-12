import fs, { promises as fsp } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { withNativeReadView } from './index.js';
import { WalkBudget } from '../walk/budget.js';

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-status-')); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
const linux = it.skipIf(process.platform !== 'linux');

async function verify(receipt: string, exitCode: number): Promise<void> {
  await withNativeReadView({ root, assertFileAccess: () => {}, budget: new WalkBudget() }, async (_sources, plan) => {
    const prepared = plan(process.execPath, ['--version'], root);
    fs.writeSync(prepared.readDescriptors[1]!, receipt);
    await prepared.verifyExit(exitCode);
  });
}

linux.each([0, 1, 128])('accepts a framed child completion with exit %s and unknown metadata', async exitCode => {
  await expect(verify(`{"child-pid":1,"future-field":true}\n{"future-document":true}\n{"exit-code":${exitCode}}\n`, exitCode)).resolves.toBeUndefined();
});

linux.each([
  '', '{"child-pid":1}\n', '{"child-pid":1}\n{"exit-code":0}',
  '{"child-pid":1}\nBROKEN\n', '{"exit-code":0}\n',
  '{"child-pid":1}\n{"exit-code":1}\n',
  '{"child-pid":1}\n{"exit-code":0}\n{"exit-code":0}\n',
  '{"child-pid":1}\n{"exit-code":0}\n{"padding":"' + 'x'.repeat(4096) + '"}\n',
])('refuses absent, incomplete or inconsistent child completion %#', async receipt => {
  await expect(verify(receipt, 0)).rejects.toThrow('No complete native answer');
});

linux('keeps the writable status source outside the mounted workspace and closes both descriptors', async () => {
  const handles: FileHandle[] = [];
  const open = fsp.open;
  vi.spyOn(fsp, 'open').mockImplementation(async (...args) => {
    const handle = await open(...args);
    handles.push(handle);
    return handle;
  });
  await withNativeReadView({ root, assertFileAccess: () => {}, budget: new WalkBudget() }, async (sources, plan) => {
    const prepared = plan(process.execPath, ['--version'], root);
    expect(await fsp.readdir(sources.mirror)).toEqual([]);
    expect(fs.readlinkSync(`/proc/self/fd/${prepared.readDescriptors[1]}`)).toMatch(/\(deleted\)$/);
  });
  expect(handles).toHaveLength(2);
  for (const handle of handles) expect(handle.fd).toBe(-1);
});
