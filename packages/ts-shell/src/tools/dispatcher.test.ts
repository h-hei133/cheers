import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SandboxEnforcer } from '../sandbox/sandboxEnforcer.js'
import { ToolDispatcher } from './dispatcher.js'

const workspaceRoot = path.join(os.tmpdir(), 'private-agents-tools-workspace')
const auditLogPath = path.join(os.tmpdir(), 'private-agents-tools-audit.jsonl')

describe('ToolDispatcher', () => {
  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true })
    await fs.rm(auditLogPath, { force: true })
  })

  it('executes an allowlisted tool through permission-aware dispatch', async () => {
    await fs.mkdir(workspaceRoot, { recursive: true })
    await fs.writeFile(path.join(workspaceRoot, 'hello.txt'), 'hello world', 'utf8')

    const enforcer = new SandboxEnforcer({ workspaceRoot, auditLogPath })
    const dispatcher = new ToolDispatcher(enforcer)

    const result = await dispatcher.dispatch(
      'read',
      { path: 'hello.txt' },
      { taskId: 'task_1', workspaceRoot },
    )

    expect(result).toEqual({ success: true, output: 'hello world' })
    enforcer.close()
  })

  it('blocks non-allowlisted tools before execution', async () => {
    const enforcer = new SandboxEnforcer({ workspaceRoot, auditLogPath })
    const dispatcher = new ToolDispatcher(enforcer)

    const result = await dispatcher.dispatch(
      'network-fetch',
      { url: 'https://example.com' },
      { taskId: 'task_2', workspaceRoot },
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain("not in the MVP allowlist")
    enforcer.close()
  })
})
