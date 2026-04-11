import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { McpServerConfig, ScopedMcpServerConfig } from './types.js'

interface McpConfigFile {
  readonly mcpServers?: Record<string, McpServerConfig>
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
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as McpConfigFile
    for (const [name, config] of Object.entries(raw.mcpServers ?? {})) {
      merged[name] = {
        ...config,
        scope,
      }
    }
  }

  return merged
}
