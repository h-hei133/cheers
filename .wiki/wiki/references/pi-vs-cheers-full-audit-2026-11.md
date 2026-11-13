---
title: "Pi vs. Cheers 全仓严格架构与能力差距审计（2026-11-13）"
category: reference
sources: [raw/notes/2026-11-13-pi-vs-cheers-full-monorepo-audit.md, raw/notes/2026-11-13-pi-vs-cheers-strict-audit.md]
created: 2026-11-13
updated: 2026-11-13
tags: [references, pi, gap-analysis, monorepo, tui, durable, chord, env, sdk, extensions, rpc, providers]
summary: "扩展至全仓范围（Pi 12 包 + p2/p2-mac 对比 Cheers 37+ 子域）的严格源码审计：揭露 380dcc58 已修与未接通/空桩项、TUI/协议/Unicode 缺口、pi-durable/chord 事务代差、远程 env 守护进程、SDK/扩展/RPC/HTML 导出差距与单包水平膨胀。"
confidence: high
---

# Pi vs. Cheers 全仓严格架构与能力差距审计（2026-11-13）

本审计基于 `/home/wang/projects/pi`（`47e9d74f9`）全部 12 个 workspace 包与 `apps/p2`、`apps/p2-mac` 对照 `/home/wang/projects/cheers`（`380dcc58`）全部 37+ 个源码域的直接实证比对，超越此前仅聚焦工具/缓存的局部审计，完整覆盖运行时、TUI、持久化、远程执行、协议生态与工程膨胀。

关联前序审计：[[pi-vs-cheers-deep-gap-analysis-2026-11|Pi vs. Cheers 深度架构与实现差距审计（2026-11-13）]] ([前序局部审计](pi-vs-cheers-deep-gap-analysis-2026-11.md))；原始实证笔记：[全仓严格比对原始记录](../../raw/notes/2026-11-13-pi-vs-cheers-full-monorepo-audit.md)。

---

## 一、全仓规模与结构失衡总览

| 对比维度 | `pi` (`47e9d74f9`) | `cheers` (`380dcc58`) | 差距定性 |
| :--- | :--- | :--- | :--- |
| **包与边界划分** | 12 个拓扑分层包（`telemetry -> schema -> chord -> tui -> codemode -> mcp -> ai -> durable -> env -> agent -> coding-agent`）+ `evals` + `apps/p2`, `p2-mac` | 单一巨石包 `packages/ts-shell`，内嵌 **37+ 个顶层目录**，无编译器强制边界 | **结构失衡**：垂直实验模块吞没核心底座 |
| **核心与交互代码量** | `agent` (17) + `coding-agent` (742) + `tui` (105) + `modes/interactive` (71) | `core/` (803，仅 `core/commands/` 180+)、`cli/` (497)、`session/` (281)、`presentation/` (206)、`cli/interactive/` (~209) | **过度碎片化**：同类功能被切碎到数百个微小文件 |
| **非核心垂直膨胀** | 浏览器/外部能力交由扩展与 `packages/mcp` | `browser/` (**257** 文件)、`workflow/` (72)、`research/` (53)、`planning/` (43)、`collaboration/` (26)、`advisor/` (15)、`eval/` (11, 0 测试) | **严重分散**：大量非通用编码主干逻辑常驻主包 |
| **Web / 桌面 / 终端端** | `apps/p2`（React 工作台 + `ghostty-vt.wasm` + 语音）、`apps/p2-mac`（19 个 Swift 文件） | **无**（`src/desktop/` 9 文件实为 X11 键鼠自动化工具） | **产品形态代差** |
| **工程基础设施** | `typescript` 7.0.2、`@biomejs/biome` 2.3.5 + 自定义 Grit 规则、`esbuild` 拆包、Vitest 4.1.12、`flake.nix` + `install-lock` | `typescript` ^5.2.0 写在运行时 `dependencies`、**无 linter/formatter**、纯 `tsc` 无拆包、Vitest 0.34.0、100+ 维护脚本 | **工具链落后** |

---

## 二、已落地但仍“未接通 / 半空桩”的问题（基于 `380dcc58` 实证）

前轮虽然合入了 `380dcc58` 修复部分 P0/P1/P2 缺口，但严格复查发现**五项关键能力尚未在生产主链路上真正打通**，甚至存在一处明确不可用的命令：

