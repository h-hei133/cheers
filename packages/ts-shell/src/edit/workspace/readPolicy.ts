import fs from "node:fs";
import path from "node:path";

export function pathStaysInsideWorkspace(input: {
  readonly workspaceRoot: string;
  readonly absolutePath: string;
}): boolean {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const absolutePath = path.resolve(input.absolutePath);
  const relative = path.relative(workspaceRoot, absolutePath);
  return (
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
  );
}

export function createWorkspaceFileReader(
  workspaceRootInput: string,
): (absolutePath: string) => string | undefined {
  const workspaceRoot = path.resolve(workspaceRootInput);
  return (absolutePath) => {
    const resolved = path.resolve(absolutePath);
    if (!pathStaysInsideWorkspace({ workspaceRoot, absolutePath: resolved })) {
      return undefined;
    }
    try {
      return fs.readFileSync(resolved, "utf8");
    } catch {
      return undefined;
    }
  };
}

export function readWorkspaceFileMap(input: {
  readonly workspaceRoot: string;
  readonly targetPath?: string;
  readonly targetLabel?: string;
}): ReadonlyMap<string, string> | undefined {
  if (!input.targetPath || !input.targetLabel) return undefined;
  const absolutePath = path.resolve(input.workspaceRoot, input.targetPath);
  const content = createWorkspaceFileReader(input.workspaceRoot)(absolutePath);
  return content === undefined
    ? undefined
    : new Map([[input.targetLabel, content]]);
}
