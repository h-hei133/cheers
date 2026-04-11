import { spawn } from 'node:child_process'
import type {
  McpConnectionState,
  McpToolCallResult,
  McpPromptDescriptor,
  McpResourceDescriptor,
  ScopedMcpServerConfig,
  McpToolDescriptor,
} from './types.js'

export class CoreMcpClient {
  readonly name: string
  readonly config: ScopedMcpServerConfig

  constructor(name: string, config: ScopedMcpServerConfig) {
    this.name = name
    this.config = config
  }

  async connect(): Promise<McpConnectionState> {
    if (this.config.enabled === false) {
      return { type: 'disabled', name: this.name, config: this.config }
    }

    if (this.config.authRequired) {
      return { type: 'needs-auth', name: this.name, config: this.config }
    }

    if (this.config.transport === 'stdio' && !this.config.command) {
      return {
        type: 'failed',
        name: this.name,
        config: this.config,
        error: 'Missing stdio command',
      }
    }

    if ((this.config.transport === 'http' || this.config.transport === 'ws') && !this.config.url) {
      return {
        type: 'failed',
        name: this.name,
        config: this.config,
        error: 'Missing remote URL',
      }
    }

    return { type: 'connected', name: this.name, config: this.config }
  }

  async listTools(): Promise<McpToolDescriptor[]> {
    if (this.config.transport === 'stdio' && this.config.command) {
      const response = await this.callStdio<{ tools: Array<{ name: string; description: string; inputSchema?: Record<string, unknown> }> }>({
        action: 'list-tools',
      })
      return response.tools.map(tool => ({
        serverName: this.name,
        toolName: tool.name,
        qualifiedName: qualifyMcpToolName(this.name, tool.name),
        description: tool.description,
        inputSchema: tool.inputSchema,
      }))
    }

    return (this.config.mockTools ?? []).map(tool => ({
      ...tool,
      serverName: tool.serverName ?? this.name,
      qualifiedName: tool.qualifiedName ?? qualifyMcpToolName(this.name, tool.toolName),
    }))
  }

  async listResources(): Promise<McpResourceDescriptor[]> {
    return this.config.mockResources ?? []
  }

  async listPrompts(): Promise<McpPromptDescriptor[]> {
    return this.config.mockPrompts ?? []
  }

  async invokeTool(toolName: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    if (this.config.transport === 'stdio' && this.config.command) {
      return this.callStdio<McpToolCallResult>({
        action: 'invoke-tool',
        toolName,
        args,
      })
    }

    return {
      content: `Mock MCP tool ${toolName} executed on ${this.name}`,
    }
  }

  private callStdio<T>(payload: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.config.command) {
        reject(new Error(`Missing stdio command for ${this.name}`))
        return
      }

      const child = spawn(this.config.command, this.config.args ?? [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      })

      let stdout = ''
      let stderr = ''

      child.stdout.on('data', data => {
        stdout += data.toString()
      })
      child.stderr.on('data', data => {
        stderr += data.toString()
      })
      child.on('error', reject)
      child.on('close', code => {
        if (code !== 0) {
          reject(new Error(stderr || `MCP stdio call failed with exit code ${code}`))
          return
        }

        try {
          resolve(JSON.parse(stdout) as T)
        } catch (error) {
          reject(error)
        }
      })

      child.stdin.write(JSON.stringify(payload))
      child.stdin.end()
    })
  }
}

export function qualifyMcpToolName(serverName: string, toolName: string): string {
  return `mcp__${serverName}__${toolName}`
}
