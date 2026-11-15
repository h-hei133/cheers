import { BranchStoreError, type BranchStoreReason, type BranchStoreStatus } from '../../../session/branch/store/contract.js';

export type CodemodeStoreStatus = BranchStoreStatus;
export type CodemodeStoreReason = BranchStoreReason;

/** Retain the codemode result/error surface while session owns persistence. */
export class CodemodeStoreError extends BranchStoreError {
  constructor(reason: CodemodeStoreReason, status: CodemodeStoreStatus = 'unchanged') {
    super(reason, status);
    this.message = `Codemode storage ${reason}; persistence ${status}.`; this.name = 'CodemodeStoreError';
  }
}
