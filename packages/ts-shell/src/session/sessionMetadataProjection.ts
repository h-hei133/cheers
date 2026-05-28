export {
  projectSessionMetadata,
  type SessionMetadata,
} from "./schema/sessionMetadataCodec.js";

export interface CurrentSessionMetadata {
  readonly sessionId: string;
  readonly updatedAt: string;
}

export function projectCurrentSessionMetadata(input: {
  readonly sessionId: string;
  readonly updatedAt: string;
}): CurrentSessionMetadata {
  return {
    sessionId: input.sessionId,
    updatedAt: input.updatedAt,
  };
}
