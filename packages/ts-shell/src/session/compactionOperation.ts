/** Compatibility surface; the compaction owner contains all behavior. */
export { claimCompactionStep, completeCompactionStep, compactionOperationsPath, compactionStepDigest,
  dispatchCompactionStep, releaseCompactionStep, markCompactionStepUnknown } from './compaction/state.js';
export { CompactionOperationError } from './compaction/contract.js';
export type { CompactionOperationInput, CompactionStepClaim, CompactionStepStatus } from './compaction/contract.js';
