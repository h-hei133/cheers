/** Complete snapshot browsing admission; explicit record consumers keep their own policy. */
export const RECOVERY_CATALOG_LIMITS = Object.freeze({
  metadataBytes: 32 * 1024 * 1024,
  records: 20_000,
  directoryEntries: 50_000,
});
