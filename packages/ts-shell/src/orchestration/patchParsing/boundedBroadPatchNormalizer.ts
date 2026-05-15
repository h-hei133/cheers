import type {
  PatchFileOperation,
  PatchHunk,
  PatchLineChange,
} from "./types.js";
import {
  broadPatchUnsupportedEvidence,
  type BroadPatchUnsupportedReason,
} from "./broadPatchUnsupportedReason.js";
import { extractFencedPatchText } from "./fencedPatchExtractor.js";

export type BoundedBroadPatchNormalizerStatus =
  | "normalized"
  | "unsupported"
  | "malformed";

export type BoundedBroadPatchSourceFormat =
  | "git-unified-diff"
  | "apply-patch-markers"
  | "unknown";

export type BoundedBroadPatchRejectionReason =
  | BroadPatchUnsupportedReason
  | "unsupported-broad-shape"
  | "unsupported-unified-diff"
  | "malformed-broad-patch";

export type BoundedBroadPatchNormalizerResult =
  | {
      readonly status: "normalized";
      readonly sourceFormat: BoundedBroadPatchSourceFormat;
      readonly normalizedRawPatchText: string;
      readonly normalizedOperations: readonly PatchFileOperation[];
      readonly operationCount: number;
      readonly affectedPaths: readonly string[];
      readonly evidence: readonly string[];
    }
  | {
      readonly status: "unsupported" | "malformed";
      readonly sourceFormat: BoundedBroadPatchSourceFormat;
      readonly normalizedOperations: readonly PatchFileOperation[];
      readonly operationCount: number;
      readonly affectedPaths: readonly string[];
      readonly rejectionReason: BoundedBroadPatchRejectionReason;
      readonly evidence: readonly string[];
    };

interface FileSection {
  readonly headerLine: string;
  readonly lines: readonly string[];
}

interface FileMetadata {
  readonly oldPath?: string;
  readonly newPath?: string;
  readonly renameFrom?: string;
  readonly renameTo?: string;
  readonly similarity100: boolean;
  readonly hasNon100Similarity: boolean;
  readonly hasBinary: boolean;
  readonly hasModeChange: boolean;
  readonly hasSymlink: boolean;
  readonly hasSubmodule: boolean;
  readonly hasCopy: boolean;
  readonly hasUnsupportedMetadata: boolean;
  readonly hunkStartIndex?: number;
}

export function normalizeBoundedBroadPatchText(
  rawPatchText: string,
): BoundedBroadPatchNormalizerResult {
  const fencedExtraction = extractFencedPatchText(rawPatchText);
  if (fencedExtraction.status === "unsupported") {
    return rejection(
      "unsupported",
      "unknown",
      "unsupported-broad-shape",
      fencedExtraction.evidence,
    );
  }
  if (fencedExtraction.status === "malformed") {
    return rejection(
      "malformed",
      "unknown",
      "malformed-broad-patch",
      fencedExtraction.evidence,
    );
  }

  const broadPatchText =
    fencedExtraction.status === "extracted"
      ? fencedExtraction.extractedPatch
      : rawPatchText;
  const normalized = normalizeLineEndings(broadPatchText).trim();
  if (normalized.includes("*** Begin Patch")) {
    return {
      status: "unsupported",
      sourceFormat: "apply-patch-markers",
      normalizedOperations: [],
      operationCount: 0,
      affectedPaths: [],
      rejectionReason: "not-broad-patch",
      evidence: [
        ...fencedExtraction.evidence,
        "bounded-broad-patch-normalizer:marker-patch-bypassed",
      ],
    };
  }
  if (!looksLikeGitUnifiedDiff(normalized)) {
    return {
      status: "unsupported",
      sourceFormat: "unknown",
      normalizedOperations: [],
      operationCount: 0,
      affectedPaths: [],
      rejectionReason: "not-broad-patch",
      evidence: [
        ...fencedExtraction.evidence,
        "bounded-broad-patch-normalizer:not-git-unified-diff",
      ],
    };
  }

  const sections = splitGitDiffSections(normalized);
  if (sections.length === 0) {
    return rejection("malformed", "git-unified-diff", "malformed-broad-patch", [
      ...fencedExtraction.evidence,
      "bounded-broad-patch-normalizer:missing-diff-git-section",
    ]);
  }

  const operations: PatchFileOperation[] = [];
  for (const section of sections) {
    const parsed = parseFileSection(section);
    if (parsed.status !== "normalized") {
      return parsed;
    }
    operations.push(...parsed.operations);
  }

  return {
    status: "normalized",
    sourceFormat: "git-unified-diff",
    normalizedRawPatchText: serializeApplyPatchOperations(operations),
    normalizedOperations: operations,
    operationCount: operations.length,
    affectedPaths: affectedPathsFor(operations),
    evidence: [
      ...fencedExtraction.evidence,
      "bounded-broad-patch-normalizer:git-unified-diff-normalized",
      `bounded-broad-patch-normalizer:operation-count:${operations.length}`,
      "bounded-broad-patch-normalizer:no-file-read",
      "bounded-broad-patch-normalizer:no-write-authority",
      "bounded-broad-patch-normalizer:no-fuzzy-apply",
    ],
  };
}

