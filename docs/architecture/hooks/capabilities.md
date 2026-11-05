# Cheers 宿主能力矩阵

原 C0 观测基点：`0057eb604ecc8d154ce691794b494c354e89755b`，2026-11-05，Linux x64 / Node `v24.15.0`。原六个合成探针见 [探针记录](probes.md)、[机器记录](results.json) 与 [执行记录](execution.md)。下列新增表记录 C1 的能力变化；后面的 C0 表保留历史观测，凡有差异以新增表及 [翻译契约](translation.md) 为当前实现。Stop 仍未实现 completion enforcement。

## 翻译适配器后的能力变化

所有行仍受声明批准、workspace/准入检查和普通 permission 约束。实际输出及命令见
[翻译执行记录](translation-execution.md)。新能力只在明确配置 `writeGate` 后生效；
PreToolUse nested deny 的 flat 归一化同时适用于普通 command 和 in-process hook。

| 事件/工具 | C0 | C1 当前能力 | 依据/限制 |
| --- | --- | --- | --- |
| PreToolUse write/path+content | 可阻断但缺翻译 | 可判，canonical Write；nested deny 阻断 native write | 原生 tool gate + 实际 artifact 正反例；普通权限独立 |
| PreToolUse edit/path+content | 待翻译 | 可判，canonical Edit | 完整单文件替换；局部或混合参数仍 unsupported |
| MultiEdit / NotebookEdit | 无形状合同 | unsupported，分别为 multiple_edits / notebook_cells | 单项、多项都无已验证的完整文件投影 |
| apply_patch | 拟议 adapter unsupported | unsupported / patch_targets | 已有 parsePatch 可取路径；一个 patch 可含多个目标，内容规则逐文件；尚未实现逐文件归一化 |
| bash / native Git | 无最终文件效果 | unsupported / shell_effects | 其他 native flat hook 仍能拒绝 shell 调用 |
| MCP / browser / desktop | 无通用副作用映射 | unsupported / tool_semantics 或 external_effects | 不宣传外部写保护 |
| malformed / timeout / version | 原生 command failure | adapter block + unknown 原因码 | 原因及诊断不含 payload/堆栈；空 stdout 和不可解析非零也阻断 |
| could_not_decide | 原 wire allow，宿主可继续 | 翻译 unknown → Cheers policy block | 保留 hook 来源与 policy:block；不成为 allow/proven |
| normal / prepared / security | 原生 flat 已接入 | 两条注册路径共用翻译，实际 artifact block | 4 个路径测试含 native Git；不改变普通 permission |
| Node 20.3.0 | 未验证 | 适配器与独立 pinned artifact 实测 allow/block | Linux x64，46 项测试；旧 Node ≥24 judge bundle 不变 |
| timeout/re-entry | JSON timeout 丢弃/无重入 | writeGate 的 timeoutMs 保留并纳入指纹；无重入明确记录 | 普通 command 声明的旧 timeout 行为不变；Stop 不变 |

## C0 历史观测（以下表格不含 C1 更新）

依据：只读的 `/home/wang/projects/normproof/.wiki/features/phase-1-decisions.md`，C0（1793–1810）、P1-C7/C8（1613–1635）、P1-C17/C18（1893–1904）、P1-C23/C24（1971–1983）。**实测修正附件的一处前提：两条注册路径的 dispatcher 独立，不等于持久批准记录独立。**同一 home/profile 和相同 fingerprint 时，两条路径读取同一信任文件；`allow-once` 不持久化，`allow-always` 可跨路径复用。

## 读表约定

