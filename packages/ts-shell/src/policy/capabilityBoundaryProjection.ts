import {
  ROUTE219_TASK_QUALITY_BENCHMARK_COMMAND,
} from "../verification/taskQualityBenchmarkCommand.js";

const RUN_COMMAND_ALLOWLIST = [
  "node --version",
  "npm test -- --help",
  "npm run build -- --help",
  "npm run build -w packages/ts-shell",
  ROUTE219_TASK_QUALITY_BENCHMARK_COMMAND,
] as const;


export function detectCommand(normalizedPrompt: string): string {
  const trimmed = normalizedPrompt.trim();
  if (trimmed.startsWith("node ") || trimmed.startsWith("npm ") || trimmed.startsWith("cargo ") || trimmed.startsWith("pytest") || trimmed.startsWith("git ")) {
    return trimmed;
  }

  // Every branch below must return a member of RUN_COMMAND_ALLOWLIST: the mapping
  // runs before allowlist evaluation, so returning anything else turns a matched
  // intent into a blocked command instead of an executable one.
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

  if (/\bdir\b/.test(normalizedPrompt)) {
    return "dir";
  }

  if (/\bls\b/.test(normalizedPrompt)) {
    return "ls";
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
    `Run-command intent is not allowed in the controlled allowlist: ${command}`,
    `Allowed commands: ${RUN_COMMAND_ALLOWLIST.join(", ")}`,
    "Please rephrase your request to one of the allowed command intents.",
  ].join(" ");
}
