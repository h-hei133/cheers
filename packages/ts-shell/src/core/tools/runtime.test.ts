import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SandboxEnforcer } from '../../sandbox/sandboxEnforcer.js'
import { ToolRuntime } from './runtime.js'

const workspaceRoot = path.join(os.tmpdir(), 'private-agents-core-tools')
const auditLogPath = path.join(os.tmpdir(), 'private-agents-core-tools-audit.jsonl')

describe('core tool runtime (W2)', () => {
  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true })
    await fs.rm(auditLogPath, { force: true })
  })

  it('keeps registry and runtime execution working through the new core layer', async () => {
    await fs.mkdir(workspaceRoot, { recursive: true })
    await fs.writeFile(path.join(workspaceRoot, 'hello.txt'), 'hello core', 'utf8')

    const runtime = new ToolRuntime(new SandboxEnforcer({ workspaceRoot, auditLogPath }))
    const result = await runtime.execute(
      'read',
      { path: 'hello.txt' },
      { taskId: 'task_core_read', workspaceRoot },
    )

    expect(result).toEqual({ success: true, output: 'hello core', metadata: undefined })
  })

  it('returns explicit denial result for non-allowlisted tools', async () => {
    const runtime = new ToolRuntime(new SandboxEnforcer({ workspaceRoot, auditLogPath }))
    const result = await runtime.execute(
      'network-fetch',
      { url: 'https://example.com' },
      { taskId: 'task_core_deny', workspaceRoot },
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('not in the MVP allowlist')
  })
})
