import { rejectArguments } from "./syntax/empty.js";
import { renderKeyGuide } from "../../presentation/tui/chrome/keys.js";
import type { CommandContext, LocalCommandResult } from "./types.js";

/**
 * /hotkey — every key this surface binds.
 *
 * Read from the same table the keymap dispatches on, so a key that stops working
 * stops being advertised. Which chords a terminal can even deliver depends on
 * whether it agreed to report modified keys, so that is stated rather than left
 * for the user to discover by pressing.
 */
export async function runHotkeyCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const invalid = rejectArguments("hotkey", args);
  if (invalid) return invalid;
  return {
    kind: "local",
    output: renderKeyGuide(context.modifierKeysReported === true, context.keyGuide),
  };
}
