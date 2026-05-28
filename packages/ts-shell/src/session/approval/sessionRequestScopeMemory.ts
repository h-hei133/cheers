import {
  extractLastPermissionRequestFromEvidence,
  extractLastRequestScopeFromEvidence,
  parsePermissionRequestMemory,
  parseRequestScopeMemory,
  resolvePermissionRequestMemory,
  resolveRequestScopeMemory,
} from "../permissionRequestMemoryCodec.js";
import type { SessionContinuitySnapshot } from "../sessionContinuityTypes.js";

export function projectSessionRequestScopeContinuity(input: {
  readonly evidence: readonly string[] | undefined;
  readonly workingMemory: unknown;
  readonly sessionProjectRoot: string;
}): Partial<SessionContinuitySnapshot> {
  const lastRequestScope = extractLastRequestScopeFromEvidence(input.evidence);
  const lastRequestScopeFromMemory = parseRequestScopeMemory(
    input.workingMemory,
  );
  const lastPermissionRequest = extractLastPermissionRequestFromEvidence(
    input.evidence,
  );
  const lastPermissionRequestFromMemory = parsePermissionRequestMemory(
    input.workingMemory,
  );
  const resolvedLastPermissionRequest = resolvePermissionRequestMemory({
    evidence: lastPermissionRequest,
    memory: lastPermissionRequestFromMemory,
    sessionProjectRoot: input.sessionProjectRoot,
  });
  const resolvedLastRequestScope = resolveRequestScopeMemory({
    evidence: lastRequestScope,
    memory: lastRequestScopeFromMemory,
    sessionProjectRoot: input.sessionProjectRoot,
  });
  return {
    ...(resolvedLastPermissionRequest.toolName
      ? { lastPermissionRequestToolName: resolvedLastPermissionRequest.toolName }
      : {}),
    ...(resolvedLastPermissionRequest.operation
      ? {
          lastPermissionRequestOperation:
            resolvedLastPermissionRequest.operation,
        }
      : {}),
    ...(resolvedLastPermissionRequest.target
      ? { lastPermissionRequestTarget: resolvedLastPermissionRequest.target }
      : {}),
    ...(resolvedLastPermissionRequest.process
      ? { lastPermissionRequestProcess: resolvedLastPermissionRequest.process }
      : {}),
    ...(resolvedLastPermissionRequest.scopeKey
      ? { lastPermissionRequestScopeKey: resolvedLastPermissionRequest.scopeKey }
      : {}),
    ...(resolvedLastPermissionRequest.scopeLabel
      ? {
          lastPermissionRequestScopeLabel:
            resolvedLastPermissionRequest.scopeLabel,
        }
      : {}),
    ...(resolvedLastPermissionRequest.cacheKey
      ? { lastPermissionRequestCacheKey: resolvedLastPermissionRequest.cacheKey }
      : {}),
    ...(resolvedLastPermissionRequest.projectRoot
      ? {
          lastPermissionRequestProjectRoot:
            resolvedLastPermissionRequest.projectRoot,
        }
      : {}),
    ...(resolvedLastPermissionRequest.source
      ? { lastPermissionRequestSource: resolvedLastPermissionRequest.source }
      : {}),
    ...(resolvedLastPermissionRequest.lineage
      ? { lastPermissionRequestLineage: resolvedLastPermissionRequest.lineage }
      : {}),
    ...(resolvedLastRequestScope.cacheKey
      ? { lastRequestScopeCacheKey: resolvedLastRequestScope.cacheKey }
      : {}),
    ...(resolvedLastRequestScope.scopeLabel
      ? { lastRequestScopeLabel: resolvedLastRequestScope.scopeLabel }
      : {}),
    ...(resolvedLastRequestScope.projectRoot
      ? { lastRequestScopeProjectRoot: resolvedLastRequestScope.projectRoot }
      : {}),
    ...(resolvedLastRequestScope.source
      ? { lastRequestScopeSource: resolvedLastRequestScope.source }
      : {}),
  };
}
