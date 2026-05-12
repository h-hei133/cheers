import { spawn } from 'node:child_process'
import type {
  McpConnectionState,
  McpToolCallResult,
  McpPromptDescriptor,
  McpResourceDescriptor,
  ScopedMcpServerConfig,
  McpToolDescriptor,
} from './types.js'
import {
  McpClassifiedError,
  classifyMcpFailure,
} from './errorTaxonomy.js'

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
      const response = await this.callStdio<unknown>({
        action: 'list-tools',
      })
      if (!isToolListResponse(response)) {
        throw new McpClassifiedError(
          classifyMcpFailure({
            failureClass: 'protocol',
            detail: `MCP server ${this.name} returned an invalid tools list`,
          }),
        )
      }
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
      const response = await this.callStdio<unknown>({
        action: 'invoke-tool',
        toolName,
        args,
      })
      if (!isToolCallResult(response)) {
        throw new McpClassifiedError(
          classifyMcpFailure({
            failureClass: 'malformed-result',
            detail: `MCP tool ${toolName} on server ${this.name} returned a malformed result`,
          }),
        )
      }
      return response
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
      child.on('error', error => {
        reject(new McpClassifiedError(
          classifyMcpFailure({
            failureClass: 'stdio-process',
            detail: `MCP stdio process could not start for ${this.name}: ${error.message}`,
          }),
        ))
      })
      child.on('close', code => {
        if (code !== 0) {
          reject(new McpClassifiedError(
            classifyMcpFailure({
              failureClass: 'stdio-process',
              detail: stderr || `MCP stdio process for ${this.name} exited with code ${code}`,
            }),
          ))
          return
        }

        try {
          resolve(JSON.parse(stdout) as T)
        } catch (error) {
          reject(new McpClassifiedError(
            classifyMcpFailure({
              failureClass: 'malformed-result',
              detail: error instanceof Error
                ? `MCP stdio response from ${this.name} was not valid JSON: ${error.message}`
                : `MCP stdio response from ${this.name} was not valid JSON`,
            }),
          ))
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

function isToolListResponse(value: unknown): value is {
  readonly tools: Array<{ readonly name: string; readonly description: string; readonly inputSchema?: Record<string, unknown> }>
} {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { tools?: unknown }).tools)) {
    return false
  }
  return (value as { tools: unknown[] }).tools.every(tool => {
    if (!tool || typeof tool !== 'object') return false
    const candidate = tool as { name?: unknown; description?: unknown }
    return typeof candidate.name === 'string' && typeof candidate.description === 'string'
  })
}

function isToolCallResult(value: unknown): value is McpToolCallResult {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as { content?: unknown; isError?: unknown }
  return (
    typeof candidate.content === 'string' &&
    (candidate.isError === undefined || typeof candidate.isError === 'boolean')
  )
}
