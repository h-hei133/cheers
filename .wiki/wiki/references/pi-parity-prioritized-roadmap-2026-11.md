---
title: "Pi 对齐剩余缺陷优先级与任务编排路线图（2026-11-13）"
category: reference
sources: [raw/notes/2026-11-13-pi-vs-cheers-full-monorepo-audit.md]
created: 2026-11-13
updated: 2026-11-13
tags: [references, pi, roadmap, priority, batches, tracks, ts-shell]
summary: "在修通 380dcc58 的 4 处断链后，将全仓剩余 Pi 差距按 P0–P3 排定优先级，明确划分为可合并执行的耦合批次（Batch A–F）与必须隔离爆炸半径的独立轨道（Track 1–6）。"
confidence: high
---

# Pi 对齐剩余缺陷优先级与任务编排路线图（2026-11-13）

本路线图承接 [[pi-vs-cheers-full-audit-2026-11|Pi vs. Cheers 全仓严格架构与能力差距审计（2026-11-13）]] ([全仓审计报告](pi-vs-cheers-full-audit-2026-11.md))，且排除了已完成修复并验证通过的 4 处 `380dcc58` 断链（`rpcServer.ts` `abort`、`AgentCore` `prepareRequest`、`turn/step.ts` 缓存/Beta/虚拟模型接通、`inProcessLoader.ts` Worker `ExtensionAPI` 桥接）。

---

## 一、优先级与任务归类总表

| 优先级 | 缺陷 / 能力差距 | 核心代码位置 | 执行归类 | 核心原因 |
| :--- | :--- | :--- | :--- | :--- |
| **P0** | `edit` `oneOf` 简化 + 去 4–5× `JSON.stringify` + `TOOL_OUTPUT_LIMIT` 改行/字节统一截断 | `edit/tool.ts`, `tools/preparation.ts`, `core/agent/tools.ts:91,274` | **Batch A（一起）** | 共用工具参数/结果边界与 `turn/tools.ts` 适配，合批一次验证 |
| **P0** | TUI Unicode 宽度补全（国旗区域符/无 `FE0F` ZWJ）+ `BoundedTerminalWriter` 1 MiB 分块写 + 图片头解析与 64 MiB 解码配额 | `presentation/tui/text/width.ts`, `render/engine.ts`, `image.ts` | **Batch B（一起）** | 同在 `presentation/tui` 渲染与行宽计算管线内 |
| **P0** | 工具链基线：`typescript` 移出运行时 `dependencies`、引入 `biome` 门禁、升级 Vitest、`esbuild` 分包 | `package.json`, `packages/ts-shell/package.json`, `scripts/build-cli.mjs` | **Track 1（单独）** | 牵涉格式化全量 Diff 与构建/CI 清单变更 |
| **P1** | Agent Loop 流式部分消息、`AgentMessage`/`Message` 分离、去除硬编码 `keepRecentTurns: 3`、`x-should-retry` 头 | `core/agent/loop.ts`, `turn/messages.ts`, `core/agent/retry.ts` | **Batch C（一起）** | 同属 Loop → Turn → Provider 单轮闭环 |
| **P1** | RPC 补齐会话/模型/树导航命令 + `extension_ui_request`/`response`；`export_html` 补高亮、Thinking 折叠、Token/费用统计 | `cli/rpc/rpcServer.ts`, `cli/runtime/inputStream.ts`, `session/export/` | **Batch D（一起）** | `--rpc` 与 `export_html` 直接耦合交互协议 |
| **P1** | CLI 参数补齐（`--model`/`-c`/`-r`/`--fork`/`-e`/`--no-tools`/`--export`）并重构多遍扫描 `rawArgs` | `entrypoints/cliArgs.ts`, `cliOptions.ts`, `cliModeDispatch.ts` | **Track 2（单独）** | 启动入口全模式耦合，单独验证启动矩阵 |
| **P1** | `codemode` 分支持久化 + TS 声明投影（`describeNamespace`/`image`/`models`）+ `ExtensionAPI` 全量事件/`ui.*`/`pi install` | `core/tools/codemode/`, `extensions/runtime/`, `extensions/lifecycle/` | **Batch E（一起）** | 均服务于可编程扩展抽象，需对齐 Tool Schema 与权限边界 |
| **P1** | TUI 终端协议（OSC `9;4`/`7501`/`133`/`10`/`4`/`16t`/tmux OSC 8）+ 可组合浮层堆栈（替代单 `Picker`） | `presentation/tui/input/`, `terminalCapabilities.ts`, `cli/interactive/overlay.ts` | **Batch B2（单独小批，紧随 Batch B）** | 依赖 Batch B 渲染底座，但涉及浮层交互模型改动 |
| **P2** | 传输/OAuth/MCP（`StreamingJsonParser`、Azure/Mistral/Codex WS+zstd、Anthropic 等 OAuth、MCP PKCE）与 目录/Schema/Telemetry（零 eval 校验、阶梯计费、OTel Span/TraceStore） | `provider/`, `core/auth/`, `core/mcp/`, `core/models/`, `observability/` | **Batch F（拆 F1 协议组 + F2 目录遥测组）** | 外部协议与模型目录各自成组，避免互相拖累 |
| **P2** | 会话级嵌入式 SDK（`createAgentSession` + `DefaultResourceLoader`） | `packages/ts-shell/src/index.ts`, `turn/session.ts` | **Track 3（单独，后置于 C+E）** | 必须等 Loop 与 Extension 契约稳定后定公开签名 |
| **P2** | Monorepo 去臃肿拆分：剥离 `browser/`（257 文件）、`workflow/`、`research/`、`planning/`、`collaboration/`、`advisor/`，收敛 `config/` 与 `scripts/` | `packages/ts-shell/src/*`, `packages/*/`, `scripts/` | **Track 4（单独，架构级）** | 大规模路径与 NormProof 依赖图重构，**必须冻结功能改动单独做** |
| **P3** | 会话存储收敛（22 子目录 → 单文件树状 JSONL + `ContextEditEntry`/`LabelEntry`）+ `pi-durable` 事务 `Storage` | `session/`（22 子目录） | **Track 5（单独，高风险）** | 变更磁盘格式与崩溃恢复语义，须独立配迁移器与一致性套件 |
| **P3** | `chord` 响应式 Delta 同步（替代 HTTP 房间轮询）+ `pi/packages/env` 跨平台远程守护进程（替代单次 `ssh`） | `collaboration/`, `runtime/execution/ssh/` | **Track 6（单独，按需）** | 重型分布式与远程基建，按业务需求单独开启 |
| **P3** | N-API 原生修饰键/剪贴板插件与 `apps/p2` / `p2-mac` 类 Web/桌面产品矩阵 | `presentation/tui/`, 新增 `apps/` | **暂缓（待产品定位明确）** | 涉及多平台原生编译链与产品形态扩张 |

