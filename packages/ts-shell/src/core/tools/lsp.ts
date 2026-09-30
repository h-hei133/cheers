import * as fsSync from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { approvedResult, deniedResult } from "./toolResultLifecycle.js";
import type { ToolDefinition } from "../../tools/types.js";
import type { ExecutionService } from "../../runtime/execution/service.js";
import { parseSourceSymbols, detectLanguageFromPath } from "../../context/graph/ast/parser.js";
import ts from "typescript";
import { TOOL_APPROVED_READ_AUTHORITY } from "./grep.js";

/**
 * /lsp tool
 *
 * Code intelligence over the source it can parse: definitions, references and
 * symbol listings.
 *
 * It is a symbol scanner rather than a language server. The operations are
 * answered by parsing the workspace's own source, so there is no server to
 * start and nothing to configure, and the answers are as good as the parser.
 * It takes no line or column: a query is a name, and pretending to accept a
 * position would invite callers to expect the precision of a real language
 * server while getting a text scan.
 */
export function createLspToolDefinition(
  executionService: ExecutionService,
): ToolDefinition {
  return {
    name: "lsp",
    description:
      "Code intelligence over the workspace's source: jump to definition, find references, or list document and workspace symbols. This is a symbol scanner, not a language server — queries are by symbol name, not by file position.",
    argsSchema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: [
            "definition",
            "references",
            "hover",
            "documentSymbol",
            "workspaceSymbol",
          ],
          description: "The code intelligence operation to perform.",
        },
        filePath: {
          type: "string",
          description: "Relative file path in the workspace.",
        },
        symbol: {
          type: "string",
          description: "Symbol name or query to search for.",
        },
      },
      required: ["operation"],
    },
    async execute(args, context) {
      const op = typeof args.operation === "string" ? args.operation : "";
      if (!op) {
        return deniedResult("Error: operation parameter is required for lsp.");
      }

      const filePath = typeof args.filePath === "string" ? args.filePath.trim() : "";
      const symbolQuery = typeof args.symbol === "string" ? args.symbol.trim() : "";

      if (op === "documentSymbol") {
        if (!filePath) {
          return deniedResult("Error: filePath parameter is required for documentSymbol operation.");
        }
        try {
          const content = await readSource(executionService, context.workspaceRoot, filePath);
          const parsed = parseSourceSymbols(filePath, content);
          const symbols = parsed.symbols.map(
            (symbol) =>
              `- ${symbol.kind === "class" ? "Class" : symbol.kind === "function" ? "Function" : symbol.kind === "method" ? "Method" : symbol.kind === "interface" ? "Type/Interface" : symbol.kind === "type" ? "Type/Interface" : "Constant"}: \`${symbol.qualifiedName}\` (line ${symbol.span.startLine}:${symbol.span.startColumn})`,
          );
          return approvedResult(
            symbols.length > 0
              ? `# Document Symbols in \`${filePath}\`\n\n${symbols.join("\n")}`
              : `No top-level declarations detected in \`${filePath}\`.`,
          );
        } catch (error: unknown) {
          return deniedResult(
            `Failed to read document symbols for ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      if (op === "definition" || op === "references" || op === "workspaceSymbol") {
        if (!symbolQuery && !filePath) {
          return deniedResult("Error: symbol or filePath parameter is required for definition/references/workspaceSymbol.");
        }

        const query = symbolQuery || (filePath ? path.basename(filePath, path.extname(filePath)) : "");
        const allFiles = await executionService.listFilesRecursive({
          operationKind: "file.list",
          absoluteRoot: context.workspaceRoot,
          workspaceRoot: context.workspaceRoot,
          authority: TOOL_APPROVED_READ_AUTHORITY,
          caller: "core-tool:lsp",
          reason: "Scan workspace files for code intelligence symbols.",
          reportSafeTarget: context.workspaceRoot,
        });
        const targetFiles = allFiles.filter((file) => /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(file));
        const matches: Array<{ file: string; line: number; text: string; isDefinition: boolean }> = [];

        for (const relative of targetFiles) {
          if (matches.length >= 100) break;
          try {
            const content = await readSource(executionService, context.workspaceRoot, relative);
            const parsed = parseSourceSymbols(relative, content);
            for (const symbol of parsed.symbols) {
              if (symbol.name !== query && symbol.qualifiedName !== query) continue;
              matches.push({
                file: relative,
                line: symbol.span.startLine,
                text: `${symbol.kind} ${symbol.qualifiedName}`,
                isDefinition: true,
              });
              if (matches.length >= 100) break;
            }
            if (op === "references" && matches.length < 100) {
              for (const use of identifierUses(relative, content, query)) {
                if (matches.length >= 100) break;
                const already = matches.some(
                  (match) => match.file === relative && match.line === use.line,
                );
                if (!already) {
                  matches.push({ file: relative, line: use.line, text: use.text, isDefinition: false });
                }
              }
            }
          } catch {
            // Skip unreadable files; the workspace scan remains best effort.
          }
        }

        if (op === "definition") {
          return approvedResult(
            matches.filter((match) => match.isDefinition).length > 0
              ? `# Definitions for \`${query}\`\n\n${matches.filter((match) => match.isDefinition).map((match) => `- \`${match.file}:${match.line}\`: \`${match.text}\``).join("\n")}`
              : `No definition found for symbol \`${query}\`.`,
          );
        }
        if (op === "references") {
          return approvedResult(
            matches.length > 0
              ? `# References to \`${query}\` (${matches.length} found)\n\n${matches.slice(0, 50).map((match) => `- \`${match.file}:${match.line}\`: ${match.text}`).join("\n")}`
              : `No references found for symbol \`${query}\`.`,
          );
        }
        return approvedResult(
          matches.length > 0
            ? `# Workspace Symbol Matches for \`${query}\` (${matches.length} found)\n\n${matches.slice(0, 30).map((match) => `- \`${match.file}:${match.line}\`: ${match.text}`).join("\n")}`
            : `No workspace symbols matched query \`${query}\`.`,
        );
      }


      if (op === "hover") {
        if (!filePath) {
          return deniedResult("Error: filePath parameter is required for hover operation.");
        }
        const resolvedPath = path.isAbsolute(filePath)
          ? filePath
          : path.join(context.workspaceRoot, filePath);

        if (!fsSync.existsSync(resolvedPath)) {
          return deniedResult(`File not found for hover: ${filePath}`);
        }

        try {
          const content = fsSync.readFileSync(resolvedPath, "utf8");
          const parseResult = parseSourceSymbols(filePath, content);
          const matchedSymbol = parseResult.symbols.find(
            (s) => s.name === symbolQuery || s.qualifiedName === symbolQuery,
          );
          if (matchedSymbol) {
            return approvedResult(
              `# Hover Symbol Information (\`${matchedSymbol.name}\`)\n` +
              `- **Kind**: \`${matchedSymbol.kind}\`\n` +
              `- **Qualified Name**: \`${matchedSymbol.qualifiedName}\`\n` +
              `- **Exported**: ${matchedSymbol.isExported ? "Yes" : "No"}\n` +
              `- **File Span**: Line ${matchedSymbol.span.startLine}:${matchedSymbol.span.startColumn} - Line ${matchedSymbol.span.endLine}:${matchedSymbol.span.endColumn}\n` +
              (matchedSymbol.parentName ? `- **Parent Scope**: \`${matchedSymbol.parentName}\`\n` : ""),
            );
          }

          return approvedResult(
            `# Hover Information for \`${symbolQuery || filePath}\`\n` +
            `Target symbol is part of \`${filePath}\` (Language: ${parseResult.language}, Total symbols in module: ${parseResult.symbols.length}).`,
          );
        } catch (err) {
          return deniedResult(`Failed to extract hover information: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      return deniedResult(`Unknown LSP operation: ${op}`);
    },
  };
}
/**
 * Lines where `name` is used as an identifier, for TS/JS-family sources.
 *
 * A reference is an identifier, not a word: the same letters in a comment, a
 * string literal or an import path are prose or spelling, not a use the code
 * depends on. Walking the AST's identifier nodes is what keeps those out; a
 * line regex cannot tell them apart and counts every occurrence.
 *
 * Sources outside the TS/JS family fall back to no uses rather than to a word
 * scan: reporting prose as a reference is the failure this exists to prevent,
 * and a non-TS file simply has no reference to find here.
 */
function identifierUses(
  relative: string,
  content: string,
  name: string,
): Array<{ line: number; text: string }> {
  const language = detectLanguageFromPath(relative);
  if (language !== "typescript" && language !== "javascript") return [];
  const sourceFile = ts.createSourceFile(relative, content, ts.ScriptTarget.Latest, true);
  const uses: Array<{ line: number; text: string }> = [];
  const seen = new Set<number>();
  const walk = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === name) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      if (!seen.has(line)) {
        seen.add(line);
        uses.push({ line, text: (content.split("\n")[line - 1] ?? "").trim() });
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sourceFile);
  return uses;
}


async function readSource(
  executionService: ExecutionService,
  workspaceRoot: string,
  relativePath: string,
): Promise<string> {
  const target = path.resolve(workspaceRoot, relativePath);
  return executionService.readTextFile({
    operationKind: "file.read",
    absolutePath: target,
    workspaceRoot,
    authority: TOOL_APPROVED_READ_AUTHORITY,
    caller: "core-tool:lsp",
    reason: "Read an approved source file for code intelligence.",
    reportSafeTarget: target,
  });
}
