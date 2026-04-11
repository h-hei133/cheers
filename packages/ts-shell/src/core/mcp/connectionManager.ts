import { CoreMcpClient } from './client.js'
import type { McpConnectionState, ScopedMcpServerConfig } from './types.js'

export class CoreMcpConnectionManager {
  async connectAll(configs: Record<string, ScopedMcpServerConfig>): Promise<McpConnectionState[]> {
    const results: McpConnectionState[] = []

    for (const [name, config] of Object.entries(configs)) {
      const client = new CoreMcpClient(name, config)
      results.push(await client.connect())
    }

    return results
  }
}
