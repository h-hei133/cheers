---
title: "后台执行：显式开关与参考的自动转后台"
category: article
sources: [repo-audit-2026-10-15, packages/ts-shell/src/core/tools/registry.ts, packages/ts-shell/src/core/tools/shell/background.ts, packages/ts-shell/src/runtime/execution/commandTimeout.ts, packages/ts-shell/src/workflow/jobs/local/*, oh-my-pi/packages/coding-agent/src/async/auto-background.ts, oh-my-pi/packages/coding-agent/src/tools/bash.ts, oh-my-pi/packages/coding-agent/src/exec/settings.ts, oh-my-pi/packages/coding-agent/src/async/job-manager.ts, 05-tools-and-execution-safety.md]
created: 2026-10-15
updated: 2026-10-30
tags: [features, tools, execution, background, gap-analysis]
summary: "Cheers 已有显式后台命令、同进程自动提升、taskWait、会话与根目录绑定、持久记录、完成通知与关闭清理。等待取消不请求停止任务；默认完成通知不创建新模型请求。完整长时、跨平台与可选模型跟进证据仍有边界。"
confidence: high
---

# 后台执行：显式开关与参考的自动转后台

历史研究源码基线 `0d30d589`；§2/§3.1 的参考快照 oh-my-pi `c2cb79e4` 保留为当时比较，不表示当前 HEAD。2026-10-30 更新目标现状：[addition20.49](phase-20-addition.md#2049-taskwait真实cli可达取消与同步完成清理)补充两模式原CLI与真实小后台进程的等待/取消/完成证据；未复跑60秒自动提升或真实provider矩阵。

> **证据更正**：本轮一个子代理报告前景默认超时为 120,000 ms、上限 300,000 ms。**实测源码与此不符**——真实值为 60,000 ms 与 2,147,483,647 ms（见 §1.2）。下文以源码为准。

## 1. Cheers 现状

### 1.1 能力已存在

`bash` 工具及[后台工具](../../packages/ts-shell/src/core/tools/shell/background.ts)暴露四个协作入口：

- `runInBackground: boolean` —— 立即返回，命令跨回合继续。
- `taskOutput(taskId, all?)` —— 读输出与状态。
- `taskWait(taskId, timeoutSeconds?)` —— 等完成事件，默认与上限300秒；工具卡片立即及每5秒显示已等待时长，取消或超时只结束等待，按当前观察报告状态。时钟不表示任务完成比例，也不轮询任务状态。
- `taskStop(taskId)` —— 按**进程组**发信号停止。

实现 `startBackgroundCommand`（[shell/background.ts:13-66](../../packages/ts-shell/src/core/tools/shell/background.ts#L13)）复用普通沙箱路径，因此后台命令**同样受沙箱与审批约束**：

```ts
const { sandbox } = planCommandLaunch(command, context)
if (sandbox.state === 'refused') { return deniedResult(...) }
const task = (context.background ?? backgroundTasks).start({ command, cwd, timeoutMs, ... })
```

会话绑定路径由 `jobsFor` 按 session id、createdAt、根目录 path/identity 持有 registry、journal 与 listener（[jobs.ts:28-58](../../packages/ts-shell/src/cli/runtime/jobs.ts#L28)）。输出由原 local journal/output owner 有界保留；兼容用的共享 registry 不能代表 CLI 的会话隔离保证。

### 1.2 前景超时（实测）

`commandTimeout.ts`：

```ts
export const DEFAULT_COMMAND_TIMEOUT_MS = 60_000;                 // 第 17 行
export const MAX_COMMAND_TIMEOUT_MS = 2_147_483_647;              // 第 20 行
```

上限之所以是 `2^31-1`，是因为 `setTimeout` 的延迟存于有符号 32 位整数——更大值会溢出并立即触发（同文件 11-14 行的注释）。超出上限**拒绝**而非钳位。

后台路径另有独立上限：会话所有的后台任务默认 300,000 ms，接受 1–300 秒（[background.ts:30-31](../../packages/ts-shell/src/core/tools/shell/background.ts#L30)）；未绑定的旧调用者拒绝显式超时。

### 1.3 同进程自动提升与等待

旧版“没有自动提升”结论已过期。`375e664e`与`dd43bcce`已实现交互式未显式timeout的同进程收养/提升：[registry](../../packages/ts-shell/src/core/tools/registry.ts)在dispatch前给native handle 300秒总期限，前景默认等60秒；普通新输入可提前提升，明确取消仍交给原handle，显式timeout保持前景路径。`adopt/promote/whenPromoted`复用[local registry](../../packages/ts-shell/src/workflow/jobs/local/registry.ts)，不启动第二个命令。

未进入提升路径的前景结果在超时后保留`status: 'timeout'`与部分输出，投影截尾为1500行/50KB并可写artifact（[registry](../../packages/ts-shell/src/core/tools/registry.ts)）。提升只释放前景等待，native总期限仍由原handle持有。清理是否成功必须看`terminationFailed`等观察，不能把请求停止当作整个进程树已被杀死。

后台完成自动通知当前交互面：`watchJobsFor`的会话绑定listener交给`InteractiveMode`，写notice并重绘；**notice不成为新用户意图，不静默发起模型请求**。模型主动等待用`taskWait`，它现与`taskOutput/taskStop`同属初始发现清单。20.49两模式分别观察1秒超时、Ctrl+C取消、同任务至少16秒等待后实际完成，三次wait监听全部释放，原进程在取消后仍活跃、全程一次dispatch。小进程等待证据不代表生产长任务或自动follow-up验收。 后续addition21.21补原60秒窗口的两模式CLI：同一PID收养后自动提升一次、账本仅一项，随后超时/取消/再等待与0/5秒可见更新、实际完成均通过；仍不代表生产长时或跨平台验收。

## 2. oh-my-pi 的自动转后台

### 2.1 阈值与钳制

[async/auto-background.ts:8-20](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/async/auto-background.ts#L8)：

```ts
export const DEFAULT_AUTO_BACKGROUND_THRESHOLD_MS = 60_000;

export function resolveAutoBackgroundWaitMs(thresholdMs: number, timeoutMs: number | undefined): number {
  if (thresholdMs <= 0) return 0;
  if (timeoutMs === undefined) return thresholdMs;
  const timeoutBufferMs = 1_000;
  return Math.max(0, Math.min(thresholdMs, timeoutMs - timeoutBufferMs));
}
```

要点：前景等待阈值默认 **60 秒**，实际等待为 `min(threshold, timeout - 1s)`，下界 0。例如原 timeout 为 60 秒时约 59 秒返回后台句柄，**原命令仍会在约 60 秒到期**；这不是把总执行期限延长为后台默认 300 秒。1 秒只是参考选择的等待间隔，不证明竞态或清理已被排除；`0` 表示立即后台。

### 2.2 三种中断竞速

`raceJobSettlement`（[auto-background.ts:24-70](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/async/auto-background.ts#L24)）把「作业完成」与三类信号做 `Promise.race`：

| 结果 | 含义 |
|---|---|
| 完成值 | 命令在阈值内结束，按普通前景结果返回 |
| `{ kind: "running" }` | 阈值到 → 转后台 |
| `{ kind: "steer" }` | 用户/同伴消息到达 → 提前转后台，让消息立刻注入 |
| `{ kind: "aborted" }` | 调用方取消 → 取消作业 |

`steer` 这一路特别值得注意：它把「用户想说话」也当作转后台的理由，注释明写 *"Backgrounded early to handle an incoming message; the command keeps running."*（[bash.ts:1216-1220](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/tools/bash.ts#L1216)）。

实现细节：阈值定时器用 `Promise.withResolvers` + `setTimeout` 并在 `finally` 里 `clearTimeout`，避免作业提前结束却留下一个 ref'd 定时器拖慢进程退出（同文件 47-52 行注释）。**注**：`Promise.withResolvers` 需要 Node ≥ 22；Cheers 的 `engines.node` 下限较低，`check:node-floor` 门禁会拦住直接照搬。

### 2.3 前景占位 → 提升握手

[bash.ts:1150-1225](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/tools/bash.ts#L1150)：

1. 以 `foreground: true` 启动作业——**对列表隐藏、交付抑制**。
2. 竞速等待。
3. 若在阈值内完成 → `releaseForegroundJob(jobId)` 丢弃占位，返回普通结果。**不会**在 UI 上闪现一个后台任务。
4. 否则 → `job.background()` + `autoBgManager.backgroundJob(jobId)`，正式提升。

这是同一 managed job 的可见性与等待方式改变，**不是先杀前景再启动一次后台命令**。应区分 foreground-wait 阈值与命令的总执行 deadline。

### 2.4 容量兜底

`DEFAULT_MAX_RUNNING_JOBS = 15`（[async/job-manager.ts:50](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/async/job-manager.ts#L50)）。达到上限时**回退为直接前景执行**，而不是让每个 bash 调用都失败（[bash.ts:1160-1164](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/tools/bash.ts#L1160)）。

配置项 `bash.autoBackground.enabled` 默认 `true`（[exec/settings.ts:110-118](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/exec/settings.ts#L110)）。

### 2.5 与终端路由的互斥

当客户端提供真实终端卡片时，自动转后台**让位**——注释说明二者都是 opt-in，自动转后台会静默禁用终端路径（[bash.ts:1152-1158](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/tools/bash.ts#L1152)）。这是一条容易被忽略的互斥规则。

## 3. 差距表

**（2026-10-15 补证）** §3.1 与 §3.2 为 [32](32-defect-register-2026-10.md) R-05 要求的取证：初稿的「结果交付」一行当时**未读代码**。

### 3.1 omp 的结果投递（已取证）

（[async-job-delivery.ts:1-9](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/session/async-job-delivery.ts#L1)）

> Owner-routed async job delivery: formatting and batch-message assembly for `async-result` follow-ups.
>
> Each `AgentSession` registers a delivery sink for its own agent id (`AsyncJobManager.registerDeliverySink`) and enqueues formatted entries on its yield queue; the queue's idle flush injects them as a follow-up turn. This replaces the old single hardwired `onJobComplete` closure that routed every completion — regardless of owner — into the first top-level session.

三点可迁移：

1. **按 owner 路由**：每个会话注册自己的 sink，作业结果回到**发起它的会话**，而非第一个顶层会话。
2. **经 yield 队列的空闲 flush 注入**，作为 follow-up turn。
3. **generation 失效**（同文件 40-48 行）：会话切换（`/new`、switch、handoff）会 bump generation，generation 不匹配的条目**在 flush 时丢弃**——即使 job id 已被复用。

### 3.2 结果体积的三个常量（初稿未记录）

（[async-job-delivery.ts:27-35](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/session/async-job-delivery.ts#L27)）

```ts
/** Result payloads longer than this spill to an artifact with an inline preview. */
export const ASYNC_INLINE_RESULT_MAX_CHARS = 12_000;
export const ASYNC_PREVIEW_MAX_CHARS = 4_000;
/** Tail share of the preview when the link points at a raw capture: tools append
 *  notices (wall time, exit code, timeout) after the captured stream. */
export const ASYNC_PREVIEW_TAIL_CHARS = 1_000;
```

即：>12,000 字符溢出到 artifact + 内联预览；预览上限 4,000，其中尾部保留 1,000（因为工具会在流末追加 wall time/exit code/timeout 通知）。

**Cheers 对照**：模型读取详细结果使用 `taskOutput`；会话绑定的完成 notice 已自动投递 UI。`jobsFor` 对 session/root identity 变化关闭旧 host，并只向仍为当前 host 的 listener 投递（[jobs.ts:29-58](../../packages/ts-shell/src/cli/runtime/jobs.ts#L29)）；`jobAdmission` 还检查配置、协作、权限 gate、goal revision 与会话/目录是否失效（[authority.ts:8-24](../../packages/ts-shell/src/cli/jobs/authority.ts#L8)）。其实现不以 `generation` 命名，但已经有同类所有权与失效控制。参考的 generation 主要适用于尚未 flush 的模型 follow-up 队列，不能据此重建第二套任务系统。

### 3.3 差距表

| 维度 | Cheers | oh-my-pi | 取证 |
|---|---|---|---|
| 结果交付 | UI完成notice；模型详情经`taskOutput`或事件式`taskWait` | 结算后可作为 follow-up 投递 | §1.3/§3.1 |
| 交付所有权 | session/root identity 绑定与当前 host 检查 | owner-routed，回到发起会话 | §3.1/§3.2 |
| 会话切换后的旧结果 | 旧 host 关闭，旧 listener 不投当前会话 | generation 不匹配即丢弃排队条目 | §3.1/§3.2 |
| 体积策略 | 前景 1500 行 / 50 KB 投影；后台 live sink 64 KiB 与 journal/artifact owner | 12,000 字符溢出 + 4,000 预览（尾 1,000） | §3.2 |

**判定**：Cheers具备显式启动、读取、等待、停止、同进程提升、沙箱、持久记录和有归属的UI通知。20.49补充原CLI真实小进程的wait超时/取消/完成；完整长时生命周期、容量、所有宿主与可选模型follow-up仍未动态验收。

## 4. 待定决策点

| # | 决策 | 选项 |
|---|---|---|
| B-01 | 自动转后台的默认策略 | **用户已裁决（2026-10-17）**：交互式默认提升同一进程；非交互保持显式。显式前景/后台选择优先 |
| B-02 | 前景等待阈值 | **用户已裁决**：交互式默认 60 秒；技术设计须与总 deadline 分开，保留显式 timeout 且不在提升时重置 |
| B-03 | 消息触发与取消 | **用户已裁决（2026-10-17）**：普通新消息可提前提升同一进程；明确取消仍停止，不得伪装提升 |
| B-04 | 模型自动 follow-up | **用户已裁决（2026-10-17）**：默认UI通知；模型follow-up显式开启，受原会话/请求预算/空闲调度控制 |
| B-05 | 容量上限与回退 | 技术建议：有界任务/输出/交付队列；满载在启动前回退前景或明确拒绝，不能双重启动；数值待负载证据 |
| B-06 | 与真实终端路径的互斥 | 技术建议：显式 PTY/客户端终端优先，不能悄然丢失终端卡片 |
| B-07 | Node 下限 | 技术建议：使用现有 Node floor 可用的 Promise 构造，**不为此提高 engines.node** |

## 5. 未验证项

- 20.49实测同CLI跨turn与取消wait后仍存活、最后完成并正常退出；未覆盖进程退出时仍运行的长任务、完整平台或daemon存活合同。
- 源码复核：`TaskRegistry` 的 legacy 完成历史保留最近 100 项，live sink 为 64 KiB；这不等于运行任务数或 durable journal 的全局容量上限（[registry.ts:47-48,112-119](../../packages/ts-shell/src/workflow/jobs/local/registry.ts#L47)）。容量仍需端到端审计。
- 未验证 omp 的「自动投递」在无 TUI 客户端时的行为。
- 未测自动转后台对模型 token 预算的实际影响。

## 6. 生产设计与反例验收

1. **复用执行 owner，提升现有进程。** 在唯一 `runtime/execution` 路径建立 foreground-backed handle，原审批、sandbox launch、cwd/env、输出 sink、deadline 与 settlement 只有一份。提升只是把 handle 交给会话 job owner 并返回任务引用。不能超时后重新执行命令；测试用一次性副作用证明 spawn 计数始终 1，提升前后 PID/operation identity 与输出顺序连续。
2. **所有权在 dispatch 前捕获。** 绑定 session id/createdAt、root identity、配置 publication、goal/control revision、工具审批证据；在提升、停止、读取和交付时重核。复用 journal dispatch fence，不把 `TOOL_APPROVED_COMMAND_AUTHORITY` 当作任何调用者可自授的权限。新授权范围不得因后台继续执行扩大；失效/撤销由原 owner 取消并观察 settlement。
3. **竞态有唯一结果。** 同步完成、阈值、消息和取消同时到达时只能返回一个结果、生成一个任务和一条完成交付。取消不变成 `{running}`；提升与完成竞争时保留最终事实。清除 timers/listeners，停止请求与实际 killed/timeout/failed/unknown 分开；清理超时或 artifact 发布失败保持 unknown。
4. **总期限连续。** foreground-wait 到期不重置 command deadline；用户选择的 60 秒提升阈值不是延长期限的授权。当前缺省 command timeout 同为 60 秒，与默认提升目标冲突：实现必须在 dispatch 前解析「未显式指定 timeout 的交互自动提升路径」的有界总期限并在 schema/help 中说明；可复用现有后台缺省 300 秒作为技术方案，显式 timeout 始终原样保留，更短则先按 timeout 结算。不能运行到第 60 秒才取消/重启，或悄悄忽略显式 deadline。`bash.timeout` 单位/上下限与后台 1–300 秒规则须一起迁移，保证更长显式前景任务仍由原执行 handle 所有，不能因提升而被后台旧校验拒绝或钳短。
5. **交付与模型调用分层。** 默认完成 notice 不创建用户消息。可选模型 follow-up 使用原会话、job id、delivery epoch、已交付标记与有界队列，空闲时批量 flush；同一完成不重复计费。会话切换后的条目不注入新会话；原 journal 仍保留结果而非直接删除证据。输出先经 redaction/终端安全投影，超过预算提供 artifact 引用。
6. **退出与恢复。** 当前绑定 registry 的 `close` 取消 live operations 并等待 settlement（[registry.ts:84-88](../../packages/ts-shell/src/workflow/jobs/local/registry.ts#L84)），host 切换/进程 shutdown 走 `closeJobsFor`。跨 turn 存活不等于跨 Cheers 退出存活。若需要退出后继续，属于独立 daemon 产品方向；本方案不暗示已有该保证。重启只恢复 journal 事实，不凭持久 PID 杀进程或重放副作用。print/JSON/RPC 必须有明确输出与退出合同，不能依靠进程句柄意外把宿主挂住。
7. **反转验收。** 同进程一次执行、权限撤销、同时完成/取消/提升、满容量、输出落盘失败、会话/根目录变化、宿主断开、退出清理超时、恢复 unknown、重复交付、缺 usage 与请求预算耗尽各有场景。把重启命令、跨会话投递、取消变提升或未证实清理变成功的实现反转后，测试必须失败。
