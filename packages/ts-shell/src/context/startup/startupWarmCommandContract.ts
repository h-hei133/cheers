export type StartupWarmCommandMode = "status" | "rebuild";

export interface StartupWarmCommandRequest {
  readonly mode: StartupWarmCommandMode;
  readonly evidence: readonly string[];
}

export class StartupWarmCommandContractError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "StartupWarmCommandContractError";
  }
}

export function parseStartupWarmCommandArgs(
  args: readonly string[],
): StartupWarmCommandRequest {
  const [first, ...rest] = args;
  if (rest.length > 0) {
    throw new StartupWarmCommandContractError(
      "startup-warm-command:too-many-args",
      "Use /warmup, /warmup status, or /warmup rebuild.",
    );
  }
  if (!first || first === "status") {
    return {
      mode: "status",
      evidence: ["startup-warm-command:status"],
    };
  }
  if (first === "rebuild") {
    return {
      mode: "rebuild",
      evidence: ["startup-warm-command:rebuild-explicit"],
    };
  }
  throw new StartupWarmCommandContractError(
    "startup-warm-command:unknown-mode",
    `Unknown /warmup mode: ${first}`,
  );
}
