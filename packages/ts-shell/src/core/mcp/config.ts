import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { McpServerConfig, ScopedMcpServerConfig } from './types.js'

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
    path.join(homeDir, '.private-agents', 'mcp.json'),
    path.join(workspaceRoot, '.private-agents.mcp.json'),
  ]
}

export function loadMcpConfigs(workspaceRoot: string): Record<string, ScopedMcpServerConfig> {
  const merged: Record<string, ScopedMcpServerConfig> = {}

  for (const configPath of getMcpConfigPaths(workspaceRoot)) {
    if (!fs.existsSync(configPath)) {
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
