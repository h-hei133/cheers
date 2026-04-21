import { getWorkflowGitDiagnostics } from "../../workflow/gitContext.js";

export function resolveRepoAwarePromptResponse(
  prompt: string,
  cwd: string,
): string | undefined {
  const trimmed = prompt.trim();
  if (!trimmed || trimmed.startsWith("/")) {
    return undefined;
  }

  const normalized = trimmed.toLowerCase();
  const hasRepoCue =
    /\b(repo|repository|workspace|project|git|changes?)\b/i.test(normalized) ||
    /(?:仓库|项目|改动|变更|代码库|当前状态|下一步|先做什么|主要集中|适合继续)/u.test(
      trimmed,
    );
  if (!hasRepoCue) {
    return undefined;
  }

  const hasDiagnosisIntent =
    /\b(status|state|what should i do|next step|what now|where .*chang|where .*concentrat|summar(y|ize)|diagnos)\b/i.test(
      normalized,
    ) ||
    /(?:看看|什么情况|当前状态|下一步|先做什么|主要集中在哪|简短判断|判断现在|先验证|先整理改动|适合继续写)/u.test(
      trimmed,
    );
  if (!hasDiagnosisIntent) {
    return undefined;
  }

  const hasExecutionIntent =
    /\b(implement|fix|write|edit|create|add|remove|refactor|run|execute|patch)\b/i.test(
      normalized,
    ) ||
    /(?:实现|修复|修改|编写|新增|删除|重构|运行|执行|补丁)/u.test(trimmed);
  const hasPlanningIntent =
    /\b(what should i do|next step|status|state|where .*chang|where .*concentrat)\b/i.test(
      normalized,
    ) ||
    /(?:先做什么|下一步|当前状态|什么情况|主要集中在哪|判断|适合)/u.test(trimmed);
  if (hasExecutionIntent && !hasPlanningIntent) {
    return undefined;
  }

  const diagnostics = getWorkflowGitDiagnostics(cwd, { limit: 20 });
  if (!diagnostics.insideGit) {
    return [
      "Repo-aware summary",
      "- 当前目录不是 Git 仓库。",
      "- 下一步：先用 /workspace attach <git-project-path> 进入项目后再继续。",
    ].join("\n");
  }

  const totalChanges =
    diagnostics.stagedCount +
    diagnostics.unstagedCount +
    diagnostics.untrackedCount +
    diagnostics.conflictedCount;
  const hotspots = summarizeHotspots(diagnostics.entries.map((entry) => entry.path), 3);
  const topFiles = diagnostics.entries.slice(0, 5).map((entry) => entry.path);

  const lines: string[] = [
    "Repo-aware summary",
    `- 分支：${diagnostics.branch ?? "unknown"} (+${diagnostics.ahead}/-${diagnostics.behind})`,
    `- 改动：staged ${diagnostics.stagedCount} | unstaged ${diagnostics.unstagedCount} | untracked ${diagnostics.untrackedCount} | conflicted ${diagnostics.conflictedCount}`,
  ];

  if (hotspots.length > 0) {
    lines.push(`- 改动集中：${hotspots.join(", ")}`);
  }
  if (topFiles.length > 0) {
    lines.push(`- 主要文件：${topFiles.join(", ")}`);
  }

  if (diagnostics.conflictedCount > 0) {
    lines.push("- 建议：先解冲突，再做 verify，再继续开发。");
  } else if (totalChanges === 0) {
    lines.push("- 建议：工作区干净，可直接开始实现任务或先拉取最新代码。");
  } else if (
    diagnostics.stagedCount > 0 &&
    diagnostics.unstagedCount === 0 &&
    diagnostics.untrackedCount === 0
  ) {
    lines.push("- 建议：先做 targeted verify（测试/构建），通过后可直接提交。");
  } else if (
    diagnostics.unstagedCount > 0 &&
    diagnostics.stagedCount === 0 &&
    diagnostics.untrackedCount === 0
  ) {
    lines.push("- 建议：先按文件聚类 inspect 并分批 stage，再做 verify。");
  } else if (
    diagnostics.untrackedCount > 0 &&
    diagnostics.stagedCount === 0 &&
    diagnostics.unstagedCount === 0
  ) {
    lines.push("- 建议：先决定 add / ignore / stash 未跟踪文件，再继续任务。");
  } else {
    lines.push("- 建议：先整理改动边界（stage 分组），然后 verify，再继续写。");
  }

  return lines.join("\n");
}

function summarizeHotspots(paths: readonly string[], limit: number): string[] {
  const counters = new Map<string, number>();
  for (const filePath of paths) {
    const normalized = filePath.replace(/\\/g, "/");
    const parts = normalized.split("/").filter(Boolean);
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : ".";
    counters.set(dir, (counters.get(dir) ?? 0) + 1);
  }

  return Array.from(counters.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([dir]) => dir);
}

