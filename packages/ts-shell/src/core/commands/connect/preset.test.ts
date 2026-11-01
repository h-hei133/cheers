import { expect, it } from 'vitest';
import { BUILTIN_PROVIDERS } from '../../models/catalog.js';
import { CONNECT_PRESETS, resolveProviderTarget } from './preset.js';

/**
 * A preset's default model is written into a new connection, so it becomes the
 * next request's model. When the catalogue moves on and the preset does not,
 * the command still succeeds and the user starts from a model that is not in
 * their own `/model list`, with a capacity `/context` can only guess.
 *
 * A provider whose catalogue entry lists no models is reached through an
 * endpoint the user supplies, so its ids cannot be enumerated here; that is an
 * exemption, not a pass. A provider with no catalogue entry at all is a
 * different answer — the preset would name a model for a service this build
 * does not describe.
 */
it.each(CONNECT_PRESETS.flatMap(preset => preset.defaultModel === undefined ? []
  : [{ id: preset.id, provider: preset.provider, model: preset.defaultModel }]))(
  'preset $id names a model its provider publishes', ({ id, provider, model }) => {
  // Several entries can share one runtime — every OpenAI-compatible vendor
  // does — so the preset's own id picks the entry it describes, and the runtime
  // is the fallback for a preset that names one directly.
  const entry = BUILTIN_PROVIDERS.find(candidate => candidate.id === id)
    ?? BUILTIN_PROVIDERS.find(candidate => candidate.runtime === provider);
  expect(entry, `no catalogue entry for ${id} (runtime ${provider})`).toBeDefined();
  if (entry!.models.length === 0) return;
  expect(entry!.models.map(candidate => candidate.id)).toContain(model);
});

it('resolves the openai-compatible alias without inventing a model', () => {
  // The alias points at an endpoint the user supplies, so a model here would be
  // a guess written into their connection.
  expect(resolveProviderTarget('openai-compatible')).toMatchObject({ provider: 'openai-compatible' });
  expect(resolveProviderTarget('openai-compatible')?.defaultModel).toBeUndefined();
});
