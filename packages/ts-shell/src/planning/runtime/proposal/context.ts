import path from "node:path";
import type { PlanningRuntimeEditTarget } from "../types.js";

export function readWorkspaceFile(
  workspaceRoot: string,
  relativePath: string,
  readFile: (absolutePath: string) => string | undefined,
): string | undefined {
  const resolvedWorkspace = path.resolve(workspaceRoot);
  const resolvedTarget = path.resolve(resolvedWorkspace, relativePath);

  // Prevent directory traversal attacks
  if (
    !resolvedTarget.startsWith(resolvedWorkspace + path.sep) &&
    resolvedTarget !== resolvedWorkspace
  ) {
    return undefined;
  }

  return readFile(resolvedTarget);
}

export function boundedTargetContent(
  content: string | undefined,
  maxBytes: number = 8000,
): string {
  if (!content) {
    return "(empty file)";
  }
  if (content.length <= maxBytes) {
    return content;
  }
  return `${content.slice(0, maxBytes)}\n... (content truncated for prompt context)`;
}

export function buildLiveProviderPromptContext(input: {
  readonly workspaceRoot: string;
  readonly editTargets: readonly PlanningRuntimeEditTarget[];
  readonly readFile: (absolutePath: string) => string | undefined;
}): string {
  const sections: string[] = [];

  for (const target of input.editTargets) {
    const content = readWorkspaceFile(
      input.workspaceRoot,
      target.path,
      input.readFile,
    );
    sections.push(
      `--- File: ${target.path} ---\n${boundedTargetContent(content)}`,
    );
  }

  return sections.join("\n\n");
}
