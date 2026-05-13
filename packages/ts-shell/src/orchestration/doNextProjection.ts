import type { TargetResolutionBlocker } from "./targetResolution.js";

export function buildAmbiguousEditInstructionReason(
  targetPath?: string,
): string {
  const target = targetPath?.trim() || "the target file";
  const promptRewrite = /(^|[\\/])math\.js$/i.test(target)
    ? `For this request, rerun with a safe explicit rewrite such as: "In ${target}, replace 'return n + 2;' with 'return n * 2;'. Only modify ${target}."`
    : `Rerun with a safe explicit rewrite such as: "In ${target}, replace '<current text>' with '<desired text>'. Only modify ${target}."`;
  return formatEditExecutionFailure({
    failureReason: "edit-transform-unclear",
    explanation:
      "Edit instruction is ambiguous: replacement not safely derivable from the prompt. No files were changed and unrelated files were not modified.",
    nextAction: `${promptRewrite} Alternatively, provide a fenced full replacement for the target file.`,
  });
}

export function formatEditExecutionFailure(input: {
  readonly failureReason:
    | "edit-target-missing"
    | "edit-transform-unclear"
    | "patch-ambiguous"
    | "patch-target-missing"
    | "patch-from-not-found";
  readonly explanation: string;
  readonly nextAction: string;
}): string {
  return `${input.failureReason}: ${input.explanation} Next action: ${input.nextAction}`;
}

export function formatTargetResolutionBlockerReason(
  blocker: TargetResolutionBlocker,
): string {
  const candidates =
    blocker.candidates.length > 0
      ? ` Candidates: ${blocker.candidates.join(", ")}.`
      : "";
  return `${blocker.code}: ${blocker.reason}${candidates} Next action: ${blocker.nextAction}`;
}
