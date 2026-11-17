import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAgentSession, DefaultResourceLoader, type ExtensionAPI } from '../index.js';

let root: string;
beforeEach(() => {
  const temporary = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(temporary, { recursive: true });
  root = fs.mkdtempSync(path.join(temporary, 'sdk-ui-'));
  const home = path.join(root, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
  vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('GIT_CEILING_DIRECTORIES', root);
  vi.stubEnv('CHEERS_PROVIDER_MODE', 'synthetic');
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it('binds UI to preloaded extensions and preserves a usable host after ordinary abort', async () => {
  let api!: ExtensionAPI;
  const loader = new DefaultResourceLoader({ cwd: root, noSkills: true, noThemes: true,
    extensionFactories: [value => { api = value; }] });
  await loader.reload();
  const confirmed = vi.fn(async () => true);
  const { session } = await createAgentSession({ cwd: root, resourceLoader: loader, ui: { confirm: confirmed }, noTools: 'all' });
  try {
    expect(await api.ui.confirm('Before', 'Ready?')).toBe(true);
    await session.abort();
    expect(await api.ui.confirm('After', 'Ready?')).toBe(true);
    expect((await api.getAllTools()).length).toBeGreaterThan(0);
    expect(await session.prompt('After ordinary abort')).toContain('After ordinary abort');
  } finally { await session.dispose(); }
});

it('releases an input hook dialog before waiting for SDK disposal', async () => {
  let asked!: () => void;
  const entered = new Promise<void>(resolve => { asked = resolve; });
  const loader = new DefaultResourceLoader({ cwd: root, noSkills: true, noThemes: true,
    extensionFactories: [api => api.on('input', async () => { await api.ui.input('Continue'); })] });
  await loader.reload();
  let signal: AbortSignal | undefined;
  const { session } = await createAgentSession({ cwd: root, resourceLoader: loader, noTools: 'all',
    ui: { input: (_title, _placeholder, options) => { signal = options?.signal; asked(); return new Promise(() => {}); } } });
  const prompting = session.prompt('Wait for input');
  const observed = prompting.catch(() => undefined);
  await entered;
  await session.dispose();
  await observed;
  expect(signal?.aborted).toBe(true);
});
