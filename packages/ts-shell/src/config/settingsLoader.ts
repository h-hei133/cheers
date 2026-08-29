import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseSettingsJson } from "./schema.js";
import {
  DEFAULT_AGENT_SETTINGS,
  type AgentSettings,
  type ModelSettings,
  type PermissionSettings,
  type SkillsSettings,
  type TuiSettings,
} from "./types.js";

export function getSettingsPaths(workspaceRoot: string): {
  readonly userPath: string;
  readonly projectPaths: readonly string[];
} {
  const homeDir = process.env.USERPROFILE || process.env.HOME || os.homedir();
  const userPath = path.join(homeDir, ".private-agents", "settings.json");
  const projectPaths = [
    path.join(workspaceRoot, ".agents", "settings.json"),
    path.join(workspaceRoot, "coding-agents.json"),
  ];
  return { userPath, projectPaths };
}

export function readSettingsFileSafely(filePath: string): Partial<AgentSettings> | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = parseSettingsJson(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Partial<AgentSettings>;
    }
  } catch (error) {
    console.warn(`[config] Warning: Failed to load settings from ${filePath}:`, error);
  }
  return undefined;
}

export function mergeModelSettings(
  base?: ModelSettings,
  override?: ModelSettings,
): ModelSettings | undefined {
  if (!base && !override) return undefined;
  return {
    ...base,
    ...override,
  };
}

export function mergeSkillsSettings(
  base?: SkillsSettings,
  override?: SkillsSettings,
): SkillsSettings | undefined {
  if (!base && !override) return undefined;
  return {
    ...base,
    ...override,
    enabled: override?.enabled ?? base?.enabled,
    disabled: override?.disabled ?? base?.disabled,
  };
}

export function mergePermissionSettings(
  base?: PermissionSettings,
  override?: PermissionSettings,
): PermissionSettings | undefined {
  if (!base && !override) return undefined;
  return {
    ...base,
    ...override,
    allowRules: override?.allowRules ?? base?.allowRules,
    denyRules: override?.denyRules ?? base?.denyRules,
  };
}

export function mergeTuiSettings(
  base?: TuiSettings,
  override?: TuiSettings,
): TuiSettings | undefined {
  if (!base && !override) return undefined;
  return {
    ...base,
    ...override,
  };
}

export function mergeAgentSettings(
  base: AgentSettings,
  override?: Partial<AgentSettings>,
): AgentSettings {
  if (!override) {
    return base;
  }

  return {
    version: 1,
    model: mergeModelSettings(base.model, override.model),
    mcpServers: {
      ...base.mcpServers,
      ...override.mcpServers,
    },
    skills: mergeSkillsSettings(base.skills, override.skills),
    permissions: mergePermissionSettings(base.permissions, override.permissions),
    tui: mergeTuiSettings(base.tui, override.tui),
  };
}

/**
 * Loads cascading settings resolved across 3 tiers:
 * CLI Overrides > Project Settings (.agents/settings.json) > User Global Settings (~/.private-agents/settings.json) > Defaults
 */
export function loadCascadingSettings(
  workspaceRoot: string = process.cwd(),
  cliOverrides?: Partial<AgentSettings>,
): AgentSettings {
  const paths = getSettingsPaths(workspaceRoot);

  // 1. Base defaults
  let merged = DEFAULT_AGENT_SETTINGS;

  // 2. User Global Settings
  const userSettings = readSettingsFileSafely(paths.userPath);
  if (userSettings) {
    merged = mergeAgentSettings(merged, userSettings);
  }

  // 3. Project Settings
  for (const projectPath of paths.projectPaths) {
    const projectSettings = readSettingsFileSafely(projectPath);
    if (projectSettings) {
      merged = mergeAgentSettings(merged, projectSettings);
      break; // Stop at highest priority project file found
    }
  }

  // 4. CLI Overrides
  if (cliOverrides) {
    merged = mergeAgentSettings(merged, cliOverrides);
  }

  return merged;
}
