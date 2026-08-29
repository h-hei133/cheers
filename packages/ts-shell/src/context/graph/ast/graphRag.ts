import type { ASTFileParseResult } from "./parser.js";
import {
  buildMethodDispatchTable,
  buildScopeResolutionIndex,
  resolveCrossFileReferences,
  type WorkspaceCodeGraph,
} from "./scopeTree.js";

export interface HybridRankingInput {
  readonly queryTerms: readonly string[];
  readonly seedFiles: readonly string[];
  readonly graph: WorkspaceCodeGraph;
  readonly maxDepth?: number;
}

export function rankFilesByHybridGraphRAG(
  files: readonly ASTFileParseResult[],
  input: HybridRankingInput,
): ReadonlyMap<string, number> {
  const scores = new Map<string, number>();
  const maxDepth = input.maxDepth ?? 2;
  const decay = 0.5;

  // 1. Initial BM25 / Keyword Symbol Matching Score
  for (const file of files) {
    let baseScore = 0;
    const fileSymbols = input.graph.index.byFile.get(file.filePath) ?? [];

    for (const term of input.queryTerms) {
      const lowerTerm = term.toLowerCase();
      // Match file path
      if (file.filePath.toLowerCase().includes(lowerTerm)) {
        baseScore += 10;
      }
      // Match AST symbols
      for (const sym of fileSymbols) {
        if (sym.name.toLowerCase().includes(lowerTerm)) {
          baseScore += sym.isExported ? 15 : 5;
        }
      }
    }

    if (baseScore > 0) {
      scores.set(file.filePath, baseScore);
    }
  }

  // 2. Graph Topological Expansion (Multi-hop Walk with Decay)
  let currentFrontier = new Set(input.seedFiles);
  for (let depth = 1; depth <= maxDepth; depth++) {
    const nextFrontier = new Set<string>();
    const weight = Math.pow(decay, depth);

    for (const file of currentFrontier) {
      const outgoingSymbols = input.graph.references.get(file) ?? [];
      for (const symName of outgoingSymbols) {
        const decls = input.graph.index.byShortName.get(symName) ?? [];
        for (const decl of decls) {
          if (!scores.has(decl.name)) {
            const currentScore = scores.get(file) ?? 10;
            scores.set(decl.name, currentScore * weight);
            nextFrontier.add(decl.name);
          }
        }
      }
    }

    currentFrontier = nextFrontier;
    if (currentFrontier.size === 0) break;
  }

  return scores;
}

export function createWorkspaceCodeGraph(
  files: readonly ASTFileParseResult[],
): WorkspaceCodeGraph {
  const index = buildScopeResolutionIndex(files);
  const dispatch = buildMethodDispatchTable(files);
  const references = resolveCrossFileReferences(files, index);
  return {
    index,
    dispatch,
    references,
  };
}
