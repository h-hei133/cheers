import { fitContextLines } from "../context/budget/lines.js";

export interface ProjectMemoryInjectedContextBudgetOptions {
  readonly maxChars?: number;
  readonly maxListItems?: number;
  readonly recordLines?: ReadonlyMap<number, readonly string[]>;
}

export interface ProjectMemoryInjectedContextBudgetResult {
  readonly context: string;
  readonly fits: boolean;
  readonly estimatedSize: number;
  readonly originalSize: number;
  readonly overBudget: boolean;
  readonly omittedLineCount: number;
  readonly warnings: readonly {
    readonly id: string;
    readonly message: string;
  }[];
  readonly evidence: readonly string[];
  readonly admittedRecordIds: readonly string[];
}

type ContextLine = { readonly text: string; readonly sourceIndex: number };

const DEFAULT_MAX_CHARS = 10_000;
const DEFAULT_MAX_LIST_ITEMS = 10;

export function applyProjectMemoryInjectedContextBudget(
  context: string,
  options: ProjectMemoryInjectedContextBudgetOptions = {},
): ProjectMemoryInjectedContextBudgetResult {
  const requestedMax = options.maxChars ?? DEFAULT_MAX_CHARS;
  const maxChars = Number.isFinite(requestedMax) ? Math.max(0, Math.floor(requestedMax)) : 0;
  const maxListItems = options.maxListItems ?? DEFAULT_MAX_LIST_ITEMS;
  const dedupedLines = dedupeLines(context.split("\n").map((text, sourceIndex) => ({ text, sourceIndex })));
  const listCappedLines = capListItems(dedupedLines, maxListItems);
  const listCappedContext = listCappedLines.map(line => line.text).join("\n");
  if (listCappedContext.length <= maxChars) {
    return {
      context: listCappedContext,
      admittedRecordIds: admittedIds(listCappedLines, options.recordLines),
      fits: true,
      estimatedSize: listCappedContext.length,
      originalSize: context.length,
      overBudget: context.length > maxChars,
      omittedLineCount: dedupedLines.length - listCappedLines.length,
      warnings:
        context.length > maxChars
          ? [{
              id: "project-memory-injected-context-list-capped",
              message: "Injected memory context list entries were capped before final budget check.",
            }]
          : [],
      evidence: [
        "project-memory-injected-context-budget:deduped",
        "project-memory-injected-context-budget:list-capped",
      ],
    };
  }

  const fitted = fitContextLines(listCappedLines.map(line => line.text), maxChars, isCriticalLine,
    "- Budget: additional entries omitted; required safety content preserved.");
  const budgeted = fitted.context;
  return {
    context: budgeted,
    admittedRecordIds: admittedIds(fitted.selectedIndices.map(index => listCappedLines[index]!), options.recordLines),
    fits: fitted.fits,
    estimatedSize: budgeted.length,
    originalSize: context.length,
    overBudget: true,
    omittedLineCount: dedupedLines.length - listCappedLines.length + fitted.omittedLineCount,
    warnings: [{
      id: "project-memory-injected-context-over-budget",
      message: `Injected memory context was reduced from ${context.length} to ${budgeted.length} chars.`,
    }],
    evidence: [
      "project-memory-injected-context-budget:deduped",
      "project-memory-injected-context-budget:list-capped",
      "project-memory-injected-context-budget:over-budget-trimmed",
      fitted.fits ? "project-memory-injected-context-budget:critical-facts-preserved" : "project-memory-injected-context-budget:insufficient-capacity",
    ],
  };
}

function dedupeLines(lines: readonly ContextLine[]): ContextLine[] {
  const seen = new Set<string>();
  const result: ContextLine[] = [];
  for (const line of lines) {
    const key = line.text.trim();
    if (key && seen.has(key)) {
      continue;
    }
    if (key) {
      seen.add(key);
    }
    result.push(line);
  }
  return result;
}

function capListItems(lines: readonly ContextLine[], maxListItems: number): ContextLine[] {
  const result: ContextLine[] = [];
  let currentListCount = 0;
  for (const line of lines) {
    const isListItem = /^- /.test(line.text) || /^  - /.test(line.text);
    if (!isListItem || isCriticalLine(line.text)) {
      currentListCount = isListItem ? currentListCount + 1 : 0;
      result.push(line);
      continue;
    }
    currentListCount += 1;
    if (currentListCount <= maxListItems) {
      result.push(line);
    } else if (currentListCount === maxListItems + 1) {
      result.push({ text: "- ... additional memory entries omitted by budget", sourceIndex: -1 });
    }
  }
  return result;
}

function admittedIds(lines: readonly ContextLine[], sources?: ReadonlyMap<number, readonly string[]>): readonly string[] {
  return [...new Set(lines.flatMap(line => sources?.get(line.sourceIndex) ?? []))];
}

function isCriticalLine(line: string): boolean {
  return /^(<project_memory_context>|<\/project_memory_context>|Source:|Injection:|Mode:|Query:|Records selected:|Selected records|Constraints \/ caveats|Next action|Safety|Evidence references|Redactions \/ warnings|- Use this memory|- Invalidated and deleted|- Automatic memory injection: no|- Startup auto-load: no|- Provider retrieval: no|- Vector search|- Raw file content|- This context does not grant|- Budget:)/i.test(line);
}
