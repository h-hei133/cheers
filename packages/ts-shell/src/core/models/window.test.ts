import { describe, expect, it } from 'vitest'
import type { CatalogProvider } from './catalog.js'
import {
  DEFAULT_CONTEXT_WINDOW,
  configuredContextWindow,
  resolveContextWindow,
  resolveModelCost,
  resolveTokenBudget,
} from './window.js'
import type { RuntimeConfig } from '../../config/runtimeConfig.js'
import { projectModelSelection } from '../../session/model/projection.js'

it('binds the session window without replacing the ordinary budget and retires it on reset', () => {
  const config = { provider: 'openai', activeProviderConnectionId: 'named', contextWindow: 6000,
    providerConnections: [{ id: 'named', provider: 'openai', model: 'base' }], providerCredentials: {},
  } as RuntimeConfig;
  const selection = { connectionId: 'named', provider: 'openai', model: 'selected', contextWindow: 32000 } as const;
  const request = (provider = 'openai', model = 'selected', connectionId?: string) => ({ provider, model, credential: { connectionId } });
  const projected = projectModelSelection(config, selection);
  expect(projected.contextWindow).toBe(6000);
  expect(configuredContextWindow(projected, request())).toBe(32000);
  expect(configuredContextWindow(projected, request('openai', 'selected', 'named'))).toBe(32000);
  expect(configuredContextWindow(projected, request('openai', 'selected', 'sibling'))).toBe(6000);
  expect(configuredContextWindow(projected, request('openai', 'other', 'named'))).toBe(6000);
  expect(configuredContextWindow(projected, request('google'))).toBe(6000);
  expect(configuredContextWindow(projected, { provider: 'openai', model: 'selected' })).toBe(6000);
  expect(configuredContextWindow(projected, { ...request(), blocked: 'connection-pending' })).toBe(6000);
  const explicit = projectModelSelection(config, { ...selection, connectionScope: 'session' });
  expect(configuredContextWindow(explicit, request())).toBe(6000);
  const provider = projectModelSelection(config, { connectionScope: 'provider', provider: 'openai', model: 'selected', contextWindow: 32000 });
  expect(configuredContextWindow(provider, request())).toBe(32000);
  expect(configuredContextWindow(provider, request('openai', 'selected', 'named'))).toBe(6000);
  const reset = projectModelSelection(projected, { ...selection, contextWindow: undefined });
  expect(reset.sessionContextWindow).toBeUndefined();
  expect(configuredContextWindow(reset, request())).toBe(6000);
  expect(config).not.toHaveProperty('sessionContextWindow');
  expect(configuredContextWindow(undefined, request())).toBeUndefined();
});

it('does not borrow another provider rate when an unpriced model shares its id', () => {
  const rate = { promptPerMTok: 1, completionPerMTok: 2 };
  const models = [
    { id: 'unpriced', models: [{ id: 'shared' }] },
    { id: 'priced', models: [{ id: 'shared', cost: rate }] },
  ];
  expect(resolveModelCost(models, 'unpriced', 'shared')).toBeUndefined();
  expect(resolveModelCost(models, 'compatible', 'shared')).toBeUndefined();
  expect(resolveModelCost(models, 'priced', 'shared')).toEqual(rate);
  expect(resolveModelCost(models.slice(1), 'compatible', 'shared')).toEqual(rate);
});

const catalog: readonly CatalogProvider[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    runtime: 'anthropic',
    auth: 'api-key',
    envVar: 'ANTHROPIC_API_KEY',
    models: [
      { id: 'claude-opus-4-6', contextWindow: 200_000 },
      { id: 'claude-haiku-4-5', contextWindow: 200_000 },
    ],
  },
  {
    id: 'google',
    label: 'Google',
    runtime: 'google',
    auth: 'api-key',
    envVar: 'GEMINI_API_KEY',
    models: [{ id: 'gemini-3-pro', contextWindow: 1_048_576 }],
  },
  {
    id: 'custom',
    label: 'Custom',
    runtime: 'openai-compatible',
    auth: 'api-key',
    envVar: 'CUSTOM_API_KEY',
    models: [{ id: 'unknown-window' }],
  },
]

