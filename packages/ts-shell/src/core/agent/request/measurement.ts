/** Identity of one measured request, including its raw and outgoing histories. */
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
  /** Proven persisted prefix; tokens remain provider-reported. */
  readonly projection?: {
    readonly historyDigest: string;
    readonly wireHistoryDigest: string;
    readonly wireRewriteTokens: number;
    readonly removedTokens: number;
  };
}
