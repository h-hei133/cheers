import {
  createOpenAIStreamMapperState,
  mapOpenAIChunkToNormalizedEvents,
  normalizeOpenAIError,
  toCodexResponsesRequestBody,
  toOpenAIRequestBody,
} from './normalize.js'
import {
  type ProviderAccountAuthConfig,
  readUserRuntimeConfigFile,
  writeUserRuntimeConfigFile,
} from '../../../config/runtimeConfig.js'
import { createComponentLogger, recordCount } from '../../../observability/index.js'
import { createProviderFetchFromEnv } from '../../../provider/request/fetch.js'
import type { OpenAIChatCompletionsStreamChunk } from './wireTypes.js'
import type {
  ModelProviderAdapter,
  ModelProviderConfig,
  ModelRequest,
  NormalizedProviderError,
  NormalizedStreamEvent,
  ProviderCapabilities,
} from '../../types.js'

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'
const CODEX_API_ENDPOINT = 'https://chatgpt.com/backend-api/codex/responses'
const CODEX_API_FALLBACK_ENDPOINT = 'https://chat.openai.com/backend-api/codex/responses'
const OPENAI_AUTH_ISSUER = 'https://auth.openai.com'
const OPENAI_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

export class OpenAIModelAdapter implements ModelProviderAdapter {
  readonly id: ModelProviderConfig['provider']
  private readonly logger = createComponentLogger('provider-openai')

  readonly capabilities: ProviderCapabilities = {
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsJsonResponseFormat: true,
  }

  private readonly baseUrl: string
  private readonly apiKey?: string
  private accountAuth?: ModelProviderConfig['accountAuth']
  private readonly fetchImpl: typeof fetch

  constructor(
    config: ModelProviderConfig,
    fetchImpl: typeof fetch = createProviderFetchFromEnv(),
  ) {
    this.id = config.provider
    this.baseUrl = config.baseUrl ?? DEFAULT_OPENAI_BASE_URL
    this.apiKey = config.apiKey
    this.accountAuth = config.accountAuth
    this.fetchImpl = fetchImpl
  }

