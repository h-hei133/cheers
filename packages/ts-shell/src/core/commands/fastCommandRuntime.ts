import type { CommandContext, LocalCommandResult } from "./types.js";
import { readProjectState, writeProjectState } from "../state/projectState.js";

/**
 * /fast — hold sampling down for shorter, more direct answers.
 *
 * What this changes is the sampling temperature, and nothing else. It does not
 * route to a different model; `/model` does that. The choice is kept per project
 * on disk, because a preference that resets on every start is one the user has to
 * keep re-making.
 */

/** Whether this project is set to sample at a lower temperature. */
export function isFastModeEnabled(workspaceRoot: string): boolean {
  return readProjectState(workspaceRoot).fastSampling === true;
}

/** Record the choice, returning the file it was written to, or undefined if it was not. */
export function setFastModeEnabled(workspaceRoot: string, enabled: boolean): string | undefined {
  return writeProjectState(workspaceRoot, { fastSampling: enabled });
}

/** The temperature a turn should use, given the base the caller would have used. */
export function samplingTemperature(workspaceRoot: string, base: number): number {
  return isFastModeEnabled(workspaceRoot) ? FAST_TEMPERATURE : base;
}

const FAST_TEMPERATURE = 0.2;

export async function runFastCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const root = context.cwd;
  const asked = args[0]?.toLowerCase();
  const current = isFastModeEnabled(root);

  const wanted =
    asked === "on" || asked === "enable" || asked === "1"
      ? true
      : asked === "off" || asked === "disable" || asked === "0"
        ? false
        : asked === "toggle"
          ? !current
          : undefined;

  if (wanted === undefined) {
    return {
      kind: "local",
      output: [
        "### Fast mode",
        "",
        `- Currently \`${current ? "on" : "off"}\` for this project`,
        `- On: temperature ${FAST_TEMPERATURE}, so answers are more direct and arrive sooner`,
        "- Which model answers does not change — use `/model` for that",
        "",
        "`/fast on` · `/fast off` · `/fast toggle`",
      ].join("\n"),
    };
  }

  const written = setFastModeEnabled(root, wanted);
  const headline = wanted
    ? `Fast mode is on: temperature ${FAST_TEMPERATURE} from the next turn.`
    : "Fast mode is off: sampling is back to the default temperature.";
  if (written) return { kind: "local", output: headline };
  return {
    kind: "local",
    output: [
      headline,
      "",
      "It could not be written to disk, so it will be lost when this process ends.",
    ].join("\n"),
  };
}
