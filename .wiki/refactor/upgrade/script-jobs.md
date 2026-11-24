# 脚本后台生命周期核验

**日期**：2026-11-24
**范围**：核实 Batch 2 的 B2.7 是否可在现有本地 job owner 内实现，不启动实际 shell 命令，也不引入另一个任务调度器。

## 结论

当前 job owner 不能接管在途脚本 worker。`TaskRegistry.adopt` 只接收由本地执行器启动的 `LocalExecutionHandle`，依赖真实 PID、进程输出流和 `CommandExecutionResult`。脚本运行于 worker thread，不能交给这个入口。把脚本源代码改写成一个后台 shell 命令则会新建一次进程执行，重跑已有前缀、丢失当前 worker 内存和变量，并可能重复内部工具副作用。

继续使用原 worker 也不满足现有持久合同。CLI 主流程关闭时调用 `closeJobsFor`，其默认路径会关闭 `TaskRegistry`。该 registry 会终止每个仍在运行的 handle 并等待结算。脚本 worker 没有 job journal 行、可持久重连的控制句柄或由 registry 管理的终态，所以即使只放开该关闭路径，终端进程退出也会丢失控制面。

B2.7 中的长脚本后台晋升暂缓为独立生命周期设计。普通前台 shell 仍可复用既有本地 job 支持。这里的判断不妨碍 B2.7 已实现的字面量 shell 模板，它继续通过同一回合的普通 bash 工具门控执行。

## 已核验的所有权

- 本地 job journal 保留命令、工作目录身份、session scope、来源、期限、两路有界输出和进程 exit code。调用前先持久化 dispatch tombstone。恢复时不可重放已派发但未结算的工作。
- 现有原进程晋升先由 `ExecutionService.startCommand` 创建原生进程，再由 `TaskRegistry.adopt` 接收其 handle 和 capture。journal 晋升及 admission 检查成功后才把结果交还前台。它没有接受通用 task callback 或 Node worker 的入口。
- 脚本 worker 的 RPC 每次把一个内部工具交给当前 turn 的 `executeNestedTool`。该门控持有父调用 ID、原始注册表、权限 scope、prepared selection、审批 handler、hook dispatcher、abort signal、变更回执和当前 session。执行中的 worker 关闭会取消并等待已准入的 nested RPC，然后把 nested receipt 与脚本结果一起持久化为父 tool result。
- approval 只授权当前绑定的 nested 调用。patch 还要求用户选择分组并提交准确的 preview revision。job 使用先前已批准的脚本快照或预先审批命令，无法证明后续动态生成的调用仍满足这些条件。
- CLI 非交互审批没有后续答复通道。每个具体 nested 调用默认拒绝。保持 allow-once 语义就必须把脚本暂停并与仍在工作的前台 run 绑定，不能交还 turn 后再伪装为已批准任务。
- lifecycle 结算把调用结果与当前 `sourceEntryId` 绑定，session/job journal 要求 session scope 和 workspace identity 仍匹配。父 turn 结束时 worker 和待处理调用会停止。仅把它登记为本地命令会丢失 nested approval、操作 receipt 和父结果的来源关系。

## 反例

1. 对包含读后写逻辑的脚本，在首次读完成后关闭 CLI。worker 没有可由 `TaskRegistry` 接收的 PID 或 native handle，现有 shutdown 会杀死正在运行的可接管命令，而没有脚本 job receipt 或后续控制句柄。
2. 将脚本交给 agent job 再运行。agent owner 创建独立 session 并启动新的模型回合。它不是原 worker 的续行，不能恢复局部变量或准确 PC，且先前 nested 调用可能重新执行。
3. 把脚本剩余代码写进 `BackgroundInput.command`。这会改变执行语义和 shell 解析边界，无法原子继承已执行前缀的 effect receipt、当前 approval、code mode store branch lease、writer/hook admission 或 API 提供者结果。派发后因权限撤销杀死 shell 进程也不能确认其已写入的工具副作用。
4. 预先批准脚本期间将要调用的工具。分支、循环和模型返回值决定实际参数，因此批准集合无法绑定每次实际的 call ID 和 prepared write。对 patch 还无法预先绑定最后选择的分组与预览 revision。