  async *streamResponse(
    request: ModelRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<NormalizedStreamEvent, void> {
    try {
      let resolvedOpenAIAccountAuth =
        this.id === 'openai' && this.accountAuth?.type === 'openai-chatgpt-account'
          ? this.accountAuth
          : undefined
      let resolvedGoogleAccountAuth =
        this.id === 'google' && this.accountAuth?.type === 'google-gemini-account'
          ? this.accountAuth
          : undefined
      const isOpenAIAccountAuth = Boolean(resolvedOpenAIAccountAuth)
      const isGoogleAccountAuth = Boolean(resolvedGoogleAccountAuth)

      let activeAccountAuth = resolvedOpenAIAccountAuth ?? resolvedGoogleAccountAuth
      if (resolvedOpenAIAccountAuth && resolvedOpenAIAccountAuth.expiresAt <= Date.now()) {
        const refreshed = await this.refreshOpenAIAccessToken(
          resolvedOpenAIAccountAuth.refreshToken,
        )
        const refreshedAccountAuth = {
          ...resolvedOpenAIAccountAuth,
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          expiresAt: refreshed.expiresAt,
        }
        this.accountAuth = refreshedAccountAuth
        persistRefreshedAccountAuth(this.id, refreshedAccountAuth)
        resolvedOpenAIAccountAuth = refreshedAccountAuth
        activeAccountAuth = refreshedAccountAuth
      } else if (
        resolvedGoogleAccountAuth &&
        resolvedGoogleAccountAuth.expiresAt <= Date.now()
      ) {
        const refreshed = await this.refreshGoogleAccessToken(
          resolvedGoogleAccountAuth.refreshToken,
          resolvedGoogleAccountAuth.clientId,
        )
        const refreshedAccountAuth = {
          ...resolvedGoogleAccountAuth,
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          expiresAt: refreshed.expiresAt,
        }
        this.accountAuth = refreshedAccountAuth
        persistRefreshedAccountAuth(this.id, refreshedAccountAuth)
        resolvedGoogleAccountAuth = refreshedAccountAuth
        activeAccountAuth = refreshedAccountAuth
      }

      const accountToken = activeAccountAuth?.accessToken?.trim()
      if (activeAccountAuth && !accountToken) {
        throw new Error(
          `Account auth token is missing. Reconnect with /connect login ${this.id} --account.`,
        )
      }

      const authHeader = accountToken ?? this.apiKey
      const headers = {
        'content-type': 'application/json',
        ...(authHeader ? { authorization: `Bearer ${authHeader}` } : {}),
        ...(isOpenAIAccountAuth ? { originator: 'codex_cli_rs' } : {}),
        ...(isOpenAIAccountAuth ? { 'User-Agent': 'private-coding-agents/ts-shell' } : {}),
        ...(resolvedOpenAIAccountAuth?.accountId
          ? { 'ChatGPT-Account-Id': resolvedOpenAIAccountAuth.accountId }
          : {}),
      }
      if (isOpenAIAccountAuth) {
        const codexRequestBody = JSON.stringify(toCodexResponsesRequestBody(request))
        const codexResponse = await this.fetchCodexWithFallback({
          headers,
          body: codexRequestBody,
          signal,
        })
        if (!codexResponse.ok) {
          const errorBody = await safeReadText(codexResponse)
          this.logger.warn('Codex account-auth request failed', {
            status: codexResponse.status,
          })
          throw {
            status: codexResponse.status,
            message: errorBody || `Codex request failed with status ${codexResponse.status}`,
            headers: codexResponse.headers,
          }
        }
        const body = codexResponse.body
        if (!body) {
          throw new Error('Codex streaming response missing body')
        }
        const decoder = new TextDecoder()
        let pending = ''
        let emittedStart = false
        let emittedCompleted = false
        const reader = body.getReader()

        while (true) {
          const { value, done } = await reader.read()
          if (done) {
            break
          }
          if (!value) {
            continue
          }
          pending += decoder.decode(value, { stream: true })
          while (true) {
            const separatorIndex = pending.indexOf('\n\n')
            if (separatorIndex === -1) {
              break
            }
            const frame = pending.slice(0, separatorIndex)
            pending = pending.slice(separatorIndex + 2)
            const dataLines = frame
              .split('\n')
              .filter(line => line.startsWith('data:'))
              .map(line => line.slice('data:'.length).trim())
            for (const dataLine of dataLines) {
              if (!dataLine || dataLine === '[DONE]') {
                continue
              }
              let parsed: unknown
              try {
                parsed = JSON.parse(dataLine)
              } catch {
                continue
              }
              if (!parsed || typeof parsed !== 'object') {
                continue
              }
              const chunk = parsed as { type?: unknown; [key: string]: unknown }
              const chunkType = typeof chunk.type === 'string' ? chunk.type : ''
              if (chunkType === 'response.created') {
                const response = chunk.response as { model?: unknown } | undefined
                const model =
                  response && typeof response.model === 'string'
                    ? response.model
                    : request.model
                yield {
                  type: 'response.started',
                  provider: this.id,
                  model,
                }
                emittedStart = true
                continue
              }
              if (chunkType === 'response.output_text.delta') {
                const delta = typeof chunk.delta === 'string' ? chunk.delta : ''
                if (delta) {
                  if (!emittedStart) {
                    yield {
                      type: 'response.started',
                      provider: this.id,
                      model: request.model,
                    }
                    emittedStart = true
                  }
                  yield { type: 'content.delta', delta }
                }
                continue
              }
              if (chunkType === 'response.completed' || chunkType === 'response.incomplete') {
                if (!emittedStart) {
                  yield {
                    type: 'response.started',
                    provider: this.id,
                    model: request.model,
                  }
                  emittedStart = true
                }
                yield {
                  type: 'response.completed',
                  finishReason: chunkType === 'response.completed' ? 'stop' : 'unknown',
                }
                emittedCompleted = true
                continue
              }
              if (chunkType === 'error') {
                const message =
                  typeof chunk.message === 'string' && chunk.message.trim().length > 0
                    ? chunk.message
                    : 'Codex streaming error'
                throw {
                  status: codexResponse.status,
                  message,
                  headers: codexResponse.headers,
                }
              }
            }
          }
        }
        if (!emittedStart) {
          yield {
            type: 'response.started',
            provider: this.id,
            model: request.model,
          }
          emittedStart = true
        }
        if (!emittedCompleted) {
          yield {
            type: 'response.completed',
            finishReason: 'stop',
          }
        }
        return
      }

      const requestUrl = `${this.baseUrl}/chat/completions`
      const response = await this.fetchImpl(requestUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(toOpenAIRequestBody(request)),
        signal,
      })

      if (!response.ok) {
        const errorBody = await safeReadText(response)
        this.logger.warn('OpenAI request failed', { status: response.status })
        recordCount('provider.http_errors', 1, { provider: 'openai', status: String(response.status) })
        throw {
          status: response.status,
          message: errorBody || `OpenAI request failed with status ${response.status}`,
          headers: response.headers,
        }
      }

      const body = response.body
      if (!body) {
        throw new Error('OpenAI streaming response missing body')
      }

      this.logger.info('OpenAI streaming request started', { baseUrl: requestUrl })

      const state = createOpenAIStreamMapperState()
      const decoder = new TextDecoder()
      let pending = ''
      const reader = body.getReader()

      while (true) {
        const { value, done } = await reader.read()
        if (done) {
          break
        }
        if (!value) {
          continue
        }

        pending += decoder.decode(value, { stream: true })

        while (true) {
          const separatorIndex = pending.indexOf('\n\n')
          if (separatorIndex === -1) {
            break
          }

          const frame = pending.slice(0, separatorIndex)
          pending = pending.slice(separatorIndex + 2)

          const dataLines = frame
            .split('\n')
            .filter(line => line.startsWith('data:'))
            .map(line => line.slice('data:'.length).trim())

          for (const dataLine of dataLines) {
            if (!dataLine || dataLine === '[DONE]') {
              continue
            }

            const parsed = JSON.parse(dataLine) as OpenAIChatCompletionsStreamChunk
            const events = mapOpenAIChunkToNormalizedEvents(parsed, state, this.id)
            for (const event of events) {
              yield event
            }
          }
        }
      }
      this.logger.info('OpenAI streaming request completed', { model: request.model })
    } catch (error) {
      this.logger.error('OpenAI request errored', {
        message: error instanceof Error ? error.message : String(error),
      })
      throw this.normalizeError(error)
    }
  }

