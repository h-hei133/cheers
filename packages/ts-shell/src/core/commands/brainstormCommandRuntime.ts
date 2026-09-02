import type { CommandContext, CommandExecutionResult } from "./types.js";
import path from "node:path";

/**
 * /brainstorm — design exploration for one specific problem.
 *
 * This command expands into a prompt rather than answering locally, and that is
 * the whole point of the rewrite. It used to answer from three hard-coded
 * hypotheses with the challenge string interpolated into them, and an elicitation
 * questionnaire that was a constant: "multi-tenant rate limiter" and "in-memory
 * cache" got the same trade-offs, the same critique, the same over-engineering
 * score, and the same questions. Questions that do not depend on the problem are
 * not elicitation, and trade-offs that do not depend on the problem are not
 * analysis.
 *
 * The three modes differ in what they ask for, not in how deep they are:
 * exploration proposes, elicitation asks first, and saving writes the result down
 * where the repository can see it.
 */

/** Approaches worth contrasting before one is chosen. */
const APPROACH_COUNT = 3;

export async function runBrainstormCommand(
  args: string[],
  context: CommandContext,
): Promise<CommandExecutionResult> {
  const { flags, challenge } = parse(args);

  if (!challenge || flags.has("help")) {
    return { kind: "local", output: usage() };
  }

  if (flags.has("interactive")) {
    return { kind: "prompt", prompt: elicitationPrompt(challenge) };
  }
  return {
    kind: "prompt",
    prompt: flags.has("save")
      ? `${explorationPrompt(challenge)}\n\n${savingInstruction(challenge, context.cwd)}`
      : explorationPrompt(challenge),
  };
}

/** Flags and the challenge text, which is everything that is not a flag. */
function parse(args: string[]): { readonly flags: Set<string>; readonly challenge: string } {
  const flags = new Set<string>();
  const words: string[] = [];
  for (const arg of args) {
    if (arg === "-i" || arg === "--interactive") flags.add("interactive");
    else if (arg === "-s" || arg === "--save") flags.add("save");
    else if (arg === "-h" || arg === "--help") flags.add("help");
    else if (arg.startsWith("-")) flags.add(arg.replace(/^-+/, ""));
    else words.push(arg);
  }
  return { flags, challenge: words.join(" ").trim() };
}

/**
 * Explore the problem.
 *
 * The instructions are about where the answer has to come from: approaches that
 * differ in kind rather than in wording, trade-offs stated as consequences for
 * this problem, and a recommendation that names what would overturn it. The last
 * of those is the one that keeps a recommendation honest — an argument with no
 * stated defeater is a preference.
 */
function explorationPrompt(challenge: string): string {
  return [
    `Design exploration. The problem: ${challenge}`,
    "",
    `Work out ${APPROACH_COUNT} approaches that differ in kind — a different shape of solution, not the same one described three ways. For each:`,
    "",
    "- what it is, concretely enough to start building from",
    "- what it costs: the specific failure it makes likely, and the work it commits us to later",
    "- when it is the right answer, in terms of this problem's actual constraints",
    "",
    "Then:",
    "",
    "- Pick one and say why it beats the others *here*.",
    "- Name what would change your mind — the fact, load, or requirement that would make a different approach correct. If there is nothing, the choice was not a trade-off.",
    "- Say what you had to assume because it was not stated.",
    "",
    "Ground it in this codebase where the problem touches it: read the files that would change, and say what constraints they already impose. If the problem is not about this codebase, say so and reason about it directly.",
    "",
    "Do not rank approaches by a score you invented. Compare them on consequences.",
  ].join("\n");
}

/**
 * Ask before proposing.
 *
 * The questions have to come from the problem, so the prompt asks for the ones
 * whose answers would change the design, and asks for the workspace to be checked
 * first: a question the repository already answers is a question not worth asking.
 */
function elicitationPrompt(challenge: string): string {
  return [
    `Requirement elicitation, before any design. The problem: ${challenge}`,
    "",
    "Ask only the questions whose answers would change the design, and derive them from this problem rather than from a checklist. For each question, say in one line what different answers would change.",
    "",
    "Before asking, check what this codebase already answers — read the relevant files — and state those answers instead of asking for them.",
    "",
    "Group what you produce as:",
    "",
    "- **Settled here**: what the codebase or the problem statement already decides, with the evidence.",
    "- **Needs a decision**: the open questions, each with what turns on it.",
    "- **Assumed for now**: what you will proceed on if nobody answers, so silence has a known consequence.",
    "",
    "Do not propose a solution yet. Stop after the questions.",
  ].join("\n");
}

/** Where the write goes, and what has to be true before it is claimed. */
function savingInstruction(challenge: string, cwd: string): string {
  const target = path.join("docs", "specs", `${slug(challenge)}-design.md`);
  return [
    `When the exploration is done, write it to \`${target}\` (relative to ${cwd}) with the write tool, as a design record: the problem, the approaches considered, the decision, and what would overturn it.`,
    "Report the path only after the write tool has reported success.",
  ].join("\n");
}

/** A file-name-safe stem for the challenge. */
function slug(challenge: string): string {
  const cleaned = challenge
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return cleaned || "design";
}

function usage(): string {
  return [
    "### /brainstorm",
    "",
    "Design exploration for one problem: approaches that differ in kind, the trade-offs between them, and a recommendation that says what would overturn it.",
    "",
    "- `/brainstorm <problem>` — explore and recommend",
    "- `/brainstorm -i <problem>` — ask the questions that would change the design, before proposing anything",
    "- `/brainstorm -s <problem>` — explore, then write the result to `docs/specs/`",
    "",
    "It reads the files the problem touches, so the trade-offs are about this codebase rather than about the topic in general.",
  ].join("\n");
}
