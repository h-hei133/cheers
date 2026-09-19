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
  readonly promptArg?: string;
  readonly migrateSessionRoot?: boolean;
  readonly nonInteractiveApproval?: NonInteractiveApprovalMode;
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
