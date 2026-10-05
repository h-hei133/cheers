import { loopSyntax, parseLoopArgs, MAX_ATTEMPTS } from "./loop/syntax.js";
import { syntaxHelp } from "./syntax/projection.js";
import { exec } from "node:child_process";
import type { CommandContext, CommandExecutionResult } from "./types.js";

/**
 * /loop — repair until a gate passes.
 *
 * The gate runs here first, and what it printed goes into the prompt. That
 * ordering is the point: the failure is observed locally before anything is asked
 * of the model, so the repair starts from evidence rather than from a description
 * of evidence. A passing gate costs no turn at all — the command answers directly
 * and stops.
 *
 * What drives the repeats is the agent loop that is already there: it edits with
 * tools, runs commands with tools, reads what came back, and goes again, with a
 * turn budget and a repeated-call detector bounding it. This command aims that
 * loop; it does not build a second one beside it. The attempt count below is the
 * budget the model is told to work within, and the turn budget is the bound that
 * holds whatever the model does with it — both are stated, because a cap that is
 * only advisory should not be described as enforced.
 */

/** How long the pre-flight run may take before the gate is reported as hanging. */
const GATE_TIMEOUT_MS = 120_000;
/** How much gate output travels into the prompt. */
const OUTPUT_LIMIT = 6_000;

export async function runLoopCommand(
  args: string[],
  context: CommandContext,
): Promise<CommandExecutionResult> {
  if (args.length === 0) return { kind: "local", output: usage() };

  const parsed = parseLoopArgs(args, context.rawCommandArgs);
  if (!parsed.ok) return { kind: "local", output: `Invalid /loop arguments: ${parsed.reason}\n${syntaxHelp(loopSyntax)}` };
  const { attempts, gate } = parsed;
  const cwd = context.cwd || process.cwd();
  const outcome = await runGate(gate, cwd);

  if (outcome.passed) {
    return {
      kind: "local",
      output: [
        `\`${gate}\` already passes, so there is nothing to repair.`,
        "",
        "Nothing was asked of the model — a passing gate does not need a turn.",
      ].join("\n"),
    };
  }

  const how = outcome.timedOut ? "did not finish in time" : `exited ${outcome.exitCode ?? "non-zero"}`;
  return {
    kind: "prompt",
    notice: `\`${gate}\` ${how}. Requesting at most ${attempts} ${attempts === 1 ? "attempt" : "attempts"}; the runtime turn budget remains the enforced bound.`,
    prompt: repairPrompt(gate, cwd, attempts, outcome),
  };
}

interface GateOutcome {
  readonly passed: boolean;
  readonly output: string;
  readonly exitCode?: number;
  readonly timedOut: boolean;
}

/** Run the gate once and report exactly what happened. */
async function runGate(gate: string, cwd: string): Promise<GateOutcome> {
  return new Promise((resolve) => {
    exec(
      gate,
      { cwd, timeout: GATE_TIMEOUT_MS, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const output = tail([stdout, stderr].filter(Boolean).join("\n"));
        if (!error) {
          resolve({ passed: true, output, exitCode: 0, timedOut: false });
          return;
        }
        resolve({
          passed: false,
          output: output || error.message,
          ...(typeof error.code === "number" ? { exitCode: error.code } : {}),
          timedOut: (error as { killed?: boolean }).killed === true,
        });
      },
    );
  });
}

/**
 * The repair protocol.
 *
 * Each attempt has to end with the gate re-run through a tool, because that is the
 * only thing that can turn "fixed" from a claim into an observation. The stop
 * conditions are stated as conditions rather than as encouragement: the same
 * failure twice means the approach is wrong, and saying so is more useful than a
 * third identical edit.
 */
function repairPrompt(gate: string, cwd: string, attempts: number, outcome: GateOutcome): string {
  const how = outcome.timedOut
    ? `It was killed after ${GATE_TIMEOUT_MS / 1000}s without finishing`
    : `It exited ${outcome.exitCode ?? "non-zero"}`;
  return [
    `Repair loop. The gate is \`${gate}\`, run in ${cwd}. ${how}.`,
    "",
    "What it printed:",
    "",
    "```text",
    outcome.output || "(no output)",
    "```",
    "",
    `Work until that command exits 0, in at most ${attempts} attempts. Each attempt:`,
    "",
    "1. Read the failure above — or the one from your last run — and say what you think is causing it before changing anything.",
    "2. Make the smallest change that would address that cause.",
    `3. Run \`${gate}\` with the bash tool and read what it says.`,
    "4. If it exits 0, stop and report what the fix was.",
    "",
    "Stop early, and say why, if any of these is true:",
    "",
    "- The same failure comes back unchanged after a change you made — the cause is elsewhere, so report what you ruled out.",
    "- The fix would mean changing what the gate checks rather than what it checks *for*. Say what the test wants and why the code cannot give it.",
    "- The failure is in something you were not asked to touch.",
    "",
    "Never report the gate as passing without having run it and seen it exit 0 in the same turn. Report every attempt, including the ones that did not work — a loop that only shows its last step hides where the time went.",
    "",
    `The run also ends when the turn budget is spent, which may be before ${attempts} attempts. If that happens, leave the tree in a state that builds, and say what was still failing.`,
  ].join("\n");
}

/** The end of the output, which is where a failing command says what went wrong. */
function tail(text: string): string {
  const clean = text.replace(/\s+$/, "");
  if (clean.length <= OUTPUT_LIMIT) return clean;
  return `...[earlier output omitted]\n${clean.slice(clean.length - OUTPUT_LIMIT)}`;
}

function usage(): string {
  return [
    "### /loop",
    syntaxHelp(loopSyntax),
    "",
    "Runs a verification command; if it fails, starts a repair loop with the failure already in hand.",
    "",
    `- \`/loop <attempts> <command>\` — e.g. \`/loop 5 npm test\` (at most ${MAX_ATTEMPTS} attempts)`,
    "- `/loop <command>` — the same with a default of five",
    "",
    "A gate that already passes costs nothing: the command says so and stops without asking the model for a turn.",
  ].join("\n");
}
