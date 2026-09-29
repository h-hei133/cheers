import path from "node:path";

/**
 * Where a project's memory lives.
 *
 * Under the project, so a recorded fact travels with the repository and a
 * teammate who checks it out reads the same memory. `project/` is a directory
 * rather than the parent, and that is not cosmetic: subagent memories name a
 * directory after each agent (`<root>/.agents/memory/<agentName>/MEMORY.md`)
 * while this store writes its records file directly into the root it is given,
 * so sharing the path would mix files and directories in one place.
 */
export function projectMemoryRootFor(projectRoot: string): string {
  return path.join(projectRoot, ".agents", "memory", "project");
}
