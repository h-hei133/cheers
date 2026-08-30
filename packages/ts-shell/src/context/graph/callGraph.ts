import ts from "typescript";
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

/**
 * Builds a cross-file call graph using true AST CallExpression and Identifier traversal.
 * Eliminates false positives from comments, markdown, and arbitrary string literals.
 */
export function buildCallGraph(
  files: readonly { readonly filePath: string; readonly sourceText: string }[],
  symbolTable: SymbolTable,
): WorkspaceCallGraph {
  const edges: SymbolCallEdge[] = [];
  const incomingMap = new Map<string, Set<string>>();
  const outgoingMap = new Map<string, Set<string>>();

  for (const file of files) {
    const callerPath = file.filePath;
    const isCode =
      callerPath.endsWith(".ts") ||
      callerPath.endsWith(".tsx") ||
      callerPath.endsWith(".js") ||
      callerPath.endsWith(".jsx");

    const calledIdentifiers = new Set<string>();

    if (isCode) {
      const scriptKind = callerPath.endsWith(".tsx")
        ? ts.ScriptKind.TSX
        : callerPath.endsWith(".ts")
          ? ts.ScriptKind.TS
          : callerPath.endsWith(".jsx")
            ? ts.ScriptKind.JSX
            : ts.ScriptKind.JS;

      try {
        const sourceFile = ts.createSourceFile(
          callerPath,
          file.sourceText,
          ts.ScriptTarget.Latest,
          true,
          scriptKind,
        );

        const extractCalls = (node: ts.Node): void => {
          // 1. Function Call Expressions: foo() or obj.foo()
          if (ts.isCallExpression(node)) {
            const expr = node.expression;
            if (ts.isIdentifier(expr)) {
              calledIdentifiers.add(expr.text);
            } else if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.name)) {
              calledIdentifiers.add(expr.name.text);
            }
          }

          // 2. New Expressions: new Foo()
          if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
            calledIdentifiers.add(node.expression.text);
          }

          // 3. Type References: let x: Foo
          if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
            calledIdentifiers.add(node.typeName.text);
          }

          ts.forEachChild(node, extractCalls);
        };

        ts.forEachChild(sourceFile, extractCalls);
      } catch {
        // Fallback for unparseable files
      }
    }

    for (const [symbolName, decls] of symbolTable.byName.entries()) {
      const externalDecls = decls.filter(
        (d) => d.filePath !== callerPath && d.isExported && symbolName.length >= 3,
      );
      if (externalDecls.length === 0) {
        continue;
      }

      if (calledIdentifiers.has(symbolName)) {
        for (const targetDecl of externalDecls) {
          const calleePath = targetDecl.filePath;
          edges.push({
            callerFilePath: callerPath,
            calleeFilePath: calleePath,
            symbolName,
            weight: 1.0,
          });

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
    scores.set(seed, 1.0);
    currentFrontier.set(seed, 1.0);
  }

  for (let depth = 1; depth <= maxDepth; depth++) {
    const nextFrontier = new Map<string, number>();
    const currentDecay = Math.pow(decay, depth);

    for (const [sourcePath] of currentFrontier.entries()) {
      const neighbors = [
        ...(graph.outgoingReferences.get(sourcePath) ?? []),
        ...(graph.incomingReferences.get(sourcePath) ?? []),
      ];

      for (const neighbor of neighbors) {
        const newScore = (scores.get(neighbor) ?? 0) + currentDecay;
        scores.set(neighbor, newScore);

        if (!nextFrontier.has(neighbor)) {
          nextFrontier.set(neighbor, newScore);
        }
      }
    }

    currentFrontier = nextFrontier;
    if (currentFrontier.size === 0) break;
  }

  return scores;
}
