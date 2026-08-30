export type SubagentMemoryScope = "user" | "project" | "local";
export type SubagentIsolationMode = "worktree" | "none";
export type SubagentPermissionMode = "default" | "plan" | "auto" | "acceptEdits" | "bypassPermissions";

export interface SubagentDefinition {
  readonly name: string;
  readonly description: string;
  readonly systemPrompt: string;
  readonly tools?: readonly string[];
  readonly disallowedTools?: readonly string[];
  readonly model?: string;
  readonly permissionMode?: SubagentPermissionMode;
  readonly maxTurns?: number;
  readonly skills?: readonly string[];
  readonly isolation?: SubagentIsolationMode;
  readonly memory?: SubagentMemoryScope;
  readonly background?: boolean;
  readonly effort?: "low" | "medium" | "high" | "xhigh" | "max";
  readonly filePath?: string;
  readonly source: "project" | "user" | "builtin";
}
