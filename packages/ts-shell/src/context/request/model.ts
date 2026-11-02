export interface TextSize {
  readonly bytes: number;
  readonly codeUnits: number;
}

export type PromptCountMethod = 'characters/3.5' | 'cl100k_base' | 'o200k_base';

export interface PromptMeasurementIdentity {
  readonly provider: string;
  readonly model: string;
  readonly endpoint?: string;
  /** Opaque identity of the actual destination, independent of protocol name. */
  readonly endpointId?: string;
  /** Serialized tool schema and assembled system text, hashed. */
  readonly schemaDigest?: string;
  readonly systemDigest?: string;
  /** Ordered, selected messages before endpoint projection, hashed. */
  readonly historyDigest?: string;
  /** Ordered messages after compaction, bridging and closing policy, hashed. */
  readonly wireHistoryDigest?: string;
  /** How many projected messages carried this measurement. */
  readonly wireMessageCount?: number;
  /** Estimated text tokens removed from the raw source in this request only. */
  readonly wireRewriteTokens?: number;
  /** Credential and account state that selected the provider replay shape. */
  readonly replayBinding?: string;
}

/** Provider measurement of the request that produced one assistant message. */
export interface PromptMeasurement {
  readonly tokens: number;
  readonly messageCount: number;
  readonly identity: PromptMeasurementIdentity;
  /** Proven persisted prefix after removing transient opening context; tokens remain provider-reported. */
  readonly projection?: {
    readonly historyDigest: string;
    readonly wireHistoryDigest: string;
    readonly wireRewriteTokens: number;
    readonly removedTokens: number;
  };
}

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