1. **RPC `abort` 命令走入 `default` 报错（真实 Bug）**：
   - `packages/ts-shell/src/cli/rpc/rpcServer.ts:13,45,97` 与 `cli/runtime/inputStream.ts:223-226` 已声明并校验 `abort`，但 `handleRpcCommand`（`rpcServer.ts:132-221`）**漏写了 `case "abort":`**，收到 `{"type":"abort"}` 会落入 `default:` 并返回 `"Unsupported RPC command."`。
2. **`prepareRequest` 与 `VirtualModelRegistry` 零生产调用**：
   - `AgentCoreOptions`（`core/agent/agent.ts:8-28,171-189`）未接收也未透传 `prepareRequest`，目前仅 `loop.test.ts` 调用。
   - `VirtualModelRegistry`（`core/models/virtualModels.ts:4-81`）在生产代码中**零调用方**，`turn/step.ts` 从未解析虚拟模型路由。
3. **Anthropic / OpenAI 缓存保活参数在 `turn/step.ts` 断链**：
   - `turn/step.ts:429-462` 调用 `endpointTurnBody` 时**未传入** `cacheRetention`、`initialTools`、`supportsMidConvoToolChanges`、`supportsMidConvoEffort`。
   - `anthropicMessages.ts:159-160` **从未发送 `anthropic-beta` 请求头**（全仓 0 处），硬编码 `body.output_config = { effort: "low" }`，且调用 `insertThinkingLevelMessages` 时未传递 `historicalEfforts`。
4. **进程内 TS 扩展在生产入口被空桩屏蔽**：
   - `loadInProcessExtension` 仅在单测 `inProcessLoader.test.ts:48` 被调用；生产路径 `extensions/runtime/execute.ts:36` 调用的是 `executeInProcessScript`，其 `EXTENSION_WORKER_SOURCE`（`inProcessLoader.ts:198-204`）把 `registerTool`、`registerCommand`、`on` 全部实现为 **`() => {}` 空函数**。
5. **`TOOL_OUTPUT_LIMIT` 与 `edit` Schema 摩擦仍存**：
   - `core/agent/tools.ts:91,274` 仍对所有工具批量输出执行基于字符切片的 `boundText(..., TOOL_OUTPUT_LIMIT)`；`edit/tool.ts:14-45` 仍保留 `oneOf` + `not: { anyOf: [...] }`；`tools/preparation.ts:20-98` 单次编辑仍跑 4~5 遍 `JSON.stringify`。


---

## 三、TUI 引擎、终端协议与多端形态差距

1. **超大帧无安全分块写入**：`pi` 的 `BoundedTerminalWriter`（`packages/tui/src/tui-main-screen.ts:21-72`）按 1 MiB 边界且不拆断 UTF-16 代理对地流式写入；`cheers`（`presentation/tui/render/engine.ts:435-443`）将整帧拼成单个大字符串一次性 `write(buffer)`。
2. **终端控制协议与能力探测薄弱**：
   - `pi` 支持 OSC `9;4` 进度条、`7501` 程序状态（带 DA1 哨兵）、OSC `10`/`11`/`4` 全调色板查询、`\x1b[16t` 单元格像素尺寸探测、OSC `133` 提示区导航及 `tmux` OSC 8 超链接实时探测（`terminal.ts:15-17,179-183,618-631`、`terminal-image.ts:46-135`）。
   - `cheers` 仅在 `appearance.ts:2-3` 查询 DEC `2031` + OSC `11`，其余能力检测均为静态环境变量猜测（`terminalCapabilities.ts:23-58`）。
3. **内联图片尺寸与解码内存治理缺失**：`pi` 解析 PNG/JPEG/GIF/WebP 头部像素并结合 `\x1b[16t` 计算精确行数，且同时按数量(16)/传输(32MiB)/估算解码像素(64MiB) 驱逐离屏 Kitty 缓存；`cheers`（`image.ts:69-83`、`render/engine.ts:57-58,456-475`）既不解析图片头也不计算解码像素字节。
4. **Unicode 宽字符 / Emoji 宽度漏洞**：`pi/packages/tui/src/utils.ts:36-49` 使用 `get-east-asian-width` + `\p{RGI_Emoji}` + `terminalSpacingMarkRegex`；`cheers/presentation/tui/text/width.ts:15-99` 手写 `WIDE_RANGES` 漏掉了国旗区域指示符（`0x1F1E6..0x1F1FF`）和无 `U+FE0F` 的 ZWJ 序列。
5. **缺少原生 N-API 辅助与可组合浮层栈**：`pi` 自带三端 `.node` 原生插件检测修饰键（修复 Apple Terminal Shift+Enter）与原生剪贴板，支持多浮层堆栈（`OverlayOptions` / `nonCapturing`）；`cheers` 仅靠外部进程剪贴板且每次仅能显示单一 `Picker`。
6. **零 Web / 原生桌面产品矩阵**：`pi` 拥有 `apps/p2`（React 工作台 + `ghostty-vt.wasm` + 语音 STT/TTS 打断）与 `apps/p2-mac`（Swift/AppKit + `WKWebView`）；`cheers` 全仓无桌面/Web UI。

