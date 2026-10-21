import { expect, it, vi } from 'vitest';

const inputStream = vi.hoisted(() => ({
  runPromptInputStream: vi.fn(async () => undefined),
}));

vi.mock('../cli/runtime/inputStream.js', () => inputStream);

import { runNonTtyPromptStream, runNonInteractivePrompt } from './cliRuntimeModule.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionManager } from '../session/SessionManager.js';
import { createShellRuntimeContext } from '../core/shell/runtimeContext.js';
import { getRuntimeConfig } from '../config/runtimeConfig.js';
import { registerCatalogContribution } from '../core/catalog/contributions.js';

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
    setActiveNonInteractiveApprovalMode: () => {},
    onFirstFrame,
    onUserIntent,
  } as never);

  expect(inputStream.runPromptInputStream).toHaveBeenCalledWith(expect.objectContaining({
    onFirstFrame,
    onUserIntent,
  }));
});

it('renders print help for its exact session catalog without invoking contributed commands', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'print-help-'));
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
    await runNonInteractivePrompt({ prompt: '/help', printMode: true, sessionManager, runtimeContext,
      sessionRuntime: { commands: { run: (operation: (signal: AbortSignal) => Promise<unknown>) => operation(controller.signal) } },
      renderer: { renderLine }, logger: {}, approvalTrustPolicy: {}, setActiveNonInteractiveApprovalMode: () => {} } as never);
    const text = renderLine.mock.calls.flat().join('\n');
    expect(text).toContain('/guide-current'); expect(text).not.toContain('/guide-other');
    expect(text).not.toContain('synthetic-sensitive'); expect(execute).not.toHaveBeenCalled();
  } finally { closes.forEach(close => close()); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); }
});
