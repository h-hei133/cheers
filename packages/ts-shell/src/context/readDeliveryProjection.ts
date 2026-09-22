import {
  attemptSelectiveReanchorByFingerprint,
  compressLineIndexesToRanges,
  computeFragmentFingerprint,
  computeFragmentFingerprintFromIndexes,
  expandReadFragmentRangesToIndexes,
  extractContinuationReadLineCount,
  extractRequestedLineCount,
  hasImplicitReadContinuationCue,
  hasLocalSliceExplainCue,
  hasReadTailCue,
  lineMatchesReadFilter,
  normalizeReadFragmentLineIndexes,
  resolveFragmentIndexesFromContinuityInput,
  summarizeLineIndexSet,
} from "./readWindowContinuation.js";
import {
  buildExplainTaskDelivery,
  buildPurposeIoExplainDelivery,
} from "./repoExplainStage.js";
import type { GroundedDeliverableMode } from "../result/projection/runtimeHandoffProjection.js";
import type {
  GroundedDeliverableConstraints,
  GroundedRepairInstruction,
  GroundedRepairStage,
} from "../planning/task/workflowTaskPlanner.js";

export function buildReadTaskDelivery(input: {
  prompt: string;
  targetPath: string;
  content: string;
  preferredMode?: GroundedDeliverableMode;
  requestedLines?: number;
  lineOffset?: number;
  readFragmentLineIndexes?: readonly number[];
  readFragmentRanges?: readonly string[];
  readFragmentSourceWindowStart?: number;
  readFragmentSourceWindowEnd?: number;
  readFragmentFingerprint?: string;
  readFilter?: "none" | "function-definitions";
  repairInstruction?: GroundedRepairInstruction;
}): { completed: boolean; output: string; evidenceMarkers: string[] } {
  const trimmed = input.content.trim();
  if (trimmed.length === 0) {
    return {
      completed: false,
      output: `Task not completed: ${input.targetPath} was read but is empty, so no summary/content could be delivered.`,
      evidenceMarkers: [
        `deliverable-mode:${input.preferredMode ?? "read"}`,
        "read-delivered-lines:0",
      ],
    };
  }
  const localExplainRequest =
    hasLocalSliceExplainCue(input.prompt) &&
    /(?:\bexplain\b|\u89e3\u91ca|\u5728\u505a\u4ec0\u4e48)/i.test(input.prompt);
  if (localExplainRequest) {
    const sourceLines = input.content.split(/\r?\n/);
    while (
      sourceLines.length > 0 &&
      sourceLines[sourceLines.length - 1]?.length === 0
    ) {
      sourceLines.pop();
    }
    let fragmentIndexes = normalizeReadFragmentLineIndexes(
      input.readFragmentLineIndexes,
      sourceLines.length,
    );
    if (
      fragmentIndexes.length === 0 &&
      (input.readFragmentRanges?.length ?? 0) > 0
    ) {
      fragmentIndexes = normalizeReadFragmentLineIndexes(
        expandReadFragmentRangesToIndexes(
          input.readFragmentRanges,
          sourceLines.length,
        ),
        sourceLines.length,
      );
    }
    if (
      fragmentIndexes.length === 0 &&
      input.readFilter === "function-definitions" &&
      input.readFragmentSourceWindowStart !== undefined &&
      input.readFragmentSourceWindowEnd !== undefined
    ) {
      const boundedStart = Math.max(0, input.readFragmentSourceWindowStart);
      const boundedEnd = Math.min(
        sourceLines.length,
        Math.max(boundedStart, input.readFragmentSourceWindowEnd),
      );
      for (let index = boundedStart; index < boundedEnd; index += 1) {
        if (
          lineMatchesReadFilter(
            sourceLines[index] ?? "",
            "function-definitions",
          )
        ) {
          fragmentIndexes.push(index);
        }
      }
      fragmentIndexes = normalizeReadFragmentLineIndexes(
        fragmentIndexes,
        sourceLines.length,
      );
    }
    if (input.readFilter && fragmentIndexes.length === 0) {
      return {
        completed: false,
        output: `Task not completed: no delivered filtered fragment is available to explain for ${input.targetPath}.`,
        evidenceMarkers: [
          "deliverable-mode:explain",
          ...(input.readFragmentSourceWindowStart !== undefined
            ? [
                `read-fragment-source-window-start:${input.readFragmentSourceWindowStart}`,
              ]
            : []),
          ...(input.readFragmentSourceWindowEnd !== undefined
            ? [
                `read-fragment-source-window-end:${input.readFragmentSourceWindowEnd}`,
              ]
            : []),
          ...(input.readFilter
            ? [`repair-read-filter:${input.readFilter}`]
            : []),
          "local-explain:missing-delivered-fragment",
        ],
      };
    }
    if (fragmentIndexes.length > 0) {
      let resolvedFragmentIndexes = fragmentIndexes;
      let resolvedSourceWindowStart = input.readFragmentSourceWindowStart;
      let resolvedSourceWindowEnd = input.readFragmentSourceWindowEnd;
      let reanchorMarker: string | undefined;
      let resolvedFragment = computeFragmentFingerprintFromIndexes(
        sourceLines,
        resolvedFragmentIndexes,
      );
      if (!resolvedFragment) {
        return {
          completed: false,
          output: `Task not completed: delivered fragment indexes are out of bounds for ${input.targetPath}.`,
          evidenceMarkers: [
            "deliverable-mode:explain",
            "local-explain:invalid-fragment-indexes",
          ],
        };
      }
      let scopedText = resolvedFragment.text;
      let currentFingerprint = resolvedFragment.fingerprint;
      let reanchorConfidence: "high" | "medium" | undefined;
      let reanchorReason: string | undefined;
      if (
        input.readFragmentFingerprint &&
        input.readFragmentFingerprint !== currentFingerprint
      ) {
        const reanchor = attemptSelectiveReanchorByFingerprint({
          sourceLines,
          expectedFingerprint: input.readFragmentFingerprint,
          readFilter: input.readFilter,
          sourceWindowStart: input.readFragmentSourceWindowStart,
          sourceWindowEnd: input.readFragmentSourceWindowEnd,
          previousFragmentIndexes: resolvedFragmentIndexes,
        });
        if (reanchor.status !== "matched") {
          return {
            completed: false,
            output:
              reanchor.status === "ambiguous"
                ? `Task not completed: previously delivered fragment mapping is ambiguous for ${input.targetPath} after file drift. Re-run read before local explain.`
                : `Task not completed: previously delivered fragment is stale for ${input.targetPath} (file changed since last read). Re-run read before local explain.`,
            evidenceMarkers: [
              "deliverable-mode:explain",
              reanchor.status === "ambiguous"
                ? "local-explain:fragment-reanchor-ambiguous"
                : "local-explain:stale-fragment-invalidated",
              ...(input.readFilter
                ? [`repair-read-filter:${input.readFilter}`]
                : []),
            ],
          };
        }
        resolvedFragmentIndexes = reanchor.indexes;
        resolvedSourceWindowStart = reanchor.sourceWindowStart;
        resolvedSourceWindowEnd = reanchor.sourceWindowEnd;
        reanchorConfidence = reanchor.confidence;
        reanchorReason = reanchor.reason;
        reanchorMarker = "local-explain:fragment-reanchored-after-drift";
        const reanchoredFragment = computeFragmentFingerprintFromIndexes(
          sourceLines,
          resolvedFragmentIndexes,
        );
        if (!reanchoredFragment) {
          return {
            completed: false,
            output: `Task not completed: re-anchored fragment is unavailable for ${input.targetPath}. Re-run read before local explain.`,
            evidenceMarkers: [
              "deliverable-mode:explain",
              "local-explain:reanchored-fragment-missing",
              ...(input.readFilter
                ? [`repair-read-filter:${input.readFilter}`]
                : []),
            ],
          };
        }
        scopedText = reanchoredFragment.text;
        currentFingerprint = reanchoredFragment.fingerprint;
      }
      const label = summarizeLineIndexSet(resolvedFragmentIndexes);
      const explanation = buildExplainTaskDelivery(
        `${input.targetPath} (${label})`,
        scopedText,
      );
      const resolvedRanges = compressLineIndexesToRanges(
        resolvedFragmentIndexes,
      );
      const resolvedRangeCount =
        resolvedRanges.length > 0
          ? resolvedRanges.split(";").filter((entry) => entry.length > 0).length
          : 0;
      const includeExplicitIndexes = resolvedFragmentIndexes.length <= 128;
      return {
        completed: true,
        output: explanation,
        evidenceMarkers: [
          "deliverable-mode:explain",
          ...(includeExplicitIndexes
            ? [
                `read-fragment-line-indexes:${resolvedFragmentIndexes.join(",")}`,
              ]
            : []),
          `read-fragment-ranges:${resolvedRanges}`,
          `read-fragment-line-index-count:${resolvedFragmentIndexes.length}`,
          ...(resolvedRangeCount > 0
            ? [`read-fragment-range-count:${resolvedRangeCount}`]
            : []),
          `read-fragment-fingerprint:${currentFingerprint}`,
          ...(resolvedSourceWindowStart !== undefined
            ? [`read-fragment-source-window-start:${resolvedSourceWindowStart}`]
            : []),
          ...(resolvedSourceWindowEnd !== undefined
            ? [`read-fragment-source-window-end:${resolvedSourceWindowEnd}`]
            : []),
          ...(input.readFilter
            ? [`repair-read-filter:${input.readFilter}`]
            : []),
          ...(reanchorConfidence
            ? [`read-fragment-reanchor-confidence:${reanchorConfidence}`]
            : []),
          ...(reanchorReason
            ? [`read-fragment-reanchor-reason:${reanchorReason}`]
            : []),
          ...(reanchorMarker ? [reanchorMarker] : []),
          "local-explain:anchored-delivered-fragment",
        ],
      };
    }
    const start = Math.max(0, input.lineOffset ?? 0);
    const count =
      input.requestedLines ?? extractRequestedLineCount(input.prompt) ?? 4;
    const selected = sourceLines.slice(start, start + count);
    if (selected.length === 0) {
      return {
        completed: false,
        output: `Task not completed: local explain slice is out of bounds for ${input.targetPath}.`,
        evidenceMarkers: [
          "deliverable-mode:explain",
          `read-delivered-lines:${start}`,
        ],
      };
    }
    const end = start + selected.length;
    const scopedText = selected.join("\n");
    const scopedIndexes = Array.from(
      { length: selected.length },
      (_, index) => start + index,
    );
    const scopedRanges = compressLineIndexesToRanges(scopedIndexes);
    const scopedFingerprint = computeFragmentFingerprint(scopedText);
    const explanation = buildExplainTaskDelivery(
      `${input.targetPath} (${start + 1}-${end})`,
      scopedText,
    );
    return {
      completed: true,
      output: explanation,
      evidenceMarkers: [
        "deliverable-mode:explain",
        `read-delivered-lines:${end}`,
        `read-window-start:${start}`,
        `read-window-end:${end}`,
        `read-window-size:${Math.max(0, end - start)}`,
        `read-fragment-start:${start}`,
        `read-fragment-end:${end}`,
        `read-fragment-source-window-start:${start}`,
        `read-fragment-source-window-end:${end}`,
        `read-fragment-ranges:${scopedRanges}`,
        `read-fragment-fingerprint:${scopedFingerprint}`,
        "local-explain:anchored-read-slice",
      ],
    };
  }

  const requestedLines =
    input.requestedLines ?? extractRequestedLineCount(input.prompt);
  let effectiveLineOffset = Math.max(0, input.lineOffset ?? 0);
  const reanchorObservabilityMarkers: string[] = [];
  const continuationReadIntent =
    hasImplicitReadContinuationCue(input.prompt) ||
    extractContinuationReadLineCount(input.prompt) !== undefined;
  if (continuationReadIntent && input.readFragmentFingerprint) {
    const sourceLines = input.content.split(/\r?\n/);
    while (
      sourceLines.length > 0 &&
      sourceLines[sourceLines.length - 1]?.length === 0
    ) {
      sourceLines.pop();
    }
    const previousFragmentIndexes = resolveFragmentIndexesFromContinuityInput(
      sourceLines,
      input.readFragmentLineIndexes,
      input.readFragmentRanges,
      input.readFragmentSourceWindowStart,
      input.readFragmentSourceWindowEnd,
      input.readFilter,
    );
    if (previousFragmentIndexes.length > 0) {
      const previousFragment = computeFragmentFingerprintFromIndexes(
        sourceLines,
        previousFragmentIndexes,
      );
      const currentFingerprint = previousFragment?.fingerprint;
      if (currentFingerprint !== input.readFragmentFingerprint) {
        const reanchor = attemptSelectiveReanchorByFingerprint({
          sourceLines,
          expectedFingerprint: input.readFragmentFingerprint,
          readFilter: input.readFilter,
          sourceWindowStart: input.readFragmentSourceWindowStart,
          sourceWindowEnd: input.readFragmentSourceWindowEnd,
          previousFragmentIndexes,
        });
        if (reanchor.status === "matched") {
          effectiveLineOffset = Math.max(
            effectiveLineOffset,
            reanchor.sourceWindowEnd,
          );
          reanchorObservabilityMarkers.push(
            "read-continuation:fragment-reanchored-after-drift",
            `read-fragment-reanchor-confidence:${reanchor.confidence}`,
            `read-fragment-reanchor-reason:${reanchor.reason}`,
            `read-fragment-source-window-start:${reanchor.sourceWindowStart}`,
            `read-fragment-source-window-end:${reanchor.sourceWindowEnd}`,
          );
        } else {
          return {
            completed: false,
            output:
              reanchor.status === "ambiguous"
                ? `Task not completed: continuation fragment mapping is ambiguous for ${input.targetPath} after file drift. Re-run read to refresh continuity before continuing.`
                : `Task not completed: continuation fragment is stale for ${input.targetPath} (file changed since previous filtered read). Re-run read to refresh continuity.`,
            evidenceMarkers: [
              "deliverable-mode:read",
              reanchor.status === "ambiguous"
                ? "read-continuation:fragment-reanchor-ambiguous"
                : "read-continuation:stale-fragment-invalidated",
              ...(input.readFilter
                ? [`repair-read-filter:${input.readFilter}`]
                : []),
            ],
          };
        }
      }
    }
  }
  const forceLocalExplain =
    hasLocalSliceExplainCue(input.prompt) &&
    /(?:\bexplain\b|\u89e3\u91ca|\u5728\u505a\u4ec0\u4e48)/i.test(input.prompt);
  const scopedExplainLineCount =
    requestedLines ?? (forceLocalExplain ? 4 : undefined);
  const scopedExplainLineOffset = effectiveLineOffset;
  const summarizeIntent =
    /(?:summari[sz]e|summary|\u603b\u7ed3|\u6458\u8981|\u6982\u8ff0)/i.test(
      input.prompt,
    );
  const explainIntent =
    /(?:\u89e3\u91ca|explain|\u5728\u505a\u4ec0\u4e48|what .* does)/i.test(
      input.prompt,
    );
  const constraints = input.repairInstruction?.constraints;
  const effectiveMode: GroundedDeliverableMode = forceLocalExplain
    ? "explain"
    : (input.repairInstruction?.targetMode ??
      input.preferredMode ??
      (requestedLines
        ? "read"
        : summarizeIntent
          ? "summary"
          : explainIntent
            ? "explain"
            : "read"));

  const stagedSteps = input.repairInstruction?.stagedSteps;
  if (stagedSteps && stagedSteps.length > 0) {
    const resumeCursor = Math.min(
      Math.max(1, input.repairInstruction?.stagedResumeCursor ?? 1),
      stagedSteps.length,
    );
    const startIndex = resumeCursor - 1;
    let readCursor = effectiveLineOffset;
    const stageOutputs: string[] = [];
    const evidenceMarkers: string[] = [
      `deliverable-mode:${stagedSteps[stagedSteps.length - 1]?.mode ?? effectiveMode}`,
      `staged-repair-steps:${stagedSteps.length}`,
      `staged-repair-step-total:${stagedSteps.length}`,
    ];
    let latestReadSliceContent: string | undefined;
    let latestReadSliceLabel: string | undefined;
    if (resumeCursor > 1) {
      stageOutputs.push(
        `Resuming staged repair at step ${resumeCursor}/${stagedSteps.length}.`,
      );
      evidenceMarkers.push(`staged-repair-resume-cursor:${resumeCursor}`);
    }
    let completedStep = Math.max(0, startIndex);
    let blockedStep: number | undefined;
    let completed = true;

    for (let index = startIndex; index < stagedSteps.length; index += 1) {
      const stage = stagedSteps[index];
      if (!stage) {
        continue;
      }
      const stageConstraints = mergeGroundedRepairConstraints(
        constraints,
        stage.constraints,
        stage,
      );
      const stageReadCount =
        stage.mode === "read"
          ? (stage.readLineCount ?? requestedLines ?? 2)
          : undefined;
      const stageLineOffset =
        stage.mode === "read"
          ? stage.continueFromPreviousRead
            ? readCursor
            : effectiveLineOffset
          : undefined;
      const stageResult = buildSingleGroundedDelivery({
        prompt: input.prompt,
        targetPath: input.targetPath,
        content: input.content,
        ...(stage.mode === "explain" &&
        stage.useLatestReadSnippet &&
        latestReadSliceContent
          ? {
              scopedContent: latestReadSliceContent,
              scopedLabel: latestReadSliceLabel,
            }
          : {}),
        mode: stage.mode,
        constraints: stageConstraints,
        requestedLines: stageReadCount,
        lineOffset: stageLineOffset,
      });
      stageOutputs.push(
        `Step ${index + 1}/${stagedSteps.length} (${stage.label}):\n${stageResult.output}`,
      );
      evidenceMarkers.push(
        `repair-stage:${index + 1}:${stage.mode}:${stageResult.completed ? "completed" : "blocked"}`,
        ...stageResult.evidenceMarkers,
      );
      readCursor = Math.max(readCursor, stageResult.readDeliveredLines);
      if (stageResult.readSliceContent) {
        latestReadSliceContent = stageResult.readSliceContent;
        latestReadSliceLabel = stageResult.readSliceLabel;
      }
      if (!stageResult.completed) {
        blockedStep = index + 1;
        completed = false;
        break;
      }
      completedStep = index + 1;
    }

    const nextStep = completed
      ? stagedSteps.length + 1
      : (blockedStep ?? completedStep + 1);
    evidenceMarkers.push(`staged-repair-completed-step:${completedStep}`);
    if (blockedStep !== undefined) {
      evidenceMarkers.push(`staged-repair-blocked-step:${blockedStep}`);
    }
    if (!completed && nextStep <= stagedSteps.length) {
      evidenceMarkers.push(`staged-repair-next-step:${nextStep}`);
    } else if (completed) {
      evidenceMarkers.push("staged-repair-next-step:done");
    }
    evidenceMarkers.push(`staged-repair-step-cursor:${completedStep}`);
    evidenceMarkers.push(`read-delivered-lines:${readCursor}`);
    return {
      completed,
      output: stageOutputs.join("\n\n"),
      evidenceMarkers,
    };
  }

  const singleStep = buildSingleGroundedDelivery({
    ...(effectiveMode === "explain" &&
    hasLocalSliceExplainCue(input.prompt) &&
    scopedExplainLineCount !== undefined
      ? (() => {
          const sourceLines = input.content.split(/\r?\n/);
          const start = scopedExplainLineOffset;
          const selected = sourceLines.slice(
            start,
            start + scopedExplainLineCount,
          );
          const slice = selected.join("\n");
          const end = selected.length > 0 ? start + selected.length : start;
          return {
            scopedContent: slice,
            scopedLabel: `lines ${start + 1}-${end}`,
          };
        })()
      : {}),
    prompt: input.prompt,
    targetPath: input.targetPath,
    content: input.content,
    mode: effectiveMode,
    constraints,
    requestedLines,
    lineOffset:
      input.lineOffset !== undefined || reanchorObservabilityMarkers.length > 0
        ? effectiveLineOffset
        : undefined,
  });
  return {
    completed: singleStep.completed,
    output: singleStep.output,
    evidenceMarkers: [
      ...singleStep.evidenceMarkers,
      ...reanchorObservabilityMarkers,
    ],
  };
}

