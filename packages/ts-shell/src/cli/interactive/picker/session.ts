import { messageToText } from "../../../model-adapters/multimodal.js";
import type { SessionManager } from "../../../session/SessionManager.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker, PickerOutcome } from "../overlay.js";
import { deriveSessionTitleFromPrompt } from "../../../session/lifecycle/sessionLifecycleStore.js";
import { sessionChoices, sessionSelectionBlock, type SessionSelectionContext } from '../../../session/navigation/selection.js';
import type { SessionFileSize } from '../../../session/store/files.js';
import { sessionSizeLabel } from '../../../session/presentation/size.js';

/**
 * Session chooser for resuming.
 *
 * Each entry needs several rows — which session, how old, what it was about, how
 * it ended — so this is the one picker that earns the whole screen.
 */

const MAX_SESSIONS = 40;

export interface SessionPickerOptions {
  readonly sessionManager: SessionManager;
  readonly context: () => SessionSelectionContext;
  /** Resume the chosen session; the host owns how that is executed. */
  readonly resume: (sessionId: string) => Promise<string | undefined>;
  /** Delete a session permanently, with confirmation handled by the host. */
  readonly delete?: (sessionId: string) => Promise<string | undefined>;
  /** Rename a session. */
  readonly rename?: (sessionId: string, title: string) => Promise<string | undefined>;
}

export function sessionPicker(options: SessionPickerOptions): Picker {
  let expected = { ...options.context() };
  let currentUnavailable: string | undefined;
  let offered = new Set<string>();
  const blocked = (id: string, action: 'resume' | 'rename' | 'delete'): string | undefined => {
    if (!offered.has(id)) return 'This session was not offered. Reopen the session picker.';
    return sessionSelectionBlock({ expected, current: options.context(), target: options.sessionManager.getSession(id), targetId: id, action });
  };
  return {
    title: "Resume session",
    form: "modal",
    empty: "No recoverable sessions for this project.",
    loadError: 'Saved sessions could not be loaded.',
    footer: 'Session files: logical size; excludes attachments.',
    get initialSelection() { return expected.sessionId; },
    status: visible => currentUnavailable ?? (visible.some(option => option.id === expected.sessionId)
      ? undefined : 'Current session is hidden by the filter.'),
    detailRows: 2,
    async load(signal): Promise<readonly Option[]> {
      signal?.throwIfAborted();
      const context = { ...options.context() };
      const selected = sessionChoices(options.sessionManager.listSessions(), context, MAX_SESSIONS);
      const sizes = await options.sessionManager.files.sizes(selected.sessions.map(session => session.id), signal);
      signal?.throwIfAborted();
      expected = context;
      currentUnavailable = selected.currentUnavailable;
      offered = new Set(selected.sessions.map(session => session.id));
      return selected.sessions.map(session => sessionOption(session, context.sessionId, sizes.get(session.id)));
    },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      const sessionId = ids[0];
      if (!sessionId) return undefined;
      const block = blocked(sessionId, 'resume');
      if (block) return { note: block };
      const note = await options.resume(sessionId);
      return note ? { note } : undefined;
    },
    onDelete: options.delete
      ? async (sessionId: string) => blocked(sessionId, 'delete') ?? options.delete!(sessionId)
      : undefined,
    onRename: options.rename
      ? async (sessionId: string, title: string) => blocked(sessionId, 'rename') ?? options.rename!(sessionId, title)
      : undefined,
  };
}

/** Recent sessions as options, newest first. */
function sessionOption(session: ReturnType<SessionManager['listSessions']>[number], currentId: string, size: SessionFileSize | undefined): Option {
  const firstMsg =
    session.turns?.find(
      (t) => (t.role === "user" || t.role === "assistant") && messageToText(t.content).trim(),
    )?.content ||
    session.pendingPrompt;
  const label =
    session.title?.trim() ||
    (firstMsg ? deriveSessionTitleFromPrompt(messageToText(firstMsg)) : "") ||
    "New session";
  return {
    id: session.id,
    label,
    detail: describe(session, size),
    note: [session.id === currentId ? 'current' : undefined, age(session)].filter(Boolean).join(' · '),
  };
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
function describe(session: SessionLike, size: SessionFileSize | undefined): string {
  const parts: string[] = [];
  if (session.status) parts.push(session.status);
  parts.push(sessionSizeLabel(size));
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
