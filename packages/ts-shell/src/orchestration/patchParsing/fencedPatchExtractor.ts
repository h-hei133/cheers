export type FencedPatchExtractionStatus =
  | "extracted"
  | "not-needed"
  | "unsupported"
  | "malformed";

export type FencedPatchSourceKind =
  | "fenced-git-diff"
  | "fenced-unified-diff"
  | "raw-patch"
  | "unknown";

export type FencedPatchRejectionReason =
  | "multiple-patch-candidates"
  | "multiple-fenced-blocks"
  | "non-patch-fence"
  | "incomplete-fence"
  | "ambiguous-nested-fence";

export type FencedPatchExtractionResult =
  | {
      readonly status: "extracted";
      readonly extractedPatch: string;
      readonly sourceKind: FencedPatchSourceKind;
      readonly evidence: readonly string[];
    }
  | {
      readonly status: "not-needed";
      readonly sourceKind: FencedPatchSourceKind;
      readonly evidence: readonly string[];
    }
  | {
      readonly status: "unsupported" | "malformed";
      readonly sourceKind: FencedPatchSourceKind;
      readonly rejectionReason: FencedPatchRejectionReason;
      readonly evidence: readonly string[];
    };

interface FenceBlock {
  readonly language: string;
  readonly content: string;
  readonly before: string;
  readonly after: string;
}

export function extractFencedPatchText(
  rawPatchText: string,
): FencedPatchExtractionResult {
  const normalized = normalizeLineEndings(rawPatchText);
  const trimmed = normalized.trim();
  const hasFence = containsFenceDelimiter(normalized);

  if (
    !hasFence &&
    (looksLikeRawPatch(trimmed) ||
      looksLikeGitDiff(trimmed) ||
      looksLikeUnifiedDiff(trimmed))
  ) {
    return {
      status: "not-needed",
      sourceKind: "raw-patch",
      evidence: ["fenced-patch-extractor:raw-patch-not-needed"],
    };
  }

  const fences = parseFenceBlocks(normalized);
  if (fences.status === "malformed") {
    return {
      status: "malformed",
      sourceKind: "unknown",
      rejectionReason: fences.rejectionReason,
      evidence: [
        "fenced-patch-extractor:malformed-fence-blocked",
        "fenced-patch-extractor:no-file-read",
        "fenced-patch-extractor:no-write-authority",
      ],
    };
  }

  if (fences.blocks.length === 0) {
    return {
      status: "not-needed",
      sourceKind: "unknown",
      evidence: ["fenced-patch-extractor:no-fence-not-needed"],
    };
  }

  if (fences.blocks.length > 1) {
    return unsupported("multiple-fenced-blocks", "unknown", [
      "fenced-patch-extractor:multiple-fenced-blocks-blocked",
    ]);
  }

  const block = fences.blocks[0]!;
  const content = block.content.trim();
  if (containsFenceDelimiter(content)) {
    return {
      status: "malformed",
      sourceKind: "unknown",
      rejectionReason: "ambiguous-nested-fence",
      evidence: [
        "fenced-patch-extractor:nested-fence-blocked",
        "fenced-patch-extractor:no-file-read",
        "fenced-patch-extractor:no-write-authority",
      ],
    };
  }

  const sourceKind = sourceKindFor(content);
  if (!isSupportedFenceLanguage(block.language, sourceKind)) {
    return unsupported("non-patch-fence", sourceKind, [
      "fenced-patch-extractor:non-patch-fence-blocked",
    ]);
  }

  if (sourceKind === "unknown") {
    return unsupported("non-patch-fence", sourceKind, [
      "fenced-patch-extractor:fenced-content-not-patch",
    ]);
  }

  if (
    looksLikePatchCandidate(block.before) ||
    looksLikePatchCandidate(block.after)
  ) {
    return unsupported("multiple-patch-candidates", sourceKind, [
      "fenced-patch-extractor:prose-extra-patch-candidate-blocked",
    ]);
  }

  return {
    status: "extracted",
    sourceKind,
    extractedPatch: content,
    evidence: [
      `fenced-patch-extractor:source:${sourceKind}`,
      "fenced-patch-extractor:single-fenced-patch-extracted",
      "fenced-patch-extractor:no-file-read",
      "fenced-patch-extractor:no-write-authority",
      "fenced-patch-extractor:no-recovery-execution",
    ],
  };
}