function buildSingleGroundedDelivery(input: {
  prompt: string;
  targetPath: string;
  content: string;
  scopedContent?: string;
  scopedLabel?: string;
  mode: GroundedDeliverableMode;
  constraints?: GroundedDeliverableConstraints;
  requestedLines?: number;
  lineOffset?: number;
}): {
  completed: boolean;
  output: string;
  evidenceMarkers: string[];
  readDeliveredLines: number;
  readSliceContent?: string;
  readSliceLabel?: string;
} {
  const effectiveContent = input.scopedContent ?? input.content;
  const trimmed = effectiveContent.trim();
  if (input.requestedLines !== undefined || input.mode === "read") {
    const rawLines = input.content.split(/\r?\n/);
    while (rawLines.length > 0 && rawLines[rawLines.length - 1]?.length === 0) {
      rawLines.pop();
    }
    const count = input.requestedLines ?? Math.min(40, rawLines.length);
    const start =
      input.lineOffset !== undefined
        ? Math.max(0, input.lineOffset)
        : hasReadTailCue(input.prompt)
          ? Math.max(0, rawLines.length - count)
          : 0;
    const windowLines = rawLines.slice(start, start + count);
    const windowEnd = start + windowLines.length;
    let lines = windowLines;
    let matchedLineIndexes = windowLines.map((_, index) => start + index);
    const filteredRead =
      input.constraints?.readFilter === "function-definitions";
    if (input.constraints?.readFilter === "function-definitions") {
      const filteredPairs = windowLines
        .map((line, index) => ({ line, index: start + index }))
        .filter(({ line }) =>
          lineMatchesReadFilter(line, "function-definitions"),
        );
      lines = filteredPairs.map((entry) => entry.line);
      matchedLineIndexes = filteredPairs.map((entry) => entry.index);
    }
    if (windowLines.length === 0) {
      return {
        completed: false,
        output: `Task not completed: requested read range is out of file bounds for ${input.targetPath}.`,
        evidenceMarkers: [
          "deliverable-mode:read",
          `read-delivered-lines:${start}`,
          ...(input.constraints?.readFilter
            ? [`repair-read-filter:${input.constraints.readFilter}`]
            : []),
        ],
        readDeliveredLines: start,
        readSliceLabel: `${start + 1}-${start}`,
      };
    }
    if (lines.length === 0) {
      return {
        completed: false,
        output: `Task not completed: no lines matched filter "${input.constraints?.readFilter}" in ${input.targetPath} lines ${start + 1}-${windowEnd}.`,
        evidenceMarkers: [
          "deliverable-mode:read",
          `read-delivered-lines:${windowEnd}`,
          `read-fragment-start:${start}`,
          `read-fragment-end:${windowEnd}`,
          `read-fragment-source-window-start:${start}`,
          `read-fragment-source-window-end:${windowEnd}`,
          "read-fragment-empty:true",
          ...(input.constraints?.readFilter
            ? [`repair-read-filter:${input.constraints.readFilter}`]
            : []),
        ],
        readDeliveredLines: windowEnd,
        readSliceLabel: `${start + 1}-${windowEnd}`,
      };
    }
    const readSliceContent = lines.join("\n");
    const readSliceFingerprint = computeFragmentFingerprint(readSliceContent);
    const readSliceLabel =
      filteredRead && matchedLineIndexes.length > 0
        ? summarizeLineIndexSet(matchedLineIndexes)
        : `${start + 1}-${windowEnd}`;
    const fragmentStart =
      matchedLineIndexes.length > 0 ? matchedLineIndexes[0] : start;
    const fragmentEnd =
      matchedLineIndexes.length > 0
        ? (matchedLineIndexes[matchedLineIndexes.length - 1] ?? start) + 1
        : windowEnd;
    const matchedRanges = compressLineIndexesToRanges(matchedLineIndexes);
    const matchedRangeCount =
      matchedRanges.length > 0
        ? matchedRanges.split(";").filter((entry) => entry.length > 0).length
        : 0;
    const includeExplicitIndexes = matchedLineIndexes.length <= 128;
    return {
      completed: true,
      output: [
        filteredRead
          ? `Read result for ${input.targetPath} (filtered matches in lines ${start + 1}-${windowEnd}):`
          : input.requestedLines
            ? `Read result for ${input.targetPath} (${start > 0 ? `lines ${start + 1}-${start + lines.length}` : `first ${input.requestedLines} lines`}):`
            : `Read result for ${input.targetPath}:`,
        "```text",
        readSliceContent,
        "```",
      ].join("\n"),
      evidenceMarkers: [
        "deliverable-mode:read",
        `read-delivered-lines:${windowEnd}`,
        `read-window-start:${start}`,
        `read-window-end:${windowEnd}`,
        `read-window-size:${Math.max(0, windowEnd - start)}`,
        `read-fragment-start:${fragmentStart}`,
        `read-fragment-end:${fragmentEnd}`,
        `read-fragment-source-window-start:${start}`,
        `read-fragment-source-window-end:${windowEnd}`,
        ...(filteredRead && includeExplicitIndexes
          ? [`read-fragment-line-indexes:${matchedLineIndexes.join(",")}`]
          : []),
        ...(filteredRead ? [`read-fragment-ranges:${matchedRanges}`] : []),
        ...(filteredRead
          ? [`read-fragment-line-index-count:${matchedLineIndexes.length}`]
          : []),
        ...(filteredRead && matchedRangeCount > 0
          ? [`read-fragment-range-count:${matchedRangeCount}`]
          : []),
        `read-fragment-fingerprint:${readSliceFingerprint}`,
        ...(input.constraints?.readFilter
          ? [`repair-read-filter:${input.constraints.readFilter}`]
          : []),
      ],
      readDeliveredLines: windowEnd,
      readSliceContent,
      readSliceLabel,
    };
  }

  if (input.mode === "summary") {
    const summary =
      input.constraints?.summaryStyle === "conclusion-with-evidence"
        ? summarizeAsConclusionWithEvidence(
            trimmed,
            input.constraints.summaryEvidenceCount ?? 2,
            input.constraints.includeKeyRisks ?? false,
            input.constraints.avoidGenericLanguage ?? false,
          )
        : prefersDirectTextSummary(input.prompt)
          ? summarizeContentAsText(trimmed)
          : summarizeContent(trimmed);
    return {
      completed: true,
      output: [`Summary of ${input.targetPath}:`, summary].join("\n"),
      evidenceMarkers: [
        "deliverable-mode:summary",
        "read-delivered-lines:0",
        ...(input.constraints?.summaryStyle
          ? [`repair-summary-style:${input.constraints.summaryStyle}`]
          : []),
        ...(input.constraints?.includeKeyRisks
          ? ["repair-summary-include-risk:true"]
          : []),
      ],
      readDeliveredLines: 0,
    };
  }

  if (input.mode === "explain") {
    const explanationTarget = input.scopedLabel
      ? `${input.targetPath} (${input.scopedLabel})`
      : input.targetPath;
    const explanation =
      input.constraints?.explainScope === "purpose-io-only"
        ? buildPurposeIoExplainDelivery(explanationTarget, effectiveContent)
        : buildExplainTaskDelivery(explanationTarget, effectiveContent);
    return {
      completed: true,
      output: explanation,
      evidenceMarkers: [
        "deliverable-mode:explain",
        "read-delivered-lines:0",
        ...(input.constraints?.explainScope
          ? [`repair-explain-scope:${input.constraints.explainScope}`]
          : []),
      ],
      readDeliveredLines: 0,
    };
  }

  const preview = input.content.split(/\r?\n/).slice(0, 40).join("\n");
  return {
    completed: true,
    output: [
      `Read result for ${input.targetPath}:`,
      "```text",
      preview,
      "```",
    ].join("\n"),
    evidenceMarkers: ["deliverable-mode:read", "read-delivered-lines:40"],
    readDeliveredLines: 40,
  };
}