  normalizeError(error: unknown): NormalizedProviderError {
    return normalizeOpenAIError(error, this.id)
  }

  private async fetchCodexWithFallback(input: {
    headers: Record<string, string>
    body: string
    signal?: AbortSignal
  }): Promise<Response> {
    const endpoints = [CODEX_API_ENDPOINT, CODEX_API_FALLBACK_ENDPOINT]
    let lastError: unknown

    for (let index = 0; index < endpoints.length; index += 1) {
      const endpoint = endpoints[index]
      try {
        return await this.fetchImpl(endpoint, {
          method: 'POST',
          headers: input.headers,
          body: input.body,
          signal: input.signal,
        })
      } catch (error) {
        lastError = error
        const message = error instanceof Error ? error.message : String(error)
        this.logger.warn('Codex account-auth fetch failed', {
          endpoint,
          attempt: index + 1,
          message,
        })
      }
    }

    const cause = lastError instanceof Error ? lastError.message : String(lastError)
    throw new Error(
      `Codex account-auth request failed across endpoints: ${endpoints.join(', ')}; cause=${cause}`,
    )
  }

  private async refreshOpenAIAccessToken(refreshToken: string): Promise<{
    accessToken: string
    refreshToken: string
    expiresAt: number
  }> {
    const response = await this.fetchImpl(`${OPENAI_AUTH_ISSUER}/oauth/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: OPENAI_OAUTH_CLIENT_ID,
      }).toString(),
    })
    if (!response.ok) {
      const body = await safeReadText(response)
      throw new Error(
        `OpenAI account-auth refresh failed (HTTP ${response.status}${body ? `, body=${body.slice(0, 240)}` : ''}). Reconnect with /connect login openai --account.`,
      )
    }

    const payload = (await response.json()) as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
    }
    const nextAccessToken = payload.access_token?.trim()
    const nextRefreshToken = payload.refresh_token?.trim() || refreshToken
    if (!nextAccessToken) {
      throw new Error(
        'OpenAI account-auth refresh failed: missing access_token in refresh response.',
      )
    }
    return {
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
      expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
    }
  }

  private async refreshGoogleAccessToken(
    refreshToken: string,
    clientId?: string,
  ): Promise<{
    accessToken: string
    refreshToken: string
    expiresAt: number
  }> {
    const effectiveClientId = clientId?.trim()
    if (!effectiveClientId) {
      throw new Error(
        'Google account-auth refresh failed: missing client_id. Re-run /connect login google --account.',
      )
    }
    const response = await this.fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: effectiveClientId,
      }).toString(),
    })
    if (!response.ok) {
      const body = await safeReadText(response)
      throw new Error(
        `Google account-auth refresh failed (HTTP ${response.status}${body ? `, body=${body.slice(0, 240)}` : ''}). Reconnect with /connect login google --account.`,
      )
    }

    const payload = (await response.json()) as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
    }
    const nextAccessToken = payload.access_token?.trim()
    const nextRefreshToken = payload.refresh_token?.trim() || refreshToken
    if (!nextAccessToken) {
      throw new Error(
        'Google account-auth refresh failed: missing access_token in refresh response.',
      )
    }
    return {
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
      expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
    }
  }
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch (error) {
    console.warn(
      `Failed to read OpenAI error response body: ${error instanceof Error ? error.message : String(error)}`,
    )
    return ''
  }
}

function persistRefreshedAccountAuth(
  provider: ModelProviderConfig['provider'],
  accountAuth: NonNullable<ModelProviderConfig['accountAuth']>,
): void {
  const latest = readUserRuntimeConfigFile()
  const activeId = latest.activeProviderConnectionId?.trim()
  const updatedAt = new Date().toISOString()
  const nextConnections = (latest.providerConnections ?? []).map((connection) => {
    if (
      activeId &&
      connection.id === activeId &&
      connection.provider === provider &&
      connection.authType === 'account-auth'
    ) {
      return {
        ...connection,
        accountAuth: resolvePersistedAccountAuth(provider, accountAuth, connection.accountAuth),
        updatedAt,
      }
    }
    return connection
  })

  writeUserRuntimeConfigFile({
    ...latest,
    providerCredentials: {
      ...(latest.providerCredentials ?? {}),
      [provider]: {
        ...(latest.providerCredentials?.[provider] ?? {}),
        accountAuth: resolvePersistedAccountAuth(
          provider,
          accountAuth,
          latest.providerCredentials?.[provider]?.accountAuth,
        ),
      },
    },
    providerConnections: nextConnections,
  })
}

function resolvePersistedAccountAuth(
  provider: ModelProviderConfig['provider'],
  accountAuth: NonNullable<ModelProviderConfig['accountAuth']>,
  fallback: ProviderAccountAuthConfig | undefined,
): ProviderAccountAuthConfig | undefined {
  if (provider === 'openai' && accountAuth.type === 'openai-chatgpt-account') {
    return { openai: accountAuth }
  }
  if (provider === 'google' && accountAuth.type === 'google-gemini-account') {
    return { google: accountAuth }
  }
  return fallback
}
