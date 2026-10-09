export type SubagentMemoryScope = "user" | "project" | "local";
export type SubagentIsolationMode = "worktree" | "none";
export type SubagentPermissionMode = "default" | "plan" | "auto" | "acceptEdits" | "bypassPermissions";

export interface ReadOnlyDelegation {
  readonly tools: readonly string[];
  readonly network: boolean;
  readonly maxSteps: number;
}

export interface SubagentDefinition {
  readonly name: string;
  readonly description: string;
  readonly systemPrompt: string;
  readonly tools?: readonly string[];
  readonly disallowedTools?: readonly string[];
  readonly model?: string;
  readonly effort?: import('../models/effort.js').ThinkingPreference;
  readonly enabled?: boolean;
  /** Current discovered bytes and filesystem identity; never supplied by prompt text. */
  readonly identity?: string;
  readonly permissionMode?: SubagentPermissionMode;
  readonly maxTurns?: number;
  readonly isolation?: SubagentIsolationMode;
  readonly memory?: SubagentMemoryScope;
  readonly filePath?: string;
  readonly source: "project" | "user" | "builtin";
}
