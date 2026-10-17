---
title: "TUI 能力矩阵：逐组件行号级对照"
category: article
sources: [repo-audit-2026-10-15, packages/ts-shell/src/presentation/tui/, packages/ts-shell/src/presentation/sidebar/, packages/ts-shell/src/cli/interactive/, packages/ts-shell/src/presentation/tui/surface/benchmark.test.ts, oh-my-pi/packages/tui/src/components/, oh-my-pi/packages/tui/src/overlays/, codex/codex-rs/tui/src/, pi/packages/tui/src/, 14-tui-composer-and-theme.md, 15-tui-status-and-panels.md]
created: 2026-10-15
updated: 2026-10-17
tags: [features, tui, capability-matrix, optimization, gap-analysis]
summary: "源码能力矩阵：Cheers已有表格、度量、折叠、滚动数学、动态补全、长粘贴折叠及transcript缓存；缺通用树/多字段表单/tab原语。缓存计数不代表真实帧性能等价。用户已将Vim、Markdown数学、多行表格、并排diff、逐hunk审批全部纳入Phase20，须分别定义渲染与授权契约。"
confidence: high
---

# TUI 能力矩阵与优化方向

只读研究。未修改源码。源码基线 `0d30d589`；参考快照 oh-my-pi `c2cb79e4`、codex `4210c08d`、pi `4a5d3729`。

**2026-10-17 源码复核**：本次仅修订文档，未新增动态、性能或PTY验证。历史文件大小/行数用于定位，不能证明成熟度、性能优劣或实施工作量。正文方向ID使用 `31/方向/D-xx`，附录决策使用 `31/能力/D-xx`，保留原编号但不得混淆。

**2026-10-17 用户裁决**：Vim模式、Markdown数学、多行表格、并排diff与逐hunk审批全部纳入Phase20。此裁决是目标范围，不是现有实现或验证完成的证据。

