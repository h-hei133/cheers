import { defaultTheme } from "../../theme/theme.js";
import { formatTokens } from "../transcript/live.js";

/**
 * Status item vocabulary.
 *
 * The band shows what the user chose, and can only offer items with a real
 * source — every value here is read from runtime state or recorded provider
 * usage. An item whose source is unavailable renders nothing rather than a
 * placeholder, so an unconfigured session shows a shorter band instead of a band
 * full of zeroes and dashes.
 */

export type StatusItemId =
  | "model"
  | "provider"
  | "branch"
  | "directory"
  | "context"
  | "session-tokens"
  | "cost"
  | "turns"
  | "agent-mode"
  | "session"
  | "todos";

export interface StatusFacts {
  readonly model: string;
  readonly provider: string;
  readonly branch?: string;
  readonly directory?: string;
  readonly contextUsed?: number;
  readonly contextWindow?: number;
  readonly sessionTokens?: number;
  readonly costUsd?: number;
  readonly turns?: number;
  readonly agentMode?: string;
  readonly sessionId?: string;
  readonly openTodos?: number;
}

export interface StatusItem {
  readonly id: StatusItemId;
  readonly label: string;
  readonly describe: string;
}

/** Every offerable item, in the order a picker should present them. */
export const STATUS_ITEMS: readonly StatusItem[] = [
  { id: "model", label: "model", describe: "active model name" },
  { id: "provider", label: "provider", describe: "active provider" },
  { id: "agent-mode", label: "mode", describe: "plan or build" },
  { id: "branch", label: "branch", describe: "current git branch" },
  { id: "directory", label: "directory", describe: "project root, home-relative" },
  { id: "context", label: "context", describe: "context window used, as tokens and percent" },
  { id: "session-tokens", label: "tokens", describe: "total tokens this session" },
  { id: "cost", label: "cost", describe: "estimated session spend" },
  { id: "turns", label: "turns", describe: "turns completed this session" },
  { id: "todos", label: "todos", describe: "open todo entries" },
  { id: "session", label: "session", describe: "short session id, for /resume" },
];

/** Items shown when the user has not chosen. */
export const DEFAULT_STATUS_ITEMS: readonly StatusItemId[] = [
  "model",
  "agent-mode",
  "branch",
  "context",
  "directory",
];

const CONTEXT_TIERS = [
  { at: 90, token: "error" as const },
  { at: 70, token: "warning" as const },
  { at: 50, token: "accent" as const },
];

/** One item's rendered text, or undefined when its source has nothing to say. */
export function renderStatusItem(id: StatusItemId, facts: StatusFacts): string | undefined {
  switch (id) {
    case "model":
      return defaultTheme.fg("accent", facts.model);
    case "provider":
      return defaultTheme.dim(facts.provider);
    case "agent-mode":
      // The default mode is not worth a segment; a non-default one always is.
      return facts.agentMode && facts.agentMode !== "build"
        ? defaultTheme.fg("warning", facts.agentMode)
        : undefined;
    case "branch":
      return facts.branch ? defaultTheme.fg("success", facts.branch) : undefined;
    case "directory":
      return facts.directory ? defaultTheme.dim(facts.directory) : undefined;
    case "context":
      return renderContext(facts);
    case "session-tokens":
      return facts.sessionTokens ? defaultTheme.dim(`${formatTokens(facts.sessionTokens)} tok`) : undefined;
    case "cost":
      return facts.costUsd && facts.costUsd > 0 ? defaultTheme.dim(`$${facts.costUsd.toFixed(4)}`) : undefined;
    case "turns":
      return facts.turns ? defaultTheme.dim(`${facts.turns} turn${facts.turns === 1 ? "" : "s"}`) : undefined;
    case "todos":
      return facts.openTodos ? defaultTheme.fg("warning", `${facts.openTodos} todo`) : undefined;
    default:
      return facts.sessionId ? defaultTheme.dim(shortSession(facts.sessionId)) : undefined;
  }
}

/** Context gauge, coloured by how close the window is to full. */
function renderContext(facts: StatusFacts): string | undefined {
  if (facts.contextUsed === undefined || !facts.contextWindow) return undefined;
  const percent = Math.min(100, Math.round((facts.contextUsed / facts.contextWindow) * 100));
  const text = `${formatTokens(facts.contextUsed)}/${formatTokens(facts.contextWindow)} ${percent}%`;
  const tier = CONTEXT_TIERS.find((entry) => percent >= entry.at);
  return tier ? defaultTheme.fg(tier.token, text) : defaultTheme.dim(text);
}

/** The distinctive tail of a session id, which is what /resume accepts. */
function shortSession(sessionId: string): string {
  const parts = sessionId.split("_");
  return parts.length > 1 ? parts[1]!.slice(0, 8) : sessionId.slice(0, 8);
}

/** Ids that name a real item, in canonical order, or the default set. */
export function normalizeStatusItems(ids: readonly string[] | undefined): readonly StatusItemId[] {
  if (!ids || ids.length === 0) return DEFAULT_STATUS_ITEMS;
  const wanted = new Set(ids);
  const chosen = STATUS_ITEMS.filter((item) => wanted.has(item.id)).map((item) => item.id);
  return chosen.length > 0 ? chosen : DEFAULT_STATUS_ITEMS;
}
