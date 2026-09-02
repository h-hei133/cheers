import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Durable per-project state for choices that outlive a turn.
 *
 * Some things a command sets are not preferences and not conversation: they are
 * standing instructions for how work in this project proceeds. An objective is the
 * clearest case — it exists to stop a long piece of work from drifting, and long
 * work is exactly what spans restarts, so holding it in a process variable defeats
 * the reason for having it.
 *
 * It is deliberately not the settings file: settings are written by the user and
 * often committed, and an agent quietly editing them would be a surprise. It is
 * also deliberately not the session: a new session in the same project should
 * still know what the work is.
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

export interface ProjectState {
  readonly goal?: StoredGoal | null;
  /** Whether sampling is held down for shorter, more direct answers. */
  readonly fastSampling?: boolean;
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
  const home = process.env.USERPROFILE ?? process.env.HOME ?? os.homedir();
  const digest = crypto.createHash("sha256").update(root).digest("hex").slice(0, 8);
  return path.join(home, ".private-agents", "projects", `${path.basename(root)}-${digest}`);
}

/** Where this project's standing choices are recorded. */
export function projectStatePath(from: string): string {
  return path.join(projectStateDir(from), STATE_FILE);
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
  const state: { goal?: StoredGoal | null; fastSampling?: boolean } = {};
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
  return state;
}
