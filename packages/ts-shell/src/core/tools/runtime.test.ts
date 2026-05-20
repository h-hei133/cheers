import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SandboxEnforcer } from '../../sandbox/sandboxEnforcer.js'
import { CoreMcpGateway } from '../mcp/gateway.js'
import { ToolRuntime } from './runtime.js'

const workspaceRoot = path.join(os.tmpdir(), 'private-agents-core-tools')
const auditLogPath = path.join(os.tmpdir(), 'private-agents-core-tools-audit.jsonl')
const originalDaemonEnabled = process.env.DAEMON_ENABLED

describe('core tool runtime (W2)', () => {
  afterEach(async () => {
    process.env.DAEMON_ENABLED = originalDaemonEnabled
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
    expect(result.metadata?.runtimeReceipt).toMatchObject({
      resultSummary: expect.stringContaining('sandbox:stopped:command-not-allowlisted'),
      cleanupSummary: 'cleanup:not-started',
    })
  })

  it('does not execute stale visible MCP tools after reconnect changes capability state', async () => {
    await fs.mkdir(workspaceRoot, { recursive: true })
    await fs.writeFile(
      path.join(workspaceRoot, '.private-agents.mcp.json'),
      JSON.stringify({
        mcpServers: {
          localSdk: {
            transport: 'sdk',
            mockTools: [{
              serverName: 'localSdk',
              toolName: 'search',
              qualifiedName: 'mcp__localSdk__search',
              description: 'Search MCP',
            }],
          },
        },
      }),
      'utf8',
    )

    const gateway = new CoreMcpGateway(workspaceRoot)
    const snapshot = await gateway.snapshot()
    expect(snapshot.tools.map(tool => tool.qualifiedName)).toContain('mcp__localSdk__search')

    const runtime = new ToolRuntime(new SandboxEnforcer({ workspaceRoot, auditLogPath }), {
      mcpTools: snapshot.tools,
      mcpGateway: gateway,
      runtimeConfig: {
        provider: 'openai',
        daemonEnabled: true,
        maxTurns: 6,
        disabledTools: [],
        hiddenToolPrefixes: [],
        enableMcpTools: true,
        configSources: [],
      },
    })
    expect(runtime.listVisibleTools()).toContain('mcp__localSdk__search')

    await fs.writeFile(
      path.join(workspaceRoot, '.private-agents.mcp.json'),
      JSON.stringify({
        mcpServers: {
          localSdk: {
            transport: 'sdk',
            authRequired: true,
            mockTools: [{
              serverName: 'localSdk',
              toolName: 'search',
              qualifiedName: 'mcp__localSdk__search',
              description: 'Search MCP',
            }],
          },
        },
      }),
      'utf8',
    )

    expect(runtime.listVisibleTools()).not.toContain('mcp__localSdk__search')

    const result = await runtime.execute(
      'mcp__localSdk__search',
      {},
      { taskId: 'task_mcp_stale_visibility', workspaceRoot },
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('MCP server localSdk requires authentication')
    expect(result.metadata?.runtimeReceipt).toMatchObject({
      resultSummary: expect.stringContaining('mcp-process:failed:mcp-execution-failed'),
      cleanupSummary: 'cleanup:unknown',
    })
  })

  it('surfaces real rust-daemon sandbox denial as a failed tool result after TS escalation approval', async () => {
    await fs.mkdir(workspaceRoot, { recursive: true })
    process.env.DAEMON_ENABLED = '1'

    const enforcer = new SandboxEnforcer({ workspaceRoot, auditLogPath })
    enforcer.setEscalationPromptHandler(async prompt => ({
      promptId: prompt.id,
      decision: 'allow-once',
      respondedAt: Date.now(),
      userComment: 'Allow process spawn so rust daemon can evaluate sandbox denial',
    }))

    const runtime = new ToolRuntime(enforcer)
    const result = await runtime.execute(
      'bash',
      { command: process.platform === 'win32' ? 'echo https://example.com' : 'printf https://example.com' },
      { taskId: 'task_rust_daemon_sandbox_denial', workspaceRoot },
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('Network access requires escalation')
    expect(result.metadata).toMatchObject({
      executionPath: 'rust-daemon',
      status: 'failed',
      exitCode: null,
      failureKind: 'sandbox_preflight',
    })

    enforcer.close()
  }, 20000)

  it('surfaces real rust-daemon execution failure with distinct metadata from sandbox denial', async () => {
    await fs.mkdir(workspaceRoot, { recursive: true })
    process.env.DAEMON_ENABLED = '1'

    const enforcer = new SandboxEnforcer({ workspaceRoot, auditLogPath })
    enforcer.setEscalationPromptHandler(async prompt => ({
      promptId: prompt.id,
      decision: 'allow-once',
      respondedAt: Date.now(),
      userComment: 'Allow process spawn so rust daemon can execute failing command',
    }))

    const runtime = new ToolRuntime(enforcer)
    const result = await runtime.execute(
      'bash',
      {
        command: process.platform === 'win32'
          ? 'echo execution-failure 1>&2 & exit /B 7'
          : 'printf execution-failure 1>&2; exit 7',
      },
      { taskId: 'task_rust_daemon_execution_failure', workspaceRoot },
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('execution-failure')
    expect(result.metadata).toMatchObject({
      executionPath: 'rust-daemon',
      status: 'failed',
      exitCode: 7,
      failureKind: 'execution_failure',
    })

    enforcer.close()
  }, 20000)
})
