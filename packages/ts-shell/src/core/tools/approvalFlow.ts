import type { SandboxEnforcer } from '../../sandbox/sandboxEnforcer.js'
import type { PermissionCheck } from '../../sandbox/index.js'
import { deniedResult } from './toolResultLifecycle.js'

export class ToolApprovalFlow {
  private readonly enforcer: SandboxEnforcer

  constructor(enforcer: SandboxEnforcer) {
    this.enforcer = enforcer
  }

  async authorize(toolName: string, checks: PermissionCheck[]) {
    for (const check of checks) {
      const policyResult = await this.enforcer.checkAndEnforce(toolName, check)
      if (!policyResult.allowed) {
        return deniedResult(`${policyResult.reason} (tool: ${toolName})`, {
          wasEscalated: policyResult.wasEscalated,
        })
      }
    }

    return null
  }
}
