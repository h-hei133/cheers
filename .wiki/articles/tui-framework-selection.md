---
title: "TUI 框架选型与渐进式迁移方案"
category: article
sources: [github-opentui, github-ink, github-pi-tui, local-tui-state]
created: 2026-09-06
updated: 2026-09-06
tags: [tui, opentui, ink, pi, architecture, migration]
summary: "基于当前 ts-shell TUI 基础与 GitHub 上游资料，选择 Pi TUI 作为近期集成基线，保留 OpenTUI 作为后续性能路线，明确 Ink 不作为核心渲染替换。"
confidence: high
---

# TUI 框架选型与渐进式迁移方案

## 结论

**近期最适合直接集成的是 `@earendil-works/pi-tui`（Pi 项目的 TUI），而不是 OpenTUI 或 Ink。**

原因不是功能数量，而是边界匹配：当前项目已经有 TypeScript 自研 TUI、事件/终端/输入/渲染/主题/文本布局模块，Pi TUI 同样是 TypeScript、非 React、组件接口简单，并且直接覆盖当前最痛的差分渲染、滚动、括号粘贴、编辑器、Markdown、主题和 overlay 需求。它可以先替换渲染底座与交互组件，而不要求把整个控制面改写成新的 UI 编程模型。

**OpenTUI 适合作为第二阶段性能路线，不适合作为当前低风险迁移目标。** 它由 Zig native core 驱动，依赖 Bun 与 Zig，Node 引擎要求 `>=26.4.0`，而本项目当前要求 Node `>=20.0.0`；采用它会同时引入 native binary、运行时分发、平台矩阵和构建链风险。

**Ink 适合作为独立 React 风格 CLI 的 UI 层，不适合作为当前核心替换。** 它成熟、生态大，但要求 React component tree/Yoga/Flexbox 心智模型；当前项目已有自定义渲染树和大量纯 TypeScript 组件，迁移会重写现有状态与事件边界，不能只替换 renderer。

## 当前项目约束（仓库证据）

- `packages/ts-shell/package.json` 当前只有 `playwright-core` 与 `undici` 运行时依赖，包脚本使用 `tsc`、`tsx`、Vitest。
- `packages/ts-shell/src/presentation/tui/` 已经存在 `editor.ts`、`terminal.ts`、`render/engine.ts`、`input/`、`text/`、`theme/`、`themes/`、`transcript/`、`chrome/` 等完整基础。
- 现有记录确认当前 TUI 使用 alternate screen、自定义渲染，尚缺少真正的滚动模型；用户/助手区分度、长粘贴、主题语义、diff 展示仍是重点问题（见 `articles/tui-resume-scroll-theme.md`）。
- RFC-003 已明确目标是 Pi 风格的差分 ANSI buffer、流式可折叠块和权限弹窗；历史记录已经把 Pi 作为架构参考，而不是陌生技术栈。

## 上游比较

| 候选 | 直接价值 | 集成成本 | 主要风险 | 判断 |
|---|---|---:|---|---|
| Pi TUI | 差分渲染、main/alt screen、ScrollView、Editor、Markdown、Loader、SelectList、overlay、括号粘贴、主题 | 中 | 需要适配现有 AgentEvent 与组件；API 仍要固定 | **首选** |
| OpenTUI | Zig native core、flexbox、鼠标/键盘、scroll box、React/Solid renderer、性能路线 | 高 | Bun/Zig/native 包、Node 版本和平台分发；与现有 TS renderer 边界不一致 | 第二阶段评估 |
| Ink | React renderer、Yoga flexbox、hooks、测试生态、alternate screen、kitty keyboard、paste hook | 高 | React 化会重写组件与状态；运行时双轨；不提供 Pi 风格 agent 组件 | 不选作核心底座 |

### 证据来源

- OpenTUI README：<https://github.com/anomalyco/opentui>。项目明确由 Zig 编写，提供 TypeScript/React/Solid 包，并说明 OpenCode 生产使用。
- OpenTUI core package：<https://github.com/anomalyco/opentui/blob/main/packages/core/package.json>。`@opentui/core` 版本为 0.5.10，包含 native 构建脚本、平台 optionalDependencies，Node engine `>=26.4.0`、Bun `>=1.3.0`。
- Ink README：<https://github.com/vadimdemedes/ink/blob/master/readme.md>。Ink 是 React renderer，使用 Yoga flexbox；提供 `useInput`、`usePaste`、alternate screen、kitty keyboard、测试库与 `renderToString`。
- Pi TUI README：<https://github.com/earendil-works/pi/blob/main/packages/tui/README.md>。提供共享 `TUI` 接口、`TuiMainScreen`/`TuiAltScreen`、差分渲染、同步输出、应用内滚动、括号粘贴、Component 接口、Editor/Markdown/ScrollView/overlay 等。
- 本仓库：`packages/ts-shell/src/presentation/tui/`、`packages/ts-shell/package.json`、`.wiki/articles/tui-resume-scroll-theme.md`、`.wiki/raw/articles/RFC-003-differential-tui-streaming-engine.md`。

