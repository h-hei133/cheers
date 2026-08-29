import type { ASTFileParseResult, ASTParsedSymbol } from "./parser.js";

export interface ScopeResolutionIndex {
  readonly byQualifiedName: ReadonlyMap<string, ASTParsedSymbol>;
  readonly byShortName: ReadonlyMap<string, readonly ASTParsedSymbol[]>;
  readonly byFile: ReadonlyMap<string, readonly ASTParsedSymbol[]>;
}

export interface MethodDispatchTable {
  readonly methodsByClass: ReadonlyMap<string, readonly ASTParsedSymbol[]>;
}

export interface WorkspaceCodeGraph {
  readonly index: ScopeResolutionIndex;
  readonly dispatch: MethodDispatchTable;
  readonly references: ReadonlyMap<string, readonly string[]>;
}

export function buildScopeResolutionIndex(
  parsedFiles: readonly ASTFileParseResult[],
): ScopeResolutionIndex {
  const byQualified = new Map<string, ASTParsedSymbol>();
  const byShort = new Map<string, ASTParsedSymbol[]>();
  const byFile = new Map<string, ASTParsedSymbol[]>();

  for (const file of parsedFiles) {
    byFile.set(file.filePath, [...file.symbols]);
    for (const sym of file.symbols) {
      byQualified.set(`${file.filePath}::${sym.qualifiedName}`, sym);

      const existingShort = byShort.get(sym.name) ?? [];
      existingShort.push(sym);
      byShort.set(sym.name, existingShort);
    }
  }

  return {
    byQualifiedName: byQualified,
    byShortName: byShort,
    byFile,
  };
}

export function buildMethodDispatchTable(
  parsedFiles: readonly ASTFileParseResult[],
): MethodDispatchTable {
  const methodsByClass = new Map<string, ASTParsedSymbol[]>();

  for (const file of parsedFiles) {
    for (const sym of file.symbols) {
      if (sym.kind === "method" && sym.parentName) {
        const list = methodsByClass.get(sym.parentName) ?? [];
        list.push(sym);
        methodsByClass.set(sym.parentName, list);
      }
    }
  }

  return {
    methodsByClass,
  };
}

export function resolveCrossFileReferences(
  parsedFiles: readonly ASTFileParseResult[],
  index: ScopeResolutionIndex,
): ReadonlyMap<string, readonly string[]> {
  const referenceGraph = new Map<string, Set<string>>();

  for (const file of parsedFiles) {
    const callerPath = file.filePath;
    const targets = new Set<string>();

    for (const imp of file.imports) {
      for (const importedSym of imp.importedSymbols) {
        const matches = index.byShortName.get(importedSym) ?? [];
        for (const match of matches) {
          if (match.isExported) {
            targets.add(match.name);
          }
        }
      }
    }

    referenceGraph.set(callerPath, targets);
  }

  const result = new Map<string, string[]>();
  for (const [k, v] of referenceGraph.entries()) {
    result.set(k, Array.from(v));
  }
  return result;
}
