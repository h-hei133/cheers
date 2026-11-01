import { expect, it, vi } from 'vitest';

const inputStream = vi.hoisted(() => ({
  runPromptInputStream: vi.fn(async () => undefined),
}));

vi.mock('../cli/runtime/inputStream.js', () => inputStream);

import { runNonTtyPromptStream, runNonInteractivePrompt } from './cliRuntimeModule.js';
import fs from 'node:fs';
import path from 'node:path';
import { SessionManager } from '../session/SessionManager.js';
import { createShellRuntimeContext } from '../core/shell/runtimeContext.js';
import { getRuntimeConfig } from '../config/runtimeConfig.js';
import { registerCatalogContribution } from '../core/catalog/contributions.js';
import { StreamingRenderer } from '../presentation/terminal/streaming.js';
import { fileURLToPath } from 'node:url';

const scratchBase = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.tmp/phase20-print-source');

it('forwards recovery lifecycle hooks into the non-TTY stream', async () => {
  const onFirstFrame = vi.fn();
  const onUserIntent = vi.fn();

  await runNonTtyPromptStream({
    sessionManager: {},
    runtimeContext: {},
    renderer: {},
    sessionRuntime: {},
    logger: {},
    approvalTrustPolicy: {},
    onFirstFrame,
    onUserIntent,
  } as never);

  expect(inputStream.runPromptInputStream).toHaveBeenCalledWith(expect.objectContaining({
    onFirstFrame,
    onUserIntent,
  }));
});

it.each(['/help', ' \t/help  '])('renders print help for its exact session catalog without invoking contributed commands: %j', async prompt => {
  fs.mkdirSync(scratchBase, { recursive: true });
  const root = fs.mkdtempSync(path.join(scratchBase, 'help-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
  const closes: Array<() => void> = [];
  try {
    const sessionManager = new SessionManager(), session = sessionManager.createNew(root);
    const runtimeContext = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, targetPathBase: root,
      rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null }, session,
      runtimeConfig: getRuntimeConfig(root) });
    const execute = vi.fn();
    for (const [sessionId, name] of [[session.id, 'guide-current'], ['other-session', 'guide-other']]) {
      closes.push(registerCatalogContribution({ root, sessionId: sessionId!, tools: [], skills: () => [],
        commands: [{ name: name!, group: 'workflow', kind: 'local', availability: 'available', enabled: true,
          summary: 'password=synthetic-sensitive-print', description: 'Guide', supportsNonInteractive: true, execute }] }));
    }
    const renderLine = vi.fn(), controller = new AbortController();
    await runNonInteractivePrompt({ prompt, printMode: true, sessionManager, runtimeContext,
      sessionRuntime: { commands: { run: (operation: (signal: AbortSignal) => Promise<unknown>) => operation(controller.signal) } },
      renderer: { renderLine }, logger: {}, approvalTrustPolicy: {}, } as never);
    const text = renderLine.mock.calls.flat().join('\n');
    expect(text).toContain('/guide-current'); expect(text).not.toContain('/guide-other');
    expect(text).not.toContain('synthetic-sensitive'); expect(execute).not.toHaveBeenCalled();
  } finally {
    closes.forEach(close => close()); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
    if (fs.readdirSync(scratchBase).length === 0) fs.rmdirSync(scratchBase);
  }
});

it.each([false, true])('preserves the original print source through actual composition and dispatch (skills=%s)', async composed => {
  fs.mkdirSync(scratchBase, { recursive: true });
  const root = fs.mkdtempSync(path.join(scratchBase, 'host-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
  let close: (() => void) | undefined;
  try {
    const sessionManager = new SessionManager(), session = sessionManager.createNew(root);
    const runtimeContext = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, targetPathBase: root,
      rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null }, session,
      runtimeConfig: getRuntimeConfig(root) });
    const skills = ['one', 'two'].map(name => ({ name, body: `Method ${name}`, description: name, source: 'extension' as const,
      filePath: path.join(root, name, 'SKILL.md'), disableModelInvocation: false, unhonouredFields: [] }));
    close = registerCatalogContribution({ root, sessionId: session.id, tools: [], commands: [], skills: () => skills });
    const executePrompt = vi.fn(async () => {}), controller = new AbortController();
    const renderer = new StreamingRenderer(); renderer.setSink({ line: () => {}, chunk: () => {} });
    const prompt = composed ? '  Compare /skill:one\nthen /skill:two /skill:one carefully  \n' : '  literal first line\nlast line  \n';
    await runNonInteractivePrompt({ prompt, printMode: true, sessionManager, runtimeContext,
      sessionRuntime: { executePrompt, getState: () => 'idle', commands: { run: (operation: (signal: AbortSignal) => Promise<unknown>) => operation(controller.signal) } },
      renderer, logger: { info: () => {}, error: () => {} }, approvalTrustPolicy: {}, } as never);
    expect(executePrompt).toHaveBeenCalledTimes(1);
    const [id, effective, options] = executePrompt.mock.calls[0] as unknown as [string, string, { promptMetadata?: Record<string, unknown> }];
    expect(id).toBe(session.id);
    if (composed) {
      expect(effective).toBe('<skill name="one">\nMethod one\n</skill>\n\n<skill name="two">\nMethod two\n</skill>\n\n  Compare \nthen   carefully  \n');
      expect(options.promptMetadata?.originalInput).toBe(prompt);
      const ranges = options.promptMetadata?.skillInvocations as Array<{ from: number; to: number; name: string }>;
      expect(ranges.map(range => prompt.slice(range.from, range.to))).toEqual(['/skill:one', '/skill:two', '/skill:one']);
      expect((options.promptMetadata?.skills as Array<{ name: string }>).map(skill => skill.name)).toEqual(['one', 'two']);
    } else expect(effective).toBe(prompt);
  } finally {
    close?.(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
    if (fs.readdirSync(scratchBase).length === 0) fs.rmdirSync(scratchBase);
  }
});
