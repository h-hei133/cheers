import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SandboxEnforcer } from '../../sandbox/sandboxEnforcer.js'
import { CoreMcpGateway } from '../mcp/gateway.js'
import { ToolRuntime } from './runtime.js'

const workspaceRoot = path.join(os.tmpdir(), 'private-agents-core-tools-reconnect')
const auditLogPath = path.join(os.tmpdir(), 'private-agents-core-tools-reconnect-audit.jsonl')

describe('core tool runtime stale reconnect consistency', () => {
  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true })
    await fs.rm(auditLogPath, { force: true })
  })

  it('keeps stale descriptor visibility and execute rejection aligned after reconnect downgrades capability state', async () => {
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
    const initialSnapshot = await gateway.snapshot()
    expect(initialSnapshot.tools.map(tool => tool.qualifiedName)).toEqual(['mcp__localSdk__search'])

    const runtime = new ToolRuntime(new SandboxEnforcer({ workspaceRoot, auditLogPath }), {
      mcpTools: initialSnapshot.tools,
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

    expect(runtime.listTools()).toContain('mcp__localSdk__search')
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

    const reconnectedSnapshot = await gateway.snapshot()
    expect(reconnectedSnapshot.clients).toHaveLength(1)
    expect(reconnectedSnapshot.clients[0]).toMatchObject({ type: 'needs-auth', name: 'localSdk' })
    expect(reconnectedSnapshot.tools).toEqual([])

    expect(runtime.listTools()).toContain('mcp__localSdk__search')
    expect(runtime.listVisibleTools()).not.toContain('mcp__localSdk__search')

    const result = await runtime.execute(
      'mcp__localSdk__search',
      {},
      { taskId: 'task_mcp_reconnect_consistency', workspaceRoot },
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('MCP server localSdk requires authentication')
  })
})