describe('context window resolution', () => {
  it('uses the catalog window for the active model instead of a global default', () => {
    // The defect this replaces: a 1M-window model was compacted at 64k.
    const resolved = resolveContextWindow({
      catalog,
      provider: 'google',
      model: 'gemini-3-pro',
    })

    expect(resolved.window).toBe(1_048_576)
    expect(resolved.source).toBe('catalog')
    expect(resolved.warning).toBeUndefined()
  })

  it('lets the user override the catalog', () => {
    const resolved = resolveContextWindow({
      catalog,
      provider: 'anthropic',
      model: 'claude-opus-4-6',
      configured: 100_000,
    })

    expect(resolved.window).toBe(100_000)
    expect(resolved.source).toBe('config')
  })

  it('warns rather than refuses when the configured window exceeds the catalog', () => {
    const resolved = resolveContextWindow({
      catalog,
      provider: 'anthropic',
      model: 'claude-opus-4-6',
      configured: 2_000_000,
    })

    // The user's number stands: a proxy may serve more than the catalog knows.
    expect(resolved.window).toBe(2_000_000)
    expect(resolved.source).toBe('config')
    expect(resolved.warning).toContain('exceeds')
    expect(resolved.warning).toContain('200000')
  })

  it('falls back with a warning when the model is not in the catalog', () => {
    const resolved = resolveContextWindow({
      catalog,
      provider: 'anthropic',
      model: 'a-model-from-tomorrow',
    })

    expect(resolved.window).toBe(DEFAULT_CONTEXT_WINDOW)
    expect(resolved.source).toBe('default')
    expect(resolved.warning).toContain('a-model-from-tomorrow')
  })

  it('falls back when the catalog knows the model but not its window', () => {
    const resolved = resolveContextWindow({
      catalog,
      provider: 'custom',
      model: 'unknown-window',
    })

    expect(resolved.window).toBe(DEFAULT_CONTEXT_WINDOW)
    expect(resolved.source).toBe('default')
  })

  it('distinguishes a catalog value from an assumed one', () => {
    // Same number, different facts: one is knowledge, the other is a guess.
    const known = resolveContextWindow({
      catalog: [
        {
          id: 'p',
          label: 'P',
          runtime: 'openai-compatible',
          auth: 'api-key',
          models: [{ id: 'm', contextWindow: DEFAULT_CONTEXT_WINDOW }],
        },
      ],
      provider: 'p',
      model: 'm',
    })
    const guessed = resolveContextWindow({ catalog, provider: 'p', model: 'm' })

    expect(known.window).toBe(guessed.window)
    expect(known.source).toBe('catalog')
    expect(guessed.source).toBe('default')
    expect(known.warning).toBeUndefined()
    expect(guessed.warning).toBeDefined()
  })

  it('finds the window when the runtime names a protocol and the catalog names a vendor', () => {
    // The two sides disagree: the runtime reports `openai-compatible`, the
    // catalog files the model under its vendor. Requiring both to match would
    // miss it and fall back to the default window.
    const vendorCatalog: readonly CatalogProvider[] = [
      {
        id: 'siliconflow',
        label: 'SiliconFlow',
        runtime: 'openai-compatible',
        auth: 'api-key',
        envVar: 'SILICONFLOW_API_KEY',
        models: [{ id: 'deepseek-ai/DeepSeek-V4-Flash', contextWindow: 128_000 }],
      },
    ]

    const resolved = resolveContextWindow({
      catalog: vendorCatalog,
      provider: 'openai-compatible',
      model: 'deepseek-ai/DeepSeek-V4-Flash',
    })

    expect(resolved.window).toBe(128_000)
    expect(resolved.source).toBe('catalog')
  })

  it('refuses to guess when a model id is claimed by more than one provider', () => {
    // The fallback exists because the runtime names a protocol and the catalog
    // names a vendor, so requiring both to match would miss models served over a
    // compatible endpoint. But that fallback must not pick one of several: the
    // answer is a context window, and taking the wrong provider's number silently
    // compacts at the wrong threshold.
    const ambiguous: readonly CatalogProvider[] = [
      {
        id: 'vendor-a',
        label: 'A',
        runtime: 'openai-compatible',
        auth: 'api-key',
        envVar: 'A_KEY',
        models: [{ id: 'shared-model', contextWindow: 100_000 }],
      },
      {
        id: 'vendor-b',
        label: 'B',
        runtime: 'openai-compatible',
        auth: 'api-key',
        envVar: 'B_KEY',
        models: [{ id: 'shared-model', contextWindow: 200_000 }],
      },
    ]

    const resolved = resolveContextWindow({
      catalog: ambiguous,
      provider: 'openai-compatible',
      model: 'shared-model',
    })

    // Neither number is used: the catalog cannot say which one applies, so the
    // conservative default applies and the ambiguity is named.
    expect(resolved.source).toBe('default')
    expect(resolved.warning).toContain('shared-model')
    expect(resolved.warning).toContain('vendor-a')
    expect(resolved.warning).toContain('vendor-b')
  })

  it('uses the vendor when the runtime names a protocol and only one declares the model', () => {
    // The case the fallback is for: unambiguous, so it resolves.
    const oneVendor: readonly CatalogProvider[] = [
      {
        id: 'siliconflow',
        label: 'SiliconFlow',
        runtime: 'openai-compatible',
        auth: 'api-key',
        envVar: 'SILICONFLOW_API_KEY',
        models: [{ id: 'vendor-only-model', contextWindow: 128_000 }],
      },
    ]

    const resolved = resolveContextWindow({
      catalog: oneVendor,
      provider: 'openai-compatible',
      model: 'vendor-only-model',
    })

    expect(resolved.window).toBe(128_000)
    expect(resolved.source).toBe('catalog')
  })

  it('still prefers the named provider when both it and another declare the model', () => {
    const twoProviders: readonly CatalogProvider[] = [
      {
        id: 'vendor-a',
        label: 'A',
        runtime: 'openai-compatible',
        auth: 'api-key',
        envVar: 'A_KEY',
        models: [{ id: 'shared-model', contextWindow: 100_000 }],
      },
      {
        id: 'vendor-b',
        label: 'B',
        runtime: 'openai-compatible',
        auth: 'api-key',
        envVar: 'B_KEY',
        models: [{ id: 'shared-model', contextWindow: 200_000 }],
      },
    ]

    const resolved = resolveContextWindow({
      catalog: twoProviders,
      provider: 'vendor-b',
      model: 'shared-model',
    })

    expect(resolved.window).toBe(200_000)
  })

  it('ignores a non-positive configured window', () => {
    const resolved = resolveContextWindow({
      catalog,
      provider: 'anthropic',
      model: 'claude-opus-4-6',
      configured: 0,
    })

    expect(resolved.window).toBe(200_000)
    expect(resolved.source).toBe('catalog')
  })
})

