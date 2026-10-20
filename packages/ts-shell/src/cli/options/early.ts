const VERSION_FLAGS = new Set(["--version", "-v", "-V"]);
const HELP_FLAGS = new Set(["--help", "-h"]);

function containsEarlyFlag(args: readonly string[], flags: ReadonlySet<string>): boolean {
  for (const arg of args) {
    if (arg === "--") return false;
    if (flags.has(arg)) return true;
  }
  return false;
}

/** Whether the invocation asks for the version before any prompt terminator. */
export function isVersionRequested(args: readonly string[]): boolean {
  return containsEarlyFlag(args, VERSION_FLAGS);
}

/** Whether the invocation asks for top-level CLI help before any prompt terminator. */
export function isHelpRequested(args: readonly string[]): boolean {
  return containsEarlyFlag(args, HELP_FLAGS);
}

/** Static help text; it deliberately does not load the runtime or command registry. */
export function cliHelpText(): string {
  return `Cheers - terminal coding agent

Usage:
  cheers [options] [prompt]
  cheers --help
  cheers --version

Options:
  --profile <name>                  Select a profile.
  --config <file>                   Add a personal JSONC input; repeatable.
  --project, --attach <path>        Select the workspace.
  --session-id <id>                 Resume a specific session.
  --provider <name>                 Select a provider.
  --api-key <key>                   Supply a provider API key.
  --replay-file <file>              Replay prompts from a file.
  --print, -p                       Run one prompt and exit.
  --json                            Emit run events as JSON lines.
  --non-interactive-approval <mode>  Use deny, allow-once, or allow-always.
  --tools <names>                   Limit the available tools.
  --skill <path>                    Add a skill file or directory; repeatable.
  --theme <path>                    Add a theme file or directory; repeatable.
  --use-theme <name>                Select the initial theme.
  --no-context-files                Skip project instruction files.
  --no-skills, -ns                  Skip discovered skills.
  --offline                         Disable startup network operations.
  --dangerously-bypass-hook-trust   Run project hooks without per-hook approval.
  --migrate-session-root            Migrate session roots.
  --doctor                          Print environment diagnostics.
  --                                Treat remaining arguments as text.
  --help, -h                        Show this help.
  --version, -v, -V                 Show the version.

Inside an interactive session, use /help for slash-command navigation.
`;
}