---

## 四、持久化树、事务耐久性（`pi-durable`）、跨进程同步（`chord`）与 Agent 循环

1. **会话存储碎片化 vs. 单文件树状 JSONL**：
   - `pi/packages/coding-agent/src/core/session-manager.ts:47-52,140-195,287-348,1378-1713` 用单文件 append-only `.jsonl` 统一承载 `id`/`parentId` 树、v1→v3 迁移、`ContextEditEntry` 无损上下文编辑、`LabelEntry` 书签及 `commonAncestorId` 分支摘要。
   - `cheers/session/` 横跨 **22 个子目录**，把单会话拆成 `metadata.json`、`transcript.jsonl`、`state.json` 与文件锁（`sessionFileStore.ts`），并发或分叉时存在多文件部分成功风险（`SessionForkError`、`SessionNavigationWarning`），且缺少 `ContextEditEntry` 与 `LabelEntry`。
2. **缺少事务级持久化引擎（`pi-durable`）**：
   - `pi/packages/durable/` 提供统一原子 `Storage`（SQLite、IndexedDB、断行恢复 JSONL、Memory、Chord），带 2,142 行 `storage-conformance.ts` 一致性测试、可挂起恢复的任务状态机 `TaskRecord`（`pending`/`running`/`waiting`/`sleeping`/`completing`）与 `TaskGraphView`。
   - `cheers` 的 `session/recovery/` 仅为状态标记启发式判断（`work.ts:5-12`），`core/subagents/team/fanOut.ts:61-106` 只是内存态 `Promise.all`，进程崩溃后无法恢复子任务图。
3. **缺少响应式增量状态同步（`chord`）**：
   - `pi/packages/chord` 通过 Delta 操作 `Replica` 与有界 outbox（`uploadSession`，epoch 栅栏）实现跨进程响应式同步；`cheers/collaboration/service/rooms.ts` 仅依赖粗粒度 HTTP 房间轮询（最多 64 房、5s 租约、256 事件滑窗 + `snapshot.cutover`）。
4. **流式部分消息与循环边界**：
   - `pi/packages/agent/src/agent-loop.ts:390-444` 严格区分 `AgentMessage[]` 与 `Message[]`，并在流式阶段实时更新部分 `AssistantMessage`；`cheers/core/agent/loop.ts:327-349` 等整步 `AssistantStep` 完成才落消息。

---

## 五、模型传输、OAuth、目录/Schema、远程执行（`env`）与可观测性

1. **端点协议、流式 JSON 与重试细节**：
   - `pi/packages/ai` 覆盖 10 种聊天协议（含 `azure-openai-responses`、`mistral-conversations`、`pi-messages`）+ `openrouter-images` + 4 种分类器 API；支持 Codex WebSocket + zstd 压缩、`x-should-retry` 响应头以及 `StreamingJsonParser`（`O(n)` `JsonChange` 增量流式解析）。
   - `cheers` 缺少 Azure / Mistral / 图像 / 分类器端点、`x-should-retry`、Codex WebSocket+zstd，工具参数仅在完成后跑批量 `jsonRepair`。
2. **OAuth 覆盖度与目录/Schema 验证**：
   - `pi` 内置 **8 种 OAuth**（含 Anthropic、ChatGPT/Codex、Kimi、Meta、OpenRouter、Radius、Copilot），并用 `@earendil-works/pi-schema`（零 `eval` Draft 2020-12/7 编译器）校验目录/工具，支持阶梯定价 `inputTokensAbove` 与 `ModelInputLimits` 图片自动缩放规范。
   - `cheers` 仅支持 **3 种 OAuth**（明确拒绝 Anthropic OAuth：`providerAuthRuntime.ts:90`），无运行时 Schema 校验器、无阶梯计费、无图片缩放约束。