type ParsedFileSection =
  | {
      readonly status: "normalized";
      readonly operations: readonly PatchFileOperation[];
    }
  | Extract<
      BoundedBroadPatchNormalizerResult,
      { status: "unsupported" | "malformed" }
    >;

function parseFileSection(section: FileSection): ParsedFileSection {
  const metadata = parseFileMetadata(section);
  if (metadata.hasBinary) {
    return rejection(
      "unsupported",
      "git-unified-diff",
      "unsupported-binary-patch",
      ["bounded-broad-patch-normalizer:binary-patch-blocked"],
    );
  }
  if (metadata.hasModeChange) {
    return rejection(
      "unsupported",
      "git-unified-diff",
      "unsupported-mode-change",
      ["bounded-broad-patch-normalizer:mode-change-blocked"],
    );
  }
  if (metadata.hasSymlink) {
    return rejection(
      "unsupported",
      "git-unified-diff",
      "unsupported-symlink-patch",
      ["bounded-broad-patch-normalizer:symlink-patch-blocked"],
    );
  }
  if (metadata.hasSubmodule) {
    return rejection(
      "unsupported",
      "git-unified-diff",
      "unsupported-submodule-patch",
      ["bounded-broad-patch-normalizer:submodule-patch-blocked"],
    );
  }
  if (metadata.hasCopy) {
    return rejection(
      "unsupported",
      "git-unified-diff",
      "unsupported-copy-patch",
      ["bounded-broad-patch-normalizer:copy-patch-blocked"],
    );
  }
  if (metadata.hasUnsupportedMetadata) {
    return rejection(
      "unsupported",
      "git-unified-diff",
      "unsupported-broad-shape",
      ["bounded-broad-patch-normalizer:unsupported-git-metadata"],
    );
  }

  const oldPath = metadata.oldPath;
  const newPath = metadata.newPath;
  const hunkLines =
    metadata.hunkStartIndex === undefined
      ? []
      : section.lines.slice(metadata.hunkStartIndex);
  const hasHunks = hunkLines.length > 0;

  if (metadata.renameFrom || metadata.renameTo) {
    if (!metadata.renameFrom || !metadata.renameTo) {
      return rejection(
        "unsupported",
        "git-unified-diff",
        "unsupported-broad-shape",
        ["bounded-broad-patch-normalizer:rename-metadata-incomplete"],
      );
    }
    if (!metadata.similarity100 || metadata.hasNon100Similarity) {
      return rejection(
        "unsupported",
        "git-unified-diff",
        "unsupported-broad-shape",
        ["bounded-broad-patch-normalizer:rename-similarity-not-exact"],
      );
    }
    if (hasHunks) {
      const hunks = parseUnifiedHunks(hunkLines);
      if (hunks.ok === false) {
        return hunks.result;
      }
      return {
        status: "normalized",
        operations: [
          {
            kind: "move",
            path: metadata.renameFrom,
            moveTo: metadata.renameTo,
            hunks: [],
          },
          {
            kind: "update",
            path: metadata.renameTo,
            hunks: hunks.hunks,
          },
        ],
      };
    }
    return {
      status: "normalized",
      operations: [
        {
          kind: "move",
          path: metadata.renameFrom,
          moveTo: metadata.renameTo,
          hunks: [],
        },
      ],
    };
  }

  if (!oldPath || !newPath) {
    return rejection("malformed", "git-unified-diff", "malformed-broad-patch", [
      "bounded-broad-patch-normalizer:missing-file-markers",
    ]);
  }

  if (oldPath === "/dev/null" && newPath !== "/dev/null") {
    const content = parseAddedFileContent(hunkLines);
    if (content.ok === false) {
      return content.result;
    }
    return {
      status: "normalized",
    operations: [{ kind: "add", path: newPath, content: content.content }],
    };
  }

  if (newPath === "/dev/null" && oldPath !== "/dev/null") {
    const deletion = validateDeleteHunks(hunkLines);
    if (deletion.ok === false) {
      return deletion.result;
    }
    return {
      status: "normalized",
    operations: [{ kind: "delete", path: oldPath }],
    };
  }

  if (oldPath !== newPath) {
    return rejection(
      "unsupported",
      "git-unified-diff",
      "unsupported-rename-content-edit",
      ["bounded-broad-patch-normalizer:path-changing-update-blocked"],
    );
  }

  const hunks = parseUnifiedHunks(hunkLines);
  if (hunks.ok === false) {
    return hunks.result;
  }
  return {
    status: "normalized",
    operations: [{ kind: "update", path: oldPath, hunks: hunks.hunks }],
  };
}

