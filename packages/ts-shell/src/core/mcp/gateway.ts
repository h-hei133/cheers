import { loadMcpConfigs } from './config.js'
import { CoreMcpClient } from './client.js'
import { CoreMcpConnectionManager } from './connectionManager.js'
import type { McpClientSnapshot, McpConnectionState, McpToolCallResult, ScopedMcpServerConfig } from './types.js'

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
    this.pruneClientCache(clients)
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
    const configs = this.loadConfigs()
    const config = configs[serverName]
    if (!config) {
      this.clientCache.delete(serverName)
      throw new Error(`Unknown MCP server: ${serverName}`)
    }

    const candidate = this.clientCache.get(serverName)
    const client = candidate && this.isSameConfig(candidate.config, config)
      ? candidate
      : new CoreMcpClient(serverName, config)

    const connectionState = await client.connect()
    if (connectionState.type !== 'connected') {
      this.clientCache.delete(serverName)
      throw new Error(this.describeUnavailableServer(connectionState))
    }

    this.clientCache.set(serverName, client)

    return client.invokeTool(toolName, args)
  }

  private pruneClientCache(states: readonly McpConnectionState[]): void {
    const connectedServers = new Set(
      states
        .filter((state): state is Extract<McpConnectionState, { type: 'connected' }> => state.type === 'connected')
        .map(state => state.name),
    )

    for (const serverName of this.clientCache.keys()) {
      if (!connectedServers.has(serverName)) {
        this.clientCache.delete(serverName)
      }
    }
  }

  private isSameConfig(left: ScopedMcpServerConfig, right: ScopedMcpServerConfig): boolean {
    return JSON.stringify(left) === JSON.stringify(right)
  }

  private describeUnavailableServer(state: Exclude<McpConnectionState, { type: 'connected' }>): string {
    switch (state.type) {
      case 'disabled':
        return `MCP server ${state.name} is disabled`
      case 'needs-auth':
        return `MCP server ${state.name} requires authentication`
      case 'failed':
        return `MCP server ${state.name} is unavailable: ${state.error}`
      case 'pending':
        return `MCP server ${state.name} is pending connection`
    }
  }
}
