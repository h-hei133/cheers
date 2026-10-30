import { expect, it } from 'vitest';
import { createEmptyLifecycleIndex } from '../../core/tools/toolResultLifecycle.js';
import type { RecoverySnapshot } from './types.js';
import { hasUnfinishedSessionWork } from './work.js';

it.each([
  { pendingPrompt: 'pending' },
  { runPhase: 'prompt-persisted' },
  { runPhase: 'turn-active' },
  { interruptedKind: 'turn' },
  { durableStatus: 'stopped' },
  { terminalClassification: 'stopped', terminalReason: 'stopped_not_proven' },
  { taskState: { unverifiedFiles: ['unknown.txt'] } },
  { pendingLifecycle: { ...createEmptyLifecycleIndex(), pendingTools: { call: { taskId: 'call', toolName: 'write' } } } },
  { pendingLifecycle: { ...createEmptyLifecycleIndex(), pendingApprovals: { call: { taskId: 'call', toolName: 'edit' } } } },
])('retains recovery evidence %#', evidence => {
  expect(hasUnfinishedSessionWork({ pendingLifecycle: createEmptyLifecycleIndex(), ...evidence } as RecoverySnapshot)).toBe(true);
});

it.each([{}, { runPhase: 'idle' }, { durableStatus: 'success', terminalClassification: 'success', terminalReason: 'completed' }])(
  'does not turn ordinary idle or completed evidence into automatic recovery %#', evidence => {
    expect(hasUnfinishedSessionWork({ pendingLifecycle: createEmptyLifecycleIndex(), ...evidence } as RecoverySnapshot)).toBe(false);
  });

it('keeps continuation evidence for a prompt that was only a picture', () => {
  // The run phase alone would keep this alive, which is a coincidence: the
  // evidence rule itself must admit an empty-text prompt with an image.
  const picture = { type: 'image' as const, data: 'QUJD', mimeType: 'image/png' };
  const snapshot = { pendingLifecycle: createEmptyLifecycleIndex(), pendingPrompt: '',
    runPhase: 'idle', lastUserMessage: { role: 'user' as const, content: [picture] } } as RecoverySnapshot;
  expect(hasUnfinishedSessionWork(snapshot)).toBe(true);
  // Empty text with no picture is still nothing to continue.
  expect(hasUnfinishedSessionWork({ ...snapshot,
    lastUserMessage: { role: 'user' as const, content: [{ type: 'text' as const, text: '' }] } } as RecoverySnapshot)).toBe(false);
});
