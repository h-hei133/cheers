export type TaskMode =
  | "chat"
  | "analysis"
  | "plan"
  | "implementation"
  | "tool-write";

export type QueryRoute = "lightweight" | "orchestrated";

export interface RouteDecisionInput {
  readonly prompt: string;
  readonly agentMode?: "plan" | "build";
  readonly hasRuntimeSeed?: boolean;
}

export interface RouteDecision {
  readonly mode: TaskMode;
  readonly route: QueryRoute;
  readonly noWrite: boolean;
  readonly reason: string;
  readonly signals: readonly string[];
}

interface IntentSignals {
  readonly asksForNoWritePlan: boolean;
  readonly asksForExplicitNoWrite: boolean;
  readonly asksForConceptExplanation: boolean;
  readonly asksForPlan: boolean;
  readonly asksForAnalysis: boolean;
  readonly asksForImplementation: boolean;
  readonly asksForToolOrWrite: boolean;
  readonly asksForCommand: boolean;
  readonly hasPatchShape: boolean;
  readonly hasCodeFence: boolean;
  readonly hasPathReference: boolean;
  readonly isShortConversational: boolean;
}

export function decideQueryRoute(input: RouteDecisionInput): RouteDecision {
  const prompt = input.prompt.trim();
  const signals = extractIntentSignals(prompt);
  const signalNames = renderSignals(signals);

  if (!prompt) {
    return {
      mode: "chat",
      route: "lightweight",
      noWrite: true,
      reason: "empty prompt defaults to lightweight chat",
      signals: ["empty-prompt"],
    };
  }

  if (input.hasRuntimeSeed) {
    return {
      mode: "implementation",
      route: "orchestrated",
      noWrite: false,
      reason: "runtime recovery seed must preserve orchestration semantics",
      signals: ["runtime-seed", ...signalNames],
    };
  }

  if (
    signals.asksForConceptExplanation &&
    !signals.hasPatchShape &&
    !signals.hasCodeFence
  ) {
    return {
      mode: "chat",
      route: "lightweight",
      noWrite: true,
      reason: "concept explanation request uses lightweight chat route",
      signals: signalNames,
    };
  }

  if (signals.asksForToolOrWrite || signals.hasPatchShape) {
    return {
      mode: "tool-write",
      route: "orchestrated",
      noWrite: false,
      reason: "tool/write intent must stay behind orchestration and permission boundaries",
      signals: signalNames,
    };
  }

  if (input.agentMode === "plan") {
    return {
      mode: "plan",
      route: "lightweight",
      noWrite: true,
      reason: "active plan mode uses no-write planning route",
      signals: ["agent-mode-plan", ...signalNames],
    };
  }

  if (signals.asksForPlan) {
    return {
      mode: "plan",
      route: "lightweight",
      noWrite: true,
      reason: "explicit planning request uses no-write planning route",
      signals: signalNames,
    };
  }

  if (signals.asksForImplementation || signals.asksForCommand) {
    return {
      mode: "implementation",
      route: "orchestrated",
      noWrite: false,
      reason: "implementation or execution request requires coding orchestration",
      signals: signalNames,
    };
  }

  if (signals.asksForAnalysis) {
    return {
      mode: "analysis",
      route: "lightweight",
      noWrite: true,
      reason: "analysis request uses no-write analysis route",
      signals: signalNames,
    };
  }

  return {
    mode: "chat",
    route: "lightweight",
    noWrite: true,
    reason: signals.isShortConversational
      ? "short conversational prompt uses lightweight chat route"
      : "no tool/write/implementation intent detected",
    signals: signalNames,
  };
}

