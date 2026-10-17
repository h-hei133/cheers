import type { RuntimeProvider } from "../../config/runtimeConfig.js";

export type NonInteractiveApprovalMode =
  | "deny"
  | "allow-once"
  | "allow-always";

export interface CliOptions {
  readonly profile?: string;
  /** Ordered, personal, read-only JSONC inputs resolved against launch cwd. */
  readonly configPaths?: readonly string[];
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
   * Skill files or directories to load on top of discovery, repeatable.
   *
   * A flag rather than a setting because the reason to want it is per-run:
   * trying a skill out before installing it, or pointing a run at one file.
   */
  readonly skillPaths?: readonly string[];
  /**
   * Skip discovered skills for this run.
   *
   * Explicit `skillPaths` still load — a named file is the user's direct
   * instruction, and a switch that silences it would make the two flags
   * disagree about which of them owns the run.
   */
  readonly noSkills?: boolean;
  /**
   * Theme files or directories to load on top of discovery, repeatable.
   *
   * A flag rather than a setting because the reason to want it is per-run:
   * trying a theme out before installing it, or pointing a run at one file.
   * Loading and selecting are separate, as they are in the reference — a path
   * says where a theme comes from, `useTheme` says which one to render.
   */
  readonly themePaths?: readonly string[];
  /**
   * The theme to render this run with, by name.
   *
   * Named rather than inferred from `themePaths`: a theme file may hold several
   * themes, and a directory holds many, so "load these" does not answer "which
   * one". Without this a `--theme` path would load a theme nothing selects.
   */
  readonly useTheme?: string;
  /**
   * Skip requests this session would make on its own.
   *
   * The same switch the `offline` setting carries, for one run: someone on a
   * metered link or a locked-down machine wants it for this invocation without
   * editing a file that outlives it.
   */
  readonly offline?: boolean;
  /**
   * The only tools this run may offer, comma-separated.
   *
   * A flag rather than only a setting because a read-only pass is a per-run
   * intent: "review this, change nothing". Naming what may run fails closed,
   * where naming what may not fails open as the tool set grows.
   */
  readonly allowedTools?: readonly string[];
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
