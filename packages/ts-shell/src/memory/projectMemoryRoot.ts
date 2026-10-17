import path from "node:path";
import { profileWorkspaceDir } from '../core/paths/profile/workspace.js';

/**
 * Where a project's memory lives.
 *
 * Default-profile memory stays under the project for compatibility; named
 * profiles keep mutable memory in their private canonical-workspace root.
 * `project/` is a directory
 * rather than the parent, and that is not cosmetic: subagent memories name a
 * directory after each agent (`<root>/.agents/memory/<agentName>/MEMORY.md`)
 * while this store writes its records file directly into the root it is given,
 * so sharing the path would mix files and directories in one place.
 */
export function projectMemoryRootFor(projectRoot: string): string {
  const privateRoot = profileWorkspaceDir(projectRoot);
  return privateRoot ? path.join(privateRoot, 'memory', 'project') : path.join(projectRoot, ".agents", "memory", "project");
}
