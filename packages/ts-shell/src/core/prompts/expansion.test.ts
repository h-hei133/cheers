import { describe, expect, it } from "vitest";
import { expandSkill, expandTemplate, parseArguments, substituteArguments, type PromptTemplate } from "./expansion.js";
import type { Skill } from "../skills/skillLoader.js";

/**
 * What a typed line turns into before the model sees it.
 *
 * Two shorthands expand here and they share one tokenizer, which is the reason they
 * live in the same module: a skill name and a template name are both "a short thing
 * that stands for a longer thing", and reading their arguments through separate
 * tokenizers would let them disagree about what a quoted argument means. Which of
 * them wins when both claim a name is the router's decision, so it is not asserted
 * here.
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
  const skills = new Map([["review", skill("review", "Check the diff.")]]);

  it("wraps the body and appends the arguments after it", () => {
    const result = expandSkill("/skill:review extra context", skills);
    expect(result.skill).toBe("review");
    expect(result.text).toContain("<skill name=\"review\">");
    expect(result.text).toContain("Check the diff.");
    // The arguments follow the body rather than being spliced into it: a skill is
    // prose, and the author cannot predict where a sentence would land.
    expect(result.text.endsWith("extra context")).toBe(true);
  });

  it("works with no arguments", () => {
    expect(expandSkill("/skill:review", skills).text).toBe(`<skill name="review">\nCheck the diff.\n</skill>`);
  });

  it("reports a name it does not have, and returns the line unchanged", () => {
    // Returned unchanged so the caller decides what to say: only it knows what else
    // the name could have been.
    const result = expandSkill("/skill:nope", skills);
    expect(result.unknownSkill).toBe("nope");
    expect(result.text).toBe("/skill:nope");
  });

  it("leaves a line that is not this form alone", () => {
    const result = expandSkill("review the diff", skills);
    expect(result.skill).toBeUndefined();
    expect(result.unknownSkill).toBeUndefined();
    expect(result.text).toBe("review the diff");
  });
});

describe("expanding a template invocation", () => {
  const templates = new Map([["review", template("review", "Review $1 now.")]]);

  it("substitutes the arguments into the body", () => {
    const result = expandTemplate("/review the auth module", templates);
    expect(result.template).toBe("review");
    // `$1` is the first word only. Reaching the whole phrase needs `$@` or quotes,
    // which is what the next test covers.
    expect(result.text).toBe("Review the now.");
  });

  it("reaches every argument through the all-arguments form", () => {
    const all = new Map([["review", template("review", "Review $@ now.")]]);
    expect(expandTemplate("/review the auth module", all).text).toBe("Review the auth module now.");
  });

  it("treats a quoted argument as one value", () => {
    const quoted = new Map([["ask", template("ask", "Explain $1.")]]);
    expect(expandTemplate('/ask "the auth module"', quoted).text).toBe("Explain the auth module.");
  });

  it("leaves words that are not an invocation untouched, slash or not", () => {
    // Only a name the user deliberately invoked with the slash expands. A sentence
    // that happens to begin with a template's name is a sentence: rewriting it would
    // delete words the user typed without anything asking.
    expect(expandTemplate("hello there", templates)).toEqual({ text: "hello there" });
    expect(expandTemplate("review the auth module", templates)).toEqual({
      text: "review the auth module",
    });
    expect(expandTemplate("/review", templates).template).toBe("review");
  });

  it("answers a name that matches nothing with the text it was given", () => {
    expect(expandTemplate("/nosuchthing", templates)).toEqual({ text: "/nosuchthing" });
  });
});

describe("the order of expansion", () => {
  it("does not substitute placeholders that are inside a skill body", () => {
    // Skill first, template second. Substituting first would consume the skill
    // body's own placeholders before the body was inserted, so a skill that wants
    // its arguments at a specific point in a sentence could not express that.
    const skills = new Map([["greet", skill("greet", "Say hello to $1.")]]);
    const templates = new Map([["greet", template("greet", "unused")]]);

    const skillStep = expandSkill("/skill:greet", skills);
    expect(skillStep.text).toContain("$1");
    // The template step then runs over what the skill produced, and the skill's own
    // placeholders are still there for the model to read as the author wrote them.
    expect(expandTemplate(skillStep.text, templates).text).toContain("$1");
  });
});