- `unknown` 表示证据缺失，`unsupported` 表示当前映射/协议没有该语义。两者都不是 `allow`。记录中的 `decision: "allow"` 仅是宿主实际返回值，不能当成 NormProof clean/proven verdict 或用户写授权。
- **I**：已进入对应调用点，且 hook 已加载、事件/matcher 匹配、信任/工作区/准入仍有效，才会运行。普通 permission/preparation/closing 等前置拒绝可能令 PreToolUse 根本不派发；无配置、未批准、错误工作区、旧注册快照均不保证命令启动。来源：[注册](../../../packages/ts-shell/src/core/hooks/registration.ts#L71)、[信任门](../../../packages/ts-shell/src/core/hooks/hookDispatcher.ts#L98)、[调用顺序](../../../packages/ts-shell/src/turn/tools.ts#L296)、[closing 限制](../../../packages/ts-shell/src/core/agent/loop.ts#L354)。
- **T15 / T3**：每个 command hook 分别为 `15,000 ms` / `3,000 ms`。内部 `timeoutMs` 可覆盖；hooks.json 中 `timeout` 和 `timeoutMs` 均丢弃。不是整次 dispatch 总预算；hook 顺序执行，审批等待和 in-process handler 无此计时器。来源：[默认预算](../../../packages/ts-shell/src/core/hooks/hookDispatcher.ts#L64)、[handler/命令循环](../../../packages/ts-shell/src/core/hooks/hookDispatcher.ts#L208)、[execFile](../../../packages/ts-shell/src/core/hooks/hookDispatcher.ts#L245)。
- **Fpre**：command 的超时、无效 JSON、非零退出在 PreToolUse 返回 block；**Fother**：其他事件一般 command failure 记录后继续；两类均将带非空 stderr 的 exit 2 转为 block。sandbox refusal 也返回 block，但能否阻断仍由消费者决定。**所有事件的 in-process handler 异常均被捕获后继续。**空 stdout、未匹配、未获 hook 批准可能最终返回 allow，不证明检查成功。来源：[dispatcher](../../../packages/ts-shell/src/core/hooks/hookDispatcher.ts#L208)、[失败分支](../../../packages/ts-shell/src/core/hooks/hookDispatcher.ts#L334)，探针 `pretooluse-flat-block` / `stop-dispatch-result-discard`。
- **B**：`eventName/sessionId/workspaceRoot/timestamp`（可选 `agentId/agentType`）。命令 stdin 是原 payload 的 `JSON.stringify`，没有 canonical version、`cwd/tool_name/tool_input` 翻译。in-process handler 接收对象本身；不能宣传冻结/不可变输入。来源：[类型](../../../packages/ts-shell/src/core/hooks/types.ts#L34)、[命令序列化](../../../packages/ts-shell/src/core/hooks/hookDispatcher.ts#L246)。
- **无独立 CI authority**：该 hook 本身不能保证 CI 被调用或令 CI 失败；工作流的 authority 另列。**无受控重入**：这些调用点没有携带 hook attempt identity 的宿主重试协议；普通后续模型轮次或人工再操作不是该协议。

## 事件矩阵

覆盖白名单全部 18 个事件。未动态覆盖的事件明确使用源码证据，不把 `check:declarations` 的调用点计数当作行为测试。

| 事件 | invocation guarantee | timeout 单位与预算 | input fidelity | deny semantics | failure direction | re-entry support | independent CI authority | 来源 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SessionStart | I；runTurn 启动时 | T15 | B + resumed | flat block/retry 拒绝 prompt admission | Fother；一般失败不自动拒绝 | 无受控重入 | 无 | [session.ts:261](../../../packages/ts-shell/src/turn/session.ts#L261) |
| SessionEnd | I；drive finally 收尾 | T3 | B + turnsExecuted | 返回值忽略 | Fother；外层也捕获 rejection | 无 | 无 | [session.ts:398](../../../packages/ts-shell/src/turn/session.ts#L398) |
| UserPromptSubmit | I；SessionStart 接纳后且未取消 | T15 | B + prompt | flat block/retry 拒绝 prompt admission | Fother | 无受控重入 | 无 | [session.ts:271](../../../packages/ts-shell/src/turn/session.ts#L271) |
| PreToolUse | I；普通准备、权限和 scope 检查后 | T15 | B + toolName/toolCallId/args | flat block/retry 阻断；nested deny 不阻断；ask/defer 不被该消费者处理 | Fpre；未批准 hook 是跳过，不是工具 deny | retry 转 block+原因，不自动重入 | 无 | [tools.ts:296](../../../packages/ts-shell/src/turn/tools.ts#L296)，探针 `pretooluse-nested-deny` / `pretooluse-flat-block` |
| PostToolUse | I；工具成功结果进入 afterToolCall | T15 | B + toolName/toolCallId/args/output/success | 只消费 feedback；block 无回滚能力 | Fother | 无受控重入 | 无 | [tools.ts:360](../../../packages/ts-shell/src/turn/tools.ts#L360) |
| PostToolUseFailure | I；工具错误结果进入 afterToolCall | T15 | B + toolName/toolCallId/args/error | 只消费 feedback，不重试工具 | Fother | 无受控重入 | 无 | [tools.ts:369](../../../packages/ts-shell/src/turn/tools.ts#L369) |
| PermissionRequest | I；确需 escalation 且有 handler 时 | T15 | B + toolName/toolCallId/args | dispatch 返回值忽略；实际批准来自普通 permission handler | Fother | 无 | 无 | [tools.ts:460](../../../packages/ts-shell/src/turn/tools.ts#L460) |
| PermissionDenied | I；规则 deny，或适用的 escalation 被拒绝 | T15 | B + toolName/toolCallId/args/reason | 返回值忽略，不能把已拒绝改成批准 | Fother | 无 | 无 | [tools.ts:441](../../../packages/ts-shell/src/turn/tools.ts#L441)、[tools.ts:505](../../../packages/ts-shell/src/turn/tools.ts#L505) |
| PreModelSwitch | I；普通选择使用 default dispatcher；handoff 使用 host dispatcher | T15 | B + fromModel/toModel | 普通选择只拒绝 block；handoff 拒绝 block/retry | Fother | 无受控重入 | 无 | [selection.ts:188](../../../packages/ts-shell/src/core/commands/model/selection.ts#L188)、[handoff/runtime.ts:97](../../../packages/ts-shell/src/cli/handoff/runtime.ts#L97) |
| PostModelSwitch | I；普通选择成功路径/适用 handoff | T15 | B + fromModel/toModel | 普通选择忽略；handoff 消费 block/retry 抛错，不能据此宣称回滚已保存状态 | Fother | 无受控重入 | 无 | [selection.ts:283](../../../packages/ts-shell/src/core/commands/model/selection.ts#L283)、[handoff/runtime.ts:100](../../../packages/ts-shell/src/cli/handoff/runtime.ts#L100) |
| PreCompact | I；调用 compaction lifecycle.before | T15 | B + reason/tokensBefore/messageCount；没有完整待判断内容 | 只消费 block，retry 不阻断 | Fother | 无受控重入 | 无 | [compaction.ts:42](../../../packages/ts-shell/src/core/shell/compaction.ts#L42) |
| PostCompact | I；调用 lifecycle.after | T15 | B + reason/summary/keptMessages/tokensBefore | 返回值忽略 | Fother | 无 | 无 | [compaction.ts:54](../../../packages/ts-shell/src/core/shell/compaction.ts#L54) |
| SubagentStart | I；存在 runner 的 task 路径，default dispatcher | T15 | B + agentId/agentType | 返回值忽略；后续另检查 role admission | Fother | 无 hook 重入协议 | 无 | [taskTool.ts:96](../../../packages/ts-shell/src/core/tools/taskTool.ts#L96) |
| SubagentStop | I；startAttempted 的 finally | T15 | B + agentId/agentType | 返回值忽略；dispatch 抛出时记失败 | Fother | 无 | 无 | [taskTool.ts:163](../../../packages/ts-shell/src/core/tools/taskTool.ts#L163) |
| WorktreeCreate | I；隔离 worktree 分配成功后 | T15 | B + subtaskId/worktreePath/branch | 返回值忽略，不能撤销已分配 worktree | Fother | 无 | 无 | [taskTool.ts:108](../../../packages/ts-shell/src/core/tools/taskTool.ts#L108) |
| WorktreeRemove | I；release 确认 worktree 已移除后 | T15 | B + subtaskId/worktreePath | 返回值忽略 | Fother | 无 | 无 | [taskTool.ts:148](../../../packages/ts-shell/src/core/tools/taskTool.ts#L148) |
| Stop | I；conclude 的非 failed 分支 | T3 | B + turnsExecuted/finalOutput；没有 stop_hook_active/attempt | 返回值丢弃，随后发 outcome.completed | Fother；block/exit-2 也不能阻断完成 | 无；探针始终 1 个 step | 无 | [session.ts:363](../../../packages/ts-shell/src/turn/session.ts#L363)，探针 `stop-dispatch-result-discard` |
| StopFailure | I；concludeRun 返回 failed 时；不覆盖所有 drive 异常 | T3 | B + turnsExecuted/error | 返回值忽略，随后 query.failed | Fother | 无 | 无 | [session.ts:363](../../../packages/ts-shell/src/turn/session.ts#L363)、[session.ts:393](../../../packages/ts-shell/src/turn/session.ts#L393) |
| 未知事件（探针 TaskCompleted） | 白名单前置过滤；从未被 dispatch | 不适用；未启动命令 | declaration 丢弃，problems 报未知事件 | unsupported；没有 dispatch verdict | 配置拒收，不能记为 allow | 不支持 | 无 | [config.ts:134](../../../packages/ts-shell/src/core/hooks/config.ts#L134)，探针 `unknown-event-registration` |

## 工具及外部 authority 矩阵

这里的 native block 能力不等于已具有 NormProof 翻译器。探针使用真实 gate/consumer 和合成 prepared 目标的 effect counter，没有执行产品 write/edit 的文件写入。动态工具族按同一消费协议列一行；未逐个运行 MCP、browser、desktop 适配器。

| 事件/工具或能力边界 | invocation guarantee | timeout 单位与预算 | input fidelity | deny semantics | failure direction | re-entry support | independent CI authority | 来源 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PreToolUse / write | I；normal + prepared 已实测 | T15 | args.path + args.content；原始字符串，不是统一绝对路径/内容快照协议 | native flat 可阻断；nested deny 未翻译 | Fpre | 无受控重入 | 无 | [registry.ts:261](../../../packages/ts-shell/src/core/tools/registry.ts#L261)，探针 1/2/6 |
| PreToolUse / edit | I；源码消费同一 gate，未单独运行 edit | T15 | path+content 模式可作将来翻译输入；edits/oldText/newText 模式不是完整 replacement | native flat 可阻断；不能宣传所有 edit 输入都能判定 | Fpre | 无受控重入 | 无 | [registry.ts:337](../../../packages/ts-shell/src/core/tools/registry.ts#L337)、[tools.ts:311](../../../packages/ts-shell/src/turn/tools.ts#L311) |
| PreToolUse / apply_patch | I；准备和精确选择后才可到达 | T15 | args.input 为 patch text，可选 expectedHashes；没有统一单文件 path+content | native flat 可阻断；C1 拟议 path+content adapter unsupported | Fpre | 无受控重入 | 无 | [patch/tool.ts:15](../../../packages/ts-shell/src/edit/patch/tool.ts#L15)、[tools.ts:305](../../../packages/ts-shell/src/turn/tools.ts#L305) |
| PreToolUse / bash | I；native Git 同样用 bash 名称，已实测拒绝 | T15 | command 等参数；不是最终文件效果 | native flat 可阻断调用；NormProof 全部副作用判断 unsupported | Fpre | 无受控重入 | 无 | [registry.ts:524](../../../packages/ts-shell/src/core/tools/registry.ts#L524)、[git/operation/tool.ts:9](../../../packages/ts-shell/src/workflow/git/operation/tool.ts#L9)，探针 6 |
| PreToolUse / MCP tools | I 仅对经 tool gate 的已注册调用；模型是否调用 unknown | T15（hook，不是 MCP RPC 总预算） | qualifiedName + server schema args，无通用 mutation 快照 | native flat gate 存在；逐 server 的副作用映射 unsupported | Fpre 对 hook；RPC 失败另属 MCP | 无 hook 重入协议 | 无；可选 query 不能强制最终判断 | [registry.ts:571](../../../packages/ts-shell/src/core/tools/registry.ts#L571)、[tools.ts:311](../../../packages/ts-shell/src/turn/tools.ts#L311) |
| PreToolUse / browser | I 对经 tool gate 的 browser 调用；外部效果覆盖 unknown | T15（hook） | browser action args，非 path+content | native flat gate 存在；副作用 adapter unsupported | Fpre 对 hook | 无 hook 重入协议 | 无 | [browser/tool/definition.ts:19](../../../packages/ts-shell/src/browser/tool/definition.ts#L19)、[tools.ts:311](../../../packages/ts-shell/src/turn/tools.ts#L311) |
| PreToolUse / desktop | I 对经 tool gate 的 desktop 调用；外部效果覆盖 unknown | T15（hook） | desktop action args，非 path+content | native flat gate 存在；副作用 adapter unsupported | Fpre 对 hook | 无 hook 重入协议 | 无 | [desktop/tool.ts:12](../../../packages/ts-shell/src/desktop/tool.ts#L12)、[tools.ts:311](../../../packages/ts-shell/src/turn/tools.ts#L311) |
| 未知工具 | 是否注册、是否可到达该 gate：unknown | 到达时 T15；否则不适用 | unknown | unsupported/unknown，不是 allow | unknown | unknown | 无已证据 authority | [tools.ts:123](../../../packages/ts-shell/src/turn/tools.ts#L123)，C0 冻结范围未包含其他工具语义 |
| Stop / timeout | 运行中的 command 才受预算 | 默认 3,000 ms；实测 3,008 ms 整轮耗时，timedOut=true | 同 Stop payload | 超时后 dispatch 为 allow；消费者仍 completed | 不阻断完成，不是检查通过 | 此行只度量超时 | 无 | [hookDispatcher.ts:64](../../../packages/ts-shell/src/core/hooks/hookDispatcher.ts#L64)，探针 3 |
| Stop / no re-entry | Stop 返回后直接 channel.push | 与 3 秒预算独立 | 没有 attempt/stop_hook_active | flat block/retry 不改变本轮 completed | 无 repair 状态转换 | 不支持；5 个 Stop 子例均 1 step | 无 | [session.ts:381](../../../packages/ts-shell/src/turn/session.ts#L381)，探针 3 |
| 声明 hook / wrong workspace | workspace identity 不等即跳过 | 命令未启动，无预算消耗保证 | 不把别的 workspace payload 送给该声明 | 跳过时宿主可返回 allow；adapter verdict 为 unknown | 未做检查，不是 clean | 无 | 无 | [hookDispatcher.ts:102](../../../packages/ts-shell/src/core/hooks/hookDispatcher.ts#L102)，探针 6 |
| adapter / version mismatch | 无版本协商/验证入口证据 | unknown | B 中没有版本字段；bundle Node floor 不同 | unsupported/unknown；未运行不兼容版本 | 不得从本机 Node 24 成功推导 Node 20 可用 | unknown | 不能补足 CI/发行物兼容证据 | [types.ts:34](../../../packages/ts-shell/src/core/hooks/types.ts#L34)、[执行记录 floor 命令](execution.md#3-runtime-floor) |
| CI / normproof judge | workflow 在 push main / PR，且前置步骤成功才到达 | workflow/进程预算；不是 hook T3/T15 | repo checkout + bundle/profile/manifest；本轮未跑 judge | 此 step 不吞非零退出；只有 failure 传播时具 authority | 取决于真实 judge 退出及 workflow 是否到达 | 无 hook 重入 | 条件成立时独立于模型；最新运行结果 unknown，branch protection unknown | [ci.yml:3](../../../.github/workflows/ci.yml#L3)、[ci.yml:80](../../../.github/workflows/ci.yml#L80) |
| CI / NormProof Architecture Watch | workflow 触发条件下观测 | 工作流预算；非 hook timeout | judge SARIF/退出码观测 | `set +e` 后显式 `exit 0` | judge 失败仍不令该 step 失败 | 不适用 | observation only，不能宣传 release gate | [normproof-watch.yml:31](../../../.github/workflows/normproof-watch.yml#L31) |

## 配置与注册事实

`loadHookDeclarations` 只从所选用户目录的 `hooks.json`（含用户目录选择的兼容回退）和 workspace 的 `.agents/hooks.json` 获取声明；不从 `.codex/.claude` 获取。`hooks` 的事件键必须在 18 项白名单内，group 保留字符串 matcher，handler **只保留非空字符串 command**。`type/timeout/timeoutMs/name/description/extra` 被丢弃；type 不参与筛选，所以带 command 的 `type: "prompt"` 也进入命令声明。加载器生成 event/sourcePath；注册器另生成 name/fingerprint，不会恢复用户填写的 name/timeout。探针 4/5 已执行这一投影。

`homeDir` 只传给声明加载器，**不会自动配置 new HookTrustStore() 的存储路径**。单元探针必须显式传 `trustStore` 或在加载任何单例前隔离整个进程的 HOME/USERPROFILE；本次两者均有使用，所有批准写入 `.tmp/c0-hooks/runtime-*/home/.cheers/` 并在结束时清理。

normal 的 `startTurn` 用注入的 dispatcher 或模块级 `defaultHookDispatcher`（并非每轮都 new）；native 的 `gitGateFor` 每次 new HookDispatcher，再各自 registerDeclaredHooks。nativeGate 经 [cliSessionRuntimeFactory.ts:330](../../../packages/ts-shell/src/cli/runtime/cliSessionRuntimeFactory.ts#L330) 安装到 native Git/security 等入口。探针 6 实际运行 normal、runNativeGit、runPreparedTool、runSecurityTool，四者均启动声明命令并消费 flat block；没有执行真实 Git mutation 或 security scan。

dispatcher 对象、当前注册快照与批准回调不共享。`allow-once` 每次重新询问且不写记录；成功持久化的 `allow-always` 在同一 home/profile 的后续 native 操作中无需再次询问。批准 key 为 event/matcher/command/resolved sourcePath，没有 route id。显式不同 trustStore 文件的对照不共享。撤销后重新询问并拒绝运行 hook，会跳过 hook；普通工具是否允许仍由原有权限决定。来源：[trust.ts:61](../../../packages/ts-shell/src/core/hooks/trust.ts#L61)、[trust.ts:78](../../../packages/ts-shell/src/core/hooks/trust.ts#L78)、探针 6。

## 当前不能宣传的能力

1. “NormProof nested deny 已能阻断 Cheers 写入”或“写入配置即已接入全部路径”。
2. “所有 edit/apply_patch/bash/MCP/browser/desktop 副作用都受完整内容审查”。原生 flat gate 与语义覆盖是两件事。
3. “Stop 是 completion enforcement”“3 秒超时会阻断完成”或“已有 bounded repair/re-entry”。
4. “exit 0、空 stdout、allow/could-not-decide 或 hook 被跳过代表 clean/proven”。
5. “拒绝 hook 的执行批准就等于拒绝工具写入”，或“hook allow 可以替代用户权限”。
6. “hooks.json timeout/timeoutMs 生效”“type 决定 handler 类型”，或“未知事件注册后才决定是否支持”。
7. “normal/native 持久批准完全隔离”或“normal 每轮新建 dispatcher”。
8. “所有 hook failure 都 fail-closed”或“所有事件都能 veto”。具体消费者、命令/进程内 handler 方向不同。
9. “Watch 绿色证明 release gate 通过”“CI 永远到达 judge”或“本轮已证明真实 CI/branch protection”。
10. “Node 24 合成探针通过证明 Node 20.3 与当前 NormProof bundle 兼容”。该兼容性及版本协商仍是 unknown/unsupported。

未覆盖项保持 unknown：真实模型/MCP/终端输入、macOS/Windows、Node 20.3 执行、真实 CI/分支保护、任意未知工具，以及跨副作用面内容语义。源码支持的事件结论与这些未验证的端到端能力明确分开。
