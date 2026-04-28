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
    expect(result.metadata).toMatchObject({
      blockerKind: 'environment-not-ready',
      reason: 'MCP server localSdk requires authentication',
      doNext: "Authenticate server 'localSdk' and rerun /mcp refresh localSdk.",
    })
  })

  it('hides stale descriptors and preserves blocker evidence when reconnect finds an unavailable server', async () => {
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

    expect(runtime.listVisibleTools()).toContain('mcp__localSdk__search')

    await fs.writeFile(
      path.join(workspaceRoot, '.private-agents.mcp.json'),
      JSON.stringify({
        mcpServers: {
          localSdk: {
            transport: 'stdio',
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
    expect(reconnectedSnapshot.clients[0]).toMatchObject({
      type: 'failed',
      name: 'localSdk',
    })
    expect(reconnectedSnapshot.tools).toEqual([])
    expect(runtime.listVisibleTools()).not.toContain('mcp__localSdk__search')

    const result = await runtime.execute(
      'mcp__localSdk__search',
      {},
      { taskId: 'task_mcp_unavailable_consistency', workspaceRoot },
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('MCP server localSdk is unavailable: Missing stdio command')
    expect(result.metadata).toMatchObject({
      blockerKind: 'environment-not-ready',
      reason: 'MCP server localSdk is unavailable: Missing stdio command',
      doNext: 'Run /mcp refresh localSdk and verify server connectivity before retrying.',
    })
  })

  it('hides stale descriptors after server deletion or disable and rejects stale execution', async () => {
    await fs.mkdir(workspaceRoot, { recursive: true })
    const configPath = path.join(workspaceRoot, '.private-agents.mcp.json')
    await fs.writeFile(
      configPath,
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

    await fs.writeFile(configPath, JSON.stringify({ mcpServers: {} }), 'utf8')
    const deletedSnapshot = await gateway.refresh('all')
    expect(deletedSnapshot.clients).toEqual([])
    expect(deletedSnapshot.tools).toEqual([])
    expect(runtime.listVisibleTools()).not.toContain('mcp__localSdk__search')

    const deletedResult = await runtime.execute(
      'mcp__localSdk__search',
      {},
      { taskId: 'task_mcp_deleted_descriptor', workspaceRoot },
    )
    expect(deletedResult.success).toBe(false)
    expect(deletedResult.error).toBe('Unknown MCP server: localSdk')
    expect(deletedResult.metadata).toMatchObject({
      blockerKind: 'unknown',
      reason: 'Unknown MCP server: localSdk',
      doNext: 'Run /mcp status to list configured servers, then retry with a valid server name.',
    })

    await fs.writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          localSdk: {
            transport: 'sdk',
            enabled: false,
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

    const disabledSnapshot = await gateway.refresh('all')
    expect(disabledSnapshot.clients).toHaveLength(1)
    expect(disabledSnapshot.clients[0]).toMatchObject({ type: 'disabled', name: 'localSdk' })
    expect(disabledSnapshot.tools).toEqual([])
    expect(runtime.listVisibleTools()).not.toContain('mcp__localSdk__search')

    const disabledResult = await runtime.execute(
      'mcp__localSdk__search',
      {},
      { taskId: 'task_mcp_disabled_descriptor', workspaceRoot },
    )
    expect(disabledResult.success).toBe(false)
    expect(disabledResult.error).toBe('MCP server localSdk is disabled')
    expect(disabledResult.metadata).toMatchObject({
      blockerKind: 'environment-not-ready',
      reason: 'MCP server localSdk is disabled',
      doNext: "Enable server 'localSdk' in MCP config, then rerun /mcp refresh localSdk.",
    })
  })

  it('hides stale descriptors and rejects stale execution when MCP config becomes malformed', async () => {
    await fs.mkdir(workspaceRoot, { recursive: true })
    const configPath = path.join(workspaceRoot, '.private-agents.mcp.json')
    await fs.writeFile(
      configPath,
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

    expect(runtime.listVisibleTools()).toContain('mcp__localSdk__search')

    await fs.writeFile(configPath, '{broken', 'utf8')

    expect(runtime.listTools()).toContain('mcp__localSdk__search')
    expect(runtime.listVisibleTools()).not.toContain('mcp__localSdk__search')

    const result = await runtime.execute(
      'mcp__localSdk__search',
      {},
      { taskId: 'task_mcp_malformed_config_descriptor', workspaceRoot },
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain(`MCP config is invalid at ${configPath}`)
    expect(result.metadata).toMatchObject({
      blockerKind: 'environment-not-ready',
      reason: expect.stringContaining(`MCP config is invalid at ${configPath}`),
      doNext: `Fix or remove ${configPath}, then run /mcp refresh all.`,
    })
  })

  it('returns a clear blocker for unknown MCP tool execution', async () => {
    await fs.mkdir(workspaceRoot, { recursive: true })
    const runtime = new ToolRuntime(new SandboxEnforcer({ workspaceRoot, auditLogPath }))

    const result = await runtime.execute(
      'mcp__missingServer__search',
      {},
      { taskId: 'task_mcp_unknown_tool', workspaceRoot },
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe("MCP tool 'mcp__missingServer__search' is not registered")
    expect(result.metadata).toMatchObject({
      blockerKind: 'unknown',
      serverName: 'missingServer',
      reason: "MCP tool 'mcp__missingServer__search' is not registered",
      doNext: 'Run /mcp status and /mcp refresh to list available MCP tools, then retry with a visible tool name.',
    })
  })
})
