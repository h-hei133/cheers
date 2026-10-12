import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { listIgnoredViaGit } from './discovery.js';

let fixture: string;
let root: string;
const gitEnv = { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'ignore-discovery-'));
  root = path.join(fixture, 'workspace');
  fs.mkdirSync(root);
  execFileSync('git', ['init', '-q', root], { env: gitEnv });
  fs.writeFileSync(path.join(root, '.gitignore'), '*.tmp\n');
});
afterEach(() => fs.rmSync(fixture, { recursive: true, force: true }));
const linux = it.skipIf(process.platform !== 'linux');

linux.each(['config', 'config.worktree', 'index', 'info/exclude', 'commondir'])('refuses an escaping %s metadata source', relative => {
  const outside = path.join(fixture, 'outside');
  fs.writeFileSync(outside, 'PRIVATE_METADATA\n');
  const source = path.join(root, '.git', relative);
  fs.rmSync(source, { force: true });
  fs.symlinkSync(outside, source);
  expect(listIgnoredViaGit(root, ['hidden.tmp'])).toBeNull();
});

linux.each(['include', 'symlink'])('checks the worktree metadata config before using its %s source', scenario => {
  const common = path.join(root, 'common');
  const metadata = path.join(root, 'metadata');
  fs.renameSync(path.join(root, '.git'), common);
  fs.mkdirSync(metadata);
  fs.copyFileSync(path.join(common, 'HEAD'), path.join(metadata, 'HEAD'));
  fs.writeFileSync(path.join(metadata, 'commondir'), '../common\n');
  fs.writeFileSync(path.join(root, '.git'), 'gitdir: metadata\n');
  fs.appendFileSync(path.join(common, 'config'), '[extensions]\nworktreeConfig=true\n');
  const outside = path.join(fixture, 'outside.config');
  fs.writeFileSync(outside, '[core]\nexcludesFile=/nonexistent\n');
  const config = path.join(metadata, 'config.worktree');
  if (scenario === 'symlink') fs.symlinkSync(outside, config);
  else fs.writeFileSync(config, `[include]\npath=${outside}\n`);
  expect(listIgnoredViaGit(root, ['hidden.tmp'])).toBeNull();
});

it('does not let core.worktree relocate implicit ignore reads', () => {
  execFileSync('git', ['-C', root, 'config', 'core.worktree', fixture], { env: gitEnv });
  expect(listIgnoredViaGit(root, ['hidden.tmp'])).toBeNull();
});
