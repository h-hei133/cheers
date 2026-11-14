import type { JsonValue } from '../../values/data.js';

/** Inert tool definitions retained in history, without executable tool behavior. */
export interface DeclaredTool {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description?: string;
    readonly parameters: Record<string, JsonValue>;
  };
}

/** A captured request loadout; the message owns its position, ID and timestamp. */
export interface RequestDeclaration {
  readonly version: 1;
  readonly target: {
    readonly provider: string;
    readonly model: string;
    readonly endpoint: string;
    readonly replayBinding: string;
  };
  readonly tools: readonly DeclaredTool[];
  /** The effective provider-mapped effort; omission leaves the provider default. */
  readonly effort?: string;
}
