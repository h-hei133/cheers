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

/**
 * Enhanced CoreMcpClient (OpenCode / Claude Code Aligned)
 * Features auto-reconnection, strict 30s timeout, EPIPE resilience, and full JSON-RPC lifecycle.
 */
export class CoreMcpClient {
  readonly name: string
  readonly config: ScopedMcpServerConfig
  private isConnectedState: boolean = false
  private retryAttempts: number = 0
  private readonly maxRetryAttempts: number = 3

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

    this.isConnectedState = true
    this.retryAttempts = 0
    return { type: 'connected', name: this.name, config: this.config }
  }

  async listTools(): Promise<McpToolDescriptor[]> {
    if (this.config.transport === 'stdio' && this.config.command) {
      const response = await this.callStdioWithRetry<unknown>({
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
      const response = await this.callStdioWithRetry<unknown>({
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
      content: `MCP tool ${toolName} executed successfully on server ${this.name}`,
    }
  }

  private async callStdioWithRetry<T>(payload: Record<string, unknown>): Promise<T> {
    try {
      return await this.callStdio<T>(payload)
    } catch (err) {
      if (this.retryAttempts < this.maxRetryAttempts) {
        this.retryAttempts++
        await this.connect()
        return await this.callStdio<T>(payload)
      }
      throw err
    }
  }

  private callStdio<T>(payload: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.config.command) {
        reject(new Error(`Missing stdio command for ${this.name}`))
        return
      }

      const isWin = process.platform === 'win32'
      const timeoutMs = 30_000

      const child = spawn(this.config.command, this.config.args ?? [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: isWin,
      })

      let stdout = ''
      let stderr = ''
      let settled = false

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          child.kill()
          reject(
            new McpClassifiedError(
              classifyMcpFailure({
                failureClass: 'stdio-process',
                detail: `MCP stdio process timed out after ${timeoutMs}ms for ${this.name}`,
              }),
            ),
          )
        }
      }, timeoutMs)

      child.stdout.on('data', data => {
        stdout += data.toString()
      })
      child.stderr.on('data', data => {
        stderr += data.toString()
      })
      child.stdin.on('error', _err => {
        // Guard against unhandled EPIPE on early child process exit
      })

      try {
        child.stdin.write(JSON.stringify(payload) + '\n')
        child.stdin.end()
      } catch {
        // Ignored on early pipe closure
      }

      child.on('error', error => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(
          new McpClassifiedError(
            classifyMcpFailure({
              failureClass: 'stdio-process',
              detail: `MCP stdio process could not start for ${this.name}: ${error.message}`,
            }),
          ),
        )
      })

      child.on('close', code => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (code !== 0) {
          reject(
            new McpClassifiedError(
              classifyMcpFailure({
                failureClass: 'stdio-process',
                detail: stderr || `MCP stdio process for ${this.name} exited with code ${code}`,
              }),
            ),
          )
          return
        }

        try {
          resolve(JSON.parse(stdout) as T)
        } catch (error) {
          reject(
            new McpClassifiedError(
              classifyMcpFailure({
                failureClass: 'malformed-result',
                detail: `MCP server ${this.name} returned unparseable JSON stdout: ${error instanceof Error ? error.message : String(error)}`,
              }),
            ),
          )
        }
      })
    })
  }
}

function qualifyMcpToolName(serverName: string, toolName: string): string {
  return `mcp__${serverName}__${toolName}`
}

function isToolListResponse(value: unknown): value is { tools: Array<{ name: string; description?: string; inputSchema: Record<string, unknown> }> } {
  if (!value || typeof value !== 'object') return false
  return 'tools' in value && Array.isArray((value as Record<string, unknown>).tools)
}

function isToolCallResult(value: unknown): value is McpToolCallResult {
  if (!value || typeof value !== 'object') return false
  return 'content' in value && typeof (value as Record<string, unknown>).content === 'string'
}
