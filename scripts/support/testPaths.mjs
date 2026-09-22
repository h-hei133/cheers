import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const WINDOWS_SYNTHETIC_HOME = 'D:/Test/pca-home-synth'
const LINUX_SYNTHETIC_HOME = '/tmp/pca-home-synth'
const WINDOWS_TEST_ROOT = 'D:/Test'
const LINUX_TEST_ROOT = '/tmp/cheers-test'
const WINDOWS_REAL_PROVIDER_HOME = 'D:/Test/home-sf'

export function isWindowsPlatform() {
  return process.platform === 'win32'
}

export function getSyntheticHome() {
  return cleanEnvPath(process.env.CHEERS_SYNTHETIC_HOME) ??
    (isWindowsPlatform() ? WINDOWS_SYNTHETIC_HOME : LINUX_SYNTHETIC_HOME)
}

export function getTestRoot() {
  return cleanEnvPath(process.env.CHEERS_TEST_ROOT) ??
    (isWindowsPlatform() ? WINDOWS_TEST_ROOT : LINUX_TEST_ROOT)
}

export function getCliEntryGateRoot() {
  return cleanEnvPath(process.env.CHEERS_CLI_ENTRY_GATE_ROOT) ??
    path.join(getTestRoot(), 'cli-entry-gate')
}

export function getRealProviderHome(options = {}) {
  const configured = cleanEnvPath(process.env.CHEERS_REAL_HOME)
  if (configured) return configured
  if (options.allowDefault === true && isWindowsPlatform()) return WINDOWS_REAL_PROVIDER_HOME
  return undefined
}

export function getRealCodingFlowRuntimeHome(runId = 'manual') {
  const safeRunId = String(runId).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'manual'
  return path.join(getTestRoot(), 'real-provider-coding-flow-runtime-home', safeRunId)
}

export function getRealCodingFlowAuditLogPath(runId = 'manual') {
  const safeRunId = String(runId).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'manual'
  return path.join(getTestRoot(), 'real-provider-coding-flow-audit', safeRunId, 'permissions.jsonl')
}

export function ensureDirIfNeeded(targetPath) {
  if (!targetPath) return false
  if (fs.existsSync(targetPath)) return false
  fs.mkdirSync(targetPath, { recursive: true })
  return true
}

export function describeTestPaths() {
  return {
    platform: os.platform(),
    syntheticHome: getSyntheticHome(),
    testRoot: getTestRoot(),
    cliEntryGateRoot: getCliEntryGateRoot(),
    realProviderHome: getRealProviderHome({ allowDefault: true }) ?? 'not-configured',
    realCodingFlowRuntimeHome: getRealCodingFlowRuntimeHome('describe'),
    realCodingFlowAuditLogPath: getRealCodingFlowAuditLogPath('describe'),
  }
}

function cleanEnvPath(value) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}
