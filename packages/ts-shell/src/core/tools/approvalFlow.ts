import type { SandboxEnforcer } from '../../sandbox/sandboxEnforcer.js'
import type { PermissionCheck } from '../../sandbox/index.js'
import { createSandboxPolicyRuntimeReceipt } from '../runtime/runtimeReceipt.js'
import { projectRuntimeReceipt } from '../runtime/runtimeReceiptProjection.js'
import { buildApprovalDeniedResult } from './toolPolicyResult.js'
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
        const runtimeReceipt = createSandboxPolicyRuntimeReceipt({
          toolName,
          operation: check.operation,
          target: check.target,
          allowed: policyResult.allowed,
          reason: policyResult.reason,
          requiresEscalation: policyResult.wasEscalated,
          wasEscalated: policyResult.wasEscalated,
        })
        const receipt = buildApprovalDeniedResult({
          capability: toolName === 'bash' ? 'command' : 'tool',
          label: toolName,
          reason: `${policyResult.reason} (tool: ${toolName})`,
          doNext: 'Re-run and approve the requested tool if it is still needed.',
        })
        return deniedResult(receipt.reason, {
          wasEscalated: policyResult.wasEscalated,
          runtimeReceipt: projectRuntimeReceipt(runtimeReceipt),
        })
      }
    }

    return null
  }
}
