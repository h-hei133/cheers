import ts from "typescript";

export type ASTLanguage = "typescript" | "javascript" | "python" | "rust" | "json";

export interface ASTTokenSpan {
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export interface ASTParsedSymbol {
  readonly name: string;
  readonly qualifiedName: string;
  readonly kind: "function" | "class" | "interface" | "type" | "method" | "variable" | "enum";
  readonly span: ASTTokenSpan;
  readonly isExported: boolean;
  readonly parentName?: string;
  readonly filePath: string;
}

export interface ASTFileParseResult {
  readonly filePath: string;
  readonly language: ASTLanguage;
  readonly symbols: readonly ASTParsedSymbol[];
  readonly imports: readonly {
    readonly specifier: string;
    readonly importedSymbols: readonly string[];
    readonly isDefault: boolean;
    readonly isNamespace: boolean;
  }[];
}

export function detectLanguageFromPath(filePath: string): ASTLanguage {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
  if (lower.endsWith(".js") || lower.endsWith(".jsx") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) return "javascript";
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".rs")) return "rust";
  if (lower.endsWith(".json")) return "json";
  return "typescript";
}

/**
 * Universal AST parser using TypeScript Compiler API for JS/TS and precise AST Visitor traversal.
 */
export function parseSourceSymbols(
  filePath: string,
  sourceText: string,
): ASTFileParseResult {
  const language = detectLanguageFromPath(filePath);
  const symbols: ASTParsedSymbol[] = [];
  const imports: ASTFileParseResult["imports"][number][] = [];

  if (language === "typescript" || language === "javascript") {
    const isTs = language === "typescript";
    const lower = filePath.toLowerCase();
    const scriptKind = lower.endsWith(".tsx")
      ? ts.ScriptKind.TSX
      : isTs
        ? ts.ScriptKind.TS
        : lower.endsWith(".jsx")
          ? ts.ScriptKind.JSX
          : ts.ScriptKind.JS;

    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      scriptKind,
    );

    const getSpan = (node: ts.Node): ASTTokenSpan => {
      const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
      return {
        startLine: start.line + 1,
        startColumn: start.character,
        endLine: end.line + 1,
        endColumn: end.character,
      };
    };

    const hasExportModifier = (node: ts.Node): boolean => {
      const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
      return (
        modifiers?.some(
          (m: ts.Modifier) =>
            m.kind === ts.SyntaxKind.ExportKeyword || m.kind === ts.SyntaxKind.DefaultKeyword,
        ) ?? false
      );
    };
    const visit = (node: ts.Node, parentName?: string): void => {
      // 1. Imports
      if (ts.isImportDeclaration(node)) {
        const specifier = ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : "";
        const clause = node.importClause;
        if (clause) {
          const importedSymbols: string[] = [];
          let isDefault = false;
          let isNamespace = false;

          if (clause.name) {
            importedSymbols.push(clause.name.text);
            isDefault = true;
          }
          if (clause.namedBindings) {
            if (ts.isNamespaceImport(clause.namedBindings)) {
              importedSymbols.push(clause.namedBindings.name.text);
              isNamespace = true;
            } else if (ts.isNamedImports(clause.namedBindings)) {
              for (const elem of clause.namedBindings.elements) {
                importedSymbols.push(elem.name.text);
              }
            }
          }

          imports.push({
            specifier,
            importedSymbols,
            isDefault,
            isNamespace,
          });
        }
      }

      // 2. Class Declarations
      if (ts.isClassDeclaration(node) && node.name) {
        const name = node.name.text;
        symbols.push({
          name,
          qualifiedName: parentName ? `${parentName}.${name}` : name,
          kind: "class",
          span: getSpan(node),
          isExported: hasExportModifier(node),
          parentName,
          filePath,
        });
        ts.forEachChild(node, (child) => visit(child, name));
        return;
      }

      // 3. Interface Declarations
      if (ts.isInterfaceDeclaration(node)) {
        const name = node.name.text;
        symbols.push({
          name,
          qualifiedName: parentName ? `${parentName}.${name}` : name,
          kind: "interface",
          span: getSpan(node),
          isExported: hasExportModifier(node),
          parentName,
          filePath,
        });
        ts.forEachChild(node, (child) => visit(child, name));
        return;
      }

      // 4. Type Alias Declarations
      if (ts.isTypeAliasDeclaration(node)) {
        const name = node.name.text;
        symbols.push({
          name,
          qualifiedName: parentName ? `${parentName}.${name}` : name,
          kind: "type",
          span: getSpan(node),
          isExported: hasExportModifier(node),
          parentName,
          filePath,
        });
        return;
      }

      // 5. Function Declarations
      if (ts.isFunctionDeclaration(node) && node.name) {
        const name = node.name.text;
        symbols.push({
          name,
          qualifiedName: parentName ? `${parentName}.${name}` : name,
          kind: "function",
          span: getSpan(node),
          isExported: hasExportModifier(node),
          parentName,
          filePath,
        });
        ts.forEachChild(node, (child) => visit(child, name));
        return;
      }

      // 6. Methods
      if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
        const name = node.name.text;
        symbols.push({
          name,
          qualifiedName: parentName ? `${parentName}.${name}` : name,
          kind: "method",
          span: getSpan(node),
          isExported: false,
          parentName,
          filePath,
        });
        return;
      }

      // 7. Enum Declarations
      if (ts.isEnumDeclaration(node)) {
        const name = node.name.text;
        symbols.push({
          name,
          qualifiedName: parentName ? `${parentName}.${name}` : name,
          kind: "enum",
          span: getSpan(node),
          isExported: hasExportModifier(node),
          parentName,
          filePath,
        });
        return;
      }

      ts.forEachChild(node, (child) => visit(child, parentName));
    };

    ts.forEachChild(sourceFile, (child) => visit(child));

    return {
      filePath,
      language,
      symbols,
      imports,
    };
  }

  // Fallback heuristic for Python / Rust
  const lines = sourceText.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex] ?? "";
    const trimmed = rawLine.trim();

    if (trimmed.startsWith("#") || trimmed.startsWith("//")) continue;

    const fnMatch = trimmed.match(/^(?:def|pub\s+fn|fn)\s+([a-zA-Z0-9_]+)/);
    if (fnMatch && fnMatch[1]) {
      symbols.push({
        name: fnMatch[1],
        qualifiedName: fnMatch[1],
        kind: "function",
        span: {
          startLine: lineIndex + 1,
          startColumn: 0,
          endLine: lineIndex + 1,
          endColumn: rawLine.length,
        },
        isExported: trimmed.startsWith("pub") || language === "python",
        filePath,
      });
    }
  }

  return {
    filePath,
    language,
    symbols,
    imports,
  };
}
