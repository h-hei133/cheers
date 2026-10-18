---
title: "Profile 身份与存储边界"
category: article
sources: [phase-20-decisions.md, 25-model-configuration-and-relays.md]
created: 2026-10-17
updated: 2026-10-17
tags: [features, profiles, configuration]
summary: "Profile 启动身份、逐类存储 consumer、显式导入恢复及受控新进程切换。"
confidence: high
---

# Profile 身份与存储边界

CFG-01 已提交、推送并通过精确 SHA CI；CFG-02 的本地实现、反转验证和独立评审已完成，交付检查进行中。本文记录当前实现合同与逐类 consumer；提交、推送及远端 CI 结果分别记入开发日志。规划入口见 [Phase 20](phase-20-decisions.md)，设计来源见 [配置研究 §7.1](25-model-configuration-and-relays.md#71-profile身份与路径)。

## 启动身份

`--profile <name>` 优先于 `CHEERS_PROFILE`，未指定时为 `default`。名称去除首尾空白并转小写，限定 1–64 个可移植 ASCII 字符，拒绝路径分隔符、点目录、结尾点及 Windows 设备保留名。名称校验先于目录创建。

- `default` 使用原来的 `~/.cheers`，保留既有旧目录读取兼容。
- named profile 使用 `~/.cheers/profiles/<id>`。缺文件表示该 profile 尚无数据，禁止回退 default 或旧目录。
- 启动捕获 canonical home、root、目录 identity 和路径覆盖；进程安装后身份不可切换，必须启动新进程。异步上下文用于传递同一 owner，不通过热改 `HOME` 或 cwd 切换身份。

身份及检查由 [context](../../packages/ts-shell/src/core/paths/profile/context.ts)、[identity](../../packages/ts-shell/src/core/paths/profile/identity.ts)、[name](../../packages/ts-shell/src/core/paths/profile/name.ts) 与 [user paths](../../packages/ts-shell/src/core/paths/userHome.ts) 拥有。named root 及现存路径组件拒绝 symlink；目录 identity 含设备、inode 和创建时间。替换根后即使恢复同一路径，也不能让旧 owner 接受新目录。

路径覆盖在启动时冻结：插件记录、扩展注册表、marketplace、日志、浏览器 receipt cache 及 stream trace。named profile 的可变覆盖必须位于自身 root。浏览器 manifest 可以是显式只读外部输入，但它声明的可变 cache root 仍必须私有。

## Consumer 清单

以下 `P` 表示选中的 named profile root；`W` 表示 `P/projects/<canonical-workspace-digest>`。默认 profile 的旧项目布局及文件格式维持兼容。

| 类别 | named 路由及 owner | 关键边界 |
|---|---|---|
| 配置与连接凭据 | `P/config.json`；[runtime config](../../packages/ts-shell/src/config/runtimeConfig.ts)、[persistence](../../packages/ts-shell/src/config/persistence.ts)、[account state](../../packages/ts-shell/src/core/auth/account/state.ts) | 编辑 baseline 捕获 profile，读前、锁内和发布前检查；连接和账户继续使用原事务/CAS |
| 模型目录及刷新 cache | `P/models.json`、`P/models-cache.json`；[catalog store](../../packages/ts-shell/src/core/models/catalogStore.ts) | shipped 目录共享只读；用户覆盖和显式刷新写入各自 profile |
| MCP OAuth | `P/mcp-auth/*`；[auth store](../../packages/ts-shell/src/cli/mcp/auth/store.ts)、[service](../../packages/ts-shell/src/cli/mcp/auth/service.ts) | service 捕获 owner，发送认证请求、读取、锁内保存和 logout 都检查原 owner |
| 会话、目录和 reentry | `P/sessions/*`、`P/current-session.json`；[layout](../../packages/ts-shell/src/session/store/sessionFileLayout.ts)、[access](../../packages/ts-shell/src/session/store/sessionStoreAccess.ts)、[catalog](../../packages/ts-shell/src/session/store/catalog/discovery.ts) | 同 ID 会话在 A/B 各有独立 metadata、state、transcript、锁及目录索引 |
| 请求 ledger、usage 与持久 jobs | 会话 state 内；[requests](../../packages/ts-shell/src/session/store/requests.ts)、[job store](../../packages/ts-shell/src/workflow/jobs/store.ts)、[jobs composition](../../packages/ts-shell/src/cli/runtime/jobs.ts)；账户 reset receipt/lock 位于 `P/accounts/resets/<accountKey>.json` / `.lock`，由 [reset state](../../packages/ts-shell/src/cli/usage/state.ts) 拥有 | 会话事实继承捕获的 manager/layout，账户 reset 经选中 root 和现有 workspace writer；不建立第二套账本或 job owner |
| trust、hooks 和工具审批 | `P/trust.json`、`P/hook-trust.json`、`P/approval-policy.json`；[trust store](../../packages/ts-shell/src/core/security/trust/store.ts)、[hook trust](../../packages/ts-shell/src/core/hooks/trust.ts)、[approval policy](../../packages/ts-shell/src/core/shell/approvalTrustPolicy.ts) | 完整路径检查也覆盖缓存授权；换根或叶子链接不能导入另一 profile 的 grant |
| 扩展、包与来源 | `P/extensions/registry.json` 及相邻 packages、`P/plugins.json`、`P/marketplaces.json`；[extension store](../../packages/ts-shell/src/extensions/store/state.ts)、[sources](../../packages/ts-shell/src/extensions/registry/sources.ts)、[plugin store](../../packages/ts-shell/src/core/commands/plugin/store.ts) | 捕获的 store 不接受替换 root；显式 path override 同样受 profile containment 限制 |
| 用户规则及扩展输入 | `P/AGENTS.md`、skills、prompts、agents、themes、`P/keybindings.json`、`P/mcp.json`、`P/hooks.json`、`P/sandbox.json`；[instructions](../../packages/ts-shell/src/context/instructions/projectInstructions.ts)、[skill loader](../../packages/ts-shell/src/core/skills/skillLoader.ts)、[template loader](../../packages/ts-shell/src/core/prompts/templateLoader.ts)、[agent loader](../../packages/ts-shell/src/core/subagents/subagentLoader.ts) | 自动用户来源只读选中 profile，缓存 loader 保留 owner；目录与叶子链接均拒绝 |
| 可变项目 memory | `W/memory/project`；[memory root](../../packages/ts-shell/src/memory/projectMemoryRoot.ts)、[local store](../../packages/ts-shell/src/memory/projectMemoryLocalStore.ts)、[owner](../../packages/ts-shell/src/memory/store/owner.ts) | 同 workspace 的 A/B 独立；store reference 的捕获身份贯穿异步事务、列表和删除 |
| 子代理 memory | 用户级 `P/agent-memory/*`；项目及 local 级 `W/memory/*`、`W/memory-local/*`；[agent memory](../../packages/ts-shell/src/core/subagents/agentMemoryManager.ts) | named profile 不把可变 memory 写回项目共享目录 |
| 项目选择、workflow run 与历史 | `W/state.json`、同 owner run 文件及 `W/prompt-history.txt`；[project state](../../packages/ts-shell/src/core/state/projectState.ts)、[run store](../../packages/ts-shell/src/core/workflow/runStore.ts)、[history](../../packages/ts-shell/src/cli/interactive/historyStore.ts) | 使用 canonical workspace digest，不以同名文件夹或可变 cwd 猜身份 |
| 日志与 crash/stream 诊断 | `P/logs/*`、`P/crashes.json`、`P/logs/stream-trace.log`、默认 `P/report-*.zip`；[sink](../../packages/ts-shell/src/observability/rotatingFileSink.ts)、[crash](../../packages/ts-shell/src/observability/crashLog.ts)、[stream](../../packages/ts-shell/src/observability/logs/stream.ts)、[report](../../packages/ts-shell/src/core/commands/reportCommandRuntime.ts) | sink、安装的 crash 回调、tracer 和默认 report 捕获 owner；等待工具清单后重新检查默认输出，失效诊断不转写另一个 profile |
| Artifact | `W/sessions/<session-id>/artifacts`；[manager](../../packages/ts-shell/src/core/session/artifactManager.ts)、[tool access](../../packages/ts-shell/src/core/session/artifacts/access.ts) | `artifact://0` 可在不同 profile 重名，只解析当前 session 的产物；原 read scope 和 deny 仍生效 |
| Snapshot、undo 与 recovery | `W/edit-snapshots`；[snapshot root](../../packages/ts-shell/src/edit/recovery/root.ts)、[operation store](../../packages/ts-shell/src/edit/recovery/operation/store.ts)、[recovery authority](../../packages/ts-shell/src/edit/recovery/recoveryAuthorityStore.ts) | writer、restore 和 undo 共用一个 root；named receipt 保存非秘密 profile identity，default 不新增字段；cleanup 同样检查 owner |
| 浏览器 receipt cache | 显式 `P` 内 root；[manifest](../../packages/ts-shell/src/browser/receipt/manifest.ts)、[store](../../packages/ts-shell/src/browser/receipt/store.ts) | 无隐式全局 cache；读、锁、变更和删除均使用捕获 owner |
| 委托云凭据与 token cache | 显式外部凭据输入保留；[Google auth](../../packages/ts-shell/src/provider/google/auth.ts) 的可变 access-token cache 按 profile 和凭据来源分隔 | 外部账户登录来源不等于可变 Cheers 存储；不凭 profile ID 另造 refresh lineage |
| 协作及远端执行 | [collaboration binding](../../packages/ts-shell/src/cli/collaboration/projection.ts)、[cursor](../../packages/ts-shell/src/collaboration/client/cursor.ts)、[SSH client](../../packages/ts-shell/src/runtime/execution/ssh/client.ts) | room/project 路由、cursor 和 SSH remote journal namespace 包含 profile owner；default namespace 兼容 |
| 旧本机 peer 发现 | [scanner](../../packages/ts-shell/src/core/messaging/agentRegistryScanner.ts) | 旧共享 socket 描述符缺少 profile 身份，只供 default 使用；模块加载期创建的 scanner 在首次扫描时捕获已安装身份 |

## 有意共享的输入与进程边界

项目代码、受信任的项目 instructions/skills/templates/agents/themes、项目配置及显式 CLI 文件输入仍是同一 workspace 的输入，继续经过已有来源与权限检查。普通 profile 隔离不禁止用户显式读取自己获准访问的文件，也不为项目新增 workspace grant。

provider 环境变量、显式 Google/AWS 委托凭据、SSH transport 认证和机器工具属于明确输入。它们不从 default profile 自动复制，也不由 profile 隔离创造新的账户授权。显式导入的范围和独立登录要求见下文；refresh lineage 的扩展归 PRV-04。

显式 `cheers serve <absolute-private-config.json>` 使用该文件声明的服务状态 owner 和认证 ACL，不安装交互 runtime profile；这是明确选定的共享服务边界。[CLI bootstrap](../../packages/ts-shell/src/cli/bootstrap/cliProcessRunner.ts) 保留独立 service 路径。客户端仍通过携带 profile 身份的 project/room binding 路由，服务进程本身不成为 default 数据回退入口。

一个 executable 只安装一个 runtime profile。浏览器/桌面等进程内句柄不会在同进程热切 profile；会话级 map、产物实例、usage telemetry 与协作路由已有 profile 身份。测试的未安装异步 scope 仅验证 owner 传播与存储，不代表同进程支持多个完整 runtime。

## 迟到结果与安全限度

捕获的 session layout、配置 baseline、memory store、artifact manager、审批 store、日志回调、MCP service 和 SSH client 检查自己的 owner。A 的迟到操作可回 A；它不能因当前上下文变化而改写 B。原 root identity 消失或改变时拒绝使用替代目录。受控切换流程必须关闭旧 runtime 并启动新进程。

这些是路径、目录 identity 与 effect 前后的检查。它们不等于所有平台每次文件访问都用 descriptor 锚定，不宣称抵抗任意恶意并发文件系统替换。现有 Linux artifact/edit descriptor writer 的适用保证继续由原 owner 提供；非 Linux 实际对象绑定缺口仍见 [Phase 19 §27](phase-19-acceptance.md#27-阶段收尾与未完成项)。没有 Windows/macOS 运行证据时，只能报告名称合同测试与当前平台证据。

## 验证入口与当前证据

- [context tests](../../packages/ts-shell/src/core/paths/profile/context.test.ts)：default/legacy、非法名称、冻结覆盖、symlink、换根、交错 await 与 installed profile 不可切换。
- [storage tests](../../packages/ts-shell/src/core/paths/profile/storage.test.ts) 与 [source tests](../../packages/ts-shell/src/core/paths/profile/sources.test.ts)：相同 workspace/ID、trust、真实 artifact tool adapter、memory、history、logs、collaboration、token cache、自动用户源、MCP、保留配置编辑及 crash 回调。
- [operation tests](../../packages/ts-shell/src/edit/recovery/operation/profile.test.ts)、[browser tests](../../packages/ts-shell/src/browser/receipt/profile.test.ts)、[SSH tests](../../packages/ts-shell/src/runtime/execution/ssh/profile.test.ts)、[peer tests](../../packages/ts-shell/src/core/messaging/agentRegistryScanner.test.ts)：真实 writer receipt、restore/undo root、迟到 owner、cache confinement、remote namespace 及启动顺序。
- Linux synthetic/offline 编译后 CLI：独立临时 HOME 与 Git workspace，A/B 使用同 session ID、connection ID；分别验证连接列表、会话导出、current session 及非法名称。全屏交互另经真实三路 TTY 验证启动历史、连接状态和导出；原普通 `rtk proxy` 只证明 line loop。

最终受影响组合回归为 118 文件、1272 项通过；九项反转均触发断言失败并逐字恢复源码。最新构建通过，独立 code review 为 APPROVE、architecture 为 CLEAR。

初次完整 TS 串行运行的五项计时器隔离失败，以及两轮 CI 暴露的测试环境问题，已由后续限定测试/workflow 修复处理，历史结果保留在 [开发日志](../log.md)。CFG-01 最终提交 `ba73e36b1016d83398f90f648044e3dd803d10a0` 的 [主 CI](https://github.com/h-hei133/cheers/actions/runs/39007578306) 与 [Architecture Watch](https://github.com/h-hei133/cheers/actions/runs/39007578308) 均实际完成并通过；主 CI 的测试及最后 NormProof 步骤没有跳过。这是该 SHA 的交付证据。

## 创建、导入与恢复

`/profile status` 显示安装的进程身份，`/profile list` 列出可用及不可用的存储，`/profile create <name>` 显式创建空 profile。创建已有 profile 是可核实的幂等操作，不切换或重载当前 runtime。管理合同由 [command syntax](../../packages/ts-shell/src/core/commands/profile/syntax.ts) 和 [config owner](../../packages/ts-shell/src/config/profiles/command.ts) 共同实现。

```text
/profile create work
/profile import default --target work
/profile import default --target work --confirm <preview-digest>
/profile recover <operation-digest> --target work
/profile recover <operation-digest> --target work --confirm <preview-digest>
```

source 和 target 必须已存在且不同；查询缺少的 source 不创建目录。未指定 `--target` 时目标是当前 profile；未选类别时使用全部支持类别，也可用 `--config`、`--catalog`、`--definitions`、`--history` 选择子集。preview 不写目标存储；交互宿主仍会把命令报告写入当前会话。当 source 正是当前 owner 时，当前活动会话在读取前即被排除，排除 ID 绑定在摘要和 journal 中，避免 preview 自己改变确认摘要。其他 inactive history 保留；要迁移该活动会话，应先退出，再从另一 profile 导入。

支持范围如下，preview 也明确显示排除范围：

| 类别 | 保留内容 | 不随导入转移的内容 |
|---|---|---|
| config | 经当前用户字段 schema 校验的配置、非秘密连接引用 | API key、账户 OAuth、legacy credential slots；连接统一置为 pending |
| catalog | 校验后的用户模型目录及支持属性 | 认证材料、刷新 cache、携带认证的 URL |
| definitions | `AGENTS.md`，`skills/`、`prompts/`、`agents/` 中的 Markdown | 可执行脚本、hooks、包、其他未声明格式 |
| history | 当前 canonical workspace 的完整可导出会话图，经过现有脱敏规则 | 其他 workspace、权限、请求账本、jobs、恢复 capability、当前会话选择及运行状态 |

配置中的相对 `pathRules.path` 在 preview 时按实际源配置文件目录解析为绝对声明路径，包含 default 的 legacy 来源。导入保留原规则目标，不将源 profile 内的目录替换为目标目录；原有绝对路径同样保留目标含义。源文件保持原字节，转换后的目标内容纳入原导入摘要，源规则在确认前变化仍拒绝发布。

历史使用新 inactive session ID，沿现有 [history projection](../../packages/ts-shell/src/session/history/projection.ts) 和 [native serialization](../../packages/ts-shell/src/session/history/files.ts) 保存。图投影只使用已捕获并纳入摘要的 transcript/state 字节，不能二次读取另一版本。导入不复制 trust/approval grant、MCP token、live rotating OAuth 或 pending execution。目标连接必须独立登录；pending 连接在凭据解析前拒绝 CLI/env/legacy 借用，签名授权请求也保留该拒绝。

每次导入最多选择 1024 个文件、32 MiB 总量、单文件 2 MiB，定义嵌套最多 12 层；history 沿用 2 MiB/4096 graph entries 的限制。超限拒绝，不截断。摘要绑定版本、选择、源文件内容与 identity、source/target root、canonical workspace 及活动会话排除。锁内重新规划并在发布前复查，旧摘要不能授权新内容。

[import owner](../../packages/ts-shell/src/config/profiles/import/runtime.ts) 先保存持久 journal，再写目标内的私有 staging，逐文件用独占 hard link 发布；目标已有不同内容时拒绝覆盖，即使上次 receipt 是 complete。session metadata 最后发布，缺 state/transcript 的历史不能提前进入正常发现。中断后显式 recover 会核对当前源版本，协调缺失或逐字相同的目标文件，再恢复剩余发布；源变化、换根、链接、锁释放失败及不确定读回均不能报告完成。操作不提供跨文件崩溃原子性，保留 journal/stage 以供核查，不自动删除不确定数据。

## 受控切换

```text
/profile switch work
/profile switch work --confirm <preview-digest>
```

切换仅支持交互终端。preview 绑定当前 session、workspace/config/trust generation、目录 identity 和目标身份；忙碌、取消、重复退休、陈旧源、缺失目标及超限请求在退休前拒绝。确认后关闭当前表面并恢复终端，现有资源 owner 必须实际排空；job 的内层 owner、cleanup rejection、timeout 或 unknown 都会阻止新进程派发。`/restart` 保持同 PID、同 profile，不用于热改身份。

[bootstrap handoff](../../packages/ts-shell/src/cli/bootstrap/profile/handoff.ts) 通过唯一 `runtime/execution` spawn owner 启动新 executable，继承终端；源码入口的已知 loader 在真正获准的 Node PID 内运行。新的 argv 仅携带 target、workspace 和支持的展示选项，过滤旧提示、恢复动作、CLI/env provider 凭据、路径覆盖及 loader 注入。子进程原子 claim receipt，立即移除 handoff 环境标记，以原生 report writer 保存真实启动记录，再记录 admitted。spawn 本身不等于 admitted；父进程等到子进程结算后核对 receipt、进程清理及新会话实际读回，才报告 verified startup。

持久 receipt 区分 prepared、drained、dispatched、admitting、admitted 和 unknown。`/profile recover <operation>` 在源 profile 检查 switch 状态，不能自动重派未知/已派发操作。失败后源会话保留，用户可显式重新启动并 resume。

每条终端切换链最多八次转换，最多保留八个已排空 supervisor 加一个活动 CLI。深度来自已校验 receipt，跨同进程 `/restart` 保留，不读取普通环境变量来重置；第九次切换在退休前拒绝。达到上限后退出并显式启动新 CLI。现有 supervisor 负责信号、窗口尺寸传递、进程树清理和最终读回；这会占用有界进程资源。

## CFG-02 证据与平台边界

当前 Linux synthetic/offline 实际探针覆盖编译后 JS、源码 loader 和单文件 executable：三路真实 TTY、source→target→source 的不同 PID、两层窗口尺寸传递、终端恢复、独立登录、同 PID `/restart`、退出清理及原生会话读回。向原 supervisor 发送 SIGTERM 后两层子进程均消失且结果报告 unknown。带 CLI/env 凭据的导入 pending 连接对 loopback provider 的实际请求数为零；源 seed 配置和历史字节保持。独立 architecture lane 另行实际验证执行 owner 的 PTY resize。

十二项保护反转均触发真实断言失败并逐字恢复源码，涵盖凭据 fence、秘密投影、独占发布、metadata 次序、捕获历史、活动会话排除、严格 jobs drain、generation 摘要、drain 后复查、源码 PID、resize 及 supervisor 上限。限定变更文件的清理已执行；独立 code/spec/security 为 APPROVE，architecture 为 CLEAR。

没有 Windows/macOS 实机、真实 provider 或完整八层链的 TTY 运行证据。它们不能由 Linux mock、名称校验或两层运行推导；八次上限有边界测试。最终组合测试、构建、提交及精确 SHA CI 分别记录在 [开发日志](../log.md)。