> **2026-10-15 重大更正**：本文初版用**文件大小**论证能力差距（14 处），且参考侧只给目录级路径（仅 7 处行号引用），被 [32 R-01](32-defect-register-2026-10.md#r-01-tui能力矩阵) 判为「最浅薄的一份」。专项深挖（本文「oh-my-pi TUI 组件深挖：逐能力行号级对照」）后更正 **4 处过度声称**：表格、度量、折叠、滚动视图 **Cheers 已具备**，初版误判为「缺失」。下文表格已按行号级证据重写。

> **更正**：本轮一个子代理报告 Cheers「缺运行时键位重映射」。**核实为误**——`KEY_ACTIONS` 是完整可重映射目录（[keybindings.ts:33-90](../../packages/ts-shell/src/cli/interactive/keybindings.ts#L33)），用户文件 `~/.cheers/keybindings.json`（[keybindings.ts:101](../../packages/ts-shell/src/cli/interactive/keybindings.ts#L101)），且已有文档 [guides/keybindings.md](../guides/keybindings.md)。该能力**已具备**。

## 1. 组件清单对照（行号级，2026-10-15 重写）

行数为实测（`wc -l`），能力描述见 本文「oh-my-pi TUI 组件深挖：逐能力行号级对照」。

| 能力 | Cheers（行数） | oh-my-pi（行数） | 判定 |
|---|---|---|---|
| Markdown | `transcript/markdown.ts` **177** + `markdownScan.ts` 162 + `mermaid.ts` 182 | `components/markdown.ts` **4,280** | **更弱**（见 §2） |
| 输入编辑器 | `editor.ts` **325** + `editor/buffer.ts` 207 + `editor/layout.ts` 110 | `components/editor.ts` **5,009** | **更弱**（见 §2.2） |
| 表格 | `transcript/markdown.ts:92-122`（pipe）+ `report/renderer.ts:31-66`（结构化列 + 窄屏堆叠） | `components/table.ts` **165** | **已具备**；缺列优先级收缩（`fitWidths`，`table.ts:36-54`） |
| 列表选择 | `chrome/options.ts` + `panel.ts` + `modal.ts` + `suggestions.ts` | `components/select-list.ts` | 已有过滤、窗口、选择和overlay删除确认；缺复用的多列/显式搜索布局，panel另有8项封顶 |
| 折叠 | `transcript/blocks.ts:47-51,161-174,221-226` + `container.ts:88-97` + `view.ts:164-176`（`Ctrl+T`/`Ctrl+O`） | `components/disclosure.ts` **276** | **已具备**；缺任意组件包装（`body: () => Component`）与 `maxCollapsedRows` |
| 度量 | `chrome/band.ts` 48 + `chrome/items.ts` 172 | `components/metric.ts` **171** | **已具备** |
| 滚动视图 | `surface/scroll.ts` 66 + `transcript/viewport.ts` 181 | `components/scroll-view.ts` **569** + `scroll-viewport.ts` **154** | **部分**：有偏移与拇指几何；缺通用容器与 `revealRange` 对齐策略 |
| 通用树视图 | `/tree`已有平铺picker与业务数据，缺通用层级渲染原语 | `components/tree-view.ts` | 缺的是通用树组件，不是树业务能力全部缺失 |
| 多字段表单原语 | 已有 `picker/input.ts` 单字段与各域向导，缺通用多字段焦点容器 | `components/form.ts` | 按真实向导需要补焦点、字段校验与提交生命周期 |
| Tab 条 | **无** | `components/tab-bar.ts` **354** | **缺失**（确认） |
| 进度条 | **无** | `components/progress-bar.ts` **168** | **缺失**（确认） |
| 段落容器 | Markdown 标题 + `report/renderer.ts:33-43` | `components/section.ts` **98** | 平手（形态不同） |
| diff | `transcript/diff.ts`（统一 diff + 行内强调） | codex `diff_render.rs` 已证实统一格式、行号及预览预算；不是并排或逐hunk授权范例 | **缺口已定纳入Phase20**：并排显示、逐hunk审批分别实现 |
| 键位重映射 | **已有** | `keybindings.ts`、`app-keybindings.ts` | 平手 |
| Vim 模式 | **无** | `vim.ts`（10 KB） | **缺失** |
| 侧边栏 | `presentation/sidebar/` | 多面板 overlay | 平手 |

**更正说明**：初版把表格、度量、折叠、滚动视图列为「缺失/更弱」，是因为只看了 omp 侧组件清单，没有检索 Cheers 侧的等价实现。实测 Cheers 四处都有实现，只是**模块名不同、能力边界更窄**。这属于 [32](32-defect-register-2026-10.md) 判定的 S2（只测一侧）。

## 2. Markdown 差距的具体内容

Cheers 支持：标题、代码块（highlight.js）、引用、列表、pipe 表、mermaid（`grok-mermaid`）、链接、行内强调。

已定向取证的参考差异见附录§4：数学、表格多行单元格、特定围栏修复与流式布局；多行cell内跨newline/soft-wrap的OSC8状态属于新增集成契约，不能概括为Cheers所有文本都缺跨行状态保留。原稿把可执行代码单元格/SVG/工具提示泛称为Markdown固有能力，缺少直接证据，已撤回。能力优先级由产品需求与反例决定，不能仅按“有/无组件”排序。

## 3. 渲染成本：Cheers 的强项

`surface/benchmark.test.ts` 以**工作量计数**而非墙钟断言（[benchmark.test.ts:8-18](../../packages/ts-shell/src/presentation/tui/surface/benchmark.test.ts#L8) 注释明确解释原因：墙钟阈值曾在全量套件里假失败）。断言包括：

| 断言 | 内容 |
|---|---|
| 20,000 个缓存块每帧只组合一次 | `layouts === 0`、`render` 调用一次、`rows` 长度符合 document/viewport 语义 |
| 已定稿 transcript 重渲染不重新布局 | 第二次 `render` 后 `layouts` 不变 |
| 流式单块不重排已定稿块 | 20 次增量中历史不重算 |
| 长 transcript 通过 pane 开窗 | 恰好 30 行 |
| 宽度交替不抖动 | 布局次数等于**不同宽度数**而非帧数 |

这些测试约束了缓存、单块更新、帧组合及宽度槽的工作量；它们不证明所有行差分正确，也不测真实终端帧延迟。历史墙钟优化记录不能直接外推当前性能，更不能据此宣称与参考等价。实施时保留这些工作量不变量，再对长草稿、长流式块、resize与真实绘制测量。

## 4. 滚动与搜索

Cheers 具备：

- `ScrollModel` 跟踪 `scrollTop` 与 `isFollowingEnd`（跟随最新，用户回滚后停止跟随）。
- 滚动条几何（`viewport.ts`）。
- 增量搜索：`search.ts` + `searchState.ts` + `chrome/searchBar.ts`，搜索栏占用 hint 行而非 composer 行（[searchBar.ts:11-16](../../packages/ts-shell/src/presentation/tui/chrome/searchBar.ts#L11)）。
- 搜索栏显示 `find: <query>`、`n/total`、`no matches`、按键提示。

**限制**：搜索仅在 fullscreen 可用——`regular` 模式下提示「Transcript search requires fullscreen mode; use terminal search here.」（[interactiveMode.ts:553](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts#L553)）。

参考额外提供：vi 风格导航（`/`、`?`、`n`、`N`）、正则搜索、跳转到 commit/tool。

## 5. `regular` 与 `fullscreen` 的差异

- 模式开关：`alternateScreen = tuiMode !== "regular"`（[interactiveMode.ts:233](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts#L233)）。
- `regular` 把内容留给终端自身 scrollback；`fullscreen` 接管备用屏。
- `MainScreenPainter`（`render/mainScreen.ts`，17.6 KB）服务 `regular` 路径。
- 已知差异：搜索仅 fullscreen；`regular` 的历史 reflow 由终端负责（[16](16-input-slash-startup-context.md) 已记录 `CURSOR_MARKER` 泄漏风险并修复）。

## 6. 优化方向（按证据强度排序）

| # | 方向 | 证据 | 参考解法 | 风险 |
|---|---|---|---|---|
| D-01 | **列表/面板预算抽象**（去掉panel固定8项） | [30](30-panels-and-model-picker.md) §1：候选充足时panel至多8项，modal另算 | 外层预算驱动 | 影响共享panel、鼠标命中与小屏，不能只改常量后宣称完成 |
| D-02 | **模型面板分层 + 搜索** | [30](30-panels-and-model-picker.md) §2：目录较长、connected元数据可能误标；普通model行并非全禁用 | tab + fuzzy | 需共享配置可用性投影，不把配置存在当远端已验证 |
| D-03 | **结构化报告面板**（替代文本墙） | 用户对 `/help` 等「一堆没排版的文字」的抱怨；`pager.ts` 已有 `CommandReport` 通道 | omp `report-panel.ts`、codex command popup | 中：需要命令侧产出结构化数据 |
| D-04 | **通用滚动/树/表单原语** | 已有滚动数学及各域入口，缺可复用容器/焦点/层级投影 | `scroll-view.ts`、`tree-view.ts`、`form.ts` | 由实际面板需求提炼，避免重建并行UI系统 |
| D-05 | **并排 diff / 逐 hunk 审批** | §1 diff 行；`diff.ts` 仅统一格式 | codex仅提供统一diff预算与整request审批的比较证据；新增设计见末附录 | 高：显示与授权分域，用户已全部纳入Phase20 |

注：D-01/D-02有用户对尺寸与状态标注的报告支撑；D-03有输出排版需求。D-04按现有面板改造所需实施；D-05的并排显示和逐hunk审批是两项独立能力，用户已明确两项均纳入Phase20，对应 `RENDER-03` 与 `EDIT-01`。

## 7. 未验证项

- 未在真实 PTY 中逐项目视确认能力矩阵（结论来自模块清单与源码阅读）。
- 未实测 `regular` 模式下 `MainScreenPainter` 的重排成本。
- 未以受控PTY验证数学、表格和diff扩展的显示、输入与源码复制契约；不把可执行单元格列为已证实的参考能力。
- 未量化 D-04 抽象引入后的回归风险。

---

## 附：oh-my-pi TUI 组件深挖：逐能力行号级对照

只读研究。未修改产品源码。参考快照 oh-my-pi `c2cb79e4`；Cheers 基线 `0d30d589`。

本文是 [32 R-01](32-defect-register-2026-10.md#r-01-tui能力矩阵) 要求的专项研究，用于替换 本文「TUI 能力矩阵」 初版的「文件大小对照」。

### 0. 方法更正

初版的问题（[32](32-defect-register-2026-10.md) 判为 S1+S2+S4）：

| 问题 | 表现 |
|---|---|
| S1 | 参考侧只给目录路径（`components/`、`overlays/`），7 处行号 |
| S2 | 只看 omp 侧清单，未检索 Cheers 侧等价实现 |
| S4 | 14 处文件大小对比，倍数当结论 |

本文每条都给**双侧行号**。

### 1. 行数实测（`wc -l`）

| 组件 | oh-my-pi | Cheers | 比 |
|---|---|---|---|
| markdown | **4,280** | 177（+ 162 scan + 182 mermaid = 521） | 8× |
| editor | **5,009** | 325（+ 207 buffer + 110 layout = 642） | 8× |
| select-list | **833** | 140 + 128 + 120 + 150 = 538 | 1.5× |
| form | **658** | 无 | — |
| tree-view | **576** | 无 | — |
| scroll-view | **569** + 154 viewport | 66 + 181 = 247 | 3× |
| tab-bar | **354** | 无 | — |
| disclosure | **276** | 见 §3.3（内建于 transcript） | — |
| metric | **171** | 48 + 172 = 220 | 数量不可作能力比较 |
| progress-bar | **168** | 无 | — |
| table | **165** | `markdown.ts:92-122` + `report/renderer.ts:31-66` | 两侧均有，语义见§2.1 |
| section | **98** | 内建于 markdown + report | 入口形式不同，不由行数判平手 |

### 2. 更正 31 号的 4 处过度声称

#### 2.1 表格——Cheers **已具备**

初版说「无独立表格组件」。实测两处实现：

1. **pipe 表**（[markdown.ts:92-122](../../packages/ts-shell/src/presentation/tui/transcript/markdown.ts#L92)）：`renderTable`，提取单元格、算列宽、`─┼─` 边框。
2. **结构化报告表**（[report/renderer.ts:31-66](../../packages/ts-shell/src/presentation/tui/report/renderer.ts#L31)）：`layoutReport` 支持 `column.minWidth`、`align: 'left'|'right'`、ANSI span 样式，且**窄屏自动堆叠为键值对**（`const stacked = widths.reduce(...) > width`）。

**真实差距**：omp 的 `fitWidths`（[table.ts:36-54](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/table.ts#L36)）按列 `priority` 收缩。Cheers的结构化report测量内容宽度，放不下就整体堆叠为字段键值行（[renderer.ts:36-52](../../packages/ts-shell/src/presentation/tui/report/renderer.ts#L36)），不是等比例收缩。新列优先级设计不能破坏原有“字段不丢失”的降级契约。

#### 2.2 度量——Cheers **已具备**

初版说「缺进度/度量」。实测 Cheers 有：

- `renderBand`（[band.ts:21-48](../../packages/ts-shell/src/presentation/tui/chrome/band.ts#L21)）——状态带，宽度压力下丢弃右侧段。
- `renderStatusItem`（[items.ts:20-170](../../packages/ts-shell/src/presentation/tui/chrome/items.ts#L20)）——15 种状态项，带语义着色。

omp 的 `MetricRow`（[metric.ts:81-144](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/metric.ts#L81)）是**通用度量行**（`MetricSpec[]` + `formatMetric`），Cheers 的状态项是**固定枚举**。差距在通用性，不在有无。

#### 2.3 折叠——Cheers **已具备**

初版的整体“平手”缺少共同验收尺度。Cheers已具备以下具体折叠能力：

- 思考块默认折叠为 `● thought · click to expand`（[blocks.ts:161-174](../../packages/ts-shell/src/presentation/tui/transcript/blocks.ts#L161)）。
- 工具块折叠为 `tool name · N lines · click to expand`（[blocks.ts:221-226](../../packages/ts-shell/src/presentation/tui/transcript/blocks.ts#L221)）。
- `setCollapsed` 失效块缓存（[container.ts:93-96](../../packages/ts-shell/src/presentation/tui/transcript/container.ts#L93)）。
- `toggleCollapsed` 由 `Ctrl+T`/`Ctrl+O` 驱动（[view.ts:164-176](../../packages/ts-shell/src/presentation/tui/surface/view.ts#L164)）。

**真实差距**：omp 的 `Disclosure`（[disclosure.ts:35-173](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/disclosure.ts#L35)）是**任意组件的包装器**（`body: () => Component` 惰性实例化 + `maxCollapsedRows` 预览上限）。Cheers 的折叠内建于 transcript 块，不能包装任意组件。

#### 2.4 滚动视图——Cheers **部分具备**

初版说「耦合 transcript」。实测 Cheers 有完整的偏移与拇指数学：

- `ScrollModel`（[scroll.ts:8-66](../../packages/ts-shell/src/presentation/tui/surface/scroll.ts#L8)）：`scrollTop`、`isFollowingEnd`、`scrollBy`、`scrollToStart/End`。
- `scrollbarGeometry` / `paintScrollbar` / `thumbTargetTop`（[viewport.ts:34-95](../../packages/ts-shell/src/presentation/tui/transcript/viewport.ts#L34)）。

**真实差距**（3 项）：

1. 无**通用容器**（omp `ScrollView` 可包任意 `Component` 或字符串数组，[scroll-view.ts:95-135](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/scroll-view.ts#L95)）。
2. 无 `revealRange` 对齐策略（`"nearest"|"start"|"center"|"end"`，[scroll-view.ts:178-218](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/scroll-view.ts#L178)）。
3. 缺通用容器的内建滚动键路由；Cheers交互层已有各自滚动键，不能说整个产品没有滚动键。参考组件把 Up/Down/PageUp/PageDown/Home/End 等路由放在容器内（[scroll-view.ts:220-250](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/scroll-view.ts#L220)）。

### 3. 确认的真实缺失（4 项）

#### 3.1 树视图（`tree-view.ts` 576 行）

omp 提供（[tree-view.ts:216-345](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/tree-view.ts#L216)）：

- **AncestorChain**（[tree-view.ts:49-59](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/tree-view.ts#L49)）——共享祖先链，深树 O(depth) 内存而非 O(N²) 复制。
- 展平器带**循环保护与条目预算**（[tree-view.ts:60-128](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/tree-view.ts#L60)）。
- gutter 字形：`├──` / `└──` / `│`（`treeRowPrefix`，[tree-view.ts:146-159](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/tree-view.ts#L146)）。
- **层级过滤**：过滤祖先时把可见后代上提到最近可见祖先（[tree-view.ts:291-300](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/tree-view.ts#L291)）。

Cheers 要实现：祖先链结构、迭代式 DFS 展平 + 展开态、连接符数学、过滤索引与 key 的映射。**注意**：`/tree` 面板（`picker/tree.ts` 1,361 字节）目前是平铺列表，`tree-selector.ts` 的 gutter 逻辑（见 [33 §B](33-omp-panel-mapping.md#b-tree--treeselector)）在 overlay 层，不在通用组件层。

#### 3.2 表单（`form.ts` 658 行）

omp 提供（[form.ts:126-655](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/form.ts#L126)）：

- `FormField` / `TextFormField` / `SelectFormField` 三类。
- `focusNext` / `focusPrev` / `focusIndex` 焦点循环（[form.ts:572-600](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/form.ts#L572)）。
- **校验生命周期**：字段级错误设置 + 校验失败阻止提交（[form.ts:173-180,360-385](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/form.ts#L173)）。
- SGR 鼠标命中测试路由（[form.ts:645-655](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/form.ts#L645)）。
- 字段块布局：label / description / control / error / hint / preview / summary（[form.ts:126-250](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/form.ts#L126)）。

Cheers已有单字段 `picker/input.ts` 及各域流程；本轮缺口是可复用的多字段焦点与校验容器，不代表所有向导能力不存在。

#### 3.3 Tab 条（`tab-bar.ts` 354 行）

omp 提供（[tab-bar.ts:55-310](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/tab-bar.ts#L55)）：

- 格式 `"Label:  Tab1   Tab2   Tab3  (tab to cycle)"`，含 active/inactive/muted/hovered 四态。
- 循环导航 Tab/Shift+Tab/方向键，**跳过 muted tab**（[tab-bar.ts:132-152](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/tab-bar.ts#L132)）。
- **鼠标命中区**：渲染时记录每个 tab 的 `[start, end)` 列范围（[tab-bar.ts:270-305](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/tab-bar.ts#L270)）。
- **紧凑标签回退**：宽度不足时切到 `tab.short`（图标）而非截断。

**注意**：这与 [34](34-panel-conversion-plan.md) 的 P-03 是同一件事——引入 tab 条需要先实现这个原语。

#### 3.4 进度条（`progress-bar.ts` 168 行）

omp 提供分数填充与不确定态样式。Cheers 无。

### 4. Markdown 差距的具体内容（替换初版 §2）

#### 4.1 omp 的 `Markdown` 类

（[markdown.ts:1846-2433](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/markdown.ts#L1846)）

```ts
export class Markdown implements Component {
  constructor(text: string, paddingX: number, paddingY: number, theme: MarkdownTheme,
              defaultTextStyle?: DefaultTextStyle, codeBlockIndent?: number)
  setText(text: string): boolean
  getLastRenderStableText(): string
  setIgnoreTight(ignore: boolean): this
  render(width: number): readonly string[]
}
```

**能力清单**（逐项行号）：

| 能力 | 位置 |
|---|---|
| CommonMark + GFM（Marked lexer） | [1129-1131](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/markdown.ts#L1129) |
| 行内数学 `$..$` → Unicode | [663-672](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/markdown.ts#L663) |
| 显示数学 `$$..$$` → 块 | [678-687](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/markdown.ts#L678) |
| 裸 LaTeX 环境（`\begin{equation}`） | [753-765](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/markdown.ts#L753) |
| 平衡删除线 `~~` 匹配 | [548-601](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/markdown.ts#L548) |
| Gemini 孤立围栏修复 | [108-160](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/markdown.ts#L108) |
| OSC 8 超链接规范化与跨行保留 | [54-65](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/markdown.ts#L54)、[4000-4015](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/markdown.ts#L4000) |
| 流式前缀冻结（跨 `\n\n` 边界） | [2377-2415](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/markdown.ts#L2377) |
| 尾部行缓存 | [2819-2845](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/markdown.ts#L2819) |
| 有状态流式语法高亮 | [3138-3195](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/markdown.ts#L3138) |
| GFM 表多行单元格 + ANSI/OSC-8 保留 | [3998-4150](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/markdown.ts#L3998) |

#### 4.2 Cheers 的 `renderMarkdown`

（[markdown.ts:51](../../packages/ts-shell/src/presentation/tui/transcript/markdown.ts#L51)）

```ts
export function renderMarkdown(text: string, width: number): string[]
```

纯函数（非组件），正则块扫描（[markdownScan.ts:76-150](../../packages/ts-shell/src/presentation/tui/transcript/markdownScan.ts#L76)）+ 正则行内替换（[markdown.ts:33-47](../../packages/ts-shell/src/presentation/tui/transcript/markdown.ts#L33)）。

**本次两个Markdown入口的差异**：Cheers内置Mermaid渲染（[mermaid.ts:43-137](../../packages/ts-shell/src/presentation/tui/transcript/mermaid.ts#L43)）；参考该组件未见同样入口，不据此宣称参考整个产品没有Mermaid能力。

**真实差距**（按用户可见性排序）：

| # | 差距 | 影响 |
|---|---|---|
| 1 | 数学公式（行内/显示/LaTeX 环境） | 技术文档不可读 |
| 2 | 表格多行单元格（Cheers 截断为单行） | 长单元格丢内容 |
| 3 | 多行cell跨newline/soft-wrap的ANSI/OSC8状态集成 | 新表格管线须保留；一般文本carry与行末关闭已有实现，未经复现不判全局缺失 |
| 4 | Gemini 围栏修复 | 特定模型输出被吞进代码块 |
| 5 | 流式渲染缓存层级 | 长回答重绘成本 |

**OSC8事实收窄**：Cheers [text/layout.ts:61–66](../../packages/ts-shell/src/presentation/tui/text/layout.ts#L61) 经 `sliceWithWidth` 生成soft-wrap片段，[text/measure.ts:81–108](../../packages/ts-shell/src/presentation/tui/text/measure.ts#L81) 保留跳过prefix里的escape；[text/sgr.ts:20](../../packages/ts-shell/src/presentation/tui/text/sgr.ts#L20) 定义关闭hyperlink的行末terminator，并由 [render/paint.ts:58](../../packages/ts-shell/src/presentation/tui/render/paint.ts#L58) 使用。这些是已有行为及回归保护对象，不能写成“折行后链接必定失效”。当前 [markdown.ts:46–47](../../packages/ts-shell/src/presentation/tui/transcript/markdown.ts#L46) 输出可读 `label (href)`，不生成OSC8；Phase20的多行cell任务不自动引入Markdown可点击URL或URL规范化，保留可读URL。

### 5. 编辑器差距（替换初版 §1 的「平手」判定）

初版把编辑器判为“平手”，缺少共同验收尺度。以下8项需要分别比较，其中外部补全、长粘贴和token展开已有实现，不能再次记为8个缺失：

| # | omp 能力 | 位置 | Cheers 现状 |
|---|---|---|---|
| 1 | Vim 模态引擎（Normal/Insert/Visual/Visual-Line/Replace + 文本对象 + 动作） | [editor.ts:810,1685-1750](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/editor.ts#L810) | 无（仅 Emacs 绑定） |
| 2 | 内嵌补全下拉（`SelectList`，`@` 文件 / `/` 命令 / `^` 提及） | [editor.ts:65,835,1070-1120](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/editor.ts#L835) | 已有外部suggestions及动态Catalog；组件位置不同不是功能缺失，`^`提及另按需求判断 |
| 3 | 幽灵文本补全（`EditorTextAssistProvider` + Tab 接受） | [editor.ts:559-590](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/editor.ts#L559) | 无 |
| 4 | 拼写建议与自动纠正 | [editor.ts:570-589](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/editor.ts#L570) | 无 |
| 5 | 括号粘贴解码 + 大粘贴折叠 | [editor.ts:705,725-738](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/editor.ts#L705) | 已有PasteStore与placeholder；interactiveMode使用holdIfLong、expandOnRepeat，提交时展开，不是直接插入所有原文 |
| 6 | 原子 token 展开表（`#atoms`） | [editor.ts:701](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/editor.ts#L701) | 已有atomicTokenStart与PasteStore展开；未证明具有参考任意atom的全部扩展语义，不列为整体缺失 |
| 7 | 字符跳转模式（`f`/`t` 风格） | [editor.ts:683,1850-1880](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/editor.ts#L683) | 无 |
| 8 | 折行测量缓存（`#wrapCache`） | [editor.ts:646](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/editor.ts#L646) | 每帧重算（[editor/layout.ts:39-71](../../packages/ts-shell/src/presentation/tui/editor/layout.ts#L39)） |

第8项是可定位的重复计算，不是已测得帧延迟差距。实现wrap cache前先明确key包含draft revision、内容宽度、tab/宽字几何及布局选项，区分preview测量与实际viewport更新，避免缓存旧caret/source映射。

### 6. 决策与任务（保留原能力 D-ID）

| # | 决策 | 选项 |
|---|---|---|
| D-01 | 是否实现 tree-view | 由34的tree改造驱动，补层级投影、循环/条目预算与稳定选择 |
| D-02 | 是否实现 form / wizard-step | 按mcp/连接等真实多字段流程提炼，不另建并行表单系统 |
| D-03 | 是否实现 tab-bar | **已定**（[34 §7](34-panel-conversion-plan.md#7-已定决策2026-10-15) P-03） |
| D-04 | markdown 数学支持 | **用户已定：纳入Phase20**；解析边界、失败回退与源码复制需锁定 |
| D-05 | 表格多行单元格 | **用户已定：纳入Phase20**；保留窄屏内容与source映射 |
| D-06 | 折行测量缓存 | 技术任务；先测工作量与长草稿成本，验证正确性后再声称收益 |
| D-07 | Vim 模式 | **用户已定：纳入Phase20**；模式、焦点、提交与粘贴契约单独设计 |

正文 `31/方向/D-05` 的并排diff、逐hunk审批也已由用户明确全部纳入。它们不能只由该表的Vim/Markdown项目间接覆盖。

### 6.1 生产契约与反例验收

- 树展平须有循环保护、条目/深度预算、稳定id及祖先链；过滤/折叠后选中项与鼠标命中一致，不因隐藏祖先丢失可见后代。
- 表单分开编辑值、暂存值和已保存结果；字段错误阻止提交，取消/失焦不自动写入，secret保持掩码及报告安全。Tab只路由到当前焦点域。
- Vim模式不能让Normal/Visual按键落入聊天提交或权限确认；IME、bracketed paste、长粘贴placeholder、历史、外部编辑器、组合字符与选区复制分别验收，现有非Vim键位可继续使用。
- 数学解析限制在Markdown合法区域，代码围栏、行内代码与普通美元金额不误判；不执行模型内容，解析失败保留可读原文。多行表格保留单元格内容、ANSI/OSC8边界、CJK与窄屏退化，复制回源文本。
- 并排diff是显示投影，逐hunk是授权粒度，必须分开。hunk选择绑定文件、基础版本、选中内容和结果验证，不能复用“整patch已批准”扩大授权；stale hunk必须拒绝或重新预览，拒绝/部分成功/未验证保留原状态。
- 缓存不变量沿用现有transcript工作量测试；新增真实成本测量覆盖长草稿、流式表/公式、宽度交替及regular/fullscreen。测试计数通过不等于真实性能目标通过。

### 7. 未验证项

- 未在真实终端目视对比任何组件。
- `select-list.ts`（833 行）的二次确认与列平衡细节只读了接口。
- `metric.ts` / `progress-bar.ts` 的渲染细节未逐行核对。
- 未量化 markdown 流式缓存在长回答下的实际帧成本差异。

## 附：Phase 20 五项交互扩展的实施依据（2026-10-17）

本附录补足已裁决范围的设计依据，对应 [Phase 20](phase-20-decisions.md) 的 `UI-04`、`INPUT-01`、`RENDER-01…03`、`EDIT-01`。仅完成源码取证与文档修订，没有安装依赖、修改产品或新增运行/PTY验收。Cheers证据取当前工作树；上游固定为 [oh-my-pi c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4](https://github.com/can1357/oh-my-pi/tree/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4) 与 [Codex 4210c08defe92fe8828f789b6f9fda287ad3709e](https://github.com/openai/codex/tree/4210c08defe92fe8828f789b6f9fda287ad3709e)。取证时oh-my-pi当前HEAD已为 `eb74cf84d8e16ac9b8c4fa5d7c43037023d016ac`，下文旧快照行号均由 `git show` 核对，不能套到漂移后的HEAD。

### A. 共同前置：transcript语义源投影（UI-04）

Composer已有 [SourceCell/SourceSelection](../../packages/ts-shell/src/presentation/tui/composer/contract.ts#L10)，鼠标复制通过 [pointer.ts:55–66](../../packages/ts-shell/src/cli/interactive/pointer.ts#L55) 取得原始source范围；transcript的 [selection.ts:55–74](../../packages/ts-shell/src/presentation/tui/transcript/selection.ts#L55) 则从渲染行提取、清理文字，**并无同等精确的源码投影**。因此“数学/表格/diff复制回原文”是本阶段待实现契约，不能写成现有能力。

保留raw source与revision，为语义节点和visual fragment记录source span、装饰行及soft/logical break；stream/resize后按revision重新定位或使旧选区失效。数学复制原LaTeX，表格复制原cell/Markdown，diff复制明确选择的old/new原文或patch；边框、行号、padding、自动折行不混入原文。语义解析、布局、显示和复制共享这份投影，禁止从渲染后的Unicode或ANSI字符串反推授权或源码。

### B. 五模式Vim（INPUT-01）

Cheers现有owner是 [editor/buffer.ts:12,175–201](../../packages/ts-shell/src/presentation/tui/editor/buffer.ts#L12) 的变更与undo/redo、[text/motion.ts:16–26](../../packages/ts-shell/src/presentation/tui/text/motion.ts#L16) 的字素移动、[editHistory.ts:23–52](../../packages/ts-shell/src/presentation/tui/editor/editHistory.ts#L23) 的历史分支，以及 [keymap.ts:83](../../packages/ts-shell/src/cli/interactive/keymap.ts#L83) 的按键路由。宿主 [interactiveMode.ts:491–528](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts#L491) 保持pager、overlay、search先于composer；[404–428行](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts#L404) 已有独立paste通道和长粘贴placeholder。

参考 [vim.ts:3–44](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/vim.ts#L3) 采用纯状态机读取snapshot、返回半开区间编辑意图，Editor独占undo、原子placeholder与kill ring；[editor.ts:916–953](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/editor.ts#L916) 从Insert启用，Escape先退出模式或取消半条命令；[1819–1835行](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/editor.ts#L1819) 在Vim前处理bracketed paste。**同意这些决定**：新增 `editor/modal/` 只管理模式、计数、operator、text object及anchor，不建立第二缓冲区。

范围明确包含Normal、Insert、Visual、Visual-Line、Replace，常用移动/计数、`d/y/c`、行操作、`f/F/t/T`、常用文本对象及Visual编辑。参考 [2287–2307行](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/editor.ts#L2287) 把Enter/Tab交回宿主；**Cheers对此分歧**：Normal/Visual的普通Enter不隐式提交聊天，提交只能走明确submit action，避免pending operator或选区操作误发消息。模式键仅属于有焦点的composer，不能吞权限确认键。外部编辑器/历史替换后清理旧anchor与pending；重复计数和展开编辑量须有界，不执行Vim脚本、shell或模型提供的配置。

反转验收：将paste放到模态解析后，Normal中粘贴 `dd` 的测试必须失败；其预期为插入文本而非删草稿。逐项验收IME、CJK/emoji ZWJ/组合音标、soft wrap/窄屏、Visual源选区复制、一次操作一次undo/redo、长粘贴原子placeholder、历史与外编返回、极高计数有界、Normal/Visual Enter不提交及焦点隔离。

### C. 数学token与导出（RENDER-01）

Cheers [markdown.ts:36–48](../../packages/ts-shell/src/presentation/tui/transcript/markdown.ts#L36) 当前是regex行内替换，数学尚无专用token；块语义owner [markdownScan.ts:58–85](../../packages/ts-shell/src/presentation/tui/transcript/markdownScan.ts#L58) 同时被 [session/export/htmlRender.ts:1,89](../../packages/ts-shell/src/session/export/htmlRender.ts#L1) 消费。新增数学必须让TUI与导出使用同一语义结果，不能只改终端替换链。

参考 [markdown.ts:611–687](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/markdown.ts#L611) 在escape/emphasis/link前识别专用math token，保护 `\frac`、`x_i` 并以金额启发式排除 `$5 and $10`；[latex-block.ts:1442–1459](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/latex-block.ts#L1442) 区分行内单行Unicode与显示二维布局。**同意token顺序与两种布局**；参考 [latex-to-unicode.ts:2008–2015](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/latex-to-unicode.ts#L2008) 将未知命令降成裸名称，Cheers改为保留原文，避免静默丢失语义。

语义节点保留raw/body span与inline/display，支持 `$…$`、`$$…$$`、`\(...\)`、`\[...\]` 和白名单数学环境；代码围栏、行内代码、转义美元、金额优先保护。未闭合流式公式保持原文，闭合只使有关可变区域失效；窄屏二维式退为线性可读文本。不得启动TeX、shell、网络、文件包含或执行输入宏；公式字节、嵌套深度、token数、矩阵行列、输出cells/rows与缓存总字节均有预算，超限保持可查看/复制的原公式。所读上游入口不能证明这些硬预算已存在，须由Cheers实现与验证。

反转验收：先执行emphasis/escape再识别数学时，`x_i`/`\frac` fixture必须失败。另覆盖金额、代码、转义、未知命令、深嵌套/巨型矩阵、逐字stream、窄屏、原LaTeX复制及TUI/HTML一致的语义归类。

### D. 多行表格与管线语义（RENDER-02）

Cheers [markdown.ts:107–144](../../packages/ts-shell/src/presentation/tui/transcript/markdown.ts#L107) 当前按 `|` 拆cell并截断；结构化 [report/renderer.ts:30–61](../../packages/ts-shell/src/presentation/tui/report/renderer.ts#L30) 则已有窄屏字段堆叠，不能将两者混为“没有表格”。共享解析须区分escaped pipe、代码span内pipe及安全的 `<br>`；多行cell包括内容自动折行和显式换行，不宣称GFM支持任意跨物理行表格。

参考 [markdown.ts:3992–4043](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/markdown.ts#L3992) 一次wrap整个cell，跨newline保持OSC8，并在每行边界终止前景/粗斜体，防止污染边框；扣除边框后宽度不足就退到raw Markdown。[4148–4184行](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/markdown.ts#L4148) 取各cell最大行高、短侧补空。**同意整体wrap与行高决定**；Cheers保持report原有字段不丢的堆叠契约，Markdown也不可再用截断丢内容。

使用带source span的cell fragments，display cells决定宽度、grapheme决定折行；复用并回归保护既有文本escape carry与行末hyperlink关闭，在新多行cell管线中覆盖跨newline/soft-wrap的CJK、emoji、ANSI/OSC8边界，窄屏退到完整原文或字段堆叠。列数、cell字节/行数、总体渲染面积和缓存均有预算，超限保留原文/分页入口。支持 `<br>` 不意味着执行其他HTML/SVG/脚本，也不自动新增Markdown OSC8链接生成/URL规范化；继续显示可读URL。源码复制不含边框、padding与soft wrap，导出消费同一表格语义。

反转验收：改回逐newline单独wrap时，跨 `<br>` 的OSC8链接测试必须失败；改回truncate时，长cell尾部与源码复制测试必须失败。另覆盖极窄宽度、超多列、长无空格词、escaped/code pipe、宽字符和report字段完整性。

### E. 并排diff是新增投影（RENDER-03）

Cheers [transcript/diff.ts:21–44](../../packages/ts-shell/src/presentation/tui/transcript/diff.ts#L21) 只有统一格式投影，编辑preview由 [edit/patch/tool.ts:33–40](../../packages/ts-shell/src/edit/patch/tool.ts#L33) 生成。Codex [diff_render.rs:1–8,653–735](https://github.com/openai/codex/blob/4210c08defe92fe8828f789b6f9fda287ad3709e/codex-rs/tui/src/diff_render.rs#L1) 明确实现unified diff、old/new行号、大diff停用高亮与预览限制；[preview.rs:14–59](https://github.com/openai/codex/blob/4210c08defe92fe8828f789b6f9fda287ad3709e/codex-rs/tui/src/diff_render/preview.rs#L14) 同时限制12行和64KiB，字节上限覆盖零宽内容。**同意双预算决定**；本次定向读到的源码未证实并排模式，不能写成复用Codex并排实现。

建立file/hunk/change-run及old/new source模型，再分别投影unified/side-by-side；替换块按delete/add run配对，未配对侧留白，不把相邻一对 `-/+` 当完整对应。两栏分别扣除行号/gutter/分隔线，独立wrap后取配对行最大高度；最小内容宽不足时自动unified，支持手动切换、resize后稳定锚点与左右源复制。保留rename/add/delete、BOM/EOL、无结尾newline事实。预览受bytes/rows预算控制且明示剩余内容，完整pager也分块有界；不照搬full-view绕过预算作为无限分配许可。

反转验收：去掉byte ceiling后，巨量零宽字符测试必须抓住超预算；窄屏降级、tab/宽字符、左右行数不齐、超长行、宽度切换、左右复制无gutter及原始文本形状分别验证。该任务不产生写授权。

### F. 精确hunk选集与一次性授权（EDIT-01）

Cheers已有严格有界 [parse.ts:3–10](../../packages/ts-shell/src/edit/patch/parse.ts#L3)、基于原始内容唯一匹配且保留BOM/EOL的 [apply.ts:6–49](../../packages/ts-shell/src/edit/patch/apply.ts#L6)、捕获before/after与revision的 [plan.ts:17–81](../../packages/ts-shell/src/edit/patch/plan.ts#L17)、[preparation.ts:12–46](../../packages/ts-shell/src/tools/preparation.ts#L12) 的owner/tool/callId绑定与单次消费、[batch.ts:14–29](../../packages/ts-shell/src/edit/patch/batch.ts#L14) 的锁内stale重读，以及 [operation/write.ts:78–101](../../packages/ts-shell/src/edit/recovery/operation/write.ts#L78) 的partial/unknown收据。现有 [approval/contract.ts:1–24](../../packages/ts-shell/src/core/shell/approval/contract.ts#L1) 没有hunk选集；[picker/approval.ts:8–28,89–90](../../packages/ts-shell/src/cli/interactive/picker/approval.ts#L8) 已规定预览关闭不批准。

Codex [approval_overlay.rs:106–113,456–465,1012–1029](https://github.com/openai/codex/blob/4210c08defe92fe8828f789b6f9fda287ad3709e/codex-rs/tui/src/bottom_pane/approval_overlay.rs#L106) 对整request的文件map返回Accept/AcceptForSession/Cancel，没有selected-hunk集合；[file_change_approvals.rs:1–5,25–41,56–66](https://github.com/openai/codex/blob/4210c08defe92fe8828f789b6f9fda287ad3709e/codex-rs/tui/src/app/file_change_approvals.rs#L1) 从同thread/turn/item恢复changes，使预览对应原请求。**同意“显示与请求一致”**，但这不是已验证的上游逐hunk授权范例，不能把展示hunk与批准粒度等同。

实施契约：

1. `edit/patch/` 产生不可变可选择计划：稳定hunk ID、路径/rename两端、base identity/hash/raw state、原始范围/上下文、hunk内容摘要、file operation与依赖组。显示行号不是身份，UI diff字符串不是权威patch。
2. 结构依赖覆盖重叠范围、共享或变化锚点、EOF条件、rename两端及add/delete整文件；不可独立拆分的操作作为显式原子组。拒绝必要依赖则使有关选择无效并解释，禁止静默补选。跨文件业务语义依赖无法可靠自动推断，以提示与选择后验证处理，不能声称已保证编译/业务正确。
3. 从同一before snapshot构造精确subset plan及完整preview，重新执行访问控制、大小/上下文唯一性、rename/destination及权限预检。选集或效果变化使旧批准失效，不得只过滤hunk文本后复用整patch批准。
4. 批准绑定subset revision、selected IDs/内容、before/after、session、workspace identity与runtime owner/tool/callId，形成一次性capability。取消/拒绝/会话切换/内容变化即失效，执行保持锁内最终stale检查；不模糊重定位后沿用旧批准。
5. 一次selected-hunk批准不自动升级为整文件未来授权；已有会话策略与本次精确capability区分。非交互模式必须有明确的完整请求批准或结构化选集契约，缺选择不默认全部写入。
6. 收据记录requested/selected/applied/rejected/skipped及per-file结果。写A后B失败、补偿失败或writer outcome不明继续投影partial/compensated/unknown；不能因选集已批准就显示全部成功，也不承诺跨文件崩溃原子性。

反转验收：批准A后换B、相同ID换内容、选集/依赖改变、重复上下文、EOF不成立、rename只选一端、批准后base变化、跨runtime/session/workspace重放、capability二次消费、关闭preview/取消、部分写入及补偿unknown，均不得升级为写成功。文档证据只证明这些约束的必要性，完成仍需模型测试、反转测试和隔离PTY中的焦点/布局/复制验收。
