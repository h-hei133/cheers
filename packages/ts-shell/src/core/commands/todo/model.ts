export const TODO_LIMITS = { bytes: 64 * 1024, items: 256, text: 4096 } as const;

export interface TodoItem {
  id: number;
  text: string;
  status: "pending" | "in_progress" | "done" | "dropped";
}

export function validTodoItems(value: unknown): value is TodoItem[] {
  if (!Array.isArray(value) || value.length > TODO_LIMITS.items) return false;
  const ids = new Set<number>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)
      || !Number.isSafeInteger(item.id) || item.id < 1 || item.id >= Number.MAX_SAFE_INTEGER
      || typeof item.text !== "string" || !item.text.trim() || item.text.length > TODO_LIMITS.text
      || !["pending", "in_progress", "done", "dropped"].includes(item.status)
      || ids.has(item.id)) return false;
    ids.add(item.id);
  }
  return true;
}

export function parseTodoDocument(content: string): readonly TodoItem[] {
  if (Buffer.byteLength(content, "utf8") > TODO_LIMITS.bytes) throw new Error("Todo import exceeds 64 KiB.");
  let document: unknown;
  try { document = JSON.parse(content); } catch { throw new Error("Todo import must be valid JSON."); }
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new Error("Invalid todo document.");
  const data = document as Record<string, unknown>;
  if (data.kind !== "session-todo" || data.version !== 1 || !validTodoItems(data.items)
    || Object.keys(data).some((key) => !["kind", "version", "items"].includes(key))
    || data.items.some((item) => Object.keys(item).some((key) => !["id", "text", "status"].includes(key)))) {
    throw new Error("Todo import requires session-todo version 1, unique positive IDs, supported statuses and bounded task text.");
  }
  return data.items.map((item) => ({ ...item }));
}

export function serializeTodos(items: readonly TodoItem[]): string {
  const content = `${JSON.stringify({ kind: "session-todo", version: 1, items }, null, 2)}\n`;
  if (Buffer.byteLength(content, "utf8") > TODO_LIMITS.bytes) throw new Error("Todo export exceeds 64 KiB. Export fewer tasks.");
  return content;
}

export function renderTodos(items: readonly TodoItem[]): string {
  const done = items.filter((item) => item.status === "done").length;
  const dropped = items.filter((item) => item.status === "dropped").length;
  return ["# Session Task Checklist (/todo)", "",
    `Progress: **${done}/${items.length}** (${items.length ? Math.round(done / items.length * 100) : 0}%)`,
    `Dropped: ${dropped}. Goal completion requires its own acceptance evidence.`, "",
    ...items.map((item) => `${item.status === "done" ? "[X]" : item.status === "in_progress" ? "[>]" : item.status === "dropped" ? "[-]" : "[ ]"} **#${item.id}**: ${item.text} *(${item.status})*`),
  ].join("\n");
}
