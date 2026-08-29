import { parseSourceSymbols } from "../../../context/graph/ast/parser.js";

export interface ASTGauntletValidationResult {
  readonly valid: boolean;
  readonly error?: string;
  readonly parsedSymbolCount: number;
}

function stripCommentsAndStrings(code: string): string {
  return code
    // Block comments
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // Line comments
    .replace(/\/\/.*$/gm, "")
    // Double-quoted strings
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    // Single-quoted strings
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    // Template literals
    .replace(/`(?:\\.|[^`\\])*`/g, "``");
}

/**
 * Preflight AST validator simulating patch application in memory.
 * Rejects broken syntax (unclosed brackets, invalid grammar) before disk write.
 */
export function validatePatchASTPreflight(
  filePath: string,
  proposedContent: string,
): ASTGauntletValidationResult {
  try {
    const parseResult = parseSourceSymbols(filePath, proposedContent);
    const lower = filePath.toLowerCase();
    const isCodeFile =
      lower.endsWith(".ts") ||
      lower.endsWith(".tsx") ||
      lower.endsWith(".js") ||
      lower.endsWith(".jsx") ||
      lower.endsWith(".mjs") ||
      lower.endsWith(".cjs");

    if (isCodeFile) {
      const stripped = stripCommentsAndStrings(proposedContent);
      const openBraces = (stripped.match(/{/g) || []).length;
      const closeBraces = (stripped.match(/}/g) || []).length;

      if (openBraces !== closeBraces) {
        return {
          valid: false,
          error: `Unmatched curly braces detected: ${openBraces} open vs ${closeBraces} close`,
          parsedSymbolCount: parseResult.symbols.length,
        };
      }
    }

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
