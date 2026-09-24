import type { Skill } from "../skills/skillLoader.js";

/**
 * Turning a typed line into what the model receives.
 *
 * Two kinds of shorthand expand here, and they share one entry point on purpose.
 * A skill name and a template name are both "the user typed a short thing that
 * stands for a longer thing", and both take arguments, so the tokenizer that reads
 * quotes has to be the same one. Expanding them at two call sites would mean two
 * tokenizers that can disagree about what `"a b" c` means, and two orderings that
 * can disagree about which one wins.
 *
 * The order is skill first, then template. A skill body may itself contain
 * placeholders — a skill that wants its arguments spliced into a sentence — and
 * substituting templates first would consume those before the skill was inserted.
 */

/** A prompt template held in memory, discovered from disk. */
export interface PromptTemplate {
  readonly name: string;
  readonly description: string;
  /** What the user is expected to supply, shown in completion. */
  readonly argumentHint?: string;
  readonly content: string;
  readonly filePath: string;
}

export interface ExpansionInput {
  readonly text: string;
  readonly skills: ReadonlyMap<string, Skill>;
  readonly templates: ReadonlyMap<string, PromptTemplate>;
}

export interface ExpansionResult {
  readonly text: string;
  /**
   * What was expanded, so a caller can say so.
   *
   * Reported rather than silent because the model's answer depends on the whole
   * expanded text: a user who cannot see that a skill body was inserted has no way
   * to tell why the answer came back the way it did.
   */
  readonly expanded:
    | { readonly kind: "skill"; readonly name: string }
    | { readonly kind: "template"; readonly name: string }
    | undefined;
  /** A name that looks like a command but matched nothing. */
  readonly unknown?: { readonly kind: "skill" | "template"; readonly name: string };
}

/** The prefix that marks a skill invocation. */
const SKILL_PREFIX = "/skill:";

/**
 * Split a command line into its name and its arguments, honouring quotes.
 *
 * Quotes matter because an argument is often a phrase: without this, `"a b" c`
 * would arrive as three arguments and a template referencing `$1` would get `"a`
 * with the quote still attached.
 */
export function parseArguments(argsText: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: string | null = null;

  for (const char of argsText) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) args.push(current);
  return args;
}

/**
 * Replace the argument placeholders in a template body.
 *
 * The forms are the ones a shell user already knows, which is the reason to use
 * them rather than invent a syntax: `$1`, `$@`, `${1:-fallback}`, `${@:2}` and
 * `${@:2:3}`. A positional reference with no argument becomes the empty string
 * rather than staying literal — a template that wanted a literal `$1` can write
 * `\$1`, but a missing argument shown as `$1` reads as a bug in the template.
 *
 * Substitution is one pass. An argument whose text happens to contain `$2` is not
 * rescanned, so a quoted argument cannot smuggle in another substitution.
 */
export function substituteArguments(content: string, args: readonly string[]): string {
  const all = args.join(" ");
  return content.replace(
    /\$\{(\d+|ARGUMENTS|@):-([^}]*)\}|\$\{@:(\d+)(?::(\d+))?\}|\$(ARGUMENTS|@|\d+)/g,
    (_match, defaultTarget: string, defaultValue: string, sliceStart: string, sliceLength: string, simple: string) => {
      if (defaultTarget) {
        const value =
          defaultTarget === "@" || defaultTarget === "ARGUMENTS"
            ? all
            : args[Number(defaultTarget) - 1];
        return value ? value : defaultValue;
      }
      if (sliceStart) {
        // Arguments are numbered from one, so `2` means "from the second".
        const start = Math.max(0, Number(sliceStart) - 1);
        return sliceLength
          ? args.slice(start, start + Number(sliceLength)).join(" ")
          : args.slice(start).join(" ");
      }
      if (simple === "ARGUMENTS" || simple === "@") return all;
      return args[Number(simple) - 1] ?? "";
    },
  );
}

/** The body of a skill as the model should see it, with its location named. */
function skillBlock(skill: Skill): string {
  // The same shape a template uses, for the same reason: the model has to be able
  // to tell instructions it was handed from words the user says.
  return [`<skill name="${skill.name}">`, skill.body, "</skill>"].join("\n");
}

/**
 * Expand a submitted line into what the model receives.
 *
 * Text that matches nothing is returned unchanged, with the unmatched name
 * reported. Reporting rather than throwing is what lets the caller decide: an
 * unknown `/skill:foo` is a typo worth a message, while a line that happens to
 * start with a slash but was never meant as a command should pass through.
 */
export function expandSubmission(input: ExpansionInput): ExpansionResult {
  const text = input.text;

  if (text.startsWith(SKILL_PREFIX)) {
    const rest = text.slice(SKILL_PREFIX.length);
    const spaceAt = rest.search(/\s/);
    const name = spaceAt === -1 ? rest : rest.slice(0, spaceAt);
    const argsText = spaceAt === -1 ? "" : rest.slice(spaceAt + 1).trim();
    const skill = input.skills.get(name);
    if (!skill) return { text, expanded: undefined, unknown: { kind: "skill", name } };
    // The arguments follow the body rather than being substituted into it: a skill
    // is prose, and splicing a sentence into the middle of it is not something the
    // author can predict. A template, which the author wrote around its arguments,
    // substitutes instead.
    const body = argsText ? `${skillBlock(skill)}\n\n${argsText}` : skillBlock(skill);
    return { text: body, expanded: { kind: "skill", name } };
  }

  const spaceAt = text.search(/\s/);
  const name = spaceAt === -1 ? text : text.slice(0, spaceAt);
  const argsText = spaceAt === -1 ? "" : text.slice(spaceAt + 1);
  const template = input.templates.get(name);
  if (!template) {
    // Only a bare name can be an unknown template: a sentence whose first word
    // happens to match nothing is an ordinary prompt, not a mistyped command.
    return spaceAt === -1 && name.startsWith("/")
      ? { text, expanded: undefined, unknown: { kind: "template", name } }
      : { text, expanded: undefined };
  }
  return {
    text: substituteArguments(template.content, parseArguments(argsText)),
    expanded: { kind: "template", name },
  };
}
