const RUN_COMMAND_ALLOWLIST = [
  "node --version",
  "npm test -- --help",
  "npm run build -- --help",
] as const;

export function detectCommand(normalizedPrompt: string): string {
  // Keep command mapping intentionally narrow for MVP controllability.
  if (normalizedPrompt.includes("version")) {
    return "node --version";
  }

  if (normalizedPrompt.includes("test")) {
    return "npm test -- --help";
  }

  if (normalizedPrompt.includes("build")) {
    return "npm run build -- --help";
  }

  return "node --version";
}

export function detectUnsupportedCommandIntent(
  normalizedPrompt: string,
): string | null {
  if (normalizedPrompt.includes("publish")) {
    return "npm publish";
  }

  if (normalizedPrompt.includes("deploy")) {
    return "npm run deploy";
  }

  if (normalizedPrompt.includes("delete") || normalizedPrompt.includes("rm ")) {
    return "rm -rf";
  }

  if (normalizedPrompt.includes("curl") || normalizedPrompt.includes("wget")) {
    return "curl";
  }

  return null;
}

export function isAllowlistedRunCommand(command: string): boolean {
  return RUN_COMMAND_ALLOWLIST.includes(
    command as (typeof RUN_COMMAND_ALLOWLIST)[number],
  );
}

export function blockedCommandReason(command: string): string {
  return [
    `Run-command intent is not allowed in the MVP allowlist: ${command}`,
    `Allowed commands: ${RUN_COMMAND_ALLOWLIST.join(", ")}`,
    "Please rephrase your request to one of the allowed command intents.",
  ].join(" ");
}
