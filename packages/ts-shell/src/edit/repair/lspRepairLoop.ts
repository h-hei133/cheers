import { withFileMutationQueue } from "../../tools/concurrency/fileMutationQueue.js";
import { validatePatchASTPreflight } from "../patch/gauntlet/astGauntlet.js";

export interface DiagnosticItem {
  readonly filePath: string;
  readonly line: number;
  readonly column: number;
  readonly code: string | number;
  readonly message: string;
}

export interface SelfRepairOptions {
  readonly filePath: string;
  readonly proposedContent: string;
  readonly originalContent: string;
  readonly writeFile: (filePath: string, content: string) => Promise<void>;
  readonly getDiagnostics: (filePath: string) => Promise<readonly DiagnosticItem[]>;
  readonly retryWithCompilerFeedback: (errors: readonly DiagnosticItem[]) => Promise<string | undefined>;
  readonly maxAttempts?: number;
}

export interface SelfRepairResult {
  readonly success: boolean;
  readonly attempts: number;
  readonly finalContent: string;
  readonly errors: readonly DiagnosticItem[];
  readonly rolledBack: boolean;
}

export async function executeWithLspSelfRepair(
  options: SelfRepairOptions,
): Promise<SelfRepairResult> {
  const maxAttempts = options.maxAttempts ?? 2;
  let currentContent = options.proposedContent;
  let attempts = 0;

  return withFileMutationQueue(options.filePath, async () => {
    while (attempts < maxAttempts) {
      attempts++;

      // 1. Preflight AST syntax validation
      const preflight = validatePatchASTPreflight(options.filePath, currentContent);
      if (!preflight.valid) {
        // Rollback and report syntax failure
        await options.writeFile(options.filePath, options.originalContent);
        return {
          success: false,
          attempts,
          finalContent: options.originalContent,
          errors: [{
            filePath: options.filePath,
            line: 1,
            column: 1,
            code: "AST_SYNTAX_ERROR",
            message: preflight.error ?? "Invalid AST syntax",
          }],
          rolledBack: true,
        };
      }

      // 2. Perform write under queue lock
      await options.writeFile(options.filePath, currentContent);

      // 3. Post-mutation LSP diagnostics
      const diagnostics = await options.getDiagnostics(options.filePath);
      if (diagnostics.length === 0) {
        return {
          success: true,
          attempts,
          finalContent: currentContent,
          errors: [],
          rolledBack: false,
        };
      }

      // 4. Trigger model self-repair with compiler errors
      const repaired = await options.retryWithCompilerFeedback(diagnostics);
      if (!repaired) {
        break;
      }
      currentContent = repaired;
    }

    // 5. Exceeded retry attempts: atomic rollback
    await options.writeFile(options.filePath, options.originalContent);
    const finalDiagnostics = await options.getDiagnostics(options.filePath);

    return {
      success: false,
      attempts,
      finalContent: options.originalContent,
      errors: finalDiagnostics,
      rolledBack: true,
    };
  });
}
