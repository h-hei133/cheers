import { resolveSkillCatalog } from "../../../core/skills/skillCatalog.js";
import { userDataSearchDirs } from "../../../core/paths/userHome.js";
import { projectDirectories } from "../../../core/project/directories.js";
import { IGNORE_FILE_NAMES } from "../../../runtime/execution/ignoreRules.js";
import type { ShellRuntimeContext } from "../../../core/shell/runtimeContext.js";
import { createCatalogObservation } from "./observation.js";
import { observeCatalogContributions } from '../../../core/catalog/contributions.js';

/** Observe the discovery owner's visited paths; never walk a second skill tree. */
export function createSkillCatalog() {
  const observation = createCatalogObservation();
  return {
    observe: (changed: () => void) => { const stop = observation.observe(changed); const close = observeCatalogContributions(undefined, changed); return () => { stop(); close(); }; },
    read: (context: ShellRuntimeContext, signal?: AbortSignal) => observation.read(async track => {
      // Ancestor ignore files can change discovery without modifying a skill directory.
      for (const directory of projectDirectories(context.cwd)) {
        for (const name of IGNORE_FILE_NAMES) track(path.join(directory, name));
      }
      for (const directory of userDataSearchDirs()) track(path.join(directory, "trust.json"));
      const catalog = await resolveSkillCatalog({ workspaceRoot: context.cwd, sessionId: context.session.id, ...context.skillOptions, abortSignal: signal }, track);
      return [...catalog.skills.values()].map(skill => ({ value: skill.name, label: skill.name, kind: 'skill' as const, identity: skill.filePath, detail: skill.description }));
    }),
  };
}
import path from "node:path";
