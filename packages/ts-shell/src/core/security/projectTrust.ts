/** Compatibility entry point; trust decisions and persistence belong to trust/. */
export { ProjectTrustStore, projectTrust } from './trust/store.js';
export { TrustWriteError, type ProjectTrustLevel, type ProjectTrustRecord, type TrustStoreFile, type TrustDecision, type TrustWriteResult } from './trust/model.js';
