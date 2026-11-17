import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolExecutionContext } from '../../../tools/types.js'
import { registerCatalogContribution } from '../../catalog/contributions.js'
import { sessionModelCatalog } from '../../catalog/models.js'
import type { CatalogModel, CatalogProvider } from '../../models/catalog.js'
import { loadCatalog, writeCatalogCache } from '../../models/catalogStore.js'
import { createCodemodeToolDefinition } from './tool.js'

type ContextWithCatalog = ToolExecutionContext & {
  readonly modelCatalog?: ReturnType<typeof sessionModelCatalog>
}

let temporary: string
let workspace: string
const cleanups: Array<() => void> = []
beforeEach(() => {
  const parent = path.join(os.tmpdir(), 'cheers-test')
  fs.mkdirSync(parent, { recursive: true })
  temporary = fs.mkdtempSync(path.join(parent, 'codemode-models-'))
  workspace = path.join(temporary, 'workspace')
  const home = path.join(temporary, 'home')
  fs.mkdirSync(workspace); fs.mkdirSync(home)
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home)
  vi.stubEnv('CHEERS_TEST_ROOT', temporary); vi.stubEnv('GIT_CEILING_DIRECTORIES', temporary)
})
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.restoreAllMocks(); vi.unstubAllEnvs()
  fs.rmSync(temporary, { recursive: true, force: true })
})

function catalogueFixture() {
  const route = vi.fn(() => ({ provider: 'fixture', modelId: 'captured-chat' }))
  const published: CatalogModel = { id: 'captured-chat', modelType: 'chat', contextWindow: 128_000,
    maxTokens: 8_192, reasoning: true, toolCalling: true, vision: true, input: ['text', 'image'], output: ['text'],
    cost: { promptPerMTok: 1.25, completionPerMTok: 5, cacheReadPerMTok: 0.125 },
    inputLimits: { maxRequestBytes: 8_000_000, images: { maxPerMessage: 4,
      resize: { maxWidth: 1_024, maxHeight: 768, maxBytes: 4_000_000 } } },
    thinkingLevelMap: { low: 'low', high: 'high' }, serviceTiers: ['default', 'priority'] }
  // Synthetic non-contract fields detect unsafe spreads; these are never usable credentials.
  const privateModel: CatalogModel & { apiKey: string; privateMarker: string; route: typeof route } = {
    ...published, apiKey: 'fixture-model-private-value', privateMarker: 'fixture-model-private-marker', route,
  }
  const provider: CatalogProvider & { apiKey: string; authorization: string } = {
    id: 'fixture', label: 'Captured fixture', runtime: 'openai', auth: 'api-key',
    baseUrl: 'https://fixture.invalid/v1', envVar: 'FIXTURE_PROVIDER_PRIVATE_ENV',
    apiKey: 'fixture-provider-private-value', authorization: 'fixture-provider-private-authorization',
    models: [privateModel, { id: 'unknown-capabilities', modelType: 'chat' },
      { id: 'no-reasoning', modelType: 'chat', reasoning: false },
      { id: 'captured-image', modelType: 'image', input: ['text'], output: ['image'], maxTokens: 512 }],
  }
  const physical: readonly CatalogProvider[] = [provider]
  cleanups.push(registerCatalogContribution({ root: workspace, sessionId: 'catalog-owner',
    commands: [], tools: [], skills: () => [], virtualModels: [{ provider: 'adaptive', id: 'auto',
      name: 'Automatic fixture', contextWindow: 64_000, maxTokens: 4_096, thinkingLevels: ['low', 'high'], route }],
  }, physical))
  return { modelCatalog: sessionModelCatalog(workspace, 'catalog-owner', physical), published, route }
}

function ambientCatalogue(id: string) {
  const target = writeCatalogCache([{ id: 'fixture', label: 'Ambient fixture', runtime: 'openai',
    auth: 'none', models: [{ id, contextWindow: 777, reasoning: false }] }])
  expect(path.relative(temporary, target).startsWith('..')).toBe(false)
  expect(loadCatalog().find(provider => provider.id === 'fixture')?.models.some(model => model.id === id)).toBe(true)
}

async function run<T>(code: string, modelCatalog: ReturnType<typeof sessionModelCatalog>): Promise<T> {
  const context: ContextWithCatalog = { workspaceRoot: workspace, taskId: 'script-model-owner', modelCatalog }
  const result = await createCodemodeToolDefinition(() => new Map()).execute({ code }, context)
  expect(result.success).toBe(true)
  return JSON.parse(result.output!.replace(/^Script completed\s*/, '')) as T
}

