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

- OpenTUI README：<https://github.com/anomalyco/opentui/blob/main/README.md>。项目明确由 Zig 编写，提供 TypeScript/React/Solid 包，并说明 OpenCode 生产使用。
- OpenTUI core package：<https://github.com/anomalyco/opentui/blob/main/packages/core/package.json>。当前版本为 0.5.11，包含 native 构建脚本、平台 optionalDependencies，Node engine `>=26.4.0`、Bun `>=1.3.0`。
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

## 当前演进状态（2026-09-10，Phase 3 完成）

Phase 2.5-A 至 2.5-E 交付并真机验证后，Phase 3 按删除审计（见 `tui-phase-3-verification.md`）完成收敛：

1. **唯一表面**：`presentation/tui/surface/view.ts` 的 `InteractiveSurface` 是唯一帧提供者，`InteractiveMode` 直接持有它与 `ViewState`；`surface/contract.ts`（原 `tui/view.ts`）承载 `ViewState` / `ViewContext` / `ViewActions` / `InteractiveView` 合约，`keymap.ts` 与 `pointer.ts` 只依赖合约。
2. **表面选择已删除**：`CODING_AGENTS_TUI_SURFACE`、设置项 `tui.surface`、`ViewHost` 与同帧回退全部移除。两条表面曾被逐帧对照证明逐字节相同；第二条只多了两层惰性包装并每帧重复渲染 composer，没有保留价值。
3. **适配层收敛**：`adapter/` 中 12 个从未接入生产的组件（消息、工具卡片、权限弹窗、选择列表、加载器、Markdown 与编辑器包装、布局堆叠、主屏差分、overlay 栈、Surface、主题）连同其测试删除；目录改名 `surface/`，只剩 `contract.ts`、`view.ts`、`pane.ts`（转写窗口）、`scroll.ts`（滚动模型）。
4. **共享底座原样保留**：`render/engine.ts`、`render/paint.ts`、`terminal.ts`、`text/*`、`editor.ts`、`chrome/*`、`transcript/*` 未动。
5. **退出留下转写**：离开备用屏后把转写按当前宽度逐行写到主屏（与参考备用屏渲染器打印最终文档的做法一致），用户退出后可回滚阅读与复制，之后才是 `--resume` 提示。

Phase 2.5 期间落地并保留的能力：合约冻结、`TranscriptPane` 的绝对内容行滚动锚定、滚动条几何与内容坐标映射收敛到 `transcript/viewport.ts` 与 `transcript/selection.ts`、审批三决策与拒绝理由、输入框拖选与边缘自动滚屏、长粘贴与中文输入、非 TTY 可读输出。

## 后续决策点

1. **选型结论不变**：参考 TUI 的组件契约与备用屏语义已经以自有实现落地；不引入其 npm 包，不引入 native 路线。
2. **不再有灰度切流**：任何新的表面能力直接落在 `surface/` 与 `chrome/`，不再开第二条链路；表面的行为测试在 `surface/view.test.ts`。
3. **观察项**：退出文档在 tmux / SSH / Windows Terminal 下的表现；超长会话退出时的一次性写入量（驱动 64MB 积压阈值之内）。

## Phase 4：生产稳定性与能力深化路线（2026-09-11）

### 总体决策

Phase 4 继续使用当前 TypeScript TUI 实现，不引入新的外部渲染运行时。后续工作吸收成熟 TUI 的可验证语义，但所有生产代码继续通过本仓库的 `surface/`、`chrome/`、`transcript/`、`input/` 与 `render/` 边界实现。

这不是再次切换框架，而是从“生产路径已接通”进入“生产行为可证明、可维护、可演进”。

### 设计原则

1. **单一写入者**：`TUI` 仍是唯一终端写入与帧调度边界；不允许第二条默认渲染链路。
2. **单向状态流**：交互宿主负责会话动作、权限决策和生命周期；`InteractiveSurface` 负责将当前状态组合为帧并回答内容几何问题。
3. **先证据后替换**：只有 focused profiler 证明当前实现的具体模块超出预算，才允许启动隔离实验；没有性能证据不更换底座。
4. **兼容优先**：终端模式恢复、备用屏退出、非 TTY 输出、中文宽度、鼠标和键盘协议属于不可回归契约。
5. **能力窄化**：外部实现的概念只能经过本地类型与本地算法验证后吸收，不让外部类型进入 `core`、`session`、`tools` 或模型控制域。

### 4-A：终端生命周期与异常路径

目标：证明所有退出来源都经过同一个幂等清理出口。

- 自动化覆盖 stdin end、输出积压断开、模型回合中断、审批面板中断、问题询问中断和重复 stop。
- 保证 host 清理（stdin、question、clipboard、renderer sink）与终端恢复顺序稳定。
- 记录异常路径的最终 transcript、退出码和残留 ANSI 状态。
- 任何断开后仍可触发的异步 repaint 必须被忽略。

### 4-B：终端兼容矩阵

目标：建立受支持终端和已知限制的可重复记录。

- 终端：Windows Terminal、Linux terminal、SSH、tmux、screen、zellij。
- 能力：备用屏、鼠标上报、括号粘贴、增强键盘协议、同步输出、resize。
- 内容：CJK、组合字符、emoji、超窄宽度、超宽宽度和超长 transcript。
- 每个环境验证启动、流式输出、滚动、选区复制、overlay、resize、Ctrl+C、断开和退出转写。

这一阶段以手动体验为主；自动化只负责固定输入序列、输出边界和终端恢复信号，不用脚本伪造主观手感。

### 4-C：长会话与流式性能

目标：把现有局部 benchmark 提升为可重复的性能预算。

- 测量 finalized transcript 缓存命中、streaming block 更新、窗口切片、差分绘制和退出文档写入。
- 覆盖 50、200、1000 轮以及大量工具输出，不以测试名称代替真实工作量。
- 同时记录帧耗时、输出字节、内存增长和 backlog 重试次数。
- 性能优化只改变被 profiler 证明的热点，保持 `ViewContext`、`ViewActions` 和 transcript 语义不变。

### 4-D：交互能力深化

按用户价值而非框架迁移推进：

1. 统一 overlay focus、Escape/Ctrl+C 取消阶梯和审批结算；
2. 完善滚动、内容坐标选区、拖选边缘自动滚屏与 resize 组合；
3. 完善编辑器的 Unicode 字素、中文输入、长粘贴、历史草稿和光标定位；
4. 保持 streaming assistant/thinking/tool block 的增量更新和失败状态诚实；
5. 将 toast、状态带和 composer 的布局预算固定为可测试契约。

### 4-E：可观测性与发布门

在进入下一次大规模 TUI 结构调整前，必须具备：

- focused build 和行为测试证据；
- 至少一套真实 PTY smoke；
- 终端兼容矩阵记录；
- 长会话性能预算与对比基线；
- 断开、异常退出和重复清理证据；
- 当前 surface 合约、终端恢复顺序和非 TTY 行为文档。

### 何时重新评估外部运行时

只有同时满足以下条件，才重新评估其他渲染运行时：

1. profiler 证明当前 TypeScript renderer 是主要瓶颈；
2. 瓶颈无法通过当前模块内的算法或数据结构修复；
3. 新运行时能在现有 Node 支持范围和发布矩阵内稳定交付；
4. 能通过相同的 surface 行为契约、PTY 场景和非 TTY 回归；
5. 迁移收益明确超过 native 依赖、运行时和维护成本。

在这些条件满足前，外部运行时只作为只读研究材料，不进入生产依赖、不进入默认启动路径。