function parseFileMetadata(section: FileSection): FileMetadata {
  let oldPath: string | undefined;
  let newPath: string | undefined;
  let renameFrom: string | undefined;
  let renameTo: string | undefined;
  let similarity100 = false;
  let hasNon100Similarity = false;
  let hasBinary = false;
  let hasModeChange = false;
  let hasSymlink = false;
  let hasSubmodule = false;
  let hasCopy = false;
  let hasUnsupportedMetadata = false;
  let hunkStartIndex: number | undefined;

  for (let index = 1; index < section.lines.length; index += 1) {
    const line = section.lines[index] ?? "";
    if (line.startsWith("@@")) {
      hunkStartIndex = index;
      break;
    }
    if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) {
      hasBinary = true;
      continue;
    }
    if (
      line.startsWith("old mode ") ||
      line.startsWith("new mode ")
    ) {
      hasModeChange = true;
      continue;
    }
    if (
      line.startsWith("new file mode ") ||
      line.startsWith("deleted file mode ")
    ) {
      const mode = line.split(/\s+/).at(-1) ?? "";
      if (mode === "120000") {
        hasSymlink = true;
      } else if (mode === "160000") {
        hasSubmodule = true;
      } else if (mode !== "100644" && mode !== "100755") {
        hasModeChange = true;
      }
      continue;
    }
    if (line.startsWith("deleted mode ")) {
      hasModeChange = true;
      continue;
    }
    if (line === "similarity index 100%") {
      similarity100 = true;
      continue;
    }
    if (line.startsWith("similarity index ")) {
      hasNon100Similarity = true;
      continue;
    }
    if (line.startsWith("copy from ") || line.startsWith("copy to ")) {
      hasCopy = true;
      hasUnsupportedMetadata = true;
      continue;
    }
    if (line.startsWith("rename from ")) {
      renameFrom = stripGitPathPrefix(line.slice("rename from ".length).trim());
      continue;
    }
    if (line.startsWith("rename to ")) {
      renameTo = stripGitPathPrefix(line.slice("rename to ".length).trim());
      continue;
    }
    if (line.startsWith("--- ")) {
      oldPath = parseFileMarkerPath(line.slice("--- ".length).trim());
      continue;
    }
    if (line.startsWith("+++ ")) {
      newPath = parseFileMarkerPath(line.slice("+++ ".length).trim());
      continue;
    }
    if (line.startsWith("index ")) {
      continue;
    }
    if (line.trim() !== "") {
      hasUnsupportedMetadata = true;
    }
  }

  return {
    ...(oldPath !== undefined ? { oldPath } : {}),
    ...(newPath !== undefined ? { newPath } : {}),
    ...(renameFrom !== undefined ? { renameFrom } : {}),
    ...(renameTo !== undefined ? { renameTo } : {}),
    similarity100,
    hasNon100Similarity,
    hasBinary,
    hasModeChange,
    hasSymlink,
    hasSubmodule,
    hasCopy,
    hasUnsupportedMetadata,
    ...(hunkStartIndex !== undefined ? { hunkStartIndex } : {}),
  };
}

