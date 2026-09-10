---
title: "TUI 框架选型与渐进式迁移方案"
category: article
sources: [github-opentui, github-ink, github-pi-tui, local-tui-state]
updated: 2026-09-10
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

## Phase 2.5：生产表面组装、能力对齐与可逆切流

### 目标与边界

Phase 2.5 是 Phase 2（组件已经存在）与 Phase 3（清理被替代职责）之间缺失的生产集成阶段。它**不删除旧 renderer、不修改 core/session/tools 控制域、不复制完整应用**；唯一目标是让 adapter 成为一个可真实承载 CLI 交互、可观测、可回退的生产表面。

完成标准：`InteractiveMode` 可以通过一个明确的 Surface seam 选择当前生产表面；默认仍保持现有表面，adapter 先以显式实验入口运行；两条路径共享同一套 view model、动作回调、权限决策与终端生命周期，不允许同时向同一终端写帧。

### 当前事实与阻塞

- 生产入口 `packages/ts-shell/src/cli/interactive/interactiveMode.ts` 直接创建 `TUI` 与 `InteractiveSurface`，`keymap.ts`、`pointer.ts` 也把 `InteractiveSurface` 写死在类型边界中。
- adapter `presentation/tui/adapter/surface.ts` 当前只是 `TUI` 的生命周期/overlay/输入薄壳；其 spike 由测试手工组装 `Transcript`、`Composer` 和 `StatusBar`，尚未接入 `InteractiveMode`。
- `adapter/` 组件尚未完整承载生产表面的内容空间选区、`ScrollbarGeometry`/滑块拖拽、Toast 生命周期、审批面板与所有快捷键语义。因此当前不能删除 `frameSurface.ts`、`render/engine.ts` 或 `tui/editor.ts`。

### 复用决策

1. **保留并复用当前终端底座**：`terminal.ts`、`render/engine.ts`、`render/frame.ts`、`render/paint.ts`、`text/*` 是共享基础设施，不属于 Phase 3 清理对象。
2. **复用 adapter 组件契约**：采用现有 `ViewComponent` 的 `render(width)`、`handleInput`、`handlePointer`、`invalidate`；不让 adapter 类型穿透 `core`、`session`、`tools`。
3. **新增一个表面级 seam，而非新增平行引擎**：将 `InteractiveMode` 依赖从具体 `InteractiveSurface` 收敛到最小 `InteractiveView` 合约：`start/stop/render/requestRender/screenRows/scroll/scrollToEnd/setSuggesting`，输入和权限动作通过已有回调注入。
4. **状态单向流动**：`SessionFacts`、转写 blocks、composer snapshot、activity、toast、overlay model 由控制面生成；Surface 只投影 view model 并发出 submit/cancel/scroll/copy/approval 等动作。
5. **能力迁移采用复用而非重写**：内容坐标映射、选区清理、滚动条几何、Toast 清理、审批 overlay 先抽取为生产与 adapter 共同消费的窄接口；不得复制两份算法，也不得把 adapter 直接反向依赖 `InteractiveMode`。

### 分阶段执行计划

#### 2.5-A：冻结兼容合约

- 定义 `InteractiveView`、`ViewActions`、`ViewSnapshot` 三个最小领域无关接口，明确输入、尺寸、渲染、滚动、选区复制和 overlay 动作的所有权。
- 把 `keymap.ts` 与 `pointer.ts` 从具体 `InteractiveSurface` 类型改为合约类型；先保留旧表面实现，确保行为零变化。
- 用类型测试和现有交互回归证明旧路径仍是唯一默认输出路径。

#### 2.5-B：组装完整 adapter Surface

- 在 `adapter/` 内新增简洁的组装模块（建议 `view.ts`，不创建 route/phase 等历史性文件名），把 `Transcript`、消息/工具卡片、`Composer`、`StatusBar`、`Hints`、`ScrollView`、`OverlayStack` 组合为一帧。
- 适配生产 `AgentMessage`、`SessionFacts`、权限请求与 action callback；控制域只接收动作，不接收组件实例或渲染类型。
- 补齐实时生产能力：流式 assistant/thinking/tool、失败工具默认展开、用户消息满宽背景、Toast 原地覆盖、内容空间选区、滚动条几何与抓取拖拽、权限三决策。

#### 2.5-C：输入与生命周期接线

- 在 `InteractiveMode` 中增加显式表面工厂或注入点；默认值仍为当前生产表面，实验开关只选择 adapter，不允许两者并行写终端。
- 统一 raw input、resize、start/stop、alternate-screen 恢复、硬件光标、bracketed paste、IME 字节解码和 overlay focus 路由。
- 统一 `requestRender` 调度与 `screenRows`/内容坐标映射，使 pointer/keymap 不再依赖具体实现。

#### 2.5-D：可逆切流与故障回退

