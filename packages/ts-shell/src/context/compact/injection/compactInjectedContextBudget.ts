import { fitContextLines } from "../../budget/lines.js";

export interface CompactInjectedContextBudgetOptions {
  readonly maxChars?: number;
  readonly maxListItems?: number;
}

export interface CompactInjectedContextBudgetResult {
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
}

const DEFAULT_MAX_CHARS = 12_000;
const DEFAULT_MAX_LIST_ITEMS = 12;

export function applyCompactInjectedContextBudget(
  context: string,
  options: CompactInjectedContextBudgetOptions = {},
): CompactInjectedContextBudgetResult {
  const requestedMax = options.maxChars ?? DEFAULT_MAX_CHARS;
  const maxChars = Number.isFinite(requestedMax) ? Math.max(0, Math.floor(requestedMax)) : 0;
  const maxListItems = options.maxListItems ?? DEFAULT_MAX_LIST_ITEMS;
  const dedupedLines = dedupeLines(context.split("\n"));
  const listCappedLines = capListItems(dedupedLines, maxListItems);
  const listCappedContext = listCappedLines.join("\n");
  if (listCappedContext.length <= maxChars) {
    return {
      context: listCappedContext,
      fits: true,
      estimatedSize: listCappedContext.length,
      originalSize: context.length,
      overBudget: context.length > maxChars,
      omittedLineCount: dedupedLines.length - listCappedLines.length,
      warnings:
        context.length > maxChars
          ? [
              {
                id: "compact-injected-context-list-capped",
                message: `Injected context list entries were capped before final budget check.`,
              },
            ]
          : [],
      evidence: [
        "compact-injected-context-budget:deduped",
        "compact-injected-context-budget:list-capped",
      ],
    };
  }

  const fitted = fitContextLines(listCappedLines, maxChars, isCriticalLine,
    "- Budget: additional entries omitted; required safety content preserved.");
  const budgeted = fitted.context;
  return {
    context: budgeted,
    fits: fitted.fits,
    estimatedSize: budgeted.length,
    originalSize: context.length,
    overBudget: true,
    omittedLineCount: dedupedLines.length - listCappedLines.length + fitted.omittedLineCount,
    warnings: [
      {
        id: "compact-injected-context-over-budget",
        message: `Injected context was reduced from ${context.length} to ${budgeted.length} chars.`,
      },
    ],
    evidence: [
      "compact-injected-context-budget:deduped",
      "compact-injected-context-budget:list-capped",
      "compact-injected-context-budget:over-budget-trimmed",
      fitted.fits ? "compact-injected-context-budget:critical-facts-preserved" : "compact-injected-context-budget:insufficient-capacity",
    ],
  };
}

function dedupeLines(lines: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    const key = line.trim();
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

function capListItems(lines: readonly string[], maxListItems: number): string[] {
  const result: string[] = [];
  let currentListCount = 0;
  for (const line of lines) {
    const isNestedListItem = /^  - /.test(line);
    if (!isNestedListItem) {
      currentListCount = 0;
      result.push(line);
      continue;
    }
    currentListCount += 1;
    if (currentListCount <= maxListItems || isCriticalLine(line)) {
      result.push(line);
    } else if (currentListCount === maxListItems + 1) {
      result.push("  - ... additional entries omitted by Compact v2 budget");
    }
  }
  return result;
}

function isCriticalLine(line: string): boolean {
  return /^(<compact_v2_injected_context>|<\/compact_v2_injected_context>|Task \/ route|Edit capability|Recovery \/ restore|Validation|Constraints|Safety|- Objective:|- Route:|- Next action:|- Closeout status:|- Blocked by design:|- Automatic recovery:|- Atomic rollback:|- Restore execute:|- Recovery executed:|- Result contract:|- Constraints \/ forbidden scope:|- Raw original content|This context does not grant|  - automatic-recovery|  - atomic-rollback|  - arbitrary-broad-apply-patch|  - fuzzy-patch)/i.test(
    line,
  );
}
