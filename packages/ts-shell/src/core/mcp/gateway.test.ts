import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadMcpConfigs } from './config.js'
import { CoreMcpClient } from './client.js'
import { CoreMcpGateway } from './gateway.js'

describe('core MCP gateway (W3)', () => {
  let fakeHomeDir = ''
  let workspaceRoot = ''
  const originalUserProfile = process.env.USERPROFILE
  const originalHome = process.env.HOME

  beforeEach(() => {
    fakeHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'private-agents-mcp-home-'))
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'private-agents-mcp-workspace-'))
    process.env.USERPROFILE = fakeHomeDir
    process.env.HOME = fakeHomeDir
  })

  afterEach(() => {
    process.env.USERPROFILE = originalUserProfile
    process.env.HOME = originalHome
    fs.rmSync(fakeHomeDir, { recursive: true, force: true })
    fs.rmSync(workspaceRoot, { recursive: true, force: true })
  })

  it('loads user and project MCP configs into scoped configs', () => {
    fs.mkdirSync(path.join(fakeHomeDir, '.private-agents'), { recursive: true })
    fs.writeFileSync(
      path.join(fakeHomeDir, '.private-agents', 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          userServer: { transport: 'sdk', mockTools: [{ name: 'user-tool', description: 'u' }] },
        },
      }),
      'utf8',
    )
    fs.writeFileSync(
      path.join(workspaceRoot, '.private-agents.mcp.json'),
      JSON.stringify({
        mcpServers: {
          projectServer: { transport: 'stdio', command: 'node', mockTools: [{ name: 'project-tool', description: 'p' }] },
        },
      }),
      'utf8',
    )

    const configs = loadMcpConfigs(workspaceRoot)
    expect(configs.userServer.scope).toBe('user')
    expect(configs.projectServer.scope).toBe('project')
  })

  it('maps auth-required and invalid transport configs into explicit client states', async () => {
    const authClient = new CoreMcpClient('auth', {
      transport: 'http',
      url: 'https://example.com',
      scope: 'project',
      authRequired: true,
    })
    const failedClient = new CoreMcpClient('broken', {
      transport: 'stdio',
      scope: 'project',
    })

    expect(await authClient.connect()).toMatchObject({ type: 'needs-auth' })
    expect(await failedClient.connect()).toMatchObject({ type: 'failed' })
  })

  it('aggregates tools/resources/prompts through the gateway snapshot', async () => {
    fs.writeFileSync(
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
            mockResources: [{ uri: 'mcp://notes/1', name: 'notes' }],
            mockPrompts: [{ name: 'draft-plan', description: 'Draft a plan' }],
          },
        },
      }),
      'utf8',
    )

    const gateway = new CoreMcpGateway(workspaceRoot)
    const snapshot = await gateway.snapshot()

    expect(snapshot.clients).toHaveLength(1)
    expect(snapshot.clients[0]).toMatchObject({ type: 'connected', name: 'localSdk' })
    expect(snapshot.tools.map(tool => tool.toolName)).toContain('search')
    expect(snapshot.tools.map(tool => tool.qualifiedName)).toContain('mcp__localSdk__search')
    expect(snapshot.resources.localSdk[0].uri).toBe('mcp://notes/1')
    expect(snapshot.prompts.localSdk[0].name).toBe('draft-plan')
  })

  it('supports real stdio list and invoke with server-scoped MCP tool identity', async () => {
    const serverPath = path.resolve(
      process.cwd(),
      'packages/ts-shell/src/core/mcp/fixtures/mockMcpServer.mjs',
    )

    fs.writeFileSync(
      path.join(workspaceRoot, '.private-agents.mcp.json'),
      JSON.stringify({
        mcpServers: {
          stdioEcho: {
            transport: 'stdio',
            command: process.execPath,
            args: [serverPath],
          },
        },
      }),
      'utf8',
    )

    const gateway = new CoreMcpGateway(workspaceRoot)
    const snapshot = await gateway.snapshot()

    expect(snapshot.tools).toHaveLength(1)
    expect(snapshot.tools[0]).toMatchObject({
      serverName: 'stdioEcho',
      toolName: 'echo_message',
      qualifiedName: 'mcp__stdioEcho__echo_message',
    })

    const result = await gateway.invokeTool('stdioEcho', 'echo_message', { message: 'hello' })
    expect(result.content).toBe('echo:hello')
  }, 15000)

  it('drops stale cached clients when a server disappears on the next snapshot', async () => {
    fs.writeFileSync(
      path.join(workspaceRoot, '.private-agents.mcp.json'),
      JSON.stringify({
        mcpServers: {
          localSdk: {
            transport: 'sdk',
            mockTools: [{ serverName: 'localSdk', toolName: 'search', qualifiedName: 'mcp__localSdk__search', description: 'Search MCP' }],
          },
        },
      }),
      'utf8',
    )

    const gateway = new CoreMcpGateway(workspaceRoot)
    await gateway.snapshot()

    fs.writeFileSync(
      path.join(workspaceRoot, '.private-agents.mcp.json'),
      JSON.stringify({ mcpServers: {} }),
      'utf8',
    )

    const snapshot = await gateway.snapshot()
    expect(snapshot.clients).toEqual([])
    await expect(gateway.invokeTool('localSdk', 'search', {})).rejects.toThrow('Unknown MCP server: localSdk')
  })

  it('invalidates cached clients when reconnect reveals auth is now required', async () => {
    fs.writeFileSync(
      path.join(workspaceRoot, '.private-agents.mcp.json'),
      JSON.stringify({
        mcpServers: {
          localSdk: {
            transport: 'sdk',
            mockTools: [{ serverName: 'localSdk', toolName: 'search', qualifiedName: 'mcp__localSdk__search', description: 'Search MCP' }],
          },
        },
      }),
      'utf8',
    )

    const gateway = new CoreMcpGateway(workspaceRoot)
    await gateway.snapshot()

    fs.writeFileSync(
      path.join(workspaceRoot, '.private-agents.mcp.json'),
      JSON.stringify({
        mcpServers: {
          localSdk: {
            transport: 'sdk',
            authRequired: true,
            mockTools: [{ serverName: 'localSdk', toolName: 'search', qualifiedName: 'mcp__localSdk__search', description: 'Search MCP' }],
          },
        },
      }),
      'utf8',
    )

    const snapshot = await gateway.snapshot()
    expect(snapshot.clients).toHaveLength(1)
    expect(snapshot.clients[0]).toMatchObject({ type: 'needs-auth', name: 'localSdk' })
    expect(snapshot.tools).toEqual([])
    await expect(gateway.invokeTool('localSdk', 'search', {})).rejects.toThrow('MCP server localSdk requires authentication')
  })
})