- 先运行 adapter 的离线合成测试，再以显式实验入口进行真实 CLI smoke；默认生产路径不改变。
- 记录 adapter 与当前表面的同一输入序列结果：首帧、流式增量、滚动位置、选区内容、Toast、审批结果、退出恢复。
- 发现任一关键行为不一致时回退到旧表面；回退必须清理输入监听器、overlay、光标和备用屏，不得留下半切换状态。

#### 2.5-E：进入 Phase 3 的门槛

Phase 2.5 完成后，才允许重新进行 Phase 3 删除审计。必须同时满足：

1. adapter 已在真实 `InteractiveMode` 路径运行，而非只在 spike 测试中手工组装；
2. 连续两轮真实 CLI smoke 通过：启动/退出恢复、流式消息、工具输出、权限三决策、resume、滚轮/滑块、内容空间选区、Toast、长粘贴与中文输入；
3. adapter 与旧表面的行为对照不存在未解释差异，且非 TTY/CI/管道输出保持可读；
4. 适配层具备 focused regression tests、性能预算和构建证据；
5. 删除审计确认目标文件是“被替代的专属职责”，不是共享底座；任何共享模块保留。

### 不采用的方案

- 不把 adapter 直接替换成一个新的终端引擎；现有 `TUI` 继续作为唯一帧调度与终端写入边界。
- 不复制完整参考应用的 session/provider/agent loop；只借鉴组件契约、事件坐标转换、滚动与 overlay 的语义。
- 不设置默认双渲染或运行时同时绘制两套表面；实验路径必须显式、可逆、单写入者。
- 不以单元测试或 benchmark 单独宣布切流完成；真实 CLI 行为与回退证明是硬门槛。

## 当前演进状态（2026-09-10）

Phase 2.5-A 至 2.5-E 已全面落地并通过真机与自动化双重验证，进入 Phase 3 准备阶段：

1. **2.5-A 合约已冻结**：`presentation/tui/view.ts` 定义 `ViewState`、`ViewContext`、`ViewActions` 与 `InteractiveView`。最新补充 `ComposerGeometry` 与 `composerSelection`，`keymap.ts` 与 `pointer.ts` 只依赖合约；输入框选区与转写区选区共享同一套高亮与复制提取契约。
2. **2.5-B 组装模块已存在**：`adapter/view.ts` 的 `ComposedView` 与直接渲染表面 `frameSurface.ts` 均接入 `adapter/pane.ts`（共享 `TranscriptPane`），滚动条几何、内容坐标映射、选区着色收敛为 `transcript/viewport.ts` 与 `transcript/selection.ts`，两套表面不存在两份算法。
3. **2.5-C 接线已完成**：`cli/interactive/surface.ts` 的 `ViewHost` 是唯一帧提供者，`InteractiveMode` 只持有 `ViewHost` 与 `ViewState`；表面通过 `CODING_AGENTS_TUI_SURFACE` 环境变量或设置项 `tui.surface`（`frame` | `composed`）选择，默认仍为 `frame`，单写入者契约成立。
4. **2.5-D 回退与对照已具备证据**：`ViewHost` 在实验表面渲染抛错时于同一帧内换回默认表面，保留 transcript 与草稿，在 transcript 追加错误说明；默认表面失败直抛不吞。`cli/interactive/surface.test.ts` 逐帧对照覆盖首帧、流式增量、失败工具、翻页/滑块、选区、Toast、补全与全屏 overlay。
5. **2.5-E 全门槛实测闭环**：
   - 连续多轮流式对话与安静中断正常，跨轮历史连贯；
   - 审批三决策正常，支持单键快捷直达，支持拒绝时可选输入理由并直接将用户指令反馈给模型（避免重复错误动作）；
   - 选区内容坐标锚定（新输出不推走阅读行），输入框内支持鼠标拖选复制，拖拽到达上下边缘支持 70ms 自动平滑滚屏；
   - 长粘贴占位符展开、中文无光标重影；真实 `/compact` 压缩后 gauge 实时重置；
   - 删除了所有关键词内置默认回复，提示直通模型；
   - 非 TTY 管道输出纯文本无转义残留，退出码 0。

## 后续决策点

1. **Phase 2.5 正式交付**：Phase 2.5 功能与稳定性已满足全部预设门槛，**无需再次进行运行时代码功能开发**。
2. **Phase 3 准入与删除审计**：删除阻塞已解除。下一步启动 Phase 3 删除审计，严格限定审计范围为“被替代的专属胶水”，共享底座（`TUI` 引擎、`TranscriptPane`、`viewport.ts`、`selection.ts`、文本测量、`Editor`、终端驱动）永久保留。
3. **灰度切流策略**：默认生产表面维持 `frame`，用户或测试可显式配置 `composed` 体验组件表面；在真实长周期压力下持续收集两者稳定性差异。
