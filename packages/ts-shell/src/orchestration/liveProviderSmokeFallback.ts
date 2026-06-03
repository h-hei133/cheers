export type LiveProviderSmokeFallbackFailureClass =
  | "none"
  | "provider-network"
  | "provider-auth"
  | "config-or-skip"
  | "product-regression";

export type LiveProviderSmokeFallbackOutcome =
  | "passed"
  | "failed"
  | "skipped"
  | "inconclusive";

export interface LiveProviderSmokeFallbackDecision {
  readonly primaryAttempted: boolean;
  readonly primaryFailureClass: LiveProviderSmokeFallbackFailureClass;
  readonly fallbackConfigured: boolean;
  readonly fallbackAttempted: boolean;
  readonly fallbackOutcome: LiveProviderSmokeFallbackOutcome;
  readonly blocker?: string;
}

export function classifyLiveProviderPrimaryFailure(input: {
  readonly primaryAttempted: boolean;
  readonly providerErrorClass?: string;
  readonly status?: string;
  readonly skipReason?: string;
}): LiveProviderSmokeFallbackFailureClass {
  if (!input.primaryAttempted) return "none";
  const providerErrorClass = input.providerErrorClass ?? "none";
  if (providerErrorClass === "network" || providerErrorClass === "timeout") {
    return "provider-network";
  }
  if (providerErrorClass === "auth" || input.skipReason === "provider-auth") {
    return "provider-auth";
  }
  if (
    providerErrorClass === "missing-key" ||
    providerErrorClass === "unsupported" ||
    input.skipReason === "provider-not-configured" ||
    input.skipReason === "provider-unsupported"
  ) {
    return "config-or-skip";
  }
  if (
    input.status === "provider-called-output-invalid" ||
    input.status === "provider-called-unsafe-output" ||
    input.status === "provider-called-anchor-failed" ||
    providerErrorClass === "malformed-response" ||
    providerErrorClass === "unsafe-output"
  ) {
    return "product-regression";
  }
  return "none";
}

export function shouldAttemptLiveProviderFallback(input: {
  readonly primaryAttempted: boolean;
  readonly providerErrorClass?: string;
  readonly status?: string;
  readonly skipReason?: string;
  readonly fallbackConfigured: boolean;
}): LiveProviderSmokeFallbackDecision {
  const primaryFailureClass = classifyLiveProviderPrimaryFailure(input);
  if (primaryFailureClass !== "provider-network") {
    return {
      primaryAttempted: input.primaryAttempted,
      primaryFailureClass,
      fallbackConfigured: input.fallbackConfigured,
      fallbackAttempted: false,
      fallbackOutcome: "skipped",
      blocker: primaryFailureClass === "none" ? undefined : "primary-failure-not-network",
    };
  }
  if (!input.fallbackConfigured) {
    return {
      primaryAttempted: input.primaryAttempted,
      primaryFailureClass,
      fallbackConfigured: false,
      fallbackAttempted: false,
      fallbackOutcome: "inconclusive",
      blocker: "no-configured-fallback-provider",
    };
  }
  return {
    primaryAttempted: input.primaryAttempted,
    primaryFailureClass,
    fallbackConfigured: true,
    fallbackAttempted: true,
    fallbackOutcome: "skipped",
  };
}

export function classifyLiveProviderFallbackOutcome(input: {
  readonly fallbackAttempted: boolean;
  readonly exitCode?: number;
  readonly providerErrorClass?: string;
  readonly status?: string;
}): LiveProviderSmokeFallbackOutcome {
  if (!input.fallbackAttempted) return "skipped";
  if (input.exitCode === 0) return "passed";
  const providerErrorClass = input.providerErrorClass ?? "none";
  if (providerErrorClass === "network" || providerErrorClass === "timeout") {
    return "inconclusive";
  }
  return "failed";
}
