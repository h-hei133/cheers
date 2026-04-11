import { loadMcpConfigs } from './config.js'
import { CoreMcpClient } from './client.js'
import { CoreMcpConnectionManager } from './connectionManager.js'
import type { McpClientSnapshot, McpToolCallResult, ScopedMcpServerConfig } from './types.js'

export class CoreMcpGateway {
  private readonly workspaceRoot: string
  private readonly connectionManager = new CoreMcpConnectionManager()
  private readonly clientCache = new Map<string, CoreMcpClient>()

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot
  }

  loadConfigs(): Record<string, ScopedMcpServerConfig> {
    return loadMcpConfigs(this.workspaceRoot)
  }

  async snapshot(): Promise<McpClientSnapshot> {
    const configs = this.loadConfigs()
    const clients = await this.connectionManager.connectAll(configs)
    const tools = []
    const resources: Record<string, Awaited<ReturnType<CoreMcpClient['listResources']>>> = {}
    const prompts: Record<string, Awaited<ReturnType<CoreMcpClient['listPrompts']>>> = {}

    for (const clientState of clients) {
      if (clientState.type !== 'connected') {
        continue
      }

      const client = new CoreMcpClient(clientState.name, clientState.config)
      this.clientCache.set(clientState.name, client)
      tools.push(...(await client.listTools()))
      resources[clientState.name] = await client.listResources()
      prompts[clientState.name] = await client.listPrompts()
    }

    return {
      clients,
      tools,
      resources,
      prompts,
    }
  }

  async invokeTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    const client = this.clientCache.get(serverName)
      ?? (() => {
        const config = this.loadConfigs()[serverName]
        if (!config) {
          throw new Error(`Unknown MCP server: ${serverName}`)
        }
        const created = new CoreMcpClient(serverName, config)
        this.clientCache.set(serverName, created)
        return created
      })()

    return client.invokeTool(toolName, args)
  }
}