describe('per-model token budgets', () => {
  const budgets = {
    'anthropic/claude-opus-4-6': { reserveTokens: 40_000, keepRecentTokens: 50_000 },
  }

  it('prefers the per-model override over the ordinary value', () => {
    expect(
      resolveTokenBudget(budgets, 'anthropic', 'claude-opus-4-6', 'reserveTokens', 8_000, 8_000),
    ).toBe(40_000)
  })

  it('falls back to the ordinary value for a model with no override', () => {
    expect(
      resolveTokenBudget(budgets, 'anthropic', 'claude-haiku-4-5', 'reserveTokens', 12_000, 8_000),
    ).toBe(12_000)
  })

  it('falls back to the caller default when nothing else is set', () => {
    expect(
      resolveTokenBudget(undefined, 'anthropic', 'claude-opus-4-6', 'keepRecentTokens', undefined, 20_000),
    ).toBe(20_000)
  })

  it('keys by provider and model together, so two providers do not share a budget', () => {
    // The same model id served by a different provider must not inherit the
    // budget that was tuned for the first one.
    expect(
      resolveTokenBudget(budgets, 'a-proxy', 'claude-opus-4-6', 'reserveTokens', undefined, 8_000),
    ).toBe(8_000)
  })

  it('refuses an invalid budget rather than ignoring it', () => {
    expect(() =>
      resolveTokenBudget({ 'p/m': { reserveTokens: -1 } }, 'p', 'm', 'reserveTokens', undefined, 8_000),
    ).toThrow(/reserveTokens/)
  })

  it('names the offending key in the error', () => {
    expect(() =>
      resolveTokenBudget({ 'p/m': { keepRecentTokens: 1.5 } }, 'p', 'm', 'keepRecentTokens', undefined, 20_000),
    ).toThrow(/modelOverrides\["p\/m"\]\.keepRecentTokens/)
  })

  it('keeps a zero budget, which is a real setting rather than an absent one', () => {
    expect(resolveTokenBudget({ 'p/m': { reserveTokens: 0 } }, 'p', 'm', 'reserveTokens', 8_000, 8_000)).toBe(0)
  })
})
