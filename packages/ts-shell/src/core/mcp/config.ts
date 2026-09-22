import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { McpServerConfig, ScopedMcpServerConfig } from './types.js'
import { resolveUserDataFile, userDataDir } from "../../core/paths/userHome.js"

interface McpConfigFile {
  readonly mcpServers?: Record<string, McpServerConfig>
}

export class McpConfigLoadError extends Error {
  readonly configPath: string
  readonly doNext: string

  constructor(configPath: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    super(`MCP config is invalid at ${configPath}: ${detail}`)
    this.name = 'McpConfigLoadError'
    this.configPath = configPath
    this.doNext = `Fix or remove ${configPath}, then run /mcp refresh all.`
  }
}

export function isMcpConfigLoadError(error: unknown): error is McpConfigLoadError {
  return error instanceof McpConfigLoadError
}

export function getMcpConfigPaths(workspaceRoot: string): string[] {
  const homeDir = process.env.USERPROFILE || process.env.HOME || os.homedir()
  return [
    resolveUserDataFile('mcp.json'),
    path.join(workspaceRoot, '.private-agents.mcp.json'),
  ]
}

/**
 * The MCP servers configured for this workspace.
 *
 * A project-scoped config names a command and this process spawns it, so a
 * repository that ships `.private-agents.mcp.json` decides what runs on the
 * machine of whoever opens it. That file is therefore read only when the caller
 * says the project may be trusted; the user's own file is always read, since they
 * wrote it.
 *
 * The decision arrives as an argument rather than being read from a global here,
 * so the rule is visible at each call site and a test can exercise either side of
 * it without arranging the machine's trust store.
 */
export function loadMcpConfigs(
  workspaceRoot: string,
  allowProjectScope: boolean,
): Record<string, ScopedMcpServerConfig> {
  const merged: Record<string, ScopedMcpServerConfig> = {}

  for (const configPath of getMcpConfigPaths(workspaceRoot)) {
    if (!fs.existsSync(configPath)) {
      continue
    }
    if (configPath.endsWith('.private-agents.mcp.json') && !allowProjectScope) {
      continue
    }

    const scope = configPath.endsWith('.private-agents.mcp.json') ? 'project' : 'user'
    const raw = readMcpConfigFile(configPath)
    for (const [name, config] of Object.entries(raw.mcpServers ?? {})) {
      merged[name] = {
        ...config,
        scope,
      }
    }
  }

  return merged
}

function readMcpConfigFile(configPath: string): McpConfigFile {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as unknown
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('expected a JSON object with optional mcpServers')
    }

    const config = raw as McpConfigFile
    if (
      config.mcpServers !== undefined &&
      (!config.mcpServers ||
        typeof config.mcpServers !== 'object' ||
        Array.isArray(config.mcpServers))
    ) {
      throw new Error('expected mcpServers to be an object')
    }

    return config
  } catch (error) {
    throw new McpConfigLoadError(configPath, error)
  }
}
