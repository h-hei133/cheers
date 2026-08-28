export type SymbolKind =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "variable"
  | "enum"
  | "export";

export interface SymbolDeclaration {
  readonly name: string;
  readonly kind: SymbolKind;
  readonly filePath: string;
  readonly line: number;
  readonly isExported: boolean;
}

export interface SymbolTable {
  readonly symbols: readonly SymbolDeclaration[];
  readonly byName: ReadonlyMap<string, readonly SymbolDeclaration[]>;
  readonly byFile: ReadonlyMap<string, readonly SymbolDeclaration[]>;
}

export function extractSymbolsFromSource(
  filePath: string,
  sourceText: string,
): readonly SymbolDeclaration[] {
  const symbols: SymbolDeclaration[] = [];
  const lines = sourceText.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    // Check export modifiers
    const isExported = trimmed.startsWith("export ");

    // Match function declarations: function foo( or export function foo(
    const funcMatch = trimmed.match(/(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)/);
    if (funcMatch && funcMatch[1]) {
      symbols.push({
        name: funcMatch[1],
        kind: "function",
        filePath,
        line: i + 1,
        isExported,
      });
      continue;
    }

    // Match class declarations: class Foo or export class Foo
    const classMatch = trimmed.match(/(?:export\s+)?(?:abstract\s+)?class\s+([a-zA-Z0-9_$]+)/);
    if (classMatch && classMatch[1]) {
      symbols.push({
        name: classMatch[1],
        kind: "class",
        filePath,
        line: i + 1,
        isExported,
      });
      continue;
    }

    // Match interface declarations: interface Foo or export interface Foo
    const interfaceMatch = trimmed.match(/(?:export\s+)?interface\s+([a-zA-Z0-9_$]+)/);
    if (interfaceMatch && interfaceMatch[1]) {
      symbols.push({
        name: interfaceMatch[1],
        kind: "interface",
        filePath,
        line: i + 1,
        isExported,
      });
      continue;
    }

    // Match type alias declarations: type Foo = or export type Foo =
    const typeMatch = trimmed.match(/(?:export\s+)?type\s+([a-zA-Z0-9_$]+)\s*=/);
    if (typeMatch && typeMatch[1]) {
      symbols.push({
        name: typeMatch[1],
        kind: "type",
        filePath,
        line: i + 1,
        isExported,
      });
      continue;
    }

    // Match const/let declarations: const foo = or export const foo =
    const varMatch = trimmed.match(/(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*[:=]/);
    if (varMatch && varMatch[1]) {
      symbols.push({
        name: varMatch[1],
        kind: "variable",
        filePath,
        line: i + 1,
        isExported,
      });
      continue;
    }
  }

  return symbols;
}

export function buildSymbolTable(
  files: readonly { readonly filePath: string; readonly sourceText: string }[],
): SymbolTable {
  const allSymbols: SymbolDeclaration[] = [];
  const byNameMap = new Map<string, SymbolDeclaration[]>();
  const byFileMap = new Map<string, SymbolDeclaration[]>();

  for (const file of files) {
    const fileSymbols = extractSymbolsFromSource(file.filePath, file.sourceText);
    allSymbols.push(...fileSymbols);
    byFileMap.set(file.filePath, [...fileSymbols]);

    for (const sym of fileSymbols) {
      const existing = byNameMap.get(sym.name) ?? [];
      existing.push(sym);
      byNameMap.set(sym.name, existing);
    }
  }

  return {
    symbols: allSymbols,
    byName: byNameMap,
    byFile: byFileMap,
  };
}
