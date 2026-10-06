import type { ApprovalTrustPolicy } from "../../../core/shell/approvalTrustPolicy.js";
import type { Suggestion } from "../../../presentation/tui/chrome/suggestions.js";

export type GrantCatalog = Pick<ApprovalTrustPolicy, "listGrants"> & Partial<Pick<ApprovalTrustPolicy, "sourcePath">>;

/** Use a stable selector, never a display index that can shift before submission. */
export function grantCatalog(projectRoot: string, policy: GrantCatalog): readonly Suggestion[] {
  return policy.listGrants(projectRoot).map(grant => ({
    value: grant.key, label: `${grant.toolName} ${grant.operation}`, detail: grant.scopeLabel,
  }));
}
