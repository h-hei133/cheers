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

/**
 * What the interactive surface lets the user choose.
 *
 * One setting, deliberately. There were five: a render `mode`, a
 * `resizeScrollback` policy, `showThinking`, and a `theme` — none of which was
 * read anywhere. A knob that does nothing is worse than no knob, because it is a
 * promise the interface does not keep, and a long list of them is a configuration
 * screen instead of a working default.
 *
 * The rest is decided rather than asked: the session takes a screen of its own,
 * reasoning is shown in a block that folds, and the theme follows the terminal.
 */
export interface TuiSettings {
  /** Status band item ids, in canonical order. Empty or absent means the defaults. */
  readonly statusItems?: readonly string[];
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
  tui: {},
};
