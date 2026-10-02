import type { StdinTransportMode } from "../core/shell/printPromptInput.js";
import type { CliOptions } from "./cliArgs.js";

export type CliModeKind =
  | "replay"
  | "stdin-stream"
  | "print"
  | "stdin-batch"
  | "interactive";

export type CliModePlan =
  | { readonly kind: "replay"; readonly replayFile: string }
  | { readonly kind: "stdin-stream" }
  | { readonly kind: "print" }
  | { readonly kind: "stdin-batch" }
  | { readonly kind: "interactive" };

export interface ResolveCliModeInput {
  readonly options: CliOptions;
  readonly stdinTransportMode: StdinTransportMode;
  readonly nonInteractivePromptCount: number;
}

export function resolveCliMode(input: ResolveCliModeInput): CliModePlan {
  if (input.options.replayFile) {
    return { kind: "replay", replayFile: input.options.replayFile };
  }

  if (input.options.jsonEvents === true) {
    return { kind: "print" };
  }

  if (input.stdinTransportMode === "stream-live") {
    return { kind: "stdin-stream" };
  }

  if (input.options.printMode === true) {
    return { kind: "print" };
  }

  if (input.nonInteractivePromptCount > 0) {
    return { kind: "stdin-batch" };
  }

  return { kind: "interactive" };
}
