import { SkillLoader, type Skill, type SkillCollision, type SkillDiagnostic } from "./skillLoader.js";
import { projectTrust } from "../security/projectTrust.js";
import { catalogContributions, type CatalogContribution } from '../catalog/contributions.js';
import { SkillDiscovery } from './discovery.js';

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
  readonly sessionId?: string;
  /**
   * Files or directories named on the command line. A file loads directly; a
   * directory is searched the way a discovered one is.
   */
  readonly skillPaths?: readonly string[];
  /** Skip every discovered root; named paths still load. */
  readonly noSkills?: boolean;
  readonly abortSignal?: AbortSignal;
}

export interface SkillCatalogResult {
  /** Revalidate the same captured discovery dependencies immediately before admission. */
  readonly verify?: () => void;
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
export async function resolveSkillCatalog(options: SkillCatalogOptions, onSource?: (target: string) => void): Promise<SkillCatalogResult> {
  const discovery = new SkillDiscovery(options.abortSignal);
  const loader = new SkillLoader(options.workspaceRoot, {
    ...(options.skillPaths && options.skillPaths.length > 0 ? { extraPaths: options.skillPaths } : {}),
    ...(options.noSkills ? { disableDiscovery: true } : {}),
    ...(onSource ? { onSource } : {}),
    abortSignal: options.abortSignal,
    discovery,
    allowProject: !projectTrust.isProjectUntrusted(options.workspaceRoot),
  });
  const loaded = await loader.loadDetailed();
  const { collisions, diagnostics, failures } = loaded;
  const skills = new Map(loaded.skills);
  const owners = new Map<string, CatalogContribution>();
  if (!options.noSkills) for (const entry of catalogContributions(options.workspaceRoot, options.sessionId)) {
    const contributed = await abortable(entry.skills(options.abortSignal, discovery), options.abortSignal);
    options.abortSignal?.throwIfAborted();
    if (!catalogContributions(options.workspaceRoot, options.sessionId).includes(entry)) continue;
    for (const skill of contributed) if (!skills.has(skill.name) && skill.isCurrent?.() !== false) {
      skills.set(skill.name, skill); owners.set(skill.name, entry);
    }
  }
  options.abortSignal?.throwIfAborted();
  discovery.verify();
  const current = new Set(catalogContributions(options.workspaceRoot, options.sessionId));
  for (const [name, skill] of skills) {
    if (skill.isCurrent?.() === false || owners.has(name) && !current.has(owners.get(name)!)) skills.delete(name);
  }
  if (!projectTrust.isProjectUntrusted(options.workspaceRoot)) {
    return { skills, collisions, diagnostics, failures, verify: () => discovery.verify() };
  }
  return {
    skills: new Map([...skills].filter(([, skill]) => skill.source === "user" || skill.source === "cli" || skill.source === 'extension')),
    collisions,
    diagnostics,
    failures,
    verify: () => discovery.verify(),
  };
}

function abortable<T>(value: T | PromiseLike<T>, signal?: AbortSignal): Promise<T> {
  const promise = Promise.resolve(value);
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let abortTimer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = (): void => {
      signal.removeEventListener('abort', abort);
      if (abortTimer !== undefined) clearTimeout(abortTimer);
    };
    const abort = (): void => {
      abortTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(signal.reason);
      }, 0);
    };
    signal.addEventListener('abort', abort, { once: true });
    promise.then(value => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    }, error => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
  });
}