## 推荐实现方案：Pi TUI 作为适配层

### 阶段 0：冻结边界，不替换控制面

建立 `presentation/tui-adapter/`（或现有 TUI 目录下的明确 adapter 子域），只负责：

1. `AgentEvent` → Pi TUI 组件状态；
2. 现有 permission/query/session 回调 → 输入与 overlay 回调；
3. 现有 theme semantic tokens → Pi TUI theme 函数；
4. TUI lifecycle（start/stop/resize/interactive detection）→ 当前 CLI entrypoint。

不把模型、工具、权限、会话状态放进组件。组件只消费 view model 和发出用户动作。

### 阶段 1：先接入 Pi 的底层终端能力

优先使用 `TuiMainScreen`，因为它保留终端 scrollback，最符合现有产品的连续 transcript；需要固定 viewport、独立滚动和 modal overlay 时再启用 `TuiAltScreen`。

接入顺序：

1. `ProcessTerminal`/`TUI` 生命周期；
2. `Text`/`Container`/`VStack`/`HStack`/`ScrollView`；
3. `Markdown` 替换当前 transcript Markdown 输出；
4. `Editor` 替换当前 composer/editor，重点验证大段 bracketed paste 与中文 IME 光标；
5. `Loader`、`SelectList`、overlay 接入权限和选择面板；
6. 以现有 `theme.ts` 为唯一 token 来源，不直接散落 chalk 颜色。

### 阶段 2：迁移产品组件，而非复制整个 Pi 应用

建立以下薄适配组件：

- `UserMessage`: 用户输入使用背景色、内边距和满行宽度；
- `AssistantMessage`: Markdown 输出，保持流式增量更新；
- `ThinkingBlock`: 流式展开，完成后折叠；
- `ToolExecutionCard`: 状态、参数摘要、输出滚动与 diff；
- `PermissionDialog`: overlay + focus，保留现有 allow/ask/deny 语义；
- `StatusBar`/`Composer`: 复用现有 session/model/cost/status view model。

每个组件实现 Pi `Component` 接口或由其组合，不允许让 Pi 类型穿透到 `core`、`session`、`tools` 等控制域。

### 阶段 3：删除旧 renderer 的重复职责

当 golden main path 与交互 smoke 场景通过后，再删除旧 `render/engine.ts`、重复 editor、重复 scroll/ANSI 逻辑；迁移期间不得保留两套默认渲染链路并行竞争输出。保留的仅是 adapter、产品组件和领域 view model。

## 验证门槛

每阶段必须验证真实 CLI，而不是只测字符串：

- main screen 与 alt screen 启停后终端恢复；
- 流式 assistant/thinking/tool 事件只更新必要区域且无闪烁；
- 内容超过 viewport 后滚动、Ctrl+End、鼠标滚轮行为正确；
- 连续两次 Ctrl+V、大于 10 行 bracketed paste、中文/IME 输入不乱码；
- 用户消息背景满行宽，assistant/thinking/tool/diff 颜色语义可区分；
- permission overlay 的 allow/ask/deny 和 Escape/Enter 焦点行为保持原契约；
- 非 TTY、CI、管道输出仍得到可读最终文本；
- focused files 的 TypeScript 构建与 TUI 测试通过。

## 不采用方案的明确边界

- 不直接复制 Pi coding-agent 的 session、provider、agent loop；只采用 `packages/tui` 的终端和组件能力。
- 不因 OpenTUI 的性能优势提前引入 Zig；除非 Pi TUI 在真实 transcript 压力测试下成为瓶颈，且团队愿意承担 Bun/native 发布矩阵。
- 不为了使用 Ink 而把现有控制面 React 化；若未来需要 React 组件生态，应在独立 demo/实验包中验证，不改变生产默认路径。

## 后续决策点

1. 先做 Pi TUI adapter spike，限定为一个可运行的 chat transcript + editor + permission overlay。
2. 用真实长 transcript、流式工具输出和大粘贴建立基准；基准未通过前不进行全量迁移。
3. 只有在 adapter 层证明接口稳定后才修改依赖和删除旧 renderer。
4. 若 benchmark 显示 JS 差分渲染不足，再单独评估 OpenTUI；评估必须包含 Node 20 兼容性、Bun/Zig 构建、Linux/Windows/macOS native 包与 CI 发布成本。
