# 既有缺陷登记（Pre-existing Defect Registry）

> 用途：记录**当前活轨真实存在、且非本轮重构引入**的产品缺陷。
> 与 `capability-backlog.md` 的分工：那份记「能力缺失 / 已废弃链曾具备而活轨没有」；
> 本份记「能力在，但行为是错的」。
> 规则：**检测到缺陷 → 先复现 → 定位引入提交 → 登记 → 由维护者裁决是否修**。
> 与重构的关系：**不阻塞重构**。三者均**早于** Step 3–7 与 Phase A/B，非重构产物。

## 状态说明

- `待裁决` — 已登记，等维护者决定是否修
- `已批准` — 决定要修，待排期
- `已拒绝` — 决定不修，附理由

## 为什么单独立档

`capability-backlog.md` 的登记流程第 1 条把"回退"划给重构范围、把"缺失"留给该文档，
**没有第三类位置**。而本份三项既非缺失也非回退——它们是**一直在那里、一直没被发现的错误行为**。
按该流程处理会被误判为"重构范围内的修复"。

判定依据（本次三项共同的方法）：**先复现，再查引入提交，最后才谈归因**。
归因一律用 `git log -S` / `git blame` 定位到具体提交，不靠印象。

---

## PD-001 审批面自相矛盾，且 scope 代答写入 allow-once 缓存后不收窄

- **状态**：`待裁决`
- **性质**：**真实性缺陷 + 授权语义缺陷**（两个问题同源于一条代码路径）
- **引入提交**：`41b83b5b`（2026-05-01，渲染头）、`1cda3255`（2026-09-02，scope 代答路径）、
  `98d680a2`（2026-09-02，工具卡片注记）

### 现象

权限范围为 `ask` 时触发审批，用户在其间把范围切成 `allow-all`，屏幕上同时出现：

```
awaiting approval          ← 工具卡片（转写区，永久）
approval approved
Success
─────────────────────────
Approval
- Mode: user confirmation required                                    ← 说"需要你确认"
- Tool: bash
- Action: execute
- Target: cd ... && ls -la .wiki/
- Risk: high
- Decision source: session-scope                                      ← 实际是范围代答
- Session permission scope is `allow all`: nothing is put to you...
Approval decision: allow-once                                        ← 已经决定了
```

### 根因

**① 两个渲染面同时在画，且工具卡片从不清理**（矛盾输出的直接来源）

`cli/interactive/turnSink.ts:216,219` 把审批状态写进**工具卡片**：

```ts
case "approval.requested": this.tools.note(event.taskId, "awaiting approval"); return;
case "approval.resolved":  this.tools.note(event.taskId, `approval ${event.outcome}`); return;
```

`cli/interactive/toolCards.ts:38-43` 的 `note()` 只追加，卡片正文在 `finish()` 前不清空：

```ts
block.text = block.text ? `${block.text}\n${note}` : note;
```

所以 `awaiting approval` / `approval approved` 永久留在转写区。

**② 审批头无条件写 "user confirmation required"**

`core/shell/approvalPromptRenderer.ts:60-61`：

```ts
renderer.renderLine("\nApproval");
renderer.renderLine("- Mode: user confirmation required");
```

`renderApprovalRequiredSurface` 的调用方在 scope 代答时**没有区分**：即使答案来自
`session-scope`（根本没问用户），走的仍是同一个头。

**③ scope 代答仍写入 allow-once 缓存，且缓存不随范围收窄失效**（更严重）

`entrypoints/cliApprovalModule.ts:197-206`：

```ts
const scope = getPermissionScope?.() ?? "ask";
const scopeDecision = isNonInteractive ? undefined : scopeAnswer(scope, prompt);
if (scopeDecision) {
  renderApprovalRequiredSurface(renderer, { prompt, includeRisk: true,
    decisionSource: "session-scope",
    lines: [`- Session permission scope is \`${scopeLabel(scope)}\`: ${scopeMeaning(scope)}.`] });
  trustPolicy.rememberAllowOnce(evaluation.cacheKey);      // ← 即使没人回答也缓存
```

`core/shell/approvalTrustPolicy.ts:40` 的缓存是**进程级** `Set`：

```ts
private readonly allowOnceCache = new Set<string>();
```

`cli/bootstrap/cliProcessRunner.ts:60` 每进程只建一个 `new ApprovalTrustPolicy()`。
**全仓没有任何地方在范围收窄时清它**——`core/shell/sessionRuntime.ts:144-146`
的 `setPermissionScope` 只做赋值。

这直接违反 `cli/approval/permissionScope.ts:12-14` 自己写的契约：

> A scope never grants anything permanently and never widens what the sandbox allows

### 复现证据（2026-09-19 实测）

单元级：以 `scope=allow-all` + 交互 picker 调用 `createCliEscalationPromptHandler`，
输出与上面逐字一致，`decision=allow-once`。

**后果链**：同一进程内，scope=allow-all 放行一次 → 切回 `ask` → **同一条命令再次触发**：

```
--- escalation 1 while scope=allow-all ---
decision = allow-once
picker was consulted: 0 time(s)

