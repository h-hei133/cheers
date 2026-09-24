import { describe, expect, it } from "vitest";
import { expandSubmission, parseArguments, substituteArguments, type PromptTemplate } from "./expansion.js";
import type { Skill } from "../skills/skillLoader.js";

/**
 * What a typed line turns into before the model sees it.
 *
 * Two shorthands expand here and they share one tokenizer and one order, which is
 * the reason they live in the same module: a skill name and a template name are
 * both "a short thing that stands for a longer thing", and expanding them at two
 * call sites would let them disagree about what a quoted argument means.
 */

function skill(name: string, body: string, overrides: Partial<Skill> = {}): Skill {
  return {
    name,
    description: `${name} skill`,
    body,
    filePath: `/skills/${name}/SKILL.md`,
    source: "project",
    disableModelInvocation: false,
    ...overrides,
  };
}

function template(name: string, content: string): PromptTemplate {
  return { name, description: "", content, filePath: `/prompts/${name}.md` };
}

function input(text: string, options: { skills?: Skill[]; templates?: PromptTemplate[] } = {}) {
  return {
    text,
    skills: new Map((options.skills ?? []).map((s) => [s.name, s])),
    templates: new Map((options.templates ?? []).map((t) => [t.name, t])),
  };
}

describe("argument parsing", () => {
  it("keeps a quoted phrase as one argument", () => {
    expect(parseArguments('"two words" plain')).toEqual(["two words", "plain"]);
  });

  it("accepts either quote style and drops the quote characters", () => {
    expect(parseArguments("'a b' c")).toEqual(["a b", "c"]);
  });

  it("collapses runs of whitespace", () => {
    expect(parseArguments("  a   b  ")).toEqual(["a", "b"]);
  });

  it("returns nothing for empty input", () => {
    expect(parseArguments("   ")).toEqual([]);
  });
});

describe("template substitution", () => {
  it("fills positional arguments", () => {
    expect(substituteArguments("$1 then $2", ["a", "b"])).toBe("a then b");
  });

  it("expands every argument for the all-arguments form", () => {
    expect(substituteArguments("[$@]", ["a", "b"])).toBe("[a b]");
    expect(substituteArguments("[$ARGUMENTS]", ["a", "b"])).toBe("[a b]");
  });

  it("uses the fallback only when the argument is missing", () => {
    expect(substituteArguments("${1:-none}", [])).toBe("none");
    expect(substituteArguments("${1:-none}", ["given"])).toBe("given");
  });

  it("slices from a position, counting from one", () => {
    expect(substituteArguments("${@:2}", ["a", "b", "c"])).toBe("b c");
  });

  it("slices a length when one is given", () => {
    expect(substituteArguments("${@:2:2}", ["a", "b", "c", "d"])).toBe("b c");
  });

  it("leaves a missing positional empty rather than literal", () => {
    // A template showing `$1` back to the user reads as a bug in the template
    // rather than as a missing argument.
    expect(substituteArguments("[$3]", ["a", "b"])).toBe("[]");
  });

  it("does not rescan a substituted value", () => {
    // An argument containing a placeholder must not become another substitution.
    expect(substituteArguments("[$1]", ["$2", "x"])).toBe("[$2]");
  });
});

describe("expanding a skill invocation", () => {
  it("wraps the body and appends the arguments after it", () => {
    const result = expandSubmission(
      input("/skill:review extra context", { skills: [skill("review", "Check the diff.")] }),
    );
    expect(result.expanded).toEqual({ kind: "skill", name: "review" });
    expect(result.text).toContain("<skill name=\"review\">");
    expect(result.text).toContain("Check the diff.");
    // The arguments follow the body rather than being spliced into it: a skill is
    // prose, and the author cannot predict where a sentence would land.
    expect(result.text.endsWith("extra context")).toBe(true);
  });

  it("works with no arguments", () => {
    const result = expandSubmission(
      input("/skill:review", { skills: [skill("review", "Body.")] }),
    );
    expect(result.expanded).toEqual({ kind: "skill", name: "review" });
    expect(result.text).toBe(`<skill name="review">\nBody.\n</skill>`);
  });

  it("reports a name it does not have", () => {
    const result = expandSubmission(input("/skill:nope", { skills: [skill("review", "B")] }));
    expect(result.unknown).toEqual({ kind: "skill", name: "nope" });
    // Returned unchanged so the caller decides what to say.
    expect(result.text).toBe("/skill:nope");
  });
});

describe("expanding a template invocation", () => {
  it("substitutes the arguments into the body", () => {
    const result = expandSubmission(
      input("review the auth module", { templates: [template("review", "Review $1 now.")] }),
    );
    expect(result.expanded).toEqual({ kind: "template", name: "review" });
    // `$1` is the first word only. Reaching the whole phrase needs `$@` or quotes,
    // which is what the next test covers.
    expect(result.text).toBe("Review the now.");
  });

  it("reaches every argument through the all-arguments form", () => {
    const result = expandSubmission(
      input("review the auth module", { templates: [template("review", "Review $@ now.")] }),
    );
    expect(result.text).toBe("Review the auth module now.");
  });

  it("treats a quoted argument as one value", () => {
    const result = expandSubmission(
      input('review "the auth module"', { templates: [template("review", "Review $1.")] }),
    );
    expect(result.text).toBe("Review the auth module.");
  });

  it("passes an ordinary sentence through untouched", () => {
    // The first word of a sentence matching nothing is not a mistyped command.
    const result = expandSubmission(input("hello there", { templates: [template("review", "x")] }));
    expect(result.text).toBe("hello there");
    expect(result.expanded).toBeUndefined();
    expect(result.unknown).toBeUndefined();
  });

  it("reports a bare unknown slash word", () => {
    const result = expandSubmission(input("/nosuchthing", { templates: [] }));
    expect(result.unknown).toEqual({ kind: "template", name: "/nosuchthing" });
  });
});

describe("the order of expansion", () => {
  it("does not substitute placeholders that are inside a skill body", () => {
    // Skill first, template second. Substituting first would consume the skill
    // body's own placeholders before the body was inserted, so a skill that wants
    // its arguments at a specific point in a sentence could not express that.
    const result = expandSubmission(
      input("/skill:greet", {
        skills: [skill("greet", "Say hello to $1.")],
        templates: [template("greet", "unused")],
      }),
    );
    expect(result.expanded).toEqual({ kind: "skill", name: "greet" });
    expect(result.text).toContain("$1");
  });
});
