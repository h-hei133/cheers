import type { Skill } from "../skills/skillLoader.js";
import { tokenizeCommandArgs } from "../commands/arguments.js";
import { expandSkills } from './skills.js';

/**
 * Turning a typed line into what the model receives.
 *
 * Two kinds of shorthand expand here, and they share one tokenizer on purpose. A
 * skill name and a template name are both "the user typed a short thing that stands
 * for a longer thing", and both take arguments, so the reading of quotes has to be
 * the same one: expanding them through separate tokenizers would let them disagree
 * about what `"a b" c` means.
 *
 * Which of the two wins when both would claim a name is not decided here. It is a
 * routing question, and the router is the only place that knows everything else
 * claiming the name too — a built-in command, for one. Each lookup here answers for
 * itself and reports whether it matched.
 */

/** A prompt template held in memory, discovered from disk. */
export interface PromptTemplate {
  /** Inline composition is opt-in; ordinary templates keep their standalone grammar. */
  readonly composable?: boolean;
  readonly name: string;
  readonly description: string;
  /** What the user is expected to supply, shown in completion. */
  readonly argumentHint?: string;
  readonly content: string;
  readonly filePath: string;
}

/**
 * Split a command line into its name and its arguments, honouring quotes.
 *
 * Quotes matter because an argument is often a phrase: without this, `"a b" c`
 * would arrive as three arguments and a template referencing `$1` would get `"a`
 * with the quote still attached.
 */
export function parseArguments(argsText: string): string[] {
  try {
    return tokenizeCommandArgs(argsText);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    // Template arguments can be unfinished prose. Keep it verbatim instead of
    // losing an apostrophe or letting a typing error escape the prompt path.
    return argsText.trim() ? [argsText.trim()] : [];
  }
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

/** The name a line invokes, and the text after it. */
function splitInvocation(text: string): { readonly name: string; readonly argsText: string } {
  const spaceAt = text.search(/\s/);
  return {
    name: spaceAt === -1 ? text : text.slice(0, spaceAt),
    argsText: spaceAt === -1 ? "" : text.slice(spaceAt + 1),
  };
}

/**
 * Expand a `/skill:name` line into what the model receives.
 *
 * The arguments follow the body rather than being substituted into it: a skill is
 * prose, and splicing a sentence into the middle of it is not something the author
 * can predict. A template, which its author wrote around the arguments,
 * substitutes instead.
 *
 * A name that matches no skill is reported rather than passed through, because the
 * one way to write this form is deliberately and a wrong name is a typo. The caller
 * decides what to say, since only it knows what else the name could have been.
 */
export function expandSkill(
  text: string,
  skills: ReadonlyMap<string, Skill>,
): { readonly text: string; readonly skill?: string; readonly unknownSkill?: string } {
  const expanded = expandSkills(text, skills);
  return { text: expanded.text, ...(expanded.unknownSkill ? { unknownSkill: expanded.unknownSkill } : {}),
    ...(expanded.instructions[0] ? { skill: expanded.instructions[0].name } : {}) };
}

/**
 * Expand a `/name` line into the template body, with its placeholders filled.
 *
 * The leading slash is required, and the slash is the whole safety of this form: it
 * separates a name the user deliberately invoked from a word that merely appears
 * first in a sentence. A lookup that accepted a bare name would let a file called
 * `review.md` replace the prompt "review this function" with its own body and delete
 * words the user typed, with nothing asking first.
 *
 * A name that matches nothing comes back as the text it was given, so the caller —
 * which knows what else could have claimed that name — says what happened.
 */
export function expandTemplate(
  text: string,
  templates: ReadonlyMap<string, PromptTemplate>,
): { readonly text: string; readonly template?: string } {
  if (!text.startsWith("/")) return { text };
  const { name, argsText } = splitInvocation(text.slice(1));
  const template = templates.get(name);
  if (!template) return { text };
  return {
    text: substituteArguments(template.content, parseArguments(argsText)),
    template: template.name,
  };
}
