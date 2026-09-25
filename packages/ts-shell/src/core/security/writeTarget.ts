import path from "node:path";
import { verifyPathContainment } from "./pathJail.js";

/**
 * Where a command may write.
 *
 * Two commands take a destination from the user — exporting a session and
 * writing a report — and both resolved it with a bare `path.resolve`, which
 * means a mistyped relative path silently escaped the workspace and overwrote
 * whatever was there. The tools that write files have always been checked
 * against the workspace; these were not, and the reason they were not is that
 * the user typed the path themselves. That reasoning covers intent, not typos.
 *
 * So the three outcomes are kept apart:
 *
 *   - inside the workspace: written, no question
 *   - a relative path that climbs out: refused. Nobody means to write to
 *     `../../../.bashrc`; that is a typo with a destructive result.
 *   - an absolute path outside the workspace: allowed only when asked for
 *     explicitly. Exporting to a desktop directory is a real thing to want, and
 *     refusing it outright would break a legitimate use to prevent a mistake
 *     the other two rules already prevent.
 *
 * The confirmation is an argument the caller passes, not a prompt this raises.
 * Commands here are one-shot and have no interactive channel, and the rest of
 * the tree already states a risky intent this way (`--confirm execute`), so a
 * write outside the workspace asks for the same kind of statement rather than
 * inventing a second one.
 */

export interface WriteTargetRequest {
  /** What the user asked for, when they asked for anything. */
  readonly requested?: string;
  /** The directory a relative path is resolved against. */
  readonly root: string;
  /**
   * Whether this command's own default destination lands outside the workspace.
   *
   * A command whose default is already outside — a machine report, say — is
   * telling us that writing outside is its normal business, so an absolute path
   * outside is not a departure that needs stating. One whose default is inside
   * the workspace is the opposite case: an absolute path outside is the user
   * deliberately leaving, and that is worth a statement.
   *
   * Without this, the same rule would be too strict for one command and too
   * loose for the other, because "outside" does not mean the same thing to both.
   */
  readonly defaultOutside?: boolean;
  /**
   * Whether the caller stated an intent to write outside the workspace.
   *
   * Not a bypass: it is what separates an absolute path the user meant from a
   * relative path they fumbled. Without it, an absolute path outside a
   * workspace-defaulting command is refused like any other escape.
   */
  readonly allowOutside?: boolean;
}

export type WriteTargetDecision =
  | { readonly allowed: true; readonly resolvedPath: string; readonly outside: boolean }
  | { readonly allowed: false; readonly reason: string; readonly doNext: string };

/** Resolve and judge a destination, without touching the filesystem. */
export function resolveWriteTarget(request: WriteTargetRequest): WriteTargetDecision {
  const requested = request.requested?.trim();
  if (!requested) {
    return {
      allowed: false,
      reason: "No destination was given.",
      doNext: "Name a file to write, or run the command with no argument to use its default name.",
    };
  }

  // `~user` names another user's home, which this does not resolve. Left to
  // `path.resolve` it becomes a directory literally called `~user` inside the
  // workspace — a write that succeeds somewhere the user did not name, which is
  // worse than one that is refused and says so.
  if (OTHER_USER_HOME.test(requested)) {
    return {
      allowed: false,
      reason: "`~user` is not supported; only `~` and `~/path` are expanded.",
      doNext: "Use `~/path` for your own home directory, or give an absolute path.",
    };
  }

  const absolute = path.isAbsolute(requested) || requested.startsWith("~");
  const resolved = path.resolve(request.root, expandHome(requested));

  // The jail answers "is this inside the workspace", which is the only question
  // that has to be answered for the common case.
  const containment = verifyPathContainment(resolved, request.root);
  if (containment.allowed) {
    return { allowed: true, resolvedPath: containment.resolvedPath, outside: false };
  }

  if (!absolute) {
    // A relative path that leaves the workspace is a mistake, never an intent.
    return {
      allowed: false,
      reason: `\`${requested}\` resolves outside the workspace (${containment.resolvedPath}).`,
      doNext:
        "Write inside the workspace, or pass an absolute path if you meant to write elsewhere.",
    };
  }

  if (!request.allowOutside && !request.defaultOutside) {
    return {
      allowed: false,
      reason: `\`${requested}\` is outside the workspace (${containment.resolvedPath}).`,
      doNext:
        "Re-run with the confirmation flag if you meant to write outside the workspace, or choose a path inside it.",
    };
  }

  return { allowed: true, resolvedPath: containment.resolvedPath, outside: true };
}

/** `~name`, which names a home directory belonging to somebody else. */
const OTHER_USER_HOME = /^~[A-Za-z0-9_-]/;

/**
 * `~` at the front of a path, as the shell would have expanded it.
 *
 * A path the user typed in a shell usually arrives already expanded, but one
 * typed into a command argument does not, and `path.resolve` would read the
 * literal `~` as a directory name — producing a write into a folder called
 * `~` rather than the home directory the user named.
 */
function expandHome(value: string): string {
  if (value !== "~" && !value.startsWith("~/")) return value;
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (!home) return value;
  return value === "~" ? home : path.join(home, value.slice(2));
}
