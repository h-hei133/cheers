import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SandboxEnforcer } from './sandboxEnforcer.js'
import { SandboxPolicy } from './sandboxPolicy.js'

const workspaceRoot = path.join(os.tmpdir(), 'private-agents-workspace')
const auditLogPath = path.join(os.tmpdir(), 'private-agents-audit.jsonl')

describe('sandbox policy and escalation workflow', () => {
  afterEach(() => {
  })

  it('denies out-of-workspace writes and network access by default', () => {
    const policy = new SandboxPolicy(workspaceRoot)

    expect(policy.checkFilesystemPermission('write', 'C:/outside/file.txt')).toMatchObject({
      allowed: false,
      requiresEscalation: true,
      policyRule: 'default-deny-out-of-workspace',
    })

    expect(policy.checkNetworkPermission('fetch', 'https://example.com')).toMatchObject({
      allowed: false,
      requiresEscalation: true,
      policyRule: 'default-deny-network',
    })
  })

  it('normalizes traversal and sibling-prefix paths before workspace boundary checks', () => {
    const policy = new SandboxPolicy(workspaceRoot)
    const insideTarget = path.join(workspaceRoot, 'src', 'inside.txt')
    const traversalTarget = path.join(workspaceRoot, '..', 'outside.txt')
    const siblingPrefixTarget = `${workspaceRoot}-sibling/file.txt`

    expect(policy.checkFilesystemPermission('write', insideTarget)).toMatchObject({
      allowed: true,
      requiresEscalation: false,
    })
    expect(policy.checkFilesystemPermission('write', traversalTarget)).toMatchObject({
      allowed: false,
      requiresEscalation: true,
      policyRule: 'default-deny-out-of-workspace',
    })
    expect(policy.checkFilesystemPermission('write', siblingPrefixTarget)).toMatchObject({
      allowed: false,
      requiresEscalation: true,
      policyRule: 'default-deny-out-of-workspace',
    })
  })

  it('keeps Windows drive, case, and slash variants inside the same normalized boundary', () => {
    if (process.platform !== 'win32') {
      return
    }

    const policy = new SandboxPolicy('D:/Test/Workspace-Safety-Gate')

    expect(policy.checkFilesystemPermission('write', 'd:\\test\\workspace-safety-gate\\src\\inside.txt')).toMatchObject({
      allowed: true,
      requiresEscalation: false,
    })
    expect(policy.checkFilesystemPermission('write', 'D:/Test/Workspace-Safety-Gate-Sibling/src/outside.txt')).toMatchObject({
      allowed: false,
      requiresEscalation: true,
      policyRule: 'default-deny-out-of-workspace',
    })
  })

  it('requires explicit denial/approval and logs audit entries', async () => {
    const enforcer = new SandboxEnforcer({
      workspaceRoot,
      auditLogPath,
      sessionId: 'sess_test',
    })

    enforcer.setEscalationPromptHandler(async prompt => ({
      promptId: prompt.id,
      decision: 'deny',
      respondedAt: Date.now(),
      userComment: 'Denied during test',
    }))

    const result = await enforcer.checkAndEnforce('bash', {
      scope: 'filesystem',
      operation: 'write',
      target: 'C:/outside/file.txt',
    })

    expect(result).toEqual({
      allowed: false,
      reason: 'Escalation denied by user. Review recent audit entries for details.',
      wasEscalated: true,
    })

    enforcer.close()

    const auditContent = fs.readFileSync(auditLogPath, 'utf8')
    expect(auditContent).toContain('permission_check')
    expect(auditContent).toContain('escalation_request')
    expect(auditContent).toContain('escalation_decision')
  })
})
