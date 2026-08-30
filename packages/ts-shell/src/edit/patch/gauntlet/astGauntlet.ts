import ts from "typescript";
import { parseSourceSymbols } from "../../../context/graph/ast/parser.js";

export interface ASTGauntletValidationResult {
  readonly valid: boolean;
  readonly error?: string;
  readonly parsedSymbolCount: number;
}

/**
 * Preflight AST validator simulating patch application in memory using TypeScript Compiler API.
 * Accurately parses source code into an AST and inspects parser diagnostics for genuine syntax errors.
 */
export function validatePatchASTPreflight(
  filePath: string,
  proposedContent: string,
): ASTGauntletValidationResult {
  try {
    const lower = filePath.toLowerCase();
    const isTs = lower.endsWith(".ts") || lower.endsWith(".tsx");
    const isJs =
      lower.endsWith(".js") ||
      lower.endsWith(".jsx") ||
      lower.endsWith(".mjs") ||
      lower.endsWith(".cjs");

    if (isTs || isJs) {
      const scriptKind = lower.endsWith(".tsx")
        ? ts.ScriptKind.TSX
        : isTs
          ? ts.ScriptKind.TS
          : lower.endsWith(".jsx")
            ? ts.ScriptKind.JSX
            : ts.ScriptKind.JS;

      const sourceFile = ts.createSourceFile(
        filePath,
        proposedContent,
        ts.ScriptTarget.Latest,
        true,
        scriptKind,
      );

      let parseDiagnostics: readonly ts.Diagnostic[] = [];
      if ("parseDiagnostics" in sourceFile && Array.isArray(sourceFile.parseDiagnostics)) {
        parseDiagnostics = sourceFile.parseDiagnostics;
      }
      if (parseDiagnostics.length > 0) {
        const first = parseDiagnostics[0];
        const message = ts.flattenDiagnosticMessageText(first.messageText, "\n");
        const line = first.start
          ? sourceFile.getLineAndCharacterOfPosition(first.start).line + 1
          : 1;

        return {
          valid: false,
          error: `TypeScript syntax error at line ${line}: ${message}`,
          parsedSymbolCount: 0,
        };
      }
    }

    if (lower.endsWith(".json")) {
      try {
        JSON.parse(proposedContent);
      } catch (jsonErr) {
        return {
          valid: false,
          error: `Malformed JSON: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`,
          parsedSymbolCount: 0,
        };
      }
    }

    const parseResult = parseSourceSymbols(filePath, proposedContent);

    return {
      valid: true,
      parsedSymbolCount: parseResult.symbols.length,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      error: `AST parse failure: ${msg}`,
      parsedSymbolCount: 0,
    };
  }
}