3. **远程执行（`pi/packages/env` vs. `cheers/ssh`）**：
   - `pi/packages/env` 是在跨平台持久化 Rust 守护进程（`pi-env serve`，16 MiB 二进制多路复用帧）之上提供完整远端文件系统（`lstat`/`pread`/`scanLines`/`watch`/`listFiles`）、`pty` 与 `exec`。
   - `cheers/runtime/execution/ssh/client.ts:23-95` 每次 RPC 都重拉一次 `ssh` 进程（256 KiB `CHEERS_SSH_1` 文本帧），仅支持任务起停与 64 KiB 输出翻页，无远端文件/PTY RPC，且强依赖远端 Linux `systemd-user` + `cgroup v2`。
4. **遥测（`pi/packages/telemetry` vs. `cheers/observability`）**：
   - `pi` 提供 OTel 风格 Span/Event/Link、`TelemetryStore` 检索、`inject`/`extract` 跨进程上下文传播与强类型 `defineTelemetrySchema`；`cheers/observability/metrics.ts:25-35` 为进程级全局计数/耗时缓冲（非会话隔离），缺少直方图与跨进程传播。

---

## 六、SDK、扩展生态、RPC、HTML 导出与配置复杂度

1. **无会话级嵌入式 SDK**：`pi/packages/coding-agent/src/core/sdk.ts:48-137` 提供 `createAgentSession()` + `DefaultResourceLoader`（支持 `extensionFactories` 内联嵌入）；`cheers/packages/ts-shell/src/index.ts:1-60` 仅导出规划/校验辅助函数，无完整 Session SDK。
2. **扩展生态与包管理缺口**：`pi` 拥有 `pi install`（npm/git/local 包管理）、40+ 事件、`ui.*` 弹窗/小部件/自定义渲染器、`registerProvider`、`registerVirtualModel`、`registerShortcut`、`registerFlag`；`cheers` 无包管理器，生产入口 `execute.ts` 甚至把扩展 API 绑定成了空函数桩。
3. **CodeMode 剩余差距**：`cheers/core/tools/codemode/tool.ts` 的 `store()`/`load()` 是内存 `Map`（上限 64 会话），不像 `pi` 落盘到分支专属会话条目（`CODEMODE_STORE_ENTRY_TYPE`）；`describeTool` 返回原始 JSON Schema，缺少 `pi` 的 TS 声明投影（`declarations.ts:43-147`）、`describeNamespace`、`image()`、`models.*` 与确定性 WASI 重放。
4. **MCP 鉴权与启动等待**：`cheers/core/mcp/gateway.ts` 仅支持 Bearer Token，缺少 `pi-mcp` 完整的 OAuth 2.0 loopback/PKCE 流（`packages/mcp/src/oauth/`）及 `reachesTools` 懒启动等待。
5. **RPC 与 HTML 导出成熟度差距**：
   - `cheers/cli/rpc/rpcServer.ts` 仅 7 个可用命令（+ 坏掉的 `abort`），对比 `pi` 的 30 个命令与完整双向 `extension_ui_request`/`extension_ui_response` 协议（`rpc-types.ts:17-66,238-286`）。
   - `cheers/session/export/` 缺少 `highlight.min.js` 代码高亮、完整 `marked` CJK/GFM 渲染、Token/费用统计（`computeStats()`）、可折叠 Thinking 块、工具 Diff 渲染和内联图片灯箱。
6. **CLI 与配置过度设计**：`cheers/entrypoints/cliArgs.ts` 缺失 `--model`、`--models`、`--thinking`、`--continue`、`--resume`、`--fork`、`-e`、`--no-tools`、`--export`、`--list-models` 等常用参数；`cheers/config/` 用 **40+ 个文件**实现约 50 个配置项 × 8 维策略矩阵及来源溯源树，对比 `pi` 仅 4 个文件的 TypeBox `SettingsManager` 明显过重。
7. **垂直域膨胀与工具链陈旧**：`packages/ts-shell/src/` 在单包里塞入 `browser/`（257 文件）、`core/commands/`（180+ 文件）、`workflow/`（72）、`research/`（53）、`planning/`（43）、`collaboration/`（26）、`advisor/`（15）、`eval/`（11，零测试），外加 100+ 维护脚本；同时缺少代码格式化/Linter（`biome`）、将 `typescript` 错放进运行时 `dependencies`、单测停留在 Vitest `0.34.0` 且无 `esbuild` 分包。

