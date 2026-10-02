import type { SubagentDefinition } from "./types.js";

/**
 * Tools a subagent may never be given, whatever its definition says.
 *
 * `task` is here so a subagent cannot spawn a subagent. That is true today by
 * construction — the runner builds its tool set without a runner of its own, so
 * a nested call has no model side and is refused — but a rule that lives only in
 * how one call site is wired is a rule the next caller does not know about. The
 * cost of getting it wrong is unbounded: each level multiplies the one above it,
 * and nothing counts the depth.
 *
 * It is subtractive like `disallowedTools` and applied after it, so a definition
 * that names `task` in `tools` still does not get it. A definition asking for
 * something the build refuses is answered by the refusal, not by the request.
 */
const NEVER_GIVEN = new Set(["task"]);

/**
 * Which tools a subagent may call.
 *
 * A subagent definition declares its own boundary — `tools` names what it may
 * use, `disallowedTools` names what it may not — and until now nothing read
 * either. A definition that said "read only" was read-only only in the sense
 * that nobody had given it anything to write with; the declaration had no
 * effect on what it could do, which is worse than having no declaration, because
 * a reader believes it.
 *
 * The rule is subtractive and ordered, so the result does not depend on which
 * field an author happened to write:
 *
 *   1. `tools` present means exactly those, and nothing else. Absent means
 *      whatever the caller offers, which is what a definition that says nothing
 *      about tools has always got.
 *   2. `disallowedTools` then removes from that set. It removes even when `tools`
 *      named the tool, because a name in both lists is an author contradicting
 *      themselves and the safe reading of a contradiction is the narrower one.
 *   3. `NEVER_GIVEN` removes last, so nothing a definition says can put one back.
 *
 * A name that matches nothing available is dropped rather than reported: a
 * definition may name a tool this build does not have, and refusing to run the
 * subagent over it would make every definition depend on the build it runs on.
 */
export function subagentTools(
  definition: Pick<SubagentDefinition, "tools" | "disallowedTools">,
  available: readonly string[],
): readonly string[] {
  const allowed = definition.tools ? new Set(definition.tools) : undefined;
  const denied = new Set([...(definition.disallowedTools ?? []), ...NEVER_GIVEN]);
  return available.filter((name) => (allowed ? allowed.has(name) : true) && !denied.has(name));
}

/**
 * How many model steps a subagent may take.
 *
 * The definition's own limit, and otherwise the caller's. A subagent that runs
 * unbounded is the case this exists for: a delegated task that loops has no
 * user watching it, so nothing would end it.
 */
export function subagentMaxSteps(
  definition: Pick<SubagentDefinition, "maxTurns">,
  fallback: number,
): number {
  const declared = definition.maxTurns;
  const value = declared !== undefined && Number.isFinite(declared) && declared > 0 ? declared : fallback;
  return Number.isFinite(value) && value > 0 ? Math.max(1, Math.floor(value)) : 1;
}

/** A delegated run may narrow, but never lift, a parent's or definition's plan boundary. */
export function subagentMode(
  parent: "plan" | "build" | undefined,
  declared: SubagentDefinition["permissionMode"],
  requested?: "plan" | "build",
): "plan" | "build" {
  return parent === "plan" || declared === "plan" || requested === "plan" ? "plan" : "build";
}
