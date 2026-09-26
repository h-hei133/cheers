/**
 * Tools a session refuses to use, whatever else says otherwise.
 *
 * There was no way to say "never run this". Approval can be granted, scopes can
 * be widened, and a project can carry trust — but nothing a user wrote could
 * take a tool off the table. This is that statement, and it is deliberately the
 * narrow one: a tool, optionally a pattern within it, and no way to grant it.
 *
 * Bypass-immune is the property that makes it worth having. A rule that approval
 * can override is a suggestion, and a suggestion is what the tool boundary
 * already was before it was made real — a declaration the reader believes and
 * the code does not honour.
 *
 * The pattern is optional and matched as a prefix, because that is what the
 * cases need: a whole tool, or one path family inside it. A full matching
 * language — globs, regexes, precedence between overlapping rules — is a
 * subsystem of its own, and building it before anything needs it would be
 * building the wrong one.
 */

/** One refusal. */
export interface DenyRule {
  /** The tool this refuses, by name. `*` refuses every tool. */
  readonly tool: string;
  /**
   * What within the tool this refuses.
   *
   * Absent means the whole tool. A value matches when the call's target starts
   * with it, which covers the cases worth covering: a path prefix, a command
   * prefix, a URL prefix.
   */
  readonly pattern?: string;
}

/** Why a call was refused, so the caller can say which rule did it. */
export interface DenyMatch {
  readonly rule: DenyRule;
  readonly target: string;
}

/**
 * The rule that refuses this call, or nothing.
 *
 * The first matching rule is reported rather than all of them: a caller wants to
 * know why the call was refused, and a list of reasons is not an answer to that.
 */
export function matchDenyRule(
  rules: readonly DenyRule[],
  toolName: string,
  target: string,
): DenyMatch | undefined {
  for (const rule of rules) {
    if (rule.tool !== "*" && rule.tool !== toolName) continue;
    if (rule.pattern === undefined || target.startsWith(rule.pattern)) {
      return { rule, target };
    }
  }
  return undefined;
}

/**
 * Read rules from the shape a configuration file holds.
 *
 * Values arrive as written by a person, so anything unrecognizable is dropped
 * rather than thrown on. A malformed rule that stopped the session would be
 * worse than one that does nothing: the failure would be at startup, far from
 * the line that caused it.
 */
export function parseDenyRules(value: unknown): readonly DenyRule[] {
  if (!Array.isArray(value)) return [];
  const rules: DenyRule[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const tool = typeof record.tool === "string" ? record.tool.trim() : "";
    if (!tool) continue;
    const pattern = typeof record.pattern === "string" ? record.pattern : undefined;
    rules.push({ tool, ...(pattern ? { pattern } : {}) });
  }
  return rules;
}
