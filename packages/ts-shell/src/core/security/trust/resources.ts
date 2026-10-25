import fs from 'node:fs';
import path from 'node:path';
import { projectConfigCandidates } from '../../paths/project.js';

export function hasSensitiveProjectResources(workspaceRoot: string): boolean {
    const normalized = path.resolve(workspaceRoot);

    // Named files first. These are the ones whose presence is the whole signal:
    // each holds a command, a rule about what may run, or instructions that reach
    // the model. A path here must be checked individually because it sits bare in
    // the workspace root, where the shape rule below cannot see it.
    const sensitiveFiles = [
      "SYSTEM.md",
      "AGENTS.md",
      "AGENTS.override.md",
      ...projectConfigCandidates(normalized, 'mcp.json'),
      path.join(".agents", "hooks.json"),
      path.join(".agents", "sandbox.json"),
    ];
    for (const indicator of sensitiveFiles) {
      if (fs.existsSync(path.isAbsolute(indicator) ? indicator : path.join(normalized, indicator))) {
        return true;
      }
    }

    // Then the shape rule, so a tool nobody has heard of yet still counts.
    const sensitiveSubdirectories = ["extensions", "agents", "skills", "hooks", "workflows"];
    return hasToolDefinitions(normalized, sensitiveSubdirectories);
  }

  /**
   * Whether any dot-directory here holds one of `subdirectories` — the shape every
   * tool uses for definitions it will later run.
   */
function hasToolDefinitions(root: string, subdirectories: readonly string[]): boolean {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const entry of entries) {
      if (!entry.name.startsWith(".")) continue;
      // A symlink to a directory is not `isDirectory()`, so a project could hide
      // its tool definitions behind one and go unreported. `existsSync` on the
      // joined path resolves the link for the check below either way, so the
      // directory test here only needs to exclude things that are plainly files.
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      for (const subdirectory of subdirectories) {
        if (fs.existsSync(path.join(root, entry.name, subdirectory))) return true;
      }
    }
    return false;
  }

