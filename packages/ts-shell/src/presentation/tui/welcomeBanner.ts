export interface WelcomeIntroOptions {
  readonly workspaceRoot: string;
  readonly modelName?: string;
  readonly provider?: string;
  readonly gitBranch?: string;
}

/**
 * Minimal Welcome Intro Banner for Clean TUI Startup
 * Displays only current directory and active model without leaking verbose debug lines.
 */
export function formatMinimalWelcomeBanner(options: WelcomeIntroOptions): string {
  const model = options.modelName ?? "default-model";
  const branch = options.gitBranch ? ` (${options.gitBranch})` : "";
  const cwd = options.workspaceRoot;

  const lines = [
    `\x1b[1m\x1b[36mCoding Agent Shell\x1b[0m \x1b[90m│\x1b[0m \x1b[32m${model}\x1b[0m`,
    `\x1b[90mDirectory:\x1b[0m ${cwd}${branch ? ` \x1b[90m│\x1b[0m \x1b[33m⎇ ${branch}\x1b[0m` : ""}`,
    "",
  ];

  return lines.join("\n");
}
