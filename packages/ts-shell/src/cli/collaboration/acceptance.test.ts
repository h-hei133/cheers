import { afterEach, expect, it, vi } from 'vitest';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { CollaborationComposition } from './model.js';
import { collaborationHosts } from './state.js';
import { invalidateCollaborationAdmission, settleCollaborationPrompt } from './acceptance.js';

afterEach(() => vi.restoreAllMocks());

it('fences settlement by provenance and controller, and a delayed reply cannot abort or erase a replacement run', async () => {
  const context = {} as ShellRuntimeContext; const prior = new AbortController(); const replacement = new AbortController();
  let release!: () => void; const reply = new Promise<void>(resolve => { release = resolve; });
  const request = vi.fn(async () => { await reply; });
  const active = { acceptance: { acceptanceId: 'prior' }, controller: prior, expiresAt: Date.now() + 5000 };
  const host = { active, host: { request }, accepted: new Map() } as unknown as CollaborationComposition;
  collaborationHosts.set(context, host);
  try {
    await settleCollaborationPrompt(context, { collaboration: { acceptanceId: 'other' } }, prior.signal, 'completed');
    await settleCollaborationPrompt(context, { collaboration: { acceptanceId: 'prior' } }, replacement.signal, 'completed');
    expect(request).not.toHaveBeenCalled(); expect(host.active).toBe(active);
    const settlement = settleCollaborationPrompt(context, { collaboration: { acceptanceId: 'prior' } }, prior.signal, 'completed');
    expect(host.active).toBeUndefined(); expect(request).toHaveBeenCalledOnce();
    invalidateCollaborationAdmission(host); expect(replacement.signal.aborted).toBe(false);
    const next = { ...active, controller: replacement, acceptance: { acceptanceId: 'replacement' } };
    host.active = next as unknown as CollaborationComposition['active']; release(); await settlement;
    expect(host.active).toBe(next); expect(replacement.signal.aborted).toBe(false);
  } finally { collaborationHosts.delete(context); release(); }
});
