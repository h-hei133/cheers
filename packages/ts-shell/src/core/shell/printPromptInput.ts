export type StdinTransportMode = "none" | "capture-batch" | "stream-live";

export function buildNonInteractivePrompts(
  promptArg: string | undefined,
  pipedInput: string | null,
): string[] {
  const prompt = promptArg?.trim() ?? "";
  if (pipedInput === null) {
    return prompt.length > 0 ? [prompt] : [];
  }

  const pipedPrompts = parseTransportPrompts(pipedInput, {
    allowComments: false,
  });
  if (pipedPrompts.length === 0) {
    return prompt.length > 0 ? [prompt] : [];
  }

  if (!prompt) {
    return pipedPrompts;
  }

  return [prompt, ...pipedPrompts];
}

export function parseTransportPrompts(
  raw: string,
  options: { allowComments: boolean },
): string[] {
  const normalizedRaw = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  return normalizedRaw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (line.length === 0) {
        return false;
      }
      if (options.allowComments && line.startsWith("#")) {
        return false;
      }
      return true;
    });
}

export function isFenceLine(line: string): boolean {
  return line.trim().startsWith("```");
}

export function updateFenceState(current: boolean, line: string): boolean {
  const fenceCount = line.match(/```/g)?.length ?? 0;
  return fenceCount % 2 === 0 ? current : !current;
}

export function opensMultilineLiteralPrompt(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.endsWith(":")) {
    return false;
  }
  return /(?:create|write|append|edit|modify|update).*(?:content|exactly)|(?:content|exactly).*(?:create|write|append|edit|modify|update)/i.test(
    trimmed,
  );
}

export function resolveStdinTransportMode(input: {
  stdinIsTty: boolean;
  printMode: boolean;
  hasReplayFile: boolean;
  hasPromptArg: boolean;
}): StdinTransportMode {
  if (input.stdinIsTty || input.hasReplayFile) {
    return "none";
  }
  if (input.printMode) {
    return "capture-batch";
  }
  if (input.hasPromptArg) {
    return "none";
  }
  return "stream-live";
}
