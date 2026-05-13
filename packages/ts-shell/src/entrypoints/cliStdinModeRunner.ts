export type CliStdinModeRunnerOptions =
  | {
      readonly mode: "stream-live";
      readonly runStream: () => Promise<void>;
    }
  | {
      readonly mode: "batch";
      readonly prompts: readonly string[];
      readonly pipedInput: string | null;
      readonly sessionId: string;
      readonly renderLine: (line: string) => void;
      readonly runPrompt: (prompt: string) => Promise<void>;
    };

export async function runCliStdinMode(
  options: CliStdinModeRunnerOptions,
): Promise<void> {
  if (options.mode === "stream-live") {
    await options.runStream();
    return;
  }

  if (options.prompts.length === 0) {
    return;
  }

  if (options.pipedInput !== null && options.prompts.length > 1) {
    options.renderLine(
      `Stdin batch mode: running ${options.prompts.length} prompt(s) sequentially in session ${options.sessionId}.`,
    );
  }

  for (const prompt of options.prompts) {
    await options.runPrompt(prompt);
  }
}
