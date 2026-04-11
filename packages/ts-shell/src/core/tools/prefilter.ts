import type { RuntimeConfig } from '../../config/runtimeConfig.js'

export interface ToolVisibilityEntry {
  readonly toolName: string
  readonly visible: boolean
  readonly reason?: string
}

export function buildVisibleToolPool(
  toolNames: readonly string[],
  runtimeConfig: RuntimeConfig,
): ToolVisibilityEntry[] {
  return toolNames.map(toolName => {
    if (!runtimeConfig.enableMcpTools && toolName.startsWith('mcp__')) {
      return { toolName, visible: false, reason: 'mcp-disabled' }
    }

    if (runtimeConfig.disabledTools.includes(toolName)) {
      return { toolName, visible: false, reason: 'disabled-tool' }
    }

    const hiddenPrefix = runtimeConfig.hiddenToolPrefixes.find(prefix => toolName.startsWith(prefix))
    if (hiddenPrefix) {
      return { toolName, visible: false, reason: `hidden-prefix:${hiddenPrefix}` }
    }

    return { toolName, visible: true }
  })
}

export function filterVisibleToolNames(
  toolNames: readonly string[],
  runtimeConfig: RuntimeConfig,
): string[] {
  return buildVisibleToolPool(toolNames, runtimeConfig)
    .filter(entry => entry.visible)
    .map(entry => entry.toolName)
}
