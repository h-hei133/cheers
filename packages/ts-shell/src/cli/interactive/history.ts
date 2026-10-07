import { messageToText } from "../../model-adapters/multimodal.js";
import { replayTodosFromMessages } from "../../core/commands/todoCommandRuntime.js";
import { splitFencedDiff, textBlock, type Block } from "../../presentation/tui/transcript/blocks.js";
import { summarize } from "./toolCards.js";
import type { SessionMessage } from "../../session/schema/sessionMessage.js";
import type { Session } from "../../session/schema/sessionRecord.js";
import type { WorkspaceRootMode } from "../../session/SessionManager.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { Transcript } from "../../presentation/tui/transcript/container.js";
import { startNewSession } from "../runtime/session.js";
import type { SessionReport } from '../../session/reports/model.js';

/**
 * Putting a session's conversation back on screen.
 *
 * Opening a past session and seeing an empty transcript is the same as not having
 * opened it: the whole point of returning is the conversation. The stored turns are
 * the record, so they are what the transcript is rebuilt from.
 *
 * Reconstructs user prose, tool execution cards with their arguments and outputs,
 * and assistant responses so resuming a session restores full context.
 */

/** Rows are cheap; a very long history still needs a bound. */
const MAX_RESTORED = 60;

export interface RestoredHistory {
  readonly blocks: readonly Block[];
  /** Turns left out because the history was longer than the bound. */
  readonly omitted: number;
}

/** Blocks for a session's conversation, oldest first, bounded. */
export function restoreConversation(turns: readonly SessionMessage[], reports: readonly SessionReport[] = []): RestoredHistory {
  const blocks: Block[] = [];
  const reportGroups = groupReports(turns, reports);
  blocks.push(...(reportGroups.get(undefined) ?? []));
  const toolBlocksById = new Map<string, Block>();
  const respondedToolIds = new Set<string>();
  for (const turn of turns) {
    if (turn.role === "user") {
      const content = messageToText(turn.content).trim();
      if (content) {
        blocks.push(textBlock("user", content));
      }
    } else if (turn.role === "assistant") {
      const content = messageToText(turn.content).trim();
      if (content) {
        blocks.push(textBlock("assistant", content));
      }
      if (turn.tool_calls && turn.tool_calls.length > 0) {
        for (const call of turn.tool_calls) {
          let args: Record<string, unknown> | undefined;
          try {
            args = JSON.parse(call.function.arguments);
          } catch {
            // Ignore malformed tool arguments
          }
          const detail = summarize(call.function.name, args);
          const toolBlock: Block = {
            kind: "tool",
            title: call.function.name,
            ...(detail ? { detail } : {}),
            text: "",
            status: "ok",
            collapsed: true,
            finalized: true,
          };
          toolBlocksById.set(call.id, toolBlock);
          blocks.push(toolBlock);
        }
      }
    } else if (turn.role === "tool") {
      if (turn.tool_call_id) {
        respondedToolIds.add(turn.tool_call_id);
        const toolBlock = toolBlocksById.get(turn.tool_call_id);
        if (toolBlock) {
          const body = messageToText(turn.content).replace(/\s+$/, "");
          // These blocks are being composed, not yet in a transcript, so no
          // cache holds their rows; the direct write is the correct form here.
          toolBlock.text = body;
          splitFencedDiff(toolBlock);
          if (/^(\(Operation cancelled|Blocked\b|Tool execution error:|Tool '[^']+' is not available|Error\b)/i.test(body)) {
            toolBlock.status = "failed";
            toolBlock.collapsed = false;
          }
        }
      }
    }
    if (turn.id) blocks.push(...(reportGroups.get(turn.id) ?? []));
  }

  for (const [callId, toolBlock] of toolBlocksById) {
    if (!respondedToolIds.has(callId)) {
      toolBlock.status = "failed";
      toolBlock.text = "(Operation interrupted)";
      toolBlock.collapsed = false;
    }
  }

  const kept = blocks.slice(Math.max(0, blocks.length - MAX_RESTORED));
  return { blocks: kept, omitted: blocks.length - kept.length };
}
export interface HistoryTarget {
  readonly transcript: Transcript;
  readonly editor?: {
    loadHistory(entries: readonly string[]): void;
  };
  readonly sessionManager: {
    getSession(sessionId: string): Session | undefined;
    createNew(
      projectRoot: string,
      options?: {
        readonly rootMode?: WorkspaceRootMode;
        readonly requestedWorkspaceRoot?: string;
        readonly targetPathBase?: string;
        readonly gitRoot?: string | null;
      },
    ): Session;
    discardIfEmpty(sessionId: string): boolean;
  };
  readonly context: ShellRuntimeContext;
}

/**
 * Put the current session's conversation on screen, replacing whatever is there.
 *
 * Called after a session is opened, which is the only moment the two can disagree:
 * the runtime context has switched but the transcript still shows the session that
 * was left behind.
 */
export function showConversation(target: HistoryTarget, snapshot?: Session): void {
  const session = snapshot ?? target.sessionManager.getSession(target.context.session.id);
  if (!session) return;
  target.transcript.clear();
  appendConversation(target, session);
}

/** Startup keeps its welcome and diagnostics while using the same history projection. */
export function appendConversation(target: Pick<HistoryTarget, 'transcript' | 'editor'>, session: Session): void {
  // The checklist belongs to the session being shown, and switching to a
  // session is the moment to say so. Doing it here rather than at each command
  // that can switch is what makes `/resume`, the sessions panel, a fork, and a
  // rewind all correct: they establish a session by calling this, and a session
  // that is being shown is a session whose checklist has just been restored.
  replayTodosFromMessages(session.id, session.turns);
  const restored = restoreConversation(session.turns, session.reports);
  if (restored.omitted > 0) {
    target.transcript.append(
      textBlock("notice", `${restored.omitted} earlier messages are not shown.`),
    );
  }
  for (const block of restored.blocks) target.transcript.append(block);
  target.transcript.finalizeAll();
  const userPrompts = session.turns
    .filter((turn) => turn.role === "user" && messageToText(turn.content).trim().length > 0)
    .map((turn) => messageToText(turn.content).trim());
  target.editor?.loadHistory(userPrompts);
}

/**
 * Start over: a new session, and an empty transcript.
 *
 * The session being left is discarded when nothing was said in it, so clearing an
 * untouched session leaves nothing behind rather than an empty stub in the
 * re-entry list.
 */
export function startFreshSession(target: HistoryTarget): void {
  startNewSession(target.context, target.sessionManager);
  target.transcript.clear();
}

/** Older retained observations precede the visible turns; messages keep their own order. */
function groupReports(turns: readonly SessionMessage[], reports: readonly SessionReport[]): Map<string | undefined, Block[]> {
  const visible = new Set(turns.map(turn => turn.id));
  const groups = new Map<string | undefined, Block[]>();
  for (const saved of reports) {
    const anchor = visible.has(saved.sourceEntryId) ? saved.sourceEntryId : undefined;
    const title = `Saved report · ${saved.timestamp}`;
    const block = { ...textBlock('command', saved.text, title), ...(saved.report ? { report: saved.report } : {}) };
    const list = groups.get(anchor) ?? [];
    list.push(block); groups.set(anchor, list);
  }
  return groups;
}