function unsupported(
  rejectionReason: FencedPatchRejectionReason,
  sourceKind: FencedPatchSourceKind,
  evidence: readonly string[],
): {
  readonly status: "unsupported";
  readonly sourceKind: FencedPatchSourceKind;
  readonly rejectionReason: FencedPatchRejectionReason;
  readonly evidence: readonly string[];
} {
  return {
    status: "unsupported",
    sourceKind,
    rejectionReason,
    evidence: [
      ...evidence,
      "fenced-patch-extractor:no-file-read",
      "fenced-patch-extractor:no-write-authority",
      "fenced-patch-extractor:no-recovery-execution",
    ],
  };
}

function parseFenceBlocks(
  rawText: string,
):
  | { readonly status: "ok"; readonly blocks: readonly FenceBlock[] }
  | {
      readonly status: "malformed";
      readonly rejectionReason: Extract<
        FencedPatchRejectionReason,
        "incomplete-fence"
      >;
    } {
  const lines = rawText.split("\n");
  const blocks: FenceBlock[] = [];
  let before = "";
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const opening = line.match(/^```([A-Za-z0-9_-]*)\s*$/);
    if (!opening) {
      index += 1;
      continue;
    }

    before = lines.slice(0, index).join("\n");
    const language = opening[1]?.toLowerCase() ?? "";
    const contentStart = index + 1;
    let contentEnd = -1;
    for (let next = contentStart; next < lines.length; next += 1) {
      if ((lines[next] ?? "").trim() === "```") {
        contentEnd = next;
        break;
      }
    }
    if (contentEnd === -1) {
      return {
        status: "malformed",
        rejectionReason: "incomplete-fence",
      };
    }

    const content = lines.slice(contentStart, contentEnd).join("\n");
    const after = lines.slice(contentEnd + 1).join("\n");
    blocks.push({ language, content, before, after });
    index = contentEnd + 1;
  }

  return { status: "ok", blocks };
}

function isSupportedFenceLanguage(
  language: string,
  sourceKind: FencedPatchSourceKind,
): boolean {
  if (language === "diff" || language === "patch") {
    return sourceKind !== "unknown";
  }
  if (language === "" || language === "text") {
    return sourceKind === "fenced-git-diff" || sourceKind === "fenced-unified-diff";
  }
  return false;
}

function sourceKindFor(content: string): FencedPatchSourceKind {
  if (startsWithGitDiff(content)) {
    return "fenced-git-diff";
  }
  if (startsWithUnifiedDiff(content)) {
    return "fenced-unified-diff";
  }
  if (looksLikeRawPatch(content)) {
    return "raw-patch";
  }
  return "unknown";
}

function looksLikePatchCandidate(text: string): boolean {
  const trimmed = text.trim();
  return (
    looksLikeRawPatch(trimmed) ||
    looksLikeGitDiff(trimmed) ||
    looksLikeUnifiedDiff(trimmed)
  );
}

function looksLikeRawPatch(text: string): boolean {
  return text.includes("*** Begin Patch") && text.includes("*** End Patch");
}

function looksLikeGitDiff(text: string): boolean {
  return text.startsWith("diff --git ") || text.includes("\ndiff --git ");
}

function looksLikeUnifiedDiff(text: string): boolean {
  return (
    text.startsWith("--- ") ||
    text.includes("\n--- ") ||
    text.startsWith("+++ ") ||
    text.includes("\n+++ ")
  );
}

function startsWithGitDiff(text: string): boolean {
  return text.trimStart().startsWith("diff --git ");
}

function startsWithUnifiedDiff(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith("--- ") || trimmed.startsWith("+++ ");
}

function containsFenceDelimiter(text: string): boolean {
  return text.split("\n").some((line) => line.trim().startsWith("```"));
}

function normalizeLineEndings(rawText: string): string {
  return rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
