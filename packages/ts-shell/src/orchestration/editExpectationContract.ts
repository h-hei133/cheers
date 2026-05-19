export type EditExpectationCapabilityKind =
  | "write-file"
  | "edit-file"
  | "no-write"
  | "unknown";

export type EditExpectationContractStatus =
  | "ready"
  | "stopped"
  | "not-applicable";

export type EditExpectationReasonCode =
  | "concrete-write"
  | "write-content-missing"
  | "write-target-missing"
  | "bounded-edit"
  | "unsupported-refactor"
  | "unsupported-batch-edit"
  | "unsupported-discovery-edit"
  | "no-write-inspect"
  | "ambiguous-mutation"
  | "unknown";

export interface EditExpectationContract {
  readonly capabilityKind: EditExpectationCapabilityKind;
  readonly contractStatus: EditExpectationContractStatus;
  readonly reasonCode: EditExpectationReasonCode;
  readonly doNext: string;
  readonly mutationMayProceed: boolean;
  readonly verificationMayBeConsidered: boolean;
}

export function classifyEditExpectationContract(input: {
  readonly prompt: string;
  readonly targetPath?: string;
  readonly targetCount?: number;
  readonly hasConcreteContent?: boolean;
  readonly hasReplaceDirective?: boolean;
  readonly hasFencedContent?: boolean;
  readonly hasCreateIntent?: boolean;
  readonly hasEditIntent?: boolean;
  readonly hasReadInspectIntent?: boolean;
}): EditExpectationContract {
  const prompt = input.prompt.trim();
  const targetCount = input.targetCount ?? (input.targetPath ? 1 : 0);
  const hasTarget = Boolean(input.targetPath);
  const writeLike = isWriteExpectationPrompt(prompt) || input.hasCreateIntent;
  const editLike = isEditExpectationPrompt(prompt) || input.hasEditIntent;

  if (input.hasReadInspectIntent && !writeLike && !editLike) {
    return contract({
      capabilityKind: "no-write",
      contractStatus: "ready",
      reasonCode: "no-write-inspect",
      doNext: "Use read/inspect evidence without mutating the workspace.",
      mutationMayProceed: false,
      verificationMayBeConsidered: false,
    });
  }

  if (targetCount > 1 && editLike) {
    return contract({
      capabilityKind: "edit-file",
      contractStatus: "stopped",
      reasonCode: "unsupported-batch-edit",
      doNext:
        "Split the request into one explicit target file per edit, or use a bounded apply_patch route when that route is explicitly selected.",
      mutationMayProceed: false,
      verificationMayBeConsidered: false,
    });
  }

  if (isBroadRefactorPrompt(prompt)) {
    return contract({
      capabilityKind: "edit-file",
      contractStatus: "stopped",
      reasonCode: "unsupported-refactor",
      doNext:
        "Provide one explicit target file and one concrete replacement, or open a dedicated refactor route.",
      mutationMayProceed: false,
      verificationMayBeConsidered: false,
    });
  }

  if (isDiscoveryEditPrompt(prompt) && !hasTarget) {
    return contract({
      capabilityKind: "edit-file",
      contractStatus: "stopped",
      reasonCode: "unsupported-discovery-edit",
      doNext:
        "Provide exactly one explicit in-workspace target file before requesting an edit.",
      mutationMayProceed: false,
      verificationMayBeConsidered: false,
    });
  }

  if (writeLike) {
    if (!hasTarget) {
      return contract({
        capabilityKind: "write-file",
        contractStatus: "stopped",
        reasonCode: "write-target-missing",
        doNext:
          "Provide an explicit in-workspace target file path and concrete content.",
        mutationMayProceed: false,
        verificationMayBeConsidered: false,
      });
    }
    if (!input.hasConcreteContent) {
      return contract({
        capabilityKind: "write-file",
        contractStatus: "stopped",
        reasonCode: "write-content-missing",
        doNext:
          "Provide fenced code or a single-line literal such as 'with content: hello'.",
        mutationMayProceed: false,
        verificationMayBeConsidered: false,
      });
    }
    return contract({
      capabilityKind: "write-file",
      contractStatus: "ready",
      reasonCode: "concrete-write",
      doNext: "Proceed through the bounded write route.",
      mutationMayProceed: true,
      verificationMayBeConsidered: true,
    });
  }

  if (editLike) {
    if (!hasTarget) {
      return contract({
        capabilityKind: "edit-file",
        contractStatus: "stopped",
        reasonCode: "write-target-missing",
        doNext:
          "Provide exactly one explicit in-workspace target file before requesting an edit.",
        mutationMayProceed: false,
        verificationMayBeConsidered: false,
      });
    }
    if (input.hasReplaceDirective || input.hasFencedContent) {
      return contract({
        capabilityKind: "edit-file",
        contractStatus: "ready",
        reasonCode: "bounded-edit",
        doNext: "Proceed through the bounded single-file edit route.",
        mutationMayProceed: true,
        verificationMayBeConsidered: true,
      });
    }
    return contract({
      capabilityKind: "edit-file",
      contractStatus: "stopped",
      reasonCode: "ambiguous-mutation",
      doNext:
        "Provide a concrete replacement, patch, or fenced target content for the selected file.",
      mutationMayProceed: false,
      verificationMayBeConsidered: false,
    });
  }

  return contract({
    capabilityKind: "unknown",
    contractStatus: "not-applicable",
    reasonCode: "unknown",
    doNext: "No write/edit expectation was detected.",
    mutationMayProceed: false,
    verificationMayBeConsidered: false,
  });
}

export function isWriteExpectationPrompt(prompt: string): boolean {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return (
    /\b(?:create|write)\b[\s\S]{0,80}\b(?:file|script|current directory)\b/i.test(
      prompt,
    ) ||
    /\bwrite\b[\s\S]{0,80}\b[\w./-]+\.(?:txt|md|json|yaml|yml|ts|tsx|js|jsx|py|css|html)\b/i.test(
      prompt,
    ) ||
    /(?:创建|新建|写入|写一个|当前目录)[\s\S]{0,80}(?:文件|脚本|内容|\.py|\.ts|\.js|\.md|\.txt)/u.test(
      prompt,
    )
  );
}

function isEditExpectationPrompt(prompt: string): boolean {
  return /\b(?:edit|modify|update|replace|append|insert|fix|change)\b|(?:修改|替换|修复|改成|改为)/iu.test(
    prompt,
  );
}

function isBroadRefactorPrompt(prompt: string): boolean {
  return /\b(?:refactor|rename exported function|rename function|keep usage|protected files?)\b/i.test(
    prompt,
  );
}

function isDiscoveryEditPrompt(prompt: string): boolean {
  return /\bedit\s+(?:this\s+)?(?:repo|repository|workspace)\b/i.test(prompt);
}

function contract(input: EditExpectationContract): EditExpectationContract {
  return input;
}
