import type { RuntimeProvider } from "../../config/runtimeConfig.js";

export type NonInteractiveApprovalMode =
  | "deny"
  | "allow-once"
  | "allow-always";

export interface CliOptions {
  readonly sessionId?: string;
  readonly provider?: RuntimeProvider;
  readonly apiKey?: string;
  readonly projectPath?: string;
  readonly replayFile?: string;
  readonly printMode?: boolean;
  /** Emit the run's events as JSON lines on stdout instead of prose. */
  readonly jsonEvents?: boolean;
  readonly promptArg?: string;
  readonly migrateSessionRoot?: boolean;
  readonly nonInteractiveApproval?: NonInteractiveApprovalMode;
  /**
   * Skip project instruction files for this run.
   *
   * A flag as well as a setting because the reason to want it is usually a
   * one-off: "is it this repository's rules that are steering the model?"
   */
  readonly noContextFiles?: boolean;
  /**
   * Run a project's declared hook commands without approving each one.
   *
   * The name says what it does because the thing it does is dangerous: it lets a
   * repository execute commands on this machine with no review at all.
   */
  readonly dangerouslyBypassHookTrust?: boolean;
}

export interface CliArgs {
  readonly rawArgs: readonly string[];
  readonly options: CliOptions;
  readonly versionRequested: boolean;
  readonly doctorRequested: boolean;
}

export interface CliArgParseError {
  readonly message: string;
  readonly exitCode: 1;
}

export type CliArgParseResult =
  | { readonly ok: true; readonly args: CliArgs }
  | { readonly ok: false; readonly error: CliArgParseError };

export interface ParseCliArgsOptions {
  readonly cwd: string;
}
