# 删除审查与 D 集恢复（2026-09-16）

## 1. 事故认定

仓库所有者质疑：主簇删除（`7a59ab23`，573 文件 / 125,141 行）**只依据 CLI 可达性 BFS，未做功能价值审查**。

**认定成立。** 三次删除（`0e875e37` 5 文件、`7a59ab23` 573 文件、`42d63bd7` 82 文件）全部只依据"可达性 + 测试覆盖"。`boundary-analysis-2026-09-15.md` 中"CLI 已有替代"的结论是**推理，非核验**。

旁证：对**未删除**的 92 个不可达文件做价值审查后，约 25 个是"未接线的新能力"而非死码。同一判据曾用于已删文件。

## 2. 三路审查结论

| 组 | 范围 | 结论 |
|---|---|---|
| G2 | edit/repair/proposal 68 文件 | 30 个是死残留，**38 个构成未被替代的 apply_patch 变更安全子系统** |
| G4 | verification/planning/result/evidence 47 文件 | 3 重复 / 34 簇内死码 / **6 未接线有价值** |
| G1 | orchestration 154 文件 | 发现 `editCapabilityReadiness.ts`（CLI 可达）登记的能力其证据已同批删除 |
| G3 | core/adapters 46 文件 | 审查未完成（API 额度耗尽） |

### 已核验的三条能力损失（G2 主张）

1. **写授权边界丢失**。被删 `edit/authority/workspace.ts`（552 行）用 `O_NOFOLLOW` + realpath + `/proc/self/fd` 描述符复验防符号链接逃逸与 TOCTOU；活轨 `writeTextFile` 是裸 `fs.writeFile`。活轨 `O_NOFOLLOW` 命中 **0**。
2. **`/undo` 功能性断裂**。`.sisyphus/edit-snapshots` 的唯一写入者 `orchestration/editSnapshot.ts` 被同批删除；活轨**零命中**任何快照写入代码。`/undo`、`/restore` 读一个永远空的目录。
3. **补丁验证层整体消失**。`parseApplyPatchText` / `verifyParsedPatch` / `buildPerFilePatchPlan` 活轨各 **0 命中**，删前分别存在于 13 / 11 / 8 个文件。

### 已核验的能力损失（G4）

`result/terminal/queryTerminalTruth.ts` 的 `deriveTruthfulTerminal` —— **8 分支终态真实性分类器**（阻塞/硬失败/验证失败/证据不足时把 `completed` 降级为 `stopped`）。活轨 `turn/projection.ts` 只有 2 个分支。这是 CB-004 的完整版；CB-004 只补了其中 1 个分支。

## 3. D 集恢复（本次执行）

**原则**：优先恢复"活轨功能真的坏了"的两条 —— 写授权边界 + 快照写入。

### 恢复与接线

| 动作 | 文件 | 说明 |
|---|---|---|
| 恢复 | `edit/authority/workspace.ts`（552 行） | 零内部依赖，原样可用 |
| 恢复 | `orchestration/editSnapshot.ts`（185 行） | 依赖 1 个已删类型，改为结构化最小契约 `EditSnapshotWorkspaceRouteFacts`（只取 `targetPath` / `recoveryAuthorityCapture`），避免拖入 27 文件闭包 |
| 接线 | `runtime/execution/service.ts` `writeTextFile` | 写前经 `createWorkspaceWriteAuthority`；工作区外拒绝；已存在文件走 `writeFile`（O_NOFOLLOW + 描述符复验），新文件走 `createFileExclusive`；写前 `captureSnapshotBeforeWrite` 记录原内容 |

所有 CLI 写路径都经 `ExecutionService.writeTextFile`，因此这是覆盖全部写操作的单一接线点。

设计取舍：快照捕获是**尽力而为**（catch 后不阻断写入）。理由：写入本身已由工作区授权与审批门控；快照缺失只降级该次 `/undo`，而 `/undo` 对无快照本就报"nothing to undo"。

### 验证

