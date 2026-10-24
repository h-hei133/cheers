export type McpTransport = 'stdio' | 'http' | 'ws' | 'sdk'

export type McpConfigScope = 'user' | 'project'

export interface McpToolDescriptor {
  /** Opaque identity of the full server definition on this physical connection. */
  readonly contractId?: string
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

export interface McpToolInvocation {
  readonly signal?: AbortSignal
  readonly contractId?: string
}

export interface McpServerConfig {
  readonly transport: McpTransport
  readonly enabled?: boolean
  readonly command?: string
  readonly args?: string[]
  readonly env?: Record<string, string>
  readonly headers?: Record<string, string>
  /** External HTTP bearer credential; only the environment variable name is stored. */
  readonly bearerTokenEnvVar?: string
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
  readonly sourcePath?: string
  readonly overridePath?: string
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
 * Tool discovery only. Resources and prompts are fetched explicitly through the
 * content channel; this snapshot does not imply that either catalog was read.
 */
export interface McpClientSnapshot {
  readonly clients: McpConnectionState[]
  readonly tools: McpToolDescriptor[]
}

export interface McpToolCallResult {
  readonly content: string
  readonly isError?: boolean
}
