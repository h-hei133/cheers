import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export interface RuntimeConfig {
  readonly provider: 'openai'
  readonly daemonEnabled: boolean
  readonly maxTurns: number
  readonly disabledTools: readonly string[]
  readonly hiddenToolPrefixes: readonly string[]
  readonly enableMcpTools: boolean
  readonly configSources: string[]
}

interface RuntimeConfigFile {
  provider?: 'openai'
  daemonEnabled?: boolean
  maxTurns?: number
  disabledTools?: string[]
  hiddenToolPrefixes?: string[]
  enableMcpTools?: boolean
}

const DEFAULT_CONFIG: Omit<RuntimeConfig, 'configSources'> = {
  provider: 'openai',
  daemonEnabled: true,
  maxTurns: 6,
  disabledTools: [],
  hiddenToolPrefixes: [],
  enableMcpTools: true,
}

export function getRuntimeConfig(rootDir: string = process.cwd()): RuntimeConfig {
  const sources: string[] = []
  let merged: RuntimeConfigFile = {}

  for (const candidate of getCandidateConfigPaths(rootDir)) {
    if (!fs.existsSync(candidate)) {
      continue
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8')) as RuntimeConfigFile
      merged = { ...merged, ...parsed }
      sources.push(candidate)
    } catch (error) {
      throw new Error(
        `Failed to read runtime config at ${candidate}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  const daemonFromEnv = process.env.DAEMON_ENABLED
  const daemonEnabled = daemonFromEnv === undefined
    ? merged.daemonEnabled ?? DEFAULT_CONFIG.daemonEnabled
    : daemonFromEnv === '1'

  const maxTurnsFromEnv = process.env.PRIVATE_AGENTS_MAX_TURNS
  const maxTurns = maxTurnsFromEnv
    ? Number(maxTurnsFromEnv)
    : merged.maxTurns ?? DEFAULT_CONFIG.maxTurns

  return {
    provider: merged.provider ?? DEFAULT_CONFIG.provider,
    daemonEnabled,
    maxTurns,
    disabledTools: merged.disabledTools ?? DEFAULT_CONFIG.disabledTools,
    hiddenToolPrefixes: merged.hiddenToolPrefixes ?? DEFAULT_CONFIG.hiddenToolPrefixes,
    enableMcpTools: merged.enableMcpTools ?? DEFAULT_CONFIG.enableMcpTools,
    configSources: sources,
  }
}

export function getCandidateConfigPaths(rootDir: string = process.cwd()): string[] {
  return [
    path.join(os.homedir(), '.private-agents', 'config.json'),
    path.join(rootDir, '.private-agents.json'),
  ]
}
