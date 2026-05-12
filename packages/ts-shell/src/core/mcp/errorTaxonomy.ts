export type McpFailureClass =
  | "config"
  | "server-unavailable"
  | "protocol"
  | "permission-denied"
  | "tool-unavailable"
  | "tool-is-error"
  | "tool-execution"
  | "stdio-process"
  | "timeout-cancelled"
  | "malformed-result"
  | "unknown";

export type McpFailurePlane =
  | "user-config"
  | "server-availability"
  | "permission"
  | "tool-level"
  | "protocol-level"
  | "runtime"
  | "unknown";

export interface McpFailureTaxonomy {
  readonly failureClass: McpFailureClass;
  readonly failurePlane: McpFailurePlane;
  readonly safeDetail: string;
}

export class McpClassifiedError extends Error {
  readonly failureClass: McpFailureClass;
  readonly failurePlane: McpFailurePlane;
  readonly safeDetail: string;

  constructor(input: McpFailureTaxonomy) {
    super(input.safeDetail);
    this.name = "McpClassifiedError";
    this.failureClass = input.failureClass;
    this.failurePlane = input.failurePlane;
    this.safeDetail = input.safeDetail;
  }
}

export function classifyMcpFailure(input: {
  readonly failureClass: McpFailureClass;
  readonly detail: string;
}): McpFailureTaxonomy {
  const safeDetail = sanitizeMcpDiagnostic(input.detail);
  return {
    failureClass: input.failureClass,
    failurePlane: failurePlaneForClass(input.failureClass),
    safeDetail,
  };
}

export function classifyUnknownMcpFailure(error: unknown): McpFailureTaxonomy {
  if (error instanceof McpClassifiedError) {
    return {
      failureClass: error.failureClass,
      failurePlane: error.failurePlane,
      safeDetail: error.safeDetail,
    };
  }

  return classifyMcpFailure({
    failureClass: "unknown",
    detail: error instanceof Error ? error.message : String(error),
  });
}

export function mcpFailureMetadata(
  taxonomy: McpFailureTaxonomy,
): Record<string, unknown> {
  return {
    mcpFailureClass: taxonomy.failureClass,
    mcpFailurePlane: taxonomy.failurePlane,
    mcpSafeDetail: taxonomy.safeDetail,
  };
}

function failurePlaneForClass(failureClass: McpFailureClass): McpFailurePlane {
  switch (failureClass) {
    case "config":
      return "user-config";
    case "server-unavailable":
    case "stdio-process":
    case "timeout-cancelled":
      return "server-availability";
    case "permission-denied":
      return "permission";
    case "tool-unavailable":
    case "tool-is-error":
    case "tool-execution":
      return "tool-level";
    case "protocol":
    case "malformed-result":
      return "protocol-level";
    case "unknown":
      return "unknown";
  }
}

function sanitizeMcpDiagnostic(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(api[_-]?key|token|authorization|secret)=\S+/gi, "$1=[redacted]")
    .replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[redacted-real-provider-home]")
    .slice(0, 240);
}
