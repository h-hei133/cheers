---
title: "Profile 身份与存储边界"
category: article
sources: [phase-20-decisions.md, 25-model-configuration-and-relays.md]
created: 2026-10-17
updated: 2026-10-17
tags: [features, profiles, configuration]
summary: "CFG-01 的启动身份、逐类存储 consumer、显式共享输入及验收边界。创建、导入与切换流程归 CFG-02。"
confidence: high
---

# Profile 身份与存储边界

CFG-01 的本地实现与验收已完成，正在交付。本文记录当前实现合同与逐类 consumer；提交、推送及远端 CI 结果分别记入开发日志，不由本清单推导完成状态。规划入口见 [Phase 20](phase-20-decisions.md)，设计来源见 [配置研究 §7.1](25-model-configuration-and-relays.md#71-profile身份与路径)。

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
| 用户规则及扩展输入 | `P/AGENTS.md`、skills、templates、agents、themes、`P/keybindings.json`、`P/mcp.json`、`P/hooks.json`、`P/sandbox.json`；[instructions](../../packages/ts-shell/src/context/instructions/projectInstructions.ts)、[skill loader](../../packages/ts-shell/src/core/skills/skillLoader.ts)、[template loader](../../packages/ts-shell/src/core/prompts/templateLoader.ts)、[agent loader](../../packages/ts-shell/src/core/subagents/subagentLoader.ts) | 自动用户来源只读选中 profile，缓存 loader 保留 owner；目录与叶子链接均拒绝 |
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

provider 环境变量、显式 Google/AWS 委托凭据、SSH transport 认证和机器工具属于明确输入。它们不从 default profile 自动复制，也不由 profile 隔离创造新的账户授权。完整导入、live rotating OAuth 的禁止复制和独立登录归 CFG-02/PRV-04。

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

完整 TS 串行运行实际为 812 文件通过、1 文件失败，8225 项通过、5 项失败、1 项 skipped。失败集中在 `webRequests.test.ts`：先运行 `deviceCode.test.ts` 后，Vitest 的计时器清理导致 `setTimeout is not defined`；相同顺序在未修改的 `03b56c94` 独立 worktree 上复现相同五项失败，单文件 44 项通过。本批未修改该既有测试隔离问题，不把完整运行记为绿色。完整命令、反转、独立复审与交付状态在 [开发日志](../log.md) 记录。
