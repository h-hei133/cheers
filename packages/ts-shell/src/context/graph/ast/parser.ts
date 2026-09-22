import ts from "typescript";

export type ASTLanguage = "typescript" | "javascript" | "python" | "rust" | "go" | "json";

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
  if (lower.endsWith(".go")) return "go";
  if (lower.endsWith(".json")) return "json";
  return "typescript";
}

/**
 * Universal AST parser supporting TypeScript, JavaScript, Python, Rust, and Go structures.
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

  // Multi-Language parsing for Python, Rust, and Go
  const lines = sourceText.split(/\r?\n/);
  let currentParent: string | undefined;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex] ?? "";
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) continue;

    // Python Imports & Classes/Functions
    if (language === "python") {
      const importMatch = trimmed.match(/^(?:from\s+([a-zA-Z0-9_.]+)\s+import\s+([a-zA-Z0-9_,\s*]+)|import\s+([a-zA-Z0-9_.]+))/);
      if (importMatch) {
        const specifier = importMatch[1] ?? importMatch[3] ?? "";
        const symbolsList = importMatch[2]?.split(",").map((s) => s.trim()).filter(Boolean) ?? [specifier];
        imports.push({
          specifier,
          importedSymbols: symbolsList,
          isDefault: false,
          isNamespace: !importMatch[2],
        });
        continue;
      }

      const classMatch = trimmed.match(/^class\s+([a-zA-Z0-9_]+)/);
      if (classMatch) {
        currentParent = classMatch[1];
        symbols.push({
          name: classMatch[1],
          qualifiedName: classMatch[1],
          kind: "class",
          span: { startLine: lineIndex + 1, startColumn: 0, endLine: lineIndex + 1, endColumn: rawLine.length },
          isExported: true,
          filePath,
        });
        continue;
      }

      const defMatch = trimmed.match(/^def\s+([a-zA-Z0-9_]+)/);
      if (defMatch) {
        const isMethod = !rawLine.startsWith("def ") && rawLine.startsWith(" ");
        const name = defMatch[1];
        symbols.push({
          name,
          qualifiedName: isMethod && currentParent ? `${currentParent}.${name}` : name,
          kind: isMethod ? "method" : "function",
          span: { startLine: lineIndex + 1, startColumn: 0, endLine: lineIndex + 1, endColumn: rawLine.length },
          isExported: !name.startsWith("_"),
          parentName: isMethod ? currentParent : undefined,
          filePath,
        });
        continue;
      }
    }

    // Rust Structs, Enums, Impls & Functions
    if (language === "rust") {
      const structMatch = trimmed.match(/^(?:pub(?:\([a-z_]+\))?\s+)?(?:struct|enum|trait)\s+([a-zA-Z0-9_]+)/);
      if (structMatch) {
        currentParent = structMatch[1];
        symbols.push({
          name: structMatch[1],
          qualifiedName: structMatch[1],
          kind: trimmed.includes("struct") ? "class" : trimmed.includes("enum") ? "enum" : "interface",
          span: { startLine: lineIndex + 1, startColumn: 0, endLine: lineIndex + 1, endColumn: rawLine.length },
          isExported: trimmed.startsWith("pub"),
          filePath,
        });
        continue;
      }

      const fnMatch = trimmed.match(/^(?:pub(?:\([a-z_]+\))?\s+)?fn\s+([a-zA-Z0-9_]+)/);
      if (fnMatch) {
        const name = fnMatch[1];
        symbols.push({
          name,
          qualifiedName: currentParent ? `${currentParent}::${name}` : name,
          kind: currentParent ? "method" : "function",
          span: { startLine: lineIndex + 1, startColumn: 0, endLine: lineIndex + 1, endColumn: rawLine.length },
          isExported: trimmed.startsWith("pub"),
          parentName: currentParent,
          filePath,
        });
        continue;
      }
    }

    // Go Structs, Interfaces & Functions
    if (language === "go") {
      const typeMatch = trimmed.match(/^type\s+([a-zA-Z0-9_]+)\s+(?:struct|interface)/);
      if (typeMatch) {
        currentParent = typeMatch[1];
        symbols.push({
          name: typeMatch[1],
          qualifiedName: typeMatch[1],
          kind: trimmed.includes("struct") ? "class" : "interface",
          span: { startLine: lineIndex + 1, startColumn: 0, endLine: lineIndex + 1, endColumn: rawLine.length },
          isExported: /^[A-Z]/.test(typeMatch[1]),
          filePath,
        });
        continue;
      }

      const funcMatch = trimmed.match(/^func\s+(?:\([^)]+\)\s+)?([a-zA-Z0-9_]+)/);
      if (funcMatch) {
        const name = funcMatch[1];
        symbols.push({
          name,
          qualifiedName: currentParent ? `${currentParent}.${name}` : name,
          kind: trimmed.startsWith("func (") ? "method" : "function",
          span: { startLine: lineIndex + 1, startColumn: 0, endLine: lineIndex + 1, endColumn: rawLine.length },
          isExported: /^[A-Z]/.test(name),
          parentName: trimmed.startsWith("func (") ? currentParent : undefined,
          filePath,
        });
        continue;
      }
    }
  }

  return {
    filePath,
    language,
    symbols,
    imports,
  };
}
