import type { ApprovalTrustPolicy } from "../../../core/shell/approvalTrustPolicy.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker } from "../overlay.js";

/**
 * Trust grant chooser.
 *
 * Lists what has actually been granted, so revoking is a selection rather than
 * a typed selector the user has to reconstruct from a text dump.
 */

export interface PermissionPickerOptions {
  readonly policy: ApprovalTrustPolicy;
  readonly projectRoot: string;
  /** Revoke one grant by its selector and report the outcome. */
  readonly revoke: (selector: string) => Promise<string | undefined>;
}

/** When the grant was last confirmed, which is how a user recognises it. */
function grantAge(stamp: string | undefined): string | undefined {
  const at = stamp ? Date.parse(stamp) : Number.NaN;
  if (Number.isNaN(at)) return undefined;
  const days = Math.floor((Date.now() - at) / 86_400_000);
  if (days <= 0) return "today";
  return `${days}d ago`;
}

export function permissionPicker(options: PermissionPickerOptions): Picker {
  return {
    title: "Revoke trust grant",
    form: "panel",
    empty: "No trust grants recorded for this project.",
    async load(): Promise<readonly Option[]> {
      return options.policy.listGrants(options.projectRoot).map<Option>((grant) => ({
        id: grant.key,
        label: `${grant.toolName} ${grant.operation}`,
        detail: grant.scopeLabel,
        note: grantAge(grant.updatedAt ?? grant.createdAt),
      }));
    },
    async apply(ids: readonly string[]): Promise<string | undefined> {
      const selector = ids[0];
      return selector ? options.revoke(selector) : undefined;
    },
  };
}
