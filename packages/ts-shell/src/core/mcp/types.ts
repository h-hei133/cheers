export type McpTransport = 'stdio' | 'http' | 'ws' | 'sdk'

export type McpConfigScope = 'user' | 'project'

export interface McpToolDescriptor {
  readonly serverName: string
  readonly toolName: string
  readonly qualifiedName: string
  readonly description: string
  readonly inputSchema?: Record<string, unknown>
}

export interface McpResourceDescriptor {
  readonly uri: string
  readonly name: string
}

export interface McpPromptDescriptor {
  readonly name: string
  readonly description?: string
}

export interface McpServerConfig {
  readonly transport: McpTransport
  readonly enabled?: boolean
  readonly command?: string
  readonly args?: string[]
  readonly url?: string
  readonly scope?: McpConfigScope
  readonly authRequired?: boolean
  readonly mockTools?: McpToolDescriptor[]
  readonly mockResources?: McpResourceDescriptor[]
  readonly mockPrompts?: McpPromptDescriptor[]
}

export interface ScopedMcpServerConfig extends McpServerConfig {
  readonly scope: McpConfigScope
}

export type McpConnectionState =
  | { readonly type: 'connected'; readonly name: string; readonly config: ScopedMcpServerConfig }
  | { readonly type: 'failed'; readonly name: string; readonly config: ScopedMcpServerConfig; readonly error: string }
  | { readonly type: 'needs-auth'; readonly name: string; readonly config: ScopedMcpServerConfig }
  | { readonly type: 'pending'; readonly name: string; readonly config: ScopedMcpServerConfig }
  | { readonly type: 'disabled'; readonly name: string; readonly config: ScopedMcpServerConfig }

export interface McpClientSnapshot {
  readonly clients: McpConnectionState[]
  readonly tools: McpToolDescriptor[]
  readonly resources: Record<string, McpResourceDescriptor[]>
  readonly prompts: Record<string, McpPromptDescriptor[]>
}

export interface McpToolCallResult {
  readonly content: string
  readonly isError?: boolean
}
