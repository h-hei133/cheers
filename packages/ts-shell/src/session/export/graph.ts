import { readSessionTree, type SessionTreeNodeView } from "../query/sessionEntries.js";
import type { SessionThreadEntry, SessionThreadSnapshot } from "../schema/sessionThread.js";
import type { ExportEntry, ExportTreeNode } from "./model.js";

export function projectExportTree(value: unknown, entries: readonly ExportEntry[]): {
  readonly nodes: readonly ExportTreeNode[];
  readonly leafId: string | null;
  readonly warnings: readonly string[];
} {
  const tree = buildTree(value, entries.filter(entry => entry.sourceEntryId === undefined));
  const byId = new Map(tree.nodes.map(node => [node.id, node]));
  const nodes = [...tree.nodes]; const warnings = new Set(tree.warnings);
  for (const entry of entries) {
    if (entry.sourceEntryId === undefined) continue;
    const parent = byId.get(entry.sourceEntryId);
    if (!parent) warnings.add('Some report observations have unavailable source entries and are shown separately.');
    nodes.push({ id: entry.id, ...(parent ? { parentId: parent.id } : {}), depth: parent ? parent.depth + 1 : 0,
      role: 'command', kind: 'command-output', preview: previewFor(entry, 'command'), timestamp: entry.timestamp });
  }
  return { ...tree, nodes, warnings: [...warnings] };
}

function buildTree(value: unknown, entries: readonly ExportEntry[]): {
  readonly nodes: readonly ExportTreeNode[];
  readonly leafId: string | null;
  readonly warnings: readonly string[];
} {
  const snapshot = readableThread(value) ? value : undefined;
  const tree = snapshot && readSessionTree(snapshot.entries);
  if (!tree || tree === "unknown-cursor" || tree.length === 0) {
    return {
      nodes: entries.map((entry, index) => ({
        id: entry.id, parentId: entries[index - 1]?.id, role: entry.role,
        depth: index, kind: "turn-message", preview: previewFor(entry, entry.role), timestamp: entry.timestamp,
      })),
      leafId: entries.at(-1)?.id ?? null,
      warnings: ["Branch history is unavailable; showing transcript order."],
    };
  }
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const nodes: ExportTreeNode[] = [];
  const seen = new Set<string>();
  const warnings = new Set<string>();
  const stack: Array<{ node: SessionTreeNodeView; parentId?: string; depth: number }> =
    [...tree].reverse().map(node => ({ node, depth: 0 }));
  while (stack.length > 0) {
    const { node, parentId, depth } = stack.pop()!;
    const entry = node.entry;
    if (seen.has(entry.id)) {
      warnings.add("Damaged branch links were repaired for display.");
      continue;
    }
    seen.add(entry.id);
    if (entry.parentId !== parentId) warnings.add("Damaged branch links were repaired for display.");
    if (entry.kind === "turn-message" && !byId.has(entry.id)) warnings.add("Some branch entries have no readable message.");
    nodes.push({ id: entry.id, parentId, depth, role: entry.role, kind: entry.kind, preview: previewFor(byId.get(entry.id), entry.role), timestamp: entry.timestamp });
    for (let index = node.children.length - 1; index >= 0; index -= 1) stack.push({ node: node.children[index]!, parentId: entry.id, depth: depth + 1 });
  }
  for (const entry of entries) {
    if (seen.has(entry.id)) continue;
    warnings.add("Some transcript messages could not be linked to a branch and are shown separately.");
    nodes.push({ id: entry.id, depth: 0, role: entry.role, kind: "turn-message", preview: previewFor(entry, entry.role), timestamp: entry.timestamp });
  }
  const leafId = snapshot?.activeLeafId;
  if (leafId && !seen.has(leafId)) warnings.add("The selected branch entry is unavailable.");
  return { nodes, leafId: leafId && seen.has(leafId) ? leafId : entries.at(-1)?.id ?? null, warnings: [...warnings] };
}

/** Validate only the persisted fields used to display edges; never trust a JSON cast. */
function readableThread(value: unknown): value is Pick<SessionThreadSnapshot, "entries" | "activeLeafId"> {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.entries) || (record.activeLeafId !== undefined && typeof record.activeLeafId !== "string")) return false;
  const ids = new Set<string>();
  return record.entries.every((entry: SessionThreadEntry | null) => {
    if (!entry || typeof entry.id !== "string" || entry.id === "" || ids.has(entry.id) ||
      (entry.parentId !== undefined && typeof entry.parentId !== "string") ||
      (entry.kind !== "turn-message" && entry.kind !== "session-root") ||
      !Number.isFinite(entry.order) ||
      (entry.timestamp !== undefined && typeof entry.timestamp !== "string") ||
      (entry.role !== undefined && !["user", "assistant", "system", "tool"].includes(entry.role))) return false;
    ids.add(entry.id);
    return true;
  });
}

function previewFor(entry: ExportEntry | undefined, role: string | undefined): string {
  const label = role ?? "entry";
  const firstLine = entry?.content.split("\n").find(line => line.trim() !== "")?.trim().slice(0, 80);
  return firstLine ? `${label}: ${firstLine}` : label;
}
