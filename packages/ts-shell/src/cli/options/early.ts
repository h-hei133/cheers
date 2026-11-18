import { scanCliArgs } from './argv.js';

/** Whether the invocation asks for the version before any prompt terminator. */
export function isVersionRequested(args: readonly string[]): boolean {
  return scanCliArgs(args).versionRequested;
}

/** Whether the invocation asks for top-level CLI help before any prompt terminator. */
export function isHelpRequested(args: readonly string[]): boolean {
  return scanCliArgs(args).helpRequested;
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
  --continue, -c                    Continue the most recent session.
  --resume, -r                      Open the interactive session resume picker.
  --fork <id-or-path>               Fork an existing session into a new session.
  --provider <name>                 Select a provider.
  --model <pattern>                 Select an initial model (supports provider/id and :thinking).
  --models <patterns>               Comma-separated model list for cycling.
  --thinking <level>                Set thinking effort (off, minimal, low, medium, high, xhigh, max).
  --api-key <key>                   Supply a provider API key.
  --replay-file <file>              Replay prompts from a file.
  --export <source> [output]        Export a session to HTML and exit.
  --list-models [pattern]           List available models and exit.
  --print, -p                       Run one prompt and exit.
  --json                            Emit run events as JSON lines.
  --rpc                             Run a bidirectional JSON lines session.
  --non-interactive-approval <mode>  Use deny, allow-once, or allow-always.
  --tools <names>                   Limit the available tools.
  --no-tools, -nt                   Disable all built-in tools.
  --extension, -e <path>            Add an extension file or directory; repeatable.
  --skill <path>                    Add a skill file or directory; repeatable.
  --theme <path>                    Add a theme file or directory; repeatable.
  --use-theme <name>                Select the initial theme.
  --no-context-files                Skip project instruction files.
  --no-skills, -ns                  Skip discovered skills.
  --offline                         Disable startup network operations.
  --migrate-session-root            Migrate session roots.
  --doctor                          Print environment diagnostics.
  --                                Treat remaining arguments as text.
  --help, -h                        Show this help.
  --version, -v, -V                 Show the version.

Inside an interactive session, use /help for slash-command navigation.
`;
}
