export interface TextSize {
  readonly bytes: number;
  readonly codeUnits: number;
}

export type PromptCountMethod = 'characters/3.5' | 'cl100k_base' | 'o200k_base';

export interface PromptSource extends TextSize {
  readonly kind: 'base' | 'instructions' | 'appended' | 'skills' | 'separators';
}

/** The protocol declares field ownership; unknown protocols retain only the total. */
export interface ContextFields {
  readonly conversation: string;
  readonly system?: string;
  readonly tools?: string;
  readonly firstMessageIsSystem?: boolean;
}

export interface RequestContext {
  readonly provider: string;
  readonly model: string;
  readonly endpoint: string;
  readonly capturedAt: string;
  readonly body: TextSize;
  /** Serialized value fragments; envelope includes keys, separators and other settings. */
  readonly parts?: Readonly<Record<'system' | 'conversation' | 'tools' | 'envelope', TextSize>>;
  /** Raw assembled system text before protocol serialization; not additive to body bytes. */
  readonly systemSources?: readonly PromptSource[];
  /** Local count of the serialized request body, never a provider measurement. */
  readonly localEstimate?: {
    readonly tokens: number;
    readonly method: PromptCountMethod;
    readonly scope: 'assembled-request';
    readonly image?: {
      readonly count: number;
      readonly allowanceTokens: number;
    };
  };
  readonly promptTokens?: number;
}
