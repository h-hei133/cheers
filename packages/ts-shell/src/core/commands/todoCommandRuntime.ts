import { todoSyntax } from "./todo/syntax.js";
import { parseSyntax } from "./syntax/parse.js";
import { syntaxHelp } from "./syntax/projection.js";
import { TODO_LIMITS, parseTodoDocument, renderTodos, serializeTodos, validTodoItems, type TodoItem } from "./todo/model.js";
import type { CommandContext, LocalCommandResult } from "./types.js";
import type { SessionMessage } from "../../session/schema/sessionMessage.js";

export type { TodoItem } from "./todo/model.js";

const listsBySession = new Map<string, readonly TodoItem[]>();
const EMPTY_TODOS: readonly TodoItem[] = [];
const USAGE = syntaxHelp(todoSyntax);

export function getSessionTodos(sessionId?: string): readonly TodoItem[] {
  return sessionId ? listsBySession.get(sessionId) ?? EMPTY_TODOS : EMPTY_TODOS;
}

export function setSessionTodos(sessionId: string, items: readonly TodoItem[]): void {
  listsBySession.set(sessionId, items.map((item) => ({ ...item })));
}

export function forgetSessionTodos(sessionId: string): void {
  listsBySession.delete(sessionId);
}

/** Mutations publish the complete list through the existing command-state journal. */
export async function runTodoCommand(args: string[], context: CommandContext, sessionId?: string): Promise<LocalCommandResult> {
  const parsed = parseSyntax(todoSyntax, args);
  if (!parsed.ok) return { kind: "local", output: `Invalid /todo arguments: ${parsed.reason}\n${USAGE}` };
  sessionId ??= context.sessionId;
  const items = getSessionTodos(sessionId);
  const action = parsed.action.name;
  if (action === "list") return { kind: "local", output: items.length ? renderTodos(items) : `No tasks currently on the todo list.\n${USAGE}` };
  try {
    if (action === "copy") {
      const content = renderTodos(items);
      if (!context.dataTransfer?.copy) return { kind: "local", output: `Clipboard unavailable; copy this Markdown:\n\n${content}` };
      const result = await context.dataTransfer.copy({ content });
      return { kind: "local", output: `Todo clipboard outcome: ${result.outcome}.${result.reason ? ` ${result.reason}` : ""}` };
    }
    if (action === "export") {
      if (!context.dataTransfer) return blocked("File transfer authority is unavailable.");
      const result = await context.dataTransfer.write({ path: parsed.args[0]!, content: serializeTodos(items) });
      return { kind: "local", output: `Todo export outcome: ${result.outcome}.${result.reason ? ` ${result.reason}` : ""}` };
    }
    if (action === "import") {
      if (!context.dataTransfer) return blocked("File transfer authority is unavailable.");
      const read = await context.dataTransfer.read({ path: parsed.args[0]!, maxBytes: TODO_LIMITS.bytes });
      if (read.outcome !== "read") return blocked(`Import ${read.outcome}: ${read.reason}`);
      const imported = parseTodoDocument(read.content);
      if (getSessionTodos(sessionId) !== items) return blocked("Todo checklist changed during import; retry against the current list.");
      return publish(sessionId, imported, `Imported ${imported.length} tasks. Goal completion is unchanged.`);
    }
    if (action === "clear") return publish(sessionId, [], "Todo checklist cleared.");
    const next = items.map((item) => ({ ...item }));
    if (action === "add") {
      const text = parsed.args.join(" ").trim();
      if (!text || text.length > TODO_LIMITS.text || items.length >= TODO_LIMITS.items) return blocked("Task text or checklist capacity exceeds its limit.");
      const id = items.reduce((highest, item) => Math.max(highest, item.id), 0) + 1;
      if (!Number.isSafeInteger(id) || id >= Number.MAX_SAFE_INTEGER) return blocked("Todo IDs are exhausted.");
      next.push({ id, text, status: "pending" });
      return publish(sessionId, next, `Task added: **#${id}** "${text}"`);
    }
    const id = Number(parsed.args[0]);
    const item = next.find((entry) => entry.id === id);
    if (!item) return { kind: "local", output: `Task #${id} not found.` };
    if (action === "edit") {
      const text = parsed.args.slice(1).join(" ").trim();
      if (!text || text.length > TODO_LIMITS.text) return blocked("Task text exceeds its limit.");
      item.text = text;
    } else if (action === "rm") {
      return publish(sessionId, next.filter((entry) => entry.id !== id), `Task #${id} removed.`);
    } else {
      item.status = action === "start" ? "in_progress" : action === "drop" ? "dropped" : action === "pending" ? "pending" : "done";
    }
    const output = action === "done" ? `Task marked done: **#${id}** "${item.text}"` : action === "start" ? `Task in progress: **#${id}** "${item.text}"` : `Task #${id} ${action === "edit" ? "edited" : item.status}.`;
    return publish(sessionId, next, `${output}${action === "done" ? " Goal completion requires separate acceptance evidence." : ""}`);
  } catch (error) {
    return blocked(error instanceof Error ? error.message : "Todo operation failed.");
  }
}

function publish(sessionId: string | undefined, items: readonly TodoItem[], output: string): LocalCommandResult {
  if (sessionId) setSessionTodos(sessionId, items);
  return { kind: "local", output, state: { todo: items.map((item) => ({ ...item })) } };
}

function blocked(reason: string): LocalCommandResult {
  return { kind: "local", output: `Todo operation blocked: ${reason} Checklist unchanged.` };
}

export function replayTodosFromMessages(sessionId: string, messages: readonly SessionMessage[]): void {
  let latest: readonly TodoItem[] | undefined;
  for (const message of messages) {
    if (message.role !== "tool" && message.role !== "user") continue;
    const todo = message.metadata?.todo;
    if (validTodoItems(todo)) latest = todo;
  }
  if (latest !== undefined) setSessionTodos(sessionId, latest);
}
