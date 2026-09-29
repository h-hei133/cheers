import type { CommandContext, LocalCommandResult } from "./types.js";
import type { SessionMessage } from "../../session/schema/sessionMessage.js";

export interface TodoItem {
  id: number;
  text: string;
  status: "pending" | "in_progress" | "done";
}

/**
 * The list each session sees, keyed by session id.
 *
 * Replacing one process-wide list with a map is what lets two live sessions
 * hold different checklists — the previous single list answered whichever
 * session asked last, which is fine for one and wrong for two.
 */
const listsBySession = new Map<string, { readonly items: TodoItem[]; nextId: number }>();

/**
 * This session's list.
 *
 * Absent session id means no session is active, and the answer is an empty list
 * rather than a throw: the status band reads this on every frame, and a reader
 * that cannot ask for one yet has nothing to show and no error worth raising.
 */
export function getSessionTodos(sessionId?: string): readonly TodoItem[] {
  if (!sessionId) return [];
  return listsBySession.get(sessionId)?.items ?? [];
}

/** Replace the list a session sees. Used by the replay that restores one. */
export function setSessionTodos(sessionId: string, items: readonly TodoItem[]): void {
  const nextId = items.reduce((highest, item) => Math.max(highest, item.id), 0) + 1;
  listsBySession.set(sessionId, { items: [...items], nextId });
}

/** The list a command mutates, created on first use. */
function sessionList(sessionId: string | undefined): { items: TodoItem[]; nextId: number } {
  if (!sessionId) {
    // A session id that is absent cannot be keyed, so the list would be shared
    // with every other id-less caller. An empty throwaway keeps the command
    // usable — a scripted probe, say — without letting it write anywhere real.
    return { items: [], nextId: 1 };
  }
  const existing = listsBySession.get(sessionId);
  if (existing) return existing;
  const created = { items: [] as TodoItem[], nextId: 1 };
  listsBySession.set(sessionId, created);
  return created;
}

/**
 * /todo (aliases: /tasks, /checklist)
 * Structured task list management for transparent step-by-step task tracking.
 */
export async function runTodoCommand(
  args: string[],
  _context: CommandContext,
  sessionId?: string,
): Promise<LocalCommandResult> {
  const sessionTodoList = getSessionTodos(sessionId);
  if (args.length === 0) {
    if (sessionTodoList.length === 0) {
      return {
        kind: "local",
        output: "No tasks currently on the todo list.\nUsage: /todo add <task> | /todo start <id> | /todo done <id> | /todo clear",
      };
    }

    const lines: string[] = ["# Session Task Checklist (/todo)", ""];
    const doneCount = sessionTodoList.filter((t) => t.status === "done").length;
    const progressPercent = Math.round((doneCount / sessionTodoList.length) * 100);

    lines.push(`Progress: **${doneCount}/${sessionTodoList.length}** (${progressPercent}%)\n`);

    sessionTodoList.forEach((item) => {
      let icon = "[ ]";
      if (item.status === "done") icon = "[X]";
      if (item.status === "in_progress") icon = "[>]";
      lines.push(`${icon} **#${item.id}**: ${item.text} *(${item.status})*`);
    });

    return {
      kind: "local",
      output: lines.join("\n"),
    };
  }

  const firstArg = args[0]?.toLowerCase();
  if (firstArg === "clear" && args.length === 1) {
    if (sessionId) setSessionTodos(sessionId, []);
    return {
      kind: "local",
      output: "Todo checklist cleared.",
    };
  }
  if (firstArg === "add") {
    const text = args.slice(1).join(" ").trim();
    if (!text) {
      return { kind: "local", output: "Usage: /todo add <task description>" };
    }
    const list = sessionList(sessionId);
    const item: TodoItem = {
      id: list.nextId++,
      text,
      status: "pending",
    };
    list.items.push(item);
    return {
      kind: "local",
      output: `Task added: **#${item.id}** "${text}"`,
    };
  }

  if (firstArg === "done" || firstArg === "complete") {
    const targetId = parseInt(args[1], 10);
    if (isNaN(targetId)) {
      return { kind: "local", output: "Usage: /todo done <id> (e.g. /todo done 1)" };
    }
    const item = sessionTodoList.find((t) => t.id === targetId);
    if (!item) {
      return { kind: "local", output: `Task #${targetId} not found.` };
    }
    item.status = "done";
    return {
      kind: "local",
      output: `Task marked done: **#${item.id}** "${item.text}"`,
    };
  }

  if (firstArg === "start") {
    const targetId = parseInt(args[1], 10);
    if (isNaN(targetId)) {
      return { kind: "local", output: "Usage: /todo start <id> (e.g. /todo start 1)" };
    }
    const item = sessionTodoList.find((t) => t.id === targetId);
    if (!item) {
      return { kind: "local", output: `Task #${targetId} not found.` };
    }
    item.status = "in_progress";
    return {
      kind: "local",
      output: `Task in progress: **#${item.id}** "${item.text}"`,
    };
  }

  // Fallback: treat whole text as a new task
  const directText = args.join(" ").trim();
  const list = sessionList(sessionId);
  const directItem: TodoItem = {
    id: list.nextId++,
    text: directText,
    status: "pending",
  };
  list.items.push(directItem);
  return {
    kind: "local",
    output: `Task added: **#${directItem.id}** "${directText}"`,
  };
}


/**
 * Restore a session's checklist from the turns that changed it.
 *
 * The list is recorded beside each tool result that touched it, so replaying
 * the results in order — the way the session is rebuilt on a resume, or on the
 * branch a rewind lands on — restores the list as of that point. The last
 * result wins, which is what makes a branch see the branch's own state rather
 * than whatever the newest turn anywhere happened to record.
 */
export function replayTodosFromMessages(sessionId: string, messages: readonly SessionMessage[]): void {
  let latest: readonly TodoItem[] | undefined;
  for (const message of messages) {
    if (message.role !== "tool") continue;
    const todo = message.metadata?.todo;
    if (!Array.isArray(todo)) continue;
    const items = todo.filter(
      (item): item is TodoItem =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as TodoItem).id === "number" &&
        typeof (item as TodoItem).text === "string" &&
        ((item as TodoItem).status === "pending" ||
          (item as TodoItem).status === "in_progress" ||
          (item as TodoItem).status === "done"),
    );
    // A record with nothing usable in it is a malformed record, not a clear:
    // adopting it would put junk in the band, and treating it as a clear would
    // discard a real list on the strength of a shape nobody wrote deliberately.
    // Only an array this replay could read every entry of is adopted.
    if (items.length === (message.metadata?.todo as unknown[]).length) latest = items;
  }
  if (latest !== undefined) setSessionTodos(sessionId, latest);
}
