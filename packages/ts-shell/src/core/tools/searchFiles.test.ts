import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { executeLocally } from '../../runtime/execution/local.js';
import { createDefaultExecutionService } from '../../runtime/execution/service.js';
import { createGrepToolDefinition } from './grep.js';
import { forgetRipgrepBinary, searchWithRipgrep } from './grepRipgrep.js';
import { collectSearchFiles, searchFileBatches } from './searchFiles.js';
vi.mock('../../runtime/execution/local.js', async () => {
  const actual = await vi.importActual<typeof import('../../runtime/execution/local.js')>('../../runtime/execution/local.js');
  return { ...actual, executeLocally: vi.fn(actual.executeLocally) };
});
let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'search-files-'));
  await fs.mkdir(path.join(root, 'denied'));
  await fs.writeFile(path.join(root, 'public.txt'), 'needle public');
  await fs.writeFile(path.join(root, 'denied', 'private.txt'), 'needle PRIVATE_MARKER');
  forgetRipgrepBinary(); vi.mocked(executeLocally).mockClear();
});
afterEach(async () => { forgetRipgrepBinary(); vi.restoreAllMocks(); vi.unstubAllEnvs(); await fs.rm(root, { recursive: true, force: true }); });
function check(target: string): void { if (path.basename(target) === 'denied') throw new Error('denied'); }
it('passes only authorized native candidates to content search, without fallback', async () => {
  const service = createDefaultExecutionService();
  const walk = vi.spyOn(service, 'listFilesRecursive');
  const result = await createGrepToolDefinition(service).execute({ pattern: 'needle' }, {
    workspaceRoot: root, taskId: 'test', assertFileAccess: check,
  });
  expect(result.success).toBe(true);
  expect(result.output).toContain('needle public');
  expect(result.output).not.toContain('PRIVATE_MARKER');
  expect(walk).not.toHaveBeenCalled();
  const searches = vi.mocked(executeLocally).mock.calls.map(([input]) => input).filter(input => input.args?.includes('--json'));
  expect(searches).toHaveLength(1);
  const args = searches[0]!.args!;
  expect(args.slice(args.indexOf('--') + 2)).toEqual(process.platform === 'linux' ? ['/proc/self/fd/3'] : ['public.txt']);
  if (process.platform === 'linux') expect(searches[0]!.readDescriptors).toHaveLength(1);
});
it('does not spawn a content search when every candidate is denied', async () => {
  const result = await searchWithRipgrep({ pattern: 'needle', searchPath: '', limit: 10, workspaceRoot: root,
    assertFileAccess: target => { if (target !== root) throw new Error('denied'); },
  });
  expect(result).toEqual({ ok: true, matches: [] });
  expect(vi.mocked(executeLocally).mock.calls.some(([input]) => input.args?.includes('--json'))).toBe(false);
});
it('retains dot paths and native ignore rules with an active file policy', async () => {
  await fs.mkdir(path.join(root, '.hidden'));
  await fs.writeFile(path.join(root, '.hidden', 'file.txt'), 'needle dot');
  await fs.writeFile(path.join(root, '.ignore'), 'public.txt\n');
  const result = await searchWithRipgrep({ pattern: 'needle', searchPath: '', limit: 10, workspaceRoot: root, assertFileAccess: check });
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.matches.map(match => match.path)).toEqual(['.hidden/file.txt']);
});
it('rechecks policy before retaining native output', async () => {
  const actual = await vi.importActual<typeof import('../../runtime/execution/local.js')>('../../runtime/execution/local.js');
  let revoked = false;
  vi.mocked(executeLocally).mockImplementation(input => actual.executeLocally(input.args?.includes('--json') ? {
    ...input, onStdout: chunk => { revoked = true; input.onStdout?.(chunk); },
  } : input));
  try {
    const result = await searchWithRipgrep({ pattern: 'needle', searchPath: 'public.txt', limit: 10, workspaceRoot: root,
      assertFileAccess: () => { if (revoked) throw new Error('denied'); },
    });
    expect(revoked).toBe(true);
    expect(result).toEqual({ ok: false, reason: 'failed' });
  } finally { vi.mocked(executeLocally).mockImplementation(actual.executeLocally); }
});
it('batches long candidate lists without dropping paths', () => {
  const files = Array.from({ length: 1000 }, (_, i) => `folder-${i}/` + 'a'.repeat(100));
  const batches = searchFileBatches(files);
  expect(batches.length).toBeGreaterThan(1);
  expect(batches.flat()).toEqual(files);
  for (const batch of batches) expect(batch.reduce((size, file) => size + Buffer.byteLength(file) + 3, 0)).toBeLessThanOrEqual(16_000);
});

it('stops an oversized native candidate stream', async () => {
  const result = await collectSearchFiles({ binary: process.execPath,
    args: ['-e', 'process.stdout.write("x".repeat(17 * 1024 * 1024))'],
    workspaceRoot: root, assertFileAccess: check,
  });
  expect(result).toEqual({ ok: false, reason: 'output-limit' });
});
it('rejects incomplete candidate records rather than reporting an empty search', async () => {
  const result = await collectSearchFiles({ binary: process.execPath,
    args: ['-e', 'process.stdout.write("public.txt")'],
    workspaceRoot: root, assertFileAccess: check,
  });
  expect(result).toEqual({ ok: false, reason: 'failed' });
});

it.each([false, true])('ignores inherited preprocessing configuration with policy=%s', async policy => {
  const preprocessor = path.join(root, 'preprocessor.cjs');
  const marker = path.join(root, 'executed');
  await fs.writeFile(preprocessor, `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed'); process.stdout.write('needle INJECTED');\n`, { mode: 0o755 });
  const config = path.join(root, 'search.config');
  await fs.writeFile(config, `--pre=${preprocessor}\n`);
  vi.stubEnv('RIPGREP_CONFIG_PATH', config);
  const result = await searchWithRipgrep({ pattern: 'needle', searchPath: 'public.txt', limit: 10,
    workspaceRoot: root, ...(policy ? { assertFileAccess: check } : {}),
  });
  await expect(fs.stat(marker)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.matches.map(match => match.line)).toEqual(['needle public']);
});

it('searches only the verified descriptor and refuses a replacement installed before spawn', async () => {
  if (process.platform !== 'linux') return;
  const actual = await vi.importActual<typeof import('../../runtime/execution/local.js')>('../../runtime/execution/local.js');
  let nativeOutput = '';
  vi.mocked(executeLocally).mockImplementation(async input => {
    if (input.args?.includes('--json')) {
      await fs.rename(path.join(root, 'public.txt'), path.join(root, 'original.txt'));
      await fs.writeFile(path.join(root, 'public.txt'), 'needle REPLACEMENT_MARKER');
    }
    return actual.executeLocally({ ...input, onStdout: chunk => {
      if (input.args?.includes('--json')) nativeOutput += chunk.toString();
      return input.onStdout?.(chunk);
    } });
  });
  try {
    const result = await searchWithRipgrep({ pattern: 'needle', searchPath: 'public.txt', limit: 10, workspaceRoot: root, assertFileAccess: check });
    expect(nativeOutput).toContain('needle public');
    expect(nativeOutput).not.toContain('REPLACEMENT_MARKER');
    expect(result).toEqual({ ok: false, reason: 'changed' });
  } finally { vi.mocked(executeLocally).mockImplementation(actual.executeLocally); }
});
