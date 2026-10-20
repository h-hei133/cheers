import { expect, it, vi } from 'vitest';

vi.mock('../../entrypoints/cliRuntimeModule.js', () => ({
  runNonInteractivePrompt: vi.fn(),
  runNonTtyPromptStream: vi.fn(async () => undefined),
}));

import { runNonTtyPromptStream } from '../../entrypoints/cliRuntimeModule.js';
import { runCliPrintModeRouter } from './printModeRouter.js';

it('forwards first-frame and user-intent hooks to the non-TTY stream host', async () => {
  const onFirstFrame = vi.fn();
  const onUserIntent = vi.fn();
  const handled = await runCliPrintModeRouter({
    cliModePlan: { kind: 'stdin-stream' },
    options: { printMode: false },
    nonInteractivePrompts: [],
    pipedInput: null,
    bootstrapRuntime: {
      mcpGateway: {},
      sessionManager: {},
      runtimeContext: {},
      renderer: {},
      bootstrap: { lifecycleNotices: [] },
    },
    sessionRuntime: {},
    logger: {},
    writeError: vi.fn(),
    exit: vi.fn(),
    setActiveNonInteractiveApprovalMode: vi.fn(),
    approvalTrustPolicy: {},
    onFirstFrame,
    onUserIntent,
  } as never);

  expect(handled).toBe(true);
  expect(runNonTtyPromptStream).toHaveBeenCalledWith(expect.objectContaining({
    onFirstFrame,
    onUserIntent,
  }));
});
