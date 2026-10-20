import { expect, it, vi } from 'vitest';

const inputStream = vi.hoisted(() => ({
  runPromptInputStream: vi.fn(async () => undefined),
}));

vi.mock('../cli/runtime/inputStream.js', () => inputStream);

import { runNonTtyPromptStream } from './cliRuntimeModule.js';

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
