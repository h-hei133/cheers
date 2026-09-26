import { describe, expect, it } from "vitest";
import { matchDenyRule, parseDenyRules } from "./deny.js";

/**
 * Refusals a session can state.
 *
 * The property that makes these worth having is that nothing overrides them: not
 * a scope, not approval, not a trust grant. A rule that could be answered away
 * would be a suggestion, and the tool boundary was already a suggestion that
 * turned out to do nothing.
 */

describe("matching a refusal", () => {
  it("refuses the whole tool when no pattern is given", () => {
    const match = matchDenyRule([{ tool: "bash" }], "bash", "rm -rf /");

    expect(match?.rule.tool).toBe("bash");
  });

  it("leaves other tools alone", () => {
    expect(matchDenyRule([{ tool: "bash" }], "read", "src/a.ts")).toBeUndefined();
  });

  it("refuses one target within a tool", () => {
    // The case neither `disabledTools` nor `hiddenToolPrefixes` can express: the
    // tool stays available and particular calls through it do not.
    const rules = [{ tool: "bash", pattern: "rm -rf" }];

    expect(matchDenyRule(rules, "bash", "rm -rf /tmp/x")?.rule.pattern).toBe("rm -rf");
    expect(matchDenyRule(rules, "bash", "ls -la")).toBeUndefined();
  });

  it("matches a pattern as a prefix, so a path family is one rule", () => {
    const rules = [{ tool: "write", pattern: "secrets/" }];

    expect(matchDenyRule(rules, "write", "secrets/key.pem")).toBeDefined();
    expect(matchDenyRule(rules, "write", "src/index.ts")).toBeUndefined();
  });

  it("refuses every tool when the rule names all of them", () => {
    expect(matchDenyRule([{ tool: "*" }], "bash", "anything")).toBeDefined();
    expect(matchDenyRule([{ tool: "*", pattern: "src/" }], "read", "src/a.ts")).toBeDefined();
  });

  it("reports the first matching rule, so the reason names one thing", () => {
    const rules = [
      { tool: "read", pattern: "src/" },
      { tool: "read" },
    ];

    const match = matchDenyRule(rules, "read", "src/a.ts");

    expect(match?.rule.pattern).toBe("src/");
  });

  it("refuses nothing when there are no rules", () => {
    expect(matchDenyRule([], "bash", "rm -rf /")).toBeUndefined();
  });
});

describe("reading refusals from configuration", () => {
  it("takes the shape a file holds", () => {
    const rules = parseDenyRules([{ tool: "bash", pattern: "curl" }, { tool: "write" }]);

    expect(rules).toEqual([{ tool: "bash", pattern: "curl" }, { tool: "write" }]);
  });

  it("drops entries that name no tool", () => {
    // A rule with no tool could only mean "everything", which is a decision
    // nobody wrote. Dropped rather than widened.
    expect(parseDenyRules([{ pattern: "src/" }, { tool: "" }, { tool: "  " }])).toEqual([]);
  });

  it("drops entries that are not objects", () => {
    expect(parseDenyRules(["bash", 42, null, undefined])).toEqual([]);
  });

  it("drops an empty pattern rather than matching everything", () => {
    // An empty prefix matches every target, so keeping it would turn a rule about
    // one path into a rule about the whole tool.
    expect(parseDenyRules([{ tool: "bash", pattern: "" }])).toEqual([{ tool: "bash" }]);
  });

  it("answers nothing for a value that is not a list", () => {
    expect(parseDenyRules(undefined)).toEqual([]);
    expect(parseDenyRules({ tool: "bash" })).toEqual([]);
    expect(parseDenyRules("bash")).toEqual([]);
  });
});