--- escalation 2, same command, now scope=ask ---
decision = allow-once
picker was consulted: 0 time(s)  <-- 用户从未被询问
   | - Mode: cached grant
   | - Decision: allow-once (cached in current shell run)
```

即：**在 ask 范围下，一条曾被 allow-all 放行过的命令不再询问用户。**

### 决策选项

| 选项 | 含义 |
|---|---|
| 修渲染 + 修缓存 | 审批头按 `decisionSource` 分流；scope 代答不写 `rememberAllowOnce`（或在 `setPermissionScope` 时清缓存） |
| 只修缓存 | 渲染矛盾是观感问题，缓存泄漏是安全问题 |
| 只修渲染 | 承认缓存语义为"进程内已放行即不再问" |

**建议**：两项都修，且**缓存优先**。渲染矛盾会让用户误判"系统在等我回答"；
缓存泄漏会让用户在明确收窄授权后仍被绕过——后者违反文档化的授权契约，属真实性问题。

---

## PD-002 运行中输入 `/resume` 被排队，结束后绕过选择器直达非交互路径

- **状态**：`待裁决`
- **性质**：**交互行为缺陷**（输入未按当前上下文重新分发）
- **引入提交**：`c0ae9ba0`（2026-09-01，picker 闸门）、`a7418fcb`（2026-09-12，队列与排空）

### 现象

模型思考/执行期间输入 `/resume` 并回车：命令**不立即处理**，等回合结束才执行，
然后直接打印三段式页面（用户描述为"跳转到一个 resume 页面"）：

```
Resume candidates
Resumed session
Session command map
```

### 根因

**① 选择器闸门只在空闲时生效**

`cli/interactive/interactiveMode.ts:374`：

```ts
if (!this.busy && opensPicker(text)) { this.openPicker(text); return; }
```

**② 忙碌时斜杠命令进队列**

`cli/interactive/interactiveMode.ts:382-388`：

```ts
if (this.busy) {
  const input = text.startsWith("/") ? undefined : this.options.sessionRuntime.input?.();
  if (!input) this.queue.push(text);      // ← /resume 落这里
```

**③ 回合结束直接 `run(next)` 排空，不再过 ① 的闸门**

`cli/interactive/interactiveMode.ts:464-465`：

```ts
const next = retrying ?? this.queue.shift();
if (next !== undefined) void this.run(next);   // 直接进 run
```

于是 `/resume` 走**非选择器路径**，依次打印：

| 输出 | 来源 |
|---|---|
| `Resume candidates:` | `core/shell/recovery.ts:163` |
| `Resumed session …` + `Project context: …` | `core/shell/recovery.ts:270` |
| `Session command map` | `entrypoints/slashCommandRegistry.ts:118`（经 `core/shell/continueShellActionRuntime.ts:183-190`） |

**用户看到的"一个页面"是三个独立渲染器的顺序输出**，不是单一视图。

### 复现证据（2026-09-19 实测）

在真实 PTY 中先提交长任务，随后立即输入 `/resume`：回合运行期间无反应；
回合结束后三段式输出出现，顺序与用户报告一致。

### 决策选项

| 选项 | 含义 |
|---|---|
| 排空时复用分发逻辑 | 让排队的斜杠命令重新过 `opensPicker`，行为与空闲时一致 |
| 忙碌时立即处理斜杠命令 | 不再入队，直接执行（需确认不与运行中的回合冲突） |
| 明确排队语义 | 保留现状，但在 UI 上说明"命令将在回合结束后执行" |

**建议**：选项 1。排队本身是合理设计（命令不是给模型的消息），
**问题只在排空时跳过了闸门**——同一份输入，空闲走选择器、排队走文本，属分发不一致。

---

## PD-003 跨项目会话被选为恢复目标，状态栏显示别的目录

- **状态**：`待裁决`
- **性质**：**真实性问题**（产品声称的工作目录与实际不符）
- **引入提交**：`4e23f58e`（2026-05-28，评分权重）、`98d680a2`（2026-09-02，`hasConversation` 兜底）

### 现象

在 `/home/wang/projects/cheers` 下 `npm start`，状态栏显示
`/tmp/repproj` —— 一个与本次启动无关的目录。

### 根因

**① "优先项目根"在评分里被时间项彻底压过**

`session/SessionManager.ts:255-266`：

```ts
const summaries = this.listReentrySummaries({
  preferredProjectRoot: input?.preferredProjectRoot, limit: 20 });
const withContent = summaries.find((summary) => summary.hasConversation === true);
```

排序在 `session/presentation/sessionReentrySurface.ts:117-151`：

```ts
if (preferredProjectRoot === summary.projectRoot.trim()) score += 90;   // 根偏好
…
score += Math.floor(updatedAt / 1000);                                  // 时间项 ≈ 1.79e9
```

**+90 相对时间项可忽略。** 实测磁盘上那一对：

```
/tmp/repproj  (7 分钟更新)  score = 1789791236
cheers (优先根)      score = 1789790895
差 = 341 点；+90 的根奖励仅占该差距的 26%
```

**7 分钟的时间差就足以压过项目根偏好。**

**② 该候选被提升为"恢复提示"，进而接管运行上下文**

| 环节 | 位置 | 行为 |
|---|---|---|
| 取候选 | `cli/bootstrap/cliBootstrapContext.ts:88-91` | `getReentryCandidate` → `recoveryCandidate` |
| 宣传 | `core/shell/startupSurfaceRenderer.ts:150` | 打印 `- Recovery hint: /resume or --session-id <candidate>` |
| 传参 | `cli/interactive/interactiveLoop.ts:35,60,76` | 作为 `fallbackSessionId` |
| 切换 | `core/shell/recovery.ts:260-267` | `applyShellSubstrateTransition` 把 `projectRoot` 设为该会话的根 |
| 显示 | `cli/interactive/sessionFacts.ts:57` | `directory: shortenPath(context.projectRoot)` → 状态栏 |

**③ `/resume` 选择器完全不按项目过滤**

`session/sessionReadSurface.ts:122`：`listRealSessions().slice(0, limit)`，
经 `cli/interactive/picker/session.ts:51`。跨根会话是列表第一行且默认高亮。

### 复现证据（2026-09-19 实测）

从仓库根调用 `getReentryCandidate({preferredProjectRoot: <repo root>})`：

```
→ sess_8bb42358f6fe8fd3  root=/tmp/repproj      ← 落到了别的项目
```

真实 PTY 中在选择器里选中该会话后，状态栏确实切为 `/tmp/repproj`。

### 补充事实：`/tmp/repproj` 是维护者自己的调试残留，不是本轮产物

- `/tmp/render_final.txt` 记录了 `tsx src/entrypoints/cli.tsx /tmp/repproj --print --replay-file …`
- 该目录的 prompt-history 为 `/cd ~/projects`、`/cd ~`、`/workspace`
- `git log --all -S"repproj"` **零命中**——没有任何提交提过它

即：**这个目录的存在是合理的，被选为恢复目标才是缺陷。**

### 决策选项

| 选项 | 含义 |
|---|---|
| 修排序 | 根偏好加权到能压过任意时间差，或 `getReentryCandidate` 先按根过滤再选 |
| 修选择器 | `/resume` 选择器默认按当前项目过滤（可切换） |
| 只修提示 | 跨根候选不再作为 `fallbackSessionId` / 恢复提示 |

**建议**：选项 1 + 2。选项 1 治本（错的是"选中"这一步）；
选项 2 是用户直接接触的面，且当前默认高亮跨根会话会持续误导。

---

## 附：三项与最近重构轮次的关系（归因证据）

用户提问为"是不是我们这几轮导致的"。**不是。** 证据：本轮 Phase A/B（`42d63bd7..HEAD`）
对全部相关文件的改动**只有 import 路径**，逐文件 `git diff --numstat` 实测：

| 文件 | 改动 | 性质 |
|---|---|---|
| `entrypoints/cliApprovalModule.ts` | 1+/1− | `StreamingRenderer` 路径 |
| `core/shell/approvalPromptRenderer.ts` | 1+/1− | 同上 |
| `cli/interactive/interactiveMode.ts` | 3+/3− | 同上（逐行核对） |
| `cli/interactive/turnSink.ts` | 1+/1− | 同上 |
| `core/shell/recovery.ts` | 1+/1− | 同上 |
| `session/presentation/sessionReentrySurface.ts` | 1+/1− | 同上 |
| `session/SessionManager.ts` | 44+/466− | Step 5 读面抽取（`09153136`） |
| `cli/approval/permissionScope.ts` | **unchanged** | — |
| `cli/interactive/picker/registry.ts` | **unchanged** | — |

`SessionManager.ts` 那 466 行删除是读面抽取。**逐字对比 `getReentryCandidate` 前后版本**：
唯一差异是 `this.store.load` → `this.host.store.load`，**逻辑一字未改**。

三项缺陷的引入提交均早于本轮重构：

| 缺陷 | 引入提交 | 日期 |
|---|---|---|
| PD-001 | `41b83b5b` / `1cda3255` / `98d680a2` | 2026-05-01 / 09-02 / 09-02 |
| PD-002 | `c0ae9ba0` / `a7418fcb` | 2026-09-01 / 09-12 |
| PD-003 | `4e23f58e` / `98d680a2` | 2026-05-28 / 09-02 |

**三项互不相关，不是同一根因。** 这一点与 CB-005 的形态不同：
CB-005 是"多个破坏同源于一个架构缺口"，而本份三项各有独立的引入路径。

## 登记流程（供后续复用）

1. **先复现**：拿到可重复的失败输出或单元级复现，再谈归因。
2. **再定位引入提交**：`git log -S<关键符号>` / `git blame`，记入条目。
3. **最后判定是否本轮引入**：对本轮重构范围跑 `git diff --numstat <基线>..HEAD -- <文件>`；
   只改 import 路径的，判为"非本轮引入"。
4. 登记状态 `待裁决`，向维护者询问；裁决后更新为 `已批准` / `已拒绝`。
5. `已批准` → 独立立项实现，并把复现用例固化为回归测试（当前三项均已有可脚本化的复现）。
