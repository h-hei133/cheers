export interface CliPrintModeRunnerOptions {
  readonly prompts: readonly string[];
  readonly writeError: (message: string) => void;
  readonly exit: (code: number) => never;
  readonly runPrompt: (prompt: string) => Promise<void>;
}

export async function runCliPrintMode(
  options: CliPrintModeRunnerOptions,
): Promise<void> {
  if (options.prompts.length === 0) {
    options.writeError(
      "No prompt provided for --print mode. Pass a prompt argument or pipe stdin.",
    );
    options.exit(1);
  }

  for (const prompt of options.prompts) {
    await options.runPrompt(prompt);
  }
}
