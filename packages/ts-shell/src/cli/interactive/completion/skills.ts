import path from "node:path";
import { resolveSkillCatalog } from "../../../core/skills/skillCatalog.js";
import { userDataSearchDirs } from "../../../core/paths/userHome.js";
import { projectDirectories } from "../../../core/project/directories.js";
import { IGNORE_FILE_NAMES } from "../../../runtime/execution/ignoreRules.js";
import type { ShellRuntimeContext } from "../../../core/shell/runtimeContext.js";
import { observeDirectory } from "./watch.js";

/** Observe the discovery owner's visited paths; never walk a second skill tree. */
export function createSkillCatalog() {
  const watchers = new Map<string, () => void>();
  let changed: (() => void) | undefined;
  const stop = () => {
    changed = undefined;
    for (const close of watchers.values()) close();
    watchers.clear();
  };
  const read = (context: ShellRuntimeContext) => {
    const visited = new Set<string>();
    const track = (target: string) => {
      const absolute = path.resolve(target);
      if (!changed || visited.size >= 256) return;
      visited.add(absolute);
      if (!watchers.has(absolute) && watchers.size >= 256) {
        const stale = [...watchers.keys()].find(target => !visited.has(target));
        if (stale) { watchers.get(stale)!(); watchers.delete(stale); }
      }
      if (!watchers.has(absolute)) watchers.set(absolute, observeDirectory(absolute, () => changed?.()));
    };
    // Ancestor ignore files can change discovery without modifying a skill directory.
    for (const directory of projectDirectories(context.cwd)) {
      for (const name of IGNORE_FILE_NAMES) track(path.join(directory, name));
    }
    for (const directory of userDataSearchDirs()) track(path.join(directory, "trust.json"));
    try {
      const catalog = resolveSkillCatalog({ workspaceRoot: context.cwd, ...context.skillOptions }, track);
      return [...catalog.skills.values()].map(skill => ({ value: skill.name, label: skill.name, detail: skill.description }));
    } finally {
      for (const [target, close] of watchers) {
        if (!visited.has(target)) { close(); watchers.delete(target); }
      }
    }
  };
  return { read, observe: (notify: () => void) => { stop(); changed = notify; return stop; } };
}
