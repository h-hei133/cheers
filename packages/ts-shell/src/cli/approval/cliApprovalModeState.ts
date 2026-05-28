import type {
  ApprovalModeObject,
} from "./approvalModeContract.js";

export interface CliApprovalModeState {
  readonly get: () => ApprovalModeObject | undefined;
  readonly set: (mode: ApprovalModeObject | undefined) => void;
}

export function createCliApprovalModeState(): CliApprovalModeState {
  let activeMode: ApprovalModeObject | undefined;
  return {
    get: () => activeMode,
    set: (mode) => {
      activeMode = mode;
    },
  };
}
