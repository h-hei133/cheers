import { cdSyntax, workspaceSyntax } from "../../../core/commands/workspace/syntax.js";
import { exportSyntax } from "../../../core/commands/export/syntax.js";
import { reportSyntax } from "../../../core/commands/report/syntax.js";
import { parseSyntax } from "../../../core/commands/syntax/parse.js";

/** Validate the whole shape with a placeholder at the path slot. */
export function pathKind(name: string | undefined, before: readonly string[], after: readonly string[]): "directory" | "file" | undefined {
  const syntax = name === "cd" ? cdSyntax : name === "workspace" ? workspaceSyntax : name === "export" ? exportSyntax : name === "report" ? reportSyntax : undefined;
  if (!syntax) return undefined;
  const placeholder = "completion-target";
  const parsed = parseSyntax(syntax, [...before, placeholder, ...after]);
  if (!parsed.ok || parsed.args[0] !== placeholder) return undefined;
  if (name === "workspace" && parsed.action.name !== "attach") return undefined;
  return name === "cd" || name === "workspace" ? "directory" : "file";
}