## 重新打开实现前需要的合同

一个 job 需要在进入可见后台状态前，原子保留源 session、prompt entry、父 tool call、workspace identity、配置 generation、注册表 generation、脚本内容摘要、运行时/worker 协议版本、branch-store revision 和当前脚本 checkpoint。它需要保证调用前缀只执行一次，并在不重放任何已知或未知副作用的条件下继续。

job owner 还需要持久或可重连的 worker controller，带确认状态的 cancel/settlement 协议，脚本输出预算及 artifact 所有权，有界的 nested result 与审批事件流，以及在 session 重开后的恢复规则。父结果必须能精确完成原 tool call，或记录明确的 unknown 和实际副作用证据。审批准许不得从父 turn 的 allow-always 或缓存授权推演出来。每次继续执行都须重新验证 scope、配置、工具目录、hooks、文件 selection 与 revision，并按普通权限路径重新批准。

若 terminal process 结束、runtime owner 关闭、session/workspace/profile 被切换或 nested permission 无法交互，owner 必须有界取消 worker、等待已准入操作 settle、投影实际副作用和 unknown 状态，并禁止从原始代码重新开始。job journal digest、解码验证、容量、输出加密/保留和服务关闭 drain 必须覆盖脚本 checkpoint 与回执。

这些要求增加了新的持久工作种类、恢复状态与 UI 交互。当前 `LocalJob` schema 只有 native 命令字段，`AgentJob` schema 则定义为一个新的模型回合，现有本地 runner 没有可移交的 worker-owner 通道。因此这不是为 Batch 2 安全补丁增加一个 `TaskRegistry` adapter 就能满足的范围。

## 初始实现边界

此节记录初始核验结论，后续实现见下一节。在生命周期合同确定前，不自动晋升运行中的脚本，也不在关闭时留下脱离 owner 的 worker。可以继续使用脚本内 `$` shell tag 调用普通 gated `bash`，使每条命令保持当前回合的权限、超时和取消路径。长任务必须通过已存在且明确支持 native shell command 的本地 job 入口显式启动。

## 后续实现结论（2026-11-24）

B2.7 的范围重新拆成 shell tag 中的长原生命令与 JavaScript worker 本身。前者能够在不改变执行 owner 的情况下复用原生 job 晋升，后者仍受以上父 tool、store commit 和 nested RPC 结算合同约束。

- `NestedToolCallRunner.shell()` 不再显式传默认 `timeout`，因此普通 Bash owner 可把同一 foreground PID 先交给 `TaskRegistry.adopt()`，等待 5 秒后沿原 `LocalJournal.promote()` 晋升。不调用第二次 spawn，不扩展持久 job 类型或新增 scheduler。
- 晋升的 nested result 保留 `backgroundJobId`，并标记 shell 输出不完整。脚本仍能看到明确的后台 job 提示，`.json()` 拒绝解析尚未产生的命令输出；用户可通过同 session jobs 工具读取或停止该命令。
- 不将 JS worker 从父 tool/turn 解绑。无论参考方案如何组织自己的 job owner，worker 程序计数器、局部变量、后续 nested approval 与父 tool receipt 都没有当前 Cheers job journal 可重连的持久合同。worker 退出后禁止从代码起点重跑。
- B3.5 使用同一个 Bash 晋升 owner，前台等待时间独立为 5 秒；60 秒无显式 timeout 的执行上限与晋升后 300 秒 lease 不变。主会话输入事件仍立即促使现有 `promoteForeground()`，无需增加另一并发槽。
- Linux 聚焦回归及编译产物 build 证据记在 [`roadmap-tasks.md`](roadmap-tasks.md#shell-job-晋升收尾2026-11-24)。