function parseUnifiedHunks(
  lines: readonly string[],
):
  | { readonly ok: true; readonly hunks: readonly PatchHunk[] }
  | { readonly ok: false; readonly result: ParsedFileSection } {
  if (lines.length === 0) {
    return {
      ok: false,
      result: rejection(
        "unsupported",
        "git-unified-diff",
        "unsupported-unified-diff",
        ["bounded-broad-patch-normalizer:update-hunks-required"],
      ),
    };
  }

  const hunks: PatchHunk[] = [];
  let index = 0;
  while (index < lines.length) {
    const header = lines[index] ?? "";
    if (!header.startsWith("@@")) {
      return {
        ok: false,
        result: rejection(
          "malformed",
          "git-unified-diff",
          "malformed-broad-patch",
          ["bounded-broad-patch-normalizer:expected-hunk-header"],
        ),
      };
    }
    if (!isSupportedGitHunkHeader(header)) {
      return {
        ok: false,
        result: rejection(
          "unsupported",
          "git-unified-diff",
          "unsupported-ambiguous-hunk",
          ["bounded-broad-patch-normalizer:ambiguous-hunk-header-blocked"],
        ),
      };
    }
    const hunkLines: PatchLineChange[] = [];
    index += 1;
    while (index < lines.length && !(lines[index] ?? "").startsWith("@@")) {
      const line = lines[index] ?? "";
      if (line.startsWith("\\ No newline")) {
        return {
          ok: false,
          result: rejection(
            "unsupported",
            "git-unified-diff",
            "unsupported-unified-diff",
            ["bounded-broad-patch-normalizer:no-newline-marker-blocked"],
          ),
        };
      }
      if (line.startsWith(" ")) {
        hunkLines.push({ kind: "context", text: line.slice(1) });
      } else if (line.startsWith("-")) {
        hunkLines.push({ kind: "remove", text: line.slice(1) });
      } else if (line.startsWith("+")) {
        hunkLines.push({ kind: "add", text: line.slice(1) });
      } else {
        return {
          ok: false,
          result: rejection(
            "malformed",
            "git-unified-diff",
            "malformed-broad-patch",
            ["bounded-broad-patch-normalizer:unsupported-hunk-line"],
          ),
        };
      }
      index += 1;
    }
    if (hunkLines.length === 0) {
      return {
        ok: false,
        result: rejection(
          "malformed",
          "git-unified-diff",
          "malformed-broad-patch",
          ["bounded-broad-patch-normalizer:empty-hunk"],
        ),
      };
    }
    hunks.push({
      changeContext: header.slice(2).trim() || undefined,
      lines: hunkLines,
    });
  }

  return { ok: true, hunks };
}

function isSupportedGitHunkHeader(header: string): boolean {
  return /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/.test(header);
}

function parseAddedFileContent(
  hunkLines: readonly string[],
):
  | { readonly ok: true; readonly content: string }
  | { readonly ok: false; readonly result: ParsedFileSection } {
  const hunks = parseUnifiedHunks(hunkLines);
  if (hunks.ok === false) {
    return { ok: false, result: hunks.result };
  }
  const content: string[] = [];
  for (const hunk of hunks.hunks) {
    for (const line of hunk.lines) {
      if (line.kind !== "add") {
        return {
          ok: false,
          result: rejection(
            "unsupported",
            "git-unified-diff",
            "unsupported-unified-diff",
            ["bounded-broad-patch-normalizer:add-hunk-not-add-only"],
          ),
        };
      }
      content.push(line.text);
    }
  }
  return { ok: true, content: content.join("\n") };
}

function validateDeleteHunks(
  hunkLines: readonly string[],
):
  | { readonly ok: true }
  | { readonly ok: false; readonly result: ParsedFileSection } {
  const hunks = parseUnifiedHunks(hunkLines);
  if (hunks.ok === false) {
    return { ok: false, result: hunks.result };
  }
  for (const hunk of hunks.hunks) {
    for (const line of hunk.lines) {
      if (line.kind !== "remove") {
        return {
          ok: false,
          result: rejection(
            "unsupported",
            "git-unified-diff",
            "unsupported-unified-diff",
            ["bounded-broad-patch-normalizer:delete-hunk-not-remove-only"],
          ),
        };
      }
    }
  }
  return { ok: true };
}

