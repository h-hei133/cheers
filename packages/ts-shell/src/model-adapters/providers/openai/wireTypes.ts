export interface OpenAIChatCompletionsStreamChunk {
  readonly id?: string
  readonly object?: string
  readonly model?: string
  readonly choices?: readonly OpenAIChoice[]
  readonly usage?: {
    readonly prompt_tokens?: number
    readonly completion_tokens?: number
    readonly total_tokens?: number
  }
}

export interface OpenAIChoice {
  readonly index?: number
  readonly finish_reason?: string | null
  readonly delta?: OpenAIDelta
}

export interface OpenAIDelta {
  readonly role?: string
  readonly content?: string | null
  readonly tool_calls?: readonly OpenAIToolCallDelta[]
}

export interface OpenAIToolCallDelta {
  readonly index?: number
  readonly id?: string
  readonly type?: 'function'
  readonly function?: {
    readonly name?: string
    readonly arguments?: string
  }
}
