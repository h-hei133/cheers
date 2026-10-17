import { expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { gitEnvironment, gitFixture } from './git.js';

it.each(['global', 'xdg'])('isolates system and %s Git policy and repository overrides', source => {
  const fixture = gitFixture(true);
  try {
    const externalHome = path.join(fixture.base, 'external');
    const xdg = path.join(externalHome, '.config');
    fs.mkdirSync(path.join(xdg, 'git'), { recursive: true });
    const system = path.join(externalHome, 'system.gitconfig');
    const global = path.join(externalHome, '.gitconfig');
    fs.writeFileSync(system, '[filter "external-system"]\n clean = false\n');
    fs.writeFileSync(global, '[filter "external-global"]\n smudge = false\n');
    fs.writeFileSync(path.join(xdg, 'git/config'), '[filter "external-xdg"]\n process = false\n');
    const inherited = { ...process.env, ...gitEnvironment(externalHome), GIT_CONFIG_NOSYSTEM: '0',
      GIT_CONFIG_SYSTEM: system, GIT_CONFIG_GLOBAL: source === 'global' ? global : undefined };
    const options = { cwd: fixture.root, env: inherited, encoding: 'utf8' as const };
    const contaminated = execFileSync('git', ['config', '--get-regexp', '^filter\\.'], options);
    expect(contaminated).toContain('filter.external-system.clean');
    expect(contaminated).toContain(`filter.external-${source}.`);

    const env = { ...inherited, GIT_DIR: path.join(externalHome, 'other.git'), GIT_WORK_TREE: externalHome,
      ...gitEnvironment(fixture.home) };
    const isolated = spawnSync('git', ['config', '--get-regexp', '^filter\\.'], { ...options, env });
    expect(isolated.status).toBe(1);
    expect(isolated.stdout).toBe('');
    expect(path.resolve(execFileSync('git', ['rev-parse', '--show-toplevel'], { ...options, env }).trim())).toBe(fixture.root);
    fixture.git(['config', 'filter.local.clean', 'false']);
    expect(execFileSync('git', ['config', '--get', 'filter.local.clean'], { ...options, env }).trim()).toBe('false');
  } finally { fixture.cleanup(); }
});
