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
 * Universal safe AST parser supporting TypeScript, JavaScript, Python, and Rust structures.
 */
export function parseSourceSymbols(
  filePath: string,
  sourceText: string,
): ASTFileParseResult {
  const language = detectLanguageFromPath(filePath);
  const symbols: ASTParsedSymbol[] = [];
  const imports: ASTFileParseResult["imports"][number][] = [];
  const lines = sourceText.split(/\r?\n/);

  let currentClass: string | undefined;
  let classBraceDepth = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex] ?? "";
    const trimmed = rawLine.trim();

    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*")
    ) {
      continue;
    }

    // TypeScript / JavaScript Imports
    const importMatch = trimmed.match(/^import\s+(?:type\s+)?(?:(\w+)|\{([^}]+)\}|\*\s+as\s+(\w+))\s+from\s+['"]([^'"]+)['"]/);
    if (importMatch) {
      const defaultImport = importMatch[1];
      const namedImports = importMatch[2]?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
      const namespaceImport = importMatch[3];
      const specifier = importMatch[4] ?? "";
      imports.push({
        specifier,
        importedSymbols: defaultImport ? [defaultImport] : namespaceImport ? [namespaceImport] : namedImports,
        isDefault: Boolean(defaultImport),
        isNamespace: Boolean(namespaceImport),
      });
      continue;
    }

    // Python Imports
    const pyImportMatch = trimmed.match(/^(?:from\s+([a-zA-Z0-9_.]+)\s+import\s+([a-zA-Z0-9_,\s]+)|import\s+([a-zA-Z0-9_.]+))/);
    if (pyImportMatch) {
      const moduleSpec = pyImportMatch[1] ?? pyImportMatch[3] ?? "";
      const imported = pyImportMatch[2]?.split(",").map((s) => s.trim()).filter(Boolean) ?? [moduleSpec];
      imports.push({
        specifier: moduleSpec,
        importedSymbols: imported,
        isDefault: false,
        isNamespace: !pyImportMatch[2],
      });
      continue;
    }

    // Class / Struct Declarations (TS, JS, Python, Rust struct)
    const classMatch = trimmed.match(/^(?:export\s+|pub(?:\([a-z_]+\))?\s+)?(?:abstract\s+)?(?:class|struct)\s+([a-zA-Z0-9_$]+)/);
    if (classMatch && classMatch[1]) {
      const name = classMatch[1];
      currentClass = name;
      classBraceDepth = 1;
      symbols.push({
        name,
        qualifiedName: name,
        kind: "class",
        filePath,
        span: {
          startLine: lineIndex + 1,
          startColumn: 0,
          endLine: lineIndex + 1,
          endColumn: rawLine.length,
        },
        isExported: trimmed.startsWith("export") || trimmed.startsWith("pub"),
      });
      continue;
    }

    // Track braces inside class to avoid premature class reset
    if (currentClass) {
      const opens = (trimmed.match(/{/g) || []).length;
      const closes = (trimmed.match(/}/g) || []).length;
      classBraceDepth += opens - closes;

      if (classBraceDepth <= 0 && language !== "python") {
        currentClass = undefined;
      }
    }

    // Method Declarations inside Class
    if (currentClass) {
      const methodMatch = trimmed.match(/^(?:(?:public|private|protected|async|static|readonly|pub(?:\([a-z_]+\))?)\s+)*([a-zA-Z0-9_$]+)\s*\(/);
      if (methodMatch && methodMatch[1] && methodMatch[1] !== "if" && methodMatch[1] !== "for" && methodMatch[1] !== "while" && methodMatch[1] !== "switch") {
        const name = methodMatch[1];
        symbols.push({
          name,
          qualifiedName: `${currentClass}.${name}`,
          kind: "method",
          filePath,
          span: {
            startLine: lineIndex + 1,
            startColumn: 0,
            endLine: lineIndex + 1,
            endColumn: rawLine.length,
          },
          isExported: !trimmed.startsWith("private"),
          parentName: currentClass,
        });
        continue;
      }
    }

    // Standalone Function Declarations (TS, JS, Python def, Rust fn)
    const funcMatch = trimmed.match(/^(?:export\s+|pub(?:\([a-z_]+\))?\s+)?(?:async\s+)?(?:function|def|fn)\s+([a-zA-Z0-9_$]+)/);
    if (funcMatch && funcMatch[1]) {
      const name = funcMatch[1];
      symbols.push({
        name,
        qualifiedName: name,
        kind: "function",
        filePath,
        span: {
          startLine: lineIndex + 1,
          startColumn: 0,
          endLine: lineIndex + 1,
          endColumn: rawLine.length,
        },
        isExported: trimmed.startsWith("export") || trimmed.startsWith("pub"),
      });
      continue;
    }

    // Interfaces & Types
    const ifaceMatch = trimmed.match(/^(?:export\s+|pub(?:\([a-z_]+\))?\s+)?(?:interface|type)\s+([a-zA-Z0-9_$]+)/);
    if (ifaceMatch && ifaceMatch[1]) {
      const name = ifaceMatch[1];
      symbols.push({
        name,
        qualifiedName: name,
        kind: trimmed.includes("interface") ? "interface" : "type",
        filePath,
        span: {
          startLine: lineIndex + 1,
          startColumn: 0,
          endLine: lineIndex + 1,
          endColumn: rawLine.length,
        },
        isExported: trimmed.startsWith("export") || trimmed.startsWith("pub"),
      });
      continue;
    }
  }

  return {
    filePath,
    language,
    symbols,
    imports,
  };
}
