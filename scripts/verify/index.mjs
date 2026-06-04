#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createCaseRegistry, createVerifierCaseDefinitions } from './cases.mjs'
import { createVerifierPaths } from './env.mjs'
import { createCommandRunner } from './run.mjs'
import { runVerifierEntrypoint } from './orchestration.mjs'
import { createReportWriter } from './report.mjs'
import {
  candidateMutationSuiteId,
  parseVerifierOptions,
  verifierSuiteValues,
  verifierTierValues,
} from './verifierCliModule.mjs'
import {
  buildTierPlanReport,
  createVerifierCasePlan,
  printCasePlan,
} from './verifierCaseModule.mjs'
import { validateVerifierSelectionSafety, projectDryRunSafetyFacts } from './verifierSafetyModule.mjs'
import { createVerifierReportModule } from './verifierReportModule.mjs'
import {
  cleanupIsolatedAuditLogPath,
  createIsolatedAuditLogPath,
  inspectAuditIsolation,
} from './residue.mjs'
import {
  failureCategories,
  providerReadinessStatusForCode,
  summarizeFailureStatus as summarizeResultFailureStatus,
} from './result.mjs'
import {
  cleanupReadonlyFixture,
  compareReadonlySnapshots,
  createReadonlyCodingFixture,
  snapshotReadonlyFixture,
} from '../real-provider-readonly-fixture.mjs'
import {
  cleanupApplyPatchDryRunFixture,
  compareApplyPatchDryRunSnapshots,
  createApplyPatchDryRunFixture,
  snapshotApplyPatchDryRunFixture,
} from '../real-provider-apply-patch-dry-run-fixture.mjs'
import {
  cleanupSingleFileUpdateFixture,
  compareSingleFileUpdateSnapshots,
  createSingleFileUpdateFixture,
  readSingleFileUpdateTarget,
  snapshotSingleFileUpdateFixture,
} from '../real-provider-single-file-update-fixture.mjs'
import {
  cleanupSingleFileCreateFixture,
  compareSingleFileCreateSnapshots,
  createSingleFileCreateFixture,
  readSingleFileCreateTarget,
  snapshotSingleFileCreateFixture,
} from '../real-provider-single-file-create-fixture.mjs'
import {
  cleanupTwoFileUpdateFixture,
  compareTwoFileUpdateSnapshots,
  createTwoFileUpdateFixture,
  readTwoFileUpdateTargets,
  snapshotTwoFileUpdateFixture,
} from '../real-provider-two-file-update-fixture.mjs'
import {
  assertOnlyExpectedCodingFixtureChanges,
  buildCodingFlowDryRunContract,
  cleanupCodingFlowFixture,
  compareCodingFlowSnapshots,
  createCodingFlowFixture,
  readCodingFlowNoteStatus,
  snapshotCodingFlowFixture,
} from '../real-provider-coding-fixture.mjs'
import {
  redactAndAssertReadonlyProviderOutput,
} from '../real-provider-readonly-redaction.mjs'
import {
  redactAndAssertCodingProviderOutput,
} from '../real-provider-coding-redaction.mjs'
import {
  ensureDirIfNeeded,
  getRealCodingFlowRuntimeHome,
  getRealCodingFlowAuditLogPath,
  getRealProviderHome,
  getSyntheticHome,
  getTestRoot,
} from '../support/testPaths.mjs'
import {
  candidateMutationFailureTaxonomyFixtures,
  route01FailureClassForRealCandidate,
  route02FailureClassForCandidate,
  statusDetailForRealSingleFileCreateFailureCategory,
  statusDetailForRealSingleFileUpdateFailureCategory,
  statusDetailForRealTwoFileUpdateFailureCategory,
  withRoute01FailureClass,
  withRoute02FailureClass,
} from '../real-user-capabilities/candidateMutationClassification.mjs'
import {
  classifySingleFileCreatePatchShape,
  classifySingleFileUpdatePatchShape,
  classifyTwoFileUpdatePatchShape,
} from '../real-user-capabilities/candidateMutationPatchShape.mjs'
import {
  approvedRealProviderHome,
  buildEffectiveProviderEnv,
  canonicalProviderEnv,
} from '../real-provider-smokes/approvedProviderEnv.mjs'

const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
const testRoot = getTestRoot()
const {
  repoRoot,
  tsShellRoot,
  tsxCliPath,
  cliEntryPath,
  npmBin,
  reportPath,
} = createVerifierPaths({
  entrypointUrl: fileURLToPath(import.meta.url),
  testRoot,
  runId,
})
const run = createCommandRunner({ defaultCwd: repoRoot })

const tierValues = verifierTierValues
const suiteValues = verifierSuiteValues
const defaultProviderEnvPath = '/home/wang/.private-agents-real/provider.env'
const applyPatchProviderResultMarker = '__APPLY_PATCH_DRY_RUN_PROVIDER_RESULT__'
const applyPatchProviderDiagnosticsMarker = '__APPLY_PATCH_DRY_RUN_PROVIDER_DIAGNOSTICS__'
const realSingleFileUpdateCaseId = 'real-selected-workspace-single-file-update'
const realSingleFileCreateCaseId = 'real-selected-workspace-single-file-create'
const realTwoFileUpdateCaseId = 'real-selected-workspace-two-file-update'
const verifierOptions = parseVerifierOptions(process.argv)
const {
  selectedTier,
  selectedCaseId,
  selectedSuiteId,
  includeCandidates,
  includeRealProviderSuiteCases,
  includeContinueSmoke,
  listCases,
  dryRun,
  showHelp,
  turnBoundaryDryRun,
  terminalResultSurfaceDryRun,
  toolExecutionPlanningDryRun,
  failureFollowupContextDryRun,
  realReadonlyCodingDryRun,
  realReadonlyCodingPreflight,
  realReadonlyCodingPreflightSelfTest,
  realReadonlyCodingFailureAttributionSelfTest,
  realReadonlyCodingSmoke,
  realCodingFlowDryRun,
  realCodingFlowSmoke,
  realCodingFlowFailureAttributionSelfTest,
  realCodingFlowFollowupContextSelfTest,
  realCodingFlowFollowupSmokeDryRun,
  realCodingFlowFollowupSmoke,
  realCodingFlowDiagnosticsSelfTest,
  realCodingFlowAuditIsolationSelfTest,
  realApplyPatchDryRunSmokeDryRun,
  realApplyPatchDryRunSmoke,
  realApplyPatchPermissionUxSmoke,
  realApplyPatchWriteFixtureSmoke,
  realApplyPatchRuntimeNoWriteSmoke,
  realApplyPatchGuardedWriteSmoke,
  realApplyPatchGuardedRouteSmoke,
  realApplyPatchWorkspaceWriteSmoke,
  candidateMutationFailureTaxonomySelfTest,
  route03TwoFileCliPathEvidence,
  route08UnsupportedPatchE2e,
} = verifierOptions
const realMutationEnvContract = prepareRealMutationEnvContract()
let lastApplyPatchProviderDiagnostics = undefined
const syntheticHome = getSyntheticHome()
const realHome = realMutationEnvContract.realHome ?? getRealProviderHome({ allowDefault: true })
const writeReport = createReportWriter(reportPath)

const providerNetworkFailurePattern =
  /(provider-readiness:network|provider-network-inconclusive|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|network|socket hang up|TLS|timeout|unreachable|kind[:= ]+network)/i
const providerConfigFailurePattern =
  /(provider-readiness:(missing-key|missing-config|unsupported-provider)|missing.*config|failed to parse.*config|config\.json|missing.*key|api key|apikey|not connected|connect first|missing.*credentials|credentials.*missing|credential.*incomplete|missing baseUrl|baseUrl is missing|model is missing)/i
const providerAuthFailurePattern =
  /(provider-readiness:auth|authentication was rejected|invalid authentication|invalid api key|unauthorized|forbidden|401|403|kind[:= ]+authentication)/i
const providerModelFailurePattern =
  /(provider-readiness:model|model.*(?:not found|not available|unsupported|does not exist|is invalid)|unsupported model|invalid model|quota|rate limit|429|insufficient quota|context length|maximum context)/i
const realHomeConfigPattern =
  /[A-Za-z]:[\\/]+Test[\\/]+home-sf[\\/]+\.private-agents[\\/]+config\.json/gi
const bearerTokenPattern = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi
const authorizationBearerPattern =
  /\b(authorization\s*[:=]\s*)(["']?)Bearer\s+[A-Za-z0-9._~+/=-]+/gi
const keyValueSecretPattern =
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|x-api-key)(\s*[:=]\s*)(["']?)[^\s"'`,;]+/gi
const openAiStyleKeyPattern = /\b(sk-[A-Za-z0-9][A-Za-z0-9._-]{8,})\b/g
const maskedOpenAiStyleKeyPattern = /\bsk-[A-Za-z0-9][A-Za-z0-9*._-]{8,}\b/g
const secretQueryParamPattern =
  /([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|token|key|signature|sig)=)[^&\s"'`<>]+/gi
const posixPrivateAgentsConfigPattern =
  /\/[^\s"'`<>]+\/\.private-agents\/config\.json/gi
const posixPrivateAgentsRealHomePattern =
  /\/[^\s"'`<>]*\.private-agents-real(?:\/[^\s"'`<>]*)?/gi

function prepareRealMutationEnvContract() {
  if (!shouldPrepareRealMutationEnv()) {
    return {
      enabled: false,
      realHome: undefined,
      configSource: 'not-loaded',
      providerDiagnostics: undefined,
      error: undefined,
      generatedRealHome: false,
    }
  }

  const explicitRealHome = process.env.PRIVATE_AGENTS_REAL_HOME?.trim()
  const loaded = loadApprovedProviderEnv(process.env)
  if (!loaded.ok) {
    return {
      enabled: true,
      realHome: explicitRealHome || undefined,
      configSource: 'explicit-env',
      providerDiagnostics: undefined,
      error: loaded,
      generatedRealHome: false,
    }
  }

  for (const [key, value] of Object.entries(loaded.env)) {
    if (key === 'PRIVATE_AGENTS_REAL_HOME') continue
    if (process.env[key] === undefined && typeof value === 'string') {
      process.env[key] = value
    }
  }

  if (!process.env.PRIVATE_AGENTS_TEST_ROOT?.trim()) {
    process.env.PRIVATE_AGENTS_TEST_ROOT = path.join(getTestRoot(), 'candidate-mutation-real')
  }

  const resolved = resolveProviderEnvConfig(process.env, {
    providerEnvLoaded: loaded.configSource === 'explicit-env+provider-env',
    providerEnv: loaded.env,
  })
  if (!resolved.ok) {
    return {
      enabled: true,
      realHome: explicitRealHome || undefined,
      configSource: loaded.configSource,
      providerDiagnostics: undefined,
      error: resolved,
      generatedRealHome: false,
    }
  }

  const generatedRealHome = writeEnvBackedRealProviderConfig(resolved)
  process.env.PRIVATE_AGENTS_REAL_HOME = generatedRealHome
  process.env[resolved.apiKeyEnvVar] = resolved.apiKey
  process.env.PRIVATE_AGENTS_REAL_PROVIDER = resolved.provider
  const configSource = `${loaded.configSource}${resolved.configSourceSuffix ?? ''}`
  return {
    enabled: true,
    realHome: generatedRealHome,
    configSource,
    providerDiagnostics: buildProviderDiagnostics({
      provider: resolved.provider,
      baseUrl: resolved.baseUrl,
      model: resolved.model,
      configSource,
      credentialSource: 'env',
    }),
    error: undefined,
    generatedRealHome: true,
  }
}

function cleanupRealMutationEnvContract() {
  if (realMutationEnvContract.generatedRealHome && realMutationEnvContract.realHome) {
    fs.rmSync(realMutationEnvContract.realHome, { recursive: true, force: true })
  }
}

function shouldPrepareRealMutationEnv() {
  if (listCases || dryRun) return false
  if (selectedCaseId) {
    return selectedCaseId === realSingleFileUpdateCaseId ||
      selectedCaseId === realSingleFileCreateCaseId ||
      selectedCaseId === realTwoFileUpdateCaseId
  }
  return selectedSuiteId === candidateMutationSuiteId && includeRealProviderSuiteCases
}

function loadApprovedProviderEnv(processEnv) {
  const providerEnvPath =
    processEnv.PRIVATE_AGENTS_PROVIDER_ENV?.trim() ||
    processEnv.PRIVATE_AGENTS_REAL_PROVIDER_ENV?.trim() ||
    defaultProviderEnvPath
  const explicitProviderEnvPath = Boolean(
    processEnv.PRIVATE_AGENTS_PROVIDER_ENV?.trim() ||
      processEnv.PRIVATE_AGENTS_REAL_PROVIDER_ENV?.trim(),
  )
  const resolved = path.resolve(providerEnvPath)
  if (resolved !== defaultProviderEnvPath) {
    return {
      ok: false,
      status: 'config-failure',
      reason: 'provider env path must be /home/wang/.private-agents-real/provider.env',
    }
  }
  if (!fs.existsSync(resolved)) {
    if (!explicitProviderEnvPath) {
      return { ok: true, env: {}, configSource: 'explicit-env' }
    }
    return {
      ok: false,
      status: 'config-failure',
      reason: 'provider.env is not present at the approved path',
    }
  }

  const parsed = {}
  const content = fs.readFileSync(resolved, 'utf8')
  for (const variant of providerEnvTextVariants(content)) {
    mergeProviderEnvConfigObject(parsed, parseProviderEnvJsonObject(variant))
    mergeProviderEnvLooseConfig(parsed, variant)
  }
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^(?:(?:export|declare\s+-x)\s+)?["']?([A-Za-z_][A-Za-z0-9_.-]*)["']?\s*[:=]\s*(.*)$/)
    if (!match) continue
    const key = match[1]
    let value = match[2]?.trim().replace(/,$/, '').trim() ?? ''
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    } else {
      const commentIndex = value.search(/\s+#/)
      if (commentIndex >= 0) value = value.slice(0, commentIndex).trim()
    }
    parsed[key] = value
    for (const variant of providerEnvTextVariants(value)) {
      mergeProviderEnvConfigObject(parsed, parseProviderEnvJsonObject(variant))
      mergeProviderEnvLooseConfig(parsed, variant)
    }
  }
  return { ok: true, env: parsed, configSource: 'explicit-env+provider-env' }
}

function providerEnvTextVariants(content) {
  const text = String(content ?? '')
  const variants = [text]
  const unescapedJson = text
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
  if (unescapedJson !== text) variants.push(unescapedJson)
  return variants
}

function parseProviderEnvJsonObject(content) {
  const trimmed = content.trim()
  if (!trimmed.startsWith('{')) return undefined
  try {
    const parsed = JSON.parse(trimmed)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function mergeProviderEnvConfigObject(target, config) {
  if (!config) return
  const provider = typeof config.provider === 'string' ? config.provider : undefined
  if (provider && target.provider === undefined) target.provider = provider
  mergeDirectProviderCredentialMap(target, config)
  if (provider) {
    const normalizedProvider = normalizeRealProvider(provider)
    if (normalizedProvider) {
      for (const field of ['apiKey', 'baseUrl', 'model']) {
        const fieldValue = config[field]
        if (typeof fieldValue === 'string' && fieldValue.trim()) {
          target[`providerCredentials.${normalizedProvider}.${field}`] ??= fieldValue
        }
      }
    }
  }
  const credentials = config.providerCredentials
  if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) return
  mergeDirectProviderCredentialMap(target, credentials)
  for (const [providerId, value] of Object.entries(credentials)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const normalizedProviderId = normalizeRealProvider(providerId)
    if (!normalizedProviderId) continue
    for (const field of ['apiKey', 'baseUrl', 'model']) {
      const fieldValue = value[field]
      if (typeof fieldValue === 'string' && fieldValue.trim()) {
        target[`providerCredentials.${normalizedProviderId}.${field}`] = fieldValue
      }
    }
  }
}

function mergeDirectProviderCredentialMap(target, config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return
  for (const [providerId, value] of Object.entries(config)) {
    const normalizedProviderId = normalizeRealProvider(providerId)
    if (!normalizedProviderId || !value || typeof value !== 'object' || Array.isArray(value)) continue
    for (const field of ['apiKey', 'baseUrl', 'model']) {
      const fieldValue = value[field]
      if (typeof fieldValue === 'string' && fieldValue.trim()) {
        target[`providerCredentials.${normalizedProviderId}.${field}`] ??= fieldValue
      }
    }
    if (
      target.provider === undefined &&
      ['openai-compatible', 'google', 'antigravity', 'claudecode', 'openai'].includes(normalizedProviderId)
    ) {
      target.provider = normalizedProviderId
    }
  }
}

function mergeProviderEnvLooseConfig(target, content) {
  const text = String(content ?? '')
  const providerMatch = text.match(/(?:^|\n)\s*["']?(?:provider|providerId|provider_id|selectedProvider|selected_provider)["']?\s*[:=]\s*["']?([^"',\n#}]+)["']?/i)
  const provider = normalizeRealProvider(providerMatch?.[1])
  if (provider && target.provider === undefined) {
    target.provider = provider
  }
  if (
    target.provider === undefined &&
    providerKeyAliases('openai-compatible').some((alias) => text.includes(alias))
  ) {
    target.provider = 'openai-compatible'
  }
  for (const providerId of ['openai-compatible', 'google', 'antigravity', 'claudecode', 'openai']) {
    if (!providerKeyAliases(providerId).some((alias) => text.includes(alias))) continue
    for (const field of ['apiKey', 'baseUrl', 'model']) {
      const fieldValue = extractLooseProviderCredentialField(text, providerId, field)
      if (fieldValue && target[`providerCredentials.${providerId}.${field}`] === undefined) {
        target[`providerCredentials.${providerId}.${field}`] = fieldValue
      }
    }
  }
  if (
    target.provider === undefined &&
    /providerCredentials/i.test(text) &&
    providerKeyAliases('openai-compatible').some((alias) => text.includes(alias))
  ) {
    target.provider = 'openai-compatible'
  }
  const compatibleBaseUrl = extractLooseCompatibleBaseUrl(text)
  const compatibleModel = extractLooseCompatibleModel(text)
  if (compatibleBaseUrl) {
    target.provider ??= 'openai-compatible'
    target['providerCredentials.openai-compatible.baseUrl'] ??= compatibleBaseUrl
  }
  if (compatibleModel) {
    target.provider ??= 'openai-compatible'
    target['providerCredentials.openai-compatible.model'] ??= compatibleModel
  }
}

function extractLooseProviderCredentialField(content, providerId, field) {
  const providerIndex = providerKeyAliases(providerId)
    .map((alias) => content.indexOf(alias))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0]
  if (providerIndex < 0) return undefined
  const window = content.slice(providerIndex, providerIndex + 2000)
  const pattern = new RegExp(`["']?(?:${field}|${fieldAliases(field).join('|')})["']?\\s*[:=]\\s*["']?([^"',\\n#}]+)["']?`, 'i')
  const match = window.match(pattern)
  return match?.[1]?.trim()
}

function extractLooseCompatibleBaseUrl(content) {
  const explicit = content.match(/https:\/\/api\.siliconflow\.cn\/v1\b/i)?.[0]
  if (explicit) return explicit
  const generic = content.match(/["']?(?:baseUrl|base_url|baseURL)["']?\s*[:=]\s*["']?(https?:\/\/[^"',\s#}]+)["']?/i)?.[1]
  return generic?.trim()
}

function extractLooseCompatibleModel(content) {
  const explicit = content.match(/\bdeepseek-ai\/DeepSeek-V4-Flash\b/)?.[0]
  if (explicit) return explicit
  const generic = content.match(/["']?model["']?\s*[:=]\s*["']?([^"',\n#}]+)["']?/i)?.[1]
  return generic?.trim()
}

function fieldAliases(field) {
  if (field === 'apiKey') return ['api_key', 'api-key', 'apikey']
  if (field === 'baseUrl') return ['base_url', 'baseURL', 'base-url']
  return []
}

function resolveProviderEnvConfig(env, { providerEnvLoaded = false, providerEnv = {} } = {}) {
  const approvedEnv = providerEnv && typeof providerEnv === 'object' ? providerEnv : {}
  let provider = normalizeRealProvider(getFirstEnvValue(env, [
    'PRIVATE_AGENTS_REAL_PROVIDER',
    'PRIVATE_AGENTS_PROVIDER',
    'provider',
    'PROVIDER',
  ])) ??
    normalizeRealProvider(getFirstEnvValue(approvedEnv, [
      'PRIVATE_AGENTS_REAL_PROVIDER',
      'PRIVATE_AGENTS_PROVIDER',
      'provider',
      'PROVIDER',
    ])) ??
    inferProviderFromEnv(approvedEnv, { allowOpenAiFallback: false }) ??
    inferProviderFromEnv(env, { allowOpenAiFallback: !providerEnvLoaded })
  const approvedProviderEnvOpenAiCompatibleDefault = !provider &&
    providerEnvLoaded &&
    Boolean(getFirstEnvValue(approvedEnv, [
      'OPENAI_COMPATIBLE_API_KEY',
      'PRIVATE_AGENTS_REAL_API_KEY',
      'OPENAI_API_KEY',
      ...providerCredentialFieldNames('openai-compatible', 'apiKey'),
    ]))
  if (approvedProviderEnvOpenAiCompatibleDefault) {
    provider = 'openai-compatible'
  }
  if (!provider) {
    return {
      ok: false,
      status: 'config-failure',
      reason: providerEnvLoaded
        ? 'approved provider.env was loaded but did not expose a supported provider selector; refusing ambient OPENAI_API_KEY fallback'
        : 'PRIVATE_AGENTS_REAL_PROVIDER or PRIVATE_AGENTS_PROVIDER is required for candidate mutation real suite',
    }
  }

  const supported = new Set(['openai', 'openai-compatible', 'google', 'antigravity', 'claudecode'])
  if (!supported.has(provider)) {
    return {
      ok: false,
      status: 'config-failure',
      reason: `unsupported provider ${provider}`,
    }
  }

  const apiKeyEnvVar = providerApiKeyEnvVar(provider)
  const apiKey = getFirstEnvValue(env, [
    apiKeyEnvVar,
    'PRIVATE_AGENTS_REAL_API_KEY',
  ]) ?? getFirstEnvValue(approvedEnv, [
    apiKeyEnvVar,
    'PRIVATE_AGENTS_REAL_API_KEY',
    ...providerApiKeyAliases(provider),
  ]) ?? getFirstEnvValue(env, [
    ...filterAmbientOpenAiFallbackAliases(providerApiKeyAliases(provider), { providerEnvLoaded }),
  ])
  if (!apiKey) {
    return {
      ok: false,
      status: 'config-failure',
      reason: `${apiKeyEnvVar} or PRIVATE_AGENTS_REAL_API_KEY is required for candidate mutation real suite`,
    }
  }

  const baseUrl = getFirstEnvValue(env, [
    'PRIVATE_AGENTS_REAL_BASE_URL',
    'PRIVATE_AGENTS_PROVIDER_BASE_URL',
    'PRIVATE_AGENTS_BASE_URL',
  ]) ?? getFirstEnvValue(approvedEnv, [
    'PRIVATE_AGENTS_REAL_BASE_URL',
    'PRIVATE_AGENTS_PROVIDER_BASE_URL',
    'PRIVATE_AGENTS_BASE_URL',
    ...providerBaseUrlAliases(provider),
  ]) ?? getFirstEnvValue(env, [
    ...filterAmbientOpenAiFallbackAliases(providerBaseUrlAliases(provider), { providerEnvLoaded }),
  ]) ?? (approvedProviderEnvOpenAiCompatibleDefault ? 'https://api.siliconflow.cn/v1' : undefined)
  const model = getFirstEnvValue(env, [
    'PRIVATE_AGENTS_REAL_MODEL',
    'PRIVATE_AGENTS_PROVIDER_MODEL',
    'PRIVATE_AGENTS_MODEL',
  ]) ?? getFirstEnvValue(approvedEnv, [
    'PRIVATE_AGENTS_REAL_MODEL',
    'PRIVATE_AGENTS_PROVIDER_MODEL',
    'PRIVATE_AGENTS_MODEL',
    ...providerModelAliases(provider),
  ]) ?? getFirstEnvValue(env, [
    ...filterAmbientOpenAiFallbackAliases(providerModelAliases(provider), { providerEnvLoaded }),
  ]) ?? (approvedProviderEnvOpenAiCompatibleDefault ? 'deepseek-ai/DeepSeek-V4-Flash' : undefined)
  if (providerRequiresEndpointConfig(provider) && !baseUrl) {
    return {
      ok: false,
      status: 'config-failure',
      reason: `${provider} requires PRIVATE_AGENTS_REAL_BASE_URL or provider-specific base URL env`,
    }
  }
  if (providerRequiresEndpointConfig(provider) && !model) {
    return {
      ok: false,
      status: 'config-failure',
      reason: `${provider} requires PRIVATE_AGENTS_REAL_MODEL or provider-specific model env`,
    }
  }

  return {
    ok: true,
    provider,
    apiKey,
    apiKeyEnvVar,
    baseUrl,
    model,
    configSourceSuffix: approvedProviderEnvOpenAiCompatibleDefault ? '+openai-compatible-defaults' : '',
  }
}

function filterAmbientOpenAiFallbackAliases(names, { providerEnvLoaded }) {
  if (!providerEnvLoaded) return names
  const ambientOpenAiFallbackNames = new Set([
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
    'OPENAI_API_BASE',
    'OPENAI_API_BASE_URL',
    'OPENAI_MODEL',
    'API_BASE_URL',
    'BASE_URL',
    'MODEL',
  ])
  return names.filter((name) => !ambientOpenAiFallbackNames.has(name))
}

function inferProviderFromEnv(env, { allowOpenAiFallback = true } = {}) {
  if (hasProviderCredentialConfig(env, 'openai-compatible')) return 'openai-compatible'
  if (getFirstEnvValue(env, ['OPENAI_COMPATIBLE_API_KEY'])) return 'openai-compatible'
  if (hasProviderCredentialConfig(env, 'google')) return 'google'
  if (getFirstEnvValue(env, ['GOOGLE_API_KEY'])) return 'google'
  if (hasProviderCredentialConfig(env, 'antigravity')) return 'antigravity'
  if (getFirstEnvValue(env, ['ANTIGRAVITY_API_KEY'])) return 'antigravity'
  if (hasProviderCredentialConfig(env, 'claudecode')) return 'claudecode'
  if (getFirstEnvValue(env, ['CLAUDECODE_API_KEY'])) return 'claudecode'
  if (
    getFirstEnvValue(env, ['PRIVATE_AGENTS_REAL_API_KEY']) &&
    (getFirstEnvValue(env, [
      'PRIVATE_AGENTS_REAL_BASE_URL',
      'PRIVATE_AGENTS_PROVIDER_BASE_URL',
      'PRIVATE_AGENTS_BASE_URL',
      'OPENAI_COMPATIBLE_BASE_URL',
      'OPENAI_BASE_URL',
      'OPENAI_API_BASE',
      'OPENAI_API_BASE_URL',
      'API_BASE_URL',
      'BASE_URL',
    ]) ||
      getFirstEnvValue(env, [
        'PRIVATE_AGENTS_REAL_MODEL',
        'PRIVATE_AGENTS_PROVIDER_MODEL',
        'PRIVATE_AGENTS_MODEL',
        'OPENAI_COMPATIBLE_MODEL',
        'OPENAI_MODEL',
        'MODEL',
      ]))
  ) {
    return 'openai-compatible'
  }
  if (
    getFirstEnvValue(env, ['OPENAI_API_KEY']) &&
    getFirstEnvValue(env, [
      'OPENAI_COMPATIBLE_BASE_URL',
      'PRIVATE_AGENTS_REAL_BASE_URL',
      'PRIVATE_AGENTS_PROVIDER_BASE_URL',
      'PRIVATE_AGENTS_BASE_URL',
      'OPENAI_API_BASE',
      'OPENAI_API_BASE_URL',
      'OPENAI_BASE_URL',
      'API_BASE_URL',
      'BASE_URL',
    ])
  ) {
    return 'openai-compatible'
  }
  if (allowOpenAiFallback && getFirstEnvValue(env, ['OPENAI_API_KEY'])) return 'openai'
  return undefined
}

function hasProviderCredentialConfig(env, provider) {
  return Boolean(
    getFirstEnvValue(env, [
      ...providerCredentialFieldNames(provider, 'apiKey'),
      ...providerCredentialFieldNames(provider, 'baseUrl'),
      ...providerCredentialFieldNames(provider, 'model'),
    ]),
  )
}

function writeEnvBackedRealProviderConfig(input) {
  const configHome = path.join(getTestRoot(), 'candidate-mutation-real-provider-home')
  const configDir = path.join(configHome, '.private-agents')
  fs.rmSync(configHome, { recursive: true, force: true })
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(
    path.join(configDir, 'config.json'),
    JSON.stringify(
      {
        provider: input.provider,
        providerCredentials: {
          [input.provider]: {
            ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
            ...(input.model ? { model: input.model } : {}),
          },
        },
      },
      null,
      2,
    ),
    'utf8',
  )
  return configHome
}

function getFirstEnvValue(env, names) {
  for (const name of names) {
    const value = env[name]?.trim()
    if (value) return value
  }
  return undefined
}

function normalizeRealProvider(value) {
  const normalized = value?.trim().toLowerCase().replace(/_/g, '-')
  switch (normalized) {
    case 'compatible':
    case 'openaicompatible':
    case 'openai-compatible-api':
    case 'siliconflow':
    case 'deepseek':
      return 'openai-compatible'
    default:
      return normalized
  }
}

function providerApiKeyEnvVar(provider) {
  switch (provider) {
    case 'openai':
      return 'OPENAI_API_KEY'
    case 'google':
      return 'GOOGLE_API_KEY'
    case 'antigravity':
      return 'ANTIGRAVITY_API_KEY'
    case 'claudecode':
      return 'CLAUDECODE_API_KEY'
    default:
      return 'OPENAI_COMPATIBLE_API_KEY'
  }
}

function providerApiKeyAliases(provider) {
  switch (provider) {
    case 'openai':
      return providerCredentialFieldNames('openai', 'apiKey')
    case 'google':
      return providerCredentialFieldNames('google', 'apiKey')
    case 'antigravity':
      return providerCredentialFieldNames('antigravity', 'apiKey')
    case 'claudecode':
      return providerCredentialFieldNames('claudecode', 'apiKey')
    default:
      return [
        ...providerCredentialFieldNames('openai-compatible', 'apiKey'),
        'OPENAI_API_KEY',
      ]
  }
}

function providerBaseUrlAliases(provider) {
  switch (provider) {
    case 'openai':
      return [
        ...providerCredentialFieldNames('openai', 'baseUrl'),
        'OPENAI_BASE_URL',
        'OPENAI_API_BASE',
        'OPENAI_API_BASE_URL',
      ]
    case 'google':
      return [...providerCredentialFieldNames('google', 'baseUrl'), 'GOOGLE_BASE_URL']
    case 'antigravity':
      return [...providerCredentialFieldNames('antigravity', 'baseUrl'), 'ANTIGRAVITY_BASE_URL']
    case 'claudecode':
      return [...providerCredentialFieldNames('claudecode', 'baseUrl'), 'CLAUDECODE_BASE_URL']
    default:
      return [
        ...providerCredentialFieldNames('openai-compatible', 'baseUrl'),
        'OPENAI_COMPATIBLE_BASE_URL',
        'OPENAI_BASE_URL',
        'OPENAI_API_BASE',
        'OPENAI_API_BASE_URL',
        'API_BASE_URL',
        'BASE_URL',
      ]
  }
}

function providerModelAliases(provider) {
  switch (provider) {
    case 'openai':
      return [...providerCredentialFieldNames('openai', 'model'), 'OPENAI_MODEL', 'MODEL']
    case 'google':
      return [...providerCredentialFieldNames('google', 'model'), 'GOOGLE_MODEL']
    case 'antigravity':
      return [...providerCredentialFieldNames('antigravity', 'model'), 'ANTIGRAVITY_MODEL']
    case 'claudecode':
      return [...providerCredentialFieldNames('claudecode', 'model'), 'CLAUDECODE_MODEL']
    default:
      return [
        ...providerCredentialFieldNames('openai-compatible', 'model'),
        'OPENAI_COMPATIBLE_MODEL',
        'OPENAI_MODEL',
        'MODEL',
      ]
  }
}

function providerCredentialFieldNames(provider, field) {
  const aliases = providerKeyAliases(provider)
  const envField = field === 'apiKey' ? 'API_KEY' : field === 'baseUrl' ? 'BASE_URL' : 'MODEL'
  return [
    ...aliases.map((alias) => `providerCredentials.${alias}.${field}`),
    ...aliases.map((alias) => `provider_credentials.${alias}.${field}`),
    ...aliases.map((alias) => `PROVIDER_CREDENTIALS.${alias}.${field}`),
    ...aliases.map((alias) => `PROVIDER_CREDENTIALS_${alias.toUpperCase().replace(/-/g, '_')}_${envField}`),
    ...aliases.map((alias) => `PRIVATE_AGENTS_PROVIDER_CREDENTIALS_${alias.toUpperCase().replace(/-/g, '_')}_${envField}`),
  ]
}

function providerKeyAliases(provider) {
  if (provider === 'openai-compatible') {
    return ['openai-compatible', 'openaiCompatible', 'openai_compatible', 'openai-compatible-api']
  }
  return [provider]
}

function providerRequiresEndpointConfig(provider) {
  return ['openai-compatible', 'google', 'antigravity', 'claudecode'].includes(provider)
}

function buildProviderDiagnostics({
  provider,
  baseUrl,
  model,
  configSource,
  credentialSource,
}) {
  return {
    providerId: provider ?? 'unknown',
    clientProtocol: provider === 'openai-compatible' ? 'openai-compatible' : (provider ?? 'unknown'),
    baseUrlHost: baseUrlHost(baseUrl),
    model: model?.trim() || 'default',
    configSource: configSource ?? 'unknown',
    credentialSource: credentialSource ?? 'unknown',
  }
}

function baseUrlHost(baseUrl) {
  const trimmed = baseUrl?.trim()
  if (!trimmed) return 'none'
  try {
    return new URL(trimmed).host || 'none'
  } catch {
    return 'invalid'
  }
}

function renderProviderDiagnostics(diagnostics) {
  if (!diagnostics) return []
  return [
    `providerId=${diagnostics.providerId ?? 'unknown'}`,
    `clientProtocol=${diagnostics.clientProtocol ?? 'unknown'}`,
    `baseUrlHost=${diagnostics.baseUrlHost ?? 'none'}`,
    `model=${diagnostics.model ?? 'default'}`,
    `configSource=${diagnostics.configSource ?? 'unknown'}`,
  ]
}

function printProviderDiagnostics(diagnostics) {
  for (const line of renderProviderDiagnostics(diagnostics)) {
    console.log(line)
  }
}

const {
  futureGateCandidates,
  scenarios,
  candidateScenarios,
  tierDescriptorCases,
  candidateMutationSuiteSyntheticCaseIds,
  candidateMutationSuiteRealCaseIds,
} = createVerifierCaseDefinitions({
  testRoot,
  runId,
  realSingleFileUpdateCaseId,
  realSingleFileCreateCaseId,
  realTwoFileUpdateCaseId,
})
const caseRegistry = createCaseRegistry({
  scenarios,
  candidateScenarios,
  tierDescriptorCases,
  selectedCaseId,
  includeCandidates,
  includeContinueSmoke,
  candidateMutationSuiteId,
  suiteValues,
  candidateMutationSuiteSyntheticCaseIds,
  candidateMutationSuiteRealCaseIds,
  onInvalid: (message) => {
    console.error(message)
    process.exit(3)
  },
})
const verifierReport = createVerifierReportModule({
  reportPath,
  writeReport,
  failureCategories,
  futureGateCandidates,
  candidateMutationSuiteRealCaseIds,
  buildCandidateMetadata,
  summarizeFailureStatus: summarizeResultFailureStatus,
  classifyProviderReadinessFailure,
  categorizeFailure,
  redactProviderOutput,
})

function allCapabilityCases() {
  return caseRegistry.allCapabilityCases()
}

function caseMatchesTier(capabilityCase, tier) {
  return caseRegistry.caseMatchesTier(capabilityCase, tier)
}

function findCapabilityCaseById(caseId) {
  return caseRegistry.findCapabilityCaseById(caseId)
}

function caseMetadata(capabilityCase) {
  return caseRegistry.caseMetadata(capabilityCase)
}

function withCaseMetadata(capabilityCase, result) {
  return caseRegistry.withCaseMetadata(capabilityCase, result)
}

function skippedCasesForTier(tier) {
  return caseRegistry.skippedCasesForTier(tier)
}

function candidateMutationSuiteSelectedIds({ includeReal = false } = {}) {
  return caseRegistry.candidateMutationSuiteSelectedIds({ includeReal })
}

function selectedCasesForSuite(suiteId, { includeReal = false } = {}) {
  return caseRegistry.selectedCasesForSuite(suiteId, { includeReal })
}

function skippedCasesForSuite(suiteId, { includeReal = false } = {}) {
  return caseRegistry.skippedCasesForSuite(suiteId, { includeReal })
}

function selectedCasesForTier(tier) {
  return caseRegistry.selectedCasesForTier(tier)
}

function selectedExecutableScenariosForTier(tier) {
  return caseRegistry.selectedExecutableScenariosForTier(tier)
}

async function runProviderReadinessPreflight() {
  const readinessRuntimeHome = getRealCodingFlowRuntimeHome(`${runId}-provider-readiness`)
  const result = await run(process.execPath, [
    path.join(repoRoot, 'scripts', 'verify-provider-readiness.mjs'),
    '--preflight-only',
  ], {
    cwd: repoRoot,
    env: {
      ...(realHome
        ? {
            HOME: readinessRuntimeHome,
            USERPROFILE: readinessRuntimeHome,
            PRIVATE_AGENTS_REAL_HOME: realHome,
          }
        : {}),
    },
    timeoutMs: 660000,
  })
  return {
    ok: result.code === 0 && !result.timedOut,
    code: result.timedOut ? 2 : result.code,
    status: result.timedOut
      ? 'provider-network-inconclusive'
      : providerReadinessStatusForCode(result.code),
    outputTail: summarizeOutput(result.output),
  }
}

function ensureHome(home, provider) {
  if (!fs.existsSync(home)) {
    throw Object.assign(new Error(`${provider} home is missing: ${home}`), { configFailure: true })
  }
}

function prepareProject(scenario) {
  fs.rmSync(scenario.projectDir, { recursive: true, force: true })
  fs.mkdirSync(scenario.projectDir, { recursive: true })
  for (const relativePath of scenario.directories ?? []) {
    fs.mkdirSync(path.join(scenario.projectDir, relativePath), { recursive: true })
  }
  for (const [relativePath, content] of Object.entries(scenario.files)) {
    const absolutePath = path.join(scenario.projectDir, relativePath)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, content, 'utf8')
  }
}

function applyScenarioFilePermissions(scenario) {
  const readonlyFiles = scenario.readOnlyBeforeRun ?? []
  const restored = []
  for (const relativePath of readonlyFiles) {
    const absolutePath = path.join(scenario.projectDir, relativePath)
    fs.chmodSync(absolutePath, 0o444)
    restored.push(absolutePath)
  }

  return () => {
    for (const absolutePath of restored) {
      if (!fs.existsSync(absolutePath)) continue
      try {
        fs.chmodSync(absolutePath, 0o644)
      } catch {
        // Best-effort cleanup before the temporary fixture is removed.
      }
    }
  }
}

function snapshot(projectDir) {
  const result = new Map()
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = path.join(dir, entry.name)
      const relativePath = path.relative(projectDir, absolutePath).replace(/\\/g, '/')
      if (entry.isDirectory()) {
        visit(absolutePath)
      } else {
        result.set(relativePath, fs.readFileSync(absolutePath, 'utf8'))
      }
    }
  }
  visit(projectDir)
  return result
}

function changedFiles(before, after) {
  const names = new Set([...before.keys(), ...after.keys()])
  return [...names].filter((name) => before.get(name) !== after.get(name)).sort()
}

function summarizeOutput(output) {
  return redactProviderOutput(output)
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-18)
    .join('\n')
}

function redactProviderOutput(input) {
  return String(input ?? '')
    .replace(
      authorizationBearerPattern,
      (_match, prefix, quote) => `${prefix}${quote}Bearer [REDACTED]`,
    )
    .replace(bearerTokenPattern, 'Bearer [REDACTED]')
    .replace(
      keyValueSecretPattern,
      (_match, key, separator, quote) => `${key}${separator}${quote}[REDACTED]`,
    )
    .replace(openAiStyleKeyPattern, '[REDACTED_API_KEY]')
    .replace(maskedOpenAiStyleKeyPattern, '[REDACTED_API_KEY]')
    .replace(secretQueryParamPattern, '$1[REDACTED]')
    .replace(posixPrivateAgentsConfigPattern, '[PRIVATE_AGENTS_CONFIG_PATH]')
    .replace(posixPrivateAgentsRealHomePattern, '[REAL_PROVIDER_HOME]')
    .replace(realHomeConfigPattern, '[REAL_PROVIDER_CONFIG_PATH]')
}

function providerEnv(provider) {
  if (provider === 'synthetic') {
    return {
      HOME: syntheticHome,
      USERPROFILE: syntheticHome,
      PRIVATE_AGENTS_PROVIDER_MODE: 'synthetic',
    }
  }
  return {
    HOME: realHome,
    USERPROFILE: realHome,
  }
}

async function runCliTurn(scenario, turnIndex, prompt) {
  const cliPrompt = scenario.turns[turnIndex]?.continueCompletedSession
    ? `/continue ${prompt}`
    : prompt
  return run(process.execPath, [
    tsxCliPath,
    cliEntryPath,
    '--project',
    scenario.projectDir,
    '--non-interactive-approval',
    'allow-once',
    '--print',
    cliPrompt,
  ], {
    cwd: tsShellRoot,
    env: providerEnv(scenario.provider),
    timeoutMs: scenario.provider === 'real' ? 420000 : 240000,
  })
}

async function readCurrentSessionId(scenario) {
  const result = await run(process.execPath, [
    tsxCliPath,
    cliEntryPath,
    '--project',
    scenario.projectDir,
    '--print',
    '/sessions current',
  ], {
    cwd: tsShellRoot,
    env: providerEnv(scenario.provider),
    timeoutMs: 120000,
  })
  const match = result.output.match(/- ID:\s*(\S+)/)
  return match?.[1] ?? '(unknown)'
}

function readSessionTranscript(scenario, sessionId) {
  const home = scenario.provider === 'real' ? realHome : syntheticHome
  const transcriptPath = path.join(home, '.private-agents', 'sessions', sessionId, 'transcript.jsonl')
  try {
    return fs.readFileSync(transcriptPath, 'utf8')
  } catch {
    return ''
  }
}

function assertScenarioState(scenario, turn, beforeTurn, afterTurn, output) {
  const failures = []
  const observedChanged = changedFiles(beforeTurn, afterTurn)
  const expectedChanged = [...turn.expectChanged].sort()
  const unexpectedChanges = observedChanged.filter((name) => !expectedChanged.includes(name))
  const missingChanges = expectedChanged.filter((name) => !observedChanged.includes(name))

  if (unexpectedChanges.length > 0) {
    failures.push(`unexpected changed files: ${unexpectedChanges.join(', ')}`)
  }
  if (missingChanges.length > 0) {
    failures.push(`expected changed files not changed: ${missingChanges.join(', ')}`)
  }

  const protectedFiles = turn.protectedFiles ?? scenario.protectedFiles
  for (const protectedFile of protectedFiles) {
    if (beforeTurn.get(protectedFile) !== afterTurn.get(protectedFile)) {
      failures.push(`protected file changed: ${protectedFile}`)
    }
  }

  for (const [relativePath, markers] of Object.entries(turn.expectContains ?? {})) {
    const content = afterTurn.get(relativePath)
    if (typeof content !== 'string') {
      failures.push(`expected file missing: ${relativePath}`)
      continue
    }
    for (const marker of markers) {
      if (!content.includes(marker)) {
        failures.push(`missing marker in ${relativePath}: ${marker}`)
      }
    }
  }

  const verificationPassed = /Verification:\s*passed/i.test(output) || /verification passed/i.test(output)
  if (!verificationPassed) {
    failures.push('verification did not report passed')
  }

  return {
    ok: failures.length === 0,
    failures,
    changedFiles: observedChanged,
    verification: verificationPassed ? 'passed' : 'missing',
  }
}

function outputHasExpectedMarker(output, marker) {
  if (output.includes(marker)) return true
  if (marker === 'Inspect/re-read both attempted files before retrying') {
    return output.includes('Inspect/re-read all attempted files before retrying')
  }
  return false
}

function isProviderReadinessOutput(output) {
  const normalized = String(output ?? '').toLowerCase()
  return (
    hasExplicitProviderReadinessMarker(normalized) ||
    providerNetworkFailurePattern.test(normalized) ||
    providerConfigFailurePattern.test(normalized) ||
    providerAuthFailurePattern.test(normalized)
  )
}

function hasExplicitProviderReadinessMarker(output) {
  const normalized = String(output ?? '').toLowerCase()
  return (
    normalized.includes('provider readiness failed') ||
    normalized.includes('provider-readiness') ||
    normalized.includes('unable to reach the openai-compatible endpoint')
  )
}

function classifyProviderReadinessFailure(failureReason, output, provider) {
  const normalized = `${String(failureReason ?? '')}\n${String(output ?? '')}`
  if (provider !== 'real' && !hasExplicitProviderReadinessMarker(normalized)) {
    return undefined
  }
  if (providerNetworkFailurePattern.test(normalized)) {
    return {
      statusDetail: 'provider-network-inconclusive',
      exitCode: 2,
      reason: 'provider-readiness:network: provider endpoint was unreachable during this turn',
    }
  }
  if (providerAuthFailurePattern.test(normalized)) {
    return {
      statusDetail: 'config-failure',
      exitCode: 3,
      reason: 'provider-readiness:auth: provider authentication failed during this turn',
    }
  }
  if (providerConfigFailurePattern.test(normalized)) {
    return {
      statusDetail: 'config-failure',
      exitCode: 3,
      reason: 'provider-readiness:missing-config: provider credential or endpoint configuration is incomplete',
    }
  }
  if (providerModelFailurePattern.test(normalized)) {
    return {
      statusDetail: 'provider-model-failed',
      exitCode: 1,
      reason: 'provider-readiness:model: provider model was unavailable or rejected this turn',
    }
  }
  if (isProviderReadinessOutput(normalized)) {
    return {
      statusDetail: 'provider-readiness-failed',
      exitCode: 1,
      reason: 'provider-readiness:unknown: provider readiness failed during this turn',
    }
  }
  return undefined
}

function categorizeFailure(failureReason, output, provider) {
  if (classifyProviderReadinessFailure(failureReason, output, provider)) {
    return 'provider-readiness'
  }
  const normalized = `${String(failureReason ?? '')}\n${String(output ?? '')}`.toLowerCase()
  if (!normalized.trim()) return 'none'
  if (
    normalized.includes('unsupported patch shape') ||
    normalized.includes('only supports one explicit single-file') ||
    normalized.includes('add file') ||
    normalized.includes('delete file') ||
    normalized.includes('move file')
  ) {
    return 'unsupported-patch-shape'
  }
  if (
    normalized.includes('provider output did not contain') ||
    normalized.includes('provider output missing') ||
    normalized.includes('multiple patches')
  ) {
    return 'model-output'
  }
  if (
    normalized.includes('over-scoped') ||
    normalized.includes('outside the current tier') ||
    normalized.includes('not an mvp blocker')
  ) {
    return 'over-scoped-expectation'
  }
  if (
    normalized.includes('home is missing') ||
    normalized.includes('provider') ||
    normalized.includes('auth') ||
    normalized.includes('credential')
  ) {
    return 'provider-readiness'
  }
  if (
    normalized.includes('timed out') ||
    normalized.includes('enoent') ||
    normalized.includes('eacces') ||
    normalized.includes('filesystem')
  ) {
    return 'environment-filesystem-issue'
  }
  if (normalized.includes('protected file changed')) {
    return 'protected-file-changed'
  }
  if (
    normalized.includes('verification did not report passed') ||
    normalized.includes('verification blocked')
  ) {
    return 'verification-blocked'
  }
  if (normalized.includes('verification failed')) {
    return 'verification-failed'
  }
  if (
    normalized.includes('missing marker') ||
    normalized.includes('expected file missing') ||
    normalized.includes('expected changed files not changed')
  ) {
    return 'assertion-mismatch'
  }
  if (normalized.includes('product gap')) {
    return 'product-gap'
  }
  return 'task-execution-failure'
}

function normalizeFailureReason(failureReason, output, provider) {
  return classifyProviderReadinessFailure(failureReason, output, provider)?.reason ?? failureReason
}

function nextActionForFailureSurface(failureCategory, statusDetail) {
  if (failureCategory === 'provider-readiness') {
    if (statusDetail === 'provider-network-inconclusive') {
      return 'Retry when the provider endpoint is reachable; do not treat this as a product regression.'
    }
    if (statusDetail === 'config-failure') {
      return 'Fix provider configuration or authentication outside this run, then retry the same capability gate.'
    }
    if (statusDetail === 'provider-model-failed') {
      return 'Select an available provider model or wait for quota/rate-limit recovery, then retry the same read-only smoke.'
    }
    return 'Inspect provider readiness output, fix the provider state, then retry the same capability gate.'
  }
  if (failureCategory === 'verification-failed' || failureCategory === 'verification-blocked') {
    return 'Repair the verification failure and rerun the focused check.'
  }
  if (failureCategory === 'protected-file-changed') {
    return 'Restore the protected file, then rerun with a narrower instruction.'
  }
  if (failureCategory === 'assertion-mismatch') {
    return 'Inspect changed files and rerun the scenario after correcting the mismatch.'
  }
  if (failureCategory === 'unsupported-patch-shape') {
    return 'Keep this case out of MVP until a dedicated add/delete/move/multi-file or broad apply_patch plan exists.'
  }
  if (failureCategory === 'model-output') {
    return 'Inspect the model output shape; do not treat missing or multiple patch blocks as verified mutation success.'
  }
  if (failureCategory === 'over-scoped-expectation') {
    return 'Retain this case in its non-MVP tier and rerun the MVP tier without treating it as a blocker.'
  }
  if (failureCategory === 'product-gap') {
    return 'Decide whether the product gap belongs in candidate, release, or a separate implementation plan.'
  }
  if (failureCategory === 'environment-filesystem-issue') {
    return 'Fix the local filesystem or sandbox permission issue, then rerun the gate.'
  }
  return 'Inspect the model/tool execution output, fix the failed step, then retry.'
}

function buildTerminalResultSurface(result) {
  const status = summarizeResultFailureStatus([result], {
    classifyProviderReadinessFailure,
  })
  const failureCategory = result.failureCategory ?? 'none'
  const outputTail = summarizeOutput(result.outputTail ?? '')
  const failureReason = redactProviderOutput(result.failureReason ?? '')
  if (result.status === 'PASS') {
    return {
      outcome: 'success',
      statusDetail: status.statusDetail,
      failureCategory,
      failureReason: '',
      nextAction: 'Continue with the next task.',
      outputTail,
    }
  }
  return {
    outcome: failureCategory === 'provider-readiness' ? 'provider-failure' : 'stopped',
    statusDetail: status.statusDetail,
    failureCategory,
    failureReason,
    nextAction: nextActionForFailureSurface(failureCategory, status.statusDetail),
    outputTail,
  }
}

function buildFailureFollowupContext(result, followupPrompt) {
  const surface = buildTerminalResultSurface(result)
  return {
    previousOutcome: surface.outcome,
    blocker: surface.failureCategory,
    statusDetail: surface.statusDetail,
    reason: surface.failureReason,
    doNext: surface.nextAction,
    followupPrompt: redactProviderOutput(followupPrompt),
    contextLine: [
      `previousOutcome=${surface.outcome}`,
      `blocker=${surface.failureCategory}`,
      `status=${surface.statusDetail}`,
      surface.failureReason ? `reason=${surface.failureReason}` : '',
      `DoNext=${surface.nextAction}`,
      `followup=${redactProviderOutput(followupPrompt)}`,
    ].filter(Boolean).join(' | '),
  }
}

function renderTerminalResultSurface(result) {
  const surface = buildTerminalResultSurface(result)
  const parts = [
    `Outcome: ${surface.outcome}`,
    `Category: ${surface.failureCategory}`,
    `Status: ${surface.statusDetail}`,
  ]
  if (result.route01FailureClass) {
    parts.push(`Route01Class: ${result.route01FailureClass}`)
  }
  if (result.route02FailureClass) {
    parts.push(`Route02Class: ${result.route02FailureClass}`)
  }
  if (surface.failureReason) {
    parts.push(`Reason: ${surface.failureReason}`)
  }
  parts.push(`NextAction: ${surface.nextAction}`)
  return parts.join(' | ')
}

const benignCommandAllowlist = new Set(['node --version', 'npm --version'])

function normalizeSlashes(value) {
  return String(value ?? '').replace(/\\/g, '/')
}

function escapeRegExp(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hasPathPrefix(value, prefix) {
  const normalizedValue = normalizeSlashes(value).toLowerCase()
  const normalizedPrefix = normalizeSlashes(prefix).toLowerCase()
  return normalizedValue === normalizedPrefix || normalizedValue.startsWith(`${normalizedPrefix}/`)
}

function isInsideSyntheticOrTempWorkspace(value) {
  return (
    hasPathPrefix(value, syntheticHome) ||
    hasPathPrefix(value, path.join(testRoot, 'pca-tool-planning-provider-gated')) ||
    hasPathPrefix(value, path.join(testRoot, 'pca-tool-planning-read')) ||
    hasPathPrefix(value, path.join(testRoot, 'pca-tool-planning-command')) ||
    hasPathPrefix(value, '/tmp') ||
    hasPathPrefix(value, 'c:/tmp')
  )
}

function isRealProviderHomePath(value) {
  return Boolean(realHome && hasPathPrefix(value, realHome)) || hasPathPrefix(value, 'D:/Test/home-sf')
}

function buildToolExecutionPlanningAudit(plan) {
  if (plan.providerStatus && plan.providerStatus !== 'ready') {
    return {
      decision: 'provider-gated',
      execute: false,
      reason: 'provider failure must stop before tool execution',
      nextAction: 'Fix provider readiness before evaluating tool execution.',
    }
  }

  const target = plan.targetPath ?? plan.projectDir ?? ''
  if (target && isRealProviderHomePath(target)) {
    return {
      decision: 'blocked-real-home',
      execute: false,
      reason: 'tool plan targets real-provider home',
      nextAction: 'Use a synthetic/test workspace; never target real-provider configuration files.',
    }
  }

  if (plan.writes && !isInsideSyntheticOrTempWorkspace(target)) {
    return {
      decision: 'blocked-dangerous-write',
      execute: false,
      reason: 'write plan is outside synthetic/test workspace',
      nextAction: 'Move the fixture into a synthetic/test workspace before allowing execution.',
    }
  }

  if (plan.tool === 'bash') {
    if (!benignCommandAllowlist.has(plan.command ?? '')) {
      return {
        decision: 'blocked-command-not-allowlisted',
        execute: false,
        reason: 'command is not in the benign dry-run allowlist',
        nextAction: 'Restrict the audit to allowlisted benign commands.',
      }
    }
    if (plan.approval !== 'explicit-allow') {
      return {
        decision: 'approval-required',
        execute: false,
        reason: 'tool execution requires explicit approval',
        nextAction: 'Ask for explicit approval before executing even benign real-provider-planned tools.',
      }
    }
    return {
      decision: 'allow-benign-command',
      execute: true,
      reason: 'allowlisted benign command with explicit approval',
      nextAction: 'Execute only inside the controlled audit harness.',
    }
  }

  if (plan.tool === 'read-file') {
    return {
      decision: 'allow-read-only',
      execute: true,
      reason: 'read-only tool plan in synthetic/test workspace',
      nextAction: 'Read only the controlled fixture and preserve sanitized output.',
    }
  }

  return {
    decision: 'blocked-unknown-tool',
    execute: false,
    reason: 'tool is outside this audit boundary',
    nextAction: 'Add a focused audit case before allowing this tool family.',
  }
}

async function runScenario(scenario) {
  if (scenario.execution === 'apply-patch-workspace-write-cli') {
    return runApplyPatchWorkspaceWriteScenario(scenario)
  }
  if (scenario.execution === 'mutation-continuity-compact-test') {
    return runMutationContinuityCompactScenario(scenario)
  }
  if (scenario.execution === 'mutation-recovery-followup-test') {
    return runMutationRecoveryFollowupScenario(scenario)
  }
  if (scenario.execution === 'apply-patch-multi-file-update-planning-dry-run') {
    return runApplyPatchMultiFileUpdatePlanningScenario(scenario)
  }
  prepareProject(scenario)
  let previousSnapshot = snapshot(scenario.projectDir)
  const turnResults = []
  let sessionId = '(pending)'

  for (const [index, turn] of scenario.turns.entries()) {
    const previousSessionId = sessionId
    const runResult = await runCliTurn(scenario, index, turn.prompt)
    if (runResult.code !== 0 || runResult.timedOut) {
      return {
        capability: scenario.id,
        provider: scenario.provider,
        status: 'FAIL',
        projectDir: scenario.projectDir,
        sessionId,
        changedFiles: [],
        protectedFiles: scenario.protectedFiles,
        reportPath,
        verification: 'blocked',
        failureCategory: categorizeFailure(
          runResult.timedOut ? `turn ${index + 1} timed out` : `turn ${index + 1} exited ${runResult.code}`,
          runResult.output,
          scenario.provider,
        ),
        failureReason: normalizeFailureReason(
          runResult.timedOut ? `turn ${index + 1} timed out` : `turn ${index + 1} exited ${runResult.code}`,
          runResult.output,
          scenario.provider,
        ),
        outputTail: summarizeOutput(runResult.output),
        turns: turnResults,
      }
    }

    sessionId = await readCurrentSessionId(scenario)

    const nextSnapshot = snapshot(scenario.projectDir)
    const assertion = assertScenarioState(scenario, turn, previousSnapshot, nextSnapshot, runResult.output)
    if (
      turn.expectSameSession &&
      previousSessionId !== '(pending)' &&
      sessionId !== previousSessionId
    ) {
      assertion.ok = false
      assertion.failures.push(`session id changed during completed /continue: before=${previousSessionId} after=${sessionId}`)
    }
    const transcript = readSessionTranscript(scenario, sessionId)
    for (const marker of turn.expectTranscriptContains ?? []) {
      if (!transcript.includes(marker) && !runResult.output.includes(marker)) {
        assertion.ok = false
        assertion.failures.push(`continuation transcript missing marker: ${marker}`)
      }
    }
    turnResults.push({
      turn: index + 1,
      mode: turn.continueCompletedSession ? 'continue-completed-session' : 'prompt',
      sessionId,
      changedFiles: assertion.changedFiles,
      verification: assertion.verification,
      transcriptEvidence: (turn.expectTranscriptContains ?? []).filter(
        (marker) => transcript.includes(marker) || runResult.output.includes(marker),
      ),
      outputTail: summarizeOutput(runResult.output),
    })
    if (!assertion.ok) {
      return {
        capability: scenario.id,
        provider: scenario.provider,
        status: 'FAIL',
        projectDir: scenario.projectDir,
        sessionId,
        changedFiles: assertion.changedFiles,
        protectedFiles: scenario.protectedFiles,
        reportPath,
        verification: assertion.verification,
        failureCategory: categorizeFailure(assertion.failures.join('; '), runResult.output, scenario.provider),
        failureReason: normalizeFailureReason(assertion.failures.join('; '), runResult.output, scenario.provider),
        outputTail: summarizeOutput(runResult.output),
        turns: turnResults,
      }
    }
    previousSnapshot = nextSnapshot
  }

  const allChangedFiles = [...new Set(turnResults.flatMap((turn) => turn.changedFiles))].sort()
  return {
    capability: scenario.id,
    provider: scenario.provider,
    status: 'PASS',
    projectDir: scenario.projectDir,
    sessionId,
    changedFiles: allChangedFiles,
    protectedFiles: scenario.protectedFiles,
    reportPath,
    verification: 'passed',
    failureCategory: 'none',
    failureReason: '',
    turns: turnResults,
  }
}

async function runMutationContinuityCompactScenario(scenario) {
  const result = await run(npmBin, [
    'run',
    'verify:mutation-continuity:compact',
  ], {
    cwd: repoRoot,
    env: {
      PRIVATE_AGENTS_PROVIDER_MODE: 'synthetic',
    },
    timeoutMs: 120000,
  })
  const failures = []
  if (result.code !== 0 || result.timedOut) {
    failures.push(
      result.timedOut
        ? 'mutation compact continuity smoke timed out'
        : `mutation compact continuity smoke exited ${result.code}`,
    )
  }
  if (!/mutationCompactContinuity\.test\.ts/.test(result.output)) {
    failures.push('mutation compact continuity focused test output missing')
  }

  if (failures.length > 0) {
    return {
      capability: scenario.id,
      provider: scenario.provider,
      status: 'FAIL',
      projectDir: scenario.projectDir,
      sessionId: '(mutation-compact-continuity)',
      changedFiles: [],
      failedFiles: [],
      protectedFiles: scenario.protectedFiles,
      reportPath,
      verification: 'blocked',
      failureCategory: categorizeFailure(failures.join('; '), result.output, scenario.provider),
      failureReason: normalizeFailureReason(failures.join('; '), result.output, scenario.provider),
      outputTail: summarizeOutput(result.output),
      turns: [
        {
          turn: 1,
          mode: 'mutation-continuity-compact-test',
          sessionId: '(mutation-compact-continuity)',
          changedFiles: [],
          failedFiles: [],
          verification: 'blocked',
          outputTail: summarizeOutput(result.output),
        },
      ],
    }
  }

  return {
    capability: scenario.id,
    provider: scenario.provider,
    status: 'PASS',
    projectDir: scenario.projectDir,
    sessionId: '(mutation-compact-continuity)',
    changedFiles: [],
    failedFiles: [],
    protectedFiles: scenario.protectedFiles,
    reportPath,
    verification: 'passed',
    failureCategory: 'none',
    failureReason: '',
    outputTail: summarizeOutput(result.output),
    turns: [
      {
        turn: 1,
        mode: 'mutation-continuity-compact-test',
        sessionId: '(mutation-compact-continuity)',
        changedFiles: [],
        failedFiles: [],
        verification: 'passed',
        outputTail: summarizeOutput(result.output),
      },
    ],
  }
}

async function runMutationRecoveryFollowupScenario(scenario) {
  const result = await run(npmBin, [
    'run',
    'verify:mutation-recovery:followup',
  ], {
    cwd: repoRoot,
    env: {
      PRIVATE_AGENTS_PROVIDER_MODE: 'synthetic',
    },
    timeoutMs: 120000,
  })
  const failures = []
  if (result.code !== 0 || result.timedOut) {
    failures.push(
      result.timedOut
        ? 'mutation recovery follow-up smoke timed out'
        : `mutation recovery follow-up smoke exited ${result.code}`,
    )
  }
  if (!/continueShellActionRuntime\.test\.ts/.test(result.output)) {
    failures.push('mutation recovery follow-up focused test output missing')
  }

  if (failures.length > 0) {
    return {
      capability: scenario.id,
      provider: scenario.provider,
      status: 'FAIL',
      projectDir: scenario.projectDir,
      sessionId: '(mutation-recovery-followup)',
      changedFiles: ['src/a.ts'],
      failedFiles: ['src/b.ts'],
      protectedFiles: scenario.protectedFiles,
      reportPath,
      verification: 'blocked',
      failureCategory: categorizeFailure(failures.join('; '), result.output, scenario.provider),
      failureReason: normalizeFailureReason(failures.join('; '), result.output, scenario.provider),
      outputTail: summarizeOutput(result.output),
      turns: [
        {
          turn: 1,
          mode: 'mutation-recovery-followup-test',
          sessionId: '(mutation-recovery-followup)',
          changedFiles: ['src/a.ts'],
          failedFiles: ['src/b.ts'],
          verification: 'blocked',
          outputTail: summarizeOutput(result.output),
        },
      ],
    }
  }

  return {
    capability: scenario.id,
    provider: scenario.provider,
    status: 'PASS',
    projectDir: scenario.projectDir,
    sessionId: '(mutation-recovery-followup)',
    changedFiles: ['src/a.ts'],
    failedFiles: ['src/b.ts'],
    protectedFiles: scenario.protectedFiles,
    reportPath,
    verification: 'passed',
    failureCategory: 'none',
    failureReason: '',
    outputTail: summarizeOutput(result.output),
    turns: [
      {
        turn: 1,
        mode: 'mutation-recovery-followup-test',
        sessionId: '(mutation-recovery-followup)',
        changedFiles: ['src/a.ts'],
        failedFiles: ['src/b.ts'],
        verification: 'passed',
        outputTail: summarizeOutput(result.output),
      },
    ],
  }
}

async function runApplyPatchWorkspaceWriteScenario(scenario) {
  prepareProject(scenario)
  let restoreScenarioPermissions = () => {}
  const runtimeHome = path.join(testRoot, 'real-user-capabilities-runtime-home', `${scenario.id}-${runId}`)
  const auditLogPath = path.join(testRoot, 'real-user-capabilities-audit', `${scenario.id}-${runId}`, 'permissions.jsonl')
  fs.rmSync(runtimeHome, { recursive: true, force: true })
  fs.mkdirSync(runtimeHome, { recursive: true })
  fs.rmSync(path.dirname(auditLogPath), { recursive: true, force: true })
  fs.mkdirSync(path.dirname(auditLogPath), { recursive: true })

  try {
    restoreScenarioPermissions = applyScenarioFilePermissions(scenario)
    const before = snapshot(scenario.projectDir)
    const result = await runApplyPatchWorkspaceWriteCli({
      fixtureDir: scenario.projectDir,
      patchText: scenario.patchText,
      runtimeHome,
      auditLogPath,
    })
    const after = snapshot(scenario.projectDir)
    const observedChanged = changedFiles(before, after)
    const expectedChanged = [...(scenario.expectChanged ?? [])].sort()
    const failures = []
    const expectStopped = scenario.expectTerminal === 'stopped'
    const unexpectedChanges = observedChanged.filter((name) => !expectedChanged.includes(name))
    const missingChanges = expectedChanged.filter((name) => !observedChanged.includes(name))
    if (result.code !== 0 || result.timedOut) {
      failures.push(result.timedOut ? 'workspace write CLI timed out' : `workspace write CLI exited ${result.code}`)
    }
    if (expectStopped) {
      if (!/Outcome:\s*stopped/i.test(result.output)) {
        failures.push('terminal stopped marker missing')
      }
      if (/Outcome:\s*success/i.test(result.output)) {
        failures.push('terminal success marker present on expected stopped path')
      }
    } else {
      const successMarker =
        scenario.expectOutputContains?.[0] ?? 'apply_patch workspace write succeeded'
      if (!new RegExp(escapeRegExp(successMarker), 'i').test(result.output)) {
        failures.push(`workspace success marker missing: ${successMarker}`)
      }
      if (!/success/i.test(result.output)) {
        failures.push('terminal success marker missing')
      }
    }
    if (unexpectedChanges.length > 0) {
      failures.push(`unexpected changed files: ${unexpectedChanges.join(', ')}`)
    }
    if (missingChanges.length > 0) {
      failures.push(`expected changed files not changed: ${missingChanges.join(', ')}`)
    }
    for (const protectedFile of scenario.protectedFiles ?? []) {
      if (before.get(protectedFile) !== after.get(protectedFile)) {
        failures.push(`protected file changed: ${protectedFile}`)
      }
    }
    for (const [relativePath, markers] of Object.entries(scenario.expectContains ?? {})) {
      const content = after.get(relativePath)
      if (typeof content !== 'string') {
        failures.push(`expected file missing: ${relativePath}`)
        continue
      }
      for (const marker of markers) {
        if (!content.includes(marker)) {
          failures.push(`missing marker in ${relativePath}: ${marker}`)
        }
      }
    }
    for (const relativePath of scenario.expectUnchanged ?? []) {
      if (before.get(relativePath) !== after.get(relativePath)) {
        failures.push(`expected file to remain unchanged: ${relativePath}`)
      }
    }
    for (const [relativePath, expectedContent] of Object.entries(scenario.expectExactContent ?? {})) {
      const content = after.get(relativePath)
      if (content !== expectedContent) {
        failures.push(`exact content mismatch for ${relativePath}`)
      }
    }
    for (const failedFile of scenario.expectFailedFiles ?? []) {
      if (!new RegExp(`Failed files:[^\\n]*${escapeRegExp(failedFile)}`, 'i').test(result.output)) {
        failures.push(`failed file marker missing: ${failedFile}`)
      }
      if (new RegExp(`Changed files:[^\\n]*${escapeRegExp(failedFile)}`, 'i').test(result.output)) {
        failures.push(`failed file was reported as changed: ${failedFile}`)
      }
    }
    for (const marker of scenario.expectOutputContains ?? []) {
      if (!outputHasExpectedMarker(result.output, marker)) {
        failures.push(`output missing marker: ${marker}`)
      }
    }
    for (const marker of scenario.expectOutputNotContains ?? []) {
      if (result.output.includes(marker)) {
        failures.push(`output contained forbidden marker: ${marker}`)
      }
    }

    if (failures.length > 0) {
      return {
        capability: scenario.id,
        provider: scenario.provider,
        status: 'FAIL',
        projectDir: scenario.projectDir,
        sessionId: '(workspace-write-cli)',
        changedFiles: observedChanged,
        failedFiles: scenario.expectFailedFiles ?? [],
        writeEffect: scenario.expectWriteEffect ?? (expectStopped ? 'unknown' : 'verified'),
        terminalClassification: expectStopped ? 'stopped' : 'success',
        protectedFiles: scenario.protectedFiles,
        reportPath,
        verification: 'blocked',
        failureCategory: categorizeFailure(failures.join('; '), result.output, scenario.provider),
        failureReason: normalizeFailureReason(failures.join('; '), result.output, scenario.provider),
        outputTail: summarizeOutput(result.output),
        turns: [
          {
            turn: 1,
            mode: 'apply-patch-workspace-write-cli',
            sessionId: '(workspace-write-cli)',
            changedFiles: observedChanged,
            failedFiles: scenario.expectFailedFiles ?? [],
            writeEffect: scenario.expectWriteEffect ?? (expectStopped ? 'unknown' : 'verified'),
            terminalClassification: expectStopped ? 'stopped' : 'success',
            verification: 'blocked',
            outputTail: summarizeOutput(result.output),
          },
        ],
      }
    }

    return {
      capability: scenario.id,
      provider: scenario.provider,
      status: 'PASS',
      projectDir: scenario.projectDir,
      sessionId: '(workspace-write-cli)',
      changedFiles: observedChanged,
      failedFiles: scenario.expectFailedFiles ?? [],
      writeEffect: scenario.expectWriteEffect ?? (expectStopped ? 'unknown' : 'verified'),
      terminalClassification: expectStopped ? 'stopped' : 'success',
      protectedFiles: scenario.protectedFiles,
      reportPath,
      verification: 'passed',
      failureCategory: 'none',
      failureReason: '',
      turns: [
        {
          turn: 1,
          mode: 'apply-patch-workspace-write-cli',
          sessionId: '(workspace-write-cli)',
          changedFiles: observedChanged,
          failedFiles: scenario.expectFailedFiles ?? [],
          writeEffect: scenario.expectWriteEffect ?? (expectStopped ? 'unknown' : 'verified'),
          terminalClassification: expectStopped ? 'stopped' : 'success',
          verification: 'passed',
          outputTail: summarizeOutput(result.output),
        },
      ],
    }
  } finally {
    restoreScenarioPermissions()
    fs.rmSync(scenario.projectDir, { recursive: true, force: true })
    fs.rmSync(runtimeHome, { recursive: true, force: true })
    fs.rmSync(path.dirname(auditLogPath), { recursive: true, force: true })
  }
}

async function runApplyPatchMultiFileUpdatePlanningScenario(scenario) {
  prepareProject(scenario)
  const patchDir = path.join(testRoot, 'real-user-capabilities-patches', `${scenario.id}-${runId}`)
  const patchPath = path.join(patchDir, 'patch.diff')
  fs.rmSync(patchDir, { recursive: true, force: true })
  fs.mkdirSync(patchDir, { recursive: true })
  fs.writeFileSync(patchPath, scenario.patchText, 'utf8')

  try {
    const before = snapshot(scenario.projectDir)
    const result = await runMultiFileUpdatePlanningDryRun({
      fixtureDir: scenario.projectDir,
      patchPath,
    })
    const after = snapshot(scenario.projectDir)
    const observedChanged = changedFiles(before, after)
    const failures = []
    let dryRunResult
    if (result.code !== 0 || result.timedOut) {
      failures.push(result.timedOut ? 'multi-file planning dry-run timed out' : `multi-file planning dry-run exited ${result.code}`)
    } else {
      try {
        dryRunResult = JSON.parse(result.stdout)
      } catch (error) {
        failures.push(`multi-file planning dry-run returned non-json output: ${error.message}`)
      }
    }

    const expectedChanged = [...(scenario.expectChanged ?? [])].sort()
    const expectedWouldChange = [...(scenario.expectWouldChange ?? [])].sort()
    const unexpectedChanges = observedChanged.filter((name) => !expectedChanged.includes(name))
    const missingChanges = expectedChanged.filter((name) => !observedChanged.includes(name))
    if (unexpectedChanges.length > 0) {
      failures.push(`unexpected changed files: ${unexpectedChanges.join(', ')}`)
    }
    if (missingChanges.length > 0) {
      failures.push(`expected changed files not changed: ${missingChanges.join(', ')}`)
    }
    for (const protectedFile of scenario.protectedFiles ?? []) {
      if (before.get(protectedFile) !== after.get(protectedFile)) {
        failures.push(`protected file changed: ${protectedFile}`)
      }
    }

    if (dryRunResult) {
      const actualChanged = [...(dryRunResult.changedFiles ?? [])].sort()
      const actualWriteIntents = [...(dryRunResult.writeIntents ?? [])].sort()
      const actualWouldChange = [...(dryRunResult.wouldChangeFiles ?? [])].sort()
      if (dryRunResult.status !== 'blocked') {
        failures.push(`expected blocked no-write planning status, observed ${dryRunResult.status}`)
      }
      if (dryRunResult.willWrite !== false) {
        failures.push('dry-run result did not report willWrite=false')
      }
      if (dryRunResult.noWriterInvoked !== true) {
        failures.push('dry-run result did not prove noWriterInvoked=true')
      }
      if (actualChanged.length !== 0) {
        failures.push(`dry-run changedFiles not empty: ${actualChanged.join(', ')}`)
      }
      if (actualWriteIntents.length !== 0) {
        failures.push(`dry-run writeIntents not empty: ${actualWriteIntents.join(', ')}`)
      }
      if (actualWouldChange.join(',') !== expectedWouldChange.join(',')) {
        failures.push(`wouldChangeFiles mismatch: observed=${actualWouldChange.join(',') || 'none'} expected=${expectedWouldChange.join(',') || 'none'}`)
      }
      if (dryRunResult.unsupportedCapability?.capability !== 'multi-file-update-candidate-no-write') {
        failures.push(`unsupported capability mismatch: ${dryRunResult.unsupportedCapability?.capability ?? 'missing'}`)
      }
      const acceptedBlockedReasons = new Set([
        'multi-file-update-write-not-enabled',
        'bounded-update-planning-no-write',
      ])
      if (!acceptedBlockedReasons.has(dryRunResult.unsupportedCapability?.blockedReason)) {
        failures.push(`blocked reason mismatch: ${dryRunResult.unsupportedCapability?.blockedReason ?? 'missing'}`)
      }
      if (dryRunResult.resultSurface?.failureCategory !== 'candidate-capability-no-write') {
        failures.push(`failure category mismatch: ${dryRunResult.resultSurface?.failureCategory ?? 'missing'}`)
      }
    }

    const planningOutput = formatMultiFilePlanningOutput(dryRunResult, failures)
    for (const marker of scenario.expectOutputContains ?? []) {
      if (!outputHasExpectedMarker(planningOutput, marker)) {
        failures.push(`output missing marker: ${marker}`)
      }
    }
    console.log(planningOutput)

    if (failures.length > 0) {
      return {
        capability: scenario.id,
        provider: scenario.provider,
        status: 'FAIL',
        projectDir: scenario.projectDir,
        sessionId: '(multi-file-update-planning-dry-run)',
        changedFiles: observedChanged,
        protectedFiles: scenario.protectedFiles,
        reportPath,
        verification: 'blocked',
        failureCategory: categorizeFailure(failures.join('; '), `${result.output}\n${planningOutput}`, scenario.provider),
        failureReason: normalizeFailureReason(failures.join('; '), `${result.output}\n${planningOutput}`, scenario.provider),
        outputTail: summarizeOutput(`${result.output}\n${planningOutput}`),
        turns: [
          {
            turn: 1,
            mode: 'apply-patch-multi-file-update-planning-dry-run',
            sessionId: '(multi-file-update-planning-dry-run)',
            changedFiles: observedChanged,
            verification: 'blocked',
            outputTail: summarizeOutput(planningOutput),
          },
        ],
      }
    }

    return {
      capability: scenario.id,
      provider: scenario.provider,
      status: 'PASS',
      projectDir: scenario.projectDir,
      sessionId: '(multi-file-update-planning-dry-run)',
      changedFiles: observedChanged,
      protectedFiles: scenario.protectedFiles,
      reportPath,
      verification: 'candidate-no-write-planning-passed',
      failureCategory: 'none',
      failureReason: '',
      outputTail: summarizeOutput(planningOutput),
      turns: [
        {
          turn: 1,
          mode: 'apply-patch-multi-file-update-planning-dry-run',
          sessionId: '(multi-file-update-planning-dry-run)',
          changedFiles: observedChanged,
          verification: 'candidate-no-write-planning-passed',
          outputTail: summarizeOutput(planningOutput),
        },
      ],
    }
  } finally {
    fs.rmSync(scenario.projectDir, { recursive: true, force: true })
    fs.rmSync(patchDir, { recursive: true, force: true })
  }
}

async function runMultiFileUpdatePlanningDryRun({ fixtureDir, patchPath }) {
  const dryRunModuleUrl = pathToFileURL(
    path.join(tsShellRoot, 'src', 'orchestration', 'patchResult', 'singleFileApplyPatchDryRun.ts'),
  ).href
  const script = `
    import fs from 'node:fs';
    import { buildSingleFileApplyPatchDryRun } from ${JSON.stringify(dryRunModuleUrl)};
    const workspaceRoot = process.argv[1];
    const patchPath = process.argv[2];
    const rawPatchText = fs.readFileSync(patchPath, 'utf8');
    const readFile = (absolutePath) => {
      try {
        return fs.readFileSync(absolutePath, 'utf8');
      } catch {
        return undefined;
      }
    };
    const directoryExists = (absolutePath) => {
      try {
        return fs.statSync(absolutePath).isDirectory();
      } catch {
        return false;
      }
    };
    const dryRun = buildSingleFileApplyPatchDryRun({
      workspaceRoot,
      rawPatchText,
      readFile,
      directoryExists,
      dryRun: true,
    });
    console.log(JSON.stringify({
      status: dryRun.status,
      willWrite: dryRun.willWrite,
      changedFiles: dryRun.changedFiles,
      plannedFiles: dryRun.plannedFiles,
      wouldChangeFiles: dryRun.wouldChangeFiles,
      wouldCreateFiles: dryRun.wouldCreateFiles,
      writeIntents: dryRun.writeIntents,
      noWriterInvoked: dryRun.noWriterInvoked,
      doesNotClaimWriteSuccess: dryRun.doesNotClaimWriteSuccess,
      failedFiles: dryRun.failedFiles,
      resultSurface: {
        status: dryRun.resultSurface.status,
        failureCategory: dryRun.resultSurface.failureCategory,
        blocker: dryRun.resultSurface.blocker,
        noWriteProof: dryRun.resultSurface.noWriteProof,
      },
      unsupportedCapability: dryRun.unsupportedCapability,
      evidence: dryRun.evidence,
      nextAction: dryRun.nextAction,
    }));
  `
  return run(process.execPath, [
    tsxCliPath,
    '-e',
    script,
    fixtureDir,
    patchPath,
  ], {
    cwd: repoRoot,
    env: {
      HOME: syntheticHome,
      USERPROFILE: syntheticHome,
      PRIVATE_AGENTS_PROVIDER_MODE: 'synthetic',
    },
    timeoutMs: 120000,
  })
}

function formatMultiFilePlanningOutput(dryRunResult, failures) {
  if (!dryRunResult) {
    return [
      'mode=apply-patch-multi-file-update-planning-dry-run',
      'status=blocked',
      'capability=multi-file-update-candidate-no-write',
      'changedFiles=',
      'writeIntents=',
      `failureReason=${failures.join('; ')}`,
    ].join('\n')
  }
  return [
    'mode=apply-patch-multi-file-update-planning-dry-run',
    `status=${dryRunResult.status}`,
    `capability=${dryRunResult.unsupportedCapability?.capability ?? 'missing'}`,
    `blockedReason=${dryRunResult.unsupportedCapability?.blockedReason ?? 'missing'}`,
    `wouldChangeFiles=${(dryRunResult.wouldChangeFiles ?? []).join(',')}`,
    `plannedFiles=${(dryRunResult.plannedFiles ?? []).join(',')}`,
    `changedFiles=${(dryRunResult.changedFiles ?? []).join(',')}`,
    `writeIntents=${(dryRunResult.writeIntents ?? []).join(',')}`,
    `willWrite=${dryRunResult.willWrite}`,
    `noWriterInvoked=${dryRunResult.noWriterInvoked}`,
    `failureCategory=${dryRunResult.resultSurface?.failureCategory ?? 'missing'}`,
    `explanation=${dryRunResult.unsupportedCapability?.explanation ?? ''}`,
    `nextAction=${dryRunResult.nextAction ?? ''}`,
    'no-write planning: multi-file write not enabled',
  ].join('\n')
}

function buildCandidateMetadata(candidateResults) {
  return futureGateCandidates.map((candidate) => {
    const result = candidateResults.find((entry) => entry.capability === candidate.id)
    if (!result) return candidate
    return {
      ...candidate,
      status: result.status === 'PASS' ? 'candidate-pass' : 'candidate-fail',
      dryRun: {
        projectDir: result.projectDir,
        sessionId: result.sessionId,
        changedFiles: result.changedFiles,
        protectedFiles: result.protectedFiles,
        verification: result.verification,
        failureCategory: result.failureCategory,
        failureReason: result.failureReason,
      },
    }
  })
}

function runTurnBoundaryDryRun() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=turn-boundary-dry-run')
  console.log('homeRead=false')
  console.log('real-provider execution skipped')
  console.log('reportWritten=false')

  const cases = [
    {
      name: 'provider-network-mid-turn',
      provider: 'real',
      failureReason: 'turn 1 exited 1',
      output:
        'provider-readiness:network fetch failed while waiting for model turn Authorization: Bearer sk-live-secret',
      expectedCategory: 'provider-readiness',
      expectedStatusDetail: 'provider-network-inconclusive',
      expectedExitCode: 2,
    },
    {
      name: 'provider-auth-mid-turn',
      provider: 'real',
      failureReason: 'turn 1 exited 1',
      output: 'provider-readiness:auth authentication was rejected with api_key=sk-live-secret',
      expectedCategory: 'provider-readiness',
      expectedStatusDetail: 'config-failure',
      expectedExitCode: 3,
    },
    {
      name: 'provider-config-redacted',
      provider: 'real',
      failureReason: 'turn 1 exited 1',
      output:
        'Failed to parse D:/Test/home-sf/.private-agents/config.json: refresh_token=refresh-secret',
      expectedCategory: 'provider-readiness',
      expectedStatusDetail: 'config-failure',
      expectedExitCode: 3,
    },
    {
      name: 'tool-execution-failure',
      provider: 'real',
      failureReason: 'turn 1 exited 1',
      output: 'Tool execution failed: command exited 1',
      expectedCategory: 'task-execution-failure',
      expectedStatusDetail: 'failed',
      expectedExitCode: 1,
    },
    {
      name: 'verification-failed',
      provider: 'real',
      failureReason: 'verification failed: expected marker was not present',
      output: 'Result\nOutcome: stopped\nVerification failed',
      expectedCategory: 'verification-failed',
      expectedStatusDetail: 'failed',
      expectedExitCode: 1,
    },
  ]

  let ok = true
  for (const item of cases) {
    const result = {
      status: 'FAIL',
      provider: item.provider,
      failureCategory: categorizeFailure(item.failureReason, item.output, item.provider),
      failureReason: normalizeFailureReason(item.failureReason, item.output, item.provider),
      outputTail: summarizeOutput(item.output),
    }
    const failureStatus = summarizeResultFailureStatus([result], {
      classifyProviderReadinessFailure,
    })
    const redacted =
      !result.outputTail.includes('sk-live-secret') &&
      !result.outputTail.includes('refresh-secret') &&
      !result.outputTail.includes('.private-agents/config.json')
    const passed =
      result.failureCategory === item.expectedCategory &&
      failureStatus.statusDetail === item.expectedStatusDetail &&
      failureStatus.exitCode === item.expectedExitCode &&
      redacted
    console.log(
      `[${passed ? 'PASS' : 'FAIL'}] ${item.name} category=${result.failureCategory} status=${failureStatus.statusDetail} exit=${failureStatus.exitCode}`,
    )
    ok = ok && passed
  }

  const passStatus = summarizeResultFailureStatus([
    {
      status: 'PASS',
      provider: 'real',
      failureCategory: 'none',
      failureReason: '',
      outputTail: 'Result\nOutcome: success',
    },
  ], {
    classifyProviderReadinessFailure,
  })
  const passOk = passStatus.statusDetail === 'passed' && passStatus.exitCode === 0
  console.log(
    `[${passOk ? 'PASS' : 'FAIL'}] model-turn-success-boundary status=${passStatus.statusDetail} exit=${passStatus.exitCode}`,
  )
  ok = ok && passOk

  process.exit(ok ? 0 : 1)
}

function runTerminalResultSurfaceDryRun() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=terminal-result-surface-dry-run')
  console.log('homeRead=false')
  console.log('real-provider execution skipped')
  console.log('reportWritten=false')

  const cases = [
    {
      name: 'provider-network-terminal-result',
      result: {
        status: 'FAIL',
        provider: 'real',
        failureCategory: 'provider-readiness',
        failureReason: 'provider-readiness:network: provider endpoint was unreachable during this turn',
        outputTail: 'provider-readiness:network fetch failed Authorization: Bearer sk-live-secret',
      },
      expected: ['Outcome: provider-failure', 'Category: provider-readiness', 'Status: provider-network-inconclusive', 'NextAction: Retry when the provider endpoint is reachable'],
      forbidden: ['sk-live-secret', '.private-agents/config.json'],
    },
    {
      name: 'provider-auth-terminal-result',
      result: {
        status: 'FAIL',
        provider: 'real',
        failureCategory: 'provider-readiness',
        failureReason: 'provider-readiness:auth: provider authentication failed during this turn',
        outputTail: 'provider-readiness:auth api_key=sk-live-secret',
      },
      expected: ['Outcome: provider-failure', 'Category: provider-readiness', 'Status: config-failure', 'NextAction: Fix provider configuration or authentication'],
      forbidden: ['sk-live-secret'],
    },
    {
      name: 'model-tool-failure-terminal-result',
      result: {
        status: 'FAIL',
        provider: 'real',
        failureCategory: 'task-execution-failure',
        failureReason: 'Tool execution failed: command exited 1',
        outputTail: 'Tool execution failed: command exited 1',
      },
      expected: ['Outcome: stopped', 'Category: task-execution-failure', 'Status: failed', 'NextAction: Inspect the model/tool execution output'],
      forbidden: ['sk-live-secret'],
    },
    {
      name: 'verification-stopped-terminal-result',
      result: {
        status: 'FAIL',
        provider: 'real',
        failureCategory: 'verification-failed',
        failureReason: 'verification failed: expected marker was not present',
        outputTail: 'Result\nOutcome: stopped\nVerification failed',
      },
      expected: ['Outcome: stopped', 'Category: verification-failed', 'Status: failed', 'NextAction: Repair the verification failure'],
      forbidden: [],
    },
  ]

  let ok = true
  for (const item of cases) {
    const line = renderTerminalResultSurface(item.result)
    const hasExpected = item.expected.every((marker) => line.includes(marker))
    const avoidsForbidden = item.forbidden.every((marker) => !line.includes(marker))
    const passed = hasExpected && avoidsForbidden
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${item.name} - ${line}`)
    ok = ok && passed
  }

  process.exit(ok ? 0 : 1)
}

function runFailureFollowupContextDryRun() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=failure-followup-context-dry-run')
  console.log('homeRead=false')
  console.log('real-provider execution skipped')
  console.log('followupExecution=false')
  console.log('reportWritten=false')

  const cases = [
    {
      name: 'provider-network-followup-context',
      result: {
        status: 'FAIL',
        provider: 'real',
        failureCategory: 'provider-readiness',
        failureReason: 'provider-readiness:network: provider endpoint was unreachable during this turn',
        outputTail: 'provider-readiness:network fetch failed Authorization: Bearer sk-live-secret',
      },
      followupPrompt: 'retry the same task after network recovers',
      expected: [
        'previousOutcome=provider-failure',
        'blocker=provider-readiness',
        'status=provider-network-inconclusive',
        'reason=provider-readiness:network',
        'DoNext=Retry when the provider endpoint is reachable',
      ],
      forbidden: ['sk-live-secret', '.private-agents/config.json'],
    },
    {
      name: 'provider-auth-followup-context',
      result: {
        status: 'FAIL',
        provider: 'real',
        failureCategory: 'provider-readiness',
        failureReason: 'provider-readiness:auth: provider authentication failed during this turn',
        outputTail: 'provider-readiness:auth api_key=sk-live-secret',
      },
      followupPrompt: 'continue once I fix credentials',
      expected: [
        'previousOutcome=provider-failure',
        'blocker=provider-readiness',
        'status=config-failure',
        'reason=provider-readiness:auth',
        'DoNext=Fix provider configuration or authentication',
      ],
      forbidden: ['sk-live-secret'],
    },
    {
      name: 'tool-failure-followup-context',
      result: {
        status: 'FAIL',
        provider: 'real',
        failureCategory: 'task-execution-failure',
        failureReason: 'Tool execution failed: command exited 1',
        outputTail: 'Tool execution failed: command exited 1',
      },
      followupPrompt: 'try the safe command instead',
      expected: [
        'previousOutcome=stopped',
        'blocker=task-execution-failure',
        'status=failed',
        'reason=Tool execution failed',
        'DoNext=Inspect the model/tool execution output',
      ],
      forbidden: [],
    },
    {
      name: 'verification-followup-context',
      result: {
        status: 'FAIL',
        provider: 'real',
        failureCategory: 'verification-failed',
        failureReason: 'verification failed: expected marker was not present',
        outputTail: 'Result\nOutcome: stopped\nVerification failed',
      },
      followupPrompt: 'repair the missing marker',
      expected: [
        'previousOutcome=stopped',
        'blocker=verification-failed',
        'status=failed',
        'reason=verification failed',
        'DoNext=Repair the verification failure',
      ],
      forbidden: [],
    },
  ]

  let ok = true
  for (const item of cases) {
    const context = buildFailureFollowupContext(item.result, item.followupPrompt)
    const hasExpected = item.expected.every((marker) => context.contextLine.includes(marker))
    const avoidsForbidden = item.forbidden.every((marker) => !context.contextLine.includes(marker))
    const passed = hasExpected && avoidsForbidden
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${item.name} - ${context.contextLine}`)
    ok = ok && passed
  }

  process.exit(ok ? 0 : 1)
}

function runToolExecutionPlanningDryRun() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=tool-execution-planning-dry-run')
  console.log('homeRead=false')
  console.log('real-provider execution skipped')
  console.log('toolExecution=false')
  console.log('reportWritten=false')

  const cases = [
    {
      name: 'provider-failure-before-tool',
      plan: {
        providerStatus: 'provider-network-inconclusive',
        tool: 'bash',
        command: 'node --version',
        approval: 'explicit-allow',
        projectDir: path.join(testRoot, 'pca-tool-planning-provider-gated'),
      },
      expectedDecision: 'provider-gated',
      expectedExecute: false,
    },
    {
      name: 'read-only-synthetic-fixture',
      plan: {
        providerStatus: 'ready',
        tool: 'read-file',
        targetPath: path.join(testRoot, 'pca-tool-planning-read', 'fixture.txt'),
        writes: false,
      },
      expectedDecision: 'allow-read-only',
      expectedExecute: true,
    },
    {
      name: 'benign-command-needs-approval',
      plan: {
        providerStatus: 'ready',
        tool: 'bash',
        command: 'node --version',
        approval: 'not-requested',
        projectDir: path.join(testRoot, 'pca-tool-planning-command'),
      },
      expectedDecision: 'approval-required',
      expectedExecute: false,
    },
    {
      name: 'benign-command-explicit-allow',
      plan: {
        providerStatus: 'ready',
        tool: 'bash',
        command: 'node --version',
        approval: 'explicit-allow',
        projectDir: path.join(testRoot, 'pca-tool-planning-command'),
      },
      expectedDecision: 'allow-benign-command',
      expectedExecute: true,
    },
    {
      name: 'dangerous-command-blocked',
      plan: {
        providerStatus: 'ready',
        tool: 'bash',
        command: 'del /s /q D:\\Test\\home-sf',
        approval: 'explicit-allow',
        projectDir: path.join(testRoot, 'pca-tool-planning-command'),
      },
      expectedDecision: 'blocked-command-not-allowlisted',
      expectedExecute: false,
    },
    {
      name: 'real-home-write-blocked',
      plan: {
        providerStatus: 'ready',
        tool: 'write-file',
        targetPath: realHome
          ? path.join(realHome, '.private-agents', 'config.json')
          : 'D:/Test/home-sf/.private-agents/config.json',
        writes: true,
      },
      expectedDecision: 'blocked-real-home',
      expectedExecute: false,
    },
    {
      name: 'workspace-write-outside-test-blocked',
      plan: {
        providerStatus: 'ready',
        tool: 'write-file',
        targetPath: 'D:/Users/project/src/app.js',
        writes: true,
      },
      expectedDecision: 'blocked-dangerous-write',
      expectedExecute: false,
    },
  ]

  let ok = true
  for (const item of cases) {
    const audit = buildToolExecutionPlanningAudit(item.plan)
    const line = `decision=${audit.decision} execute=${audit.execute} reason=${audit.reason} nextAction=${audit.nextAction}`
    const passed =
      audit.decision === item.expectedDecision &&
      audit.execute === item.expectedExecute &&
      !line.includes('.private-agents/config.json')
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${item.name} - ${line}`)
    ok = ok && passed
  }

  process.exit(ok ? 0 : 1)
}

function printHelp() {
  console.log('Usage: node scripts/verify-real-user-capabilities.mjs [options]')
  console.log('')
  console.log('Default mode runs --tier=mvp: existing-file, single-file, selected-workspace update only.')
  console.log('Tier selection:')
  console.log('  --tier=mvp        Default MVP/dogfood gate. Synthetic selected-workspace update only.')
  console.log('  --tier=candidate  Explicit candidate checks; may require real provider.')
  console.log('  --tier=release    Metadata for release-only gates; use explicit release commands for execution.')
  console.log('  --tier=backlog    Unsupported/future capability cases retained outside MVP.')
  console.log('  --tier=all        Explicitly select all executable tier cases.')
  console.log('  --case=<id>       Explicitly select one case by id; real-provider cases remain opt-in.')
  console.log('  --suite=candidate-mutation')
  console.log('                     Explicit dogfood gate for closed candidate mutation smokes; synthetic cases run by default.')
  console.log('  --suite=candidate-mutation --include-real')
  console.log('                     Also run opt-in real-provider mutation smokes; dry-run/list still never touch the provider.')
  console.log('  --list            Print all case metadata and skip reasons without execution.')
  console.log('  --dry-run         Print selected/skipped cases without touching provider or fixtures.')
  console.log('Safe dry-run options do not execute real provider calls:')
  console.log('  --turn-boundary-dry-run')
  console.log('  --terminal-result-surface-dry-run')
  console.log('  --tool-execution-planning-dry-run')
  console.log('  --failure-followup-context-dry-run')
  console.log('  --real-readonly-coding-dry-run')
  console.log('  --real-readonly-coding-preflight-self-test')
  console.log('  --real-readonly-coding-failure-attribution-self-test')
  console.log('  --real-coding-flow-dry-run')
  console.log('  --real-coding-flow-failure-attribution-self-test')
  console.log('  --real-coding-flow-followup-context-self-test')
  console.log('  --real-coding-flow-followup-smoke-dry-run')
  console.log('  --real-coding-flow-diagnostics-self-test')
  console.log('  --real-coding-flow-audit-isolation-self-test')
  console.log('  --real-apply-patch-dry-run-smoke-dry-run')
  console.log('  --route03-two-file-cli-path-evidence')
  console.log('    Deterministic CLI --print evidence for the exactly-two-file candidate mutation route; no real provider.')
  console.log('  --route08-unsupported-patch-e2e')
  console.log('    Deterministic CLI --print evidence that unsupported real-model-like patch output stops without success; no real provider.')
  console.log('')
  console.log('Explicit opt-in real-provider checks:')
  console.log(`  --case=${realSingleFileUpdateCaseId}`)
  console.log('    Opt-in only; runs one real-provider model turn and writes only one existing file in an isolated selected workspace.')
  console.log('    Excluded from default MVP verification; does not enable create/add/delete/move/multi-file/rollback or broader apply_patch.')
  console.log(`  --case=${realSingleFileCreateCaseId}`)
  console.log('    Opt-in only; runs one real-provider model turn and creates only one new file in an isolated selected workspace.')
  console.log('    Excluded from default MVP verification; does not enable multi-file/delete/move/rollback, parent directory creation, or broader apply_patch.')
  console.log(`  --case=${realTwoFileUpdateCaseId}`)
  console.log('    Opt-in only; runs one real-provider model turn and writes exactly two existing files in an isolated selected workspace.')
  console.log('    Excluded from default MVP verification; does not enable 3+ files, create/add/delete/move/rollback, or broader apply_patch.')
  console.log('  --real-readonly-coding-preflight')
  console.log('    Opt-in only; readiness preflight only; no model turn.')
  console.log('  --real-readonly-coding-smoke')
  console.log('    Opt-in only; runs one real-provider read-only model turn against a temporary fixture.')
  console.log('    Excluded from default verification; does not edit/write/mutate by design.')
  console.log('    External network/auth/model failures are attribution outcomes, not automatic product regressions.')
  console.log('    Real provider secrets/config must be redacted and must not be printed.')
  console.log('  --real-coding-flow-smoke')
  console.log('    Opt-in only; runs one real-provider model turn against an isolated writable fixture.')
  console.log('    Excluded from default verification; only note.txt may change and the repository must stay clean.')
  console.log('  --real-coding-flow-followup-smoke')
  console.log('    Opt-in only; runs one real-provider response turn against synthetic stopped/failure context.')
  console.log('    Excluded from default verification; must not modify the isolated fixture.')
  console.log('  --real-apply-patch-dry-run-smoke')
  console.log('    Opt-in only; runs one real-provider model turn to produce a single-file apply_patch preview.')
  console.log('    Excluded from default verification; fixture and repository must remain unchanged.')
  console.log('    The generated patch is routed through the explicit opt-in dry-run route only; writer remains unreachable.')
  console.log('  --real-apply-patch-runtime-no-write-smoke')
  console.log('    Opt-in only; routes one real-provider apply_patch preview through the runtime no-write surface.')
  console.log('    Excluded from default verification; fixture and repository must remain unchanged and writer remains unreachable.')
  console.log('  --real-apply-patch-write-fixture-smoke')
  console.log('    Opt-in only; runs one real-provider model turn to produce a single-file apply_patch preview.')
  console.log('    The generated patch may write only the isolated temporary fixture target after explicit approved-for-write.')
  console.log('    Excluded from default verification; the production writer and repository must remain untouched.')
  console.log('  --real-apply-patch-guarded-write-smoke')
  console.log('    Opt-in only; routes one real-provider apply_patch preview through the guarded production-write candidate lane.')
  console.log('    The generated patch may write only the isolated temporary workspace target.')
  console.log('    Excluded from default verification; default production apply_patch rejection must remain unchanged.')
  console.log('  --real-apply-patch-guarded-route-smoke')
  console.log('    Opt-in only; routes one real-provider apply_patch preview through the guarded production route.')
  console.log('    The generated patch may write only the isolated temporary workspace target.')
  console.log('    Excluded from default verification; default production apply_patch rejection must remain unchanged.')
  console.log('  --real-apply-patch-workspace-write-smoke')
  console.log('    Opt-in only; routes one real-provider apply_patch preview through the CLI workspace write entrypoint.')
  console.log('    The generated patch may write only the isolated test workspace target after explicit approval.')
  console.log('    Excluded from default verification; real provider config is redacted and the repository must remain clean.')
}

function renderReadonlyPreflightNotice(options = {}) {
  console.log(`real-provider-readonly-${options.smoke ? 'smoke' : 'preflight'}=opt-in`)
  console.log(`modelTurn=${options.modelTurn ? 'true' : 'false'}`)
  console.log(`readOnlyFixture=${options.readOnlyFixture ? 'true' : 'false'}`)
  console.log('real-provider failure attribution: external network/auth/model failures are not automatic product regressions')
  console.log('real provider secrets/config must be redacted and must not be printed')
}

function buildReadonlyPreflightStatus(preflight) {
  if (preflight.ok) {
    return {
      status: 'PASS',
      statusDetail: 'ready',
      exitCode: 0,
      failureCategory: 'none',
      failureReason: '',
    }
  }
  if (preflight.status === 'provider-network-inconclusive') {
    return {
      status: 'PROVIDER_NETWORK',
      statusDetail: 'provider-network-inconclusive',
      exitCode: 2,
      failureCategory: 'provider-readiness',
      failureReason: 'provider-network-inconclusive: provider endpoint remained unreachable during readiness preflight',
    }
  }
  if (preflight.status === 'config-failure') {
    return {
      status: 'CONFIG',
      statusDetail: 'config-failure',
      exitCode: 3,
      failureCategory: 'provider-readiness',
      failureReason: 'config-failure: fix provider configuration or authentication before running read-only smoke',
    }
  }
  return {
    status: 'FAIL',
    statusDetail: preflight.status ?? 'provider-readiness-failed',
    exitCode: 1,
    failureCategory: 'provider-readiness',
    failureReason: 'provider-readiness failed before read-only model turn',
  }
}

function runRealReadonlyCodingPreflightSelfTest() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-readonly-coding-preflight-self-test')
  console.log('homeRead=false')
  console.log('real-provider execution skipped')
  console.log('modelTurn=false')
  console.log('reportWritten=false')

  const cases = [
    {
      name: 'ready',
      preflight: { ok: true, status: 'pass' },
      expected: { status: 'PASS', exitCode: 0 },
    },
    {
      name: 'network',
      preflight: { ok: false, status: 'provider-network-inconclusive' },
      expected: { status: 'PROVIDER_NETWORK', exitCode: 2 },
    },
    {
      name: 'config',
      preflight: { ok: false, status: 'config-failure' },
      expected: { status: 'CONFIG', exitCode: 3 },
    },
    {
      name: 'unknown',
      preflight: { ok: false, status: 'provider-readiness-failed' },
      expected: { status: 'FAIL', exitCode: 1 },
    },
  ]

  let ok = true
  for (const item of cases) {
    const status = buildReadonlyPreflightStatus(item.preflight)
    const passed =
      status.status === item.expected.status &&
      status.exitCode === item.expected.exitCode &&
      status.failureReason.indexOf('sk-') === -1 &&
      status.failureReason.indexOf('.private-agents/config.json') === -1
    console.log(`[${passed ? 'PASS' : 'FAIL'}] preflight-${item.name} status=${status.status} exit=${status.exitCode}`)
    ok = ok && passed
  }

  process.exit(ok ? 0 : 1)
}

function runRealReadonlyCodingFailureAttributionSelfTest() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-readonly-coding-failure-attribution-self-test')
  console.log('homeRead=false')
  console.log('real-provider execution skipped')
  console.log('modelTurn=false')
  console.log('reportWritten=false')

  const cases = [
    {
      name: 'network-mid-turn',
      result: {
        code: 0,
        timedOut: false,
        output: [
          'Provider readiness failed (provider-readiness:network): Unable to reach the OpenAI-compatible endpoint.',
          'Authorization: Bearer sk-live-secret-123456789',
          'D:/Test/home-sf/.private-agents/config.json',
        ].join('\n'),
      },
      expected: {
        status: 'PROVIDER_NETWORK',
        statusDetail: 'provider-network-inconclusive',
        exitCode: 2,
        nextAction: 'Retry when the provider endpoint is reachable',
      },
    },
    {
      name: 'auth-mid-turn',
      result: {
        code: 1,
        timedOut: false,
        output: 'provider-readiness:auth invalid api key api_key=sk-live-secret-123456789',
      },
      expected: {
        status: 'CONFIG',
        statusDetail: 'config-failure',
        exitCode: 3,
        nextAction: 'Fix provider configuration or authentication',
      },
    },
    {
      name: 'model-mid-turn',
      result: {
        code: 1,
        timedOut: false,
        output: 'provider-readiness:model unsupported model or rate limit 429 for requested model',
      },
      expected: {
        status: 'FAIL',
        statusDetail: 'provider-model-failed',
        exitCode: 1,
        nextAction: 'Select an available provider model',
      },
    },
    {
      name: 'timeout-mid-turn',
      result: {
        code: -1,
        timedOut: true,
        output: 'read-only model turn timed out',
      },
      expected: {
        status: 'PROVIDER_NETWORK',
        statusDetail: 'provider-network-inconclusive',
        exitCode: 2,
        nextAction: 'Retry when the provider endpoint is reachable',
      },
    },
  ]

  let ok = true
  for (const item of cases) {
    const redaction = redactAndAssertReadonlyProviderOutput(item.result.output)
    const status = buildReadonlySmokeFailureStatus(item.result, redaction.redacted, redaction)
    const surface = buildTerminalResultSurface({
      status: status.status,
      provider: 'real',
      failureCategory: status.failureCategory,
      failureReason: status.failureReason,
      outputTail: redaction.redacted,
    })
    const followup = buildFailureFollowupContext({
      status: status.status,
      provider: 'real',
      failureCategory: status.failureCategory,
      failureReason: status.failureReason,
      outputTail: redaction.redacted,
    }, 'retry after provider recovers with api_key=sk-live-secret-123456789')
    const combined = [
      status.status,
      status.statusDetail,
      status.failureReason,
      surface.nextAction,
      surface.outputTail,
      followup.contextLine,
    ].join('\n')
    const safe = redactAndAssertReadonlyProviderOutput(combined)
    const passed =
      status.status === item.expected.status &&
      status.statusDetail === item.expected.statusDetail &&
      status.exitCode === item.expected.exitCode &&
      surface.nextAction.includes(item.expected.nextAction) &&
      followup.contextLine.includes(`status=${item.expected.statusDetail}`) &&
      safe.ok
    console.log(
      `[${passed ? 'PASS' : 'FAIL'}] readonly-failure-${item.name} status=${status.statusDetail} exit=${status.exitCode} redaction=${safe.ok ? 'pass' : 'fail'}`,
    )
    if (!passed && safe.leaks.length > 0) {
      console.log(`leaks=${safe.leaks.join(',')}`)
    }
    ok = ok && passed
  }

  process.exit(ok ? 0 : 1)
}

async function runRealReadonlyCodingPreflight() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-readonly-coding-preflight')
  renderReadonlyPreflightNotice()
  const preflight = await runProviderReadinessPreflight()
  const status = buildReadonlyPreflightStatus(preflight)
  console.log(`[${status.status}] real-readonly-coding-preflight status=${status.statusDetail}`)
  if (preflight.outputTail) {
    console.log(preflight.outputTail)
  }
  process.exit(status.exitCode)
}

function buildReadonlySmokeFailureStatus(result, output, redaction) {
  if (result.timedOut) {
    return {
      status: 'PROVIDER_NETWORK',
      statusDetail: 'provider-network-inconclusive',
      exitCode: 2,
      failureCategory: 'provider-readiness',
      failureReason: 'provider-network-inconclusive: read-only model turn timed out',
    }
  }

  const providerFailure = classifyProviderReadinessFailure(
    `read-only model turn exited ${result.code}`,
    output,
    'real',
  )
  if (providerFailure) {
    return {
      status: providerFailure.exitCode === 2 ? 'PROVIDER_NETWORK' : providerFailure.exitCode === 3 ? 'CONFIG' : 'FAIL',
      statusDetail: providerFailure.statusDetail,
      exitCode: providerFailure.exitCode,
      failureCategory: 'provider-readiness',
      failureReason: providerFailure.reason,
    }
  }

  if (!redaction.ok) {
    return {
      status: 'FAIL',
      statusDetail: 'redaction-leak',
      exitCode: 1,
      failureCategory: 'task-execution-failure',
      failureReason: `redaction leak detected: ${redaction.leaks.join(',') || 'unknown'}`,
    }
  }

  return {
    status: 'FAIL',
    statusDetail: 'read-only-smoke-failed',
    exitCode: 1,
    failureCategory: categorizeFailure(`read-only model turn exited ${result.code}`, output, 'real'),
    failureReason: `read-only model turn exited ${result.code}`,
  }
}

function renderCodingFlowPreflightNotice(options = {}) {
  console.log('real-provider-coding-flow-smoke=opt-in')
  console.log(`modelTurn=${options.modelTurn ? 'true' : 'false'}`)
  console.log(`writableFixture=${options.writableFixture ? 'true' : 'false'}`)
  console.log('real-provider failure attribution: external network/auth/model failures are not automatic product regressions')
  console.log('real provider secrets/config must be redacted and must not be printed')
}

function buildCodingFlowPreflightStatus(preflight) {
  const status = buildReadonlyPreflightStatus(preflight)
  if (status.failureReason.includes('read-only')) {
    return {
      ...status,
      failureReason: status.failureReason.replace('read-only smoke', 'coding flow smoke'),
    }
  }
  return status
}

function codingFlowFailureCategoryForStatus(statusDetail, fallback = 'product runtime regression') {
  if (statusDetail === 'provider-network-inconclusive') return 'provider-network-inconclusive'
  if (statusDetail === 'config-failure') return 'auth/config failure'
  if (statusDetail === 'provider-model-failed') return 'model/quota/rate-limit failure'
  if (statusDetail === 'redaction-failure') return 'redaction failure'
  if (statusDetail === 'no-mutation-guard-failure') return 'no-mutation guard failure'
  if (statusDetail === 'real-repo-mutation-leak') return 'real repo mutation leak'
  if (statusDetail === 'terminal-result-missing') return 'terminal result missing'
  if (statusDetail === 'changed-files-wrong') return 'changedFiles wrong'
  if (statusDetail === 'verification-failed') return 'verification failed'
  return fallback
}

function nextActionForCodingFlowFailure(failureCategory, statusDetail) {
  if (failureCategory === 'provider-network-inconclusive') {
    return 'Retry the same isolated fixture task when the provider endpoint is reachable.'
  }
  if (failureCategory === 'auth/config failure') {
    return 'Fix provider configuration or authentication outside this run, then retry the same isolated fixture task.'
  }
  if (failureCategory === 'model/quota/rate-limit failure') {
    return 'Select an available model or wait for quota/rate-limit recovery, then retry the same isolated fixture task.'
  }
  if (failureCategory === 'fixture setup failure') {
    return 'Fix fixture setup under the configured test root, then rerun the focused coding flow smoke.'
  }
  if (failureCategory === 'no-mutation guard failure') {
    return 'Start from a clean repository state, then rerun the focused coding flow smoke.'
  }
  if (failureCategory === 'real repo mutation leak') {
    return 'Inspect and restore repository changes before retrying; do not continue from a mutated target repo.'
  }
  if (failureCategory === 'redaction failure') {
    return 'Fix redaction before surfacing or retrying this failure context.'
  }
  if (failureCategory === 'terminal result missing') {
    return 'Repair the terminal result surface, then rerun the focused coding flow smoke.'
  }
  if (failureCategory === 'changedFiles wrong') {
    return 'Inspect fixture changed files and retry with only note.txt editable.'
  }
  if (failureCategory === 'verification failed') {
    return 'Repair the fixture verification failure, then retry the same isolated fixture task.'
  }
  if (failureCategory === 'RTK/environment issue') {
    return 'Fix the local RTK or execution environment issue, then rerun the focused check.'
  }
  if (statusDetail === 'passed') {
    return 'Continue with the next task.'
  }
  return 'Inspect the coding flow runtime failure, fix the product issue, then retry the focused smoke.'
}

function buildCodingFlowContractFields({
  failureCategory,
  statusDetail,
  changedFiles = [],
  verification = 'blocked',
  redaction = { ok: true, leaks: [] },
  repoBefore,
  repoAfter,
  output = '',
} = {}) {
  const repositoryClean =
    Boolean(repoBefore?.ok) &&
    !repoBefore?.status &&
    (repoAfter ? Boolean(repoAfter.ok) && !repoAfter.status : true)
  return {
    repositoryClean,
    terminalResultVisible: /(^|\r?\n)Result\s*(\r?\n|$)/.test(String(output ?? '')),
    changedFiles: [...changedFiles].sort(),
    verification,
    redaction: {
      ok: Boolean(redaction.ok),
      leaks: [...(redaction.leaks ?? [])],
    },
    nextAction: nextActionForCodingFlowFailure(
      failureCategory ?? 'product runtime regression',
      statusDetail ?? statusDetailForCodingFlowFailureCategory(failureCategory),
    ),
  }
}

function buildCodingFlowDiagnostics({
  result = { code: undefined, timedOut: false, stdout: '', stderr: '', output: '' },
  redactedOutput = '',
  comparison = { added: [], removed: [], changed: [] },
  expected = { observed: [], expected: ['note.txt'], protectedChanged: [] },
  noteStatusBefore = 'missing',
  noteStatusAfter = 'missing',
  runtimeHome,
  auditLogPath,
  repoAfter,
  auditResidueCleaned = false,
  prompt = '',
  failureCategory = 'product runtime regression',
  statusDetail = 'product-runtime-regression',
  output = redactedOutput,
} = {}) {
  const safeOutput = String(output ?? '')
  const safeStdout = redactProviderOutput(result.stdout ?? '')
  const safeStderr = redactProviderOutput(result.stderr ?? '')
  const outputMarkers = detectCodingFlowOutputMarkers(safeOutput)
  const repoAwareSummaryDetected = /(^|\r?\n)Repo-aware summary(\r?\n|$)/.test(safeOutput)
  return {
    routing: {
      cliCommandKind: 'print-non-interactive',
      cwdKind: 'ts-shell-root',
      projectKind: 'isolated-fixture',
      promptBytes: Buffer.byteLength(String(prompt ?? ''), 'utf8'),
      promptIntentHint: inferCodingFlowPromptIntentHint(prompt),
      repoAwareSummaryDetected,
      enteredSessionRuntime: !repoAwareSummaryDetected,
      codingResultPresent: outputMarkers.hasActionResult,
      resultBlockPresent: outputMarkers.hasResultBlock,
      toolExecutionMarkerPresent: outputMarkers.hasToolExecutionMarker,
    },
    process: {
      modelTurnExitCode: typeof result.code === 'number' ? result.code : null,
      modelTurnTimedOut: Boolean(result.timedOut),
      modelTurnOutputBytes: Buffer.byteLength(String(result.output ?? ''), 'utf8'),
      stdoutTailRedacted: summarizeOutput(safeStdout),
      stderrTailRedacted: summarizeOutput(safeStderr),
      combinedOutputTailRedacted: summarizeOutput(safeOutput),
      outputMarkers,
    },
    fixture: {
      fixtureChangedFiles: [...(expected.observed ?? [])].sort(),
      expectedChangedFiles: [...(expected.expected ?? ['note.txt'])].sort(),
      noteStatusBefore,
      noteStatusAfter,
      protectedChangedFiles: [...(expected.protectedChanged ?? [])].sort(),
      addedFiles: [...(comparison.added ?? [])].sort(),
      removedFiles: [...(comparison.removed ?? [])].sort(),
    },
    runtime: {
      runtimeHomeKind: 'isolated-test-root',
      runtimeHomeState: inspectCodingFlowRuntimeHome(runtimeHome),
      realProviderHomeUsedForRuntime: false,
      configHomeKind: 'explicit-real-provider-home',
    },
    auditIsolation: inspectCodingFlowAuditIsolation({
      auditLogPath,
      repoAfter,
      auditResidueCleaned,
    }),
    mutation: buildCodingFlowMutationDiagnostics(safeOutput, {
      comparison,
      expected,
      noteStatusBefore,
      noteStatusAfter,
      statusDetail,
    }),
    classification: {
      failureStage: deriveCodingFlowFailureStage({
        failureCategory,
        statusDetail,
        output: safeOutput,
        expected,
        noteStatusAfter,
      }),
      failureCategory,
      statusDetail,
      nextAction: nextActionForCodingFlowFailure(failureCategory, statusDetail),
    },
  }
}

function inspectCodingFlowAuditIsolation({
  auditLogPath,
  repoAfter,
  auditResidueCleaned = false,
} = {}) {
  return inspectAuditIsolation({
    auditLogPath,
    repoAfter,
    auditResidueCleaned,
    isPathInsideTestRoot,
  })
}

function detectLiteralReplaceFieldsFromOutput(output) {
  const normalized = String(output ?? '')
  const explicitFrom = /\b(?:replaceFrom|fromText|source text|current source text)\b/i.test(normalized)
  const explicitTo = /\b(?:replaceTo|toText|replacement text|new text)\b/i.test(normalized)
  const replaceSummary = /\breplaced\s+[`"'][\s\S]+?[`"']\s+with\s+[`"'][\s\S]+?[`"']/i.test(normalized)
  const replaceDirective = /\breplace\s+[`"'][\s\S]+?[`"']\s+with\s+[`"'][\s\S]+?[`"']/i.test(normalized)
  return {
    replaceFromPresent: explicitFrom || replaceSummary || replaceDirective,
    replaceToPresent: explicitTo || replaceSummary || replaceDirective,
    source: explicitFrom || explicitTo || replaceSummary || replaceDirective
      ? 'redacted-output-summary'
      : 'none',
  }
}

function deriveStructuredMutationDiagnosticSource({
  actionSequence = [],
  expected = { observed: [] },
  noteStatusBefore = 'missing',
  noteStatusAfter = 'missing',
  patchFailureCode = 'none',
  statusDetail = 'product-runtime-regression',
} = {}) {
  const changedFiles = [...(expected.observed ?? [])]
  const structuredSuccess =
    statusDetail === 'passed' &&
    patchFailureCode === 'none' &&
    actionSequence.includes('edit') &&
    changedFiles.includes('note.txt') &&
    noteStatusBefore === 'draft' &&
    noteStatusAfter === 'ready'

  if (structuredSuccess) {
    return 'structured-success-no-literal-replace'
  }
  if (actionSequence.length > 0 || changedFiles.length > 0 || patchFailureCode !== 'none') {
    return 'structured-result'
  }
  return 'output-tail-fallback'
}

function buildCodingFlowMutationDiagnostics(output, {
  expected = { observed: [] },
  noteStatusBefore = 'missing',
  noteStatusAfter = 'missing',
  statusDetail = 'product-runtime-regression',
} = {}) {
  const normalized = String(output ?? '')
  const taskKind = normalized.match(/-\s*Task:\s*([^\r\n]+)/i)?.[1]?.trim() ?? 'unknown'
  const failedFileReason =
    normalized.match(/-\s*Failure reason:\s*([^\r\n]+)/i)?.[1]?.trim() ??
    normalized.match(/-\s*Failed files:\s*([^\r\n]+)/i)?.[1]?.trim() ??
    ''
  const actionSummary = normalized.match(/-\s*Actions:\s*([^\r\n]+)/i)?.[1]?.trim() ?? ''
  const actionSequence = actionSummary
    ? actionSummary
        .split(',')
        .map((entry) => entry.replace(/\([^)]*\)/g, '').trim())
        .filter(Boolean)
    : []
  const targetFile =
    normalized.match(/-\s*Read files:\s*([^\r\n,]+)/i)?.[1]?.trim() ??
    normalized.match(/-\s*Changed files:\s*([^\r\n,]+)/i)?.[1]?.trim() ??
    normalized.match(/-\s*Unchanged attempted files:\s*([^\r\n,]+)/i)?.[1]?.trim() ??
    normalized.match(/-\s*Failed files:\s*([^\s,(]+)/i)?.[1]?.trim() ??
    'unknown'
  const patchFailureCode =
    normalized.match(/\b(patch-from-not-found|patch-ambiguous|edit-transform-unclear|edit-target-missing)\b/i)?.[1]?.toLowerCase() ??
    'none'
  const outputReplaceFields = detectLiteralReplaceFieldsFromOutput(normalized)
  const diagnosticSource = deriveStructuredMutationDiagnosticSource({
    actionSequence,
    expected,
    noteStatusBefore,
    noteStatusAfter,
    patchFailureCode,
    statusDetail,
  })
  const structuredSuccessWithoutLiteralFields =
    diagnosticSource === 'structured-success-no-literal-replace' &&
    outputReplaceFields.source === 'none'

  return {
    taskKind,
    actionSequence,
    targetFile,
    mutationInstructionPresent: !/mutation instruction missing/i.test(normalized),
    replaceFromPresent: structuredSuccessWithoutLiteralFields ? null : outputReplaceFields.replaceFromPresent,
    replaceToPresent: structuredSuccessWithoutLiteralFields ? null : outputReplaceFields.replaceToPresent,
    replaceFieldSource: outputReplaceFields.source,
    diagnosticSource,
    patchFailureCode,
    failedFileReason: failedFileReason ? summarizeOutput(failedFileReason) : '',
    modelTextTailRedacted: summarizeOutput(normalized),
  }
}

function inferCodingFlowPromptIntentHint(prompt) {
  const normalized = String(prompt ?? '').toLowerCase()
  if (/\bnote\.txt\b/.test(normalized) && /\b(edit|write|change|replace|update|modify)\b/.test(normalized)) {
    return 'single-file-edit'
  }
  if (/\b(edit|write|change|replace|update|modify)\b/.test(normalized)) {
    return 'mutation'
  }
  return 'unknown'
}

function detectCodingFlowOutputMarkers(output) {
  const normalized = String(output ?? '')
  return {
    hasResultBlock: /(^|\r?\n)Result\s*(\r?\n|$)/.test(normalized),
    hasActionResult: /Action result/i.test(normalized),
    hasChangedFilesLine: /-\s*(Changed|Changed files):/i.test(normalized),
    hasVerificationLine: /Verification:/i.test(normalized) || /verification passed/i.test(normalized),
    hasProviderReadinessMarker: hasExplicitProviderReadinessMarker(normalized),
    hasPermissionPromptMarker: /permission|approval|approve|deny|allow-once/i.test(normalized),
    hasToolExecutionMarker: /tool|edit|write|patch|changedFiles/i.test(normalized),
  }
}

function inspectCodingFlowRuntimeHome(runtimeHome) {
  if (!runtimeHome) {
    return {
      existsAfterTurn: false,
      privateAgentsDirCreated: false,
      sessionArtifactCount: 0,
    }
  }

  assertSafeCodingFlowRuntimeHome(runtimeHome)
  const privateAgentsDir = path.join(runtimeHome, '.private-agents')
  return {
    existsAfterTurn: fs.existsSync(runtimeHome),
    privateAgentsDirCreated: fs.existsSync(privateAgentsDir),
    sessionArtifactCount: countFilesUnder(path.join(privateAgentsDir, 'sessions'), 200),
  }
}

function countFilesUnder(root, limit) {
  if (!fs.existsSync(root)) return 0
  let count = 0
  const visit = (directory) => {
    if (count >= limit) return
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (count >= limit) return
      const absolutePath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(absolutePath)
      } else {
        count += 1
      }
    }
  }
  visit(root)
  return count
}

function deriveCodingFlowFailureStage({
  failureCategory,
  statusDetail,
  output,
  expected = {},
  noteStatusAfter,
}) {
  if (
    statusDetail === 'config-failure' ||
    statusDetail === 'provider-network-inconclusive' ||
    statusDetail === 'provider-model-failed' ||
    String(failureCategory ?? '').includes('provider') ||
    hasExplicitProviderReadinessMarker(output)
  ) {
    return 'model-turn'
  }
  if (failureCategory === 'terminal result missing') {
    return 'terminal-surface'
  }
  if (
    failureCategory === 'changedFiles wrong' ||
    (expected.observed ?? []).join(',') !== (expected.expected ?? ['note.txt']).join(',')
  ) {
    return 'mutation-assertion'
  }
  if (failureCategory === 'verification failed' || noteStatusAfter !== 'ready') {
    return 'verification-assertion'
  }
  return 'model-turn'
}

function createIsolatedCodingFlowRuntimeHome() {
  const runtimeHome = getRealCodingFlowRuntimeHome(runId)
  assertSafeCodingFlowRuntimeHome(runtimeHome)
  fs.rmSync(runtimeHome, { recursive: true, force: true })
  fs.mkdirSync(runtimeHome, { recursive: true })
  return runtimeHome
}

function cleanupIsolatedCodingFlowRuntimeHome(runtimeHome) {
  if (!runtimeHome) return
  assertSafeCodingFlowRuntimeHome(runtimeHome)
  fs.rmSync(runtimeHome, { recursive: true, force: true })
}

function assertSafeCodingFlowRuntimeHome(runtimeHome) {
  const normalized = normalizePathForSafety(runtimeHome)
  const normalizedTestRoot = normalizePathForSafety(testRoot)
  if (!(normalized === normalizedTestRoot || normalized.startsWith(`${normalizedTestRoot}/`))) {
    throw new Error('Refusing to use coding flow runtime home outside the configured test root')
  }

  const normalizedRepoRoot = normalizePathForSafety(repoRoot)
  if (normalized === normalizedRepoRoot || normalized.startsWith(`${normalizedRepoRoot}/`)) {
    throw new Error('Refusing to use repository root for coding flow runtime home')
  }

  if (realHome) {
    const normalizedRealHome = normalizePathForSafety(realHome)
    if (normalized === normalizedRealHome || normalized.startsWith(`${normalizedRealHome}/`)) {
      throw new Error('Refusing to use real-provider home for coding flow runtime home')
    }
  }
}

function createIsolatedCodingFlowAuditLogPath() {
  return createIsolatedAuditLogPath({
    runId,
    getAuditLogPath: getRealCodingFlowAuditLogPath,
    assertSafeRuntimeHome: assertSafeCodingFlowRuntimeHome,
  })
}

function cleanupIsolatedCodingFlowAuditLog(auditLogPath) {
  cleanupIsolatedAuditLogPath(auditLogPath, {
    assertSafeRuntimeHome: assertSafeCodingFlowRuntimeHome,
  })
}

function isPathInsideTestRoot(targetPath) {
  const normalized = normalizePathForSafety(targetPath)
  const normalizedTestRoot = normalizePathForSafety(testRoot)
  return normalized === normalizedTestRoot || normalized.startsWith(`${normalizedTestRoot}/`)
}

function normalizePathForSafety(value) {
  return path.resolve(value).replace(/\\/g, '/').toLowerCase()
}

function summarizeRedactedProviderDetails(value) {
  return String(value ?? '')
    .replace(/Authorization\s*:\s*\[REDACTED\](?:\s+\[REDACTED\])?/gi, '[REDACTED_AUTH_HEADER]')
    .replace(/\b(?:api_key|refresh_token|access_token)\s*=\s*\[REDACTED\]/gi, '[REDACTED_SECRET]')
}

function buildCodingFlowFailureFollowupContext(result, followupPrompt, fixture = {}) {
  const failureCategory = result.failureCategory ?? 'product runtime regression'
  const statusDetail =
    result.statusDetail ??
    statusDetailForCodingFlowFailureCategory(failureCategory)
  const outcome = result.status === 'PASS'
    ? 'success'
    : ['provider-network-inconclusive', 'auth/config failure', 'model/quota/rate-limit failure'].includes(failureCategory)
      ? 'provider-failure'
      : 'stopped'
  const changedFiles = [...(result.changedFiles ?? [])].sort()
  const failedFiles = [...(result.failedFiles ?? [])].sort()
  const targetFile = result.targetFile ?? failedFiles[0] ?? result.failedFile ?? undefined
  const editableFiles = [...(fixture.editableFiles ?? result.editableFiles ?? ['note.txt'])].sort()
  const protectedFiles = [...(fixture.protectedFiles ?? result.protectedFiles ?? ['README.md', 'LOCKED.md'])].sort()
  const verification = result.verification ?? (failureCategory === 'verification failed' ? 'failed' : 'blocked')
  const reason = summarizeRedactedProviderDetails(
    redactAndAssertCodingProviderOutput(result.failureReason ?? '').redacted,
  )
  const doNext = result.nextAction ?? nextActionForCodingFlowFailure(failureCategory, statusDetail)
  const safeFollowupPrompt = summarizeRedactedProviderDetails(
    redactAndAssertCodingProviderOutput(followupPrompt).redacted,
  )
  const contextLine = [
    `previousOutcome=${outcome}`,
    `blocker=${failureCategory}`,
    `status=${statusDetail}`,
    targetFile ? `targetFile=${targetFile}` : '',
    failedFiles.length > 0 ? `failedFiles=${failedFiles.join(',')}` : '',
    changedFiles.length > 0 ? `changedFiles=${changedFiles.join(',')}` : 'changedFiles=none',
    `editableFiles=${editableFiles.join(',')}`,
    `protectedFiles=${protectedFiles.join(',')}`,
    `verification=${verification}`,
    reason ? `reason=${reason}` : '',
    `DoNext=${doNext}`,
    `followup=${safeFollowupPrompt}`,
  ].filter(Boolean).join(' | ')
  const redaction = redactAndAssertCodingProviderOutput(contextLine)

  return {
    previousOutcome: outcome,
    blocker: failureCategory,
    statusDetail,
    changedFiles,
    failedFiles,
    targetFile,
    editableFiles,
    protectedFiles,
    verification,
    reason,
    doNext,
    followupPrompt: safeFollowupPrompt,
    contextLine: redaction.redacted,
    redaction: {
      ok: redaction.ok,
      leaks: redaction.leaks,
    },
  }
}

function buildCodingFlowSmokeFailureStatus(result, output, redaction) {
  if (result.timedOut) {
    return {
      status: 'PROVIDER_NETWORK',
      statusDetail: 'provider-network-inconclusive',
      exitCode: 2,
      failureCategory: 'provider-network-inconclusive',
      failureReason: 'provider-network-inconclusive: coding flow model turn timed out',
    }
  }

  const providerFailure = classifyProviderReadinessFailure(
    `coding flow model turn exited ${result.code}`,
    output,
    'real',
  )
  if (providerFailure) {
    return {
      status: providerFailure.exitCode === 2 ? 'PROVIDER_NETWORK' : providerFailure.exitCode === 3 ? 'CONFIG' : 'FAIL',
      statusDetail: providerFailure.statusDetail,
      exitCode: providerFailure.exitCode,
      failureCategory: codingFlowFailureCategoryForStatus(providerFailure.statusDetail),
      failureReason: providerFailure.reason,
    }
  }

  if (!redaction.ok) {
    return {
      status: 'FAIL',
      statusDetail: 'redaction-failure',
      exitCode: 1,
      failureCategory: 'redaction failure',
      failureReason: `redaction leak detected: ${redaction.leaks.join(',') || 'unknown'}`,
    }
  }

  return {
    status: 'FAIL',
    statusDetail: 'product-runtime-regression',
    exitCode: 1,
    failureCategory: 'product runtime regression',
    failureReason: `coding flow model turn exited ${result.code}`,
  }
}

async function readRepoStatusShort() {
  const result = await run('git', ['status', '--short'], {
    cwd: repoRoot,
    timeoutMs: 30000,
  })
  return {
    ok: result.code === 0 && !result.timedOut,
    status: result.stdout.trim(),
    outputTail: summarizeOutput(result.output),
  }
}

function assertCodingFlowSmokeSuccess(output, comparison, expected, noteContent, redaction, repoBefore, repoAfter) {
  const failures = []
  if (!repoBefore.ok || repoBefore.status) {
    failures.push('no-mutation guard failure: repository was not clean before smoke')
  }
  if (!repoAfter.ok) {
    failures.push('no-mutation guard failure: repository status could not be checked after smoke')
  } else if (repoAfter.status) {
    failures.push('real repo mutation leak: repository changed during smoke')
  }
  if (!redaction.ok) {
    failures.push(`redaction failure: ${redaction.leaks.join(',') || 'unknown'}`)
  }
  if (!expected.ok) {
    if (expected.unexpected.length > 0 || expected.missing.length > 0) {
      failures.push(`changedFiles wrong: observed=${expected.observed.join(',') || 'none'} expected=${expected.expected.join(',')}`)
    }
    if (expected.protectedChanged.length > 0) {
      failures.push(`verification failed: protected files changed: ${expected.protectedChanged.join(',')}`)
    }
    if (comparison.added.length > 0 || comparison.removed.length > 0) {
      failures.push('changedFiles wrong: fixture files were added or removed')
    }
  }
  if (!noteContent.includes('status: ready')) {
    failures.push('verification failed: note.txt does not contain status: ready')
  }
  if (!/(^|\r?\n)Result\s*(\r?\n|$)/.test(output) || !/-\s*Outcome:\s*success/i.test(output)) {
    failures.push('terminal result missing')
  }
  if (!/-\s*(Changed|Changed files):\s*note\.txt/i.test(output)) {
    failures.push('changedFiles wrong: terminal changed files did not report note.txt')
  }
  if (!/Verification:\s*passed/i.test(output) && !/verification passed/i.test(output)) {
    failures.push('verification failed: terminal verification did not report passed')
  }

  let failureCategory = 'none'
  if (failures.some((failure) => failure.startsWith('no-mutation guard failure'))) {
    failureCategory = 'no-mutation guard failure'
  } else if (failures.some((failure) => failure.startsWith('real repo mutation leak'))) {
    failureCategory = 'real repo mutation leak'
  } else if (failures.some((failure) => failure.startsWith('redaction failure'))) {
    failureCategory = 'redaction failure'
  } else if (failures.some((failure) => failure.startsWith('terminal result missing'))) {
    failureCategory = 'terminal result missing'
  } else if (failures.some((failure) => failure.startsWith('changedFiles wrong'))) {
    failureCategory = 'changedFiles wrong'
  } else if (failures.some((failure) => failure.startsWith('verification failed'))) {
    failureCategory = 'verification failed'
  }

  return {
    ok: failures.length === 0,
    failures,
    failureCategory,
    statusDetail: statusDetailForCodingFlowFailureCategory(failureCategory),
  }
}

function statusDetailForCodingFlowFailureCategory(failureCategory) {
  if (failureCategory === 'no-mutation guard failure') return 'no-mutation-guard-failure'
  if (failureCategory === 'real repo mutation leak') return 'real-repo-mutation-leak'
  if (failureCategory === 'redaction failure') return 'redaction-failure'
  if (failureCategory === 'terminal result missing') return 'terminal-result-missing'
  if (failureCategory === 'changedFiles wrong') return 'changed-files-wrong'
  if (failureCategory === 'verification failed') return 'verification-failed'
  if (failureCategory === 'product runtime regression') return 'product-runtime-regression'
  return 'passed'
}

function runRealCodingFlowFailureAttributionSelfTest() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-coding-flow-failure-attribution-self-test')
  console.log('homeRead=false')
  console.log('real-provider execution skipped')
  console.log('modelTurn=false')
  console.log('reportWritten=false')

  const providerCases = [
    {
      name: 'network-mid-turn',
      result: {
        code: 0,
        timedOut: false,
        output: [
          'Provider readiness failed (provider-readiness:network): Unable to reach the OpenAI-compatible endpoint.',
          'Authorization: Bearer sk-live-secret-123456789',
          'D:/Test/home-sf/.private-agents/config.json',
        ].join('\n'),
      },
      expected: {
        status: 'PROVIDER_NETWORK',
        statusDetail: 'provider-network-inconclusive',
        exitCode: 2,
        failureCategory: 'provider-network-inconclusive',
      },
    },
    {
      name: 'auth-mid-turn',
      result: {
        code: 1,
        timedOut: false,
        output: 'provider-readiness:auth invalid api key api_key=sk-live-secret-123456789',
      },
      expected: {
        status: 'CONFIG',
        statusDetail: 'config-failure',
        exitCode: 3,
        failureCategory: 'auth/config failure',
      },
    },
    {
      name: 'model-mid-turn',
      result: {
        code: 1,
        timedOut: false,
        output: 'provider-readiness:model unsupported model or rate limit 429 for requested model',
      },
      expected: {
        status: 'FAIL',
        statusDetail: 'provider-model-failed',
        exitCode: 1,
        failureCategory: 'model/quota/rate-limit failure',
      },
    },
    {
      name: 'timeout-mid-turn',
      result: {
        code: -1,
        timedOut: true,
        output: 'coding flow model turn timed out',
      },
      expected: {
        status: 'PROVIDER_NETWORK',
        statusDetail: 'provider-network-inconclusive',
        exitCode: 2,
        failureCategory: 'provider-network-inconclusive',
      },
    },
    {
      name: 'redaction',
      result: {
        code: 1,
        timedOut: false,
        output: 'tool output without provider readiness marker',
      },
      redaction: {
        ok: false,
        leaks: ['api-key-value'],
        redacted: 'tool output without provider readiness marker',
      },
      expected: {
        status: 'FAIL',
        statusDetail: 'redaction-failure',
        exitCode: 1,
        failureCategory: 'redaction failure',
      },
    },
    {
      name: 'product-runtime',
      result: {
        code: 1,
        timedOut: false,
        output: 'tool execution failed after provider turn completed',
      },
      expected: {
        status: 'FAIL',
        statusDetail: 'product-runtime-regression',
        exitCode: 1,
        failureCategory: 'product runtime regression',
      },
    },
  ]

  const successOutput = [
    'Result',
    '- Outcome: success',
    '- Changed files: note.txt',
    '- Verification: passed',
  ].join('\n')
  const baseComparison = { ok: false, added: [], removed: [], changed: ['note.txt'] }
  const baseExpected = {
    ok: true,
    observed: ['note.txt'],
    expected: ['note.txt'],
    unexpected: [],
    missing: [],
    protectedChanged: [],
  }
  const cleanRepo = { ok: true, status: '', outputTail: '' }
  const successCases = [
    {
      name: 'no-mutation-guard',
      args: [
        successOutput,
        baseComparison,
        baseExpected,
        'status: ready\n',
        { ok: true, leaks: [] },
        { ok: true, status: ' M scripts/verify-real-user-capabilities.mjs', outputTail: '' },
        cleanRepo,
      ],
      expectedCategory: 'no-mutation guard failure',
      expectedStatusDetail: 'no-mutation-guard-failure',
    },
    {
      name: 'real-repo-mutation-leak',
      args: [
        successOutput,
        baseComparison,
        baseExpected,
        'status: ready\n',
        { ok: true, leaks: [] },
        cleanRepo,
        { ok: true, status: ' M package.json', outputTail: '' },
      ],
      expectedCategory: 'real repo mutation leak',
      expectedStatusDetail: 'real-repo-mutation-leak',
    },
    {
      name: 'terminal-result-missing',
      args: [
        '- Changed files: note.txt\n- Verification: passed',
        baseComparison,
        baseExpected,
        'status: ready\n',
        { ok: true, leaks: [] },
        cleanRepo,
        cleanRepo,
      ],
      expectedCategory: 'terminal result missing',
      expectedStatusDetail: 'terminal-result-missing',
    },
    {
      name: 'changed-files-wrong',
      args: [
        successOutput,
        { ok: false, added: [], removed: [], changed: ['README.md'] },
        {
          ok: false,
          observed: ['README.md'],
          expected: ['note.txt'],
          unexpected: ['README.md'],
          missing: ['note.txt'],
          protectedChanged: ['README.md'],
        },
        'status: ready\n',
        { ok: true, leaks: [] },
        cleanRepo,
        cleanRepo,
      ],
      expectedCategory: 'changedFiles wrong',
      expectedStatusDetail: 'changed-files-wrong',
    },
    {
      name: 'verification-failed',
      args: [
        successOutput,
        baseComparison,
        baseExpected,
        'status: draft\n',
        { ok: true, leaks: [] },
        cleanRepo,
        cleanRepo,
      ],
      expectedCategory: 'verification failed',
      expectedStatusDetail: 'verification-failed',
    },
  ]

  let ok = true
  for (const item of providerCases) {
    const redaction = item.redaction ?? redactAndAssertCodingProviderOutput(item.result.output)
    const status = buildCodingFlowSmokeFailureStatus(item.result, redaction.redacted, redaction)
    const combined = [
      status.status,
      status.statusDetail,
      status.failureCategory,
      status.failureReason,
      redaction.redacted,
    ].join('\n')
    const safe = redactAndAssertCodingProviderOutput(combined)
    const passed =
      status.status === item.expected.status &&
      status.statusDetail === item.expected.statusDetail &&
      status.exitCode === item.expected.exitCode &&
      status.failureCategory === item.expected.failureCategory &&
      safe.ok
    console.log(
      `[${passed ? 'PASS' : 'FAIL'}] coding-flow-failure-${item.name} category=${status.failureCategory} status=${status.statusDetail} exit=${status.exitCode} redaction=${safe.ok ? 'pass' : 'fail'}`,
    )
    if (!passed && safe.leaks.length > 0) {
      console.log(`leaks=${safe.leaks.join(',')}`)
    }
    ok = ok && passed
  }

  for (const item of successCases) {
    const result = assertCodingFlowSmokeSuccess(...item.args)
    const combined = [
      result.failureCategory,
      result.statusDetail,
      result.failures.join('\n'),
    ].join('\n')
    const safe = redactAndAssertCodingProviderOutput(combined)
    const passed =
      !result.ok &&
      result.failureCategory === item.expectedCategory &&
      result.statusDetail === item.expectedStatusDetail &&
      safe.ok
    console.log(
      `[${passed ? 'PASS' : 'FAIL'}] coding-flow-assertion-${item.name} category=${result.failureCategory} status=${result.statusDetail} redaction=${safe.ok ? 'pass' : 'fail'}`,
    )
    if (!passed && safe.leaks.length > 0) {
      console.log(`leaks=${safe.leaks.join(',')}`)
    }
    ok = ok && passed
  }

  process.exit(ok ? 0 : 1)
}

function runRealCodingFlowFollowupContextSelfTest() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-coding-flow-followup-context-self-test')
  console.log('homeRead=false')
  console.log('real-provider execution skipped')
  console.log('modelTurn=false')
  console.log('reportWritten=false')

  const fixture = {
    editableFiles: ['note.txt'],
    protectedFiles: ['README.md', 'LOCKED.md'],
  }
  const cases = [
    {
      name: 'provider-network',
      result: {
        status: 'PROVIDER_NETWORK',
        statusDetail: 'provider-network-inconclusive',
        failureCategory: 'provider-network-inconclusive',
        failureReason: [
          'provider-readiness:network: endpoint unreachable',
          'Authorization: Bearer sk-live-secret-123456789',
          'D:/Test/home-sf/.private-agents/config.json',
        ].join('\n'),
        changedFiles: [],
        verification: 'blocked',
      },
      followupPrompt: 'retry after api_key=sk-live-secret-123456789 recovers',
      expected: [
        'previousOutcome=provider-failure',
        'blocker=provider-network-inconclusive',
        'status=provider-network-inconclusive',
        'changedFiles=none',
        'editableFiles=note.txt',
        'protectedFiles=LOCKED.md,README.md',
        'verification=blocked',
        'DoNext=Retry the same isolated fixture task',
      ],
    },
    {
      name: 'auth-config',
      result: {
        status: 'CONFIG',
        statusDetail: 'config-failure',
        failureCategory: 'auth/config failure',
        failureReason: 'provider-readiness:auth invalid api key api_key=sk-live-secret-123456789',
        changedFiles: [],
        verification: 'blocked',
      },
      followupPrompt: 'retry without printing D:/Test/home-sf/.private-agents/config.json',
      expected: [
        'previousOutcome=provider-failure',
        'blocker=auth/config failure',
        'status=config-failure',
        'DoNext=Fix provider configuration or authentication outside this run',
      ],
    },
    {
      name: 'changed-files-wrong',
      result: {
        status: 'FAIL',
        statusDetail: 'changed-files-wrong',
        failureCategory: 'changedFiles wrong',
        failureReason: 'changedFiles wrong: observed=README.md expected=note.txt',
        changedFiles: ['README.md'],
        verification: 'failed',
      },
      followupPrompt: 'retry and only edit note.txt',
      expected: [
        'previousOutcome=stopped',
        'blocker=changedFiles wrong',
        'status=changed-files-wrong',
        'changedFiles=README.md',
        'DoNext=Inspect fixture changed files and retry with only note.txt editable',
      ],
    },
    {
      name: 'verification-failed',
      result: {
        status: 'FAIL',
        statusDetail: 'verification-failed',
        failureCategory: 'verification failed',
        failureReason: 'verification failed: note.txt does not contain status: ready',
        changedFiles: ['note.txt'],
        verification: 'failed',
      },
      followupPrompt: 'make note.txt contain status: ready',
      expected: [
        'previousOutcome=stopped',
        'blocker=verification failed',
        'status=verification-failed',
        'changedFiles=note.txt',
        'verification=failed',
        'DoNext=Repair the fixture verification failure',
      ],
    },
    {
      name: 'patch-from-not-found',
      result: {
        status: 'FAIL',
        statusDetail: 'patch-from-not-found',
        failureCategory: 'product runtime regression',
        failureReason: [
          'patch-from-not-found: mutation instruction missing for note.txt',
          'Authorization: Bearer sk-live-secret-123456789',
          'api_key=sk-url-secret-123456789',
          'refresh_token=refresh-secret',
          'access_token=access-secret',
          'D:/Test/home-sf/.private-agents/config.json',
          '/home/wang/.private-agents-real/.private-agents/config.json',
        ].join('\n'),
        changedFiles: [],
        failedFiles: ['note.txt'],
        targetFile: 'note.txt',
        verification: 'blocked',
        nextAction: 'Retry with exact replacement for note.txt after reading the current fixture content.',
      },
      followupPrompt: [
        'retry with exact replacement for note.txt',
        'Authorization: Bearer sk-live-secret-123456789',
        'api_key=sk-url-secret-123456789',
        '/home/wang/.private-agents-real/.private-agents/config.json',
      ].join(' '),
      expected: [
        'previousOutcome=stopped',
        'blocker=product runtime regression',
        'status=patch-from-not-found',
        'targetFile=note.txt',
        'failedFiles=note.txt',
        'changedFiles=none',
        'protectedFiles=LOCKED.md,README.md',
        'verification=blocked',
        'reason=patch-from-not-found',
        'mutation instruction missing',
        'DoNext=Retry with exact replacement for note.txt',
        'followup=retry with exact replacement for note.txt',
      ],
    },
    {
      name: 'repo-leak',
      result: {
        status: 'FAIL',
        statusDetail: 'real-repo-mutation-leak',
        failureCategory: 'real repo mutation leak',
        failureReason: 'real repo mutation leak: repository changed during smoke',
        changedFiles: ['note.txt'],
        verification: 'blocked',
      },
      followupPrompt: 'restore repo before retrying',
      expected: [
        'previousOutcome=stopped',
        'blocker=real repo mutation leak',
        'status=real-repo-mutation-leak',
        'DoNext=Inspect and restore repository changes before retrying',
      ],
    },
  ]

  let ok = true
  for (const item of cases) {
    const context = buildCodingFlowFailureFollowupContext(item.result, item.followupPrompt, fixture)
    const hasExpected = item.expected.every((marker) => context.contextLine.includes(marker))
    const avoidsConfigPath = !/\.private-agents(?:-real)?[\\/]+(?:\.private-agents[\\/]+)?config\.json/i.test(context.contextLine)
    const avoidsKey = !/\bsk-[A-Za-z0-9][A-Za-z0-9._-]{8,}\b/i.test(context.contextLine)
    const avoidsAuthHeader = !/Authorization\s*:/i.test(context.contextLine)
    const avoidsToken = !/\b(?:refresh_token|access_token|api_key)\b/i.test(context.contextLine)
    const passed = hasExpected && avoidsConfigPath && avoidsKey && avoidsAuthHeader && avoidsToken && context.redaction.ok
    console.log(
      `[${passed ? 'PASS' : 'FAIL'}] coding-flow-followup-${item.name} blocker=${context.blocker} status=${context.statusDetail} redaction=${context.redaction.ok ? 'pass' : 'fail'}`,
    )
    if (!passed) {
      console.log(`context=${context.contextLine}`)
      if (context.redaction.leaks.length > 0) {
        console.log(`leaks=${context.redaction.leaks.join(',')}`)
      }
    }
    ok = ok && passed
  }

  process.exit(ok ? 0 : 1)
}

function buildSyntheticPatchFromNotFoundFollowupContext() {
  const fixture = {
    editableFiles: ['note.txt'],
    protectedFiles: ['README.md', 'LOCKED.md'],
  }
  const result = {
    status: 'FAIL',
    statusDetail: 'patch-from-not-found',
    failureCategory: 'product runtime regression',
    failureReason: 'patch-from-not-found: mutation instruction missing for note.txt',
    changedFiles: [],
    failedFiles: ['note.txt'],
    targetFile: 'note.txt',
    verification: 'blocked',
    nextAction: 'Retry with exact replacement for note.txt after reading the current fixture content.',
  }
  return buildCodingFlowFailureFollowupContext(
    result,
    'explain the previous failure and provide a safe recovery step for note.txt',
    fixture,
  )
}

function buildCodingFlowFollowupPrompt(context) {
  return [
    'You are receiving a safe redacted failure-follow-up context from a previous stopped coding flow.',
    'This is an explain-only, non-mutating follow-up turn.',
    '',
    '<context>',
    context.contextLine,
    '</context>',
    '',
    'Explain only. Do not inspect, modify, create, remove, or write files.',
    'Do not treat DoNext or recovery labels in the context as an instruction to perform work now.',
    'Do not claim the previous coding task is complete or successful.',
    'In plain text, summarize the stopped outcome, the target note.txt, and the failure labels patch-from-not-found and mutation instruction missing.',
    'Then describe the safe human-authorized recovery shape: a later turn should use the current source text and an exact replacement while keeping protected files unchanged.',
  ].join('\n')
}

function inferFollowupPromptIntent(prompt) {
  const normalized = String(prompt ?? '').toLowerCase()
  const explainOnly =
    /\bexplain-only\b/.test(normalized) ||
    /\bexplain only\b/.test(normalized) ||
    /\bnon-mutating\b/.test(normalized)
  const failureContext =
    /\bpatch-from-not-found\b/.test(normalized) ||
    /\bmutation instruction missing\b/.test(normalized) ||
    /\bstopped\b/.test(normalized)
  return explainOnly && failureContext ? 'explain-failure' : 'unknown'
}

function isNonMutatingFollowupPrompt(prompt) {
  const normalized = String(prompt ?? '').toLowerCase()
  return (
    inferFollowupPromptIntent(prompt) === 'explain-failure' &&
    /\bdo not (?:inspect, )?modify\b/.test(normalized) &&
    /\bdo not .*perform work now\b/.test(normalized) &&
    /\bdo not claim\b/.test(normalized)
  )
}

function detectFollowupEditRouting(output, executionPath = 'cli-orchestration') {
  if (executionPath === 'direct-provider-explanation') {
    return {
      enteredEditTargetResolution: false,
      ambiguousTargetDetected: false,
    }
  }
  const normalized = String(output ?? '')
  const ambiguousTargetDetected = /\bambiguous-target\b/i.test(normalized)
  const enteredEditTargetResolution =
    ambiguousTargetDetected ||
    /-\s*Task:\s*edit-file\b/i.test(normalized) ||
    /-\s*Failed files:\s*.*ambiguous-target/i.test(normalized)
  return {
    enteredEditTargetResolution,
    ambiguousTargetDetected,
  }
}

function buildCodingFlowFollowupRoutingDiagnostics({
  prompt = '',
  output = '',
  executionPath = 'cli-orchestration',
} = {}) {
  return {
    followupExecutionPath: executionPath,
    followupPromptIntent: inferFollowupPromptIntent(prompt),
    nonMutatingFollowup: isNonMutatingFollowupPrompt(prompt),
    ...detectFollowupEditRouting(output, executionPath),
  }
}

function assertCodingFlowFollowupSmokeResponse({
  output = '',
  prompt = '',
  executionPath = 'cli-orchestration',
  redaction = { ok: true, leaks: [] },
  comparison = { ok: true, added: [], removed: [], changed: [] },
  repoBefore = { ok: true, status: '' },
  repoAfter = { ok: true, status: '' },
} = {}) {
  const normalized = String(output ?? '')
  const routing = buildCodingFlowFollowupRoutingDiagnostics({
    prompt,
    output: normalized,
    executionPath,
  })
  const failures = []
  if (routing.followupPromptIntent !== 'explain-failure' || !routing.nonMutatingFollowup) {
    failures.push('follow-up prompt is not explain-only non-mutating')
  }
  if (!redaction.ok) {
    failures.push('redaction leak')
  }
  if (!repoBefore.ok || repoBefore.status || !repoAfter.ok || repoAfter.status) {
    failures.push('real repo mutation leak')
  }
  const changed = [...(comparison.changed ?? []), ...(comparison.added ?? []), ...(comparison.removed ?? [])].sort()
  if (changed.length > 0 || comparison.ok === false) {
    failures.push(`fixture mutation leak: ${changed.length > 0 ? changed.join(',') : 'unknown'}`)
  }
  if (normalized.trim().length === 0) {
    failures.push('terminal result missing')
  }
  if (routing.enteredEditTargetResolution) {
    failures.push('follow-up entered edit target resolution')
  }
  if (!/\b(note\.txt|target file)\b/i.test(normalized)) {
    failures.push('context missing: target file not acknowledged')
  }
  if (!/\b(patch-from-not-found|mutation instruction missing|exact replacement|exact current source|re-read|read the current|source text not found)\b/i.test(normalized)) {
    failures.push('follow-up response ignores failure context')
  }
  if (!/\b(next step|next action|safe recovery|re-read|read the current|provide the exact|retry with exact|do not modify protected)\b/i.test(normalized)) {
    failures.push('safe next action missing')
  }
  if (/\b(?:I (?:have )?(?:completed|fixed|changed|updated)|successfully (?:changed|updated|fixed)|task (?:is )?(?:complete|completed)|status:\s*ready)\b/i.test(normalized)) {
    failures.push('follow-up response claims success')
  }
  return {
    ok: failures.length === 0,
    failures,
    responseVisible: normalized.trim().length > 0,
    acknowledgesTarget: /\b(note\.txt|target file)\b/i.test(normalized),
    acknowledgesFailure: /\b(patch-from-not-found|mutation instruction missing|exact replacement|exact current source|re-read|read the current|source text not found)\b/i.test(normalized),
    safeNextAction: /\b(next step|next action|safe recovery|re-read|read the current|provide the exact|retry with exact|do not modify protected)\b/i.test(normalized),
    claimsSuccess: /\b(?:I (?:have )?(?:completed|fixed|changed|updated)|successfully (?:changed|updated|fixed)|task (?:is )?(?:complete|completed)|status:\s*ready)\b/i.test(normalized),
    fixtureMutationLeak: changed.length > 0 || comparison.ok === false,
    repositoryClean: Boolean(repoBefore.ok) && !repoBefore.status && Boolean(repoAfter.ok) && !repoAfter.status,
    routing,
  }
}

function statusForCodingFlowFollowupAssertion(assertion) {
  if (assertion.ok) {
    return {
      status: 'PASS',
      statusDetail: 'passed',
      exitCode: 0,
      failureCategory: 'none',
      failureReason: '',
    }
  }
  if (assertion.failures.some((entry) => entry.includes('redaction leak'))) {
    return { status: 'FAIL', statusDetail: 'redaction-failure', exitCode: 1, failureCategory: 'redaction failure', failureReason: 'redaction leak' }
  }
  if (assertion.failures.some((entry) => entry.includes('real repo mutation leak'))) {
    return { status: 'FAIL', statusDetail: 'real-repo-mutation-leak', exitCode: 1, failureCategory: 'real repo mutation leak', failureReason: 'real repo mutation leak' }
  }
  if (assertion.failures.some((entry) => entry.includes('fixture mutation leak'))) {
    return { status: 'FAIL', statusDetail: 'fixture-mutation-leak', exitCode: 1, failureCategory: 'fixture mutation leak', failureReason: assertion.failures.join('; ') }
  }
  if (assertion.failures.some((entry) => entry.includes('terminal result missing'))) {
    return { status: 'FAIL', statusDetail: 'terminal-result-missing', exitCode: 1, failureCategory: 'terminal result missing', failureReason: 'provider response was not visible' }
  }
  if (assertion.failures.some((entry) => entry.includes('not explain-only') || entry.includes('edit target resolution'))) {
    return { status: 'FAIL', statusDetail: 'follow-up-entered-edit-routing', exitCode: 1, failureCategory: 'follow-up entered edit routing', failureReason: assertion.failures.join('; ') }
  }
  if (assertion.failures.some((entry) => entry.includes('claims success'))) {
    return { status: 'FAIL', statusDetail: 'follow-up-claimed-success', exitCode: 1, failureCategory: 'follow-up response claims success', failureReason: assertion.failures.join('; ') }
  }
  if (assertion.failures.some((entry) => entry.includes('context missing'))) {
    return { status: 'FAIL', statusDetail: 'context-missing', exitCode: 1, failureCategory: 'context missing', failureReason: assertion.failures.join('; ') }
  }
  return { status: 'FAIL', statusDetail: 'follow-up-ignored-context', exitCode: 1, failureCategory: 'follow-up response ignores failure context', failureReason: assertion.failures.join('; ') }
}

function buildDirectProviderExplanationEvalScript() {
  const modelClientUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'model-adapters', 'client.ts')).href
  const runtimeConfigUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'config', 'runtimeConfig.ts')).href
  const providerCredentialsUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'core', 'shell', 'providerCredentials.ts')).href
  return `
    import { createModelClient } from ${JSON.stringify(modelClientUrl)};
    import { getRuntimeConfig } from ${JSON.stringify(runtimeConfigUrl)};
    import { resolveProviderCredential } from ${JSON.stringify(providerCredentialsUrl)};

    ;(async () => {
      const prompt = process.env.PRIVATE_AGENTS_FOLLOWUP_PROMPT ?? '';
      const workspaceRoot = process.env.PRIVATE_AGENTS_FOLLOWUP_WORKSPACE ?? process.cwd();
      const runtimeConfig = getRuntimeConfig(workspaceRoot);
      const resolved = resolveProviderCredential({ runtimeConfig });
      const credential = resolved.credential;
      if (!credential) {
        throw new Error('provider-readiness:missing-key');
      }
      if (credential.accountAuth && credential.accountAuth.expiresAt <= Date.now()) {
        throw new Error('provider-readiness:auth account-auth token expired; reconnect before running follow-up smoke');
      }
      const model = (resolved.model ?? credential.model ?? '').trim() ||
        (credential.provider === 'openai' && credential.accountAuth ? 'gpt-5.4' : 'gpt-4.1-mini');
      const client = createModelClient({
        provider: credential.provider,
        apiKey: credential.apiKey,
        accountAuth: credential.accountAuth,
        baseUrl: resolved.baseUrl ?? credential.baseUrl,
        requestedCapabilities: { supportsToolCalls: false },
        fallbackPolicy: { enabled: false },
      });
      let output = '';
      const signal = AbortSignal.timeout(300000);
      for await (const event of client.stream({
        schemaVersion: '1.0.0',
        model,
        messages: [
          {
            role: 'system',
            content: [
              'You are answering a non-mutating failure follow-up.',
              'Do not call tools. Do not claim any file was changed.',
              'Explain the supplied failure context and provide a safe next step only.'
            ].join(' ')
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0,
        maxOutputTokens: 700,
      }, signal)) {
        if (event.type === 'content.delta') {
          output += event.delta;
        }
      }
      console.log('__FOLLOWUP_PROVIDER_RESULT__' + JSON.stringify({ output }));
    })().catch((error) => {
      console.error(formatProviderEvalError(error));
      process.exit(1);
    });

    function formatProviderEvalError(error) {
      if (error instanceof Error) {
        return error.stack ?? error.message;
      }
      try {
        return JSON.stringify(error, (_key, value) => {
          if (typeof value === 'function') return '[function]';
          if (typeof value === 'bigint') return value.toString();
          return value;
        });
      } catch {
        return String(error);
      }
    }
  `
}

function directProviderExplanationEvalScriptUsesAsyncWrapper(script) {
  return /;\s*\(async\s*\(\)\s*=>\s*\{/.test(script) &&
    /\}\)\(\)\.catch\(\(error\)\s*=>/.test(script) &&
    /for\s+await\s*\(/.test(script)
}

async function runDirectProviderExplanationTurn({ prompt, runtimeHome, realHome, fixtureDir }) {
  const result = await run(process.execPath, [
    tsxCliPath,
    '--eval',
    buildDirectProviderExplanationEvalScript(),
  ], {
    cwd: tsShellRoot,
    env: {
      HOME: runtimeHome,
      USERPROFILE: runtimeHome,
      PRIVATE_AGENTS_HOME_OVERRIDE: realHome,
      PRIVATE_AGENTS_REAL_HOME: realHome,
      PRIVATE_AGENTS_PROVIDER_MODE: 'real',
      PRIVATE_AGENTS_FOLLOWUP_PROMPT: prompt,
      PRIVATE_AGENTS_FOLLOWUP_WORKSPACE: fixtureDir,
    },
    timeoutMs: 420000,
  })
  const resultLine = result.stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith('__FOLLOWUP_PROVIDER_RESULT__'))
  let output = ''
  if (resultLine) {
    try {
      const parsed = JSON.parse(resultLine.slice('__FOLLOWUP_PROVIDER_RESULT__'.length))
      output = typeof parsed.output === 'string' ? parsed.output : ''
    } catch {
      output = ''
    }
  }
  return {
    ...result,
    stdout: output,
    output: output || result.output,
    rawOutput: result.output,
  }
}

function runRealCodingFlowFollowupSmokeDryRun() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-coding-flow-followup-smoke-dry-run')
  console.log('homeRead=false')
  console.log('real-provider execution skipped')
  console.log('modelTurn=false')
  console.log('reportWritten=false')
  console.log('defaultSmoke=skipped')

  const context = buildSyntheticPatchFromNotFoundFollowupContext()
  const prompt = buildCodingFlowFollowupPrompt(context)
  const evalScriptWrapped = directProviderExplanationEvalScriptUsesAsyncWrapper(
    buildDirectProviderExplanationEvalScript(),
  )
  const redaction = redactAndAssertCodingProviderOutput([
    prompt,
    'Authorization: Bearer sk-live-secret-123456789',
    'api_key=sk-url-secret-123456789',
    '/home/wang/.private-agents-real/.private-agents/config.json',
  ].join('\n'))
  const passing = assertCodingFlowFollowupSmokeResponse({
    output: [
      'The previous stopped coding flow targeted note.txt and failed with patch-from-not-found because the mutation instruction was missing.',
      'Safe next action: in a later human-authorized turn, use the current source text and an exact replacement while keeping README.md and LOCKED.md unchanged.',
    ].join('\n'),
    prompt,
    executionPath: 'direct-provider-explanation',
    redaction: { ok: true, leaks: [] },
    comparison: { ok: true, added: [], removed: [], changed: [] },
  })
  const ignoresContext = assertCodingFlowFollowupSmokeResponse({
    output: 'Please try again later.',
    prompt,
    executionPath: 'direct-provider-explanation',
    redaction: { ok: true, leaks: [] },
    comparison: { ok: true, added: [], removed: [], changed: [] },
  })
  const claimsSuccess = assertCodingFlowFollowupSmokeResponse({
    output: 'I successfully changed note.txt to status: ready.',
    prompt,
    executionPath: 'direct-provider-explanation',
    redaction: { ok: true, leaks: [] },
    comparison: { ok: true, added: [], removed: [], changed: [] },
  })
  const mutationLeak = assertCodingFlowFollowupSmokeResponse({
    output: 'The next step is to explain note.txt patch-from-not-found and exact replacement recovery.',
    prompt,
    executionPath: 'direct-provider-explanation',
    redaction: { ok: true, leaks: [] },
    comparison: { ok: false, added: [], removed: [], changed: ['note.txt'] },
  })
  const leak = assertCodingFlowFollowupSmokeResponse({
    output: 'The next step is to explain note.txt patch-from-not-found and exact replacement recovery.',
    prompt,
    executionPath: 'direct-provider-explanation',
    redaction: { ok: false, leaks: ['api_key'] },
    comparison: { ok: true, added: [], removed: [], changed: [] },
  })
  const editRouting = assertCodingFlowFollowupSmokeResponse({
    output: [
      'Result',
      '- Outcome: stopped',
      '- Detail: ambiguous-target',
      'Action result',
      '- Task: edit-file',
      '- Failed files: (missing-target) (ambiguous-target)',
    ].join('\n'),
    prompt,
    redaction: { ok: true, leaks: [] },
    comparison: { ok: true, added: [], removed: [], changed: [] },
  })
  const routingDiagnostics = buildCodingFlowFollowupRoutingDiagnostics({
    prompt,
    output: passing.failures.join('\n'),
    executionPath: 'direct-provider-explanation',
  })
  const serialized = JSON.stringify({ context, prompt, redacted: redaction.redacted })
  const passed =
    context.previousOutcome === 'stopped' &&
    context.targetFile === 'note.txt' &&
    context.failedFiles.join(',') === 'note.txt' &&
    routingDiagnostics.followupPromptIntent === 'explain-failure' &&
    routingDiagnostics.nonMutatingFollowup &&
    routingDiagnostics.followupExecutionPath === 'direct-provider-explanation' &&
    routingDiagnostics.enteredEditTargetResolution === false &&
    routingDiagnostics.ambiguousTargetDetected === false &&
    evalScriptWrapped &&
    prompt.includes('Explain only') &&
    prompt.includes('Do not claim the previous coding task is complete') &&
    passing.ok &&
    !ignoresContext.ok &&
    statusForCodingFlowFollowupAssertion(ignoresContext).statusDetail === 'context-missing' &&
    !claimsSuccess.ok &&
    statusForCodingFlowFollowupAssertion(claimsSuccess).statusDetail === 'follow-up-claimed-success' &&
    !mutationLeak.ok &&
    statusForCodingFlowFollowupAssertion(mutationLeak).statusDetail === 'fixture-mutation-leak' &&
    !leak.ok &&
    statusForCodingFlowFollowupAssertion(leak).statusDetail === 'redaction-failure' &&
    !editRouting.ok &&
    statusForCodingFlowFollowupAssertion(editRouting).statusDetail === 'follow-up-entered-edit-routing' &&
    editRouting.routing.enteredEditTargetResolution &&
    editRouting.routing.ambiguousTargetDetected &&
    redaction.ok &&
    !serialized.includes('.private-agents-real') &&
    !serialized.includes('.private-agents/config.json') &&
    !serialized.includes('sk-live-secret') &&
    !serialized.includes('sk-url-secret')

  console.log(`previousOutcome=${context.previousOutcome}`)
  console.log(`targetFile=${context.targetFile}`)
  console.log(`failedFiles=${context.failedFiles.join(',')}`)
  console.log(`followupPromptIntent=${routingDiagnostics.followupPromptIntent}`)
  console.log(`followupExecutionPath=${routingDiagnostics.followupExecutionPath}`)
  console.log(`nonMutatingFollowup=${routingDiagnostics.nonMutatingFollowup}`)
  console.log(`enteredEditTargetResolution=${routingDiagnostics.enteredEditTargetResolution}`)
  console.log(`ambiguousTargetDetected=${routingDiagnostics.ambiguousTargetDetected}`)
  console.log(`evalScriptAsyncWrapper=${evalScriptWrapped ? 'pass' : 'fail'}`)
  console.log(`responseAssertion=${passing.ok ? 'pass' : 'fail'}`)
  console.log(`ignoresContextStatus=${statusForCodingFlowFollowupAssertion(ignoresContext).statusDetail}`)
  console.log(`claimsSuccessStatus=${statusForCodingFlowFollowupAssertion(claimsSuccess).statusDetail}`)
  console.log(`mutationLeakStatus=${statusForCodingFlowFollowupAssertion(mutationLeak).statusDetail}`)
  console.log(`editRoutingStatus=${statusForCodingFlowFollowupAssertion(editRouting).statusDetail}`)
  console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
  console.log(`[${passed ? 'PASS' : 'FAIL'}] real-coding-flow-followup-smoke-dry-run`)
  process.exit(passed ? 0 : 1)
}

async function runRealCodingFlowFollowupSmoke() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-coding-flow-followup-smoke')
  console.log('homeRead=false')
  console.log('defaultSmoke=skipped')
  console.log('realProviderHome=runtime-only')
  console.log('fixtureMutationAllowed=false')

  if (!realHome) {
    const report = {
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-coding-flow-followup-smoke',
      provider: 'real',
      mode: 'explicit-opt-in',
      status: 'CONFIG',
      statusDetail: 'config-failure',
      reportPath,
      realProviderExecution: true,
      modelTurn: false,
      writableFixture: false,
      failureCategory: 'provider-readiness',
      failureReason: 'real provider home is not configured; set PRIVATE_AGENTS_REAL_HOME to opt in',
    }
    writeReport(report)
    console.log('[CONFIG] real-coding-flow-followup-smoke status=config-failure')
    console.log(`report=${reportPath}`)
    process.exit(3)
  }

  try {
    ensureHome(realHome, 'real')
  } catch (error) {
    const report = {
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-coding-flow-followup-smoke',
      provider: 'real',
      mode: 'explicit-opt-in',
      status: 'CONFIG',
      statusDetail: 'config-failure',
      reportPath,
      realProviderExecution: true,
      modelTurn: false,
      writableFixture: false,
      failureCategory: 'provider-readiness',
      failureReason: error.message,
    }
    writeReport(report)
    console.log('[CONFIG] real-coding-flow-followup-smoke status=config-failure')
    console.log(`report=${reportPath}`)
    process.exit(3)
  }

  const repoBefore = await readRepoStatusShort()
  const preflight = await runProviderReadinessPreflight()
  const preflightStatus = buildReadonlyPreflightStatus(preflight)
  console.log(`preflight=${preflightStatus.statusDetail}`)
  if (!preflight.ok) {
    const repoAfter = await readRepoStatusShort()
    const report = {
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-coding-flow-followup-smoke',
      provider: 'real',
      mode: 'explicit-opt-in',
      status: preflightStatus.status,
      statusDetail: preflightStatus.statusDetail,
      reportPath,
      realProviderExecution: true,
      modelTurn: false,
      writableFixture: false,
      repositoryClean: repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status,
      failureCategory: preflightStatus.failureCategory,
      failureReason: preflightStatus.failureReason,
      outputTail: preflight.outputTail,
      redaction: {
        ok: true,
        leaks: [],
      },
    }
    writeReport(report)
    console.log(`[${preflightStatus.status}] real-coding-flow-followup-smoke status=${preflightStatus.statusDetail}`)
    console.log(`repositoryClean=${report.repositoryClean}`)
    console.log(`report=${reportPath}`)
    process.exit(preflightStatus.exitCode)
  }

  const runtimeHome = createIsolatedCodingFlowRuntimeHome()
  const auditLogPath = createIsolatedCodingFlowAuditLogPath()
  const fixture = createCodingFlowFixture()
  try {
    const context = buildSyntheticPatchFromNotFoundFollowupContext()
    const prompt = buildCodingFlowFollowupPrompt(context)
    const before = snapshotCodingFlowFixture(fixture.fixtureDir)
    const result = await runDirectProviderExplanationTurn({
      prompt,
      runtimeHome,
      realHome,
      fixtureDir: fixture.fixtureDir,
    })
    const after = snapshotCodingFlowFixture(fixture.fixtureDir)
    const comparison = compareCodingFlowSnapshots(before, after)
    const redaction = redactAndAssertCodingProviderOutput(result.output)
    const redactedOutput = redaction.redacted
    const repoAfter = await readRepoStatusShort()
    const providerFailure = buildCodingFlowSmokeFailureStatus(result, redactedOutput, redaction)
    const assertion = result.code === 0 && !result.timedOut && !classifyProviderReadinessFailure(
      `coding flow follow-up model turn exited ${result.code}`,
      redactedOutput,
      'real',
    )
      ? assertCodingFlowFollowupSmokeResponse({
          output: redactedOutput,
          prompt,
          executionPath: 'direct-provider-explanation',
          redaction,
          comparison,
          repoBefore,
          repoAfter,
        })
      : {
          ok: false,
          failures: [providerFailure.failureReason],
          responseVisible: redactedOutput.trim().length > 0,
          acknowledgesTarget: false,
          acknowledgesFailure: false,
          safeNextAction: false,
          claimsSuccess: false,
          fixtureMutationLeak: comparison.ok === false || comparison.added.length > 0 || comparison.removed.length > 0 || comparison.changed.length > 0,
          repositoryClean: repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status,
          routing: buildCodingFlowFollowupRoutingDiagnostics({
            prompt,
            output: redactedOutput,
            executionPath: 'direct-provider-explanation',
          }),
        }
    const assertionStatus = result.code === 0 && !result.timedOut
      ? statusForCodingFlowFollowupAssertion(assertion)
      : providerFailure
    const report = {
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-coding-flow-followup-smoke',
      provider: 'real',
      mode: 'explicit-opt-in',
      status: assertionStatus.status,
      statusDetail: assertionStatus.statusDetail,
      reportPath,
      realProviderExecution: true,
      modelTurn: true,
      followupExecutionPath: 'direct-provider-explanation',
      syntheticFailureContext: true,
      stoppedSessionCreated: false,
      fixtureMutationAllowed: false,
      runtimeHome: 'isolated-test-root',
      auditIsolation: inspectCodingFlowAuditIsolation({
        auditLogPath,
        repoAfter,
      }),
      fixture: {
        files: fixture.files,
        editableFiles: fixture.editableFiles,
        protectedFiles: fixture.protectedFiles,
        added: comparison.added,
        removed: comparison.removed,
        changed: comparison.changed,
      },
      followupContext: {
        previousOutcome: context.previousOutcome,
        blocker: context.blocker,
        statusDetail: context.statusDetail,
        targetFile: context.targetFile,
        failedFiles: context.failedFiles,
        changedFiles: context.changedFiles,
        verification: context.verification,
        protectedFiles: context.protectedFiles,
        redaction: context.redaction,
      },
      responseAssertion: {
        ok: assertion.ok,
        responseVisible: assertion.responseVisible,
        acknowledgesTarget: assertion.acknowledgesTarget,
        acknowledgesFailure: assertion.acknowledgesFailure,
        safeNextAction: assertion.safeNextAction,
        claimsSuccess: assertion.claimsSuccess,
        fixtureMutationLeak: assertion.fixtureMutationLeak,
      },
      routingDiagnostics: assertion.routing,
      repositoryClean: repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status,
      redaction: {
        ok: redaction.ok,
        leaks: redaction.leaks,
      },
      failureCategory: assertionStatus.failureCategory,
      failureReason: assertionStatus.failureReason || assertion.failures.join('; '),
      nextAction: assertion.ok
        ? 'Continue with the next explicitly authorized validation.'
        : 'Inspect the redacted follow-up response assertion and retry only after fixing the product or smoke contract issue.',
      outputTail: summarizeOutput(redactedOutput),
    }
    writeReport(report)
    console.log(`status=${report.status}`)
    console.log(`statusDetail=${report.statusDetail}`)
    console.log(`repositoryClean=${report.repositoryClean}`)
    console.log(`auditLogKind=${report.auditIsolation.auditLogKind}`)
    console.log(`repoAuditResidueDetected=${report.auditIsolation.repoAuditResidueDetected}`)
    console.log(`fixtureMutationLeak=${report.responseAssertion.fixtureMutationLeak}`)
    console.log(`followupExecutionPath=${report.routingDiagnostics.followupExecutionPath}`)
    console.log(`followupPromptIntent=${report.routingDiagnostics.followupPromptIntent}`)
    console.log(`nonMutatingFollowup=${report.routingDiagnostics.nonMutatingFollowup}`)
    console.log(`enteredEditTargetResolution=${report.routingDiagnostics.enteredEditTargetResolution}`)
    console.log(`ambiguousTargetDetected=${report.routingDiagnostics.ambiguousTargetDetected}`)
    console.log(`responseVisible=${report.responseAssertion.responseVisible}`)
    console.log(`acknowledgesTarget=${report.responseAssertion.acknowledgesTarget}`)
    console.log(`acknowledgesFailure=${report.responseAssertion.acknowledgesFailure}`)
    console.log(`safeNextAction=${report.responseAssertion.safeNextAction}`)
    console.log(`claimsSuccess=${report.responseAssertion.claimsSuccess}`)
    console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
    console.log(`[${report.status}] real-coding-flow-followup-smoke status=${report.statusDetail}`)
    process.exit(assertionStatus.exitCode)
  } finally {
    cleanupCodingFlowFixture(fixture.fixtureDir)
    cleanupIsolatedCodingFlowRuntimeHome(runtimeHome)
    cleanupIsolatedCodingFlowAuditLog(auditLogPath)
  }
}


function runRealCodingFlowDiagnosticsSelfTest() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-coding-flow-diagnostics-self-test')
  console.log('homeRead=false')
  console.log('real-provider execution skipped')
  console.log('modelTurn=false')
  console.log('reportWritten=false')

  const runtimeHome = createIsolatedCodingFlowRuntimeHome()
  const auditLogPath = createIsolatedCodingFlowAuditLogPath()
  const fixture = createCodingFlowFixture()
  try {
    fs.mkdirSync(path.join(runtimeHome, '.private-agents', 'sessions', 'diagnostic-session'), {
      recursive: true,
    })
    fs.writeFileSync(
      path.join(runtimeHome, '.private-agents', 'sessions', 'diagnostic-session', 'transcript.jsonl'),
      '{}\n',
      'utf8',
    )

    const before = snapshotCodingFlowFixture(fixture.fixtureDir)
    const noteStatusBefore = readCodingFlowNoteStatus(fixture.fixtureDir)
    const after = snapshotCodingFlowFixture(fixture.fixtureDir)
    const noteStatusAfter = readCodingFlowNoteStatus(fixture.fixtureDir)
    const comparison = compareCodingFlowSnapshots(before, after)
    const expected = assertOnlyExpectedCodingFixtureChanges(
      comparison,
      ['note.txt'],
      fixture.protectedFiles,
    )
    const result = {
      code: 0,
      timedOut: false,
      stdout: [
        'Action result',
        '- Task: edit-file',
        '- Changed: none',
        '- Failed files: note.txt (patch-from-not-found: mutation instruction missing)',
        '- Failure reason: mutation instruction missing',
        '- Read files: note.txt',
        '- Verification: skipped',
        'Execution summary',
        '- Actions: read (1 run)',
        'Authorization: Bearer sk-live-secret-123456789',
        '/home/wang/.private-agents-real/.private-agents/config.json',
      ].join('\n'),
      stderr: 'api_key=sk-url-secret-123456789',
      output: [
        'Action result',
        '- Task: edit-file',
        '- Changed: none',
        '- Failed files: note.txt (patch-from-not-found: mutation instruction missing)',
        '- Failure reason: mutation instruction missing',
        '- Read files: note.txt',
        '- Verification: skipped',
        'Execution summary',
        '- Actions: read (1 run)',
        'Authorization: Bearer sk-live-secret-123456789',
        '/home/wang/.private-agents-real/.private-agents/config.json',
        'api_key=sk-url-secret-123456789',
      ].join('\n'),
    }
    const redacted = redactProviderOutput(result.output)
    const diagnostics = buildCodingFlowDiagnostics({
      result,
      redactedOutput: redacted,
      comparison,
      expected,
      noteStatusBefore,
      noteStatusAfter,
      runtimeHome,
      auditLogPath,
      repoAfter: { ok: true, status: '', outputTail: '' },
      prompt: fixture.prompt,
      failureCategory: 'changedFiles wrong',
      statusDetail: 'changed-files-wrong',
    })
    const successResult = {
      code: 0,
      timedOut: false,
      stdout: [
        'Edit completed for note.txt. Verification passed.',
        'Result',
        '- Outcome: success',
        'Action result',
        '- Task: edit-file',
        '- Changed: 1 file(s)',
        '- Changed files: note.txt',
        '- Read files: note.txt',
        '- Change summary: note.txt: replaced `status: draft` with `status: ready`',
        '- Verification: passed',
        'Execution summary',
        '- Actions: read, edit (2 run)',
      ].join('\n'),
      stderr: '',
    }
    successResult.output = successResult.stdout
    const successDiagnostics = buildCodingFlowDiagnostics({
      result: successResult,
      redactedOutput: redactProviderOutput(successResult.output),
      comparison: { added: [], removed: [], changed: ['note.txt'] },
      expected: { observed: ['note.txt'], expected: ['note.txt'], protectedChanged: [] },
      noteStatusBefore: 'draft',
      noteStatusAfter: 'ready',
      runtimeHome,
      auditLogPath,
      repoAfter: { ok: true, status: '', outputTail: '' },
      prompt: fixture.prompt,
      failureCategory: 'none',
      statusDetail: 'passed',
    })
    const serialized = JSON.stringify({ diagnostics, successDiagnostics })
    const passed =
      diagnostics.process.modelTurnExitCode === 0 &&
      diagnostics.process.modelTurnTimedOut === false &&
      diagnostics.process.modelTurnOutputBytes > 0 &&
      diagnostics.process.outputMarkers.hasActionResult &&
      !diagnostics.process.outputMarkers.hasResultBlock &&
      diagnostics.routing.cliCommandKind === 'print-non-interactive' &&
      diagnostics.routing.cwdKind === 'ts-shell-root' &&
      diagnostics.routing.projectKind === 'isolated-fixture' &&
      diagnostics.routing.promptBytes > 0 &&
      diagnostics.routing.promptIntentHint === 'single-file-edit' &&
      diagnostics.routing.repoAwareSummaryDetected === false &&
      diagnostics.routing.enteredSessionRuntime === true &&
      diagnostics.routing.codingResultPresent === true &&
      diagnostics.routing.resultBlockPresent === false &&
      diagnostics.routing.toolExecutionMarkerPresent === true &&
      diagnostics.fixture.fixtureChangedFiles.length === 0 &&
      diagnostics.fixture.expectedChangedFiles.join(',') === 'note.txt' &&
      diagnostics.fixture.noteStatusBefore === 'draft' &&
      diagnostics.fixture.noteStatusAfter === 'draft' &&
      diagnostics.runtime.runtimeHomeKind === 'isolated-test-root' &&
      diagnostics.runtime.runtimeHomeState.existsAfterTurn &&
      diagnostics.runtime.runtimeHomeState.privateAgentsDirCreated &&
      diagnostics.runtime.runtimeHomeState.sessionArtifactCount === 1 &&
      diagnostics.runtime.realProviderHomeUsedForRuntime === false &&
      diagnostics.runtime.configHomeKind === 'explicit-real-provider-home' &&
      diagnostics.auditIsolation.auditLogKind === 'isolated-test-root' &&
      diagnostics.auditIsolation.repoAuditResidueDetected === false &&
      diagnostics.auditIsolation.auditResidueCleaned === false &&
      diagnostics.auditIsolation.auditLogCreated === false &&
      diagnostics.mutation.taskKind === 'edit-file' &&
      diagnostics.mutation.actionSequence.join(',') === 'read' &&
      diagnostics.mutation.targetFile === 'note.txt' &&
      diagnostics.mutation.mutationInstructionPresent === false &&
      diagnostics.mutation.replaceFromPresent === false &&
      diagnostics.mutation.replaceToPresent === false &&
      diagnostics.mutation.replaceFieldSource === 'none' &&
      diagnostics.mutation.diagnosticSource === 'structured-result' &&
      diagnostics.mutation.patchFailureCode === 'patch-from-not-found' &&
      successDiagnostics.mutation.taskKind === 'edit-file' &&
      successDiagnostics.mutation.actionSequence.join(',') === 'read,edit' &&
      successDiagnostics.mutation.targetFile === 'note.txt' &&
      successDiagnostics.mutation.mutationInstructionPresent === true &&
      successDiagnostics.mutation.replaceFromPresent === true &&
      successDiagnostics.mutation.replaceToPresent === true &&
      successDiagnostics.mutation.replaceFieldSource === 'redacted-output-summary' &&
      successDiagnostics.mutation.diagnosticSource === 'structured-success-no-literal-replace' &&
      successDiagnostics.mutation.patchFailureCode === 'none' &&
      diagnostics.classification.failureStage === 'mutation-assertion' &&
      diagnostics.classification.failureCategory === 'changedFiles wrong' &&
      diagnostics.classification.statusDetail === 'changed-files-wrong' &&
      !serialized.includes('.private-agents-real') &&
      !serialized.includes('.private-agents/config.json') &&
      !serialized.includes('sk-live-secret') &&
      !serialized.includes('sk-url-secret')

    console.log(`modelTurnExitCode=${diagnostics.process.modelTurnExitCode}`)
    console.log(`modelTurnTimedOut=${diagnostics.process.modelTurnTimedOut}`)
    console.log(`noteStatusBefore=${diagnostics.fixture.noteStatusBefore}`)
    console.log(`noteStatusAfter=${diagnostics.fixture.noteStatusAfter}`)
    console.log(`repoAwareSummaryDetected=${diagnostics.routing.repoAwareSummaryDetected}`)
    console.log(`promptIntentHint=${diagnostics.routing.promptIntentHint}`)
    console.log(`runtimeHomeKind=${diagnostics.runtime.runtimeHomeKind}`)
    console.log(`auditLogKind=${diagnostics.auditIsolation.auditLogKind}`)
    console.log(`mutationInstructionPresent=${diagnostics.mutation.mutationInstructionPresent}`)
    console.log(`mutationDiagnosticSource=${diagnostics.mutation.diagnosticSource}`)
    console.log(`successReplaceFromPresent=${successDiagnostics.mutation.replaceFromPresent}`)
    console.log(`successReplaceToPresent=${successDiagnostics.mutation.replaceToPresent}`)
    console.log(`successReplaceFieldSource=${successDiagnostics.mutation.replaceFieldSource}`)
    console.log(`patchFailureCode=${diagnostics.mutation.patchFailureCode}`)
    console.log(`failureStage=${diagnostics.classification.failureStage}`)
    console.log(`redaction=${passed ? 'pass' : 'fail'}`)
    console.log(`[${passed ? 'PASS' : 'FAIL'}] real-coding-flow-diagnostics-self-test`)
    process.exitCode = passed ? 0 : 1
  } finally {
    cleanupCodingFlowFixture(fixture.fixtureDir)
    cleanupIsolatedCodingFlowRuntimeHome(runtimeHome)
    cleanupIsolatedCodingFlowAuditLog(auditLogPath)
  }
}

function runRealCodingFlowAuditIsolationSelfTest() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-coding-flow-audit-isolation-self-test')
  console.log('homeRead=false')
  console.log('real-provider execution skipped')
  console.log('modelTurn=false')
  console.log('reportWritten=false')

  const auditLogPath = createIsolatedCodingFlowAuditLogPath()
  try {
    const cleanRepo = { ok: true, status: '', outputTail: '' }
    const dirtyRepo = {
      ok: true,
      status: '?? packages/ts-shell/.sisyphus/audit/permissions.jsonl',
      outputTail: '',
    }
    const beforeCreate = inspectCodingFlowAuditIsolation({
      auditLogPath,
      repoAfter: cleanRepo,
      auditResidueCleaned: false,
    })
    fs.writeFileSync(auditLogPath, '{"eventType":"permission_check"}\n', 'utf8')
    const afterCreate = inspectCodingFlowAuditIsolation({
      auditLogPath,
      repoAfter: cleanRepo,
      auditResidueCleaned: false,
    })
    const residueDetected = inspectCodingFlowAuditIsolation({
      auditLogPath,
      repoAfter: dirtyRepo,
      auditResidueCleaned: true,
    })
    const serialized = JSON.stringify({ beforeCreate, afterCreate, residueDetected })
    const passed =
      beforeCreate.auditLogKind === 'isolated-test-root' &&
      beforeCreate.repoAuditResidueDetected === false &&
      beforeCreate.auditResidueCleaned === false &&
      beforeCreate.auditLogCreated === false &&
      afterCreate.auditLogKind === 'isolated-test-root' &&
      afterCreate.auditLogCreated === true &&
      afterCreate.repoAuditResidueDetected === false &&
      residueDetected.repoAuditResidueDetected === true &&
      residueDetected.auditResidueCleaned === true &&
      !serialized.includes(auditLogPath) &&
      !serialized.includes('.private-agents-real') &&
      !serialized.includes('.private-agents/config.json')

    console.log(`auditLogKind=${afterCreate.auditLogKind}`)
    console.log(`auditLogCreated=${afterCreate.auditLogCreated}`)
    console.log(`repoAuditResidueDetected=${residueDetected.repoAuditResidueDetected}`)
    console.log(`auditResidueCleaned=${residueDetected.auditResidueCleaned}`)
    console.log(`redaction=${passed ? 'pass' : 'fail'}`)
    console.log(`[${passed ? 'PASS' : 'FAIL'}] real-coding-flow-audit-isolation-self-test`)
    process.exitCode = passed ? 0 : 1
  } finally {
    cleanupIsolatedCodingFlowAuditLog(auditLogPath)
  }
}

function assertReadonlySmokeSuccess(output, snapshotComparison, redaction) {
  const failures = []
  if (!redaction.ok) {
    failures.push(`redaction leak detected: ${redaction.leaks.join(',') || 'unknown'}`)
  }
  if (!snapshotComparison.ok) {
    const changed = [
      ...snapshotComparison.added.map((name) => `added:${name}`),
      ...snapshotComparison.removed.map((name) => `removed:${name}`),
      ...snapshotComparison.changed.map((name) => `changed:${name}`),
    ]
    failures.push(`fixture mutated: ${changed.join(',') || 'unknown'}`)
  }
  if (!/(^|\r?\n)Result\s*(\r?\n|$)/.test(output) || !/-\s*Outcome:\s*success/i.test(output)) {
    failures.push('terminal result success was not visible')
  }
  if (!readonlyChangedFilesEmptyVisible(output, snapshotComparison)) {
    failures.push('changedFiles empty was not visible')
  }
  return {
    ok: failures.length === 0,
    failures,
  }
}

function readonlyChangedFilesEmptyVisible(output, snapshotComparison) {
  return /-\s*(Changed|Changed files):\s*none/i.test(output) ||
    (snapshotComparison.ok &&
      snapshotComparison.added.length === 0 &&
      snapshotComparison.removed.length === 0 &&
      snapshotComparison.changed.length === 0)
}

function readonlyChangedFiles(snapshotComparison) {
  return [
    ...snapshotComparison.added,
    ...snapshotComparison.removed,
    ...snapshotComparison.changed,
  ].sort()
}

function buildReadonlyProviderAttempts() {
  const approvedHomeSelected = realHome === approvedRealProviderHome
  const effective = buildEffectiveProviderEnv(
    approvedHomeSelected
      ? { ...process.env, PRIVATE_AGENTS_REAL_PROVIDER_SMOKE: '1' }
      : process.env,
  )
  if (effective.providerEnvError) {
    return {
      configSource: effective.configSource,
      primary: { env: {}, safeLabel: 'real-provider' },
      fallback: undefined,
      fallbackConfigured: false,
    }
  }
  const canonical = canonicalProviderEnv(effective.env)
  return {
    configSource: effective.configSource,
    primary: { env: canonical.env, safeLabel: canonical.providerSafeLabel },
    fallback: canonical.fallback
      ? {
          env: fallbackProviderEnvAsPrimary(canonical.fallback.env),
          safeLabel: canonical.fallback.providerSafeLabel,
        }
      : undefined,
    fallbackConfigured: Boolean(canonical.fallback),
  }
}

function fallbackProviderEnvAsPrimary(fallbackEnv) {
  return {
    PRIVATE_AGENTS_REAL_PROVIDER:
      fallbackEnv.PRIVATE_AGENTS_REAL_FALLBACK_PROVIDER ?? fallbackEnv.PRIVATE_AGENTS_REAL_PROVIDER,
    ...(fallbackEnv.PRIVATE_AGENTS_REAL_FALLBACK_API_KEY
      ? { PRIVATE_AGENTS_REAL_API_KEY: fallbackEnv.PRIVATE_AGENTS_REAL_FALLBACK_API_KEY }
      : {}),
    ...(fallbackEnv.PRIVATE_AGENTS_REAL_FALLBACK_BASE_URL
      ? { PRIVATE_AGENTS_REAL_BASE_URL: fallbackEnv.PRIVATE_AGENTS_REAL_FALLBACK_BASE_URL }
      : {}),
    ...(fallbackEnv.PRIVATE_AGENTS_REAL_FALLBACK_MODEL
      ? { PRIVATE_AGENTS_REAL_MODEL: fallbackEnv.PRIVATE_AGENTS_REAL_FALLBACK_MODEL }
      : {}),
  }
}

function shouldAttemptReadonlyFallback(failureStatus, fallbackConfigured) {
  return fallbackConfigured && failureStatus.exitCode === 2 &&
    failureStatus.statusDetail === 'provider-network-inconclusive'
}

function fallbackOutcomeForReadonlyAttempt(attempt) {
  if (!attempt) return 'skipped'
  if (attempt.success?.ok) return 'passed'
  if (attempt.failureStatus?.exitCode === 2) return 'inconclusive'
  if (attempt.failureStatus?.exitCode === 3) return 'skipped'
  return 'failed'
}

async function runReadonlyModelTurnAttempt({ fixture, providerEnv }) {
  const before = snapshotReadonlyFixture(fixture.fixtureDir)
  const result = await run(process.execPath, [
    tsxCliPath,
    cliEntryPath,
    '--project',
    fixture.fixtureDir,
    '--print',
    fixture.prompt,
  ], {
    cwd: tsShellRoot,
    env: {
      HOME: realHome,
      USERPROFILE: realHome,
      PRIVATE_AGENTS_PROVIDER_MODE: 'real',
      ...providerEnv,
    },
    timeoutMs: 420000,
  })
  const after = snapshotReadonlyFixture(fixture.fixtureDir)
  const comparison = compareReadonlySnapshots(before, after)
  const redaction = redactAndAssertReadonlyProviderOutput(result.output)
  const redactedOutput = redaction.redacted
  const providerFailure = classifyProviderReadinessFailure(
    `read-only model turn exited ${result.code}`,
    redactedOutput,
    'real',
  )
  if (result.code === 0 && !result.timedOut && !providerFailure) {
    const success = assertReadonlySmokeSuccess(redactedOutput, comparison, redaction)
    return { result, comparison, redaction, redactedOutput, success }
  }
  return {
    result,
    comparison,
    redaction,
    redactedOutput,
    failureStatus: buildReadonlySmokeFailureStatus(result, redactedOutput, redaction),
  }
}

async function runRealReadonlyCodingSmoke() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-readonly-coding-smoke')
  renderReadonlyPreflightNotice({ modelTurn: true, readOnlyFixture: true, smoke: true })
  console.log('homeRead=false')
  console.log('defaultSmoke=skipped')
  console.log('realProviderHome=runtime-only')
  const providerAttempts = buildReadonlyProviderAttempts()
  console.log(`configSource=${providerAttempts.configSource}`)

  const preflight = await runProviderReadinessPreflight()
  const preflightStatus = buildReadonlyPreflightStatus(preflight)
  console.log(`[${preflightStatus.status}] real-readonly-coding-preflight status=${preflightStatus.statusDetail}`)
  if (!preflight.ok) {
    if (preflight.outputTail) {
      console.log(preflight.outputTail)
    }
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-readonly-coding-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: preflightStatus.status,
      statusDetail: preflightStatus.statusDetail,
      reportPath,
      realProviderExecution: true,
      modelTurn: false,
      readOnlyFixture: false,
      failureCategory: preflightStatus.failureCategory,
      failureReason: preflightStatus.failureReason,
      outputTail: preflight.outputTail,
    })
    process.exit(preflightStatus.exitCode)
  }

  const fixture = createReadonlyCodingFixture()
  try {
    const primary = await runReadonlyModelTurnAttempt({
      fixture,
      providerEnv: providerAttempts.primary.env,
    })
    let finalAttempt = primary
    let fallbackAttempted = false
    let fallbackOutcome = 'skipped'
    if (
      primary.failureStatus &&
      shouldAttemptReadonlyFallback(primary.failureStatus, providerAttempts.fallbackConfigured) &&
      providerAttempts.fallback
    ) {
      fallbackAttempted = true
      finalAttempt = await runReadonlyModelTurnAttempt({
        fixture,
        providerEnv: providerAttempts.fallback.env,
      })
      fallbackOutcome = fallbackOutcomeForReadonlyAttempt(finalAttempt)
    } else {
      fallbackOutcome = fallbackOutcomeForReadonlyAttempt(undefined)
    }

    const { result, comparison, redaction, redactedOutput } = finalAttempt

    if (finalAttempt.success) {
      const success = finalAttempt.success
      const changedFiles = readonlyChangedFiles(comparison)
      const report = {
        generatedAt: new Date().toISOString(),
        capability: 'real-readonly-coding-smoke',
        provider: 'real',
        mode: 'opt-in-smoke',
        status: success.ok ? 'PASS' : 'FAIL',
        statusDetail: success.ok ? 'passed' : 'product-regression',
        reportPath,
        realProviderExecution: true,
        modelTurn: true,
        readOnlyFixture: true,
        fixture: {
          files: fixture.files,
          noMutation: comparison.ok,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        changedFiles,
        terminalResultVisible: /(^|\r?\n)Result\s*(\r?\n|$)/.test(redactedOutput),
        changedFilesEmptyVisible: readonlyChangedFilesEmptyVisible(redactedOutput, comparison),
        primaryAttempted: true,
        primaryFailureClass: primary.failureStatus?.statusDetail ?? 'none',
        fallbackConfigured: providerAttempts.fallbackConfigured,
        fallbackAttempted,
        fallbackOutcome,
        redaction: {
          ok: redaction.ok,
          leaks: redaction.leaks,
        },
        failureCategory: success.ok ? 'none' : 'task-execution-failure',
        failureReason: success.failures.join('; '),
        outputTail: summarizeOutput(redactedOutput),
      }
      writeReport(report)
      console.log(`fixtureFiles=${fixture.files.join(',')}`)
      console.log(`noMutation=${comparison.ok}`)
      console.log(`changedFiles=${JSON.stringify(changedFiles)}`)
      console.log(`terminalResultVisible=${report.terminalResultVisible}`)
      console.log(`changedFilesEmptyVisible=${report.changedFilesEmptyVisible}`)
      console.log('primaryAttempted=true')
      console.log(`primaryFailureClass=${report.primaryFailureClass}`)
      console.log(`fallbackConfigured=${providerAttempts.fallbackConfigured ? 'true' : 'false'}`)
      console.log(`fallbackAttempted=${fallbackAttempted ? 'true' : 'false'}`)
      console.log(`fallbackOutcome=${fallbackOutcome}`)
      console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
      if (!success.ok) {
        console.log(`failureReason=${report.failureReason}`)
      }
      console.log(`[${success.ok ? 'PASS' : 'FAIL'}] real-readonly-coding-smoke`)
      process.exit(success.ok ? 0 : 1)
    }

    const failureStatus = finalAttempt.failureStatus
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-readonly-coding-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: failureStatus.status,
      statusDetail: failureStatus.statusDetail,
      reportPath,
      realProviderExecution: true,
      modelTurn: true,
      readOnlyFixture: true,
      fixture: {
        files: fixture.files,
        noMutation: comparison.ok,
        added: comparison.added,
        removed: comparison.removed,
        changed: comparison.changed,
      },
      changedFiles: readonlyChangedFiles(comparison),
      primaryAttempted: true,
      primaryFailureClass: primary.failureStatus?.statusDetail ?? 'none',
      fallbackConfigured: providerAttempts.fallbackConfigured,
      fallbackAttempted,
      fallbackOutcome,
      redaction: {
        ok: redaction.ok,
        leaks: redaction.leaks,
      },
      failureCategory: failureStatus.failureCategory,
      failureReason: failureStatus.failureReason,
      outputTail: failureStatus.exitCode === 2 ? 'provider-network-inconclusive' : summarizeOutput(redactedOutput),
    })
    console.log(`fixtureFiles=${fixture.files.join(',')}`)
    console.log(`noMutation=${comparison.ok}`)
    console.log(`changedFiles=${JSON.stringify(readonlyChangedFiles(comparison))}`)
    console.log(`changedFilesEmptyVisible=${readonlyChangedFilesEmptyVisible(redactedOutput, comparison)}`)
    console.log('primaryAttempted=true')
    console.log(`primaryFailureClass=${primary.failureStatus?.statusDetail ?? 'none'}`)
    console.log(`fallbackConfigured=${providerAttempts.fallbackConfigured ? 'true' : 'false'}`)
    console.log(`fallbackAttempted=${fallbackAttempted ? 'true' : 'false'}`)
    console.log(`fallbackOutcome=${fallbackOutcome}`)
    console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
    console.log(`[${failureStatus.status}] real-readonly-coding-smoke status=${failureStatus.statusDetail}`)
    if (redactedOutput && failureStatus.exitCode !== 2) {
      console.log(summarizeOutput(redactedOutput))
    }
    process.exit(failureStatus.exitCode)
  } finally {
    cleanupReadonlyFixture(fixture.fixtureDir)
  }
}

function runRealReadonlyCodingDryRun() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-readonly-coding-dry-run')
  console.log('homeRead=false')
  console.log('real-provider execution skipped')
  console.log('modelTurn=false')
  console.log('reportWritten=false')
  console.log('defaultSmoke=skipped')

  const fixture = createReadonlyCodingFixture()
  try {
    const before = snapshotReadonlyFixture(fixture.fixtureDir)
    const after = snapshotReadonlyFixture(fixture.fixtureDir)
    const comparison = compareReadonlySnapshots(before, after)
    const redaction = redactAndAssertReadonlyProviderOutput(
      [
        'Authorization: Bearer sk-live-secret-123456789',
        'api_key=sk-url-secret-123456789',
        'refresh_token=refresh-secret',
        'D:/Test/home-sf/.private-agents/config.json',
      ].join('\n'),
    )
    const report = {
      capability: 'real-readonly-coding-smoke',
      provider: 'real',
      mode: 'dry-run',
      optInRequired: true,
      realProviderExecution: false,
      modelTurn: false,
      fixture: {
        files: fixture.files,
        noMutation: comparison.ok,
        added: comparison.added,
        removed: comparison.removed,
        changed: comparison.changed,
      },
      resultContract: {
        expectedTerminalResult: 'success-or-attributed-provider-failure',
        expectedChangedFiles: [],
        requiresChangedFilesEmpty: true,
      },
      redaction: {
        ok: redaction.ok,
        leaks: redaction.leaks,
      },
      skip: {
        defaultGate: true,
        reason: 'real-provider read-only coding smoke requires explicit opt-in',
      },
    }

    const promptOk =
      fixture.prompt.includes('read-only task') &&
      fixture.prompt.includes('src/context.txt') &&
      fixture.prompt.includes('Reply in the terminal only') &&
      fixture.prompt.includes('Do not run shell commands')
    const reportOk =
      report.optInRequired &&
      !report.realProviderExecution &&
      !report.modelTurn &&
      report.fixture.noMutation &&
      report.resultContract.requiresChangedFilesEmpty &&
      report.redaction.ok &&
      report.skip.defaultGate
    const passed = promptOk && reportOk

    console.log(`fixtureFiles=${fixture.files.join(',')}`)
    console.log(`noMutation=${comparison.ok}`)
    console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
    console.log(`skipReason=${report.skip.reason}`)
    console.log(`[${passed ? 'PASS' : 'FAIL'}] real-readonly-coding-dry-run-contract`)
    process.exit(passed ? 0 : 1)
  } finally {
    cleanupReadonlyFixture(fixture.fixtureDir)
  }
}

async function runRealCodingFlowSmoke() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-coding-flow-smoke')
  renderCodingFlowPreflightNotice({ modelTurn: true, writableFixture: true })
  console.log('homeRead=false')
  console.log('defaultSmoke=skipped')
  console.log('realProviderHome=runtime-only')

  if (!realHome) {
    const status = {
      status: 'CONFIG',
      statusDetail: 'config-failure',
      exitCode: 3,
      failureCategory: 'auth/config failure',
      failureReason: 'config-failure: set PRIVATE_AGENTS_REAL_HOME on Linux/WSL before running coding flow smoke',
    }
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-coding-flow-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: status.status,
      statusDetail: status.statusDetail,
      reportPath,
      realProviderExecution: false,
      modelTurn: false,
      writableFixture: false,
      failureCategory: status.failureCategory,
      failureReason: status.failureReason,
      ...buildCodingFlowContractFields({
        failureCategory: status.failureCategory,
        statusDetail: status.statusDetail,
      }),
    })
    console.log(`[${status.status}] real-coding-flow-smoke status=${status.statusDetail}`)
    console.log(status.failureReason)
    process.exit(status.exitCode)
  }

  const repoBefore = await readRepoStatusShort()
  if (!repoBefore.ok || repoBefore.status) {
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-coding-flow-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: 'FAIL',
      statusDetail: 'no-mutation-guard-failure',
      reportPath,
      realProviderExecution: false,
      modelTurn: false,
      writableFixture: false,
      failureCategory: 'no-mutation guard failure',
      failureReason: repoBefore.ok
        ? 'no-mutation guard failure: repository was not clean before smoke'
        : 'no-mutation guard failure: repository status could not be checked before smoke',
      ...buildCodingFlowContractFields({
        failureCategory: 'no-mutation guard failure',
        statusDetail: 'no-mutation-guard-failure',
        repoBefore,
      }),
      outputTail: repoBefore.outputTail,
    })
    console.log('[FAIL] real-coding-flow-smoke status=no-mutation-guard-failure')
    console.log('failureReason=no-mutation guard failure: repository must be clean before opt-in coding flow smoke')
    process.exit(1)
  }

  const preflight = await runProviderReadinessPreflight()
  const preflightStatus = buildCodingFlowPreflightStatus(preflight)
  console.log(`[${preflightStatus.status}] real-coding-flow-preflight status=${preflightStatus.statusDetail}`)
  if (!preflight.ok) {
    if (preflight.outputTail) {
      console.log(preflight.outputTail)
    }
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-coding-flow-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: preflightStatus.status,
      statusDetail: preflightStatus.statusDetail,
      reportPath,
      realProviderExecution: true,
      modelTurn: false,
      writableFixture: false,
      failureCategory: codingFlowFailureCategoryForStatus(
        preflightStatus.statusDetail,
        preflightStatus.failureCategory,
      ),
      failureReason: preflightStatus.failureReason,
      ...buildCodingFlowContractFields({
        failureCategory: codingFlowFailureCategoryForStatus(
          preflightStatus.statusDetail,
          preflightStatus.failureCategory,
        ),
        statusDetail: preflightStatus.statusDetail,
        repoBefore,
        output: preflight.outputTail,
      }),
      outputTail: preflight.outputTail,
    })
    process.exit(preflightStatus.exitCode)
  }

  const runtimeHome = createIsolatedCodingFlowRuntimeHome()
  const auditLogPath = createIsolatedCodingFlowAuditLogPath()
  const fixture = createCodingFlowFixture()
  try {
    const noteStatusBefore = readCodingFlowNoteStatus(fixture.fixtureDir)
    const before = snapshotCodingFlowFixture(fixture.fixtureDir)
    const result = await run(process.execPath, [
      tsxCliPath,
      cliEntryPath,
      '--project',
      fixture.fixtureDir,
      '--non-interactive-approval',
      'allow-once',
      '--print',
      fixture.prompt,
    ], {
      cwd: tsShellRoot,
      env: {
        HOME: runtimeHome,
        USERPROFILE: runtimeHome,
        PRIVATE_AGENTS_HOME_OVERRIDE: realHome,
        PRIVATE_AGENTS_REAL_HOME: realHome,
        PRIVATE_AGENTS_PROVIDER_MODE: 'real',
        PRIVATE_AGENTS_AUDIT_LOG_PATH: auditLogPath,
      },
      timeoutMs: 420000,
    })
    const after = snapshotCodingFlowFixture(fixture.fixtureDir)
    const noteStatusAfter = readCodingFlowNoteStatus(fixture.fixtureDir)
    const comparison = compareCodingFlowSnapshots(before, after)
    const expected = assertOnlyExpectedCodingFixtureChanges(
      comparison,
      ['note.txt'],
      fixture.protectedFiles,
    )
    const noteContent = fs.readFileSync(path.join(fixture.fixtureDir, 'note.txt'), 'utf8')
    const redaction = redactAndAssertCodingProviderOutput(result.output)
    const redactedOutput = redaction.redacted
    const repoAfter = await readRepoStatusShort()
    const providerFailure = classifyProviderReadinessFailure(
      `coding flow model turn exited ${result.code}`,
      redactedOutput,
      'real',
    )

    if (result.code === 0 && !result.timedOut && !providerFailure) {
      const success = assertCodingFlowSmokeSuccess(
        redactedOutput,
        comparison,
        expected,
        noteContent,
        redaction,
        repoBefore,
        repoAfter,
      )
      const report = {
        generatedAt: new Date().toISOString(),
        capability: 'real-provider-coding-flow-smoke',
        provider: 'real',
        mode: 'opt-in-smoke',
        status: success.ok ? 'PASS' : 'FAIL',
        statusDetail: success.ok ? 'passed' : success.statusDetail,
        reportPath,
        realProviderExecution: true,
        modelTurn: true,
        writableFixture: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          editableFiles: fixture.editableFiles,
          protectedFiles: fixture.protectedFiles,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean: repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status,
        terminalResultVisible: /(^|\r?\n)Result\s*(\r?\n|$)/.test(redactedOutput),
        changedFiles: expected.observed,
        verification: success.ok ? 'passed' : 'failed',
        redaction: {
          ok: redaction.ok,
          leaks: redaction.leaks,
        },
        failureCategory: success.failureCategory,
        failureReason: success.failures.join('; '),
        nextAction: nextActionForCodingFlowFailure(
          success.failureCategory,
          success.statusDetail,
        ),
        outputTail: summarizeOutput(redactedOutput),
        diagnostics: buildCodingFlowDiagnostics({
          result,
          redactedOutput,
          comparison,
          expected,
          noteStatusBefore,
          noteStatusAfter,
          runtimeHome,
          auditLogPath,
          repoAfter,
          prompt: fixture.prompt,
          failureCategory: success.failureCategory,
          statusDetail: success.statusDetail,
        }),
      }
      writeReport(report)
      console.log(`fixtureFiles=${fixture.files.join(',')}`)
      console.log(`changedFiles=${expected.observed.join(',')}`)
      console.log(`protectedUnchanged=${expected.protectedChanged.length === 0}`)
      console.log(`repositoryClean=${report.repositoryClean}`)
      console.log(`terminalResultVisible=${report.terminalResultVisible}`)
      console.log(`verification=${report.verification}`)
      console.log(`noteStatusBefore=${noteStatusBefore}`)
      console.log(`noteStatusAfter=${noteStatusAfter}`)
      console.log(`repoAwareSummaryDetected=${report.diagnostics.routing.repoAwareSummaryDetected}`)
      console.log(`enteredSessionRuntime=${report.diagnostics.routing.enteredSessionRuntime}`)
      console.log(`auditLogKind=${report.diagnostics.auditIsolation.auditLogKind}`)
      console.log(`repoAuditResidueDetected=${report.diagnostics.auditIsolation.repoAuditResidueDetected}`)
      console.log(`failureStage=${report.diagnostics.classification.failureStage}`)
      console.log(`outputMarkers=${JSON.stringify(report.diagnostics.process.outputMarkers)}`)
      console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
      if (!success.ok) {
        console.log(`failureReason=${report.failureReason}`)
      }
      console.log(`[${success.ok ? 'PASS' : 'FAIL'}] real-coding-flow-smoke`)
      process.exit(success.ok ? 0 : 1)
    }

    const failureStatus = buildCodingFlowSmokeFailureStatus(result, redactedOutput, redaction)
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-coding-flow-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: failureStatus.status,
      statusDetail: failureStatus.statusDetail,
      reportPath,
      realProviderExecution: true,
      modelTurn: true,
      writableFixture: true,
      runtimeHome: 'isolated-test-root',
      fixture: {
        files: fixture.files,
        editableFiles: fixture.editableFiles,
        protectedFiles: fixture.protectedFiles,
        added: comparison.added,
        removed: comparison.removed,
        changed: comparison.changed,
      },
      failureCategory: failureStatus.failureCategory,
      failureReason: failureStatus.failureReason,
      ...buildCodingFlowContractFields({
        failureCategory: failureStatus.failureCategory,
        statusDetail: failureStatus.statusDetail,
        changedFiles: expected.observed,
        verification: expected.ok ? 'blocked' : 'failed',
        redaction,
        repoBefore,
        repoAfter,
        output: redactedOutput,
      }),
      outputTail: summarizeOutput(redactedOutput),
      diagnostics: buildCodingFlowDiagnostics({
        result,
        redactedOutput,
        comparison,
        expected,
        noteStatusBefore,
        noteStatusAfter,
        runtimeHome,
        auditLogPath,
        repoAfter,
        prompt: fixture.prompt,
        failureCategory: failureStatus.failureCategory,
        statusDetail: failureStatus.statusDetail,
      }),
    })
    console.log(`fixtureFiles=${fixture.files.join(',')}`)
    console.log(`changedFiles=${expected.observed.join(',')}`)
    console.log(`protectedUnchanged=${expected.protectedChanged.length === 0}`)
    console.log(`repositoryClean=${repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status}`)
    console.log(`terminalResultVisible=${/(^|\r?\n)Result\s*(\r?\n|$)/.test(redactedOutput)}`)
    console.log(`verification=${expected.ok ? 'blocked' : 'failed'}`)
    console.log(`noteStatusBefore=${noteStatusBefore}`)
    console.log(`noteStatusAfter=${noteStatusAfter}`)
    const failureDiagnostics = buildCodingFlowDiagnostics({
      result,
      redactedOutput,
      comparison,
      expected,
      noteStatusBefore,
      noteStatusAfter,
      runtimeHome,
      auditLogPath,
      repoAfter,
      prompt: fixture.prompt,
      failureCategory: failureStatus.failureCategory,
      statusDetail: failureStatus.statusDetail,
    })
    console.log(`repoAwareSummaryDetected=${failureDiagnostics.routing.repoAwareSummaryDetected}`)
    console.log(`enteredSessionRuntime=${failureDiagnostics.routing.enteredSessionRuntime}`)
    console.log(`auditLogKind=${failureDiagnostics.auditIsolation.auditLogKind}`)
    console.log(`repoAuditResidueDetected=${failureDiagnostics.auditIsolation.repoAuditResidueDetected}`)
    console.log(`failureStage=${deriveCodingFlowFailureStage({
      failureCategory: failureStatus.failureCategory,
      statusDetail: failureStatus.statusDetail,
      output: redactedOutput,
      expected,
      noteStatusAfter,
    })}`)
    console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
    console.log(`[${failureStatus.status}] real-coding-flow-smoke status=${failureStatus.statusDetail}`)
    if (redactedOutput) {
      console.log(summarizeOutput(redactedOutput))
    }
    process.exit(failureStatus.exitCode)
  } finally {
    cleanupCodingFlowFixture(fixture.fixtureDir)
    cleanupIsolatedCodingFlowRuntimeHome(runtimeHome)
    cleanupIsolatedCodingFlowAuditLog(auditLogPath)
  }
}

function runRealCodingFlowDryRun() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-coding-flow-dry-run')
  console.log('homeRead=false')
  console.log('real-provider execution skipped')
  console.log('modelTurn=false')
  console.log('reportWritten=false')
  console.log('defaultSmoke=skipped')

  const fixture = createCodingFlowFixture()
  try {
    const before = snapshotCodingFlowFixture(fixture.fixtureDir)
    const noMutation = compareCodingFlowSnapshots(before, before)
    fs.writeFileSync(
      path.join(fixture.fixtureDir, 'note.txt'),
      'status: ready\nowner: fixture\n',
      'utf8',
    )
    const after = snapshotCodingFlowFixture(fixture.fixtureDir)
    const comparison = compareCodingFlowSnapshots(before, after)
    const expected = assertOnlyExpectedCodingFixtureChanges(
      comparison,
      ['note.txt'],
      fixture.protectedFiles,
    )
    const redaction = redactAndAssertCodingProviderOutput(
      [
        'Authorization: Bearer sk-live-secret-123456789',
        'api_key=sk-url-secret-123456789',
        'refresh_token=refresh-secret',
        'access_token=access-secret',
        'D:/Test/home-sf/.private-agents/config.json',
        '/home/example/.private-agents-real/.private-agents/config.json',
        '/home/wang/.private-agents-real/.private-agents/sessions/session-1/transcript.jsonl',
      ].join('\n'),
    )
    const contract = buildCodingFlowDryRunContract(fixture)
    const terminalSurface = buildTerminalResultSurface({
      status: 'PASS',
      provider: 'real',
      failureCategory: 'none',
      failureReason: '',
      outputTail: 'Result\n- Outcome: success\n- Changed files: note.txt\n- Verification: passed',
    })
    const followup = buildCodingFlowFailureFollowupContext({
      status: 'FAIL',
      provider: 'real',
      statusDetail: 'provider-network-inconclusive',
      failureCategory: 'provider-network-inconclusive',
      failureReason: 'provider-readiness:network: provider endpoint was unreachable during this turn',
      changedFiles: [],
      verification: 'blocked',
      outputTail: 'provider-network-inconclusive',
    }, 'retry the same fixture task after api_key=sk-live-secret-123456789 recovers', fixture)
    const dryRunAuditLogPath = getRealCodingFlowAuditLogPath('dry-run')
    const diagnostics = buildCodingFlowDiagnostics({
      result: {
        code: 0,
        timedOut: false,
        stdout: 'Action result unavailable',
        stderr: '',
        output: 'Action result unavailable',
      },
      redactedOutput: 'Action result unavailable',
      comparison,
      expected,
      noteStatusBefore: 'draft',
      noteStatusAfter: 'ready',
      runtimeHome: path.join(getTestRoot(), 'real-provider-coding-flow-runtime-home', 'dry-run'),
      auditLogPath: dryRunAuditLogPath,
      repoAfter: { ok: true, status: '', outputTail: '' },
      prompt: fixture.prompt,
      failureCategory: 'none',
      statusDetail: 'passed',
    })
    const noteContent = fs.readFileSync(path.join(fixture.fixtureDir, 'note.txt'), 'utf8')
    const promptOk =
      fixture.prompt.includes('Edit only note.txt') &&
      fixture.prompt.includes('status: ready') &&
      fixture.prompt.includes('Do not modify README.md') &&
      fixture.prompt.includes('Do not modify LOCKED.md')
    const contractOk =
      contract.optInRequired &&
      !contract.realProviderExecution &&
      !contract.modelTurn &&
      contract.skip.defaultGate &&
      contract.runtimeHome === 'isolated-test-root' &&
      contract.configHome === 'explicit-real-provider-home' &&
      contract.expectedChangedFiles.length === 1 &&
      contract.expectedChangedFiles[0] === 'note.txt' &&
      contract.expectedVerification === 'passed'
    const surfaceOk =
      terminalSurface.outcome === 'success' &&
      terminalSurface.nextAction === 'Continue with the next task.'
    const failureAttributionOk =
      followup.previousOutcome === 'provider-failure' &&
      followup.blocker === 'provider-network-inconclusive' &&
      followup.statusDetail === 'provider-network-inconclusive' &&
      followup.redaction.ok
    const diagnosticsOk =
      diagnostics.process.modelTurnExitCode === 0 &&
      diagnostics.fixture.expectedChangedFiles.join(',') === 'note.txt' &&
      diagnostics.fixture.fixtureChangedFiles.join(',') === 'note.txt' &&
      diagnostics.fixture.noteStatusBefore === 'draft' &&
      diagnostics.fixture.noteStatusAfter === 'ready' &&
      diagnostics.runtime.runtimeHomeKind === 'isolated-test-root' &&
      diagnostics.runtime.realProviderHomeUsedForRuntime === false &&
      diagnostics.runtime.configHomeKind === 'explicit-real-provider-home' &&
      diagnostics.auditIsolation.auditLogKind === 'isolated-test-root' &&
      diagnostics.auditIsolation.repoAuditResidueDetected === false &&
      diagnostics.mutation.mutationInstructionPresent === true
    const passed =
      noMutation.ok &&
      expected.ok &&
      noteContent.includes('status: ready') &&
      redaction.ok &&
      promptOk &&
      contractOk &&
      surfaceOk &&
      failureAttributionOk &&
      diagnosticsOk

    console.log(`fixtureFiles=${fixture.files.join(',')}`)
    console.log(`changedFiles=${expected.observed.join(',')}`)
    console.log(`protectedUnchanged=${expected.protectedChanged.length === 0}`)
    console.log(`terminalResultSurface=${surfaceOk ? 'pass' : 'fail'}`)
    console.log(`failureFollowupContext=${failureAttributionOk ? 'pass' : 'fail'}`)
    console.log(`diagnosticsShape=${diagnosticsOk ? 'pass' : 'fail'}`)
    console.log(`redaction=${redaction.ok && followup.redaction.ok ? 'pass' : 'fail'}`)
    console.log(`skipReason=${contract.skip.reason}`)
    console.log(`[${passed ? 'PASS' : 'FAIL'}] real-coding-flow-dry-run-contract`)
    process.exit(passed ? 0 : 1)
  } finally {
    cleanupCodingFlowFixture(fixture.fixtureDir)
  }
}

function buildApplyPatchDryRunProviderEvalScript() {
  const modelClientUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'model-adapters', 'client.ts')).href
  const runtimeConfigUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'config', 'runtimeConfig.ts')).href
  const providerCredentialsUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'core', 'shell', 'providerCredentials.ts')).href
  return `
    import { createModelClient } from ${JSON.stringify(modelClientUrl)};
    import { getRuntimeConfig } from ${JSON.stringify(runtimeConfigUrl)};
    import { resolveProviderCredential } from ${JSON.stringify(providerCredentialsUrl)};

    ;(async () => {
      const prompt = process.env.PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_PROMPT ?? '';
      const workspaceRoot = process.env.PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_WORKSPACE ?? process.cwd();
      const runtimeConfig = getRuntimeConfig(workspaceRoot);
      const resolved = resolveProviderCredential({ runtimeConfig });
      const credential = resolved.credential;
      if (!credential) {
        throw new Error('provider-readiness:missing-key');
      }
      if (credential.accountAuth && credential.accountAuth.expiresAt <= Date.now()) {
        throw new Error('provider-readiness:auth account-auth token expired; reconnect before running apply_patch dry-run smoke');
      }
      const model = (resolved.model ?? credential.model ?? '').trim() ||
        (credential.provider === 'openai' && credential.accountAuth ? 'gpt-5.4' : 'gpt-4.1-mini');
      const baseUrl = resolved.baseUrl ?? credential.baseUrl;
      const diagnostics = {
        providerId: credential.provider,
        clientProtocol: credential.provider === 'openai-compatible' ? 'openai-compatible' : credential.provider,
        baseUrlHost: baseUrlHost(baseUrl),
        model,
        configSource: process.env.PRIVATE_AGENTS_REAL_CONFIG_SOURCE ?? 'runtime-config',
        credentialSource: credential.source,
      };
      console.log(${JSON.stringify(applyPatchProviderDiagnosticsMarker)} + JSON.stringify(diagnostics));
      const client = createModelClient({
        provider: credential.provider,
        apiKey: credential.apiKey,
        accountAuth: credential.accountAuth,
        baseUrl,
        requestedCapabilities: { supportsToolCalls: false },
        fallbackPolicy: { enabled: false },
      });
      let output = '';
      const signal = AbortSignal.timeout(300000);
      for await (const event of client.stream({
        schemaVersion: '1.0.0',
        model,
        messages: [
          {
            role: 'system',
            content: [
              'You generate non-mutating apply_patch previews only.',
              'Return exactly one apply_patch block.',
              'Do not call tools.',
              'Do not claim that files were changed or written.'
            ].join(' ')
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0,
        maxOutputTokens: 700,
      }, signal)) {
        if (event.type === 'content.delta') {
          output += event.delta;
        }
      }
      console.log(${JSON.stringify(applyPatchProviderResultMarker)} + JSON.stringify({ output, diagnostics }));
    })().catch((error) => {
      console.error(formatProviderEvalError(error));
      process.exit(1);
    });

    function baseUrlHost(baseUrl) {
      const trimmed = typeof baseUrl === 'string' ? baseUrl.trim() : '';
      if (!trimmed) return 'none';
      try {
        return new URL(trimmed).host || 'none';
      } catch {
        return 'invalid';
      }
    }

    function formatProviderEvalError(error) {
      if (error instanceof Error) {
        return error.stack ?? error.message;
      }
      try {
        return JSON.stringify(error, (_key, value) => {
          if (typeof value === 'function') return '[function]';
          if (typeof value === 'bigint') return value.toString();
          return value;
        });
      } catch {
        return String(error);
      }
    }
  `
}

async function runApplyPatchDryRunProviderTurn({ prompt, runtimeHome, realHome, fixtureDir, auditLogPath }) {
  const result = await run(process.execPath, [
    tsxCliPath,
    '--eval',
    buildApplyPatchDryRunProviderEvalScript(),
  ], {
    cwd: tsShellRoot,
    env: {
      HOME: runtimeHome,
      USERPROFILE: runtimeHome,
      PRIVATE_AGENTS_HOME_OVERRIDE: realHome,
      PRIVATE_AGENTS_REAL_HOME: realHome,
      PRIVATE_AGENTS_PROVIDER_MODE: 'real',
      PRIVATE_AGENTS_AUDIT_LOG_PATH: auditLogPath,
      PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_PROMPT: prompt,
      PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_WORKSPACE: fixtureDir,
      PRIVATE_AGENTS_REAL_CONFIG_SOURCE: realMutationEnvContract.configSource,
    },
    timeoutMs: 420000,
  })
  const stdoutLines = result.stdout.split(/\r?\n/)
  const resultLine = stdoutLines
    .find((line) => line.startsWith(applyPatchProviderResultMarker))
  const diagnosticsLine = stdoutLines
    .find((line) => line.startsWith(applyPatchProviderDiagnosticsMarker))
  let output = ''
  let providerDiagnostics = undefined
  if (resultLine) {
    try {
      const parsed = JSON.parse(resultLine.slice(applyPatchProviderResultMarker.length))
      output = typeof parsed.output === 'string' ? parsed.output : ''
      if (parsed.diagnostics && typeof parsed.diagnostics === 'object') {
        providerDiagnostics = parsed.diagnostics
      }
    } catch {
      output = ''
    }
  }
  if (!providerDiagnostics && diagnosticsLine) {
    try {
      const parsed = JSON.parse(diagnosticsLine.slice(applyPatchProviderDiagnosticsMarker.length))
      if (parsed && typeof parsed === 'object') providerDiagnostics = parsed
    } catch {
      providerDiagnostics = undefined
    }
  }
  if (providerDiagnostics) {
    lastApplyPatchProviderDiagnostics = providerDiagnostics
  }
  const stdoutWithoutMarkers = stdoutLines
    .filter((line) =>
      !line.startsWith(applyPatchProviderResultMarker) &&
      !line.startsWith(applyPatchProviderDiagnosticsMarker)
    )
    .join('\n')
  const rawOutputWithoutMarkers = [stdoutWithoutMarkers, result.stderr]
    .filter(Boolean)
    .join('')
  return {
    ...result,
    stdout: output,
    output: output || rawOutputWithoutMarkers || result.output,
    rawOutput: rawOutputWithoutMarkers || result.output,
    providerDiagnostics,
  }
}

function extractSingleApplyPatchBlock(output) {
  const normalized = String(output ?? '').replace(/\r\n/g, '\n')
  const matches = [...normalized.matchAll(/\*\*\* Begin Patch[\s\S]*?\*\*\* End Patch/g)]
    .map((match) => match[0].trim())
  return {
    status: matches.length === 1
      ? 'ok'
      : matches.length === 0
        ? 'provider-output-missing-apply-patch'
        : 'provider-output-multiple-patches',
    patchText: matches.length === 1 ? matches[0] : '',
    count: matches.length,
  }
}

function buildApplyPatchDryRunRouteEvalScript() {
  const routeUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'orchestration', 'patchResult', 'singleFileApplyPatchOptInDryRunRoute.ts')).href
  const gateUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'orchestration', 'patchResult', 'singleFileApplyPatchRealProviderDryRunGate.ts')).href
  return `
    import fs from 'node:fs';
    import path from 'node:path';
    import { buildSingleFileApplyPatchOptInDryRunRoute } from ${JSON.stringify(routeUrl)};
    import { buildSingleFileApplyPatchRealProviderDryRunGateContract } from ${JSON.stringify(gateUrl)};

    const workspaceRoot = path.resolve(process.env.PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_WORKSPACE ?? '');
    const rawPatchText = process.env.PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_PATCH ?? '';
    const redaction = JSON.parse(process.env.PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_REDACTION ?? '{"ok":false,"leaks":["missing-redaction-input"]}');
    const routeResult = buildSingleFileApplyPatchOptInDryRunRoute({
      workspaceRoot,
      rawPatchText,
      dryRun: true,
      explicitOptIn: true,
      requestedUserDecision: 'approved',
      readFile: (absolutePath) => {
        const resolved = path.resolve(absolutePath);
        if (!(resolved === workspaceRoot || resolved.startsWith(workspaceRoot + path.sep))) {
          return undefined;
        }
        return fs.existsSync(resolved) ? fs.readFileSync(resolved, 'utf8') : undefined;
      },
    });
    const gate = buildSingleFileApplyPatchRealProviderDryRunGateContract({
      explicitOptIn: true,
      syntheticRouteValidated: true,
      routeResult,
      redactionCheck: redaction,
      isolatedFixture: true,
      noWriteMode: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
    });
    console.log('__APPLY_PATCH_DRY_RUN_ROUTE_RESULT__' + JSON.stringify({ routeResult, gate }));
  `
}

async function runApplyPatchDryRunRoute({ fixtureDir, patchText, redaction }) {
  const result = await run(process.execPath, [
    tsxCliPath,
    '--eval',
    buildApplyPatchDryRunRouteEvalScript(),
  ], {
    cwd: tsShellRoot,
    env: {
      PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_WORKSPACE: fixtureDir,
      PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_PATCH: patchText,
      PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_REDACTION: JSON.stringify({
        ok: redaction.ok,
        leaks: redaction.leaks,
      }),
    },
    timeoutMs: 120000,
  })
  const resultLine = result.stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith('__APPLY_PATCH_DRY_RUN_ROUTE_RESULT__'))
  if (!resultLine) {
    return {
      ok: false,
      failureReason: 'route-failure: route runner did not emit a result marker',
      result,
    }
  }
  try {
    return {
      ok: result.code === 0 && !result.timedOut,
      ...JSON.parse(resultLine.slice('__APPLY_PATCH_DRY_RUN_ROUTE_RESULT__'.length)),
      result,
    }
  } catch {
    return {
      ok: false,
      failureReason: 'route-failure: route runner emitted invalid JSON',
      result,
    }
  }
}

function buildApplyPatchPermissionUxRouteEvalScript() {
  const routeUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'orchestration', 'patchResult', 'singleFileApplyPatchOptInDryRunRoute.ts')).href
  const seamUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'orchestration', 'patchResult', 'singleFileApplyPatchPermissionUxRealRouteSeam.ts')).href
  const gateUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'orchestration', 'patchResult', 'singleFileApplyPatchRealProviderPermissionUxGate.ts')).href
  return `
    import fs from 'node:fs';
    import path from 'node:path';
    import { buildSingleFileApplyPatchOptInDryRunRoute } from ${JSON.stringify(routeUrl)};
    import { buildSingleFileApplyPatchPermissionUxRealRouteSeam } from ${JSON.stringify(seamUrl)};
    import { buildSingleFileApplyPatchRealProviderPermissionUxGateContract } from ${JSON.stringify(gateUrl)};

    const workspaceRoot = path.resolve(process.env.PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_WORKSPACE ?? '');
    const rawPatchText = process.env.PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_PATCH ?? '';
    const redaction = JSON.parse(process.env.PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_REDACTION ?? '{"ok":false,"leaks":["missing-redaction-input"]}');
    const readFixtureFile = (absolutePath) => {
      const resolved = path.resolve(absolutePath);
      if (!(resolved === workspaceRoot || resolved.startsWith(workspaceRoot + path.sep))) {
        return undefined;
      }
      return fs.existsSync(resolved) ? fs.readFileSync(resolved, 'utf8') : undefined;
    };
    const pendingRouteResult = buildSingleFileApplyPatchOptInDryRunRoute({
      workspaceRoot,
      rawPatchText,
      dryRun: true,
      explicitOptIn: true,
      requestedUserDecision: 'pending',
      readFile: readFixtureFile,
    });
    const deniedRouteResult = buildSingleFileApplyPatchOptInDryRunRoute({
      workspaceRoot,
      rawPatchText,
      dryRun: true,
      explicitOptIn: true,
      requestedUserDecision: 'denied',
      readFile: readFixtureFile,
    });
    let staleReads = 0;
    const blockedRouteResult = buildSingleFileApplyPatchOptInDryRunRoute({
      workspaceRoot,
      rawPatchText,
      dryRun: true,
      explicitOptIn: true,
      requestedUserDecision: 'approved',
      readFile: (absolutePath) => {
        const current = readFixtureFile(absolutePath);
        if (current === undefined) return undefined;
        staleReads += 1;
        return staleReads === 1 ? current : current + '\\nexternal stale-read marker\\n';
      },
    });
    const pendingSeam = buildSingleFileApplyPatchPermissionUxRealRouteSeam({
      routeResult: pendingRouteResult,
      requestedUserDecision: 'pending',
    });
    const deniedSeam = buildSingleFileApplyPatchPermissionUxRealRouteSeam({
      routeResult: deniedRouteResult,
      requestedUserDecision: 'denied',
    });
    const blockedSeam = buildSingleFileApplyPatchPermissionUxRealRouteSeam({
      routeResult: blockedRouteResult,
      requestedUserDecision: 'approved',
    });
    const gate = buildSingleFileApplyPatchRealProviderPermissionUxGateContract({
      explicitOptIn: true,
      syntheticPermissionUxValidated: true,
      pendingRouteResult,
      pendingSeam,
      deniedSeam,
      blockedSeam,
      redactionCheck: redaction,
      isolatedFixture: true,
      noWriteMode: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
    });
    console.log('__APPLY_PATCH_PERMISSION_UX_ROUTE_RESULT__' + JSON.stringify({
      pendingRouteResult,
      deniedRouteResult,
      blockedRouteResult,
      pendingSeam,
      deniedSeam,
      blockedSeam,
      gate,
    }));
  `
}

async function runApplyPatchPermissionUxRoute({ fixtureDir, patchText, redaction }) {
  const result = await run(process.execPath, [
    tsxCliPath,
    '--eval',
    buildApplyPatchPermissionUxRouteEvalScript(),
  ], {
    cwd: tsShellRoot,
    env: {
      PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_WORKSPACE: fixtureDir,
      PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_PATCH: patchText,
      PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_REDACTION: JSON.stringify({
        ok: redaction.ok,
        leaks: redaction.leaks,
      }),
    },
    timeoutMs: 120000,
  })
  const resultLine = result.stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith('__APPLY_PATCH_PERMISSION_UX_ROUTE_RESULT__'))
  if (!resultLine) {
    return {
      ok: false,
      failureReason: 'permission-ux-failure: route runner did not emit a result marker',
      result,
    }
  }
  try {
    return {
      ok: result.code === 0 && !result.timedOut,
      ...JSON.parse(resultLine.slice('__APPLY_PATCH_PERMISSION_UX_ROUTE_RESULT__'.length)),
      result,
    }
  } catch {
    return {
      ok: false,
      failureReason: 'permission-ux-failure: route runner emitted invalid JSON',
      result,
    }
  }
}

function buildApplyPatchRuntimeNoWriteRouteEvalScript() {
  const routeUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'orchestration', 'patchResult', 'noWriteRuntimeRoute.ts')).href
  const smokeUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'orchestration', 'patchResult', 'runtimeNoWriteSmoke.ts')).href
  return `
    import fs from 'node:fs';
    import path from 'node:path';
    import { buildNoWriteRuntimeRoute } from ${JSON.stringify(routeUrl)};
    import { buildRuntimeNoWriteSmokeContract } from ${JSON.stringify(smokeUrl)};

    const workspaceRoot = path.resolve(process.env.PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_WORKSPACE ?? '');
    const rawPatchText = process.env.PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_PATCH ?? '';
    const redaction = JSON.parse(process.env.PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_REDACTION ?? '{"ok":false,"leaks":["missing-redaction-input"]}');
    const fixtureUnchanged = process.env.PRIVATE_AGENTS_APPLY_PATCH_RUNTIME_FIXTURE_UNCHANGED === 'true';
    const repositoryClean = process.env.PRIVATE_AGENTS_APPLY_PATCH_RUNTIME_REPOSITORY_CLEAN === 'true';
    const readFixtureFile = (absolutePath) => {
      const resolved = path.resolve(absolutePath);
      if (!(resolved === workspaceRoot || resolved.startsWith(workspaceRoot + path.sep))) {
        return undefined;
      }
      return fs.existsSync(resolved) ? fs.readFileSync(resolved, 'utf8') : undefined;
    };
    const route = buildNoWriteRuntimeRoute({
      workspaceRoot,
      rawPatchText,
      explicitRuntimeOptIn: true,
      requestedUserDecision: 'pending',
      runtimeSource: 'real-provider-smoke',
      readFile: readFixtureFile,
    });
    const smoke = buildRuntimeNoWriteSmokeContract({
      explicitOptIn: true,
      syntheticRuntimeValidated: true,
      route,
      redactionCheck: redaction,
      isolatedFixture: true,
      privateAgentsRealRead: false,
      providerConfigPrinted: false,
      fixtureUnchanged,
      repositoryClean,
    });
    console.log('__APPLY_PATCH_RUNTIME_NO_WRITE_RESULT__' + JSON.stringify({ route, smoke }));
  `
}

async function runApplyPatchRuntimeNoWriteRoute({
  fixtureDir,
  patchText,
  redaction,
  fixtureUnchanged,
  repositoryClean,
}) {
  const result = await run(process.execPath, [
    tsxCliPath,
    '--eval',
    buildApplyPatchRuntimeNoWriteRouteEvalScript(),
  ], {
    cwd: tsShellRoot,
    env: {
      PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_WORKSPACE: fixtureDir,
      PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_PATCH: patchText,
      PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_REDACTION: JSON.stringify({
        ok: redaction.ok,
        leaks: redaction.leaks,
      }),
      PRIVATE_AGENTS_APPLY_PATCH_RUNTIME_FIXTURE_UNCHANGED: String(fixtureUnchanged),
      PRIVATE_AGENTS_APPLY_PATCH_RUNTIME_REPOSITORY_CLEAN: String(repositoryClean),
    },
    timeoutMs: 120000,
  })
  const resultLine = result.stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith('__APPLY_PATCH_RUNTIME_NO_WRITE_RESULT__'))
  if (!resultLine) {
    return {
      ok: false,
      failureReason: 'runtime-no-write-failure: route runner did not emit a result marker',
      result,
    }
  }
  try {
    return {
      ok: result.code === 0 && !result.timedOut,
      ...JSON.parse(resultLine.slice('__APPLY_PATCH_RUNTIME_NO_WRITE_RESULT__'.length)),
      result,
    }
  } catch {
    return {
      ok: false,
      failureReason: 'runtime-no-write-failure: route runner emitted invalid JSON',
      result,
    }
  }
}

function buildApplyPatchWriteFixtureEvalScript() {
  const routeUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'orchestration', 'patchResult', 'singleFileApplyPatchOptInDryRunRoute.ts')).href
  const decisionUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'orchestration', 'patchResult', 'writeDecisionGate.ts')).href
  const laneUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'orchestration', 'patchResult', 'isolatedWriteLane.ts')).href
  const smokeUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'orchestration', 'patchResult', 'realProviderWriteSmoke.ts')).href
  return `
    import fs from 'node:fs';
    import path from 'node:path';
    import { buildSingleFileApplyPatchOptInDryRunRoute } from ${JSON.stringify(routeUrl)};
    import { buildWriteDecisionGate } from ${JSON.stringify(decisionUrl)};
    import { runIsolatedWriteLane } from ${JSON.stringify(laneUrl)};
    import { buildRealProviderWriteSmokeContract } from ${JSON.stringify(smokeUrl)};

    const workspaceRoot = path.resolve(process.env.PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_WORKSPACE ?? '');
    const rawPatchText = process.env.PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_PATCH ?? '';
    const redaction = JSON.parse(process.env.PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_REDACTION ?? '{"ok":false,"leaks":["missing-redaction-input"]}');
    const beforeChangedFiles = JSON.parse(process.env.PRIVATE_AGENTS_APPLY_PATCH_WRITE_FIXTURE_CHANGED ?? '[]');
    const protectedFilesUnchanged = process.env.PRIVATE_AGENTS_APPLY_PATCH_WRITE_FIXTURE_PROTECTED_UNCHANGED === 'true';
    const expectedChangedFiles = ['src/app.ts'];
    const readFixtureFile = (absolutePath) => {
      const resolved = path.resolve(absolutePath);
      if (!(resolved === workspaceRoot || resolved.startsWith(workspaceRoot + path.sep))) {
        return undefined;
      }
      return fs.existsSync(resolved) ? fs.readFileSync(resolved, 'utf8') : undefined;
    };
    const writeFixtureFile = (relativePath, content) => {
      const resolved = path.resolve(workspaceRoot, relativePath);
      const relative = path.relative(workspaceRoot, resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('Refusing to write outside isolated apply_patch fixture');
      }
      fs.writeFileSync(resolved, content, 'utf8');
    };
    (async () => {
      const routeResult = buildSingleFileApplyPatchOptInDryRunRoute({
        workspaceRoot,
        rawPatchText,
        dryRun: true,
        explicitOptIn: true,
        requestedUserDecision: 'approved',
        readFile: readFixtureFile,
      });
      const writeDecision = buildWriteDecisionGate({
        permissionUx: routeResult.permissionUx,
        explicitApprovedForWrite: true,
      });
      const writeLane = await runIsolatedWriteLane({
        workspaceRoot,
        rawPatchText,
        permissionUx: routeResult.permissionUx,
        writeDecision,
        isolatedFixture: true,
        readFile: readFixtureFile,
        writeFile: writeFixtureFile,
      });
      const smoke = buildRealProviderWriteSmokeContract({
        explicitOptIn: true,
        syntheticWriteLaneValidated: true,
        writeLane,
        redactionCheck: redaction,
        isolatedFixture: true,
        privateAgentsRealRead: false,
        providerConfigPrinted: false,
        fixtureChangedFiles: beforeChangedFiles,
        expectedChangedFiles,
        protectedFilesUnchanged,
      });
      console.log('__APPLY_PATCH_WRITE_FIXTURE_RESULT__' + JSON.stringify({ routeResult, writeDecision, writeLane, smoke }));
    })().catch((error) => {
      console.log('__APPLY_PATCH_WRITE_FIXTURE_RESULT__' + JSON.stringify({
        routeError: formatEvalError(error),
      }));
      process.exitCode = 1;
    });

    function formatEvalError(error) {
      if (error instanceof Error) {
        return error.stack ?? error.message;
      }
      try {
        return JSON.stringify(error);
      } catch {
        return String(error);
      }
    }
  `
}

async function runApplyPatchWriteFixtureRoute({
  fixtureDir,
  patchText,
  redaction,
  fixtureChangedFiles,
  protectedFilesUnchanged,
}) {
  const result = await run(process.execPath, [
    tsxCliPath,
    '--eval',
    buildApplyPatchWriteFixtureEvalScript(),
  ], {
    cwd: tsShellRoot,
    env: {
      PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_WORKSPACE: fixtureDir,
      PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_PATCH: patchText,
      PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_REDACTION: JSON.stringify({
        ok: redaction.ok,
        leaks: redaction.leaks,
      }),
      PRIVATE_AGENTS_APPLY_PATCH_WRITE_FIXTURE_CHANGED: JSON.stringify(fixtureChangedFiles),
      PRIVATE_AGENTS_APPLY_PATCH_WRITE_FIXTURE_PROTECTED_UNCHANGED: String(protectedFilesUnchanged),
    },
    timeoutMs: 120000,
  })
  const resultLine = result.stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith('__APPLY_PATCH_WRITE_FIXTURE_RESULT__'))
  if (!resultLine) {
    return {
      ok: false,
      failureReason: 'write-fixture-failure: route runner did not emit a result marker',
      outputTail: summarizeOutput(result.output),
      result,
    }
  }
  try {
    const parsed = JSON.parse(resultLine.slice('__APPLY_PATCH_WRITE_FIXTURE_RESULT__'.length))
    return {
      ok: result.code === 0 && !result.timedOut,
      ...parsed,
      failureReason: parsed.routeError
        ? `write-fixture-failure: route runner failed: ${summarizeOutput(parsed.routeError)}`
        : result.code === 0 && !result.timedOut
          ? undefined
          : `write-fixture-failure: route runner exited code=${result.code} timedOut=${result.timedOut}`,
      result,
    }
  } catch {
    return {
      ok: false,
      failureReason: 'write-fixture-failure: route runner emitted invalid JSON',
      outputTail: summarizeOutput(result.output),
      result,
    }
  }
}

function buildApplyPatchGuardedWriteEvalScript() {
  const routeUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'orchestration', 'patchResult', 'singleFileApplyPatchOptInDryRunRoute.ts')).href
  const decisionUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'orchestration', 'patchResult', 'writeDecisionGate.ts')).href
  const guardedUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'orchestration', 'patchResult', 'guardedWriteGate.ts')).href
  const laneUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'orchestration', 'patchResult', 'productionWriteLane.ts')).href
  const smokeUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'orchestration', 'patchResult', 'guardedWriteSmoke.ts')).href
  return `
    import fs from 'node:fs';
    import path from 'node:path';
    import { buildSingleFileApplyPatchOptInDryRunRoute } from ${JSON.stringify(routeUrl)};
    import { buildWriteDecisionGate } from ${JSON.stringify(decisionUrl)};
    import { buildGuardedWriteGate } from ${JSON.stringify(guardedUrl)};
    import { runProductionWriteLane } from ${JSON.stringify(laneUrl)};
    import { buildGuardedWriteSmokeContract } from ${JSON.stringify(smokeUrl)};

    const workspaceRoot = path.resolve(process.env.PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_WORKSPACE ?? '');
    const rawPatchText = process.env.PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_PATCH ?? '';
    const redaction = JSON.parse(process.env.PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_REDACTION ?? '{"ok":false,"leaks":["missing-redaction-input"]}');
    const workspaceChangedFiles = JSON.parse(process.env.PRIVATE_AGENTS_APPLY_PATCH_GUARDED_WRITE_CHANGED ?? '[]');
    const protectedFilesUnchanged = process.env.PRIVATE_AGENTS_APPLY_PATCH_GUARDED_WRITE_PROTECTED_UNCHANGED === 'true';
    const repositoryClean = process.env.PRIVATE_AGENTS_APPLY_PATCH_GUARDED_WRITE_REPOSITORY_CLEAN === 'true';
    const expectedChangedFiles = ['src/app.ts'];
    const readWorkspaceFile = (absolutePath) => {
      const resolved = path.resolve(absolutePath);
      if (!(resolved === workspaceRoot || resolved.startsWith(workspaceRoot + path.sep))) {
        return undefined;
      }
      return fs.existsSync(resolved) ? fs.readFileSync(resolved, 'utf8') : undefined;
    };
    const writeWorkspaceFile = (relativePath, content) => {
      const resolved = path.resolve(workspaceRoot, relativePath);
      const relative = path.relative(workspaceRoot, resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('Refusing to write outside isolated guarded apply_patch workspace');
      }
      fs.writeFileSync(resolved, content, 'utf8');
    };
    (async () => {
      const routeResult = buildSingleFileApplyPatchOptInDryRunRoute({
        workspaceRoot,
        rawPatchText,
        dryRun: true,
        explicitOptIn: true,
        requestedUserDecision: 'approved',
        readFile: readWorkspaceFile,
      });
      const writeDecision = buildWriteDecisionGate({
        permissionUx: routeResult.permissionUx,
        explicitApprovedForWrite: true,
      });
      const guardedGate = buildGuardedWriteGate({
        explicitOptIn: true,
        writeDecision,
        singleFileUpdateOnly: true,
        defaultProductionRejectionUnchanged: true,
      });
      const writeLane = await runProductionWriteLane({
        workspaceRoot,
        rawPatchText,
        permissionUx: routeResult.permissionUx,
        guardedGate,
        isolatedWorkspace: true,
        readFile: readWorkspaceFile,
        writeFile: writeWorkspaceFile,
      });
      const smoke = buildGuardedWriteSmokeContract({
        explicitOptIn: true,
        syntheticProductionLaneValidated: true,
        writeLane,
        redactionCheck: redaction,
        isolatedWorkspace: true,
        privateAgentsRealRead: false,
        providerConfigPrinted: false,
        repositoryClean,
        workspaceChangedFiles,
        expectedChangedFiles,
        protectedFilesUnchanged,
      });
      console.log('__APPLY_PATCH_GUARDED_WRITE_RESULT__' + JSON.stringify({ routeResult, writeDecision, guardedGate, writeLane, smoke }));
    })().catch((error) => {
      console.log('__APPLY_PATCH_GUARDED_WRITE_RESULT__' + JSON.stringify({
        routeError: formatEvalError(error),
      }));
      process.exitCode = 1;
    });

    function formatEvalError(error) {
      if (error instanceof Error) {
        return error.stack ?? error.message;
      }
      try {
        return JSON.stringify(error);
      } catch {
        return String(error);
      }
    }
  `
}

async function runApplyPatchGuardedWriteRoute({
  fixtureDir,
  patchText,
  redaction,
  workspaceChangedFiles,
  protectedFilesUnchanged,
  repositoryClean,
}) {
  const result = await run(process.execPath, [
    tsxCliPath,
    '--eval',
    buildApplyPatchGuardedWriteEvalScript(),
  ], {
    cwd: tsShellRoot,
    env: {
      PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_WORKSPACE: fixtureDir,
      PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_PATCH: patchText,
      PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_REDACTION: JSON.stringify({
        ok: redaction.ok,
        leaks: redaction.leaks,
      }),
      PRIVATE_AGENTS_APPLY_PATCH_GUARDED_WRITE_CHANGED: JSON.stringify(workspaceChangedFiles),
      PRIVATE_AGENTS_APPLY_PATCH_GUARDED_WRITE_PROTECTED_UNCHANGED: String(protectedFilesUnchanged),
      PRIVATE_AGENTS_APPLY_PATCH_GUARDED_WRITE_REPOSITORY_CLEAN: String(repositoryClean),
    },
    timeoutMs: 120000,
  })
  const resultLine = result.stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith('__APPLY_PATCH_GUARDED_WRITE_RESULT__'))
  if (!resultLine) {
    return {
      ok: false,
      failureReason: 'guarded-write-failure: route runner did not emit a result marker',
      outputTail: summarizeOutput(result.output),
      result,
    }
  }
  try {
    const parsed = JSON.parse(resultLine.slice('__APPLY_PATCH_GUARDED_WRITE_RESULT__'.length))
    return {
      ok: result.code === 0 && !result.timedOut,
      ...parsed,
      failureReason: parsed.routeError
        ? `guarded-write-failure: route runner failed: ${summarizeOutput(parsed.routeError)}`
        : result.code === 0 && !result.timedOut
          ? undefined
          : `guarded-write-failure: route runner exited code=${result.code} timedOut=${result.timedOut}`,
      result,
    }
  } catch {
    return {
      ok: false,
      failureReason: 'guarded-write-failure: route runner emitted invalid JSON',
      outputTail: summarizeOutput(result.output),
      result,
    }
  }
}

function buildApplyPatchGuardedRouteEvalScript() {
  const routeUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'orchestration', 'patchResult', 'singleFileApplyPatchOptInDryRunRoute.ts')).href
  const decisionUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'orchestration', 'patchResult', 'writeDecisionGate.ts')).href
  const guardedUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'orchestration', 'patchResult', 'guardedWriteGate.ts')).href
  const productionRouteUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'orchestration', 'patchResult', 'productionRoute.ts')).href
  const routeProjectionUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'orchestration', 'patchResult', 'productionRouteProjection.ts')).href
  const smokeUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'orchestration', 'patchResult', 'guardedRouteSmoke.ts')).href
  return `
    import fs from 'node:fs';
    import path from 'node:path';
    import { buildSingleFileApplyPatchOptInDryRunRoute } from ${JSON.stringify(routeUrl)};
    import { buildWriteDecisionGate } from ${JSON.stringify(decisionUrl)};
    import { buildGuardedWriteGate } from ${JSON.stringify(guardedUrl)};
    import { runProductionRoute } from ${JSON.stringify(productionRouteUrl)};
    import { buildProductionRouteRuntimeProjection } from ${JSON.stringify(routeProjectionUrl)};
    import { buildGuardedRouteSmokeContract } from ${JSON.stringify(smokeUrl)};

    const workspaceRoot = path.resolve(process.env.PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_WORKSPACE ?? '');
    const rawPatchText = process.env.PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_PATCH ?? '';
    const redaction = JSON.parse(process.env.PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_REDACTION ?? '{"ok":false,"leaks":["missing-redaction-input"]}');
    const workspaceChangedFiles = JSON.parse(process.env.PRIVATE_AGENTS_APPLY_PATCH_GUARDED_ROUTE_CHANGED ?? '[]');
    const protectedFilesUnchanged = process.env.PRIVATE_AGENTS_APPLY_PATCH_GUARDED_ROUTE_PROTECTED_UNCHANGED === 'true';
    const repositoryClean = process.env.PRIVATE_AGENTS_APPLY_PATCH_GUARDED_ROUTE_REPOSITORY_CLEAN === 'true';
    const expectedChangedFiles = ['src/app.ts'];
    const readWorkspaceFile = (absolutePath) => {
      const resolved = path.resolve(absolutePath);
      if (!(resolved === workspaceRoot || resolved.startsWith(workspaceRoot + path.sep))) {
        return undefined;
      }
      return fs.existsSync(resolved) ? fs.readFileSync(resolved, 'utf8') : undefined;
    };
    const writeWorkspaceFile = (relativePath, content) => {
      const resolved = path.resolve(workspaceRoot, relativePath);
      const relative = path.relative(workspaceRoot, resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('Refusing to write outside isolated guarded apply_patch workspace');
      }
      fs.writeFileSync(resolved, content, 'utf8');
    };
    (async () => {
      const routeResult = buildSingleFileApplyPatchOptInDryRunRoute({
        workspaceRoot,
        rawPatchText,
        dryRun: true,
        explicitOptIn: true,
        requestedUserDecision: 'approved',
        readFile: readWorkspaceFile,
      });
      const writeDecision = buildWriteDecisionGate({
        permissionUx: routeResult.permissionUx,
        explicitApprovedForWrite: true,
      });
      const guardedGate = buildGuardedWriteGate({
        explicitOptIn: true,
        writeDecision,
        singleFileUpdateOnly: true,
        defaultProductionRejectionUnchanged: true,
      });
      const productionRoute = await runProductionRoute({
        workspaceRoot,
        rawPatchText,
        permissionUx: routeResult.permissionUx,
        guardedGate,
        explicitRouteOptIn: true,
        singleFileUpdateOnly: true,
        defaultProductionRejectionUnchanged: true,
        safeResultSessionProjection: true,
        isolatedWorkspace: true,
        readFile: readWorkspaceFile,
        writeFile: writeWorkspaceFile,
      });
      const runtimeProjection = buildProductionRouteRuntimeProjection({
        productionRoute,
      });
      const smoke = buildGuardedRouteSmokeContract({
        explicitOptIn: true,
        syntheticProductionRouteValidated: true,
        productionRoute,
        redactionCheck: redaction,
        isolatedWorkspace: true,
        privateAgentsRealRead: false,
        providerConfigPrinted: false,
        repositoryClean,
        workspaceChangedFiles,
        expectedChangedFiles,
        protectedFilesUnchanged,
      });
      console.log('__APPLY_PATCH_GUARDED_ROUTE_RESULT__' + JSON.stringify({ routeResult, writeDecision, guardedGate, productionRoute, runtimeProjection, smoke }));
    })().catch((error) => {
      console.log('__APPLY_PATCH_GUARDED_ROUTE_RESULT__' + JSON.stringify({
        routeError: formatEvalError(error),
      }));
      process.exitCode = 1;
    });

    function formatEvalError(error) {
      if (error instanceof Error) {
        return error.stack ?? error.message;
      }
      try {
        return JSON.stringify(error);
      } catch {
        return String(error);
      }
    }
  `
}

async function runApplyPatchGuardedRouteRoute({
  fixtureDir,
  patchText,
  redaction,
  workspaceChangedFiles,
  protectedFilesUnchanged,
  repositoryClean,
}) {
  const result = await run(process.execPath, [
    tsxCliPath,
    '--eval',
    buildApplyPatchGuardedRouteEvalScript(),
  ], {
    cwd: tsShellRoot,
    env: {
      PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_WORKSPACE: fixtureDir,
      PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_PATCH: patchText,
      PRIVATE_AGENTS_APPLY_PATCH_DRY_RUN_REDACTION: JSON.stringify({
        ok: redaction.ok,
        leaks: redaction.leaks,
      }),
      PRIVATE_AGENTS_APPLY_PATCH_GUARDED_ROUTE_CHANGED: JSON.stringify(workspaceChangedFiles),
      PRIVATE_AGENTS_APPLY_PATCH_GUARDED_ROUTE_PROTECTED_UNCHANGED: String(protectedFilesUnchanged),
      PRIVATE_AGENTS_APPLY_PATCH_GUARDED_ROUTE_REPOSITORY_CLEAN: String(repositoryClean),
    },
    timeoutMs: 120000,
  })
  const resultLine = result.stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith('__APPLY_PATCH_GUARDED_ROUTE_RESULT__'))
  if (!resultLine) {
    return {
      ok: false,
      failureReason: 'guarded-route-failure: route runner did not emit a result marker',
      outputTail: summarizeOutput(result.output),
      result,
    }
  }
  try {
    const parsed = JSON.parse(resultLine.slice('__APPLY_PATCH_GUARDED_ROUTE_RESULT__'.length))
    return {
      ok: result.code === 0 && !result.timedOut,
      ...parsed,
      failureReason: parsed.routeError
        ? `guarded-route-failure: route runner failed: ${summarizeOutput(parsed.routeError)}`
        : result.code === 0 && !result.timedOut
          ? undefined
          : `guarded-route-failure: route runner exited code=${result.code} timedOut=${result.timedOut}`,
      result,
    }
  } catch {
    return {
      ok: false,
      failureReason: 'guarded-route-failure: route runner emitted invalid JSON',
      outputTail: summarizeOutput(result.output),
      result,
    }
  }
}

function assertApplyPatchDryRunSmokeSuccess({ routeBundle, comparison, repoBefore, repoAfter, redaction }) {
  const failures = []
  const routeResult = routeBundle?.routeResult
  const gate = routeBundle?.gate
  if (!repoBefore.ok || repoBefore.status) {
    failures.push('no-mutation guard failure: repository was not clean before smoke')
  }
  if (!repoAfter.ok) {
    failures.push('no-mutation guard failure: repository status could not be checked after smoke')
  } else if (repoAfter.status) {
    failures.push('real repo mutation leak: repository changed during smoke')
  }
  if (!comparison.ok) {
    failures.push(`fixture mutation leak: added=${comparison.added.join(',') || 'none'} removed=${comparison.removed.join(',') || 'none'} changed=${comparison.changed.join(',') || 'none'}`)
  }
  if (!redaction.ok) {
    failures.push(`redaction failure: ${redaction.leaks.join(',') || 'unknown'}`)
  }
  if (!routeBundle?.ok || !routeResult || !gate) {
    failures.push(routeBundle?.failureReason ?? 'route-failure: missing route result')
  } else {
    if (routeResult.status === 'rejected') {
      failures.push('route-failure: opt-in dry-run route rejected the generated apply_patch preview')
    }
    if (gate.status !== 'ready') {
      failures.push(`route-failure: gate status ${gate.status}${gate.failure ? ` (${gate.failure})` : ''}`)
    }
    if (
      routeResult.willWrite !== false ||
      routeResult.changedFiles?.length !== 0 ||
      routeResult.writeIntents?.length !== 0 ||
      routeResult.noWriterInvoked !== true ||
      routeResult.noAppliedPatchRecord !== true
    ) {
      failures.push('unexpected write: route exposed write-like state')
    }
    if (
      routeResult.doesNotClaimMutationSuccess !== true ||
      routeResult.doesNotClaimWriteSuccess !== true ||
      routeResult.resultMapperSeam?.terminalClassification === 'success' ||
      routeResult.resultMapperSeam?.patchesApplied ||
      routeResult.resultMapperSeam?.taskSatisfied ||
      routeResult.sessionRuntimeSeam?.mutationSuccessDisplayed ||
      routeResult.sessionRuntimeSeam?.writeSuccessDisplayed ||
      routeResult.sessionRuntimeSeam?.appliedPatchDisplayed
    ) {
      failures.push('unexpected success claim: dry-run preview looked like a write success')
    }
  }

  let failureCategory = 'none'
  if (failures.some((failure) => failure.startsWith('no-mutation guard failure'))) {
    failureCategory = 'no-mutation guard failure'
  } else if (failures.some((failure) => failure.startsWith('real repo mutation leak'))) {
    failureCategory = 'real repo mutation leak'
  } else if (failures.some((failure) => failure.startsWith('fixture mutation leak'))) {
    failureCategory = 'unexpected write'
  } else if (failures.some((failure) => failure.startsWith('redaction failure'))) {
    failureCategory = 'redaction failure'
  } else if (failures.some((failure) => failure.startsWith('unexpected write'))) {
    failureCategory = 'unexpected write'
  } else if (failures.some((failure) => failure.startsWith('unexpected success claim'))) {
    failureCategory = 'unexpected success claim'
  } else if (failures.some((failure) => failure.startsWith('route-failure'))) {
    failureCategory = 'route failure'
  }

  return {
    ok: failures.length === 0,
    failures,
    failureCategory,
    statusDetail: statusDetailForApplyPatchDryRunFailureCategory(failureCategory),
  }
}

function statusDetailForApplyPatchDryRunFailureCategory(failureCategory) {
  if (failureCategory === 'no-mutation guard failure') return 'no-mutation-guard-failure'
  if (failureCategory === 'real repo mutation leak') return 'real-repo-mutation-leak'
  if (failureCategory === 'redaction failure') return 'redaction-failure'
  if (failureCategory === 'unexpected write') return 'unexpected-write'
  if (failureCategory === 'unexpected success claim') return 'unexpected-success-claim'
  if (failureCategory === 'route failure') return 'route-failure'
  if (failureCategory === 'provider output missing apply_patch') return 'provider-output-missing-apply-patch'
  if (failureCategory === 'provider output multiple patches') return 'provider-output-multiple-patches'
  if (failureCategory === 'provider-readiness') return 'provider-readiness'
  return 'passed'
}

function assertApplyPatchRuntimeNoWriteSmokeSuccess({ runtimeBundle, comparison, repoBefore, repoAfter, redaction }) {
  const failures = []
  const route = runtimeBundle?.route
  const smoke = runtimeBundle?.smoke
  if (!repoBefore.ok || repoBefore.status) {
    failures.push('no-mutation guard failure: repository was not clean before smoke')
  }
  if (!repoAfter.ok) {
    failures.push('no-mutation guard failure: repository status could not be checked after smoke')
  } else if (repoAfter.status) {
    failures.push('real repo mutation leak: repository changed during smoke')
  }
  if (!comparison.ok) {
    failures.push(`fixture mutation leak: added=${comparison.added.join(',') || 'none'} removed=${comparison.removed.join(',') || 'none'} changed=${comparison.changed.join(',') || 'none'}`)
  }
  if (!redaction.ok) {
    failures.push(`redaction failure: ${redaction.leaks.join(',') || 'unknown'}`)
  }
  if (!runtimeBundle?.ok || !route || !smoke) {
    failures.push(runtimeBundle?.failureReason ?? 'route-failure: missing runtime no-write result')
  } else {
    if (smoke.status !== 'ready') {
      failures.push(`route-failure: runtime no-write smoke status ${smoke.status}${smoke.failure ? ` (${smoke.failure})` : ''}`)
    }
    if (!['permission-pending', 'denied', 'blocked'].includes(route.displayStatus)) {
      failures.push(`route-failure: unexpected runtime display status ${route.displayStatus}`)
    }
    if (
      route.willWrite !== false ||
      route.changedFiles?.length !== 0 ||
      route.writeIntents?.length !== 0 ||
      route.noWriterInvoked !== true ||
      route.noAppliedPatchRecord !== true ||
      smoke.willWrite !== false ||
      smoke.changedFiles?.length !== 0 ||
      smoke.writeIntents?.length !== 0 ||
      smoke.noWriterInvoked !== true ||
      smoke.noAppliedPatchRecord !== true
    ) {
      failures.push('unexpected write: runtime route exposed write-like state')
    }
    if (
      route.terminalClassification !== 'stopped' ||
      route.doesNotClaimMutationSuccess !== true ||
      route.doesNotClaimWriteSuccess !== true ||
      smoke.terminalClassification !== 'stopped' ||
      smoke.terminalNoSuccessClaim !== true
    ) {
      failures.push('unexpected success claim: runtime no-write route looked like a write success')
    }
  }

  let failureCategory = 'none'
  if (failures.some((failure) => failure.startsWith('no-mutation guard failure'))) {
    failureCategory = 'no-mutation guard failure'
  } else if (failures.some((failure) => failure.startsWith('real repo mutation leak'))) {
    failureCategory = 'real repo mutation leak'
  } else if (failures.some((failure) => failure.startsWith('fixture mutation leak'))) {
    failureCategory = 'unexpected write'
  } else if (failures.some((failure) => failure.startsWith('redaction failure'))) {
    failureCategory = 'redaction failure'
  } else if (failures.some((failure) => failure.startsWith('unexpected write'))) {
    failureCategory = 'unexpected write'
  } else if (failures.some((failure) => failure.startsWith('unexpected success claim'))) {
    failureCategory = 'unexpected success claim'
  } else if (failures.some((failure) => failure.startsWith('route-failure'))) {
    failureCategory = 'route failure'
  }

  return {
    ok: failures.length === 0,
    failures,
    failureCategory,
    statusDetail: statusDetailForApplyPatchDryRunFailureCategory(failureCategory),
  }
}

function assertApplyPatchPermissionUxSmokeSuccess({ permissionBundle, comparison, repoBefore, repoAfter, redaction }) {
  const failures = []
  const gate = permissionBundle?.gate
  if (!repoBefore.ok || repoBefore.status) {
    failures.push('no-mutation guard failure: repository was not clean before smoke')
  }
  if (!repoAfter.ok) {
    failures.push('no-mutation guard failure: repository status could not be checked after smoke')
  } else if (repoAfter.status) {
    failures.push('real repo mutation leak: repository changed during smoke')
  }
  if (!comparison.ok) {
    failures.push(`fixture mutation leak: added=${comparison.added.join(',') || 'none'} removed=${comparison.removed.join(',') || 'none'} changed=${comparison.changed.join(',') || 'none'}`)
  }
  if (!redaction.ok) {
    failures.push(`redaction failure: ${redaction.leaks.join(',') || 'unknown'}`)
  }
  if (!permissionBundle?.ok || !gate) {
    failures.push(permissionBundle?.failureReason ?? 'permission-ux-failure: missing permission UX result')
  } else {
    if (gate.status !== 'ready') {
      failures.push(`permission-ux-failure: gate status ${gate.status}${gate.failure ? ` (${gate.failure})` : ''}`)
    }
    if (
      permissionBundle.pendingSeam?.permissionStatus !== 'pending' ||
      permissionBundle.deniedSeam?.permissionStatus !== 'denied' ||
      permissionBundle.blockedSeam?.permissionStatus !== 'blocked'
    ) {
      failures.push('permission-ux-failure: pending/denied/blocked states were not preserved')
    }
    if (
      gate.willWrite !== false ||
      gate.changedFiles?.length !== 0 ||
      gate.writeIntents?.length !== 0 ||
      gate.noWriterInvoked !== true ||
      gate.noAppliedPatchRecord !== true ||
      [permissionBundle.pendingSeam, permissionBundle.deniedSeam, permissionBundle.blockedSeam].some((seam) =>
        seam?.willWrite !== false ||
        seam?.changedFiles?.length !== 0 ||
        seam?.writeIntents?.length !== 0 ||
        seam?.noWriterInvoked !== true ||
        seam?.noAppliedPatchRecord !== true
      )
    ) {
      failures.push('unexpected write: permission UX gate exposed write-like state')
    }
    if (
      gate.doesNotClaimMutationSuccess !== true ||
      gate.doesNotClaimWriteSuccess !== true ||
      permissionBundle.pendingRouteResult?.resultMapperSeam?.terminalClassification === 'success' ||
      permissionBundle.pendingRouteResult?.sessionRuntimeSeam?.mutationSuccessDisplayed ||
      permissionBundle.pendingRouteResult?.sessionRuntimeSeam?.writeSuccessDisplayed ||
      [permissionBundle.pendingSeam, permissionBundle.deniedSeam, permissionBundle.blockedSeam].some((seam) =>
        seam?.doesNotClaimMutationSuccess !== true ||
        seam?.doesNotClaimWriteSuccess !== true
      )
    ) {
      failures.push('unexpected success claim: permission UX looked like a write success')
    }
  }

  let failureCategory = 'none'
  if (failures.some((failure) => failure.startsWith('no-mutation guard failure'))) {
    failureCategory = 'no-mutation guard failure'
  } else if (failures.some((failure) => failure.startsWith('real repo mutation leak'))) {
    failureCategory = 'real repo mutation leak'
  } else if (failures.some((failure) => failure.startsWith('fixture mutation leak'))) {
    failureCategory = 'unexpected write'
  } else if (failures.some((failure) => failure.startsWith('redaction failure'))) {
    failureCategory = 'redaction failure'
  } else if (failures.some((failure) => failure.startsWith('unexpected write'))) {
    failureCategory = 'unexpected write'
  } else if (failures.some((failure) => failure.startsWith('unexpected success claim'))) {
    failureCategory = 'unexpected success claim'
  } else if (failures.some((failure) => failure.startsWith('permission-ux-failure'))) {
    failureCategory = 'permission UX failure'
  }

  return {
    ok: failures.length === 0,
    failures,
    failureCategory,
    statusDetail: failureCategory === 'permission UX failure'
      ? 'permission-ux-failure'
      : statusDetailForApplyPatchDryRunFailureCategory(failureCategory),
  }
}

function assertApplyPatchWriteFixtureSmokeSuccess({ writeBundle, comparison, repoBefore, repoAfter, redaction }) {
  const failures = []
  const writeLane = writeBundle?.writeLane
  const smoke = writeBundle?.smoke
  const fixtureChangedOk =
    comparison.added.length === 0 &&
    comparison.removed.length === 0 &&
    comparison.changed.length === 1 &&
    comparison.changed[0] === 'src/app.ts'
  const protectedFilesUnchanged = !comparison.changed.includes('LOCKED.md')

  if (!repoBefore.ok || repoBefore.status) {
    failures.push('no-mutation guard failure: repository was not clean before smoke')
  }
  if (!repoAfter.ok) {
    failures.push('no-mutation guard failure: repository status could not be checked after smoke')
  } else if (repoAfter.status) {
    failures.push('real repo mutation leak: repository changed during smoke')
  }
  if (!redaction.ok) {
    failures.push(`redaction failure: ${redaction.leaks.join(',') || 'unknown'}`)
  }
  if (!writeBundle?.ok || !writeLane || !smoke) {
    failures.push(writeBundle?.failureReason ?? 'write-fixture-failure: missing isolated write result')
  } else {
    if (!fixtureChangedOk || !protectedFilesUnchanged) {
      failures.push(`unexpected write: added=${comparison.added.join(',') || 'none'} removed=${comparison.removed.join(',') || 'none'} changed=${comparison.changed.join(',') || 'none'}`)
    }
    if (smoke.status !== 'ready') {
      failures.push(`write-fixture-failure: smoke status ${smoke.status}${smoke.failure ? ` (${smoke.failure})` : ''}`)
    }
    if (
      writeLane.status !== 'written' ||
      writeLane.changedFiles?.length !== 1 ||
      writeLane.changedFiles[0] !== 'src/app.ts' ||
      writeLane.writeIntents?.length !== 1 ||
      writeLane.writeIntents[0] !== 'src/app.ts' ||
      writeLane.fixtureWriterInvoked !== true ||
      writeLane.productionWriterInvoked !== false ||
      writeLane.noProductionWrite !== true ||
      writeLane.appliedPatchRecord !== false
    ) {
      failures.push('unexpected write: isolated lane did not report exactly one fixture-only write')
    }
    if (
      writeLane.terminalClassification !== 'success' ||
      writeLane.mutationSuccessClaimAllowed !== true ||
      writeLane.verificationStatus !== 'passed' ||
      smoke.terminalClassification !== 'success' ||
      smoke.mutationSuccessClaimAllowed !== true
    ) {
      failures.push('unexpected success claim: terminal success was not tied to a verified fixture write')
    }
    if (
      smoke.productionWriterInvoked !== false ||
      smoke.noProductionWrite !== true ||
      smoke.appliedPatchRecord !== false ||
      smoke.protectedFilesUnchanged !== true
    ) {
      failures.push('unexpected write: smoke exposed production/applied/protected-file write state')
    }
  }

  let failureCategory = 'none'
  if (failures.some((failure) => failure.startsWith('no-mutation guard failure'))) {
    failureCategory = 'no-mutation guard failure'
  } else if (failures.some((failure) => failure.startsWith('real repo mutation leak'))) {
    failureCategory = 'real repo mutation leak'
  } else if (failures.some((failure) => failure.startsWith('redaction failure'))) {
    failureCategory = 'redaction failure'
  } else if (failures.some((failure) => failure.startsWith('unexpected write'))) {
    failureCategory = 'unexpected write'
  } else if (failures.some((failure) => failure.startsWith('unexpected success claim'))) {
    failureCategory = 'unexpected success claim'
  } else if (failures.some((failure) => failure.startsWith('write-fixture-failure'))) {
    failureCategory = 'write fixture failure'
  }

  return {
    ok: failures.length === 0,
    failures,
    failureCategory,
    statusDetail: failureCategory === 'write fixture failure'
      ? 'write-fixture-failure'
      : statusDetailForApplyPatchDryRunFailureCategory(failureCategory),
  }
}

function assertApplyPatchGuardedWriteSmokeSuccess({ guardedBundle, comparison, repoBefore, repoAfter, redaction }) {
  const failures = []
  const writeLane = guardedBundle?.writeLane
  const smoke = guardedBundle?.smoke
  const workspaceChangedOk =
    comparison.added.length === 0 &&
    comparison.removed.length === 0 &&
    comparison.changed.length === 1 &&
    comparison.changed[0] === 'src/app.ts'
  const protectedFilesUnchanged = !comparison.changed.includes('LOCKED.md')

  if (!repoBefore.ok || repoBefore.status) {
    failures.push('no-mutation guard failure: repository was not clean before smoke')
  }
  if (!repoAfter.ok) {
    failures.push('no-mutation guard failure: repository status could not be checked after smoke')
  } else if (repoAfter.status) {
    failures.push('real repo mutation leak: repository changed during smoke')
  }
  if (!redaction.ok) {
    failures.push(`redaction failure: ${redaction.leaks.join(',') || 'unknown'}`)
  }
  if (!guardedBundle?.ok || !writeLane || !smoke) {
    failures.push(guardedBundle?.failureReason ?? 'guarded-write-failure: missing guarded write result')
  } else {
    if (!workspaceChangedOk || !protectedFilesUnchanged) {
      failures.push(`unexpected write: added=${comparison.added.join(',') || 'none'} removed=${comparison.removed.join(',') || 'none'} changed=${comparison.changed.join(',') || 'none'}`)
    }
    if (smoke.status !== 'ready') {
      failures.push(`guarded-write-failure: smoke status ${smoke.status}${smoke.failure ? ` (${smoke.failure})` : ''}`)
    }
    if (
      writeLane.status !== 'written' ||
      writeLane.changedFiles?.length !== 1 ||
      writeLane.changedFiles[0] !== 'src/app.ts' ||
      writeLane.writeIntents?.length !== 1 ||
      writeLane.writeIntents[0] !== 'src/app.ts' ||
      writeLane.productionWriterInvoked !== true ||
      writeLane.productionWriterTarget !== 'isolated-workspace' ||
      writeLane.realRepositoryWrite !== false ||
      writeLane.appliedPatchRecord !== false
    ) {
      failures.push('unexpected write: guarded lane did not report exactly one isolated workspace write')
    }
    if (
      writeLane.terminalClassification !== 'success' ||
      writeLane.terminalSuccessAllowed !== true ||
      writeLane.mutationSuccessClaimAllowed !== true ||
      writeLane.verificationStatus !== 'passed' ||
      smoke.terminalClassification !== 'success' ||
      smoke.terminalSuccessAllowed !== true ||
      smoke.mutationSuccessClaimAllowed !== true
    ) {
      failures.push('unexpected success claim: terminal success was not tied to a verified guarded write')
    }
    if (
      smoke.productionWriterTarget !== 'isolated-workspace' ||
      smoke.realRepositoryWrite !== false ||
      smoke.appliedPatchRecord !== false ||
      smoke.protectedFilesUnchanged !== true ||
      smoke.repositoryClean !== true
    ) {
      failures.push('unexpected write: smoke exposed non-isolated repository/applied/protected-file write state')
    }
  }

  let failureCategory = 'none'
  if (failures.some((failure) => failure.startsWith('no-mutation guard failure'))) {
    failureCategory = 'no-mutation guard failure'
  } else if (failures.some((failure) => failure.startsWith('real repo mutation leak'))) {
    failureCategory = 'real repo mutation leak'
  } else if (failures.some((failure) => failure.startsWith('redaction failure'))) {
    failureCategory = 'redaction failure'
  } else if (failures.some((failure) => failure.startsWith('unexpected write'))) {
    failureCategory = 'unexpected write'
  } else if (failures.some((failure) => failure.startsWith('unexpected success claim'))) {
    failureCategory = 'unexpected success claim'
  } else if (failures.some((failure) => failure.startsWith('guarded-write-failure'))) {
    failureCategory = 'guarded write failure'
  }

  return {
    ok: failures.length === 0,
    failures,
    failureCategory,
    statusDetail: failureCategory === 'guarded write failure'
      ? 'guarded-write-failure'
      : statusDetailForApplyPatchDryRunFailureCategory(failureCategory),
  }
}

function assertApplyPatchGuardedRouteSmokeSuccess({ routeBundle, comparison, repoBefore, repoAfter, redaction }) {
  const failures = []
  const productionRoute = routeBundle?.productionRoute
  const runtimeProjection = routeBundle?.runtimeProjection
  const smoke = routeBundle?.smoke
  const workspaceChangedOk =
    comparison.added.length === 0 &&
    comparison.removed.length === 0 &&
    comparison.changed.length === 1 &&
    comparison.changed[0] === 'src/app.ts'
  const protectedFilesUnchanged = !comparison.changed.includes('LOCKED.md')

  if (!repoBefore.ok || repoBefore.status) {
    failures.push('no-mutation guard failure: repository was not clean before smoke')
  }
  if (!repoAfter.ok) {
    failures.push('no-mutation guard failure: repository status could not be checked after smoke')
  } else if (repoAfter.status) {
    failures.push('real repo mutation leak: repository changed during smoke')
  }
  if (!redaction.ok) {
    failures.push(`redaction failure: ${redaction.leaks.join(',') || 'unknown'}`)
  }
  if (!routeBundle?.ok || !productionRoute || !runtimeProjection || !smoke) {
    failures.push(routeBundle?.failureReason ?? 'guarded-route-failure: missing guarded route result')
  } else {
    if (!workspaceChangedOk || !protectedFilesUnchanged) {
      failures.push(`unexpected write: added=${comparison.added.join(',') || 'none'} removed=${comparison.removed.join(',') || 'none'} changed=${comparison.changed.join(',') || 'none'}`)
    }
    if (smoke.status !== 'ready') {
      failures.push(`guarded-route-failure: smoke status ${smoke.status}${smoke.failure ? ` (${smoke.failure})` : ''}`)
    }
    if (
      productionRoute.status !== 'written' ||
      productionRoute.routeGate?.status !== 'ready' ||
      productionRoute.changedFiles?.length !== 1 ||
      productionRoute.changedFiles[0] !== 'src/app.ts' ||
      productionRoute.writeIntents?.length !== 1 ||
      productionRoute.writeIntents[0] !== 'src/app.ts' ||
      productionRoute.productionWriterInvoked !== true ||
      productionRoute.productionWriterTarget !== 'isolated-workspace' ||
      productionRoute.realRepositoryWrite !== false ||
      productionRoute.appliedPatchRecord !== false
    ) {
      failures.push('unexpected write: guarded route did not report exactly one isolated workspace write')
    }
    if (
      productionRoute.terminalClassification !== 'success' ||
      productionRoute.terminalSuccessAllowed !== true ||
      productionRoute.mutationSuccessClaimAllowed !== true ||
      productionRoute.resultSessionStatus !== 'write-success' ||
      productionRoute.writeLane?.verificationStatus !== 'passed' ||
      runtimeProjection.status !== 'write-success' ||
      runtimeProjection.terminalStatus !== 'completed' ||
      runtimeProjection.terminalClassification !== 'success' ||
      runtimeProjection.sessionDisplay?.displayStatus !== 'write-success' ||
      runtimeProjection.sessionDisplay?.writeSuccessDisplayed !== true ||
      runtimeProjection.sessionDisplay?.changedDisplay?.length !== 1 ||
      runtimeProjection.sessionDisplay.changedDisplay[0] !== 'src/app.ts' ||
      runtimeProjection.safetyProof?.successAfterVerifiedWrite !== true ||
      smoke.terminalClassification !== 'success' ||
      smoke.terminalSuccessAllowed !== true ||
      smoke.mutationSuccessClaimAllowed !== true
    ) {
      failures.push('unexpected success claim: terminal/result/session success was not tied to a verified guarded route write')
    }
    if (
      smoke.productionWriterTarget !== 'isolated-workspace' ||
      smoke.realRepositoryWrite !== false ||
      smoke.appliedPatchRecord !== false ||
      smoke.protectedFilesUnchanged !== true ||
      smoke.repositoryClean !== true ||
      smoke.routeStatus !== 'written' ||
      smoke.routeGateStatus !== 'ready'
    ) {
      failures.push('unexpected write: smoke exposed non-isolated repository/applied/protected-file route state')
    }
  }

  let failureCategory = 'none'
  if (failures.some((failure) => failure.startsWith('no-mutation guard failure'))) {
    failureCategory = 'no-mutation guard failure'
  } else if (failures.some((failure) => failure.startsWith('real repo mutation leak'))) {
    failureCategory = 'real repo mutation leak'
  } else if (failures.some((failure) => failure.startsWith('redaction failure'))) {
    failureCategory = 'redaction failure'
  } else if (failures.some((failure) => failure.startsWith('unexpected write'))) {
    failureCategory = 'unexpected write'
  } else if (failures.some((failure) => failure.startsWith('unexpected success claim'))) {
    failureCategory = 'unexpected success claim'
  } else if (failures.some((failure) => failure.startsWith('guarded-route-failure'))) {
    failureCategory = 'guarded route failure'
  }

  return {
    ok: failures.length === 0,
    failures,
    failureCategory,
    statusDetail: failureCategory === 'guarded route failure'
      ? 'guarded-route-failure'
      : statusDetailForApplyPatchDryRunFailureCategory(failureCategory),
  }
}

function runRealApplyPatchDryRunSmokeDryRun() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-apply-patch-dry-run-smoke-dry-run')
  console.log('homeRead=false')
  console.log('real-provider execution skipped')
  console.log('modelTurn=false')
  console.log('reportWritten=false')
  console.log('defaultSmoke=skipped')

  const fixture = createApplyPatchDryRunFixture()
  try {
    const before = snapshotApplyPatchDryRunFixture(fixture.fixtureDir)
    const after = snapshotApplyPatchDryRunFixture(fixture.fixtureDir)
    const comparison = compareApplyPatchDryRunSnapshots(before, after)
    const extracted = extractSingleApplyPatchBlock(fixture.prompt)
    const redaction = redactAndAssertCodingProviderOutput([
      fixture.prompt,
      'Authorization: Bearer sk-live-secret-123456789',
      'api_key=sk-url-secret-123456789',
      '/home/wang/.private-agents-real/.private-agents/config.json',
    ].join('\n'))
    const passed =
      comparison.ok &&
      extracted.status === 'ok' &&
      redaction.ok &&
      fixture.prompt.includes('Do not claim that any file was modified')

    console.log(`fixtureFiles=${fixture.files.join(',')}`)
    console.log(`noMutation=${comparison.ok}`)
    console.log(`applyPatchBlocks=${extracted.count}`)
    console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
    console.log('skipReason=real-provider apply_patch dry-run smoke requires explicit opt-in')
    console.log(`[${passed ? 'PASS' : 'FAIL'}] real-apply-patch-dry-run-smoke-contract`)
    process.exit(passed ? 0 : 1)
  } finally {
    cleanupApplyPatchDryRunFixture(fixture.fixtureDir)
  }
}

async function runRealApplyPatchDryRunSmoke() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-apply-patch-dry-run-smoke')
  renderCodingFlowPreflightNotice({ modelTurn: true, writableFixture: false })
  console.log('homeRead=false')
  console.log('defaultSmoke=skipped')
  console.log('realProviderHome=config-only')

  if (!realHome) {
    const status = {
      status: 'CONFIG',
      statusDetail: 'config-failure',
      exitCode: 3,
      failureCategory: 'auth/config failure',
      failureReason: 'config-failure: set PRIVATE_AGENTS_REAL_HOME before running apply_patch dry-run smoke',
    }
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-apply-patch-dry-run-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: status.status,
      statusDetail: status.statusDetail,
      reportPath,
      realProviderExecution: false,
      modelTurn: false,
      noWriteMode: true,
      failureCategory: status.failureCategory,
      failureReason: status.failureReason,
      changedFiles: [],
      writeIntents: [],
      noWriterInvoked: true,
    })
    console.log(`[${status.status}] real-apply-patch-dry-run-smoke status=${status.statusDetail}`)
    console.log(status.failureReason)
    process.exit(status.exitCode)
  }

  const repoBefore = await readRepoStatusShort()
  if (!repoBefore.ok || repoBefore.status) {
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-apply-patch-dry-run-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: 'FAIL',
      statusDetail: 'no-mutation-guard-failure',
      reportPath,
      realProviderExecution: false,
      modelTurn: false,
      noWriteMode: true,
      failureCategory: 'no-mutation guard failure',
      failureReason: repoBefore.ok
        ? 'no-mutation guard failure: repository was not clean before smoke'
        : 'no-mutation guard failure: repository status could not be checked before smoke',
      changedFiles: [],
      writeIntents: [],
      noWriterInvoked: true,
      outputTail: repoBefore.outputTail,
    })
    console.log('[FAIL] real-apply-patch-dry-run-smoke status=no-mutation-guard-failure')
    console.log('failureReason=no-mutation guard failure: repository must be clean before opt-in apply_patch dry-run smoke')
    process.exit(1)
  }

  const preflight = await runProviderReadinessPreflight()
  const preflightStatus = buildCodingFlowPreflightStatus(preflight)
  console.log(`[${preflightStatus.status}] real-apply-patch-dry-run-preflight status=${preflightStatus.statusDetail}`)
  if (!preflight.ok) {
    if (preflight.outputTail) {
      console.log(preflight.outputTail)
    }
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-apply-patch-dry-run-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: preflightStatus.status,
      statusDetail: preflightStatus.statusDetail,
      reportPath,
      realProviderExecution: true,
      modelTurn: false,
      noWriteMode: true,
      failureCategory: codingFlowFailureCategoryForStatus(
        preflightStatus.statusDetail,
        preflightStatus.failureCategory,
      ),
      failureReason: preflightStatus.failureReason,
      changedFiles: [],
      writeIntents: [],
      noWriterInvoked: true,
      outputTail: preflight.outputTail,
    })
    process.exit(preflightStatus.exitCode)
  }

  const runtimeHome = getRealCodingFlowRuntimeHome(`${runId}-apply-patch-dry-run`)
  const auditLogPath = getRealCodingFlowAuditLogPath(`${runId}-apply-patch-dry-run`)
  assertSafeCodingFlowRuntimeHome(runtimeHome)
  assertSafeCodingFlowRuntimeHome(path.dirname(auditLogPath))
  fs.rmSync(runtimeHome, { recursive: true, force: true })
  fs.mkdirSync(runtimeHome, { recursive: true })
  fs.rmSync(path.dirname(auditLogPath), { recursive: true, force: true })
  fs.mkdirSync(path.dirname(auditLogPath), { recursive: true })
  const fixture = createApplyPatchDryRunFixture()
  try {
    const before = snapshotApplyPatchDryRunFixture(fixture.fixtureDir)
    const providerResult = await runApplyPatchDryRunProviderTurn({
      prompt: fixture.prompt,
      runtimeHome,
      realHome,
      fixtureDir: fixture.fixtureDir,
      auditLogPath,
    })
    const redaction = redactAndAssertCodingProviderOutput(providerResult.rawOutput || providerResult.output)
    const redactedProviderOutput = redactAndAssertCodingProviderOutput(providerResult.output).redacted
    const providerFailure = classifyProviderReadinessFailure(
      `apply_patch dry-run model turn exited ${providerResult.code}`,
      redaction.redacted,
      'real',
    )
    const extracted = extractSingleApplyPatchBlock(redactedProviderOutput)
    let routeBundle = undefined
    if (providerResult.code === 0 && !providerResult.timedOut && !providerFailure && extracted.status === 'ok') {
      routeBundle = await runApplyPatchDryRunRoute({
        fixtureDir: fixture.fixtureDir,
        patchText: extracted.patchText,
        redaction,
      })
    }
    const after = snapshotApplyPatchDryRunFixture(fixture.fixtureDir)
    const comparison = compareApplyPatchDryRunSnapshots(before, after)
    const repoAfter = await readRepoStatusShort()

    if (providerFailure || providerResult.code !== 0 || providerResult.timedOut) {
      const failureStatus = buildCodingFlowSmokeFailureStatus(providerResult, redaction.redacted, redaction)
      writeReport({
        generatedAt: new Date().toISOString(),
        capability: 'real-provider-apply-patch-dry-run-smoke',
        provider: 'real',
        mode: 'opt-in-smoke',
        status: failureStatus.status,
        statusDetail: failureStatus.statusDetail,
        reportPath,
        realProviderExecution: true,
        modelTurn: true,
        noWriteMode: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          noMutation: comparison.ok,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean: repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status,
        changedFiles: [],
        writeIntents: [],
        noWriterInvoked: true,
        redaction: { ok: redaction.ok, leaks: redaction.leaks },
        failureCategory: failureStatus.failureCategory,
        failureReason: failureStatus.failureReason,
        outputTail: summarizeOutput(redaction.redacted),
      })
      console.log(`fixtureFiles=${fixture.files.join(',')}`)
      console.log(`noMutation=${comparison.ok}`)
      console.log(`repositoryClean=${repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status}`)
      console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
      console.log(`[${failureStatus.status}] real-apply-patch-dry-run-smoke status=${failureStatus.statusDetail}`)
      if (redaction.redacted) console.log(summarizeOutput(redaction.redacted))
      process.exit(failureStatus.exitCode)
    }

    if (extracted.status !== 'ok') {
      const failureCategory = extracted.status === 'provider-output-multiple-patches'
        ? 'provider output multiple patches'
        : 'provider output missing apply_patch'
      const statusDetail = statusDetailForApplyPatchDryRunFailureCategory(failureCategory)
      writeReport({
        generatedAt: new Date().toISOString(),
        capability: 'real-provider-apply-patch-dry-run-smoke',
        provider: 'real',
        mode: 'opt-in-smoke',
        status: 'FAIL',
        statusDetail,
        reportPath,
        realProviderExecution: true,
        modelTurn: true,
        noWriteMode: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          noMutation: comparison.ok,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean: repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status,
        applyPatchBlocks: extracted.count,
        changedFiles: [],
        writeIntents: [],
        noWriterInvoked: true,
        terminalNoSuccessClaim: true,
        redaction: { ok: redaction.ok, leaks: redaction.leaks },
        failureCategory,
        failureReason: `${statusDetail}: provider output did not contain exactly one apply_patch preview block`,
        outputTail: summarizeOutput(redactedProviderOutput),
      })
      console.log(`fixtureFiles=${fixture.files.join(',')}`)
      console.log(`applyPatchBlocks=${extracted.count}`)
      console.log(`noMutation=${comparison.ok}`)
      console.log(`repositoryClean=${repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status}`)
      console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
      console.log(`[FAIL] real-apply-patch-dry-run-smoke status=${statusDetail}`)
      process.exit(1)
    }

    const success = assertApplyPatchDryRunSmokeSuccess({
      routeBundle,
      comparison,
      repoBefore,
      repoAfter,
      redaction,
    })
    const routeResult = routeBundle?.routeResult
    const report = {
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-apply-patch-dry-run-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: success.ok ? 'PASS' : 'FAIL',
      statusDetail: success.ok ? 'passed' : success.statusDetail,
      reportPath,
      realProviderExecution: true,
      modelTurn: true,
      noWriteMode: true,
      runtimeHome: 'isolated-test-root',
      fixture: {
        files: fixture.files,
        noMutation: comparison.ok,
        added: comparison.added,
        removed: comparison.removed,
        changed: comparison.changed,
      },
      repositoryClean: repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status,
      routeStatus: routeResult?.status ?? 'missing',
      displayStatus: routeResult?.sessionRuntimeSeam?.displayStatus ?? 'missing',
      terminalClassification: routeResult?.resultMapperSeam?.terminalClassification ?? 'missing',
      willWrite: false,
      changedFiles: [],
      writeIntents: [],
      noWriterInvoked: true,
      noAppliedPatchRecord: true,
      terminalNoSuccessClaim: routeResult?.sessionRuntimeSeam?.writeSuccessDisplayed === false &&
        routeResult?.sessionRuntimeSeam?.mutationSuccessDisplayed === false &&
        routeResult?.resultMapperSeam?.terminalClassification !== 'success',
      redaction: { ok: redaction.ok, leaks: redaction.leaks },
      failureCategory: success.failureCategory,
      failureReason: success.failures.join('; '),
      outputTail: summarizeOutput(redactedProviderOutput),
      gateEvidence: routeBundle?.gate?.evidence ?? [],
    }
    writeReport(report)
    console.log(`fixtureFiles=${fixture.files.join(',')}`)
    console.log(`applyPatchBlocks=${extracted.count}`)
    console.log(`noMutation=${comparison.ok}`)
    console.log(`repositoryClean=${report.repositoryClean}`)
    console.log(`routeStatus=${report.routeStatus}`)
    console.log(`displayStatus=${report.displayStatus}`)
    console.log(`terminalClassification=${report.terminalClassification}`)
    console.log('changedFiles=')
    console.log('writeIntents=')
    console.log(`noWriterInvoked=${report.noWriterInvoked}`)
    console.log(`terminalNoSuccessClaim=${report.terminalNoSuccessClaim}`)
    console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
    if (!success.ok) {
      console.log(`failureReason=${report.failureReason}`)
    }
    console.log(`[${success.ok ? 'PASS' : 'FAIL'}] real-apply-patch-dry-run-smoke`)
    process.exit(success.ok ? 0 : 1)
  } finally {
    cleanupApplyPatchDryRunFixture(fixture.fixtureDir)
    cleanupIsolatedCodingFlowRuntimeHome(runtimeHome)
    cleanupIsolatedCodingFlowAuditLog(auditLogPath)
  }
}

async function runRealApplyPatchPermissionUxSmoke() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-apply-patch-permission-ux-smoke')
  renderCodingFlowPreflightNotice({ modelTurn: true, writableFixture: false })
  console.log('homeRead=false')
  console.log('defaultSmoke=skipped')
  console.log('realProviderHome=config-only')

  if (!realHome) {
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-apply-patch-permission-ux-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: 'CONFIG',
      statusDetail: 'config-failure',
      reportPath,
      realProviderExecution: false,
      modelTurn: false,
      noWriteMode: true,
      failureCategory: 'auth/config failure',
      failureReason: 'config-failure: set PRIVATE_AGENTS_REAL_HOME before running apply_patch permission UX smoke',
      changedFiles: [],
      writeIntents: [],
      noWriterInvoked: true,
    })
    console.log('[CONFIG] real-apply-patch-permission-ux-smoke status=config-failure')
    console.log('config-failure: set PRIVATE_AGENTS_REAL_HOME before running apply_patch permission UX smoke')
    process.exit(3)
  }

  const repoBefore = await readRepoStatusShort()
  if (!repoBefore.ok || repoBefore.status) {
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-apply-patch-permission-ux-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: 'FAIL',
      statusDetail: 'no-mutation-guard-failure',
      reportPath,
      realProviderExecution: false,
      modelTurn: false,
      noWriteMode: true,
      failureCategory: 'no-mutation guard failure',
      failureReason: repoBefore.ok
        ? 'no-mutation guard failure: repository was not clean before smoke'
        : 'no-mutation guard failure: repository status could not be checked before smoke',
      changedFiles: [],
      writeIntents: [],
      noWriterInvoked: true,
      outputTail: repoBefore.outputTail,
    })
    console.log('[FAIL] real-apply-patch-permission-ux-smoke status=no-mutation-guard-failure')
    process.exit(1)
  }

  const preflight = await runProviderReadinessPreflight()
  const preflightStatus = buildCodingFlowPreflightStatus(preflight)
  console.log(`[${preflightStatus.status}] real-apply-patch-permission-ux-preflight status=${preflightStatus.statusDetail}`)
  if (!preflight.ok) {
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-apply-patch-permission-ux-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: preflightStatus.status,
      statusDetail: preflightStatus.statusDetail,
      reportPath,
      realProviderExecution: true,
      modelTurn: false,
      noWriteMode: true,
      failureCategory: codingFlowFailureCategoryForStatus(
        preflightStatus.statusDetail,
        preflightStatus.failureCategory,
      ),
      failureReason: preflightStatus.failureReason,
      changedFiles: [],
      writeIntents: [],
      noWriterInvoked: true,
      outputTail: preflight.outputTail,
    })
    process.exit(preflightStatus.exitCode)
  }

  const runtimeHome = getRealCodingFlowRuntimeHome(`${runId}-apply-patch-permission-ux`)
  const auditLogPath = getRealCodingFlowAuditLogPath(`${runId}-apply-patch-permission-ux`)
  assertSafeCodingFlowRuntimeHome(runtimeHome)
  assertSafeCodingFlowRuntimeHome(path.dirname(auditLogPath))
  fs.rmSync(runtimeHome, { recursive: true, force: true })
  fs.mkdirSync(runtimeHome, { recursive: true })
  fs.rmSync(path.dirname(auditLogPath), { recursive: true, force: true })
  fs.mkdirSync(path.dirname(auditLogPath), { recursive: true })
  const fixture = createApplyPatchDryRunFixture()
  try {
    const before = snapshotApplyPatchDryRunFixture(fixture.fixtureDir)
    const providerResult = await runApplyPatchDryRunProviderTurn({
      prompt: fixture.prompt,
      runtimeHome,
      realHome,
      fixtureDir: fixture.fixtureDir,
      auditLogPath,
    })
    const redaction = redactAndAssertCodingProviderOutput(providerResult.rawOutput || providerResult.output)
    const redactedProviderOutput = redactAndAssertCodingProviderOutput(providerResult.output).redacted
    const providerFailure = classifyProviderReadinessFailure(
      `apply_patch permission UX model turn exited ${providerResult.code}`,
      redaction.redacted,
      'real',
    )
    const extracted = extractSingleApplyPatchBlock(redactedProviderOutput)
    let permissionBundle = undefined
    if (providerResult.code === 0 && !providerResult.timedOut && !providerFailure && extracted.status === 'ok') {
      permissionBundle = await runApplyPatchPermissionUxRoute({
        fixtureDir: fixture.fixtureDir,
        patchText: extracted.patchText,
        redaction,
      })
    }
    const after = snapshotApplyPatchDryRunFixture(fixture.fixtureDir)
    const comparison = compareApplyPatchDryRunSnapshots(before, after)
    const repoAfter = await readRepoStatusShort()

    if (providerFailure || providerResult.code !== 0 || providerResult.timedOut) {
      const failureStatus = buildCodingFlowSmokeFailureStatus(providerResult, redaction.redacted, redaction)
      writeReport({
        generatedAt: new Date().toISOString(),
        capability: 'real-provider-apply-patch-permission-ux-smoke',
        provider: 'real',
        mode: 'opt-in-smoke',
        status: failureStatus.status,
        statusDetail: failureStatus.statusDetail,
        reportPath,
        realProviderExecution: true,
        modelTurn: true,
        noWriteMode: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          noMutation: comparison.ok,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean: repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status,
        changedFiles: [],
        writeIntents: [],
        noWriterInvoked: true,
        redaction: { ok: redaction.ok, leaks: redaction.leaks },
        failureCategory: failureStatus.failureCategory,
        failureReason: failureStatus.failureReason,
        outputTail: summarizeOutput(redaction.redacted),
      })
      console.log(`fixtureFiles=${fixture.files.join(',')}`)
      console.log(`noMutation=${comparison.ok}`)
      console.log(`repositoryClean=${repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status}`)
      console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
      console.log(`[${failureStatus.status}] real-apply-patch-permission-ux-smoke status=${failureStatus.statusDetail}`)
      if (redaction.redacted) console.log(summarizeOutput(redaction.redacted))
      process.exit(failureStatus.exitCode)
    }

    if (extracted.status !== 'ok') {
      const failureCategory = extracted.status === 'provider-output-multiple-patches'
        ? 'provider output multiple patches'
        : 'provider output missing apply_patch'
      const statusDetail = statusDetailForApplyPatchDryRunFailureCategory(failureCategory)
      writeReport({
        generatedAt: new Date().toISOString(),
        capability: 'real-provider-apply-patch-permission-ux-smoke',
        provider: 'real',
        mode: 'opt-in-smoke',
        status: 'FAIL',
        statusDetail,
        reportPath,
        realProviderExecution: true,
        modelTurn: true,
        noWriteMode: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          noMutation: comparison.ok,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean: repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status,
        applyPatchBlocks: extracted.count,
        changedFiles: [],
        writeIntents: [],
        noWriterInvoked: true,
        terminalNoSuccessClaim: true,
        redaction: { ok: redaction.ok, leaks: redaction.leaks },
        failureCategory,
        failureReason: `${statusDetail}: provider output did not contain exactly one apply_patch preview block`,
        outputTail: summarizeOutput(redactedProviderOutput),
      })
      console.log(`fixtureFiles=${fixture.files.join(',')}`)
      console.log(`applyPatchBlocks=${extracted.count}`)
      console.log(`noMutation=${comparison.ok}`)
      console.log(`repositoryClean=${repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status}`)
      console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
      console.log(`[FAIL] real-apply-patch-permission-ux-smoke status=${statusDetail}`)
      process.exit(1)
    }

    const success = assertApplyPatchPermissionUxSmokeSuccess({
      permissionBundle,
      comparison,
      repoBefore,
      repoAfter,
      redaction,
    })
    const report = {
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-apply-patch-permission-ux-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: success.ok ? 'PASS' : 'FAIL',
      statusDetail: success.ok ? 'passed' : success.statusDetail,
      reportPath,
      realProviderExecution: true,
      modelTurn: true,
      noWriteMode: true,
      runtimeHome: 'isolated-test-root',
      fixture: {
        files: fixture.files,
        noMutation: comparison.ok,
        added: comparison.added,
        removed: comparison.removed,
        changed: comparison.changed,
      },
      repositoryClean: repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status,
      pendingStatus: permissionBundle?.pendingSeam?.permissionStatus ?? 'missing',
      deniedStatus: permissionBundle?.deniedSeam?.permissionStatus ?? 'missing',
      blockedStatus: permissionBundle?.blockedSeam?.permissionStatus ?? 'missing',
      terminalClassification: permissionBundle?.pendingRouteResult?.resultMapperSeam?.terminalClassification ?? 'missing',
      willWrite: false,
      changedFiles: [],
      writeIntents: [],
      noWriterInvoked: true,
      noAppliedPatchRecord: true,
      terminalNoSuccessClaim: permissionBundle?.pendingRouteResult?.sessionRuntimeSeam?.writeSuccessDisplayed === false &&
        permissionBundle?.pendingRouteResult?.sessionRuntimeSeam?.mutationSuccessDisplayed === false &&
        permissionBundle?.pendingRouteResult?.resultMapperSeam?.terminalClassification !== 'success',
      redaction: { ok: redaction.ok, leaks: redaction.leaks },
      failureCategory: success.failureCategory,
      failureReason: success.failures.join('; '),
      outputTail: summarizeOutput(redactedProviderOutput),
      gateEvidence: permissionBundle?.gate?.evidence ?? [],
    }
    writeReport(report)
    console.log(`fixtureFiles=${fixture.files.join(',')}`)
    console.log(`applyPatchBlocks=${extracted.count}`)
    console.log(`noMutation=${comparison.ok}`)
    console.log(`repositoryClean=${report.repositoryClean}`)
    console.log(`pendingStatus=${report.pendingStatus}`)
    console.log(`deniedStatus=${report.deniedStatus}`)
    console.log(`blockedStatus=${report.blockedStatus}`)
    console.log(`terminalClassification=${report.terminalClassification}`)
    console.log('changedFiles=')
    console.log('writeIntents=')
    console.log(`noWriterInvoked=${report.noWriterInvoked}`)
    console.log(`terminalNoSuccessClaim=${report.terminalNoSuccessClaim}`)
    console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
    if (!success.ok) {
      console.log(`failureReason=${report.failureReason}`)
    }
    console.log(`[${success.ok ? 'PASS' : 'FAIL'}] real-apply-patch-permission-ux-smoke`)
    process.exit(success.ok ? 0 : 1)
  } finally {
    cleanupApplyPatchDryRunFixture(fixture.fixtureDir)
    cleanupIsolatedCodingFlowRuntimeHome(runtimeHome)
    cleanupIsolatedCodingFlowAuditLog(auditLogPath)
  }
}

async function runRealApplyPatchRuntimeNoWriteSmoke() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-apply-patch-runtime-no-write-smoke')
  renderCodingFlowPreflightNotice({ modelTurn: true, writableFixture: false })
  console.log('homeRead=false')
  console.log('defaultSmoke=skipped')
  console.log('realProviderHome=config-only')

  if (!realHome) {
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-apply-patch-runtime-no-write-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: 'CONFIG',
      statusDetail: 'config-failure',
      reportPath,
      realProviderExecution: false,
      modelTurn: false,
      noWriteMode: true,
      failureCategory: 'auth/config failure',
      failureReason: 'config-failure: set PRIVATE_AGENTS_REAL_HOME before running apply_patch runtime no-write smoke',
      changedFiles: [],
      writeIntents: [],
      noWriterInvoked: true,
    })
    console.log('[CONFIG] real-apply-patch-runtime-no-write-smoke status=config-failure')
    console.log('config-failure: set PRIVATE_AGENTS_REAL_HOME before running apply_patch runtime no-write smoke')
    process.exit(3)
  }

  const repoBefore = await readRepoStatusShort()
  if (!repoBefore.ok || repoBefore.status) {
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-apply-patch-runtime-no-write-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: 'FAIL',
      statusDetail: 'no-mutation-guard-failure',
      reportPath,
      realProviderExecution: false,
      modelTurn: false,
      noWriteMode: true,
      failureCategory: 'no-mutation guard failure',
      failureReason: repoBefore.ok
        ? 'no-mutation guard failure: repository was not clean before smoke'
        : 'no-mutation guard failure: repository status could not be checked before smoke',
      changedFiles: [],
      writeIntents: [],
      noWriterInvoked: true,
      outputTail: repoBefore.outputTail,
    })
    console.log('[FAIL] real-apply-patch-runtime-no-write-smoke status=no-mutation-guard-failure')
    process.exit(1)
  }

  const preflight = await runProviderReadinessPreflight()
  const preflightStatus = buildCodingFlowPreflightStatus(preflight)
  console.log(`[${preflightStatus.status}] real-apply-patch-runtime-no-write-preflight status=${preflightStatus.statusDetail}`)
  if (!preflight.ok) {
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-apply-patch-runtime-no-write-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: preflightStatus.status,
      statusDetail: preflightStatus.statusDetail,
      reportPath,
      realProviderExecution: true,
      modelTurn: false,
      noWriteMode: true,
      failureCategory: codingFlowFailureCategoryForStatus(
        preflightStatus.statusDetail,
        preflightStatus.failureCategory,
      ),
      failureReason: preflightStatus.failureReason,
      changedFiles: [],
      writeIntents: [],
      noWriterInvoked: true,
      outputTail: preflight.outputTail,
    })
    process.exit(preflightStatus.exitCode)
  }

  const runtimeHome = getRealCodingFlowRuntimeHome(`${runId}-apply-patch-runtime-no-write`)
  const auditLogPath = getRealCodingFlowAuditLogPath(`${runId}-apply-patch-runtime-no-write`)
  assertSafeCodingFlowRuntimeHome(runtimeHome)
  assertSafeCodingFlowRuntimeHome(path.dirname(auditLogPath))
  fs.rmSync(runtimeHome, { recursive: true, force: true })
  fs.mkdirSync(runtimeHome, { recursive: true })
  fs.rmSync(path.dirname(auditLogPath), { recursive: true, force: true })
  fs.mkdirSync(path.dirname(auditLogPath), { recursive: true })
  const fixture = createApplyPatchDryRunFixture()
  try {
    const before = snapshotApplyPatchDryRunFixture(fixture.fixtureDir)
    const providerResult = await runApplyPatchDryRunProviderTurn({
      prompt: fixture.prompt,
      runtimeHome,
      realHome,
      fixtureDir: fixture.fixtureDir,
      auditLogPath,
    })
    const redaction = redactAndAssertCodingProviderOutput(providerResult.rawOutput || providerResult.output)
    const redactedProviderOutput = redactAndAssertCodingProviderOutput(providerResult.output).redacted
    const providerFailure = classifyProviderReadinessFailure(
      `apply_patch runtime no-write model turn exited ${providerResult.code}`,
      redaction.redacted,
      'real',
    )
    const extracted = extractSingleApplyPatchBlock(redactedProviderOutput)
    let runtimeBundle = undefined
    const afterProvider = snapshotApplyPatchDryRunFixture(fixture.fixtureDir)
    const providerComparison = compareApplyPatchDryRunSnapshots(before, afterProvider)
    const repoAfterProvider = await readRepoStatusShort()
    if (providerResult.code === 0 && !providerResult.timedOut && !providerFailure && extracted.status === 'ok') {
      runtimeBundle = await runApplyPatchRuntimeNoWriteRoute({
        fixtureDir: fixture.fixtureDir,
        patchText: extracted.patchText,
        redaction,
        fixtureUnchanged: providerComparison.ok,
        repositoryClean: repoBefore.ok && !repoBefore.status && repoAfterProvider.ok && !repoAfterProvider.status,
      })
    }
    const after = snapshotApplyPatchDryRunFixture(fixture.fixtureDir)
    const comparison = compareApplyPatchDryRunSnapshots(before, after)
    const repoAfter = await readRepoStatusShort()

    if (providerFailure || providerResult.code !== 0 || providerResult.timedOut) {
      const failureStatus = buildCodingFlowSmokeFailureStatus(providerResult, redaction.redacted, redaction)
      writeReport({
        generatedAt: new Date().toISOString(),
        capability: 'real-provider-apply-patch-runtime-no-write-smoke',
        provider: 'real',
        mode: 'opt-in-smoke',
        status: failureStatus.status,
        statusDetail: failureStatus.statusDetail,
        reportPath,
        realProviderExecution: true,
        modelTurn: true,
        noWriteMode: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          noMutation: comparison.ok,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean: repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status,
        changedFiles: [],
        writeIntents: [],
        noWriterInvoked: true,
        noAppliedPatchRecord: true,
        terminalNoSuccessClaim: true,
        redaction: { ok: redaction.ok, leaks: redaction.leaks },
        failureCategory: failureStatus.failureCategory,
        failureReason: failureStatus.failureReason,
        outputTail: summarizeOutput(redaction.redacted),
      })
      console.log(`fixtureFiles=${fixture.files.join(',')}`)
      console.log(`noMutation=${comparison.ok}`)
      console.log(`repositoryClean=${repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status}`)
      console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
      console.log(`[${failureStatus.status}] real-apply-patch-runtime-no-write-smoke status=${failureStatus.statusDetail}`)
      if (redaction.redacted) console.log(summarizeOutput(redaction.redacted))
      process.exit(failureStatus.exitCode)
    }

    if (extracted.status !== 'ok') {
      const failureCategory = extracted.status === 'provider-output-multiple-patches'
        ? 'provider output multiple patches'
        : 'provider output missing apply_patch'
      const statusDetail = statusDetailForApplyPatchDryRunFailureCategory(failureCategory)
      writeReport({
        generatedAt: new Date().toISOString(),
        capability: 'real-provider-apply-patch-runtime-no-write-smoke',
        provider: 'real',
        mode: 'opt-in-smoke',
        status: 'FAIL',
        statusDetail,
        reportPath,
        realProviderExecution: true,
        modelTurn: true,
        noWriteMode: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          noMutation: comparison.ok,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean: repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status,
        applyPatchBlocks: extracted.count,
        changedFiles: [],
        writeIntents: [],
        noWriterInvoked: true,
        noAppliedPatchRecord: true,
        terminalNoSuccessClaim: true,
        redaction: { ok: redaction.ok, leaks: redaction.leaks },
        failureCategory,
        failureReason: `${statusDetail}: provider output did not contain exactly one apply_patch preview block`,
        outputTail: summarizeOutput(redactedProviderOutput),
      })
      console.log(`fixtureFiles=${fixture.files.join(',')}`)
      console.log(`applyPatchBlocks=${extracted.count}`)
      console.log(`noMutation=${comparison.ok}`)
      console.log(`repositoryClean=${repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status}`)
      console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
      console.log(`[FAIL] real-apply-patch-runtime-no-write-smoke status=${statusDetail}`)
      process.exit(1)
    }

    const success = assertApplyPatchRuntimeNoWriteSmokeSuccess({
      runtimeBundle,
      comparison,
      repoBefore,
      repoAfter,
      redaction,
    })
    const route = runtimeBundle?.route
    const smoke = runtimeBundle?.smoke
    const report = {
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-apply-patch-runtime-no-write-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: success.ok ? 'PASS' : 'FAIL',
      statusDetail: success.ok ? 'passed' : success.statusDetail,
      reportPath,
      realProviderExecution: true,
      modelTurn: true,
      noWriteMode: true,
      runtimeHome: 'isolated-test-root',
      fixture: {
        files: fixture.files,
        noMutation: comparison.ok,
        added: comparison.added,
        removed: comparison.removed,
        changed: comparison.changed,
      },
      repositoryClean: repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status,
      routeStatus: route?.routeStatus ?? 'missing',
      displayStatus: route?.displayStatus ?? 'missing',
      terminalClassification: route?.terminalClassification ?? 'missing',
      willWrite: false,
      changedFiles: [],
      writeIntents: [],
      noWriterInvoked: true,
      noAppliedPatchRecord: true,
      terminalNoSuccessClaim: route?.doesNotClaimWriteSuccess === true &&
        route?.doesNotClaimMutationSuccess === true &&
        route?.terminalClassification !== 'success',
      redaction: { ok: redaction.ok, leaks: redaction.leaks },
      failureCategory: success.failureCategory,
      failureReason: success.failures.join('; '),
      outputTail: summarizeOutput(redactedProviderOutput),
      gateStatus: smoke?.status ?? 'missing',
      gateEvidence: smoke?.evidence ?? [],
    }
    writeReport(report)
    console.log(`fixtureFiles=${fixture.files.join(',')}`)
    console.log(`applyPatchBlocks=${extracted.count}`)
    console.log(`noMutation=${comparison.ok}`)
    console.log(`repositoryClean=${report.repositoryClean}`)
    console.log(`routeStatus=${report.routeStatus}`)
    console.log(`displayStatus=${report.displayStatus}`)
    console.log(`terminalClassification=${report.terminalClassification}`)
    console.log('changedFiles=')
    console.log('writeIntents=')
    console.log(`noWriterInvoked=${report.noWriterInvoked}`)
    console.log(`noAppliedPatchRecord=${report.noAppliedPatchRecord}`)
    console.log(`terminalNoSuccessClaim=${report.terminalNoSuccessClaim}`)
    console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
    if (!success.ok) {
      console.log(`failureReason=${report.failureReason}`)
    }
    console.log(`[${success.ok ? 'PASS' : 'FAIL'}] real-apply-patch-runtime-no-write-smoke`)
    process.exit(success.ok ? 0 : 1)
  } finally {
    cleanupApplyPatchDryRunFixture(fixture.fixtureDir)
    cleanupIsolatedCodingFlowRuntimeHome(runtimeHome)
    cleanupIsolatedCodingFlowAuditLog(auditLogPath)
  }
}

async function runRealApplyPatchWriteFixtureSmoke() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-apply-patch-write-fixture-smoke')
  renderCodingFlowPreflightNotice({ modelTurn: true, writableFixture: true })
  console.log('homeRead=false')
  console.log('defaultSmoke=skipped')
  console.log('realProviderHome=config-only')
  console.log('writeScope=isolated-fixture-only')

  if (!realHome) {
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-apply-patch-write-fixture-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: 'CONFIG',
      statusDetail: 'config-failure',
      reportPath,
      realProviderExecution: false,
      modelTurn: false,
      noProductionWrite: true,
      failureCategory: 'auth/config failure',
      failureReason: 'config-failure: set PRIVATE_AGENTS_REAL_HOME before running apply_patch write fixture smoke',
      changedFiles: [],
      writeIntents: [],
      productionWriterInvoked: false,
    })
    console.log('[CONFIG] real-apply-patch-write-fixture-smoke status=config-failure')
    console.log('config-failure: set PRIVATE_AGENTS_REAL_HOME before running apply_patch write fixture smoke')
    process.exit(3)
  }

  const repoBefore = await readRepoStatusShort()
  if (!repoBefore.ok || repoBefore.status) {
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-apply-patch-write-fixture-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: 'FAIL',
      statusDetail: 'no-mutation-guard-failure',
      reportPath,
      realProviderExecution: false,
      modelTurn: false,
      noProductionWrite: true,
      failureCategory: 'no-mutation guard failure',
      failureReason: repoBefore.ok
        ? 'no-mutation guard failure: repository was not clean before smoke'
        : 'no-mutation guard failure: repository status could not be checked before smoke',
      changedFiles: [],
      writeIntents: [],
      productionWriterInvoked: false,
      outputTail: repoBefore.outputTail,
    })
    console.log('[FAIL] real-apply-patch-write-fixture-smoke status=no-mutation-guard-failure')
    process.exit(1)
  }

  const preflight = await runProviderReadinessPreflight()
  const preflightStatus = buildCodingFlowPreflightStatus(preflight)
  console.log(`[${preflightStatus.status}] real-apply-patch-write-fixture-preflight status=${preflightStatus.statusDetail}`)
  if (!preflight.ok) {
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-apply-patch-write-fixture-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: preflightStatus.status,
      statusDetail: preflightStatus.statusDetail,
      reportPath,
      realProviderExecution: true,
      modelTurn: false,
      noProductionWrite: true,
      failureCategory: codingFlowFailureCategoryForStatus(
        preflightStatus.statusDetail,
        preflightStatus.failureCategory,
      ),
      failureReason: preflightStatus.failureReason,
      changedFiles: [],
      writeIntents: [],
      productionWriterInvoked: false,
      outputTail: preflight.outputTail,
    })
    process.exit(preflightStatus.exitCode)
  }

  const runtimeHome = getRealCodingFlowRuntimeHome(`${runId}-apply-patch-write-fixture`)
  const auditLogPath = getRealCodingFlowAuditLogPath(`${runId}-apply-patch-write-fixture`)
  assertSafeCodingFlowRuntimeHome(runtimeHome)
  assertSafeCodingFlowRuntimeHome(path.dirname(auditLogPath))
  fs.rmSync(runtimeHome, { recursive: true, force: true })
  fs.mkdirSync(runtimeHome, { recursive: true })
  fs.rmSync(path.dirname(auditLogPath), { recursive: true, force: true })
  fs.mkdirSync(path.dirname(auditLogPath), { recursive: true })
  const fixture = createApplyPatchDryRunFixture()
  try {
    const before = snapshotApplyPatchDryRunFixture(fixture.fixtureDir)
    const providerResult = await runApplyPatchDryRunProviderTurn({
      prompt: fixture.prompt,
      runtimeHome,
      realHome,
      fixtureDir: fixture.fixtureDir,
      auditLogPath,
    })
    const redaction = redactAndAssertCodingProviderOutput(providerResult.rawOutput || providerResult.output)
    const redactedProviderOutput = redactAndAssertCodingProviderOutput(providerResult.output).redacted
    const providerFailure = classifyProviderReadinessFailure(
      `apply_patch write fixture model turn exited ${providerResult.code}`,
      redaction.redacted,
      'real',
    )
    const extracted = extractSingleApplyPatchBlock(redactedProviderOutput)
    let writeBundle = undefined
    if (providerResult.code === 0 && !providerResult.timedOut && !providerFailure && extracted.status === 'ok') {
      const routeBefore = snapshotApplyPatchDryRunFixture(fixture.fixtureDir)
      writeBundle = await runApplyPatchWriteFixtureRoute({
        fixtureDir: fixture.fixtureDir,
        patchText: extracted.patchText,
        redaction,
        fixtureChangedFiles: ['src/app.ts'],
        protectedFilesUnchanged: true,
      })
      const routeAfter = snapshotApplyPatchDryRunFixture(fixture.fixtureDir)
      const routeComparison = compareApplyPatchDryRunSnapshots(routeBefore, routeAfter)
      if (
        writeBundle?.writeLane?.status === 'written' &&
        (
          routeComparison.added.length !== 0 ||
          routeComparison.removed.length !== 0 ||
          routeComparison.changed.length !== 1 ||
          routeComparison.changed[0] !== 'src/app.ts'
        )
      ) {
        writeBundle = {
          ...(writeBundle ?? {}),
          ok: false,
          failureReason: `write-fixture-failure: isolated route changed unexpected files added=${routeComparison.added.join(',') || 'none'} removed=${routeComparison.removed.join(',') || 'none'} changed=${routeComparison.changed.join(',') || 'none'}`,
          routeComparison,
        }
      }
    }
    const after = snapshotApplyPatchDryRunFixture(fixture.fixtureDir)
    const comparison = compareApplyPatchDryRunSnapshots(before, after)
    const repoAfter = await readRepoStatusShort()

    if (providerFailure || providerResult.code !== 0 || providerResult.timedOut) {
      const failureStatus = buildCodingFlowSmokeFailureStatus(providerResult, redaction.redacted, redaction)
      writeReport({
        generatedAt: new Date().toISOString(),
        capability: 'real-provider-apply-patch-write-fixture-smoke',
        provider: 'real',
        mode: 'opt-in-smoke',
        status: failureStatus.status,
        statusDetail: failureStatus.statusDetail,
        reportPath,
        realProviderExecution: true,
        modelTurn: true,
        noProductionWrite: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean: repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status,
        changedFiles: [],
        writeIntents: [],
        productionWriterInvoked: false,
        redaction: { ok: redaction.ok, leaks: redaction.leaks },
        failureCategory: failureStatus.failureCategory,
        failureReason: failureStatus.failureReason,
        outputTail: summarizeOutput(redaction.redacted),
      })
      console.log(`fixtureFiles=${fixture.files.join(',')}`)
      console.log(`fixtureChanged=${comparison.changed.join(',') || 'none'}`)
      console.log(`repositoryClean=${repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status}`)
      console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
      console.log(`[${failureStatus.status}] real-apply-patch-write-fixture-smoke status=${failureStatus.statusDetail}`)
      if (redaction.redacted) console.log(summarizeOutput(redaction.redacted))
      process.exit(failureStatus.exitCode)
    }

    if (extracted.status !== 'ok') {
      const failureCategory = extracted.status === 'provider-output-multiple-patches'
        ? 'provider output multiple patches'
        : 'provider output missing apply_patch'
      const statusDetail = statusDetailForApplyPatchDryRunFailureCategory(failureCategory)
      writeReport({
        generatedAt: new Date().toISOString(),
        capability: 'real-provider-apply-patch-write-fixture-smoke',
        provider: 'real',
        mode: 'opt-in-smoke',
        status: 'FAIL',
        statusDetail,
        reportPath,
        realProviderExecution: true,
        modelTurn: true,
        noProductionWrite: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean: repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status,
        applyPatchBlocks: extracted.count,
        changedFiles: [],
        writeIntents: [],
        productionWriterInvoked: false,
        terminalSuccessAllowed: false,
        redaction: { ok: redaction.ok, leaks: redaction.leaks },
        failureCategory,
        failureReason: `${statusDetail}: provider output did not contain exactly one apply_patch preview block`,
        outputTail: summarizeOutput(redactedProviderOutput),
      })
      console.log(`fixtureFiles=${fixture.files.join(',')}`)
      console.log(`applyPatchBlocks=${extracted.count}`)
      console.log(`fixtureChanged=${comparison.changed.join(',') || 'none'}`)
      console.log(`repositoryClean=${repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status}`)
      console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
      console.log(`[FAIL] real-apply-patch-write-fixture-smoke status=${statusDetail}`)
      process.exit(1)
    }

    const success = assertApplyPatchWriteFixtureSmokeSuccess({
      writeBundle,
      comparison,
      repoBefore,
      repoAfter,
      redaction,
    })
    const writeDecision = writeBundle?.writeDecision
    const writeLane = writeBundle?.writeLane
    const smoke = writeBundle?.smoke
    const report = {
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-apply-patch-write-fixture-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: success.ok ? 'PASS' : 'FAIL',
      statusDetail: success.ok ? 'passed' : success.statusDetail,
      reportPath,
      realProviderExecution: true,
      modelTurn: true,
      noProductionWrite: true,
      runtimeHome: 'isolated-test-root',
      fixture: {
        files: fixture.files,
        added: comparison.added,
        removed: comparison.removed,
        changed: comparison.changed,
        protectedFilesUnchanged: !comparison.changed.includes('LOCKED.md'),
      },
      repositoryClean: repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status,
      routeRunnerFailure: writeBundle?.ok === false
        ? writeBundle.failureReason ?? 'write-fixture-failure: route runner failed'
        : '',
      writeDecisionStatus: writeDecision?.status ?? 'missing',
      writeDecisionBlocker: writeDecision?.blocker ?? '',
      writeLaneStatus: writeLane?.status ?? 'missing',
      writeLaneBlocker: writeLane?.blocker ?? '',
      terminalClassification: writeLane?.terminalClassification ?? 'missing',
      changedFiles: writeLane?.changedFiles ?? [],
      writeIntents: writeLane?.writeIntents ?? [],
      fixtureWriterInvoked: writeLane?.fixtureWriterInvoked ?? false,
      productionWriterInvoked: writeLane?.productionWriterInvoked ?? false,
      noAppliedPatchRecord: writeLane?.appliedPatchRecord === false,
      terminalSuccessAllowed: writeLane?.mutationSuccessClaimAllowed === true &&
        writeLane?.terminalClassification === 'success' &&
        writeLane?.verificationStatus === 'passed',
      redaction: { ok: redaction.ok, leaks: redaction.leaks },
      failureCategory: success.failureCategory,
      failureReason: success.failures.join('; '),
      outputTail: summarizeOutput(redactedProviderOutput),
      gateStatus: smoke?.status ?? 'missing',
      gateEvidence: smoke?.evidence ?? [],
    }
    writeReport(report)
    console.log(`fixtureFiles=${fixture.files.join(',')}`)
    console.log(`applyPatchBlocks=${extracted.count}`)
    console.log(`fixtureChanged=${comparison.changed.join(',') || 'none'}`)
    console.log(`repositoryClean=${report.repositoryClean}`)
    console.log(`writeDecisionStatus=${report.writeDecisionStatus}`)
    if (report.writeDecisionBlocker) console.log(`writeDecisionBlocker=${report.writeDecisionBlocker}`)
    console.log(`writeLaneStatus=${report.writeLaneStatus}`)
    if (report.writeLaneBlocker) console.log(`writeLaneBlocker=${report.writeLaneBlocker}`)
    console.log(`terminalClassification=${report.terminalClassification}`)
    console.log(`changedFiles=${report.changedFiles.join(',')}`)
    console.log(`writeIntents=${report.writeIntents.join(',')}`)
    console.log(`fixtureWriterInvoked=${report.fixtureWriterInvoked}`)
    console.log(`productionWriterInvoked=${report.productionWriterInvoked}`)
    console.log(`noAppliedPatchRecord=${report.noAppliedPatchRecord}`)
    console.log(`terminalSuccessAllowed=${report.terminalSuccessAllowed}`)
    console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
    if (!success.ok) {
      if (report.routeRunnerFailure) console.log(`routeRunnerFailure=${report.routeRunnerFailure}`)
      console.log(`failureReason=${report.failureReason}`)
    }
    console.log(`[${success.ok ? 'PASS' : 'FAIL'}] real-apply-patch-write-fixture-smoke`)
    process.exit(success.ok ? 0 : 1)
  } finally {
    cleanupApplyPatchDryRunFixture(fixture.fixtureDir)
    cleanupIsolatedCodingFlowRuntimeHome(runtimeHome)
    cleanupIsolatedCodingFlowAuditLog(auditLogPath)
  }
}

async function runRealApplyPatchGuardedWriteSmoke() {
  const smokeRunId = `real-apply-patch-guarded-write-${Date.now()}`
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-apply-patch-guarded-write-smoke')
  console.log('status taxonomy: pass=0 product-regression=1 provider-network-inconclusive=2 config-failure=3')
  console.log('real-provider=explicit-opt-in')
  console.log('homeRead=false')
  console.log('defaultSmoke=skipped')
  console.log('realProviderHome=config-only')
  console.log('writeScope=isolated-workspace-only')

  if (!realHome) {
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-apply-patch-guarded-write-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: 'CONFIG',
      statusDetail: 'config-failure',
      reportPath,
      realProviderExecution: false,
      modelTurn: false,
      noProductionWrite: true,
      failureCategory: 'auth/config failure',
      failureReason: 'config-failure: set PRIVATE_AGENTS_REAL_HOME before running apply_patch guarded write smoke',
      changedFiles: [],
      writeIntents: [],
      productionWriterInvoked: false,
    })
    console.log('[CONFIG] real-apply-patch-guarded-write-smoke status=config-failure')
    console.log('config-failure: set PRIVATE_AGENTS_REAL_HOME before running apply_patch guarded write smoke')
    process.exit(3)
  }

  const repoBefore = await readRepoStatusShort()
  if (!repoBefore.ok || repoBefore.status) {
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-apply-patch-guarded-write-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: 'FAIL',
      statusDetail: 'no-mutation-guard-failure',
      reportPath,
      realProviderExecution: false,
      modelTurn: false,
      noProductionWrite: true,
      failureCategory: 'no-mutation guard failure',
      failureReason: repoBefore.ok
        ? 'no-mutation guard failure: repository was not clean before smoke'
        : 'no-mutation guard failure: repository status could not be checked before smoke',
      changedFiles: [],
      writeIntents: [],
      productionWriterInvoked: false,
      outputTail: repoBefore.outputTail,
    })
    console.log('[FAIL] real-apply-patch-guarded-write-smoke status=no-mutation-guard-failure')
    process.exit(1)
  }

  const preflight = await runProviderReadinessPreflight()
  const preflightStatus = buildCodingFlowPreflightStatus(preflight)
  console.log(`[${preflightStatus.status}] real-apply-patch-guarded-write-preflight status=${preflightStatus.statusDetail}`)
  if (!preflight.ok) {
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-apply-patch-guarded-write-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: preflightStatus.status,
      statusDetail: preflightStatus.statusDetail,
      reportPath,
      realProviderExecution: true,
      modelTurn: false,
      noProductionWrite: true,
      failureCategory: codingFlowFailureCategoryForStatus(
        preflightStatus.statusDetail,
        preflightStatus.failureCategory,
      ),
      failureReason: preflightStatus.failureReason,
      changedFiles: [],
      writeIntents: [],
      productionWriterInvoked: false,
      outputTail: preflight.outputTail,
    })
    process.exit(preflightStatus.exitCode)
  }

  const runtimeHome = getRealCodingFlowRuntimeHome(`${smokeRunId}-apply-patch-guarded-write`)
  const auditLogPath = getRealCodingFlowAuditLogPath(`${smokeRunId}-apply-patch-guarded-write`)
  assertSafeCodingFlowRuntimeHome(runtimeHome)
  assertSafeCodingFlowRuntimeHome(path.dirname(auditLogPath))
  fs.rmSync(runtimeHome, { recursive: true, force: true })
  fs.mkdirSync(runtimeHome, { recursive: true })
  fs.rmSync(path.dirname(auditLogPath), { recursive: true, force: true })
  fs.mkdirSync(path.dirname(auditLogPath), { recursive: true })
  const fixture = createApplyPatchDryRunFixture()
  try {
    const before = snapshotApplyPatchDryRunFixture(fixture.fixtureDir)
    const providerResult = await runApplyPatchDryRunProviderTurn({
      prompt: fixture.prompt,
      runtimeHome,
      realHome,
      fixtureDir: fixture.fixtureDir,
      auditLogPath,
    })
    const redaction = redactAndAssertCodingProviderOutput(providerResult.rawOutput || providerResult.output)
    const redactedProviderOutput = redactAndAssertCodingProviderOutput(providerResult.output).redacted
    const providerFailure = classifyProviderReadinessFailure(
      `apply_patch guarded write model turn exited ${providerResult.code}`,
      redaction.redacted,
      'real',
    )
    const extracted = extractSingleApplyPatchBlock(redactedProviderOutput)
    let guardedBundle = undefined
    if (providerResult.code === 0 && !providerResult.timedOut && !providerFailure && extracted.status === 'ok') {
      const routeBefore = snapshotApplyPatchDryRunFixture(fixture.fixtureDir)
      const repoDuringRoute = await readRepoStatusShort()
      guardedBundle = await runApplyPatchGuardedWriteRoute({
        fixtureDir: fixture.fixtureDir,
        patchText: extracted.patchText,
        redaction,
        workspaceChangedFiles: ['src/app.ts'],
        protectedFilesUnchanged: true,
        repositoryClean: repoBefore.ok && !repoBefore.status && repoDuringRoute.ok && !repoDuringRoute.status,
      })
      const routeAfter = snapshotApplyPatchDryRunFixture(fixture.fixtureDir)
      const routeComparison = compareApplyPatchDryRunSnapshots(routeBefore, routeAfter)
      if (
        guardedBundle?.writeLane?.status === 'written' &&
        (
          routeComparison.added.length !== 0 ||
          routeComparison.removed.length !== 0 ||
          routeComparison.changed.length !== 1 ||
          routeComparison.changed[0] !== 'src/app.ts'
        )
      ) {
        guardedBundle = {
          ...(guardedBundle ?? {}),
          ok: false,
          failureReason: `guarded-write-failure: guarded route changed unexpected files added=${routeComparison.added.join(',') || 'none'} removed=${routeComparison.removed.join(',') || 'none'} changed=${routeComparison.changed.join(',') || 'none'}`,
          routeComparison,
        }
      }
    }
    const after = snapshotApplyPatchDryRunFixture(fixture.fixtureDir)
    const comparison = compareApplyPatchDryRunSnapshots(before, after)
    const repoAfter = await readRepoStatusShort()

    if (providerFailure || providerResult.code !== 0 || providerResult.timedOut) {
      const failureStatus = buildCodingFlowSmokeFailureStatus(providerResult, redaction.redacted, redaction)
      writeReport({
        generatedAt: new Date().toISOString(),
        capability: 'real-provider-apply-patch-guarded-write-smoke',
        provider: 'real',
        mode: 'opt-in-smoke',
        status: failureStatus.status,
        statusDetail: failureStatus.statusDetail,
        reportPath,
        realProviderExecution: true,
        modelTurn: true,
        noProductionWrite: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean: repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status,
        changedFiles: [],
        writeIntents: [],
        productionWriterInvoked: false,
        redaction: { ok: redaction.ok, leaks: redaction.leaks },
        failureCategory: failureStatus.failureCategory,
        failureReason: failureStatus.failureReason,
        outputTail: summarizeOutput(redaction.redacted),
      })
      console.log(`fixtureFiles=${fixture.files.join(',')}`)
      console.log(`fixtureChanged=${comparison.changed.join(',') || 'none'}`)
      console.log(`repositoryClean=${repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status}`)
      console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
      console.log(`[${failureStatus.status}] real-apply-patch-guarded-write-smoke status=${failureStatus.statusDetail}`)
      if (redaction.redacted) console.log(summarizeOutput(redaction.redacted))
      process.exit(failureStatus.exitCode)
    }

    if (extracted.status !== 'ok') {
      const failureCategory = extracted.status === 'provider-output-multiple-patches'
        ? 'provider output multiple patches'
        : 'provider output missing apply_patch'
      const statusDetail = statusDetailForApplyPatchDryRunFailureCategory(failureCategory)
      writeReport({
        generatedAt: new Date().toISOString(),
        capability: 'real-provider-apply-patch-guarded-write-smoke',
        provider: 'real',
        mode: 'opt-in-smoke',
        status: 'FAIL',
        statusDetail,
        reportPath,
        realProviderExecution: true,
        modelTurn: true,
        noProductionWrite: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean: repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status,
        applyPatchBlocks: extracted.count,
        changedFiles: [],
        writeIntents: [],
        productionWriterInvoked: false,
        terminalSuccessAllowed: false,
        redaction: { ok: redaction.ok, leaks: redaction.leaks },
        failureCategory,
        failureReason: `${statusDetail}: provider output did not contain exactly one apply_patch preview block`,
        outputTail: summarizeOutput(redactedProviderOutput),
      })
      console.log(`fixtureFiles=${fixture.files.join(',')}`)
      console.log(`applyPatchBlocks=${extracted.count}`)
      console.log(`fixtureChanged=${comparison.changed.join(',') || 'none'}`)
      console.log(`repositoryClean=${repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status}`)
      console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
      console.log(`[FAIL] real-apply-patch-guarded-write-smoke status=${statusDetail}`)
      process.exit(1)
    }

    const success = assertApplyPatchGuardedWriteSmokeSuccess({
      guardedBundle,
      comparison,
      repoBefore,
      repoAfter,
      redaction,
    })
    const writeDecision = guardedBundle?.writeDecision
    const guardedGate = guardedBundle?.guardedGate
    const writeLane = guardedBundle?.writeLane
    const smoke = guardedBundle?.smoke
    const report = {
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-apply-patch-guarded-write-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: success.ok ? 'PASS' : 'FAIL',
      statusDetail: success.ok ? 'passed' : success.statusDetail,
      reportPath,
      realProviderExecution: true,
      modelTurn: true,
      noProductionWrite: true,
      runtimeHome: 'isolated-test-root',
      fixture: {
        files: fixture.files,
        added: comparison.added,
        removed: comparison.removed,
        changed: comparison.changed,
        protectedFilesUnchanged: !comparison.changed.includes('LOCKED.md'),
      },
      repositoryClean: repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status,
      routeRunnerFailure: guardedBundle?.ok === false
        ? guardedBundle.failureReason ?? 'guarded-write-failure: route runner failed'
        : '',
      writeDecisionStatus: writeDecision?.status ?? 'missing',
      writeDecisionBlocker: writeDecision?.blocker ?? '',
      guardedGateStatus: guardedGate?.status ?? 'missing',
      guardedGateBlocker: guardedGate?.blocker ?? '',
      writeLaneStatus: writeLane?.status ?? 'missing',
      writeLaneBlocker: writeLane?.blocker ?? '',
      terminalClassification: writeLane?.terminalClassification ?? 'missing',
      changedFiles: writeLane?.changedFiles ?? [],
      writeIntents: writeLane?.writeIntents ?? [],
      productionWriterInvoked: writeLane?.productionWriterInvoked ?? false,
      productionWriterTarget: writeLane?.productionWriterTarget ?? 'missing',
      realRepositoryWrite: writeLane?.realRepositoryWrite ?? true,
      noAppliedPatchRecord: writeLane?.appliedPatchRecord === false,
      terminalSuccessAllowed: writeLane?.terminalSuccessAllowed === true &&
        writeLane?.terminalClassification === 'success' &&
        writeLane?.verificationStatus === 'passed',
      redaction: { ok: redaction.ok, leaks: redaction.leaks },
      failureCategory: success.failureCategory,
      failureReason: success.failures.join('; '),
      outputTail: summarizeOutput(redactedProviderOutput),
      gateStatus: smoke?.status ?? 'missing',
      gateEvidence: smoke?.evidence ?? [],
    }
    writeReport(report)
    console.log(`fixtureFiles=${fixture.files.join(',')}`)
    console.log(`applyPatchBlocks=${extracted.count}`)
    console.log(`fixtureChanged=${comparison.changed.join(',') || 'none'}`)
    console.log(`repositoryClean=${report.repositoryClean}`)
    console.log(`writeDecisionStatus=${report.writeDecisionStatus}`)
    if (report.writeDecisionBlocker) console.log(`writeDecisionBlocker=${report.writeDecisionBlocker}`)
    console.log(`guardedGateStatus=${report.guardedGateStatus}`)
    if (report.guardedGateBlocker) console.log(`guardedGateBlocker=${report.guardedGateBlocker}`)
    console.log(`writeLaneStatus=${report.writeLaneStatus}`)
    if (report.writeLaneBlocker) console.log(`writeLaneBlocker=${report.writeLaneBlocker}`)
    console.log(`terminalClassification=${report.terminalClassification}`)
    console.log(`changedFiles=${report.changedFiles.join(',')}`)
    console.log(`writeIntents=${report.writeIntents.join(',')}`)
    console.log(`productionWriterInvoked=${report.productionWriterInvoked}`)
    console.log(`productionWriterTarget=${report.productionWriterTarget}`)
    console.log(`realRepositoryWrite=${report.realRepositoryWrite}`)
    console.log(`noAppliedPatchRecord=${report.noAppliedPatchRecord}`)
    console.log(`terminalSuccessAllowed=${report.terminalSuccessAllowed}`)
    console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
    if (!success.ok) {
      if (report.routeRunnerFailure) console.log(`routeRunnerFailure=${report.routeRunnerFailure}`)
      console.log(`failureReason=${report.failureReason}`)
    }
    console.log(`[${success.ok ? 'PASS' : 'FAIL'}] real-apply-patch-guarded-write-smoke`)
    process.exit(success.ok ? 0 : 1)
  } finally {
    cleanupApplyPatchDryRunFixture(fixture.fixtureDir)
    cleanupIsolatedCodingFlowRuntimeHome(runtimeHome)
    cleanupIsolatedCodingFlowAuditLog(auditLogPath)
  }
}

async function runRealApplyPatchGuardedRouteSmoke() {
  const smokeRunId = `real-apply-patch-guarded-route-${Date.now()}`
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-apply-patch-guarded-route-smoke')
  console.log('status taxonomy: pass=0 product-regression=1 provider-network-inconclusive=2 config-failure=3')
  console.log('real-provider=explicit-opt-in')
  console.log('homeRead=false')
  console.log('defaultSmoke=skipped')
  console.log('realProviderHome=config-only')
  console.log('writeScope=isolated-workspace-only')

  if (!realHome) {
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-apply-patch-guarded-route-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: 'CONFIG',
      statusDetail: 'config-failure',
      reportPath,
      realProviderExecution: false,
      modelTurn: false,
      noProductionWrite: true,
      failureCategory: 'auth/config failure',
      failureReason: 'config-failure: set PRIVATE_AGENTS_REAL_HOME before running apply_patch guarded route smoke',
      changedFiles: [],
      writeIntents: [],
      productionWriterInvoked: false,
    })
    console.log('[CONFIG] real-apply-patch-guarded-route-smoke status=config-failure')
    console.log('config-failure: set PRIVATE_AGENTS_REAL_HOME before running apply_patch guarded route smoke')
    process.exit(3)
  }

  const repoBefore = await readRepoStatusShort()
  if (!repoBefore.ok || repoBefore.status) {
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-apply-patch-guarded-route-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: 'FAIL',
      statusDetail: 'no-mutation-guard-failure',
      reportPath,
      realProviderExecution: false,
      modelTurn: false,
      noProductionWrite: true,
      failureCategory: 'no-mutation guard failure',
      failureReason: repoBefore.ok
        ? 'no-mutation guard failure: repository was not clean before smoke'
        : 'no-mutation guard failure: repository status could not be checked before smoke',
      changedFiles: [],
      writeIntents: [],
      productionWriterInvoked: false,
      outputTail: repoBefore.outputTail,
    })
    console.log('[FAIL] real-apply-patch-guarded-route-smoke status=no-mutation-guard-failure')
    process.exit(1)
  }

  const preflight = await runProviderReadinessPreflight()
  const preflightStatus = buildCodingFlowPreflightStatus(preflight)
  console.log(`[${preflightStatus.status}] real-apply-patch-guarded-route-preflight status=${preflightStatus.statusDetail}`)
  if (!preflight.ok) {
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-apply-patch-guarded-route-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: preflightStatus.status,
      statusDetail: preflightStatus.statusDetail,
      reportPath,
      realProviderExecution: true,
      modelTurn: false,
      noProductionWrite: true,
      failureCategory: codingFlowFailureCategoryForStatus(
        preflightStatus.statusDetail,
        preflightStatus.failureCategory,
      ),
      failureReason: preflightStatus.failureReason,
      changedFiles: [],
      writeIntents: [],
      productionWriterInvoked: false,
      outputTail: preflight.outputTail,
    })
    process.exit(preflightStatus.exitCode)
  }

  const runtimeHome = getRealCodingFlowRuntimeHome(`${smokeRunId}-apply-patch-guarded-route`)
  const auditLogPath = getRealCodingFlowAuditLogPath(`${smokeRunId}-apply-patch-guarded-route`)
  assertSafeCodingFlowRuntimeHome(runtimeHome)
  assertSafeCodingFlowRuntimeHome(path.dirname(auditLogPath))
  fs.rmSync(runtimeHome, { recursive: true, force: true })
  fs.mkdirSync(runtimeHome, { recursive: true })
  fs.rmSync(path.dirname(auditLogPath), { recursive: true, force: true })
  fs.mkdirSync(path.dirname(auditLogPath), { recursive: true })
  const fixture = createApplyPatchDryRunFixture()
  try {
    const before = snapshotApplyPatchDryRunFixture(fixture.fixtureDir)
    const providerResult = await runApplyPatchDryRunProviderTurn({
      prompt: fixture.prompt,
      runtimeHome,
      realHome,
      fixtureDir: fixture.fixtureDir,
      auditLogPath,
    })
    const redaction = redactAndAssertCodingProviderOutput(providerResult.rawOutput || providerResult.output)
    const redactedProviderOutput = redactAndAssertCodingProviderOutput(providerResult.output).redacted
    const providerFailure = classifyProviderReadinessFailure(
      `apply_patch guarded route model turn exited ${providerResult.code}`,
      redaction.redacted,
      'real',
    )
    const extracted = extractSingleApplyPatchBlock(redactedProviderOutput)
    let routeBundle = undefined
    if (providerResult.code === 0 && !providerResult.timedOut && !providerFailure && extracted.status === 'ok') {
      const routeBefore = snapshotApplyPatchDryRunFixture(fixture.fixtureDir)
      const repoDuringRoute = await readRepoStatusShort()
      routeBundle = await runApplyPatchGuardedRouteRoute({
        fixtureDir: fixture.fixtureDir,
        patchText: extracted.patchText,
        redaction,
        workspaceChangedFiles: ['src/app.ts'],
        protectedFilesUnchanged: true,
        repositoryClean: repoBefore.ok && !repoBefore.status && repoDuringRoute.ok && !repoDuringRoute.status,
      })
      const routeAfter = snapshotApplyPatchDryRunFixture(fixture.fixtureDir)
      const routeComparison = compareApplyPatchDryRunSnapshots(routeBefore, routeAfter)
      if (
        routeBundle?.productionRoute?.status === 'written' &&
        (
          routeComparison.added.length !== 0 ||
          routeComparison.removed.length !== 0 ||
          routeComparison.changed.length !== 1 ||
          routeComparison.changed[0] !== 'src/app.ts'
        )
      ) {
        routeBundle = {
          ...(routeBundle ?? {}),
          ok: false,
          failureReason: `guarded-route-failure: guarded route changed unexpected files added=${routeComparison.added.join(',') || 'none'} removed=${routeComparison.removed.join(',') || 'none'} changed=${routeComparison.changed.join(',') || 'none'}`,
          routeComparison,
        }
      }
    }
    const after = snapshotApplyPatchDryRunFixture(fixture.fixtureDir)
    const comparison = compareApplyPatchDryRunSnapshots(before, after)
    const repoAfter = await readRepoStatusShort()

    if (providerFailure || providerResult.code !== 0 || providerResult.timedOut) {
      const failureStatus = buildCodingFlowSmokeFailureStatus(providerResult, redaction.redacted, redaction)
      writeReport({
        generatedAt: new Date().toISOString(),
        capability: 'real-provider-apply-patch-guarded-route-smoke',
        provider: 'real',
        mode: 'opt-in-smoke',
        status: failureStatus.status,
        statusDetail: failureStatus.statusDetail,
        reportPath,
        realProviderExecution: true,
        modelTurn: true,
        noProductionWrite: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean: repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status,
        changedFiles: [],
        writeIntents: [],
        productionWriterInvoked: false,
        redaction: { ok: redaction.ok, leaks: redaction.leaks },
        failureCategory: failureStatus.failureCategory,
        failureReason: failureStatus.failureReason,
        outputTail: summarizeOutput(redaction.redacted),
      })
      console.log(`fixtureFiles=${fixture.files.join(',')}`)
      console.log(`fixtureChanged=${comparison.changed.join(',') || 'none'}`)
      console.log(`repositoryClean=${repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status}`)
      console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
      console.log(`[${failureStatus.status}] real-apply-patch-guarded-route-smoke status=${failureStatus.statusDetail}`)
      if (redaction.redacted) console.log(summarizeOutput(redaction.redacted))
      process.exit(failureStatus.exitCode)
    }

    if (extracted.status !== 'ok') {
      const failureCategory = extracted.status === 'provider-output-multiple-patches'
        ? 'provider output multiple patches'
        : 'provider output missing apply_patch'
      const statusDetail = statusDetailForApplyPatchDryRunFailureCategory(failureCategory)
      writeReport({
        generatedAt: new Date().toISOString(),
        capability: 'real-provider-apply-patch-guarded-route-smoke',
        provider: 'real',
        mode: 'opt-in-smoke',
        status: 'FAIL',
        statusDetail,
        reportPath,
        realProviderExecution: true,
        modelTurn: true,
        noProductionWrite: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean: repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status,
        applyPatchBlocks: extracted.count,
        changedFiles: [],
        writeIntents: [],
        productionWriterInvoked: false,
        terminalSuccessAllowed: false,
        redaction: { ok: redaction.ok, leaks: redaction.leaks },
        failureCategory,
        failureReason: `${statusDetail}: provider output did not contain exactly one apply_patch preview block`,
        outputTail: summarizeOutput(redactedProviderOutput),
      })
      console.log(`fixtureFiles=${fixture.files.join(',')}`)
      console.log(`applyPatchBlocks=${extracted.count}`)
      console.log(`fixtureChanged=${comparison.changed.join(',') || 'none'}`)
      console.log(`repositoryClean=${repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status}`)
      console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
      console.log(`[FAIL] real-apply-patch-guarded-route-smoke status=${statusDetail}`)
      process.exit(1)
    }

    const success = assertApplyPatchGuardedRouteSmokeSuccess({
      routeBundle,
      comparison,
      repoBefore,
      repoAfter,
      redaction,
    })
    const writeDecision = routeBundle?.writeDecision
    const guardedGate = routeBundle?.guardedGate
    const productionRoute = routeBundle?.productionRoute
    const runtimeProjection = routeBundle?.runtimeProjection
    const routeGate = productionRoute?.routeGate
    const writeLane = productionRoute?.writeLane
    const smoke = routeBundle?.smoke
    const report = {
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-apply-patch-guarded-route-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: success.ok ? 'PASS' : 'FAIL',
      statusDetail: success.ok ? 'passed' : success.statusDetail,
      reportPath,
      realProviderExecution: true,
      modelTurn: true,
      noProductionWrite: true,
      runtimeHome: 'isolated-test-root',
      fixture: {
        files: fixture.files,
        added: comparison.added,
        removed: comparison.removed,
        changed: comparison.changed,
        protectedFilesUnchanged: !comparison.changed.includes('LOCKED.md'),
      },
      repositoryClean: repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status,
      routeRunnerFailure: routeBundle?.ok === false
        ? routeBundle.failureReason ?? 'guarded-route-failure: route runner failed'
        : '',
      writeDecisionStatus: writeDecision?.status ?? 'missing',
      writeDecisionBlocker: writeDecision?.blocker ?? '',
      guardedGateStatus: guardedGate?.status ?? 'missing',
      guardedGateBlocker: guardedGate?.blocker ?? '',
      routeGateStatus: routeGate?.status ?? 'missing',
      routeGateBlocker: routeGate?.blocker ?? '',
      productionRouteStatus: productionRoute?.status ?? 'missing',
      productionRouteBlocker: productionRoute?.blocker ?? '',
      writeLaneStatus: writeLane?.status ?? 'missing',
      writeLaneBlocker: writeLane?.blocker ?? '',
      terminalClassification: productionRoute?.terminalClassification ?? 'missing',
      mappedTerminalClassification: runtimeProjection?.terminalClassification ?? 'missing',
      mappedTerminalStatus: runtimeProjection?.terminalStatus ?? 'missing',
      sessionDisplayStatus: runtimeProjection?.sessionDisplay?.displayStatus ?? 'missing',
      changedFiles: productionRoute?.changedFiles ?? [],
      writeIntents: productionRoute?.writeIntents ?? [],
      productionWriterInvoked: productionRoute?.productionWriterInvoked ?? false,
      productionWriterTarget: productionRoute?.productionWriterTarget ?? 'missing',
      realRepositoryWrite: productionRoute?.realRepositoryWrite ?? true,
      noAppliedPatchRecord: productionRoute?.appliedPatchRecord === false,
      terminalSuccessAllowed: productionRoute?.terminalSuccessAllowed === true &&
        productionRoute?.terminalClassification === 'success' &&
        productionRoute?.writeLane?.verificationStatus === 'passed',
      redaction: { ok: redaction.ok, leaks: redaction.leaks },
      failureCategory: success.failureCategory,
      failureReason: success.failures.join('; '),
      outputTail: summarizeOutput(redactedProviderOutput),
      gateStatus: smoke?.status ?? 'missing',
      gateEvidence: smoke?.evidence ?? [],
    }
    writeReport(report)
    console.log(`fixtureFiles=${fixture.files.join(',')}`)
    console.log(`applyPatchBlocks=${extracted.count}`)
    console.log(`fixtureChanged=${comparison.changed.join(',') || 'none'}`)
    console.log(`repositoryClean=${report.repositoryClean}`)
    console.log(`writeDecisionStatus=${report.writeDecisionStatus}`)
    if (report.writeDecisionBlocker) console.log(`writeDecisionBlocker=${report.writeDecisionBlocker}`)
    console.log(`guardedGateStatus=${report.guardedGateStatus}`)
    if (report.guardedGateBlocker) console.log(`guardedGateBlocker=${report.guardedGateBlocker}`)
    console.log(`routeGateStatus=${report.routeGateStatus}`)
    if (report.routeGateBlocker) console.log(`routeGateBlocker=${report.routeGateBlocker}`)
    console.log(`productionRouteStatus=${report.productionRouteStatus}`)
    if (report.productionRouteBlocker) console.log(`productionRouteBlocker=${report.productionRouteBlocker}`)
    console.log(`writeLaneStatus=${report.writeLaneStatus}`)
    if (report.writeLaneBlocker) console.log(`writeLaneBlocker=${report.writeLaneBlocker}`)
    console.log(`terminalClassification=${report.terminalClassification}`)
    console.log(`mappedTerminalClassification=${report.mappedTerminalClassification}`)
    console.log(`mappedTerminalStatus=${report.mappedTerminalStatus}`)
    console.log(`sessionDisplayStatus=${report.sessionDisplayStatus}`)
    console.log(`changedFiles=${report.changedFiles.join(',')}`)
    console.log(`writeIntents=${report.writeIntents.join(',')}`)
    console.log(`productionWriterInvoked=${report.productionWriterInvoked}`)
    console.log(`productionWriterTarget=${report.productionWriterTarget}`)
    console.log(`realRepositoryWrite=${report.realRepositoryWrite}`)
    console.log(`noAppliedPatchRecord=${report.noAppliedPatchRecord}`)
    console.log(`terminalSuccessAllowed=${report.terminalSuccessAllowed}`)
    console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
    if (!success.ok) {
      if (report.routeRunnerFailure) console.log(`routeRunnerFailure=${report.routeRunnerFailure}`)
      console.log(`failureReason=${report.failureReason}`)
    }
    console.log(`[${success.ok ? 'PASS' : 'FAIL'}] real-apply-patch-guarded-route-smoke`)
    process.exit(success.ok ? 0 : 1)
  } finally {
    cleanupApplyPatchDryRunFixture(fixture.fixtureDir)
    cleanupIsolatedCodingFlowRuntimeHome(runtimeHome)
    cleanupIsolatedCodingFlowAuditLog(auditLogPath)
  }
}

async function runRealApplyPatchWorkspaceWriteSmoke() {
  console.log('mode=real-apply-patch-workspace-write-smoke')
  console.log('status taxonomy: pass=0 product-regression=1 provider-network-inconclusive=2 config-failure=3')
  console.log('real-provider=explicit-opt-in')
  console.log('homeRead=false')
  console.log('defaultSmoke=skipped')
  console.log('realProviderHome=config-only')
  console.log('writeScope=isolated-test-workspace-only')

  if (!realHome) {
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-apply-patch-workspace-write-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: 'CONFIG',
      statusDetail: 'config-failure',
      reportPath,
      realProviderExecution: false,
      modelTurn: false,
      failureCategory: 'auth/config failure',
      failureReason: 'config-failure: set PRIVATE_AGENTS_REAL_HOME before running apply_patch workspace write smoke',
      changedFiles: [],
      writeIntents: [],
      workspaceWriterInvoked: false,
    })
    console.log('[CONFIG] real-apply-patch-workspace-write-smoke status=config-failure')
    process.exit(3)
  }

  const repoBefore = await readRepoStatusShort()
  if (!repoBefore.ok || repoBefore.status) {
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-apply-patch-workspace-write-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: 'FAIL',
      statusDetail: 'no-mutation-guard-failure',
      reportPath,
      realProviderExecution: false,
      modelTurn: false,
      failureCategory: 'no-mutation guard failure',
      failureReason: repoBefore.ok
        ? 'no-mutation guard failure: repository was not clean before smoke'
        : 'no-mutation guard failure: repository status could not be checked before smoke',
      changedFiles: [],
      writeIntents: [],
      workspaceWriterInvoked: false,
      outputTail: repoBefore.outputTail,
    })
    console.log('[FAIL] real-apply-patch-workspace-write-smoke status=no-mutation-guard-failure')
    process.exit(1)
  }

  const preflight = await runProviderReadinessPreflight()
  const preflightStatus = buildCodingFlowPreflightStatus(preflight)
  console.log(`[${preflightStatus.status}] real-apply-patch-workspace-write-preflight status=${preflightStatus.statusDetail}`)
  if (!preflight.ok) {
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-apply-patch-workspace-write-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: preflightStatus.status,
      statusDetail: preflightStatus.statusDetail,
      reportPath,
      realProviderExecution: true,
      modelTurn: false,
      failureCategory: codingFlowFailureCategoryForStatus(
        preflightStatus.statusDetail,
        preflightStatus.failureCategory,
      ),
      failureReason: preflightStatus.failureReason,
      changedFiles: [],
      writeIntents: [],
      workspaceWriterInvoked: false,
      outputTail: preflight.outputTail,
    })
    process.exit(preflightStatus.exitCode)
  }

  const smokeRunId = `real-apply-patch-workspace-write-${Date.now()}`
  const runtimeHome = getRealCodingFlowRuntimeHome(`${smokeRunId}-apply-patch-workspace-write`)
  const auditLogPath = getRealCodingFlowAuditLogPath(`${smokeRunId}-apply-patch-workspace-write`)
  assertSafeCodingFlowRuntimeHome(runtimeHome)
  assertSafeCodingFlowRuntimeHome(path.dirname(auditLogPath))
  fs.rmSync(runtimeHome, { recursive: true, force: true })
  fs.mkdirSync(runtimeHome, { recursive: true })
  fs.rmSync(path.dirname(auditLogPath), { recursive: true, force: true })
  fs.mkdirSync(path.dirname(auditLogPath), { recursive: true })
  const fixture = createApplyPatchDryRunFixture()
  try {
    const before = snapshotApplyPatchDryRunFixture(fixture.fixtureDir)
    const providerResult = await runApplyPatchDryRunProviderTurn({
      prompt: fixture.prompt,
      runtimeHome,
      realHome,
      fixtureDir: fixture.fixtureDir,
      auditLogPath,
    })
    const redaction = redactAndAssertCodingProviderOutput(providerResult.rawOutput || providerResult.output)
    const redactedProviderOutput = redactAndAssertCodingProviderOutput(providerResult.output).redacted
    const providerFailure = classifyProviderReadinessFailure(
      `apply_patch workspace write model turn exited ${providerResult.code}`,
      redaction.redacted,
      'real',
    )
    const extracted = extractSingleApplyPatchBlock(redactedProviderOutput)
    let cliResult = undefined
    if (providerResult.code === 0 && !providerResult.timedOut && !providerFailure && extracted.status === 'ok') {
      cliResult = await runApplyPatchWorkspaceWriteCli({
        fixtureDir: fixture.fixtureDir,
        patchText: extracted.patchText,
        runtimeHome,
        auditLogPath,
      })
    }
    const after = snapshotApplyPatchDryRunFixture(fixture.fixtureDir)
    const comparison = compareApplyPatchDryRunSnapshots(before, after)
    const repoAfter = await readRepoStatusShort()
    const cliRedaction = redactAndAssertCodingProviderOutput(cliResult?.output ?? '')
    const redactionOk = redaction.ok && cliRedaction.ok
    const repositoryClean = repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status

    if (providerFailure || providerResult.code !== 0 || providerResult.timedOut) {
      const failureStatus = buildCodingFlowSmokeFailureStatus(providerResult, redaction.redacted, redaction)
      writeReport({
        generatedAt: new Date().toISOString(),
        capability: 'real-provider-apply-patch-workspace-write-smoke',
        provider: 'real',
        mode: 'opt-in-smoke',
        status: failureStatus.status,
        statusDetail: failureStatus.statusDetail,
        reportPath,
        realProviderExecution: true,
        modelTurn: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean,
        changedFiles: [],
        writeIntents: [],
        workspaceWriterInvoked: false,
        redaction: { ok: redaction.ok, leaks: redaction.leaks },
        failureCategory: failureStatus.failureCategory,
        failureReason: failureStatus.failureReason,
        outputTail: summarizeOutput(redaction.redacted),
      })
      console.log(`[${failureStatus.status}] real-apply-patch-workspace-write-smoke status=${failureStatus.statusDetail}`)
      if (redaction.redacted) console.log(summarizeOutput(redaction.redacted))
      process.exit(failureStatus.exitCode)
    }

    if (extracted.status !== 'ok') {
      const failureCategory = extracted.status === 'provider-output-multiple-patches'
        ? 'provider output multiple patches'
        : 'provider output missing apply_patch'
      const statusDetail = statusDetailForApplyPatchDryRunFailureCategory(failureCategory)
      writeReport({
        generatedAt: new Date().toISOString(),
        capability: 'real-provider-apply-patch-workspace-write-smoke',
        provider: 'real',
        mode: 'opt-in-smoke',
        status: 'FAIL',
        statusDetail,
        reportPath,
        realProviderExecution: true,
        modelTurn: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean,
        applyPatchBlocks: extracted.count,
        changedFiles: [],
        writeIntents: [],
        workspaceWriterInvoked: false,
        terminalSuccessAllowed: false,
        redaction: { ok: redactionOk, leaks: [...redaction.leaks, ...cliRedaction.leaks] },
        failureCategory,
        failureReason: `${statusDetail}: provider output did not contain exactly one apply_patch preview block`,
        outputTail: summarizeOutput(redactedProviderOutput),
      })
      console.log(`[FAIL] real-apply-patch-workspace-write-smoke status=${statusDetail}`)
      process.exit(1)
    }

    const expectedChanged = comparison.added.length === 0 &&
      comparison.removed.length === 0 &&
      comparison.changed.length === 1 &&
      comparison.changed[0] === 'src/app.ts'
    const cliPassed = cliResult?.code === 0 &&
      !cliResult.timedOut &&
      /apply_patch workspace write succeeded/i.test(cliResult.output) &&
      /success/i.test(cliResult.output)
    const protectedFilesUnchanged = !comparison.changed.includes('LOCKED.md')
    const success = expectedChanged && cliPassed && repositoryClean && redactionOk && protectedFilesUnchanged
    const failures = [
      ...(expectedChanged ? [] : [`unexpected write target: changed=${comparison.changed.join(',') || 'none'} added=${comparison.added.join(',') || 'none'} removed=${comparison.removed.join(',') || 'none'}`]),
      ...(cliPassed ? [] : [`cli route failure: code=${cliResult?.code ?? 'missing'} timedOut=${cliResult?.timedOut ?? 'missing'}`]),
      ...(repositoryClean ? [] : ['repository mutated or status unavailable']),
      ...(redactionOk ? [] : [`redaction failure: ${[...redaction.leaks, ...cliRedaction.leaks].join(',') || 'unknown'}`]),
      ...(protectedFilesUnchanged ? [] : ['protected fixture file changed']),
    ]
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-apply-patch-workspace-write-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: success ? 'PASS' : 'FAIL',
      statusDetail: success ? 'passed' : 'workspace-write-route-failure',
      reportPath,
      realProviderExecution: true,
      modelTurn: true,
      runtimeHome: 'isolated-test-root',
      fixture: {
        files: fixture.files,
        added: comparison.added,
        removed: comparison.removed,
        changed: comparison.changed,
        protectedFilesUnchanged,
      },
      repositoryClean,
      applyPatchBlocks: extracted.count,
      changedFiles: success ? ['src/app.ts'] : [],
      writeIntents: success ? ['src/app.ts'] : [],
      workspaceWriterInvoked: success,
      writerTarget: success ? 'isolated-test-workspace' : 'missing',
      terminalSuccessAllowed: success,
      redaction: { ok: redactionOk, leaks: [...redaction.leaks, ...cliRedaction.leaks] },
      failureCategory: success ? 'none' : 'route failure',
      failureReason: failures.join('; '),
      outputTail: summarizeOutput(cliRedaction.redacted || redactedProviderOutput),
    })
    console.log(`fixtureFiles=${fixture.files.join(',')}`)
    console.log(`applyPatchBlocks=${extracted.count}`)
    console.log(`fixtureChanged=${comparison.changed.join(',') || 'none'}`)
    console.log(`repositoryClean=${repositoryClean}`)
    console.log(`workspaceWriterInvoked=${success}`)
    console.log(`writerTarget=${success ? 'isolated-test-workspace' : 'missing'}`)
    console.log(`changedFiles=${success ? 'src/app.ts' : ''}`)
    console.log(`writeIntents=${success ? 'src/app.ts' : ''}`)
    console.log(`terminalSuccessAllowed=${success}`)
    console.log(`redaction=${redactionOk ? 'pass' : 'fail'}`)
    if (!success) console.log(`failureReason=${failures.join('; ')}`)
    console.log(`[${success ? 'PASS' : 'FAIL'}] real-apply-patch-workspace-write-smoke`)
    process.exit(success ? 0 : 1)
  } finally {
    cleanupApplyPatchDryRunFixture(fixture.fixtureDir)
    cleanupIsolatedCodingFlowRuntimeHome(runtimeHome)
    cleanupIsolatedCodingFlowAuditLog(auditLogPath)
  }
}

function runCandidateMutationFailureTaxonomySelfTest() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=candidate-mutation-failure-taxonomy-self-test')
  console.log('realProviderTouched=false')
  console.log('candidateMutationRealExecuted=false')
  console.log('defaultMvpAffected=false')

  const failures = []
  for (const fixture of candidateMutationFailureTaxonomyFixtures()) {
    const result = withRoute01FailureClass(fixture.fields)
    const actual = result.route02FailureClass ?? route02FailureClassForCandidate(result)
    const surface = buildTerminalResultSurface(result)
    const successLike =
      result.status === 'PASS' ||
      surface.outcome === 'success' ||
      surface.statusDetail === 'passed'
    if (actual !== fixture.expected) {
      failures.push(`${fixture.name}: expected ${fixture.expected}, got ${actual}`)
    }
    if (fixture.mustNotSuccess && successLike) {
      failures.push(`${fixture.name}: failure fixture rendered success-like surface`)
    }
    const label = actual === fixture.expected && (!fixture.mustNotSuccess || !successLike)
      ? 'pass'
      : 'fail'
    console.log(`[${label}] candidate-mutation-taxonomy-${fixture.name} - Route02Class=${actual} outcome=${surface.outcome} status=${surface.statusDetail}`)
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.log(`[fail] candidate-mutation-failure-taxonomy-self-test - ${failure}`)
    }
    process.exit(1)
  }
  console.log('[pass] candidate-mutation-failure-taxonomy-self-test')
}

function route03CliOutcome(output, code) {
  if (/Outcome:\s*success/i.test(output) || /apply_patch .*workspace write succeeded/i.test(output)) {
    return 'success'
  }
  if (/Outcome:\s*stopped/i.test(output) || /stopped before success/i.test(output) || /blocked before success/i.test(output)) {
    return 'stopped'
  }
  if (code !== 0) return 'error'
  return 'unknown'
}

function route03CommandDisplay() {
  return [
    process.execPath,
    path.relative(repoRoot, tsxCliPath),
    path.relative(repoRoot, cliEntryPath),
    '--project',
    '<isolated-selected-workspace>',
    '--print',
    '--apply-patch-workspace-write',
    '--non-interactive-approval',
    'allow-once',
    '<apply_patch-text>',
  ].join(' ')
}

async function runRoute03TwoFileCliScenario(scenario) {
  prepareProject(scenario)
  const runtimeHome = path.join(testRoot, 'route03-cli-evidence-runtime-home', `${scenario.id}-${runId}`)
  const auditLogPath = path.join(testRoot, 'route03-cli-evidence-audit', `${scenario.id}-${runId}`, 'permissions.jsonl')
  fs.rmSync(runtimeHome, { recursive: true, force: true })
  fs.mkdirSync(runtimeHome, { recursive: true })
  fs.rmSync(path.dirname(auditLogPath), { recursive: true, force: true })
  fs.mkdirSync(path.dirname(auditLogPath), { recursive: true })

  try {
    const before = snapshot(scenario.projectDir)
    const result = await runApplyPatchWorkspaceWriteCli({
      fixtureDir: scenario.projectDir,
      patchText: scenario.patchText,
      runtimeHome,
      auditLogPath,
    })
    const after = snapshot(scenario.projectDir)
    const observedChanged = changedFiles(before, after)
    return {
      id: scenario.id,
      code: result.code,
      timedOut: result.timedOut,
      output: result.output,
      outputTail: summarizeOutput(result.output),
      outcome: route03CliOutcome(result.output, result.code),
      changedFiles: observedChanged,
      failedFiles: scenario.expectFailedFiles ?? [],
      selectedWorkspaceIsolated: scenario.projectDir.startsWith(`${testRoot}${path.sep}`),
    }
  } finally {
    fs.rmSync(scenario.projectDir, { recursive: true, force: true })
    fs.rmSync(runtimeHome, { recursive: true, force: true })
    fs.rmSync(path.dirname(auditLogPath), { recursive: true, force: true })
  }
}

async function runRoute03TwoFileCliPathEvidence() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=route03-two-file-cli-path-evidence')
  console.log('realProviderTouched=false')
  console.log('realProviderExecutionAttempted=false')
  console.log(`cliCommand=${route03CommandDisplay()}`)
  console.log('cliMode=--print')
  console.log('providerMode=synthetic')

  const successScenario = {
    id: 'route03-two-file-cli-success',
    projectDir: path.join(testRoot, `route03-two-file-cli-success-${runId}`),
    files: {
      'src/a.ts': 'a\n',
      'src/b.ts': 'b\n',
      'src/c.ts': 'c\n',
      'LOCKED.md': 'locked\n',
    },
    patchText: [
      '*** Begin Patch',
      '*** Update File: src/a.ts',
      '@@',
      '-a',
      '+aa',
      '*** Update File: src/b.ts',
      '@@',
      '-b',
      '+bb',
      '*** End Patch',
    ].join('\n'),
  }
  const threeFileScenario = {
    id: 'route03-unsupported-three-file-update',
    projectDir: path.join(testRoot, `route03-three-file-cli-${runId}`),
    files: {
      'src/a.ts': 'a\n',
      'src/b.ts': 'b\n',
      'src/c.ts': 'c\n',
      'LOCKED.md': 'locked\n',
    },
    patchText: [
      '*** Begin Patch',
      '*** Update File: src/a.ts',
      '@@',
      '-a',
      '+aa',
      '*** Update File: src/b.ts',
      '@@',
      '-b',
      '+bb',
      '*** Update File: src/c.ts',
      '@@',
      '-c',
      '+cc',
      '*** End Patch',
    ].join('\n'),
  }
  const deleteScenario = {
    id: 'route03-unsupported-delete-request',
    projectDir: path.join(testRoot, `route03-delete-cli-${runId}`),
    files: {
      'src/a.ts': 'a\n',
      'src/b.ts': 'b\n',
      'LOCKED.md': 'locked\n',
    },
    patchText: [
      '*** Begin Patch',
      '*** Delete File: src/a.ts',
      '*** Update File: src/b.ts',
      '@@',
      '-b',
      '+bb',
      '*** End Patch',
    ].join('\n'),
  }

  const success = await runRoute03TwoFileCliScenario(successScenario)
  const threeFile = await runRoute03TwoFileCliScenario(threeFileScenario)
  const deleteRequest = await runRoute03TwoFileCliScenario(deleteScenario)
  const postWriteFailure = withRoute02FailureClass({
    status: 'FAIL',
    statusDetail: 'post-write-verification-failed',
    failureCategory: 'post-write verification failed',
    failureReason: 'post-write verification failed: readback did not match planned content',
  })
  const postWriteSurface = buildTerminalResultSurface(postWriteFailure)

  const successChanged = [...success.changedFiles].sort().join(',')
  const expectedSuccessChanged = 'src/a.ts,src/b.ts'
  const successSurfaceOk =
    success.outcome === 'success' &&
    /Changed(?: files)?:\s*src\/a\.ts,\s*src\/b\.ts/i.test(success.output) &&
    /Verified: each written file matched the approved Update File content/i.test(success.output)
  const threeFileChanged = [...threeFile.changedFiles].sort().join(',')
  const deleteChanged = [...deleteRequest.changedFiles].sort().join(',')
  const threeFileSupportedOk =
    threeFile.outcome === 'success' &&
    threeFileChanged === 'src/a.ts,src/b.ts,src/c.ts'
  const deleteSupportedOk =
    deleteRequest.outcome === 'success' &&
    deleteChanged === 'src/a.ts,src/b.ts'
  const failures = [
    ...(success.code === 0 && !success.timedOut ? [] : [`two-file CLI exited code=${success.code} timedOut=${success.timedOut}`]),
    ...(success.selectedWorkspaceIsolated ? [] : ['two-file selected workspace was not isolated']),
    ...(successChanged === expectedSuccessChanged ? [] : [`two-file changedFiles expected ${expectedSuccessChanged}, observed ${successChanged || 'none'}`]),
    ...(successSurfaceOk ? [] : ['two-file user-visible output lacked success, changedFiles, or post-write verification evidence']),
    ...(threeFileSupportedOk ? [] : [`bounded 3-file request did not pass with expected changes: outcome=${threeFile.outcome} changed=${threeFileChanged || 'none'}`]),
    ...(deleteSupportedOk ? [] : [`bounded delete/update request did not pass with expected changes: outcome=${deleteRequest.outcome} changed=${deleteChanged || 'none'}`]),
    ...(postWriteFailure.route02FailureClass === 'post-write' ? [] : [`post-write taxonomy expected post-write, observed ${postWriteFailure.route02FailureClass ?? 'none'}`]),
    ...(postWriteSurface.outcome !== 'success' && postWriteSurface.statusDetail !== 'passed' ? [] : ['post-write verification failure rendered success-like surface']),
  ]

  console.log(`selectedWorkspaceIsolated=${success.selectedWorkspaceIsolated}`)
  console.log(`workspaceWriterInvoked=${successChanged === expectedSuccessChanged && success.outcome === 'success'}`)
  console.log(`terminalOutcome=${success.outcome}`)
  console.log(`changedFiles=${success.changedFiles.join(',')}`)
  console.log(`failedFiles=${success.failedFiles.join(',') || 'none'}`)
  console.log(`postWriteVerification=${successSurfaceOk ? 'passed' : 'missing'}`)
  console.log(`userVisibleOutput=${successSurfaceOk ? 'sufficient' : 'insufficient'}`)
  console.log(`twoFileOutputTail=${success.outputTail}`)
  console.log(`unsupportedThreeFileOutcome=${threeFile.outcome}`)
  console.log(`unsupportedThreeFileChangedFiles=${threeFile.changedFiles.join(',') || 'none'}`)
  console.log(`unsupportedDeleteOutcome=${deleteRequest.outcome}`)
  console.log(`unsupportedDeleteChangedFiles=${deleteRequest.changedFiles.join(',') || 'none'}`)
  console.log(`boundedThreeFileEvidence=${threeFileSupportedOk ? 'passed' : 'failed'}`)
  console.log(`boundedDeleteEvidence=${deleteSupportedOk ? 'passed' : 'failed'}`)
  console.log(`postWriteVerificationFailureOutcome=${postWriteSurface.outcome}`)
  console.log(`postWriteVerificationFailureRoute02Class=${postWriteFailure.route02FailureClass}`)
  console.log('postWriteVerificationFailureEvidence=Route02 taxonomy surface; deterministic CLI mismatch injection is not used by this route')

  if (failures.length > 0) {
    for (const failure of failures) {
      console.log(`[fail] route03-two-file-cli-path-evidence - ${failure}`)
    }
    process.exit(1)
  }
  console.log('[pass] route03-two-file-cli-path-evidence')
}

function route08ClassForScenario(scenario) {
  if (scenario.expectedClass) return scenario.expectedClass
  if (scenario.id.includes('malformed')) return 'model-output'
  return 'unsupported'
}

function route08PatchScenarios() {
  return [
    {
      id: 'real-model-like-unsupported-four-file-update',
      expectedClass: 'supported-route73',
      expectedChangedFiles: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'],
      files: {
        'src/a.ts': 'a\n',
        'src/b.ts': 'b\n',
        'src/c.ts': 'c\n',
        'src/d.ts': 'd\n',
        'LOCKED.md': 'locked\n',
      },
      patchText: [
        '*** Begin Patch',
        '*** Update File: src/a.ts',
        '@@',
        '-a',
        '+aa',
        '*** Update File: src/b.ts',
        '@@',
        '-b',
        '+bb',
        '*** Update File: src/c.ts',
        '@@',
        '-c',
        '+cc',
        '*** Update File: src/d.ts',
        '@@',
        '-d',
        '+dd',
        '*** End Patch',
      ].join('\n'),
    },
    {
      id: 'real-model-like-unsupported-delete-outside-workspace',
      expectedClass: 'unsupported',
      files: {
        'src/a.ts': 'a\n',
        'LOCKED.md': 'locked\n',
      },
      patchText: [
        '*** Begin Patch',
        '*** Delete File: ../outside.ts',
        '*** End Patch',
      ].join('\n'),
    },
    {
      id: 'real-model-like-unsupported-delete-missing-target',
      expectedClass: 'unsupported',
      files: {
        'src/a.ts': 'a\n',
        'LOCKED.md': 'locked\n',
      },
      patchText: [
        '*** Begin Patch',
        '*** Delete File: src/missing.ts',
        '*** End Patch',
      ].join('\n'),
    },
    {
      id: 'real-model-like-unsupported-delete-directory-target',
      expectedClass: 'unsupported',
      directories: ['src/dir'],
      files: {
        'LOCKED.md': 'locked\n',
      },
      patchText: [
        '*** Begin Patch',
        '*** Delete File: src/dir',
        '*** End Patch',
      ].join('\n'),
    },
    {
      id: 'real-model-like-route48-mixed-update-delete',
      expectedClass: 'supported-route48',
      expectedChangedFiles: ['src/a.ts', 'src/b.ts'],
      files: {
        'src/a.ts': 'a\n',
        'src/b.ts': 'b\n',
        'LOCKED.md': 'locked\n',
      },
      patchText: [
        '*** Begin Patch',
        '*** Update File: src/a.ts',
        '@@',
        '-a',
        '+aa',
        '*** Delete File: src/b.ts',
        '*** End Patch',
      ].join('\n'),
    },
    {
      id: 'real-model-like-unsupported-broad-delete-diff',
      expectedClass: 'supported-route73',
      expectedChangedFiles: ['src/a.ts'],
      files: {
        'src/a.ts': 'a\n',
        'LOCKED.md': 'locked\n',
      },
      patchText: [
        'diff --git a/src/a.ts b/src/a.ts',
        'deleted file mode 100644',
        '--- a/src/a.ts',
        '+++ /dev/null',
        '@@ -1 +0,0 @@',
        '-a',
      ].join('\n'),
    },
    {
      id: 'real-model-like-unsupported-duplicate-delete-target',
      expectedClass: 'unsupported',
      files: {
        'src/a.ts': 'a\n',
        'LOCKED.md': 'locked\n',
      },
      patchText: [
        '*** Begin Patch',
        '*** Delete File: src/a.ts',
        '*** Delete File: src/a.ts',
        '*** End Patch',
      ].join('\n'),
    },
    {
      id: 'real-model-like-unsupported-move-with-content-edit',
      expectedClass: 'unsupported',
      files: {
        'src/a.ts': 'a\n',
        'src/b.ts': 'b\n',
        'LOCKED.md': 'locked\n',
      },
      patchText: [
        '*** Begin Patch',
        '*** Update File: src/a.ts',
        '*** Move to: src/renamed.ts',
        '@@',
        '-a',
        '+aa',
        '*** End Patch',
      ].join('\n'),
    },
    {
      id: 'real-model-like-unsupported-move-outside-source',
      expectedClass: 'unsupported',
      files: {
        'src/a.ts': 'a\n',
        'LOCKED.md': 'locked\n',
      },
      patchText: [
        '*** Begin Patch',
        '*** Update File: ../outside.ts',
        '*** Move to: src/renamed.ts',
        '@@',
        ' outside',
        '*** End Patch',
      ].join('\n'),
    },
    {
      id: 'real-model-like-unsupported-move-outside-target',
      expectedClass: 'unsupported',
      files: {
        'src/a.ts': 'a\n',
        'LOCKED.md': 'locked\n',
      },
      patchText: [
        '*** Begin Patch',
        '*** Update File: src/a.ts',
        '*** Move to: ../renamed.ts',
        '@@',
        ' a',
        '*** End Patch',
      ].join('\n'),
    },
    {
      id: 'real-model-like-unsupported-move-missing-source',
      expectedClass: 'unsupported',
      files: {
        'src/a.ts': 'a\n',
        'LOCKED.md': 'locked\n',
      },
      patchText: [
        '*** Begin Patch',
        '*** Update File: src/missing.ts',
        '*** Move to: src/renamed.ts',
        '@@',
        ' missing',
        '*** End Patch',
      ].join('\n'),
    },
    {
      id: 'real-model-like-unsupported-move-target-exists',
      expectedClass: 'unsupported',
      files: {
        'src/a.ts': 'a\n',
        'src/renamed.ts': 'existing\n',
        'LOCKED.md': 'locked\n',
      },
      patchText: [
        '*** Begin Patch',
        '*** Update File: src/a.ts',
        '*** Move to: src/renamed.ts',
        '@@',
        ' a',
        '*** End Patch',
      ].join('\n'),
    },
    {
      id: 'real-model-like-unsupported-move-same-source-target',
      expectedClass: 'unsupported',
      files: {
        'src/a.ts': 'a\n',
        'LOCKED.md': 'locked\n',
      },
      patchText: [
        '*** Begin Patch',
        '*** Update File: src/a.ts',
        '*** Move to: src/a.ts',
        '@@',
        ' a',
        '*** End Patch',
      ].join('\n'),
    },
    {
      id: 'real-model-like-unsupported-move-directory-source',
      expectedClass: 'unsupported',
      directories: ['src/dir'],
      files: {
        'LOCKED.md': 'locked\n',
      },
      patchText: [
        '*** Begin Patch',
        '*** Update File: src/dir',
        '*** Move to: src/renamed.ts',
        '@@',
        ' directory',
        '*** End Patch',
      ].join('\n'),
    },
    {
      id: 'real-model-like-route48-mixed-update-move',
      expectedClass: 'supported-route48',
      expectedChangedFiles: ['src/a.ts', 'src/b.ts', 'src/renamed.ts'],
      files: {
        'src/a.ts': 'a\n',
        'src/b.ts': 'b\n',
        'LOCKED.md': 'locked\n',
      },
      patchText: [
        '*** Begin Patch',
        '*** Update File: src/a.ts',
        '*** Move to: src/renamed.ts',
        '@@',
        ' a',
        '*** Update File: src/b.ts',
        '@@',
        '-b',
        '+bb',
        '*** End Patch',
      ].join('\n'),
    },
    {
      id: 'real-model-like-unsupported-broad-move-diff',
      expectedClass: 'supported-route73',
      expectedChangedFiles: ['src/a.ts', 'src/renamed.ts'],
      files: {
        'src/a.ts': 'a\n',
        'LOCKED.md': 'locked\n',
      },
      patchText: [
        'diff --git a/src/a.ts b/src/renamed.ts',
        'similarity index 100%',
        'rename from src/a.ts',
        'rename to src/renamed.ts',
      ].join('\n'),
    },
    {
      id: 'real-model-like-unsupported-duplicate-target-update',
      expectedClass: 'unsupported',
      files: {
        'src/a.ts': 'a\n',
        'src/b.ts': 'b\n',
        'LOCKED.md': 'locked\n',
      },
      patchText: [
        '*** Begin Patch',
        '*** Update File: src/a.ts',
        '@@',
        '-a',
        '+aa',
        '*** Update File: src/a.ts',
        '@@',
        '-aa',
        '+aaa',
        '*** End Patch',
      ].join('\n'),
    },
    {
      id: 'real-model-like-unsupported-outside-workspace-update',
      expectedClass: 'unsupported',
      files: {
        'src/a.ts': 'a\n',
        'LOCKED.md': 'locked\n',
      },
      patchText: [
        '*** Begin Patch',
        '*** Update File: ../outside.ts',
        '@@',
        '-outside',
        '+changed',
        '*** End Patch',
      ].join('\n'),
    },
    {
      id: 'real-model-like-unsupported-broad-apply-patch',
      expectedClass: 'supported-route73',
      expectedChangedFiles: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/new.ts'],
      files: {
        'src/a.ts': 'a\n',
        'src/b.ts': 'b\n',
        'src/c.ts': 'c\n',
        'LOCKED.md': 'locked\n',
      },
      patchText: [
        '*** Begin Patch',
        '*** Update File: src/a.ts',
        '@@',
        '-a',
        '+aa',
        '*** Update File: src/b.ts',
        '@@',
        '-b',
        '+bb',
        '*** Add File: src/new.ts',
        '+new',
        '*** Delete File: src/c.ts',
        '*** End Patch',
      ].join('\n'),
    },
    {
      id: 'real-model-like-unsupported-unified-diff-output',
      expectedClass: 'supported-route73',
      expectedChangedFiles: ['src/a.ts'],
      files: {
        'src/a.ts': 'a\n',
        'LOCKED.md': 'locked\n',
      },
      patchText: [
        'diff --git a/src/a.ts b/src/a.ts',
        '--- a/src/a.ts',
        '+++ b/src/a.ts',
        '@@ -1 +1 @@',
        '-a',
        '+aa',
      ].join('\n'),
    },
    {
      id: 'real-model-like-malformed-patch-output',
      expectedClass: 'model-output',
      files: {
        'src/a.ts': 'a\n',
        'src/b.ts': 'b\n',
        'LOCKED.md': 'locked\n',
      },
      patchText: [
        '*** Begin Patch',
        '*** Update File: src/a.ts',
        '@@',
        '-a',
        '+aa',
      ].join('\n'),
    },
    {
      id: 'real-model-like-malformed-empty-output',
      expectedClass: 'model-output',
      files: {
        'src/a.ts': 'a\n',
        'LOCKED.md': 'locked\n',
      },
      patchText: ' \n\t\n ',
    },
    {
      id: 'real-model-like-malformed-success-like-no-patch',
      expectedClass: 'model-output',
      files: {
        'src/a.ts': 'a\n',
        'LOCKED.md': 'locked\n',
      },
      patchText: 'Done. I changed src/a.ts successfully.',
    },
    {
      id: 'real-model-like-malformed-unknown-operation',
      expectedClass: 'model-output',
      files: {
        'src/a.ts': 'a\n',
        'LOCKED.md': 'locked\n',
      },
      patchText: [
        '*** Begin Patch',
        '*** Rename File: src/a.ts -> src/b.ts',
        '*** End Patch',
      ].join('\n'),
    },
    {
      id: 'real-model-like-malformed-missing-target-header',
      expectedClass: 'model-output',
      files: {
        'src/a.ts': 'a\n',
        'LOCKED.md': 'locked\n',
      },
      patchText: [
        '*** Begin Patch',
        '*** Update File:',
        '@@',
        '-a',
        '+aa',
        '*** End Patch',
      ].join('\n'),
    },
    {
      id: 'real-model-like-unsupported-missing-target-update',
      expectedClass: 'unsupported',
      files: {
        'src/a.ts': 'a\n',
        'LOCKED.md': 'locked\n',
      },
      patchText: [
        '*** Begin Patch',
        '*** Update File: src/missing.ts',
        '@@',
        '-missing',
        '+changed',
        '*** End Patch',
      ].join('\n'),
    },
    {
      id: 'real-model-like-route48-mixed-update-delete-compat',
      expectedClass: 'supported-route48',
      expectedChangedFiles: ['src/a.ts', 'src/b.ts'],
      files: {
        'src/a.ts': 'a\n',
        'src/b.ts': 'b\n',
        'LOCKED.md': 'locked\n',
      },
      patchText: [
        '*** Begin Patch',
        '*** Update File: src/a.ts',
        '@@',
        '-a',
        '+aa',
        '*** Delete File: src/b.ts',
        '*** End Patch',
      ].join('\n'),
    },
  ]
}

async function runRoute08UnsupportedPatchScenario(scenario) {
  const projectDir = path.join(testRoot, `route08-${scenario.id}-${runId}`)
  const runtimeHome = path.join(testRoot, 'route08-unsupported-runtime-home', `${scenario.id}-${runId}`)
  const auditLogPath = path.join(testRoot, 'route08-unsupported-audit', `${scenario.id}-${runId}`, 'permissions.jsonl')
  const prepared = {
    ...scenario,
    projectDir,
  }
  prepareProject(prepared)
  fs.rmSync(runtimeHome, { recursive: true, force: true })
  fs.mkdirSync(runtimeHome, { recursive: true })
  fs.rmSync(path.dirname(auditLogPath), { recursive: true, force: true })
  fs.mkdirSync(path.dirname(auditLogPath), { recursive: true })

  try {
    const before = snapshot(projectDir)
    const result = await runApplyPatchWorkspaceWriteCli({
      fixtureDir: projectDir,
      patchText: scenario.patchText,
      runtimeHome,
      auditLogPath,
    })
    const after = snapshot(projectDir)
    const observedChanged = changedFiles(before, after)
    const outcome = route03CliOutcome(result.output, result.code)
    const output = result.output
    const successLike =
      outcome === 'success' ||
      /apply_patch .*workspace write succeeded/i.test(output) ||
      /Outcome:\s*success/i.test(output)
    const failureVisible =
      /Outcome:\s*(stopped|error)/i.test(output) ||
      /stopped|blocked|unsupported|failed|error/i.test(output) ||
      result.code !== 0
    const scenarioClass = route08ClassForScenario(scenario)
    const supportedScenario = scenarioClass.startsWith('supported-')
    const expectedChangedFiles = scenario.expectedChangedFiles ?? []
    const supportedRoute48ChangedFilesMatch =
      observedChanged.join(',') === expectedChangedFiles.join(',')
    const unsupportedWriteLeak = !supportedScenario && observedChanged.length > 0
    const rollbackClaimed = /rollback (?:succeeded|completed)|atomic/i.test(output)
    const safelyStoppedUnsupported =
      !successLike && !unsupportedWriteLeak && failureVisible && !rollbackClaimed
    const safelyCompletedRoute48 =
      successLike && supportedRoute48ChangedFilesMatch && !rollbackClaimed
    return {
      id: scenario.id,
      outcome,
      route08Class: route08ClassForScenario(scenario),
      status: (supportedScenario
        ? safelyCompletedRoute48
        : safelyStoppedUnsupported)
        ? 'PASS'
        : 'FAIL',
      code: result.code,
      timedOut: result.timedOut,
      changedFiles: observedChanged,
      failedFiles: [],
      failureReason: failureVisible
        ? 'unsupported real-model-like mutation output stopped before success'
        : 'failure reason was not visible in terminal output',
      terminalEvidence: failureVisible ? 'visible' : 'missing',
      noUnsupportedWrites: !unsupportedWriteLeak,
      supportedRoute48ChangedFilesMatch,
      successLike,
      rollbackClaimed,
      outputTail: summarizeOutput(output),
    }
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true })
    fs.rmSync(runtimeHome, { recursive: true, force: true })
    fs.rmSync(path.dirname(auditLogPath), { recursive: true, force: true })
  }
}

async function runRoute08UnsupportedPatchE2e() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=route08-unsupported-patch-e2e')
  console.log('realProviderTouched=false')
  console.log('realProviderExecution=false')
  console.log('providerMode=synthetic-real-model-output-equivalent')
  console.log('defaultMvpAffected=false')
  console.log('unsupportedMutationCapabilityAdded=false')
  console.log('guardedSingleFileMoveCapabilityAddedElsewhere=true')
  console.log('guardedSingleFileDeleteCapabilityAddedElsewhere=true')
  console.log('unsupportedMutationSupport=false')
  console.log(`cliCommand=${route03CommandDisplay()}`)

  const repoBefore = await readRepoStatusShort()
  if (!repoBefore.ok) {
    console.log('[CONFIG] route08-unsupported-patch-e2e - repository status could not be checked before verifier')
    console.log('failureReason=repository status could not be checked')
    process.exit(3)
  }

  const results = []
  for (const scenario of route08PatchScenarios()) {
    const result = await runRoute08UnsupportedPatchScenario(scenario)
    results.push(result)
    console.log(`scenario=${result.id}`)
    console.log(`outcome=${result.outcome}`)
    console.log(`Route08Class=${result.route08Class}`)
    console.log(`changedFiles=${result.changedFiles.join(',') || 'none'}`)
    console.log(`failedFiles=${result.failedFiles.join(',') || 'none'}`)
    console.log(`failureReason=${result.failureReason}`)
    console.log(`terminalEvidence=${result.terminalEvidence}`)
    console.log(`noUnsupportedWrites=${result.noUnsupportedWrites}`)
    console.log(`successLike=${result.successLike}`)
    console.log(`rollbackClaimed=${result.rollbackClaimed}`)
    console.log(`[${result.status}] ${result.id} - outcome=${result.outcome} Route08Class=${result.route08Class} changedFiles=${result.changedFiles.join(',') || 'none'}`)
  }

  const repoAfter = await readRepoStatusShort()
  const failures = [
    ...results
      .filter((result) => result.status !== 'PASS')
      .map((result) =>
        result.route08Class.startsWith('supported-')
          ? `${result.id}: supported output was not safely completed`
          : `${result.id}: unsupported output was not safely stopped`
      ),
    ...(repoAfter.ok && repoAfter.status === repoBefore.status ? [] : ['repository status changed or was unavailable after verifier']),
  ]
  const covered = results.map((result) => result.id)
  writeReport({
    generatedAt: new Date().toISOString(),
    capability: 'route08-unsupported-patch-e2e',
    provider: 'synthetic',
    mode: 'route08-unsupported-patch-e2e',
    reportPath,
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    statusDetail: failures.length === 0 ? 'passed' : 'unsupported-patch-e2e-failed',
    realProviderTouched: false,
    realProviderExecution: false,
    defaultMvpAffected: false,
    unsupportedMutationCapabilityAdded: false,
    guardedSingleFileMoveCapabilityAddedElsewhere: true,
    guardedSingleFileDeleteCapabilityAddedElsewhere: true,
    unsupportedMutationSupport: false,
    coveredCases: covered,
    results,
    repositoryStatusBefore: repoBefore.status,
    repositoryStatusAfter: repoAfter.status,
    repositoryStatusUnchanged: repoAfter.ok && repoAfter.status === repoBefore.status,
  })
  console.log(`coveredCases=${covered.join(',')}`)
  console.log(`report=${reportPath}`)
  if (failures.length > 0) {
    for (const failure of failures) {
      console.log(`[fail] route08-unsupported-patch-e2e - ${failure}`)
    }
    process.exit(1)
  }
  console.log('[pass] route08-unsupported-patch-e2e')
}

function buildRealSingleFileUpdateFailure({ category, reason, status = 'FAIL', statusDetail, exitCode = 1 }) {
  return withRoute01FailureClass({
    status,
    statusDetail: statusDetail ?? statusDetailForRealSingleFileUpdateFailureCategory(category),
    exitCode,
    failureCategory: category,
    failureReason: reason,
  })
}

function buildRealSingleFileCreateFailure({ category, reason, status = 'FAIL', statusDetail, exitCode = 1 }) {
  return withRoute01FailureClass({
    status,
    statusDetail: statusDetail ?? statusDetailForRealSingleFileCreateFailureCategory(category),
    exitCode,
    failureCategory: category,
    failureReason: reason,
  })
}

function buildRealTwoFileUpdateFailure({ category, reason, status = 'FAIL', statusDetail, exitCode = 1 }) {
  return withRoute01FailureClass({
    status,
    statusDetail: statusDetail ?? statusDetailForRealTwoFileUpdateFailureCategory(category),
    exitCode,
    failureCategory: category,
    failureReason: reason,
  })
}

function writeRealSingleFileUpdateReport(fields) {
  const providerDiagnostics = fields.providerDiagnostics ??
    lastApplyPatchProviderDiagnostics ??
    realMutationEnvContract.providerDiagnostics
  writeReport({
    generatedAt: new Date().toISOString(),
    capability: realSingleFileUpdateCaseId,
    provider: 'real',
    mode: 'opt-in-case',
    tier: 'candidate',
    reportPath,
    expectedCapability: 'real provider selected-workspace existing-file single-file update',
    currentSupportedCapability: 'selected-workspace existing-file single-file update only',
    drivesApplyPatchExpansion: false,
    expectedToPassCurrentMvp: false,
    expectedToPassInCurrentMVP: false,
    ...(providerDiagnostics ? { providerDiagnostics } : {}),
    ...fields,
  })
}

function writeRealSingleFileCreateReport(fields) {
  const providerDiagnostics = fields.providerDiagnostics ??
    lastApplyPatchProviderDiagnostics ??
    realMutationEnvContract.providerDiagnostics
  writeReport({
    generatedAt: new Date().toISOString(),
    capability: realSingleFileCreateCaseId,
    provider: 'real',
    mode: 'opt-in-case',
    tier: 'candidate',
    reportPath,
    expectedCapability: 'real provider selected-workspace single-file Add File create',
    currentSupportedCapability: 'selected-workspace single-file Add File create only',
    drivesApplyPatchExpansion: false,
    expectedToPassCurrentMvp: false,
    expectedToPassInCurrentMVP: false,
    ...(providerDiagnostics ? { providerDiagnostics } : {}),
    ...fields,
  })
}

function writeRealTwoFileUpdateReport(fields) {
  const providerDiagnostics = fields.providerDiagnostics ??
    lastApplyPatchProviderDiagnostics ??
    realMutationEnvContract.providerDiagnostics
  writeReport({
    generatedAt: new Date().toISOString(),
    capability: realTwoFileUpdateCaseId,
    provider: 'real',
    mode: 'opt-in-case',
    tier: 'candidate',
    reportPath,
    expectedCapability: 'real provider selected-workspace exactly-2 Update File write',
    currentSupportedCapability: 'selected-workspace exactly-2 existing-file Update File only',
    drivesApplyPatchExpansion: false,
    expectedToPassCurrentMvp: false,
    expectedToPassInCurrentMVP: false,
    ...(providerDiagnostics ? { providerDiagnostics } : {}),
    ...fields,
  })
}

async function runRealSelectedWorkspaceTwoFileUpdate() {
  console.log(`mode=${realTwoFileUpdateCaseId}`)
  console.log('status taxonomy: pass=0 product-regression=1 provider-network-inconclusive=2 config-failure=3')
  console.log('real-provider=explicit-opt-in')
  console.log('homeRead=false')
  console.log('defaultSmoke=skipped')
  console.log('realProviderHome=config-only')
  console.log('writeScope=isolated-selected-workspace-exactly-two-existing-files')
  console.log('mutationBoundary=update-only exactly-two-files no-create no-delete no-move no-3plus no-rollback')
  printProviderDiagnostics(realMutationEnvContract.providerDiagnostics)

  if (!realHome) {
    const failure = buildRealTwoFileUpdateFailure({
      category: 'provider/preflight',
      reason: 'provider/preflight: set PRIVATE_AGENTS_REAL_HOME before running real selected-workspace two-file update smoke',
      status: 'CONFIG',
      exitCode: 3,
    })
    writeRealTwoFileUpdateReport({
      ...failure,
      realProviderExecution: false,
      modelTurn: false,
      changedFiles: [],
      failedFiles: [],
      writeIntents: [],
      workspaceWriterInvoked: false,
    })
    console.log(`[CONFIG] ${realTwoFileUpdateCaseId} status=${failure.statusDetail}`)
    process.exitCode = failure.exitCode
    return
  }

  const repoBefore = await readRepoStatusShort()
  if (!repoBefore.ok || repoBefore.status) {
    const failure = buildRealTwoFileUpdateFailure({
      category: 'verification-blocked',
      reason: repoBefore.ok
        ? 'verification-blocked: repository was not clean before opt-in real two-file update smoke'
        : 'verification-blocked: repository status could not be checked before opt-in real two-file update smoke',
    })
    writeRealTwoFileUpdateReport({
      ...failure,
      realProviderExecution: false,
      modelTurn: false,
      changedFiles: [],
      failedFiles: [],
      writeIntents: [],
      workspaceWriterInvoked: false,
      outputTail: repoBefore.outputTail,
    })
    console.log(`[FAIL] ${realTwoFileUpdateCaseId} status=${failure.statusDetail}`)
    console.log(`failureReason=${failure.failureReason}`)
    process.exitCode = failure.exitCode
    return
  }

  const preflight = await runProviderReadinessPreflight()
  const preflightStatus = buildCodingFlowPreflightStatus(preflight)
  console.log(`[${preflightStatus.status}] real-two-file-update-preflight status=${preflightStatus.statusDetail}`)
  if (!preflight.ok) {
    const failure = buildRealTwoFileUpdateFailure({
      category: 'provider/preflight',
      reason: preflightStatus.failureReason,
      status: preflightStatus.status,
      statusDetail: preflightStatus.statusDetail,
      exitCode: preflightStatus.exitCode,
    })
    writeRealTwoFileUpdateReport({
      ...failure,
      realProviderExecution: true,
      modelTurn: false,
      providerReadiness: preflight,
      changedFiles: [],
      failedFiles: [],
      writeIntents: [],
      workspaceWriterInvoked: false,
      outputTail: preflight.outputTail,
    })
    process.exitCode = failure.exitCode
    return
  }

  const smokeRunId = `${realTwoFileUpdateCaseId}-${Date.now()}`
  const runtimeHome = getRealCodingFlowRuntimeHome(`${smokeRunId}-runtime`)
  const auditLogPath = getRealCodingFlowAuditLogPath(`${smokeRunId}-audit`)
  assertSafeCodingFlowRuntimeHome(runtimeHome)
  assertSafeCodingFlowRuntimeHome(path.dirname(auditLogPath))
  fs.rmSync(runtimeHome, { recursive: true, force: true })
  fs.mkdirSync(runtimeHome, { recursive: true })
  fs.rmSync(path.dirname(auditLogPath), { recursive: true, force: true })
  fs.mkdirSync(path.dirname(auditLogPath), { recursive: true })

  const fixture = createTwoFileUpdateFixture()
  try {
    const before = snapshotTwoFileUpdateFixture(fixture.fixtureDir)
    const beforeTargets = readTwoFileUpdateTargets(fixture.fixtureDir)
    const providerResult = await runApplyPatchDryRunProviderTurn({
      prompt: fixture.prompt,
      runtimeHome,
      realHome,
      fixtureDir: fixture.fixtureDir,
      auditLogPath,
    })
    printProviderDiagnostics(providerResult.providerDiagnostics ?? realMutationEnvContract.providerDiagnostics)
    const redaction = redactAndAssertCodingProviderOutput(providerResult.rawOutput || providerResult.output)
    const redactedProviderOutput = redactAndAssertCodingProviderOutput(providerResult.output).redacted
    const providerFailure = classifyProviderReadinessFailure(
      `real two-file update model turn exited ${providerResult.code}`,
      redaction.redacted,
      'real',
    )

    let cliResult = undefined
    const extracted = extractSingleApplyPatchBlock(redactedProviderOutput)
    const patchShape = extracted.status === 'ok'
      ? classifyTwoFileUpdatePatchShape(extracted.patchText, fixture)
      : { ok: false, reason: '' }

    if (providerResult.code === 0 && !providerResult.timedOut && !providerFailure && extracted.status === 'ok' && patchShape.ok) {
      cliResult = await runApplyPatchWorkspaceWriteCli({
        fixtureDir: fixture.fixtureDir,
        patchText: extracted.patchText,
        runtimeHome,
        auditLogPath,
      })
    }

    const after = snapshotTwoFileUpdateFixture(fixture.fixtureDir)
    const afterTargets = readTwoFileUpdateTargets(fixture.fixtureDir)
    const comparison = compareTwoFileUpdateSnapshots(before, after)
    const repoAfter = await readRepoStatusShort()
    const cliRedaction = redactAndAssertCodingProviderOutput(cliResult?.output ?? '')
    const redactionOk = redaction.ok && cliRedaction.ok
    const repositoryClean = repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status

    if (providerFailure || providerResult.code !== 0 || providerResult.timedOut) {
      const providerStatus = buildCodingFlowSmokeFailureStatus(providerResult, redaction.redacted, redaction)
      const failure = buildRealTwoFileUpdateFailure({
        category: 'provider/preflight',
        reason: providerStatus.failureReason,
        status: providerStatus.status,
        statusDetail: providerStatus.statusDetail,
        exitCode: providerStatus.exitCode,
      })
      writeRealTwoFileUpdateReport({
        ...failure,
        realProviderExecution: true,
        modelTurn: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean,
        changedFiles: [],
        failedFiles: [],
        writeIntents: [],
        workspaceWriterInvoked: false,
        redaction: { ok: redaction.ok, leaks: redaction.leaks },
        outputTail: summarizeOutput(redaction.redacted),
      })
      console.log(`[${failure.status}] ${realTwoFileUpdateCaseId} status=${failure.statusDetail}`)
      if (redaction.redacted) console.log(summarizeOutput(redaction.redacted))
      process.exitCode = failure.exitCode
      return
    }

    if (!redactionOk) {
      const failure = buildRealTwoFileUpdateFailure({
        category: 'redaction failure',
        reason: `redaction failure: ${[...redaction.leaks, ...cliRedaction.leaks].join(',') || 'unknown'}`,
      })
      writeRealTwoFileUpdateReport({
        ...failure,
        realProviderExecution: true,
        modelTurn: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean,
        changedFiles: [],
        failedFiles: [],
        writeIntents: [],
        workspaceWriterInvoked: false,
        redaction: { ok: false, leaks: [...redaction.leaks, ...cliRedaction.leaks] },
      })
      console.log(`[FAIL] ${realTwoFileUpdateCaseId} status=${failure.statusDetail}`)
      process.exitCode = failure.exitCode
      return
    }

    if (extracted.status !== 'ok') {
      const failure = buildRealTwoFileUpdateFailure({
        category: 'model output',
        reason: `model output: provider output did not contain exactly one apply_patch block (${extracted.status})`,
        statusDetail: extracted.status,
      })
      writeRealTwoFileUpdateReport({
        ...failure,
        realProviderExecution: true,
        modelTurn: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean,
        applyPatchBlocks: extracted.count,
        changedFiles: [],
        failedFiles: [],
        writeIntents: [],
        workspaceWriterInvoked: false,
        outputTail: summarizeOutput(redactedProviderOutput),
      })
      console.log(`[FAIL] ${realTwoFileUpdateCaseId} status=${failure.statusDetail}`)
      process.exitCode = failure.exitCode
      return
    }

    if (!patchShape.ok) {
      const failure = buildRealTwoFileUpdateFailure({
        category: 'unsupported patch',
        reason: patchShape.reason,
      })
      writeRealTwoFileUpdateReport({
        ...failure,
        realProviderExecution: true,
        modelTurn: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean,
        applyPatchBlocks: extracted.count,
        changedFiles: [],
        failedFiles: [],
        writeIntents: [],
        workspaceWriterInvoked: false,
        outputTail: summarizeOutput(redactedProviderOutput),
      })
      console.log(`[FAIL] ${realTwoFileUpdateCaseId} status=${failure.statusDetail}`)
      console.log(`failureReason=${failure.failureReason}`)
      process.exitCode = failure.exitCode
      return
    }

    const cliOutput = cliResult?.output ?? ''
    const cliPassed = cliResult?.code === 0 &&
      !cliResult.timedOut &&
      /apply_patch multi-file workspace write succeeded/i.test(cliOutput) &&
      /Changed: src\/a\.ts, src\/b\.ts/i.test(cliOutput) &&
      /Verified: each written file matched the approved Update File content/i.test(cliOutput) &&
      /success/i.test(cliOutput) &&
      !/atomic rollback|rollback succeeded/i.test(cliOutput)
    if (!cliPassed) {
      const partial = /multi-file workspace write stopped|partial|Failed:\s*src\//i.test(cliOutput)
      const unsupported = /unsupported|not supported|only supports|failed to parse|cannot apply|rejected/i.test(cliOutput)
      const failure = buildRealTwoFileUpdateFailure({
        category: partial ? 'partial mutation failed' : unsupported ? 'route rejected' : 'verification-blocked',
        reason: partial
          ? `partial mutation failed: workspace route stopped without verified success (${summarizeOutput(cliOutput)})`
          : unsupported
            ? `route rejected: workspace two-file update route rejected the provider patch (${summarizeOutput(cliOutput)})`
            : `verification-blocked: workspace two-file update CLI did not complete successfully code=${cliResult?.code ?? 'missing'} timedOut=${cliResult?.timedOut ?? 'missing'}`,
      })
      writeRealTwoFileUpdateReport({
        ...failure,
        realProviderExecution: true,
        modelTurn: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean,
        applyPatchBlocks: extracted.count,
        changedFiles: comparison.changed,
        failedFiles: partial ? fixture.targetPaths.filter((targetPath) => !comparison.changed.includes(targetPath)) : [],
        writeIntents: fixture.targetPaths,
        workspaceWriterInvoked: Boolean(cliResult),
        outputTail: summarizeOutput(cliRedaction.redacted || redactedProviderOutput),
      })
      console.log(`[FAIL] ${realTwoFileUpdateCaseId} status=${failure.statusDetail}`)
      console.log(`failureReason=${failure.failureReason}`)
      process.exitCode = failure.exitCode
      return
    }

    const targetChanged = fixture.targetPaths.every(
      (targetPath) => beforeTargets[targetPath] !== afterTargets[targetPath],
    )
    const onlyTargetsChanged = comparison.added.length === 0 &&
      comparison.removed.length === 0 &&
      comparison.changed.join(',') === fixture.targetPaths.join(',')
    const targetContentOk = fixture.targetPaths.every(
      (targetPath) => afterTargets[targetPath] === fixture.plannedContent[targetPath],
    )
    const outputNoRollbackClaim = !/atomic rollback|rollback succeeded/i.test(cliOutput)
    const success = targetChanged && onlyTargetsChanged && targetContentOk && repositoryClean && outputNoRollbackClaim
    const failureCategory = !targetChanged
      ? 'no mutation'
      : !onlyTargetsChanged
        ? 'partial mutation failed'
        : success
          ? 'none'
          : 'post-write verification failed'
    const failures = [
      ...(targetChanged ? [] : ['no mutation: src/a.ts and src/b.ts did not both change after workspace write route completed']),
      ...(onlyTargetsChanged ? [] : [`partial mutation failed: expected only src/a.ts and src/b.ts changed; changed=${comparison.changed.join(',') || 'none'} added=${comparison.added.join(',') || 'none'} removed=${comparison.removed.join(',') || 'none'}`]),
      ...(targetContentOk ? [] : ['post-write verification failed: src/a.ts and src/b.ts content did not match planned ready content']),
      ...(outputNoRollbackClaim ? [] : ['post-write verification failed: output claimed rollback/atomicity']),
      ...(repositoryClean ? [] : ['post-write verification failed: repository mutated or status unavailable']),
    ]

    writeRealTwoFileUpdateReport({
      status: success ? 'PASS' : 'FAIL',
      statusDetail: success ? 'passed' : statusDetailForRealTwoFileUpdateFailureCategory(failureCategory),
      realProviderExecution: true,
      modelTurn: true,
      runtimeHome: 'isolated-test-root',
      fixture: {
        files: fixture.files,
        added: comparison.added,
        removed: comparison.removed,
        changed: comparison.changed,
      },
      repositoryClean,
      applyPatchBlocks: extracted.count,
      changedFiles: success ? fixture.targetPaths : comparison.changed,
      failedFiles: success ? [] : fixture.targetPaths.filter((targetPath) => !comparison.changed.includes(targetPath)),
      writeIntents: fixture.targetPaths,
      workspaceWriterInvoked: true,
      writerTarget: 'isolated-selected-workspace',
      terminalSuccessAllowed: success,
      redaction: { ok: true, leaks: [] },
      failureCategory,
      failureReason: failures.join('; '),
      outputTail: summarizeOutput(cliRedaction.redacted || redactedProviderOutput),
    })
    console.log(`fixtureFiles=${fixture.files.join(',')}`)
    console.log(`applyPatchBlocks=${extracted.count}`)
    console.log(`fixtureChanged=${comparison.changed.join(',') || 'none'}`)
    console.log(`fixtureAdded=${comparison.added.join(',') || 'none'}`)
    console.log(`fixtureRemoved=${comparison.removed.join(',') || 'none'}`)
    console.log(`targetsChanged=${targetChanged}`)
    console.log(`postWriteVerification=${success ? 'pass' : 'fail'}`)
    console.log(`repositoryClean=${repositoryClean}`)
    console.log('workspaceWriterInvoked=true')
    console.log('writerTarget=isolated-selected-workspace')
    console.log(`changedFiles=${success ? fixture.targetPaths.join(',') : comparison.changed.join(',')}`)
    console.log(`failedFiles=${success ? '' : fixture.targetPaths.filter((targetPath) => !comparison.changed.includes(targetPath)).join(',')}`)
    console.log(`writeIntents=${fixture.targetPaths.join(',')}`)
    console.log(`rollbackClaim=${outputNoRollbackClaim ? 'none' : 'unexpected'}`)
    console.log(`redaction=${redactionOk ? 'pass' : 'fail'}`)
    if (!success) console.log(`failureReason=${failures.join('; ')}`)
    console.log(`[${success ? 'PASS' : 'FAIL'}] ${realTwoFileUpdateCaseId}`)
    process.exitCode = success ? 0 : 1
    return
  } finally {
    cleanupTwoFileUpdateFixture(fixture.fixtureDir)
    cleanupIsolatedCodingFlowRuntimeHome(runtimeHome)
    cleanupIsolatedCodingFlowAuditLog(auditLogPath)
  }
}

async function runRealSelectedWorkspaceSingleFileCreate() {
  console.log(`mode=${realSingleFileCreateCaseId}`)
  console.log('status taxonomy: pass=0 product-regression=1 provider-network-inconclusive=2 config-failure=3')
  console.log('real-provider=explicit-opt-in')
  console.log('homeRead=false')
  console.log('defaultSmoke=skipped')
  console.log('realProviderHome=config-only')
  console.log('writeScope=isolated-selected-workspace-single-file-add-only')
  console.log('mutationBoundary=create-only single-file no-update no-delete no-move no-multifile no-rollback no-parent-dir-create')
  printProviderDiagnostics(realMutationEnvContract.providerDiagnostics)

  if (!realHome) {
    const failure = buildRealSingleFileCreateFailure({
      category: 'provider/preflight',
      reason: 'provider/preflight: set PRIVATE_AGENTS_REAL_HOME before running real selected-workspace single-file create smoke',
      status: 'CONFIG',
      exitCode: 3,
    })
    writeRealSingleFileCreateReport({
      ...failure,
      realProviderExecution: false,
      modelTurn: false,
      changedFiles: [],
      writeIntents: [],
      workspaceWriterInvoked: false,
    })
    console.log(`[CONFIG] ${realSingleFileCreateCaseId} status=${failure.statusDetail}`)
    process.exitCode = failure.exitCode
    return
  }

  const repoBefore = await readRepoStatusShort()
  if (!repoBefore.ok || repoBefore.status) {
    const failure = buildRealSingleFileCreateFailure({
      category: 'verification-blocked',
      reason: repoBefore.ok
        ? 'verification-blocked: repository was not clean before opt-in real single-file create smoke'
        : 'verification-blocked: repository status could not be checked before opt-in real single-file create smoke',
    })
    writeRealSingleFileCreateReport({
      ...failure,
      realProviderExecution: false,
      modelTurn: false,
      changedFiles: [],
      writeIntents: [],
      workspaceWriterInvoked: false,
      outputTail: repoBefore.outputTail,
    })
    console.log(`[FAIL] ${realSingleFileCreateCaseId} status=${failure.statusDetail}`)
    console.log(`failureReason=${failure.failureReason}`)
    process.exitCode = failure.exitCode
    return
  }

  const preflight = await runProviderReadinessPreflight()
  const preflightStatus = buildCodingFlowPreflightStatus(preflight)
  console.log(`[${preflightStatus.status}] real-single-file-create-preflight status=${preflightStatus.statusDetail}`)
  if (!preflight.ok) {
    const failure = buildRealSingleFileCreateFailure({
      category: 'provider/preflight',
      reason: preflightStatus.failureReason,
      status: preflightStatus.status,
      statusDetail: preflightStatus.statusDetail,
      exitCode: preflightStatus.exitCode,
    })
    writeRealSingleFileCreateReport({
      ...failure,
      realProviderExecution: true,
      modelTurn: false,
      providerReadiness: preflight,
      changedFiles: [],
      writeIntents: [],
      workspaceWriterInvoked: false,
      outputTail: preflight.outputTail,
    })
    process.exitCode = failure.exitCode
    return
  }

  const smokeRunId = `${realSingleFileCreateCaseId}-${Date.now()}`
  const runtimeHome = getRealCodingFlowRuntimeHome(`${smokeRunId}-runtime`)
  const auditLogPath = getRealCodingFlowAuditLogPath(`${smokeRunId}-audit`)
  assertSafeCodingFlowRuntimeHome(runtimeHome)
  assertSafeCodingFlowRuntimeHome(path.dirname(auditLogPath))
  fs.rmSync(runtimeHome, { recursive: true, force: true })
  fs.mkdirSync(runtimeHome, { recursive: true })
  fs.rmSync(path.dirname(auditLogPath), { recursive: true, force: true })
  fs.mkdirSync(path.dirname(auditLogPath), { recursive: true })

  const fixture = createSingleFileCreateFixture()
  try {
    const before = snapshotSingleFileCreateFixture(fixture.fixtureDir)
    const beforeTarget = readSingleFileCreateTarget(fixture.fixtureDir)
    const providerResult = await runApplyPatchDryRunProviderTurn({
      prompt: fixture.prompt,
      runtimeHome,
      realHome,
      fixtureDir: fixture.fixtureDir,
      auditLogPath,
    })
    printProviderDiagnostics(providerResult.providerDiagnostics ?? realMutationEnvContract.providerDiagnostics)
    const redaction = redactAndAssertCodingProviderOutput(providerResult.rawOutput || providerResult.output)
    const redactedProviderOutput = redactAndAssertCodingProviderOutput(providerResult.output).redacted
    const providerFailure = classifyProviderReadinessFailure(
      `real single-file create model turn exited ${providerResult.code}`,
      redaction.redacted,
      'real',
    )

    let cliResult = undefined
    const extracted = extractSingleApplyPatchBlock(redactedProviderOutput)
    const patchShape = extracted.status === 'ok'
      ? classifySingleFileCreatePatchShape(extracted.patchText, fixture)
      : { ok: false, reason: '' }

    if (providerResult.code === 0 && !providerResult.timedOut && !providerFailure && extracted.status === 'ok' && patchShape.ok) {
      cliResult = await runApplyPatchWorkspaceWriteCli({
        fixtureDir: fixture.fixtureDir,
        patchText: extracted.patchText,
        runtimeHome,
        auditLogPath,
      })
    }

    const after = snapshotSingleFileCreateFixture(fixture.fixtureDir)
    const afterTarget = readSingleFileCreateTarget(fixture.fixtureDir)
    const comparison = compareSingleFileCreateSnapshots(before, after)
    const repoAfter = await readRepoStatusShort()
    const cliRedaction = redactAndAssertCodingProviderOutput(cliResult?.output ?? '')
    const redactionOk = redaction.ok && cliRedaction.ok
    const repositoryClean = repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status

    if (providerFailure || providerResult.code !== 0 || providerResult.timedOut) {
      const providerStatus = buildCodingFlowSmokeFailureStatus(providerResult, redaction.redacted, redaction)
      const failure = buildRealSingleFileCreateFailure({
        category: 'provider/preflight',
        reason: providerStatus.failureReason,
        status: providerStatus.status,
        statusDetail: providerStatus.statusDetail,
        exitCode: providerStatus.exitCode,
      })
      writeRealSingleFileCreateReport({
        ...failure,
        realProviderExecution: true,
        modelTurn: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean,
        changedFiles: [],
        writeIntents: [],
        workspaceWriterInvoked: false,
        redaction: { ok: redaction.ok, leaks: redaction.leaks },
        outputTail: summarizeOutput(redaction.redacted),
      })
      console.log(`[${failure.status}] ${realSingleFileCreateCaseId} status=${failure.statusDetail}`)
      if (redaction.redacted) console.log(summarizeOutput(redaction.redacted))
      process.exitCode = failure.exitCode
      return
    }

    if (!redactionOk) {
      const failure = buildRealSingleFileCreateFailure({
        category: 'redaction failure',
        reason: `redaction failure: ${[...redaction.leaks, ...cliRedaction.leaks].join(',') || 'unknown'}`,
      })
      writeRealSingleFileCreateReport({
        ...failure,
        realProviderExecution: true,
        modelTurn: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean,
        changedFiles: [],
        writeIntents: [],
        workspaceWriterInvoked: false,
        redaction: { ok: false, leaks: [...redaction.leaks, ...cliRedaction.leaks] },
      })
      console.log(`[FAIL] ${realSingleFileCreateCaseId} status=${failure.statusDetail}`)
      process.exitCode = failure.exitCode
      return
    }

    if (extracted.status !== 'ok') {
      const failure = buildRealSingleFileCreateFailure({
        category: 'model output',
        reason: `model output: provider output did not contain exactly one apply_patch block (${extracted.status})`,
        statusDetail: extracted.status,
      })
      writeRealSingleFileCreateReport({
        ...failure,
        realProviderExecution: true,
        modelTurn: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean,
        applyPatchBlocks: extracted.count,
        changedFiles: [],
        writeIntents: [],
        workspaceWriterInvoked: false,
        outputTail: summarizeOutput(redactedProviderOutput),
      })
      console.log(`[FAIL] ${realSingleFileCreateCaseId} status=${failure.statusDetail}`)
      process.exitCode = failure.exitCode
      return
    }

    if (!patchShape.ok) {
      const failure = buildRealSingleFileCreateFailure({
        category: 'unsupported patch',
        reason: patchShape.reason,
      })
      writeRealSingleFileCreateReport({
        ...failure,
        realProviderExecution: true,
        modelTurn: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean,
        applyPatchBlocks: extracted.count,
        changedFiles: [],
        writeIntents: [],
        workspaceWriterInvoked: false,
        outputTail: summarizeOutput(redactedProviderOutput),
      })
      console.log(`[FAIL] ${realSingleFileCreateCaseId} status=${failure.statusDetail}`)
      console.log(`failureReason=${failure.failureReason}`)
      process.exitCode = failure.exitCode
      return
    }

    const cliPassed = cliResult?.code === 0 &&
      !cliResult.timedOut &&
      /apply_patch workspace create succeeded/i.test(cliResult.output) &&
      /success/i.test(cliResult.output)
    if (!cliPassed) {
      const unsupported = /unsupported|not supported|only supports|failed to parse|cannot apply|rejected/i.test(cliResult?.output ?? '')
      const failure = buildRealSingleFileCreateFailure({
        category: unsupported ? 'route rejected' : 'verification-blocked',
        reason: unsupported
          ? `route rejected: workspace create route rejected the provider patch (${summarizeOutput(cliResult?.output ?? '')})`
          : `verification-blocked: workspace create CLI did not complete successfully code=${cliResult?.code ?? 'missing'} timedOut=${cliResult?.timedOut ?? 'missing'}`,
      })
      writeRealSingleFileCreateReport({
        ...failure,
        realProviderExecution: true,
        modelTurn: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean,
        applyPatchBlocks: extracted.count,
        changedFiles: [],
        writeIntents: [fixture.targetPath],
        workspaceWriterInvoked: false,
        outputTail: summarizeOutput(cliRedaction.redacted || redactedProviderOutput),
      })
      console.log(`[FAIL] ${realSingleFileCreateCaseId} status=${failure.statusDetail}`)
      console.log(`failureReason=${failure.failureReason}`)
      process.exitCode = failure.exitCode
      return
    }

    const targetCreated = beforeTarget === undefined && typeof afterTarget === 'string'
    const onlyTargetAdded = comparison.added.length === 1 &&
      comparison.added[0] === fixture.targetPath &&
      comparison.removed.length === 0 &&
      comparison.changed.length === 0
    const targetContentOk = afterTarget === fixture.plannedContent
    const success = targetCreated && onlyTargetAdded && targetContentOk && repositoryClean
    const failureCategory = !targetCreated
      ? 'no mutation'
      : success
        ? 'none'
        : 'post-write verification failed'
    const failures = [
      ...(targetCreated ? [] : [`no mutation: ${fixture.targetPath} was not created after workspace create route completed`]),
      ...(onlyTargetAdded ? [] : [`post-write verification failed: expected only ${fixture.targetPath} added; changed=${comparison.changed.join(',') || 'none'} added=${comparison.added.join(',') || 'none'} removed=${comparison.removed.join(',') || 'none'}`]),
      ...(targetContentOk ? [] : [`post-write verification failed: ${fixture.targetPath} content did not match planned Add File content`]),
      ...(repositoryClean ? [] : ['post-write verification failed: repository mutated or status unavailable']),
    ]

    writeRealSingleFileCreateReport({
      status: success ? 'PASS' : 'FAIL',
      statusDetail: success ? 'passed' : statusDetailForRealSingleFileCreateFailureCategory(failureCategory),
      realProviderExecution: true,
      modelTurn: true,
      runtimeHome: 'isolated-test-root',
      fixture: {
        files: fixture.files,
        added: comparison.added,
        removed: comparison.removed,
        changed: comparison.changed,
      },
      repositoryClean,
      applyPatchBlocks: extracted.count,
      changedFiles: success ? [fixture.targetPath] : [],
      writeIntents: [fixture.targetPath],
      workspaceWriterInvoked: success,
      writerTarget: success ? 'isolated-selected-workspace' : 'missing-or-unverified',
      terminalSuccessAllowed: success,
      redaction: { ok: true, leaks: [] },
      failureCategory,
      failureReason: failures.join('; '),
      outputTail: summarizeOutput(cliRedaction.redacted || redactedProviderOutput),
    })
    console.log(`fixtureFiles=${fixture.files.join(',')}`)
    console.log(`applyPatchBlocks=${extracted.count}`)
    console.log(`fixtureChanged=${comparison.changed.join(',') || 'none'}`)
    console.log(`fixtureAdded=${comparison.added.join(',') || 'none'}`)
    console.log(`fixtureRemoved=${comparison.removed.join(',') || 'none'}`)
    console.log(`targetCreated=${targetCreated}`)
    console.log(`postWriteVerification=${success ? 'pass' : 'fail'}`)
    console.log(`repositoryClean=${repositoryClean}`)
    console.log(`workspaceWriterInvoked=${success}`)
    console.log(`writerTarget=${success ? 'isolated-selected-workspace' : 'missing-or-unverified'}`)
    console.log(`changedFiles=${success ? fixture.targetPath : ''}`)
    console.log(`writeIntents=${fixture.targetPath}`)
    console.log(`redaction=${redactionOk ? 'pass' : 'fail'}`)
    if (!success) console.log(`failureReason=${failures.join('; ')}`)
    console.log(`[${success ? 'PASS' : 'FAIL'}] ${realSingleFileCreateCaseId}`)
    process.exitCode = success ? 0 : 1
    return
  } finally {
    cleanupSingleFileCreateFixture(fixture.fixtureDir)
    cleanupIsolatedCodingFlowRuntimeHome(runtimeHome)
    cleanupIsolatedCodingFlowAuditLog(auditLogPath)
  }
}

async function runRealSelectedWorkspaceSingleFileUpdate() {
  console.log(`mode=${realSingleFileUpdateCaseId}`)
  console.log('status taxonomy: pass=0 product-regression=1 provider-network-inconclusive=2 config-failure=3')
  console.log('real-provider=explicit-opt-in')
  console.log('homeRead=false')
  console.log('defaultSmoke=skipped')
  console.log('realProviderHome=config-only')
  console.log('writeScope=isolated-selected-workspace-existing-file-only')
  console.log('mutationBoundary=update-only single-file no-create no-delete no-move no-multifile no-rollback')
  printProviderDiagnostics(realMutationEnvContract.providerDiagnostics)

  if (!realHome) {
    const failure = buildRealSingleFileUpdateFailure({
      category: 'provider/preflight',
      reason: 'provider/preflight: set PRIVATE_AGENTS_REAL_HOME before running real selected-workspace single-file update smoke',
      status: 'CONFIG',
      exitCode: 3,
    })
    writeRealSingleFileUpdateReport({
      ...failure,
      realProviderExecution: false,
      modelTurn: false,
      changedFiles: [],
      writeIntents: [],
      workspaceWriterInvoked: false,
    })
    console.log(`[CONFIG] ${realSingleFileUpdateCaseId} status=${failure.statusDetail}`)
    process.exitCode = failure.exitCode
    return
  }

  const repoBefore = await readRepoStatusShort()
  if (!repoBefore.ok || repoBefore.status) {
    const failure = buildRealSingleFileUpdateFailure({
      category: 'verification-blocked',
      reason: repoBefore.ok
        ? 'verification-blocked: repository was not clean before opt-in real single-file smoke'
        : 'verification-blocked: repository status could not be checked before opt-in real single-file smoke',
    })
    writeRealSingleFileUpdateReport({
      ...failure,
      realProviderExecution: false,
      modelTurn: false,
      changedFiles: [],
      writeIntents: [],
      workspaceWriterInvoked: false,
      outputTail: repoBefore.outputTail,
    })
    console.log(`[FAIL] ${realSingleFileUpdateCaseId} status=${failure.statusDetail}`)
    console.log(`failureReason=${failure.failureReason}`)
    process.exitCode = failure.exitCode
    return
  }

  const preflight = await runProviderReadinessPreflight()
  const preflightStatus = buildCodingFlowPreflightStatus(preflight)
  console.log(`[${preflightStatus.status}] real-single-file-update-preflight status=${preflightStatus.statusDetail}`)
  if (!preflight.ok) {
    const failure = buildRealSingleFileUpdateFailure({
      category: 'provider/preflight',
      reason: preflightStatus.failureReason,
      status: preflightStatus.status,
      statusDetail: preflightStatus.statusDetail,
      exitCode: preflightStatus.exitCode,
    })
    writeRealSingleFileUpdateReport({
      ...failure,
      realProviderExecution: true,
      modelTurn: false,
      providerReadiness: preflight,
      changedFiles: [],
      writeIntents: [],
      workspaceWriterInvoked: false,
      outputTail: preflight.outputTail,
    })
    process.exitCode = failure.exitCode
    return
  }

  const smokeRunId = `${realSingleFileUpdateCaseId}-${Date.now()}`
  const runtimeHome = getRealCodingFlowRuntimeHome(`${smokeRunId}-runtime`)
  const auditLogPath = getRealCodingFlowAuditLogPath(`${smokeRunId}-audit`)
  assertSafeCodingFlowRuntimeHome(runtimeHome)
  assertSafeCodingFlowRuntimeHome(path.dirname(auditLogPath))
  fs.rmSync(runtimeHome, { recursive: true, force: true })
  fs.mkdirSync(runtimeHome, { recursive: true })
  fs.rmSync(path.dirname(auditLogPath), { recursive: true, force: true })
  fs.mkdirSync(path.dirname(auditLogPath), { recursive: true })

  const fixture = createSingleFileUpdateFixture()
  try {
    const before = snapshotSingleFileUpdateFixture(fixture.fixtureDir)
    const beforeTarget = readSingleFileUpdateTarget(fixture.fixtureDir)
    const providerResult = await runApplyPatchDryRunProviderTurn({
      prompt: fixture.prompt,
      runtimeHome,
      realHome,
      fixtureDir: fixture.fixtureDir,
      auditLogPath,
    })
    printProviderDiagnostics(providerResult.providerDiagnostics ?? realMutationEnvContract.providerDiagnostics)
    const redaction = redactAndAssertCodingProviderOutput(providerResult.rawOutput || providerResult.output)
    const redactedProviderOutput = redactAndAssertCodingProviderOutput(providerResult.output).redacted
    const providerFailure = classifyProviderReadinessFailure(
      `real single-file update model turn exited ${providerResult.code}`,
      redaction.redacted,
      'real',
    )

    let cliResult = undefined
    const extracted = extractSingleApplyPatchBlock(redactedProviderOutput)
    const patchShape = extracted.status === 'ok'
      ? classifySingleFileUpdatePatchShape(extracted.patchText)
      : { ok: false, reason: '' }

    if (providerResult.code === 0 && !providerResult.timedOut && !providerFailure && extracted.status === 'ok' && patchShape.ok) {
      cliResult = await runApplyPatchWorkspaceWriteCli({
        fixtureDir: fixture.fixtureDir,
        patchText: extracted.patchText,
        runtimeHome,
        auditLogPath,
      })
    }

    const after = snapshotSingleFileUpdateFixture(fixture.fixtureDir)
    const afterTarget = readSingleFileUpdateTarget(fixture.fixtureDir)
    const comparison = compareSingleFileUpdateSnapshots(before, after)
    const repoAfter = await readRepoStatusShort()
    const cliRedaction = redactAndAssertCodingProviderOutput(cliResult?.output ?? '')
    const redactionOk = redaction.ok && cliRedaction.ok
    const repositoryClean = repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status

    if (providerFailure || providerResult.code !== 0 || providerResult.timedOut) {
      const providerStatus = buildCodingFlowSmokeFailureStatus(providerResult, redaction.redacted, redaction)
      const failure = buildRealSingleFileUpdateFailure({
        category: 'provider/preflight',
        reason: providerStatus.failureReason,
        status: providerStatus.status,
        statusDetail: providerStatus.statusDetail,
        exitCode: providerStatus.exitCode,
      })
      writeRealSingleFileUpdateReport({
        ...failure,
        realProviderExecution: true,
        modelTurn: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean,
        changedFiles: [],
        writeIntents: [],
        workspaceWriterInvoked: false,
        redaction: { ok: redaction.ok, leaks: redaction.leaks },
        outputTail: summarizeOutput(redaction.redacted),
      })
      console.log(`[${failure.status}] ${realSingleFileUpdateCaseId} status=${failure.statusDetail}`)
      if (redaction.redacted) console.log(summarizeOutput(redaction.redacted))
      process.exitCode = failure.exitCode
      return
    }

    if (!redactionOk) {
      const failure = buildRealSingleFileUpdateFailure({
        category: 'redaction failure',
        reason: `redaction failure: ${[...redaction.leaks, ...cliRedaction.leaks].join(',') || 'unknown'}`,
      })
      writeRealSingleFileUpdateReport({
        ...failure,
        realProviderExecution: true,
        modelTurn: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean,
        changedFiles: [],
        writeIntents: [],
        workspaceWriterInvoked: false,
        redaction: { ok: false, leaks: [...redaction.leaks, ...cliRedaction.leaks] },
      })
      console.log(`[FAIL] ${realSingleFileUpdateCaseId} status=${failure.statusDetail}`)
      process.exitCode = failure.exitCode
      return
    }

    if (extracted.status !== 'ok') {
      const failure = buildRealSingleFileUpdateFailure({
        category: 'model output',
        reason: `model output: provider output did not contain exactly one apply_patch block (${extracted.status})`,
        statusDetail: extracted.status,
      })
      writeRealSingleFileUpdateReport({
        ...failure,
        realProviderExecution: true,
        modelTurn: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean,
        applyPatchBlocks: extracted.count,
        changedFiles: [],
        writeIntents: [],
        workspaceWriterInvoked: false,
        outputTail: summarizeOutput(redactedProviderOutput),
      })
      console.log(`[FAIL] ${realSingleFileUpdateCaseId} status=${failure.statusDetail}`)
      process.exitCode = failure.exitCode
      return
    }

    if (!patchShape.ok) {
      const failure = buildRealSingleFileUpdateFailure({
        category: 'unsupported patch',
        reason: patchShape.reason,
      })
      writeRealSingleFileUpdateReport({
        ...failure,
        realProviderExecution: true,
        modelTurn: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean,
        applyPatchBlocks: extracted.count,
        changedFiles: [],
        writeIntents: [],
        workspaceWriterInvoked: false,
        outputTail: summarizeOutput(redactedProviderOutput),
      })
      console.log(`[FAIL] ${realSingleFileUpdateCaseId} status=${failure.statusDetail}`)
      console.log(`failureReason=${failure.failureReason}`)
      process.exitCode = failure.exitCode
      return
    }

    const cliPassed = cliResult?.code === 0 &&
      !cliResult.timedOut &&
      /apply_patch workspace write succeeded/i.test(cliResult.output) &&
      /success/i.test(cliResult.output)
    if (!cliPassed) {
      const unsupported = /unsupported|not supported|only supports|failed to parse|cannot apply|rejected/i.test(cliResult?.output ?? '')
      const failure = buildRealSingleFileUpdateFailure({
        category: unsupported ? 'unsupported patch' : 'verification-blocked',
        reason: unsupported
          ? `unsupported patch: workspace write route rejected the provider patch (${summarizeOutput(cliResult?.output ?? '')})`
          : `verification-blocked: workspace write CLI did not complete successfully code=${cliResult?.code ?? 'missing'} timedOut=${cliResult?.timedOut ?? 'missing'}`,
      })
      writeRealSingleFileUpdateReport({
        ...failure,
        realProviderExecution: true,
        modelTurn: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean,
        applyPatchBlocks: extracted.count,
        changedFiles: [],
        writeIntents: ['src/app.ts'],
        workspaceWriterInvoked: true,
        outputTail: summarizeOutput(cliRedaction.redacted || redactedProviderOutput),
      })
      console.log(`[FAIL] ${realSingleFileUpdateCaseId} status=${failure.statusDetail}`)
      console.log(`failureReason=${failure.failureReason}`)
      process.exitCode = failure.exitCode
      return
    }

    const targetChanged = beforeTarget !== afterTarget
    const onlyTargetChanged = comparison.added.length === 0 &&
      comparison.removed.length === 0 &&
      comparison.changed.length === 1 &&
      comparison.changed[0] === 'src/app.ts'
    const targetContentOk =
      afterTarget.includes('export const status = "ready"') &&
      !afterTarget.includes('export const status = "draft"') &&
      afterTarget.includes('export const owner = "fixture"')
    const success = targetChanged && onlyTargetChanged && targetContentOk && repositoryClean
    const failureCategory = !targetChanged
      ? 'no mutation'
      : success
        ? 'none'
        : 'post-write verification failed'
    const failures = [
      ...(targetChanged ? [] : ['no mutation: src/app.ts did not change after workspace write route completed']),
      ...(onlyTargetChanged ? [] : [`post-write verification failed: expected only src/app.ts changed; changed=${comparison.changed.join(',') || 'none'} added=${comparison.added.join(',') || 'none'} removed=${comparison.removed.join(',') || 'none'}`]),
      ...(targetContentOk ? [] : ['post-write verification failed: src/app.ts does not contain the expected ready status while preserving owner']),
      ...(repositoryClean ? [] : ['post-write verification failed: repository mutated or status unavailable']),
    ]

    writeRealSingleFileUpdateReport({
      status: success ? 'PASS' : 'FAIL',
      statusDetail: success ? 'passed' : statusDetailForRealSingleFileUpdateFailureCategory(failureCategory),
      realProviderExecution: true,
      modelTurn: true,
      runtimeHome: 'isolated-test-root',
      fixture: {
        files: fixture.files,
        added: comparison.added,
        removed: comparison.removed,
        changed: comparison.changed,
      },
      repositoryClean,
      applyPatchBlocks: extracted.count,
      changedFiles: success ? ['src/app.ts'] : comparison.changed,
      writeIntents: ['src/app.ts'],
      workspaceWriterInvoked: true,
      writerTarget: 'isolated-selected-workspace',
      terminalSuccessAllowed: success,
      redaction: { ok: true, leaks: [] },
      failureCategory,
      failureReason: failures.join('; '),
      outputTail: summarizeOutput(cliRedaction.redacted || redactedProviderOutput),
    })
    console.log(`fixtureFiles=${fixture.files.join(',')}`)
    console.log(`applyPatchBlocks=${extracted.count}`)
    console.log(`fixtureChanged=${comparison.changed.join(',') || 'none'}`)
    console.log(`fixtureAdded=${comparison.added.join(',') || 'none'}`)
    console.log(`fixtureRemoved=${comparison.removed.join(',') || 'none'}`)
    console.log(`targetChanged=${targetChanged}`)
    console.log(`postWriteVerification=${success ? 'pass' : 'fail'}`)
    console.log(`repositoryClean=${repositoryClean}`)
    console.log('workspaceWriterInvoked=true')
    console.log('writerTarget=isolated-selected-workspace')
    console.log(`changedFiles=${success ? 'src/app.ts' : comparison.changed.join(',')}`)
    console.log('writeIntents=src/app.ts')
    console.log(`redaction=${redactionOk ? 'pass' : 'fail'}`)
    if (!success) console.log(`failureReason=${failures.join('; ')}`)
    console.log(`[${success ? 'PASS' : 'FAIL'}] ${realSingleFileUpdateCaseId}`)
    process.exitCode = success ? 0 : 1
    return
  } finally {
    cleanupSingleFileUpdateFixture(fixture.fixtureDir)
    cleanupIsolatedCodingFlowRuntimeHome(runtimeHome)
    cleanupIsolatedCodingFlowAuditLog(auditLogPath)
  }
}

async function runApplyPatchWorkspaceWriteCli({
  fixtureDir,
  patchText,
  runtimeHome,
  auditLogPath,
}) {
  return run(process.execPath, [
    tsxCliPath,
    cliEntryPath,
    '--project',
    fixtureDir,
    '--print',
    '--apply-patch-workspace-write',
    '--non-interactive-approval',
    'allow-once',
    patchText,
  ], {
    cwd: repoRoot,
    env: {
      HOME: runtimeHome,
      USERPROFILE: runtimeHome,
      PRIVATE_AGENTS_PROVIDER_MODE: 'synthetic',
      PRIVATE_AGENTS_APPROVAL_AUDIT_LOG: auditLogPath,
    },
    timeoutMs: 120000,
  })
}

async function runRealCandidateMutationSuiteCase(caseId) {
  const capabilityCase = findCapabilityCaseById(caseId)
  if (!capabilityCase) {
    return {
      status: 'FAIL',
      statusDetail: 'unknown-case',
      capability: caseId,
      provider: 'real',
      failureCategory: 'config/environment failure',
      failureReason: `suite references unknown case id: ${caseId}`,
      exitCode: 3,
    }
  }
  if (realMutationEnvContract.error) {
    const reason = realMutationEnvContract.error.reason ?? 'candidate mutation real suite provider env contract failed'
    return withCaseMetadata(capabilityCase, {
      status: 'FAIL',
      statusDetail: realMutationEnvContract.error.status ?? 'config-failure',
      capability: caseId,
      provider: 'real',
      projectDir: '(not-created)',
      sessionId: '(not-started)',
      verification: 'real-provider candidate mutation smoke not evaluated',
      failureCategory: 'provider-readiness',
      failureReason: `provider-readiness:missing-config: ${reason}`,
      route01FailureClass: 'config',
      changedFiles: [],
      failedFiles: [],
      writeIntents: [],
      realProviderExecution: false,
      exitCode: 3,
    })
  }

  const previousExitCode = process.exitCode
  process.exitCode = 0
  if (caseId === realSingleFileUpdateCaseId) {
    await runRealSelectedWorkspaceSingleFileUpdate()
  } else if (caseId === realSingleFileCreateCaseId) {
    await runRealSelectedWorkspaceSingleFileCreate()
  } else if (caseId === realTwoFileUpdateCaseId) {
    await runRealSelectedWorkspaceTwoFileUpdate()
  } else {
    process.exitCode = previousExitCode
    return {
      status: 'FAIL',
      statusDetail: 'unsupported-suite-real-case',
      capability: caseId,
      provider: 'real',
      failureCategory: 'config/environment failure',
      failureReason: `case is not wired as a candidate mutation real-provider smoke: ${caseId}`,
      exitCode: 3,
    }
  }

  const exitCode = process.exitCode ?? 0
  process.exitCode = previousExitCode
  let report = {}
  try {
    report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  } catch {
    report = {}
  }

  const status = report.status ?? (exitCode === 0 ? 'PASS' : 'FAIL')
  const statusDetail = report.statusDetail ?? (exitCode === 0 ? 'passed' : 'failed')
  const failureCategory =
    status === 'PASS'
      ? 'none'
      : report.failureCategory === 'provider/preflight'
        ? 'provider-readiness'
        : report.failureCategory ?? 'task-execution-failure'
  return withCaseMetadata(capabilityCase, {
    status,
    statusDetail,
    capability: report.capability ?? caseId,
    provider: 'real',
    projectDir: report.projectDir ?? '(isolated-real-provider-fixture)',
    sessionId: report.sessionId ?? '(real-provider-opt-in)',
    verification: status === 'PASS' ? 'real-provider candidate mutation smoke passed' : 'real-provider candidate mutation smoke failed',
    failureCategory,
    failureReason: report.failureReason ?? '',
    route01FailureClass: report.route01FailureClass ?? route01FailureClassForRealCandidate({
      status,
      statusDetail,
      failureCategory,
      failureReason: report.failureReason ?? '',
    }),
    route02FailureClass: report.route02FailureClass ?? route02FailureClassForCandidate({
      status,
      statusDetail,
      failureCategory,
      failureReason: report.failureReason ?? '',
    }),
    outputTail: report.outputTail ?? '',
    providerDiagnostics: report.providerDiagnostics ?? realMutationEnvContract.providerDiagnostics,
    changedFiles: report.changedFiles ?? [],
    failedFiles: report.failedFiles ?? [],
    writeIntents: report.writeIntents ?? [],
    realProviderExecution: Boolean(report.realProviderExecution),
    exitCode,
  })
}

async function main() {
  if (showHelp) {
    printHelp()
    return
  }
  if (candidateMutationFailureTaxonomySelfTest) {
    runCandidateMutationFailureTaxonomySelfTest()
    return
  }
  if (route03TwoFileCliPathEvidence) {
    await runRoute03TwoFileCliPathEvidence()
    return
  }
  if (route08UnsupportedPatchE2e) {
    await runRoute08UnsupportedPatchE2e()
    return
  }
  if (realReadonlyCodingPreflightSelfTest) {
    runRealReadonlyCodingPreflightSelfTest()
    return
  }
  if (realReadonlyCodingFailureAttributionSelfTest) {
    runRealReadonlyCodingFailureAttributionSelfTest()
    return
  }
  if (realCodingFlowFailureAttributionSelfTest) {
    runRealCodingFlowFailureAttributionSelfTest()
    return
  }
  if (realCodingFlowFollowupContextSelfTest) {
    runRealCodingFlowFollowupContextSelfTest()
    return
  }
  if (realCodingFlowFollowupSmokeDryRun) {
    runRealCodingFlowFollowupSmokeDryRun()
    return
  }
  if (realCodingFlowDiagnosticsSelfTest) {
    runRealCodingFlowDiagnosticsSelfTest()
    return
  }
  if (realCodingFlowAuditIsolationSelfTest) {
    runRealCodingFlowAuditIsolationSelfTest()
    return
  }
  if (realApplyPatchDryRunSmokeDryRun) {
    runRealApplyPatchDryRunSmokeDryRun()
    return
  }
  if (realApplyPatchDryRunSmoke) {
    await runRealApplyPatchDryRunSmoke()
    return
  }
  if (realApplyPatchPermissionUxSmoke) {
    await runRealApplyPatchPermissionUxSmoke()
    return
  }
  if (realApplyPatchRuntimeNoWriteSmoke) {
    await runRealApplyPatchRuntimeNoWriteSmoke()
    return
  }
  if (realApplyPatchGuardedWriteSmoke) {
    await runRealApplyPatchGuardedWriteSmoke()
    return
  }
  if (realApplyPatchGuardedRouteSmoke) {
    await runRealApplyPatchGuardedRouteSmoke()
    return
  }
  if (realApplyPatchWorkspaceWriteSmoke) {
    await runRealApplyPatchWorkspaceWriteSmoke()
    return
  }
  if (realApplyPatchWriteFixtureSmoke) {
    await runRealApplyPatchWriteFixtureSmoke()
    return
  }
  if (realReadonlyCodingPreflight) {
    await runRealReadonlyCodingPreflight()
    return
  }
  if (realReadonlyCodingSmoke) {
    await runRealReadonlyCodingSmoke()
    return
  }
  if (realReadonlyCodingDryRun) {
    runRealReadonlyCodingDryRun()
    return
  }
  if (realCodingFlowSmoke) {
    await runRealCodingFlowSmoke()
    return
  }
  if (realCodingFlowFollowupSmoke) {
    await runRealCodingFlowFollowupSmoke()
    return
  }
  if (realCodingFlowDryRun) {
    runRealCodingFlowDryRun()
    return
  }
  if (turnBoundaryDryRun) {
    runTurnBoundaryDryRun()
    return
  }
  if (terminalResultSurfaceDryRun) {
    runTerminalResultSurfaceDryRun()
    return
  }
  if (toolExecutionPlanningDryRun) {
    runToolExecutionPlanningDryRun()
    return
  }
  if (failureFollowupContextDryRun) {
    runFailureFollowupContextDryRun()
    return
  }

  validateVerifierSelectionSafety({
    selectedCaseId,
    selectedSuiteId,
    includeRealProviderSuiteCases,
    candidateMutationSuiteId,
  })

  const {
    executionTier,
    selectedPlanCases,
    selectedScenarios,
    skippedCases,
    selectedMetadata,
    selectedRequiresRealProvider,
    selectedSuiteRealCases,
  } = createVerifierCasePlan({
    caseRegistry,
    selectedTier,
    selectedCaseId,
    selectedSuiteId,
    includeCandidates,
    includeContinueSmoke,
    includeRealProviderSuiteCases,
    candidateMutationSuiteRealCaseIds,
  })

  console.log('gate name=real-user-capabilities')
  if (selectedSuiteId) {
    console.log(`suite name=${selectedSuiteId}`)
    console.log(`suite real-provider cases=${includeRealProviderSuiteCases ? 'include-real' : 'skipped-by-default'}`)
    console.log(`suite real-provider configSource=${realMutationEnvContract.configSource}`)
    if (includeRealProviderSuiteCases && realMutationEnvContract.providerDiagnostics) {
      printProviderDiagnostics(realMutationEnvContract.providerDiagnostics)
    }
    console.log('suite defaultMvpAffected=false')
  }
  console.log('status taxonomy: PASS=0 FAIL=1 PROVIDER_NETWORK=2 CONFIG=3')
  console.log('state semantics: provider preflight inconclusive skips real capability execution; synthetic MVP remains isolated from real-provider readiness')
  console.log(`repo=${repoRoot}`)
  console.log(`synthetic HOME=${syntheticHome}`)
  console.log(`real HOME=${realHome ? 'configured' : 'not-configured'}`)
  console.log(`requestedTier=${selectedTier}`)
  console.log(`executionTier=${executionTier}`)
  console.log(`requestedCase=${selectedCaseId ?? 'none'}`)
  console.log(`requestedSuite=${selectedSuiteId ?? 'none'}`)
  console.log(`candidateMode=${includeCandidates ? 'include-candidates-legacy' : includeContinueSmoke ? 'include-continue-smoke-legacy' : 'off'}`)
  printCasePlan(executionTier, selectedPlanCases, skippedCases, {
    dryRun,
    list: listCases,
    suite: selectedSuiteId,
    includeReal: includeRealProviderSuiteCases,
    caseMetadata,
    candidateMutationSuiteId,
    candidateMutationSuiteRealCaseIds,
  })

  if (listCases || dryRun) {
    const dryRunSafety = projectDryRunSafetyFacts({
      selectedSuiteId,
      includeRealProviderSuiteCases,
      candidateMutationSuiteRealCaseIds,
    })
    console.log('real-provider execution skipped')
    console.log(`realProviderTouched=${dryRunSafety.realProviderTouched ? 'true' : 'false'}`)
    if (selectedSuiteId) {
      console.log(`suiteExecutedCases=${dryRunSafety.suiteExecutedCases}`)
      console.log(`suiteSkippedRealProviderCases=${dryRunSafety.suiteSkippedRealProviderCases}`)
    }
    console.log('reportWritten=false')
    const plan = buildTierPlanReport(executionTier, selectedPlanCases, skippedCases, {
      dryRun,
      list: listCases,
      suite: selectedSuiteId,
      includeReal: includeRealProviderSuiteCases,
      caseMetadata,
      allCapabilityCases,
    })
    console.log(`planCases=${plan.allCases.length}`)
    return
  }

  if (selectedCaseId === realSingleFileUpdateCaseId) {
    try {
      await runRealSelectedWorkspaceSingleFileUpdate()
    } finally {
      cleanupRealMutationEnvContract()
    }
    return
  }
  if (selectedCaseId === realSingleFileCreateCaseId) {
    try {
      await runRealSelectedWorkspaceSingleFileCreate()
    } finally {
      cleanupRealMutationEnvContract()
    }
    return
  }
  if (selectedCaseId === realTwoFileUpdateCaseId) {
    try {
      await runRealSelectedWorkspaceTwoFileUpdate()
    } finally {
      cleanupRealMutationEnvContract()
    }
    return
  }

  if (selectedCaseId && selectedScenarios.length === 0) {
    console.log(`[CONFIG] selected case is metadata-only and has no direct executor: ${selectedCaseId}`)
    process.exit(3)
  }

  const homeCreated = ensureDirIfNeeded(syntheticHome)
  console.log(`homeCreated=${homeCreated}`)

  try {
    ensureHome(syntheticHome, 'synthetic')
    if (selectedRequiresRealProvider) {
      if (!realHome) {
        throw Object.assign(
          new Error('real provider home is not configured; set PRIVATE_AGENTS_REAL_HOME on Linux/WSL to opt in'),
          { configFailure: true },
        )
      }
      ensureHome(realHome, 'real')
    }
  } catch (error) {
    verifierReport.writeConfigFailureReport({
      executionTier,
      failureReason: error.message,
      selectedMetadata,
      skippedCases,
    })
    console.log(`[CONFIG] ${error.message}`)
    console.log(`report=${reportPath}`)
    cleanupRealMutationEnvContract()
    process.exit(3)
  }

  let providerPreflight = undefined
  if (selectedRequiresRealProvider) {
    providerPreflight = await runProviderReadinessPreflight()
    if (!providerPreflight.ok) {
      const isConfig = providerPreflight.status === 'config-failure'
      const report = verifierReport.writeProviderPreflightFailureReport({
        executionTier,
        providerPreflight,
        selectedMetadata,
        skippedCases,
      })
      const label =
        providerPreflight.status === 'provider-network-inconclusive'
          ? 'PROVIDER_NETWORK'
          : isConfig
            ? 'CONFIG'
            : 'FAIL'
      console.log(`[${label}] provider-readiness-preflight - ${report.failureReason}`)
      console.log(`report=${reportPath}`)
      cleanupRealMutationEnvContract()
      process.exit(
        providerPreflight.status === 'provider-network-inconclusive'
          ? 2
          : isConfig
            ? 3
            : 1,
      )
    }
    console.log('[PASS] provider-readiness-preflight - real provider reachable')
  } else {
    console.log('[SKIP] provider-readiness-preflight - selected tier has no real-provider cases')
  }

  const results = []
  for (const scenario of selectedScenarios) {
    const result = withCaseMetadata(scenario, await runScenario(scenario))
    results.push(result)
    const suffix = result.status === 'PASS' ? `verification=${result.verification}` : renderTerminalResultSurface(result)
    console.log(`[${result.status}] ${scenario.id} - tier=${scenario.tier} provider=${scenario.provider} project=${scenario.projectDir} session=${result.sessionId} ${suffix}`)
  }
  for (const caseId of selectedSuiteRealCases) {
    const result = await runRealCandidateMutationSuiteCase(caseId)
    results.push(result)
    const suffix = result.status === 'PASS'
      ? `verification=${result.verification}`
      : renderTerminalResultSurface(result)
    console.log(`[${result.status}] ${caseId} - suite=${selectedSuiteId} tier=${result.tier} provider=real statusDetail=${result.statusDetail} ${suffix}`)
  }
  if (selectedSuiteId) {
    const executedCases = results.map((result) => result.capability ?? result.caseMetadata?.id ?? result.id).filter(Boolean)
    const skippedReal = includeRealProviderSuiteCases ? [] : candidateMutationSuiteRealCaseIds
    console.log(`suiteExecutedCases=${executedCases.join(',') || 'none'}`)
    console.log(`suiteSkippedRealProviderCases=${skippedReal.join(',') || 'none'}`)
    console.log(`realProviderTouched=${results.some((result) => result.realProviderExecution) ? 'true' : 'false'}`)
    console.log('defaultMvpAffected=false')
  }

  const ok = results.every((capability) => capability.status === 'PASS')
  const { summarizedFailure } = verifierReport.writeFinalReport({
    ok,
    executionTier,
    selectedSuiteId,
    includeRealProviderSuiteCases,
    providerPreflight,
    selectedScenarios,
    selectedMetadata,
    skippedCases,
    results,
  })
  console.log(`report=${reportPath}`)
  cleanupRealMutationEnvContract()
  process.exit(summarizedFailure.exitCode)
}

runVerifierEntrypoint({
  main,
  onError: (error) => {
    const { redactedFailure } = verifierReport.writeUnhandledFailureReport(error)
    console.error(redactedFailure)
    process.exit(1)
  },
})