---

## 七、客观事实：Cheers 确实优于或持平 Pi 的领域

1. **OS 级沙箱与内置静态安全门（`sandbox/osSandbox.ts`, `security/service.ts`）**：`cheers` 实现了跨 Linux `bwrap` / macOS `sandbox-exec` 的 `failClosed` 沙箱与 `tighten(user, project)` 单调收紧策略，及内建 SARIF 扫描与修复验证；`pi` 在 `coding-agent` 层无 OS 命令沙箱。
2. **多账号凭证池化与租约刷新（`core/auth/account/pool.ts`, `lease.ts`）**：支持按会话亲和度（`AFFINITY_LIMIT = 1024`）轮换同厂商多账号并在 429 后按单凭证退避；`pi` 每厂商仅存单凭证。
3. **TUI Vim 模式、终端录制回放与草稿粘贴保护（`presentation/tui/editor/modal/`, `media/record/`, `pastes.ts`, `themes/watch.ts`）**：完整 Vim 模态编辑、带脱敏的终端流录制/回放、暂存草稿防 LRU 驱逐及 Schema 校验的主题热重载均在 `pi` 基础 TUI 之上。
4. **压缩预算精细度与本地回环 Trace 面板（`session/compaction/budget.ts`, `observability/traceDashboard.ts`, `cacheWaste.ts`）**：`WeakMap` Token 缓存、`openCallsBefore` 不断裂工具调用保护、并发压缩去重、实时缓存未命中美元浪费提示及回环 HTTP Trace 查看器。
5. **非信任项目隔离与 Skill 诊断（`config/`, `core/skills/skillLoader.ts`）**：`auth.json` 与 `config.json` 严格分离、未信任项目隔离门控及对未支持 Skill 字段的 `unhonouredFields` 显式诊断。

---

## 八、严格收敛建议（按投入产出比排序）

1. **立即修通 `380dcc58` 的 4 处半成品断链**：在 `rpcServer.ts` 补齐 `case "abort":`；在 `AgentCore` 透传 `prepareRequest`；在 `turn/step.ts` 接入 `VirtualModelRegistry`、`cacheRetention`、`initialTools` 与 `anthropic-beta` 请求头；让 `execute.ts` 真正消费 `loadInProcessExtension` 或为 Worker 建立真实 RPC 桥。
2. **止血水平膨胀，把非通用垂直域从核心包拆出**：把 `browser/`（257 文件）、`research/`、`advisor/`、`collaboration/`、`planning/` 从 `@cheers/ts-shell` 拆成独立可选 package 或外部插件，把核心聚焦回 `agent`、`provider`、`tools`、`session`、`tui`。
3. **补齐关键工具链与工程底座**：移除运行时 `dependencies` 里的 `typescript`（或仅按需外置/打包），升级 Vitest 并引入 `biome` 门禁，统一用单文件树状 JSONL + 事务存储替换 22 子目录碎片化 `session/`。
4. **补齐核心用户体验缺口**：在 `presentation/tui` 补齐 `BoundedTerminalWriter`、Unicode 区域指示符/ZWJ 宽度与图片头尺寸计算；在 `cliArgs.ts` 补齐 `--model` / `--continue` / `--resume` / `--fork`；在 `export_html` 补齐语法高亮、Thinking 折叠与 Token 统计。

---

## See Also

- [[pi-vs-cheers-deep-gap-analysis-2026-11|Pi vs. Cheers 深度架构与实现差距审计（2026-11-13）]] ([前序局部审计](pi-vs-cheers-deep-gap-analysis-2026-11.md))
- [[local-reference-repositories|Local Reference Repositories]] ([本地参考项目矩阵](local-reference-repositories.md))
- [全仓严格比对原始实证记录](../../raw/notes/2026-11-13-pi-vs-cheers-full-monorepo-audit.md)
- [[pi-parity-prioritized-roadmap-2026-11|Pi 对齐剩余缺陷优先级与任务编排路线图（2026-11-13）]] ([优先级与执行路线图](pi-parity-prioritized-roadmap-2026-11.md))