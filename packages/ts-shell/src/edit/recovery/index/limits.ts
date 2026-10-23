/** Original explicit index admission, independently composed with caller read policy. */
export const RECOVERY_INDEX_LIMITS = Object.freeze({
  metadataBytes: 32 * 1024 * 1024,
  records: 20_000,
  directoryEntries: 50_000,
});
