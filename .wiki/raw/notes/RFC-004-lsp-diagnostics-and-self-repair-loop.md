# RFC-004: LSP 协议驱动的自动诊断反馈与代码自愈闭环

- **状态**：Draft / Proposed
- **作者**：Coding Agents Architecture Working Group
- **参考架构**：`Claude Code` (`source-claudecode`) & `OpenHands`
- **日期**：2026-08-28

---

## 一、 为什么传统的“盲写补丁”会导致反复翻车？

当前大多数 Agent 在修改代码时的典型流程：
1. 模型输出代码块或 Diff
2. 写入磁盘文件
3. 提示任务完成（或等待用户手动跑测试报错）

**致命缺陷**：
- **无编译期反馈（Blind Mutation）**：模型修改代码时，很容易漏改一个重命名的变量、漏导入一个类型、或者出现隐蔽的参数类型不匹配。
- **恶性循环（Hallucination Cascade）**：在没有编译器诊断反馈的情况下，Agent 会误以为修改成功并以此为基础继续修改，导致错误越来越深。

---

## 二、 吸收 Claude Code 核心模式：LSP 自动诊断闭环设计

```mermaid
graph TD
  subgraph "LSP 自动诊断与代码自愈流水线"
    Model[Agent 模型输出代码 Patch] --> Queue[fileMutationQueue 并发锁写入文件]
    Queue --> LSPTrigger[自动触发 LSP Diagnostics 检查<br/>通过 lsp_diagnostics 或语言服务器通道]
    LSPTrigger --> Eval{诊断结果判定}
    Eval -->|0 Errors 正常通过| Success[生成 RuntimeReceipt 提交成功]
    Eval -->|存在 Type/Syntax 错误| Loopback[构造自愈提示词 Attachment<br/>附带文件名、出错行号、精准 TS 错误码]
    Loopback --> ModelRetry[模型定向修复重试 (Max 2 turns)]
    ModelRetry --> Queue
    ModelRetry -->|超过最大重试次数| Rollback[基于 Snapshot 执行原子多文件回滚]
  end
```

### 1. 核心自愈控制器架构 (Autonomous Self-Repair Controller)

```typescript
export interface DiagnosticErrorItem {
  readonly filePath: string;
  readonly line: number;
  readonly column: number;
  readonly code: number | string;
  readonly message: string;
  readonly severity: "error" | "warning";
}

export interface SelfRepairLoopContext {
  readonly maxAttempts: number;
  readonly currentAttempt: number;
  readonly modifiedFiles: readonly string[];
  readonly rollbackSnapshotId?: string;
}

export async function executeMutationWithLspSelfRepair(input: {
  readonly filesToMutate: readonly { path: string; content: string }[];
  readonly lspClient: { getDiagnostics: (file: string) => Promise<DiagnosticErrorItem[]> };
  readonly modelRunner: { repairWithFeedback: (errors: DiagnosticErrorItem[]) => Promise<void> };
}): Promise<{ ok: boolean; finalErrors?: DiagnosticErrorItem[] }> {
  // 1. 在 fileMutationQueue 保护下执行写入
  // 2. 自动收集所有变动文件的 LSP Diagnostics
  // 3. 若发现 errors 且 attempts < maxAttempts，自动组织反馈上下文回传给模型重试
  // 4. 若无法修复，触发自动回滚保证工作区干净
  return { ok: true };
}
```

### 2. 诊断反馈提示词模板设计

```markdown
[LSP Compiler Feedback - Automatic Diagnostic Interception]
Your recent modification introduced 2 TypeScript diagnostic error(s):

1. File: src/session/SessionManager.ts (Line 42, Col 15)
   - Error TS2339: Property 'nonExistentField' does not exist on type 'SessionStateSnapshot'.
2. File: src/session/agent/lifecycle.ts (Line 88, Col 7)
   - Error TS2345: Argument of type 'string' is not assignable to parameter of type 'QueryRuntimeRecoveryBoundary'.

Please fix these exact errors immediately. Preserve the rest of your changes.
```

---

## 三、 复用方案与阶段集成

- **基础设施**：`packages/ts-shell` 已经内置了与语言服务器交互的通道和 `xd://lsp` / `lsp_diagnostics` 工具。
- **集成路径**：在 `packages/ts-shell/src/edit/` 下实现 `src/edit/repair/lspRepairLoop.ts`，将其挂载为 `toolBatchDispatch` 中 `write` 与 `edit` 操作的写后验证守卫（Post-mutation Guard）。
