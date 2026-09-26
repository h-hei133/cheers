import type { SubagentDefinition } from "./types.js";

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
  const denied = new Set(definition.disallowedTools ?? []);
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
  if (declared === undefined) return fallback;
  return Number.isFinite(declared) && declared > 0 ? Math.floor(declared) : fallback;
}