| 检查 | 结果 |
|---|---|
| 符号链接逃逸被拒且 victim 未被改写 | ✅ |
| 工作区外写入被拒 | ✅ |
| 工作区内新建/覆盖文件正常 | ✅ |
| 快照写入生成 `<authorityId>/blobs/*.content` + `records/*.json` | ✅ |
| `/undo` 端到端 | ✅ 输出 "Most recent edit" + 可执行 `/restore` 命令（此前恒为 "Nothing to undo"） |
| `tsc -p tsconfig.build.json` | 0 错误 |
| `cliReachable` | 871 → **873**（恢复的代码真正进入活轨） |
| 全量 vitest | **3173 / 3172 通过**；唯一失败 `registry-rust-bridge` 三次单跑通过 = 并行负载抖动 |

## 4. 未完成，待下一步

- **G3 审查未完成**（core/adapters 46 文件，API 额度耗尽）。
- **G1 未完整交付**（仅有转录要点）。
- **补丁验证层**（`parseApplyPatchText` / `verifyParsedPatch` / `buildPerFilePatchPlan`，闭包 27 文件）**尚未恢复** —— 属 G2 判定中规模最大的一项。
- **终态真实性完整版**（`queryTerminalTruth.ts` + 3 个已删依赖）尚未恢复。
- 其余 316 文件仍待完整逐个判定。

## 5. 方法论修正

**可达性 ≠ 价值。** 后续任何删除必须：

1. 删除前对候选做功能与价值审查（读实现，不只看 import 图）；
2. 对"已有替代"的结论做**核验**（对比规模、能力、边界语义），不采信推理；
3. 检查"消费者存活但生产者被删"的断链形态——这是最危险的信号；
4. 字符串路径启动的 `*Process.ts` 进程入口无法被 import 图发现（Step 2.6 已因此误删 1 个）。

---

## 6. 补丁验证层复核结论（2026-09-16，未恢复）

G2 判定"补丁验证层整体消失"为能力损失。**复核后判定：不是损失，是有意的架构决策。**

### 证据

1. **该层从未接入 CLI 工具面**。删除前（`7a59ab23^`）的 `core/tools/` 目录清单与当前一致，**同样没有 apply_patch 工具**。活轨始终是 5 个工具：`read / write / edit / glob / bash`。

2. **CLI 明确拒绝补丁语法，并引导模型改用单文件替换**。活轨中存在多处相同提示（`core/query/actionableBlockerModule.ts:280,356`、`session/actionableFailureContinuity.ts:153,220`、`result/projection/shell/assembly.ts:356,389`）：

   > "Rerun with one explicit target file plus exact replace-from and replace-to text; do not pass unified diff or apply_patch syntax."

   注意 `apply_patch` 在这些代码里是**被拒绝的输入形态**，不是被调用的能力。

3. **这些提示在删除前就存在**（`git show 7a59ab23^:...actionableBlockerModule.ts | grep -c apply_patch` = 2），与删除无关。

4. **能力形态不匹配**：`buildPerFilePatchPlan` 服务的是多文件 add/delete/move/update 补丁计划（含重复目标检测、2..32 有界写入策略）；活轨 `edit` 是单文件字符串替换。二者不是同一件事。

### 处置

尝试恢复的 3 个文件（`edit/patch/plan/perFile.ts` 1346 行、`orchestration/patchParsing/parser.ts` 340 行、`orchestration/patchVerification/verify.ts` 469 行）**已回退**。理由：

- 零依赖可直接编译，但**无任何消费者**（`cli:false, noReference:true`）——恢复文件 ≠ 恢复能力；
- 接线需**新增 apply_patch 工具**，这会改变产品工具面（模型可见工具、审批策略、提示词），属功能新增而非重构。

**结论**：这 2145 行是"被有意废弃路线的完整实现"，与 D 集（消费者存活、生产者被删）性质不同。若将来要支持补丁编辑，它是现成的高质量实现——建议登记到 `capability-backlog.md` 而非直接接入。

### 与 D 集的判据区分（重要）

| 形态 | 判据 | 处置 |
|---|---|---|
| **断链** | 消费者存活且 CLI 可达，生产者被删 | **必须恢复并接线**（D 集：写授权、快照） |
| **废弃路线** | 消费者与生产者同批消失；活轨明确拒绝该输入形态 | 登记 backlog，不接 |
| **未接线新能力** | 实现完整、无等价物、无消费者 | 交所有者裁决 |
