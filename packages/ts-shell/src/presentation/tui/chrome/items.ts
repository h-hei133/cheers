import { contextPressure } from '../../../core/models/pressure.js';
import { defaultTheme } from "../../theme/theme.js";
import { formatTokens } from "../transcript/live.js";
import type { WindowSource } from '../../../core/models/window.js';

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
  | "permission-scope"
  | "session"
  | "todos"
  | "queued"
  | "peers"
  | "worktree";

export interface StatusFacts {
  readonly model: string;
  readonly provider: string;
  readonly branch?: string;
  readonly directory?: string;
  readonly contextUsed?: number;
  readonly contextWindow?: number;
  readonly contextWindowSource?: WindowSource;
  readonly contextWarning?: string;
  readonly sessionTokens?: number;
  /** Estimate for recorded usage, never a claim of complete billing. */
  readonly costUsd?: number;
  readonly costRates?: 'catalog' | 'assumed';
  readonly turns?: number;
  readonly agentMode?: string;
  /** How much the session may do before it has to ask. */
  readonly permissionScope?: string;
  readonly sessionId?: string;
  readonly openTodos?: number;
  /** Submissions waiting behind the running turn. */
  readonly queued?: number;
  /** Other live sessions reachable for cross-session messaging. */
  readonly peers?: number;
  /** Whether the working tree has uncommitted changes. */
  readonly worktreeDirty?: boolean;
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
  { id: "permission-scope", label: "permissions", describe: "how much a turn may do without asking" },
  { id: "branch", label: "branch", describe: "current git branch" },
  { id: "directory", label: "directory", describe: "project root, home-relative" },
  { id: "context", label: "context", describe: "last reported prompt and window; /context explains sources and warnings" },
  { id: "session-tokens", label: "tokens", describe: "recorded tokens this session" },
  { id: "cost", label: "cost", describe: "estimated spend from recorded usage; /cost explains rates" },
  { id: "turns", label: "turns", describe: "turns completed this session" },
  { id: "todos", label: "todos", describe: "open todo entries" },
  { id: "worktree", label: "worktree", describe: "whether the working tree is dirty" },
  { id: "queued", label: "queued", describe: "submissions waiting behind the running turn" },
  { id: "peers", label: "peers", describe: "other live sessions you can message" },
  { id: "session", label: "session", describe: "short session id, for /resume" },
];

/** Items shown when the user has not chosen. */
export const DEFAULT_STATUS_ITEMS: readonly StatusItemId[] = [
  "model",
  "agent-mode",
  "permission-scope",
  "branch",
  "context",
  "directory",
];

/** One item's rendered text, or undefined when its source has nothing to say. */
export function renderStatusItem(id: StatusItemId, facts: StatusFacts): string | undefined {
  switch (id) {
    case "model":
      return defaultTheme.fg("statusLineModel", facts.model);
    case "provider":
      return defaultTheme.dim(facts.provider);
    case "agent-mode":
      // Always shown: Shift+Tab toggles this, and a toggle whose state is
      // invisible half the time is a toggle nobody trusts.
      if (!facts.agentMode) return undefined;
      return facts.agentMode === "plan"
        ? defaultTheme.fg("warning", facts.agentMode)
        : defaultTheme.dim(facts.agentMode);
    case "permission-scope":
      // Widening what a turn may do without asking is the one state a user must
      // never be unsure of, so it is coloured by how much it gives away.
      if (!facts.permissionScope) return undefined;
      if (facts.permissionScope === "allow-all") {
        return defaultTheme.fg("error", facts.permissionScope);
      }
      return facts.permissionScope === "accept-edits"
        ? defaultTheme.fg("warning", facts.permissionScope)
        : defaultTheme.dim(facts.permissionScope);
    case "branch":
      return facts.branch ? defaultTheme.fg(facts.worktreeDirty === undefined ? "dim" : facts.worktreeDirty ? "statusLineGitDirty" : "statusLineGitClean", facts.branch) : undefined;
    case "worktree":
      if (facts.worktreeDirty === undefined) return undefined;
      return facts.worktreeDirty
        ? defaultTheme.fg("statusLineGitDirty", "uncommitted")
        : defaultTheme.fg("statusLineGitClean", "clean");
    case "queued":
      return facts.queued ? defaultTheme.fg("accent", `${facts.queued} queued`) : undefined;
    case "peers":
      return facts.peers ? defaultTheme.dim(`${facts.peers} peers`) : undefined;
    case "directory":
      return facts.directory ? defaultTheme.fg("statusLinePath", facts.directory) : undefined;
    case "context":
      return renderContext(facts);
    case "session-tokens":
      return facts.sessionTokens ? defaultTheme.dim(`${formatTokens(facts.sessionTokens)} tok`) : undefined;
    case "cost":
      return facts.costUsd !== undefined ? defaultTheme.dim(`est $${facts.costUsd.toFixed(4)}${facts.costRates === 'assumed' ? ' assumed rates' : ''}`) : undefined;
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
  if (!facts.contextWindow) return undefined;
  const source = facts.contextWindowSource === 'default' ? ' assumed' : facts.contextWindowSource === 'config' ? ' config' : '';
  const warning = facts.contextWarning && facts.contextWindowSource !== 'default' ? ' ! /context' : '';
  const window = `${formatTokens(facts.contextWindow)}${source}${warning}`;
  if (facts.contextUsed === undefined) return defaultTheme.fg('statusLineContext', `?/${window}`);
  const percent = Math.min(100, Math.round((facts.contextUsed / facts.contextWindow) * 100));
  const text = `${formatTokens(facts.contextUsed)}/${window} ${percent}%`;
  const token = { normal: 'statusLineContext', elevated: 'accent', high: 'warning', critical: 'error' } as const;
  return defaultTheme.fg(token[contextPressure(facts.contextUsed, facts.contextWindow)], text);
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
