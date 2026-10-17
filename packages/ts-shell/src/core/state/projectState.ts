import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveUserDataFile, userHomeDir } from "../paths/userHome.js";
import { assertProfileStorage } from '../paths/profile/context.js';
import { profileWorkspaceDir } from '../paths/profile/workspace.js';

/**
 * Durable per-project state for choices that outlive a turn.
 *
 * Sampling and thinking preferences remain project-scoped. The goal field is a
 * legacy description available only through explicit session import; new goals
 * live in the session store and never steer another session automatically.
 *
 * Reads never throw. A state file that is missing, truncated, or written by a
 * newer version reads as "nothing recorded", because a lost objective should cost
 * a re-typed command rather than the session.
 */

export type GoalPhase = "active" | "paused" | "complete";

export interface StoredGoal {
  readonly objective: string;
  readonly phase: GoalPhase;
  readonly updatedAt: string;
}

/** How much reasoning to ask the provider for, or nothing to leave it to decide. */
import type { ThinkingLevel as ThinkingEffort } from '../models/effort.js';
export type { ThinkingLevel as ThinkingEffort } from '../models/effort.js';

export interface ProjectState {
  /** Legacy description only. /goal import copies it into a paused session goal. */
  readonly goal?: StoredGoal | null;
  /** Legacy sampling preference, retained for migration notices; it no longer controls requests. */
  readonly fastSampling?: boolean;
  readonly thinkingEffort?: ThinkingEffort | null;
}

const STATE_FILE = "state.json";
/** Markers that identify the top of a project, nearest one wins. */
const ROOTS = [".git", ".agents"];

/** The directory this state belongs to: the project `from` sits in. */
export function projectRootOf(from: string): string {
  let current = path.resolve(from);
  for (;;) {
    if (ROOTS.some((marker) => fs.existsSync(path.join(current, marker)))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(from);
    current = parent;
  }
}

/**
 * Where this project's state lives.
 *
 * The directory name carries the project's own name so the store is legible when
 * someone looks at it, and a hash of the full path so two projects with the same
 * name do not share one file. Anything else durable and project-scoped belongs
 * beside it rather than in a directory convention of its own.
 */
export function projectStateDir(from: string): string {
  const root = projectRootOf(from);
  const privateRoot = profileWorkspaceDir(root);
  if (privateRoot) return privateRoot;
  const home = userHomeDir();
  const digest = crypto.createHash("sha256").update(root).digest("hex").slice(0, 8);
  // The directory is keyed by project path, so the name is stable across the
  // rename and a project recorded under an older directory is found there rather
  // than read as "nothing recorded".
  return resolveUserDataFile(
    path.join("projects", `${path.basename(root)}-${digest}`),
    home,
  );
}

/** Where this project's standing choices are recorded. */
export function projectStatePath(from: string): string {
  const target = path.join(projectStateDir(from), STATE_FILE);
  assertProfileStorage(target);
  return target;
}

/** Everything recorded for this project, or an empty state. */
export function readProjectState(from: string): ProjectState {
  try {
    const raw = fs.readFileSync(projectStatePath(from), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return normalize(parsed as Record<string, unknown>);
  } catch {
    return {};
  }
}

/**
 * Merge `patch` into the recorded state and return where it was written, or
 * undefined when the write could not happen — an unwritable home is worth knowing
 * about rather than reporting a choice as kept when it was not.
 */
export function writeProjectState(from: string, patch: ProjectState): string | undefined {
  const target = projectStatePath(from);
  const next = { version: 1, ...readProjectState(from), ...patch };
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return target;
  } catch {
    return undefined;
  }
}

/** Only fields shaped the way this version expects, so a stray value cannot spread. */
function normalize(raw: Record<string, unknown>): ProjectState {
  const state: {
    goal?: StoredGoal | null;
    fastSampling?: boolean;
    thinkingEffort?: ThinkingEffort;
  } = {};
  const goal = raw.goal;
  if (goal && typeof goal === "object" && !Array.isArray(goal)) {
    const candidate = goal as Record<string, unknown>;
    const phase = candidate.phase;
    if (
      typeof candidate.objective === "string" &&
      candidate.objective.length > 0 &&
      (phase === "active" || phase === "paused" || phase === "complete")
    ) {
      state.goal = {
        objective: candidate.objective,
        phase,
        updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : "",
      };
    }
  }
  if (typeof raw.fastSampling === "boolean") state.fastSampling = raw.fastSampling;
  if (raw.thinkingEffort === "low" || raw.thinkingEffort === "medium" || raw.thinkingEffort === "high") {
    state.thinkingEffort = raw.thinkingEffort;
  }
  return state;
}
