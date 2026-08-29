import type { RuntimeProvider } from "./runtimeConfig.js";
import type { McpServerConfig } from "../core/mcp/types.js";
import type { PermissionBehavior } from "../core/shell/approval/types.js";

export type ThinkingBudgetTier = "minimal" | "low" | "medium" | "high";

export interface ModelSettings {
  readonly provider?: RuntimeProvider;
  readonly model?: string;
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly thinkingBudget?: ThinkingBudgetTier;
  readonly maxTurns?: number;
}

export interface SkillsSettings {
  readonly directory?: string;
  readonly enabled?: readonly string[];
  readonly disabled?: readonly string[];
  readonly autoReload?: boolean;
}

export interface PermissionSettings {
  readonly mode?: "default" | "dontAsk" | "acceptEdits" | "bypassPermissions" | "plan";
  readonly defaultBehavior?: PermissionBehavior;
  readonly allowReadOnlyTools?: boolean;
  readonly allowRules?: readonly string[];
  readonly denyRules?: readonly string[];
}

export interface TuiSettings {
  readonly mode?: "differential" | "plain";
  readonly altScreen?: boolean;
  readonly showThinking?: boolean;
  readonly theme?: "dark" | "light";
}

export interface AgentSettings {
  readonly version: 1;
  readonly model?: ModelSettings;
  readonly mcpServers?: Readonly<Record<string, McpServerConfig>>;
  readonly skills?: SkillsSettings;
  readonly permissions?: PermissionSettings;
  readonly tui?: TuiSettings;
}

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  version: 1,
  model: {
    provider: "openai-compatible",
    model: "deepseek-ai/DeepSeek-V3",
    thinkingBudget: "medium",
    maxTurns: 30,
  },
  mcpServers: {},
  skills: {
    directory: ".codex/skills",
    enabled: ["*"],
    disabled: [],
    autoReload: true,
  },
  permissions: {
    mode: "default",
    defaultBehavior: "ask",
    allowReadOnlyTools: true,
    allowRules: ["read:*", "glob:*", "grep:*", "bash:git status*", "bash:git diff*"],
    denyRules: [],
  },
  tui: {
    mode: "differential",
    altScreen: true,
    showThinking: true,
    theme: "dark",
  },
};
