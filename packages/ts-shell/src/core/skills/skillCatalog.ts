import { SkillLoader, type Skill, type SkillCollision, type SkillDiagnostic } from "./skillLoader.js";
import { projectTrust } from "../security/projectTrust.js";

/**
 * The skills one run may offer, resolved from the flags it was started with.
 *
 * Discovery and the trust gate belong together and belong in one place: a run's
 * skill list is asked for by more than one caller — the prompt that names the
 * skills, and the `/skill` command and picker that read one out — and two copies
 * of this rule would let the list a user sees disagree with the list the model is
 * given. They did: the command path built its own loader with no flags and no
 * trust check, so `--skill` loaded a file the model could use while
 * `/skill:<name>` said no such skill existed, and an untrusted project's skill
 * expanded into a prompt when invoked by name.
 */

export interface SkillCatalogOptions {
  readonly workspaceRoot: string;
  /**
   * Files or directories named on the command line. A file loads directly; a
   * directory is searched the way a discovered one is.
   */
  readonly skillPaths?: readonly string[];
  /** Skip every discovered root; named paths still load. */
  readonly noSkills?: boolean;
}

export interface SkillCatalogResult {
  readonly skills: ReadonlyMap<string, Skill>;
  readonly collisions: readonly SkillCollision[];
  readonly diagnostics: readonly SkillDiagnostic[];
  /** Named paths that could not be loaded, with why. */
  readonly failures: readonly { readonly filePath: string; readonly message: string }[];
}

/**
 * The skills a run may use, with the trust gate already applied.
 *
 * A project explicitly marked untrusted contributes no project skills: they are
 * text that would enter the system prompt, and a repository nobody has vouched
 * for does not get to write there. User-level skills are the user's own, and so
 * are the paths the user named on the command line — a named file is a direct
 * instruction, whatever directory it happens to live in.
 */
export function resolveSkillCatalog(options: SkillCatalogOptions, onSource?: (target: string) => void): SkillCatalogResult {
  const loader = new SkillLoader(options.workspaceRoot, {
    ...(options.skillPaths && options.skillPaths.length > 0 ? { extraPaths: options.skillPaths } : {}),
    ...(options.noSkills ? { disableDiscovery: true } : {}),
    ...(onSource ? { onSource } : {}),
  });
  const { skills, collisions, diagnostics, failures } = loader.loadDetailed();
  if (!projectTrust.isProjectUntrusted(options.workspaceRoot)) {
    return { skills, collisions, diagnostics, failures };
  }
  return {
    skills: new Map([...skills].filter(([, skill]) => skill.source === "user" || skill.source === "cli")),
    collisions,
    diagnostics,
    failures,
  };
}
