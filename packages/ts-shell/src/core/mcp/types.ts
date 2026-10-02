export type McpTransport = 'stdio' | 'http' | 'ws' | 'sdk'

export type McpConfigScope = 'user' | 'project'

export interface McpToolDescriptor {
  readonly serverName: string
  readonly toolName: string
  readonly qualifiedName: string
  readonly description: string
  readonly inputSchema?: Record<string, unknown>
  readonly annotations?: {
    readonly readOnlyHint?: boolean
    readonly destructiveHint?: boolean
    readonly idempotentHint?: boolean
    readonly openWorldHint?: boolean
  }
}

export interface McpServerConfig {
  readonly transport: McpTransport
  readonly enabled?: boolean
  readonly command?: string
  readonly args?: string[]
  readonly url?: string
  readonly scope?: McpConfigScope
  readonly authRequired?: boolean
  /**
   * Tools this server is taken to expose, without asking it.
   *
   * Only a test sets this. It exists so a test can describe a server's tools
   * without spawning a process, and it is the one place the configuration type
   * carries something a real config would never hold.
   */
  readonly mockTools?: McpToolDescriptor[]
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

/**
 * What the configured servers can be asked for.
 *
 * Tools only. The protocol defines two more primitives, and this build reaches
 * neither of them: there is no way to fetch a server's resources or prompts, and
 * nothing here could consume one if there were — a model cannot reference a
 * resource, and no command inserts a prompt. Reporting empty maps for them would
 * read as "this server has none", which is a different statement from "this
 * build cannot ask".
 */
export interface McpClientSnapshot {
  readonly clients: McpConnectionState[]
  readonly tools: McpToolDescriptor[]
}

export interface McpToolCallResult {
  readonly content: string
  readonly isError?: boolean
}
