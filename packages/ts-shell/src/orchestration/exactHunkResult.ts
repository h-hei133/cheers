export interface ExactHunkResultSummary {
  readonly hunkCount: number;
  readonly changedHunkCount: number;
  readonly failedHunkCount: number;
  readonly unattemptedHunkCount: number;
  readonly redactionStatus: "raw-content-excluded";
  readonly evidence: readonly string[];
}

export function projectExactHunkResultSummary(input: {
  readonly hunkCount: number;
  readonly fileResults: readonly {
    readonly status: "written" | "stopped" | "failed" | "not-run";
    readonly hunkCount: number;
  }[];
  readonly failedFiles: readonly { readonly hunkIds?: readonly string[] }[];
  readonly unattemptedFiles: readonly { readonly hunkIds?: readonly string[] }[];
}): ExactHunkResultSummary {
  const changedHunkCount = input.fileResults
    .filter((result) => result.status === "written")
    .reduce((count, result) => count + result.hunkCount, 0);
  const failedHunkCount = input.failedFiles.reduce(
    (count, file) => count + (file.hunkIds?.length ?? 1),
    0,
  );
  const unattemptedHunkCount = input.unattemptedFiles.reduce(
    (count, file) => count + (file.hunkIds?.length ?? 1),
    0,
  );
  return {
    hunkCount: input.hunkCount,
    changedHunkCount,
    failedHunkCount,
    unattemptedHunkCount,
    redactionStatus: "raw-content-excluded",
    evidence: [
      `exact-hunk-result:hunk-count:${input.hunkCount}`,
      `exact-hunk-result:changed-hunk-count:${changedHunkCount}`,
      `exact-hunk-result:failed-hunk-count:${failedHunkCount}`,
      `exact-hunk-result:unattempted-hunk-count:${unattemptedHunkCount}`,
      "exact-hunk-result:raw-content-excluded",
    ],
  };
}