describe('native model metadata inside the actual script worker', () => {
  it('uses the captured physical and virtual catalogue despite ambient replacements', async () => {
    const { modelCatalog, published, route } = catalogueFixture()
    const code = `return { all: models.list(), physical: models.list('fixture'),
      virtual: models.list('adaptive'), missing: models.get('fixture', 'absent'),
      ambient: models.get('fixture', 'ambient-first'), selected: models.get('fixture', 'captured-chat'),
      unknown: models.get('fixture', 'unknown-capabilities'), disabled: models.get('fixture', 'no-reasoning') };`
    ambientCatalogue('ambient-first')
    const first = await run<Record<string, unknown>>(code, modelCatalog)
    ambientCatalogue('ambient-second')
    const second = await run<Record<string, unknown>>(code, modelCatalog)
    expect(second).toEqual(first)
    const all = first.all as Array<Record<string, unknown>>
    expect(all).toHaveLength(5)
    expect(all.map(model => [model.provider, model.id])).toEqual([
      ['fixture', 'captured-chat'], ['fixture', 'unknown-capabilities'], ['fixture', 'no-reasoning'],
      ['fixture', 'captured-image'], ['adaptive', 'auto'],
    ])
    expect(first.physical).toHaveLength(4)
    expect(first.virtual).toEqual([expect.objectContaining({ provider: 'adaptive', id: 'auto',
      name: 'Automatic fixture', contextWindow: 64_000, maxTokens: 4_096, thinkingLevels: ['low', 'high'] })])
    expect(first.selected).toMatchObject({ provider: 'fixture', ...published })
    expect(first.missing).toBeNull()
    expect(first.ambient).toBeNull()
    expect((first.unknown as Record<string, unknown>).reasoning ?? null).toBeNull()
    expect(first.disabled).toMatchObject({ reasoning: false })
    expect(route).not.toHaveBeenCalled()
  })

  it('does not reload ambient models for an explicitly empty native catalogue', async () => {
    ambientCatalogue('ambient-only')
    const modelCatalog = sessionModelCatalog(workspace, 'empty-owner', [])
    const result = await run<Record<string, unknown>>(`return { all: models.list(), filtered: models.list('fixture'),
      missing: models.get('fixture', 'ambient-only') };`, modelCatalog)
    expect(result).toEqual({ all: [], filtered: [], missing: null })
  })

  it('keeps model records and all nested metadata immutable across list/get mutation attempts', async () => {
    const { modelCatalog, route } = catalogueFixture()
    const result = await run<Record<string, unknown>>(`
      const before = JSON.stringify(models.list());
      const selected = models.get('fixture', 'captured-chat');
      const logical = models.get('adaptive', 'auto');
      const filtered = models.list('fixture');
      const actions = [
        () => Reflect.set(selected, 'id', 'forged'),
        () => Reflect.set(selected.cost, 'promptPerMTok', 999),
        () => selected.input.push('forged'),
        () => selected.output.push('image'),
        () => Reflect.set(selected.inputLimits.images.resize, 'maxWidth', 999),
        () => Reflect.set(selected.thinkingLevelMap, 'high', 'forged'),
        () => selected.serviceTiers.push('forged'),
        () => Reflect.set(logical, 'name', 'Forged automatic'),
        () => logical.thinkingLevels.push('medium'),
        () => Object.defineProperty(selected, 'id', { value: 'forged' }),
        () => models.list().push({ provider: 'fixture', id: 'forged' }),
        () => filtered.push({ provider: 'fixture', id: 'forged' }),
      ];
      for (const action of actions) { try { action(); } catch {} }
      return { unchanged: before === JSON.stringify(models.list()), forged: models.get('fixture', 'forged'),
        selected: models.get('fixture', 'captured-chat'), logical: models.get('adaptive', 'auto'),
        frozen: [models, models.list(), selected, selected.input, selected.output, selected.cost,
          selected.inputLimits, selected.inputLimits.images, selected.inputLimits.images.resize,
          selected.thinkingLevelMap, selected.serviceTiers, logical, logical.thinkingLevels].map(Object.isFrozen) };
    `, modelCatalog)
    expect(result.unchanged).toBe(true)
    expect(result.forged).toBeNull()
    expect(result.frozen).toEqual(Array.from({ length: 13 }, () => true))
    expect(result.selected).toMatchObject({ id: 'captured-chat', cost: { promptPerMTok: 1.25 },
      input: ['text', 'image'], output: ['text'], inputLimits: { images: { resize: { maxWidth: 1_024 } } },
      thinkingLevelMap: { high: 'high' }, serviceTiers: ['default', 'priority'] })
    expect(result.logical).toMatchObject({ name: 'Automatic fixture', thinkingLevels: ['low', 'high'] })
    expect(modelCatalog.physical[0]?.models[0]?.cost?.promptPerMTok).toBe(1.25)
    expect(route).not.toHaveBeenCalled()
  })

  it('publishes only inert public metadata without provider secrets or route capabilities', async () => {
    const { modelCatalog, route } = catalogueFixture()
    const result = await run<{ encoded: string; executable: boolean; secretFields: string[]; route: string }>(`
      const metadata = models.list();
      function containsFunction(value) {
        if (typeof value === 'function') return true;
        if (!value || typeof value !== 'object') return false;
        return Object.values(value).some(containsFunction);
      }
      return { encoded: JSON.stringify(metadata), executable: containsFunction(metadata),
        secretFields: metadata.flatMap(model => Object.keys(model).filter(key =>
          /apiKey|authorization|privateMarker|envVar|baseUrl|auth|runtime|route/i.test(key))),
        route: typeof models.get('adaptive', 'auto').route };
    `, modelCatalog)
    expect(result.executable).toBe(false)
    expect(result.secretFields).toEqual([])
    expect(result.route).toBe('undefined')
    for (const value of ['fixture-model-private-value', 'fixture-model-private-marker',
      'fixture-provider-private-value', 'fixture-provider-private-authorization', 'FIXTURE_PROVIDER_PRIVATE_ENV']) {
      expect(result.encoded).not.toContain(value)
    }
    expect(route).not.toHaveBeenCalled()
  })
})
