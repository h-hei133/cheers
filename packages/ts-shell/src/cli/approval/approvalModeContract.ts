export interface ApprovalModeObject {
  readonly mode: "deny" | "allow-once" | "allow-always";
  readonly persistent: boolean;
  readonly source:
    | "prompt-explicit-verify-lineage"
    | "prompt-ambiguous-verify-lineage";
  readonly verifyLineage: "blocked-verify-resume";
  readonly command?: string;
  readonly commandCwd?: string;
  readonly targetPath?: string;
  readonly executableNow: boolean;
  readonly missingFields: readonly string[];
}
