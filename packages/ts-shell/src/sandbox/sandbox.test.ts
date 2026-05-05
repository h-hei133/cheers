import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AuditTrail } from './auditTrail.js'
import { SandboxEnforcer } from './sandboxEnforcer.js'
import { SandboxPolicy } from './sandboxPolicy.js'

const workspaceRoot = path.join(os.tmpdir(), 'private-agents-workspace')
const auditLogPath = path.join(os.tmpdir(), 'private-agents-audit.jsonl')

async function waitForFile(filePath: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (fs.existsSync(filePath)) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

describe('sandbox policy and escalation workflow', () => {
  afterEach(() => {
    delete process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH
    fs.rmSync(auditLogPath, { force: true })
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

    await waitForFile(auditLogPath)
    const auditContent = fs.readFileSync(auditLogPath, 'utf8')
    expect(auditContent).toContain('permission_check')
    expect(auditContent).toContain('escalation_request')
    expect(auditContent).toContain('escalation_decision')
  })

  it('uses explicit audit config before environment override', () => {
    const envAuditPath = path.join(os.tmpdir(), 'private-agents-env-audit.jsonl')
    const explicitAuditPath = path.join(os.tmpdir(), 'private-agents-explicit-audit.jsonl')
    fs.rmSync(envAuditPath, { force: true })
    fs.rmSync(explicitAuditPath, { force: true })
    process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH = envAuditPath

    const audit = new AuditTrail({ logFilePath: explicitAuditPath })
    try {
      expect(audit.getLogFilePath()).toBe(explicitAuditPath)
      expect(fs.existsSync(path.dirname(explicitAuditPath))).toBe(true)
      expect(fs.existsSync(envAuditPath)).toBe(false)
    } finally {
      audit.close()
      fs.rmSync(envAuditPath, { force: true })
      fs.rmSync(explicitAuditPath, { force: true })
    }
  })

  it('uses PRIVATE_AGENTS_AUDIT_LOG_PATH when no explicit audit config is provided', () => {
    const envAuditPath = path.join(os.tmpdir(), 'private-agents-env-audit.jsonl')
    fs.rmSync(envAuditPath, { force: true })
    process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH = envAuditPath

    const audit = new AuditTrail()
    try {
      expect(audit.getLogFilePath()).toBe(envAuditPath)
    } finally {
      audit.close()
      fs.rmSync(envAuditPath, { force: true })
    }
  })
})
