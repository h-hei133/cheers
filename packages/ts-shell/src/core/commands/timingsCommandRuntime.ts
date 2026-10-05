import { rejectArguments } from "./syntax/empty.js";
import type { CommandContext, LocalCommandResult } from "./types.js";
import { formatTimingReport } from "../../observability/startupTiming.js";

/**
 * `/timings` — how long each phase of startup took.
 *
 * Startup is where a product feels slow and where the cause is hardest to see,
 * because the work is spread across configuration, discovery and rendering. The
 * measurement is taken only when `CHEERS_TIMING=1` was set before the process
 * started, so this command reports either the phases or the reason there are
 * none — never a plausible-looking zero.
 */
export async function runTimingsCommand(
  args: string[],
  _context: CommandContext,
): Promise<LocalCommandResult> {
  const invalid = rejectArguments("timings", args);
  if (invalid) return invalid;
  return { kind: "local", output: formatTimingReport() };
}
