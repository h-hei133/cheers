export type BrowserRuntimeDependencyMode =
  | "external-runner-only"
  | "dev-dependency"
  | "package-dependency"
  | "optional-peer"
  | "skill-managed"
  | "unavailable";

export type BrowserRuntimeDependencyRisk =
  | "dependency-footprint"
  | "browser-binary-footprint"
  | "install-complexity"
  | "sandboxability"
  | "ci-determinism"
  | "package-governance"
  | "default-execution-risk";

export interface BrowserRuntimeDependencyDecision {
  readonly mode: BrowserRuntimeDependencyMode;
  readonly recommended: boolean;
  readonly reason: string;
  readonly risks: readonly BrowserRuntimeDependencyRisk[];
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export interface BrowserRuntimeDependencyPolicy {
  readonly decision: BrowserRuntimeDependencyDecision;
  readonly alternatives: readonly BrowserRuntimeDependencyDecision[];
  readonly packageMutation: "none" | "required" | "deferred";
  readonly browserBinaryInstall: "none" | "required" | "deferred";
  readonly defaultBrowserExecution: "disabled";
  readonly providerCall: "none";
  readonly modelCall: "none";
  readonly networkAccess: "none";
}

export function decideBrowserRuntimeDependencyPolicy(input: {
  readonly playwrightDeclared?: boolean;
  readonly browserBinaryInstalled?: boolean;
  readonly explicitRunnerAvailable?: boolean;
  readonly preferSkillManaged?: boolean;
} = {}): BrowserRuntimeDependencyPolicy {
  const preferredMode: BrowserRuntimeDependencyMode = input.preferSkillManaged
    ? "skill-managed"
    : "external-runner-only";
  const decision = makeDecision(preferredMode, true, {
    reason: input.explicitRunnerAvailable
      ? "Use the explicit local runner already supplied by route or harness configuration."
      : "Keep Playwright outside package dependencies until browser binary install and execution policy are separately approved.",
    risks: ["sandboxability", "ci-determinism"],
    nextAction: input.preferSkillManaged
      ? "Define a skill-managed runner bridge that stays explicit and local-only."
      : "Inject a local runner explicitly through route or harness configuration; do not mutate package files.",
    evidence: [
      "browser-runtime-dependency-policy:recommended",
      `browser-runtime-dependency-policy:mode:${preferredMode}`,
    ],
  });
  return {
    decision,
    alternatives: [
      makeDecision("dev-dependency", false, {
        reason: "A devDependency would still require browser binary install policy and CI footprint approval.",
        risks: ["browser-binary-footprint", "install-complexity", "ci-determinism"],
        nextAction: "Defer until tests need real Playwright execution by default.",
      }),
      makeDecision("package-dependency", false, {
        reason: "A runtime dependency would expand install footprint and could imply browser execution readiness.",
        risks: ["dependency-footprint", "browser-binary-footprint", "package-governance", "default-execution-risk"],
        nextAction: "Defer until browser execution is a default product capability.",
      }),
      makeDecision("optional-peer", false, {
        reason: "An optional peer still needs clear runner discovery and user installation guidance.",
        risks: ["install-complexity", "package-governance"],
        nextAction: "Reconsider after external-runner policy has real user evidence.",
      }),
    ],
    packageMutation: input.playwrightDeclared ? "deferred" : "none",
    browserBinaryInstall: input.browserBinaryInstalled ? "deferred" : "none",
    defaultBrowserExecution: "disabled",
    providerCall: "none",
    modelCall: "none",
    networkAccess: "none",
  };
}

function makeDecision(
  mode: BrowserRuntimeDependencyMode,
  recommended: boolean,
  input: {
    readonly reason: string;
    readonly risks: readonly BrowserRuntimeDependencyRisk[];
    readonly nextAction: string;
    readonly evidence?: readonly string[];
  },
): BrowserRuntimeDependencyDecision {
  return {
    mode,
    recommended,
    reason: input.reason,
    risks: input.risks,
    nextAction: input.nextAction,
    evidence: [
      ...(input.evidence ?? []),
      "browser-runtime-dependency-policy:no-package-mutation",
      "browser-runtime-dependency-policy:no-runtime-execution",
      "browser-runtime-dependency-policy:no-provider-or-model-call",
    ],
  };
}