---

## 二、标准推进顺序

1. **基线与高 ROI 工具/渲染止血（优先执行）**
   - **`Track 1`**（工程工具链去 `typescript` 依赖 + `biome` + `esbuild`/Vitest 基线，独立前置提交）
   - **`Batch A`**（`edit` Schema 简化 + 去重复 `JSON.stringify` + `TOOL_OUTPUT_LIMIT` 统一截断）
   - **`Batch B` → `Batch B2`**（TUI 分块写 / Unicode / 图片配额 → OSC 终端协议 / 可组合浮层）
2. **核心运行时、无头协议与扩展能力齐平**
   - **`Batch C`**（Loop 流式部分消息 + Turn 前缀解耦 + `x-should-retry`）
   - **`Batch D`**（RPC 命令与 UI 协议 + HTML 导出高亮/Thinking/统计）
   - **`Batch E`**（`ExtensionAPI` 完整事件/`ui.*`/包管理 + `codemode` 持久化/TS 投影）
   - **`Track 2`**（CLI 参数体系重构与 `--model`/`-c`/`-r`/`--fork` 补齐）
   - **`Track 3`**（在 Batch C + E 完成后暴露 `createAgentSession` 嵌入式 SDK）
3. **外部协议完善与重型架构演化**
   - **`Batch F1 / F2`**（传输流式 JSON/端点/OAuth/MCP PKCE + Schema 编译/阶梯定价/OTel）
   - **`Track 4`**（Monorepo 垂直域拆出 `@cheers/ts-shell`，冻结功能改动专轮推进）
   - **`Track 5` → `Track 6`**（单文件树状会话与事务存储 → 远程 `env` 守护进程 / `chord` Delta 同步）

---

## See Also

- [[pi-vs-cheers-full-audit-2026-11|Pi vs. Cheers 全仓严格架构与能力差距审计（2026-11-13）]] ([全仓审计报告](pi-vs-cheers-full-audit-2026-11.md))
- [全仓严格比对原始实证记录](../../raw/notes/2026-11-13-pi-vs-cheers-full-monorepo-audit.md)