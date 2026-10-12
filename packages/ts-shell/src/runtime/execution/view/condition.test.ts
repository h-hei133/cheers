import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { executeLocally } from '../local.js';
import { WalkBudget } from '../walk/budget.js';
import { conditionApplies } from './condition.js';
import { materializeMetadata } from './git.js';
import { withNativeReadView } from './index.js';

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'git-condition-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

it.skipIf(process.platform !== 'linux').each(['common', 'worktree'])('evaluates branch conditions before consuming unadmitted %s includes', async scope => {
  const env = { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  execFileSync('git', ['init', '-q', root], { env });
  execFileSync('git', ['-C', root, 'symbolic-ref', 'HEAD', 'refs/heads/topic'], { env });
  const config = path.join(root, '.git', 'config');
  const origin = scope === 'common' ? config : path.join(root, '.git', 'config.worktree');
  if (scope === 'worktree') fs.appendFileSync(config, '[extensions]\nworktreeConfig=true\n');
  // The loader runtime exposes this file, but Git must not parse it while the
  // copied repository configuration still has pending admission dependencies.
  fs.appendFileSync(origin, '[include]\npath=/usr/lib/os-release\n');
  const original = fs.readFileSync(config);
  await withNativeReadView({ root, assertFileAccess: () => {}, budget: new WalkBudget() }, async (sources, plan) => {
    const metadata = await materializeMetadata(sources, root);
    if (!metadata) throw new Error('Missing fixture metadata');
    const query = async (args: readonly string[]): Promise<string> => {
      const prepared = plan('git', ['--git-dir', path.join(root, '.git'), '--work-tree', root, '-C', root, ...args], root);
      const result = await executeLocally({ ...prepared, timeoutMs: 2000 });
      await prepared.verifyExit(result.exitCode);
      expect(result.status).toBe('completed');
      return result.stdout;
    };
    expect(await conditionApplies(sources, metadata, origin, 'onbranch:topic', query)).toBe(true);
    expect(fs.readFileSync(sources.destination(config))).toEqual(original);
    sources.verify();
  });
  expect(fs.readFileSync(config)).toEqual(original);
});
