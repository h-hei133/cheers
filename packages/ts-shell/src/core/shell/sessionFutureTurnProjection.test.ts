import { expect, it } from 'vitest';
import { buildPromptWithFutureTurnInjections } from './sessionFutureTurnProjection.js';
import { createCompactLiveCheckpointStore } from '../../context/compact/checkpoint/compactLiveCheckpoint.js';
import { createCompactInjectionStateStore } from '../../context/compact/injection/compactInjectionState.js';
import { createProjectMemoryInjectionStateStore } from '../../memory/projectMemoryInjectionState.js';

it('keeps empty read-only preparation current and detects a newly pending generation', async () => {
  const compactCheckpointStore = createCompactLiveCheckpointStore();
  const compactInjectionStateStore = createCompactInjectionStateStore();
  const projectMemoryInjectionStateStore = createProjectMemoryInjectionStateStore();
  const deps = { compactCheckpointStore, compactInjectionStateStore, projectMemoryInjectionStateStore };
  const prepared = await buildPromptWithFutureTurnInjections({ deps, sessionId: 'preview', prompt: 'question' });
  expect(prepared.isCurrent()).toBe(true); expect(prepared.prompt).toBe('question');
  expect(compactInjectionStateStore.get('session:preview').injectionStatus).not.toBe('consumed');
  compactInjectionStateStore.markPending({ sessionScopeId: 'session:preview', checkpointId: 'new', sourceCommand: '/compact' });
  expect(prepared.isCurrent()).toBe(false);
});