function splitGitDiffSections(rawPatchText: string): readonly FileSection[] {
  const lines = rawPatchText.split("\n");
  const sections: FileSection[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (current.length > 0) {
        sections.push({ headerLine: current[0] ?? "", lines: current });
      }
      current = [line];
      continue;
    }
    if (current.length > 0) {
      current.push(line);
    }
  }
  if (current.length > 0) {
    sections.push({ headerLine: current[0] ?? "", lines: current });
  }
  return sections;
}

function serializeApplyPatchOperations(
  operations: readonly PatchFileOperation[],
): string {
  return [
    "*** Begin Patch",
    ...operations.flatMap(serializeApplyPatchOperation),
    "*** End Patch",
  ].join("\n");
}

function serializeApplyPatchOperation(
  operation: PatchFileOperation,
): readonly string[] {
  switch (operation.kind) {
    case "add":
      return [
        `*** Add File: ${operation.path}`,
        ...operation.content.split("\n").map((line) => `+${line}`),
      ];
    case "delete":
      return [`*** Delete File: ${operation.path}`];
    case "update":
      return [
        `*** Update File: ${operation.path}`,
        ...operation.hunks.flatMap(serializeHunk),
      ];
    case "move":
      return [
        `*** Update File: ${operation.path}`,
        `*** Move to: ${operation.moveTo}`,
        ...operation.hunks.flatMap(serializeHunk),
      ];
  }
}

function serializeHunk(hunk: PatchHunk): readonly string[] {
  return [
    `@@${hunk.changeContext ? ` ${hunk.changeContext}` : ""}`,
    ...hunk.lines.map((line) => {
      if (line.kind === "context") {
        return ` ${line.text}`;
      }
      if (line.kind === "add") {
        return `+${line.text}`;
      }
      return `-${line.text}`;
    }),
  ];
}

function parseFileMarkerPath(markerPath: string): string {
  if (markerPath === "/dev/null") {
    return markerPath;
  }
  return stripGitPathPrefix(markerPath.split("\t")[0]?.trim() ?? markerPath);
}

function stripGitPathPrefix(filePath: string): string {
  if (filePath.startsWith("a/") || filePath.startsWith("b/")) {
    return filePath.slice(2);
  }
  return filePath;
}

function affectedPathsFor(
  operations: readonly PatchFileOperation[],
): readonly string[] {
  const paths: string[] = [];
  for (const operation of operations) {
    paths.push(operation.path);
    if (operation.kind === "move") {
      paths.push(operation.moveTo);
    }
  }
  return unique(paths);
}

function unique(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    output.push(value);
  }
  return output;
}

function rejection(
  status: "unsupported" | "malformed",
  sourceFormat: BoundedBroadPatchSourceFormat,
  rejectionReason: BoundedBroadPatchRejectionReason,
  evidence: readonly string[],
): Extract<
  BoundedBroadPatchNormalizerResult,
  { status: "unsupported" | "malformed" }
> {
  return {
    status,
    sourceFormat,
    normalizedOperations: [],
    operationCount: 0,
    affectedPaths: [],
    rejectionReason,
    evidence: [
      ...evidence,
      ...(isSharedBroadReason(rejectionReason)
        ? [broadPatchUnsupportedEvidence(rejectionReason)]
        : []),
      "bounded-broad-patch-normalizer:no-file-read",
      "bounded-broad-patch-normalizer:no-write-authority",
      "bounded-broad-patch-normalizer:no-recovery-execution",
    ],
  };
}

function isSharedBroadReason(
  reason: BoundedBroadPatchRejectionReason,
): reason is BroadPatchUnsupportedReason {
  return (
    reason !== "unsupported-broad-shape" &&
    reason !== "unsupported-unified-diff" &&
    reason !== "malformed-broad-patch"
  );
}

function normalizeLineEndings(rawPatchText: string): string {
  return rawPatchText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function looksLikeGitUnifiedDiff(rawPatchText: string): boolean {
  return rawPatchText.includes("diff --git ");
}
