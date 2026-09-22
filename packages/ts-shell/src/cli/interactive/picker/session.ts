import type { SessionManager } from "../../../session/SessionManager.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker, PickerOutcome } from "../overlay.js";
import { deriveSessionTitleFromPrompt } from "../../../session/lifecycle/sessionLifecycleStore.js";

/**
 * Session chooser for resuming.
 *
 * Each entry needs several rows — which session, how old, what it was about, how
 * it ended — so this is the one picker that earns the whole screen.
 */

const MAX_SESSIONS = 40;

export interface SessionPickerOptions {
  readonly sessionManager: SessionManager;
  /** Resume the chosen session; the host owns how that is executed. */
  readonly resume: (sessionId: string) => Promise<string | undefined>;
  /** Delete a session permanently, with confirmation handled by the host. */
  readonly delete?: (sessionId: string) => Promise<string | undefined>;
  /** Rename a session. */
  readonly rename?: (sessionId: string, title: string) => Promise<string | undefined>;
}

export function sessionPicker(options: SessionPickerOptions): Picker {
  return {
    title: "Resume session",
    form: "modal",
    empty: "No recoverable sessions for this project.",
    detailRows: 2,
    async load(): Promise<readonly Option[]> {
      return listSessions(options.sessionManager);
    },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      const sessionId = ids[0];
      if (!sessionId) return undefined;
      const note = await options.resume(sessionId);
      return note ? { note } : undefined;
    },
    onDelete: options.delete
      ? async (sessionId: string) => options.delete!(sessionId)
      : undefined,
    onRename: options.rename
      ? async (sessionId: string, title: string) => options.rename!(sessionId, title)
      : undefined,
  };
}

/** Recent sessions as options, newest first. */
function listSessions(sessionManager: SessionManager): readonly Option[] {
  const sessions = sessionManager.listRecentSessions(MAX_SESSIONS);
  return sessions.map<Option>((session) => {
    const firstMsg =
      session.turns?.find((t) => (t.role === "user" || t.role === "assistant") && t.content?.trim())?.content ||
      session.pendingPrompt;
    const label =
      session.title?.trim() ||
      (firstMsg ? deriveSessionTitleFromPrompt(firstMsg) : "") ||
      "New session";
    return {
      id: session.id,
      label,
      detail: describe(session),
      note: age(session),
    };
  });
}

interface SessionLike {
  readonly id: string;
  readonly title?: string;
  readonly status?: string;
  readonly turns?: readonly unknown[];
  readonly updatedAt?: number | string;
  readonly createdAt?: number | string;
}

/** Subject and outcome, the two facts that identify a session to a human. */
function describe(session: SessionLike): string {
  const parts: string[] = [];
  if (session.status) parts.push(session.status);
  const turns = session.turns?.length;
  if (turns !== undefined && turns > 0) parts.push(`${turns} turn${turns === 1 ? "" : "s"}`);
  parts.push(session.id.slice(0, 8));
  return parts.join(" · ") || "no recorded activity";
}

/** Relative age, which is what a user actually recognises a session by. */
function age(session: SessionLike): string | undefined {
  const stamp = session.updatedAt ?? session.createdAt;
  const at = typeof stamp === "string" ? Date.parse(stamp) : stamp;
  if (at === undefined || Number.isNaN(at)) return undefined;
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
