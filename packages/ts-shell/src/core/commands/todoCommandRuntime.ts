import type { CommandContext, LocalCommandResult } from "./types.js";

export interface TodoItem {
  id: number;
  text: string;
  status: "pending" | "in_progress" | "done";
}

let sessionTodoList: TodoItem[] = [];
let nextTodoId = 1;

export function getSessionTodos(): readonly TodoItem[] {
  return sessionTodoList;
}

/**
 * /todo (aliases: /tasks, /checklist)
 * Structured task list management for transparent step-by-step task tracking.
 */
export async function runTodoCommand(
  args: string[],
  _context: CommandContext,
): Promise<LocalCommandResult> {
  const subCommand = args[0]?.toLowerCase();

  if (!subCommand) {
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

  if (subCommand === "clear") {
    sessionTodoList = [];
    nextTodoId = 1;
    return {
      kind: "local",
      output: "Todo checklist cleared.",
    };
  }

  if (subCommand === "add") {
    const text = args.slice(1).join(" ").trim();
    if (!text) {
      return { kind: "local", output: "Usage: /todo add <task description>" };
    }
    const item: TodoItem = {
      id: nextTodoId++,
      text,
      status: "pending",
    };
    sessionTodoList.push(item);
    return {
      kind: "local",
      output: `Task added: **#${item.id}** "${text}"`,
    };
  }

  if (subCommand === "done" || subCommand === "complete") {
    const targetId = parseInt(args[1], 10);
    const item = sessionTodoList.find((t) => t.id === targetId);
    if (!item) {
      return { kind: "local", output: `Task #${args[1]} not found.` };
    }
    item.status = "done";
    return {
      kind: "local",
      output: `Task marked done: **#${item.id}** "${item.text}"`,
    };
  }

  if (subCommand === "start") {
    const targetId = parseInt(args[1], 10);
    const item = sessionTodoList.find((t) => t.id === targetId);
    if (!item) {
      return { kind: "local", output: `Task #${args[1]} not found.` };
    }
    item.status = "in_progress";
    return {
      kind: "local",
      output: `Task in progress: **#${item.id}** "${item.text}"`,
    };
  }

  // Fallback: treat whole text as a new task
  const directText = args.join(" ").trim();
  const directItem: TodoItem = {
    id: nextTodoId++,
    text: directText,
    status: "pending",
  };
  sessionTodoList.push(directItem);
  return {
    kind: "local",
    output: `Task added: **#${directItem.id}** "${directText}"`,
  };
}
