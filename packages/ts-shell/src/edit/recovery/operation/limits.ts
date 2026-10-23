/** Read admission, independent of file restoration or write approval. */
export const OPERATION_READ_LIMITS = Object.freeze({
  jsonBytes: 8 * 1024 * 1024,
  totalBytes: 32 * 1024 * 1024,
  files: 50_000,
  directoryEntries: 20_000,
});

export const UNDO_PREVIEW_LIMITS = Object.freeze({ fileBytes: 64 * 1024 * 1024, totalBytes: 128 * 1024 * 1024 });
