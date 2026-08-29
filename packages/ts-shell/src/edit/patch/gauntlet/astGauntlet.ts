import { parseSourceSymbols } from "../../../context/graph/ast/parser.js";

export interface ASTGauntletValidationResult {
  readonly valid: boolean;
  readonly error?: string;
  readonly parsedSymbolCount: number;
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

    // Basic heuristic: if file is non-empty but zero valid symbols/structures could be extracted and contains unclosed braces
    const openBraces = (proposedContent.match(/{/g) || []).length;
    const closeBraces = (proposedContent.match(/}/g) || []).length;
    if (openBraces !== closeBraces && (filePath.endsWith(".ts") || filePath.endsWith(".js"))) {
      return {
        valid: false,
        error: `Unmatched curly braces detected: ${openBraces} open vs ${closeBraces} close`,
        parsedSymbolCount: parseResult.symbols.length,
      };
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
