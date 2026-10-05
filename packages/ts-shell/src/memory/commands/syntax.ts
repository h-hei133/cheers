import type { CommandAction, CommandSyntax } from "../../core/commands/syntax/model.js";

const reason = { name: "reason", kind: "text", rest: true } as const;
const status: CommandAction = { name: "status", summary: "show memory approval and save status", flags: [] };
const review: readonly CommandAction[] = [
  { name: "list", summary: "list review candidates", flags: [] },
  { name: "review", summary: "review extracted candidates", flags: [] },
  { name: "approve", summary: "approve candidates for a separate save", parameters: [{ name: "candidate-id", kind: "text" }, reason],
    flags: [{ name: "all-safe", kind: "boolean", summary: "approve all safe candidates", conflictsWithArguments: true }] },
  { name: "reject", summary: "reject review candidates", parameters: [{ name: "candidate-id", kind: "text" }, reason],
    flags: [{ name: "unsafe", kind: "boolean", summary: "reject unsafe candidates", conflictsWithArguments: true }] },
];
const recall: readonly CommandAction[] = [
  { name: "recall", aliases: ["search"], summary: "search project memory using a query and optional filters", parameters: [{ name: "query", kind: "text", required: true, rest: true }] },
  { name: "wake", summary: "prepare project memory without a query", flags: [] },
];
const lifecycle: readonly CommandAction[] = [
  { name: "invalidate", summary: "mark a record invalid without deleting it", parameters: [{ name: "record-id", kind: "text", required: true }, reason], flags: [] },
  { name: "delete", summary: "delete a record", parameters: [{ name: "record-id", kind: "text", required: true }, reason], flags: [] },
];
const save: readonly CommandAction[] = [
  { name: "save", summary: "persist an approved candidate or all approved candidates", parameters: [{ name: "candidate-id|approved", kind: "text", required: true }], flags: [] },
  status,
];
const use: readonly CommandAction[] = [
  { name: "use", summary: "stage memory for the next normal turn", parameters: [{ name: "query", kind: "text", rest: true }] },
];

export const memoryReviewSyntax: CommandSyntax = { name: "memory", defaultAction: "list", actions: [...review, status] };
export const memoryRecallSyntax: CommandSyntax = { name: "memory", actions: recall };
export const memoryLifecycleSyntax: CommandSyntax = { name: "memory", actions: lifecycle };
export const memorySaveSyntax: CommandSyntax = { name: "memory", actions: save };
export const memoryUseSyntax: CommandSyntax = { name: "memory", actions: use };
export const memorySyntax: CommandSyntax = {
  name: "memory", defaultAction: "list",
  actions: [
    { name: "inspect", aliases: ["stats"], summary: "inspect retained facts and storage statistics", flags: [] },
    { name: "add", aliases: ["retain"], summary: "explicitly retain a fact", parameters: [{ name: "statement", kind: "text", required: true, rest: true }] },
    ...review, ...recall, ...use, ...lifecycle, ...save,
  ],
};
