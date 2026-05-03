export type PtyCapabilityStrategy = "node-pty" | "external-pty-probe";

export type PtyUnavailableReason =
  | "dependency-unavailable"
  | "environment-unsupported"
  | "sandbox-spawn-blocked"
  | "sandbox-filesystem-blocked"
  | "manual-tty-only"
  | "unknown";

export type PtyCapabilityStatus =
  | {
      available: true;
      strategy: PtyCapabilityStrategy;
      details: string;
    }
  | {
      available: false;
      reason: PtyUnavailableReason;
      details: string;
    };

export type PtyProbeUnavailableStatus = Extract<
  PtyCapabilityStatus,
  { available: false }
>;

export type PtyCapabilityProbeResult =
  | {
      available: true;
      details?: string;
    }
  | {
      available: false;
      reason: PtyUnavailableReason;
      details?: string;
    };

export type DetectPtyCapabilityOptions = {
  approvedStrategy?: PtyCapabilityStrategy;
  probe?: () => Promise<PtyCapabilityProbeResult> | PtyCapabilityProbeResult;
};

const noApprovedStrategyDetails =
  "No approved true PTY dependency or external probe is configured; pipe-spawn coverage is not true PTY coverage.";

export async function detectPtyCapability(
  options: DetectPtyCapabilityOptions = {},
): Promise<PtyCapabilityStatus> {
  const { approvedStrategy, probe } = options;
  if (!approvedStrategy) {
    return {
      available: false,
      reason: "dependency-unavailable",
      details: noApprovedStrategyDetails,
    };
  }

  if (!probe) {
    return {
      available: false,
      reason: "dependency-unavailable",
      details: `Approved PTY strategy "${approvedStrategy}" has no test-only probe implementation; pipe-spawn coverage is not true PTY coverage.`,
    };
  }

  try {
    const result = await probe();
    if (result.available === true) {
      return {
        available: true,
        strategy: approvedStrategy,
        details: result.details ?? `Approved PTY strategy "${approvedStrategy}" is available.`,
      };
    }
    return {
      available: false,
      reason: result.reason,
      details: result.details ?? `Approved PTY strategy "${approvedStrategy}" is unavailable.`,
    };
  } catch (error) {
    return classifyProbeError(error);
  }
}

export function formatPtyUnavailableSkipMessage(
  status: PtyProbeUnavailableStatus,
): string {
  return `true PTY unavailable: ${status.reason}. ${status.details} Pipe-spawn coverage is not true PTY coverage.`;
}

function classifyProbeError(error: unknown): PtyProbeUnavailableStatus {
  const code = getErrorCode(error);
  const message = getErrorMessage(error);
  if (code === "EPERM") {
    return {
      available: false,
      reason: "sandbox-spawn-blocked",
      details: `PTY probe spawn was blocked with EPERM: ${message}`,
    };
  }
  if (code === "ENOENT" || code === "MODULE_NOT_FOUND") {
    return {
      available: false,
      reason: "dependency-unavailable",
      details: `PTY probe dependency is unavailable: ${message}`,
    };
  }
  return {
    available: false,
    reason: "unknown",
    details: `PTY probe failed unexpectedly: ${message}`,
  };
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
