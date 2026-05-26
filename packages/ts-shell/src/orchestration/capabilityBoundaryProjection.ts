const RUN_COMMAND_ALLOWLIST = [
  "node --version",
  "npm test -- --help",
  "npm run build -- --help",
  "npm run build -w packages/ts-shell",
  "npm run verify:route219-real-task-quality-benchmark",
] as const;

const FOCUSED_TS_SHELL_TEST_COMMAND_ALLOWLIST = [
  "npm test -w packages/ts-shell -- src/orchestration/verificationCommandPlan.test.ts",
  "npm test -w packages/ts-shell -- src/orchestration/taskRelevantVerificationRoute.test.ts",
  "npm test -w packages/ts-shell -- src/orchestration/planningRuntimeProductExecution.test.ts",
  "npm test -w packages/ts-shell -- src/orchestration/verificationRepairBridge.test.ts src/orchestration/verificationRepairContext.test.ts",
  "npm test -w packages/ts-shell -- src/orchestration/targetSetEditRoute.test.ts src/orchestration/targetSetEditVerification.test.ts",
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

  if (/\bdir\b/.test(normalizedPrompt)) {
    return "dir";
  }

  if (/\bls\b/.test(normalizedPrompt)) {
    return "ls";
  }

  return null;
}

export function isAllowlistedRunCommand(command: string): boolean {
  if (isAllowlistedFocusedTsShellTestCommand(command)) {
    return true;
  }
  return RUN_COMMAND_ALLOWLIST.includes(
    command as (typeof RUN_COMMAND_ALLOWLIST)[number],
  );
}

export function isAllowlistedFocusedTsShellTestCommand(command: string): boolean {
  return FOCUSED_TS_SHELL_TEST_COMMAND_ALLOWLIST.includes(
    command as (typeof FOCUSED_TS_SHELL_TEST_COMMAND_ALLOWLIST)[number],
  );
}

export function blockedCommandReason(command: string): string {
  return [
    `Run-command intent is not allowed in the MVP allowlist: ${command}`,
    `Allowed commands: ${RUN_COMMAND_ALLOWLIST.join(", ")}, npm test -w packages/ts-shell -- src/orchestration/<test>.test.ts`,
    "Please rephrase your request to one of the allowed command intents.",
  ].join(" ");
}
