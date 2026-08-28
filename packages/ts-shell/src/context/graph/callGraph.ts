import type { SymbolTable } from "./symbolTable.js";

export interface SymbolCallEdge {
  readonly callerFilePath: string;
  readonly calleeFilePath: string;
  readonly symbolName: string;
  readonly weight: number;
}

export interface WorkspaceCallGraph {
  readonly edges: readonly SymbolCallEdge[];
  readonly incomingReferences: ReadonlyMap<string, readonly string[]>;
  readonly outgoingReferences: ReadonlyMap<string, readonly string[]>;
}

export function buildCallGraph(
  files: readonly { readonly filePath: string; readonly sourceText: string }[],
  symbolTable: SymbolTable,
): WorkspaceCallGraph {
  const edges: SymbolCallEdge[] = [];
  const incomingMap = new Map<string, Set<string>>();
  const outgoingMap = new Map<string, Set<string>>();

  for (const file of files) {
    const callerPath = file.filePath;

    // Scan caller's source for mentions of exported symbols in other files
    for (const [symbolName, decls] of symbolTable.byName.entries()) {
      // Don't match self references
      const externalDecls = decls.filter(
        (d) => d.filePath !== callerPath && d.isExported && symbolName.length >= 3,
      );
      if (externalDecls.length === 0) {
        continue;
      }

      // Check if caller mentions the symbol as a whole token/identifier
      const escaped = symbolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const wordRegex = new RegExp(`(^|[^a-zA-Z0-9_$])${escaped}([^a-zA-Z0-9_$]|$)`);
      if (wordRegex.test(file.sourceText)) {
        for (const targetDecl of externalDecls) {
          const calleePath = targetDecl.filePath;
          edges.push({
            callerFilePath: callerPath,
            calleeFilePath: calleePath,
            symbolName,
            weight: 1.0,
          });

          // Add to incoming / outgoing maps
          const incoming = incomingMap.get(calleePath) ?? new Set<string>();
          incoming.add(callerPath);
          incomingMap.set(calleePath, incoming);

          const outgoing = outgoingMap.get(callerPath) ?? new Set<string>();
          outgoing.add(calleePath);
          outgoingMap.set(callerPath, outgoing);
        }
      }
    }
  }

  const incomingResult = new Map<string, string[]>();
  for (const [k, v] of incomingMap.entries()) {
    incomingResult.set(k, Array.from(v));
  }

  const outgoingResult = new Map<string, string[]>();
  for (const [k, v] of outgoingMap.entries()) {
    outgoingResult.set(k, Array.from(v));
  }

  return {
    edges,
    incomingReferences: incomingResult,
    outgoingReferences: outgoingResult,
  };
}

export function rankFilesByGraphRelevance(
  seedFilePaths: readonly string[],
  graph: WorkspaceCallGraph,
  options?: { readonly maxDepth?: number; readonly decay?: number },
): ReadonlyMap<string, number> {
  const maxDepth = options?.maxDepth ?? 2;
  const decay = options?.decay ?? 0.5;
  const scores = new Map<string, number>();

  let currentFrontier = new Map<string, number>();
  for (const seed of seedFilePaths) {
    currentFrontier.set(seed, 1.0);
    scores.set(seed, 1.0);
  }

  for (let depth = 1; depth <= maxDepth; depth++) {
    const nextFrontier = new Map<string, number>();
    const currentWeight = Math.pow(decay, depth);

    for (const currentFile of currentFrontier.keys()) {
      const neighbors = [
        ...(graph.incomingReferences.get(currentFile) ?? []),
        ...(graph.outgoingReferences.get(currentFile) ?? []),
      ];

      for (const neighbor of neighbors) {
        if (!scores.has(neighbor)) {
          scores.set(neighbor, currentWeight);
          nextFrontier.set(neighbor, currentWeight);
        }
      }
    }

    currentFrontier = nextFrontier;
    if (currentFrontier.size === 0) {
      break;
    }
  }

  return scores;
}