function extractIntentSignals(prompt: string): IntentSignals {
  const normalized = normalizeForIntent(prompt);
  const text = `${normalized} ${prompt}`;
  const asksForPlanThenImplementation = hasAny(text, [
    /\b(?:plan|planning|steps|roadmap).{0,40}\b(?:then|and)\b.{0,40}\b(?:implement|execute|fix|modify|change|write|code)\b/i,
    /(?:先|先.*?再|然后|并且|并).{0,12}(?:计划|规划|方案|步骤).{0,20}(?:然后|再|并|并且).{0,12}(?:实现|执行|修改|修复|写代码|编码)/u,
  ]);
  const asksForExplicitNoWrite = hasAny(text, [
    /(?:先不要(?:写|改|实现|执行|运行)|不要(?:写|改|执行|运行|实现|修改)|只(?:解释|说明|分析|回答)|不(?:要|用).{0,8}(?:工具|命令|写文件|改文件|修改文件))/u,
    /\b(?:no code|read[- ]?only|do not (?:write|implement|execute|run|modify)|don't (?:write|implement|execute|run|modify)|explain only)\b/i,
  ]);
  const asksForConceptExplanation = hasAny(text, [
    /(?:是什么意思|什么意思|什么含义|含义是什么|概念是什么|解释一下.{0,24}(?:是什么|什么意思|含义|概念))/u,
    /\b(?:what is|what does .{1,40} mean|meaning of|explain (?:the )?(?:term|concept))\b/i,
  ]);
  const asksForNoWritePlan =
    !asksForPlanThenImplementation &&
    hasAny(text, [
      /(?:先不要(?:写|改|实现|执行).{0,12}(?:计划|方案|步骤)|不要(?:写|改|执行|实现).{0,12}(?:计划|方案|步骤)|只(?:给|输出).{0,8}(?:计划|方案|步骤)|(?:制定|给).{0,8}(?:计划|方案|步骤))/u,
      /\b(?:plan only|give me (?:a )?plan|produce (?:a )?plan|no code,?\s*(?:just )?(?:give|write|produce).{0,20}\bplan)\b/i,
    ]);
  const asksForPlan =
    asksForNoWritePlan ||
    hasAny(text, [
      /\b(plan|planning|roadmap|steps|proposal|audit|review feasibility)\b/i,
      /(?:计划|规划|路线|步骤|审计|可行性)/u,
    ]) && !hasAny(text, [/\bimplement(?:ation)?\b/i, /(?:实现|修改|修复|执行计划)/u]);
  const hasAnalysisContext = hasAny(text, [
    /\b(error|failure|failed|bug|log|trace|stack|module|code|diff|regression|root cause)\b/i,
    /(?:错误|失败|报错|日志|堆栈|模块|代码|diff|回归|原因|问题|故障)/u,
  ]);
  const asksForAnalysis =
    hasAny(text, [
      /\b(analy[sz]e|diagnose|investigate|root cause|what caused|review|inspect|check)\b/i,
      /(?:分析|定位|排查|根因|原因|问题在哪|检查|审查|看看|是否有问题|有没有问题)/u,
    ]) ||
    (hasAnalysisContext &&
      hasAny(text, [/\b(explain|why|what happened)\b/i, /(?:解释|为什么|怎么回事|看看)/u]));
  const asksForImplementation =
    !asksForNoWritePlan &&
    !asksForConceptExplanation &&
    (asksForPlanThenImplementation ||
      (!asksForExplicitNoWrite &&
        hasAny(text, [
          /\b(implement|fix|modify|update|change|refactor|wire|add|create|repair)\b/i,
          /(?:实现|修复|修改|更新|接入|新增|创建|改代码|按计划|改一下|写一下|加一下|调整|改成)/u,
        ])));
  const asksForCommand = hasAny(text, [
    /\b(run|execute|test|build|commit|push|shell|terminal|npm|pnpm|yarn|git)\b/i,
    /(?:运行|执行|构建|提交|推送|命令|终端)/u,
  ]);
  const asksForExplicitCommand =
    !asksForConceptExplanation &&
    !asksForExplicitNoWrite &&
    hasAny(text, [
      /\b(run|execute|command|shell|terminal|npm|pnpm|yarn|git|commit|push)\b/i,
      /(?:运行|执行|命令|终端|提交|推送)/u,
    ]);
  const hasPatchShape = /(?:\*\*\* Begin Patch|diff --git|@@\s|apply_patch)/i.test(
    prompt,
  );
  const hasCodeFence = /```/.test(prompt);
  const hasPathReference = hasPathLikeReference(prompt);
  const asksForToolOrWrite =
    hasPatchShape ||
    (!asksForExplicitNoWrite &&
      hasAny(text, [
        /\b(apply_patch|write|edit|delete|remove|rename|move|save|commit|push)\b/i,
        /(?:写入|编辑|删除|移除|重命名|移动|保存|提交|推送|改文件|修改文件)/u,
      ])) ||
    asksForExplicitCommand ||
    (asksForImplementation && hasPathReference);

  return {
    asksForNoWritePlan,
    asksForExplicitNoWrite,
    asksForConceptExplanation,
    asksForPlan,
    asksForAnalysis,
    asksForImplementation,
    asksForToolOrWrite,
    asksForCommand,
    hasPatchShape,
    hasCodeFence,
    hasPathReference,
    isShortConversational: prompt.length <= 80 && !hasPathReference && !hasCodeFence,
  };
}

function renderSignals(signals: IntentSignals): string[] {
  const entries: Array<[keyof IntentSignals, string]> = [
    ["asksForNoWritePlan", "no-write-plan"],
    ["asksForExplicitNoWrite", "explicit-no-write"],
    ["asksForConceptExplanation", "concept-explanation"],
    ["asksForPlan", "plan"],
    ["asksForAnalysis", "analysis"],
    ["asksForImplementation", "implementation"],
    ["asksForToolOrWrite", "tool-write"],
    ["asksForCommand", "command"],
    ["hasPatchShape", "patch-shape"],
    ["hasCodeFence", "code-fence"],
    ["hasPathReference", "path-reference"],
    ["isShortConversational", "short-conversational"],
  ];
  return entries
    .filter(([key]) => signals[key])
    .map(([, label]) => label);
}

function normalizeForIntent(prompt: string): string {
  return prompt
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/["'`](?:\.{1,2}[\\/]|[A-Za-z]:[\\/]|\/)[^"'`]+["'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function hasAny(value: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function hasPathLikeReference(prompt: string): boolean {
  return /(?:[A-Za-z]:[\\/][^\s"'`<>|?*]+|\.{1,2}[\\/][^\s"'`<>|?*]+|\/[^\s"'`<>|?*]+|[A-Za-z0-9._-]+\.(?:d\.ts|test\.(?:ts|tsx|js|jsx)|spec\.(?:ts|tsx|js|jsx)|tsx|jsx|ts|js|py|go|rs|md|txt|json|log|yaml|yml|toml)|\b(?:README|AGENTS|LICENSE|Makefile|Dockerfile)\b)(?:$|\s|[,.!?;:，。！？；：])/i.test(
    prompt,
  );
}
