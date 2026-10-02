import { describe, expect, it } from "vitest";
import { subagentMaxSteps, subagentTools } from "./boundary.js";

/**
 * The boundary a subagent definition declares.
 *
 * These pin the property that was missing: a definition saying "read only" was
 * read-only in name alone. Every built-in declares its own tool set and its own
 * disallowed list, and nothing read either, so a subagent could reach any tool
 * the session had.
 */

const AVAILABLE = ["read", "write", "edit", "glob", "grep", "bash", "lsp", "todo"];

describe("the tools a subagent may use", () => {
  it("is exactly what the definition names", () => {
    // A declaration of `tools` is a statement about the whole set, not a floor.
    const allowed = subagentTools({ tools: ["read", "grep"] }, AVAILABLE);

    expect(allowed).toEqual(["read", "grep"]);
    expect(allowed).not.toContain("write");
  });

  it("is everything the session offers when the definition says nothing", () => {
    // A definition that does not mention tools has always received whatever the
    // session has, and narrowing that would silently change every existing one.
    expect(subagentTools({}, AVAILABLE)).toEqual(AVAILABLE);
  });

  it("removes what the definition disallows", () => {
    const allowed = subagentTools({ disallowedTools: ["write", "edit", "bash"] }, AVAILABLE);

    expect(allowed).not.toContain("write");
    expect(allowed).not.toContain("edit");
    expect(allowed).not.toContain("bash");
    expect(allowed).toContain("read");
  });

  it("lets the disallowed list win over the allowed one", () => {
    // A name in both lists is an author contradicting themselves. The narrower
    // reading is the safe one, and the alternative is a boundary whose meaning
    // depends on which field the reader happened to check first.
    const allowed = subagentTools({ tools: ["read", "write"], disallowedTools: ["write"] }, AVAILABLE);

    expect(allowed).toEqual(["read"]);
  });

  it("drops a name this build does not have rather than failing", () => {
    // A definition may name a tool that does not exist here. Refusing to run
    // would make every definition depend on the build it happens to run on.
    const allowed = subagentTools({ tools: ["read", "nonexistent-tool"] }, AVAILABLE);

    expect(allowed).toEqual(["read"]);
  });

  it("can leave a subagent with nothing at all", () => {
    // Legitimate: an agent that only reasons over what it is given.
    expect(subagentTools({ tools: [] }, AVAILABLE)).toEqual([]);
  });

  it("keeps the built-in read-only agent from reaching a writing tool", () => {
    // The case the whole boundary exists for. `Explore` declares itself read-only
    // and its disallowed list names the writing tools; before this, both
    // declarations were inert.
    const explore = {
      tools: ["read", "grep", "glob", "lsp"],
      disallowedTools: ["write", "edit", "rm", "eval"],
    };

    const allowed = subagentTools(explore, AVAILABLE);

    // Order follows the session's own tool list, not the definition's, so the
    // assertion is on membership rather than on a sequence.
    expect([...allowed].sort()).toEqual(["glob", "grep", "lsp", "read"]);
    for (const writing of ["write", "edit", "bash"]) {
      expect(allowed).not.toContain(writing);
    }
  });
});

describe("the steps a subagent may take", () => {
  it("uses the definition's limit when it declares one", () => {
    expect(subagentMaxSteps({ maxTurns: 5 }, 20)).toBe(5);
  });

  it("falls back when the definition declares none", () => {
    expect(subagentMaxSteps({}, 20)).toBe(20);
  });

  it("falls back on a limit that could not bound anything", () => {
    // Zero or a negative would stop the subagent before it began, and a
    // non-finite value would never stop it. Neither is a step budget.
    expect(subagentMaxSteps({ maxTurns: 0 }, 20)).toBe(20);
    expect(subagentMaxSteps({ maxTurns: -1 }, 20)).toBe(20);
    expect(subagentMaxSteps({ maxTurns: Number.POSITIVE_INFINITY }, 20)).toBe(20);
    expect(subagentMaxSteps({ maxTurns: Number.NaN }, 20)).toBe(20);
  });

  it("floors a fractional limit, since a step is not divisible", () => {
    expect(subagentMaxSteps({ maxTurns: 4.7 }, 20)).toBe(4);
  });

  it("keeps small fractions and invalid host budgets finite and positive", () => {
    expect(subagentMaxSteps({ maxTurns: 0.4 }, 20)).toBe(1);
    for (const fallback of [0, -1, Infinity, NaN]) expect(subagentMaxSteps({}, fallback)).toBe(1);
  });
});

describe("a tool no definition can ask for", () => {
  /**
   * A subagent cannot be given the tool that spawns subagents.
   *
   * It is refused today by construction — the runner builds a subagent's tool
   * set without a runner of its own, so a nested call has no model side. That is
   * a property of one call site, though, and the cost of losing it is unbounded:
   * each level multiplies the one above and nothing counts the depth. The rule
   * is stated here so it does not depend on how the call site happens to be
   * wired.
   */
  it("withholds task even when the definition asks for it", () => {
    expect(subagentTools({ tools: ["read", "task"] }, ["read", "task", "write"])).toEqual(["read"]);
  });

  it("withholds task when the definition says nothing about tools", () => {
    expect(subagentTools({}, ["read", "task"])).toEqual(["read"]);
  });
});
