import * as fsSync from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { approvedResult, deniedResult } from "./toolResultLifecycle.js";
import type { ToolDefinition } from "../../tools/types.js";
import type { ExecutionService } from "../../runtime/execution/service.js";
import { parseSourceSymbols } from "../../context/graph/ast/parser.js";
import { TOOL_APPROVED_READ_AUTHORITY } from "./grep.js";

/**
 * /lsp tool
 * Code intelligence operations: definition, references, hover, documentSymbol, workspaceSymbol
 */
export function createLspToolDefinition(
  executionService: ExecutionService,
): ToolDefinition {
  return {
    name: "lsp",
    description:
      "Perform code intelligence operations: jump to definition, find all references, hover type signature, or list document/workspace symbols.",
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
        line: {
          type: "number",
          description: "1-based line number in the target file.",
        },
        character: {
          type: "number",
          description: "1-based character offset on the target line.",
        },
        symbol: {
          type: "string",
          description: "Symbol name or query to search for.",
        },
      },
      required: ["operation"],
    },
    permissions: { check: () => [] },
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
        const fullPath = path.resolve(context.workspaceRoot, filePath);
        try {
          const stat = await fs.stat(fullPath);
          if (stat.size > 5 * 1024 * 1024) {
            return deniedResult(`File ${filePath} exceeds maximum 5MB size limit for documentSymbol.`);
          }
          const content = await fs.readFile(fullPath, "utf8");
          const lines = content.split("\n");
          const symbols: string[] = [];

          lines.forEach((line, idx) => {
            const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)/);
            const classMatch = line.match(/(?:export\s+)?class\s+([a-zA-Z0-9_$]+)/);
            const typeMatch = line.match(/(?:export\s+)?(?:type|interface)\s+([a-zA-Z0-9_$]+)/);
            const constMatch = line.match(/(?:export\s+)?const\s+([a-zA-Z0-9_$]+)\s*=/);

            if (funcMatch) symbols.push(`- Function: \`${funcMatch[1]}\` (line ${idx + 1})`);
            if (classMatch) symbols.push(`- Class: \`${classMatch[1]}\` (line ${idx + 1})`);
            if (typeMatch) symbols.push(`- Type/Interface: \`${typeMatch[1]}\` (line ${idx + 1})`);
            if (constMatch) symbols.push(`- Constant: \`${constMatch[1]}\` (line ${idx + 1})`);
          });

          return approvedResult(
            symbols.length > 0
              ? `# Document Symbols in \`${filePath}\`\n\n${symbols.join("\n")}`
              : `No top-level declarations detected in \`${filePath}\`.`,
          );
        } catch (err: any) {
          return deniedResult(`Failed to read document symbols for ${filePath}: ${err.message}`);
        }
      }

      if (op === "definition" || op === "references" || op === "workspaceSymbol") {
        if (!symbolQuery && !filePath) {
          return deniedResult("Error: symbol or filePath parameter is required for definition/references/workspaceSymbol.");
        }

        const query = symbolQuery || (filePath ? path.basename(filePath, path.extname(filePath)) : "");
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const symbolWordRegex = new RegExp(`\\b${escapedQuery}\\b`);
        const defRegex = new RegExp(`(?:function|class|interface|type|const|let|var|enum)\\s+${escapedQuery}\\b`);

        const allFiles = await executionService.listFilesRecursive({
          operationKind: "file.list",
          absoluteRoot: context.workspaceRoot,
          workspaceRoot: context.workspaceRoot,
          authority: TOOL_APPROVED_READ_AUTHORITY,
          caller: "core-tool:lsp",
          reason: "Scan workspace files for code intelligence symbols.",
          reportSafeTarget: context.workspaceRoot,
        });

        // The walk already applied the shared prune and ignore policy; this only
        // narrows to the extensions the symbol scan understands.
        const targetFiles = allFiles.filter(
          (f) => f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".js"),
        );

        const matches: Array<{ file: string; line: number; text: string; isDef: boolean }> = [];

        for (const rel of targetFiles) {
          if (matches.length >= 100) break;
          const fullPath = path.resolve(context.workspaceRoot, rel);
          try {
            const stat = await fs.stat(fullPath);
            if (stat.size > 5 * 1024 * 1024) continue;
            const content = await fs.readFile(fullPath, "utf8");
            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
              const l = lines[i];
              if (symbolWordRegex.test(l)) {
                const isDef = defRegex.test(l);
                matches.push({ file: rel, line: i + 1, text: l.trim(), isDef });
                if (matches.length >= 100) break;
              }
            }
          } catch {
            // Skip unreadable
          }
        }

        if (op === "definition") {
          const defs = matches.filter((m) => m.isDef);
          if (defs.length > 0) {
            return approvedResult(
              `# Definitions for \`${query}\`\n\n` +
                defs.map((d) => `- \`${d.file}:${d.line}\`: \`${d.text}\``).join("\n"),
            );
          }
          return approvedResult(
            matches.length > 0
              ? `# Best Candidate Definition for \`${query}\`\n\n- \`${matches[0].file}:${matches[0].line}\`: \`${matches[0].text}\``
              : `No definition found for symbol \`${query}\`.`,
          );
        }

        if (op === "references") {
          return approvedResult(
            matches.length > 0
              ? `# References to \`${query}\` (${matches.length} found)\n\n` +
                  matches.slice(0, 50).map((m) => `- \`${m.file}:${m.line}\`: ${m.text}`).join("\n")
              : `No references found for symbol \`${query}\`.`,
          );
        }

        return approvedResult(
          matches.length > 0
            ? `# Workspace Symbol Matches for \`${query}\`\n\n` +
                matches.slice(0, 30).map((m) => `- \`${m.file}:${m.line}\`: ${m.text}`).join("\n")
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