function mergeGroundedRepairConstraints(
  base: GroundedDeliverableConstraints | undefined,
  override: GroundedDeliverableConstraints | undefined,
  stage: GroundedRepairStage,
): GroundedDeliverableConstraints | undefined {
  const merged: GroundedDeliverableConstraints = {
    ...(base ?? {}),
    ...(override ?? {}),
  };
  if (stage.summaryConclusionOnly) {
    merged.summaryStyle = "conclusion-with-evidence";
    merged.summaryEvidenceCount = 1;
  }
  if (stage.summaryEvidenceOnly) {
    merged.summaryStyle = "conclusion-with-evidence";
    merged.summaryEvidenceCount = stage.summaryEvidenceCount ?? 2;
    merged.avoidGenericLanguage = true;
  }
  if (stage.appendRiskLine) {
    merged.includeKeyRisks = true;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function summarizeAsConclusionWithEvidence(
  content: string,
  evidenceCount: number,
  includeKeyRisks: boolean,
  avoidGenericLanguage: boolean,
): string {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const evidence = lines.slice(0, Math.max(1, evidenceCount));
  const conclusion = avoidGenericLanguage
    ? `This file primarily centers on: ${evidence[0] ?? "the inspected target content"}.`
    : `Conclusion: this file mainly describes ${evidence[0] ?? "the inspected target content"}.`;
  const result = [
    conclusion,
    ...evidence.map((line, index) => `Evidence ${index + 1}: ${line}`),
  ];
  if (includeKeyRisks) {
    result.push(
      `Key risk: current content is concise and may omit edge-case behavior details beyond the shown evidence.`,
    );
  }
  return result.join("\n");
}

function summarizeContent(content: string): string {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const preview = lines.slice(0, 3).join(" ");
  return preview.length > 0
    ? `This file contains ${lines.length} non-empty lines. Key content: ${preview}`
    : "No substantive content found.";
}

function summarizeContentAsText(content: string): string {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.slice(0, 6).join("\n") || "No substantive content found.";
}

function prefersDirectTextSummary(prompt: string): boolean {
  return /(?:just\s+summari[sz]e|summari[sz]e\s+the\s+text|direct\s+summary|\u76f4\u63a5\u603b\u7ed3|\u6458\u8981\u6587\u672c)/i.test(
    prompt,
  );
}
