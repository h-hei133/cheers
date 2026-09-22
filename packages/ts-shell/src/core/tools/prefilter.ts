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
  // An allowlist, because the existing filters only subtract. A user who wanted
  // a read-only run had to name every tool they did not want, which fails open:
  // each tool added later is offered without anyone deciding to offer it. Naming
  // what may run fails closed instead.
  const allowed = runtimeConfig.allowedTools

  return toolNames.map(toolName => {
    // Checked first, so the allowlist is the outer bound. `undefined` means no
    // allowlist, which is not the same as an empty one: an empty list is a user
    // saying "offer nothing", and the two must stay distinguishable.
    if (allowed !== undefined && !allowed.includes(toolName)) {
      return { toolName, visible: false, reason: 'not-allowed' }
    }

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
