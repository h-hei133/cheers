---
title: "TUI Phase 3：基线验证与删除审计"
category: article
sources: [local-tui-state, verification-gates, cli-interactive]
created: 2026-09-07
updated: 2026-09-10
tags: [tui, adapter, phase-3, verification]
summary: "Phase 3：先以 import 图审计，再收敛为唯一表面——删除 12 个未接入生产的适配层模块与第二条同算法表面，adapter/ 改名 surface/，退出时把转写留在主屏；聚焦 45 套件 567 项、golden 门与 PTY 实测通过。"
confidence: high
---

# TUI Phase 3：基线验证与删除审计

## 方向复核

选型文档阶段 3 原文：**当 golden main path 与交互 smoke 场景通过后，再删除**旧 `render/engine.ts`、重复 editor、重复 scroll/ANSI 逻辑；后续决策点 2/3 要求先建长 transcript 基准、先证接口稳定再动依赖与删除。

Phase 0/1/2 阶段完成了底层与产品组件的构造与单测覆盖。Phase 3 的第一步是基线前置验证与删除审计，而非盲目删除核心文件。

---

## 验证结果

| 门槛 | 结果 | 说明 |
|---|---|---|
| golden main path | 1/1 通过 | 包含启动恢复、首帧绘制与退出恢复 |
| 交互冒烟（loop/mode/firstFrame） | 13/13 通过 | 交互循环、键位分发与首帧渲染稳定 |
| 长 transcript 基准（`adapter/benchmark.test.ts` 6 项） | 通过 | 50 turn（200 blocks）渲染 < 1s，缓存重渲染 < 200ms，20 次流式追加 < 500ms，viewport 切片 30 行 < 1s，流式帧 diff < 30 行 |
| adapter spike（`adapter/spike.test.ts` 5 项） | 通过 | transcript+composer+statusbar 同帧、permission overlay、流式、editor 提交、启停恢复 |
| 交互与真机全套件回归 | 567 项全部通过 | 涵盖 A/B/C/D 类 13 项真机核心缺陷修复与增强 |
| `tsc -p tsconfig.build.json` | 通过 | 0 类型错误，编译干净 |
| 适配层与产品代码外部命名 | 零命中 | 完全符合 AGENTS.md 规范 |

---

## 真机演进与交互验证深化（2026-09-07 ~ 2026-09-08）

在自动化基准测试与 spike 跑通后，团队在真实终端高负荷交互实测（Dogfooding）中进一步暴露并彻底修复了 13 项关键生产缺陷：

1. **权限门控与交互审批（A1 ~ A5）**：
   - 彻底修复 `accept-edits` 路径绕过与破坏性命令误放行；
   - 消除终端控制台纯文本覆盖 TUI 备用屏污染问题；
   - 升级内联交互式选项面板（`OverlayHost`），支持单次允许、永久允许与拒绝（含 `1/2/3/y/a/n/d/esc` 快捷键），Promise 100% 安全结算杜绝死锁；
   - 在系统提示词与工具返回首行注入用户授权标记，解决模型只读认知偏差。
2. **上下文贯通与 Resume 历史重构（B1 ~ B2）**：
   - 实现 `convertSessionMessagesToChat` 贯通跨轮历史记忆；
   - 自动合成中断回合的取消消息，杜绝 OpenAI/DeepSeek API 400 坏死；
   - 在重入会话（resume）时完整重建工具卡片折叠状态、命令输出与 Diff 高亮。
3. **选区持久化、Toast 与规范级滚轮条（C1 ~ C5）**：
   - **选区释放驻留与内容空间锚定**：鼠标松手后高亮背景持续驻留，单机空白处或打字平滑撤销；在 `frameSurface` 实现 `screenToContent` / `contentToScreenSpan`，页面滚动时高亮方块像素级同步位移，滚出滚入自然过渡；
   - **Toast 瞬态复制提示**：废除向 `transcript` 追加 notice 块的污染做法，改由提示行以强调色渲染 Toast（`Copied N characters...`），多次复制就地刷新，打字或发消息自动隐去；
   - **规范级右侧滚轮条**：建立 `ScrollbarGeometry`，转写内容溢出时在最右列渲染细轨道 `│` 与高亮实体滑块 `█`，按比例严格计算高度；实现滑块抓取（`grabOffset`）与轨道点击跳转拖拽状态机；
   - **选区死区消除**：在 `screenToContent` 坐标映射中按文本实际行宽 `visibleWidth` 进行行末夹逼，彻底消除滚动条左侧空白区域无法框选的死区。
4. **会话搜索框规范化（D1）**：
   - 顶边框回归纯净标题与计数，框内首行建立独立搜索框与分隔线，消除光标跳变与超长截断。

---

## 删除审计结论：维持不删

- **`render/engine.ts`**：当前生产默认链路（`InteractiveMode`）与 adapter `Surface` 各持一个实例，但同一进程同一时刻只启一个，无双链路竞争；`Surface` 是对 `TUI` 的组合而非重写。删 `engine.ts` 会同时摧毁生产链路与 adapter。**绝对不删。**
- **`tui/editor.ts`**：`InteractiveSurface`、`historyStore`、`keymap` 直接依赖；adapter 的 `PromptEditor`/`Composer` 是其薄封装。删底座等于摧毁封装对象。**绝对不删。**
- **`scroll/ANSI/text`**（`text/*`、`chrome/window.ts`）：adapter 的 `screen/scroll/overlay/layout` 全部复用，无重复实现。**无可删。**
- **产品渲染器**（`blocks.ts`、`band.ts`、`composer.ts`、`hints.ts`、`live.ts`）：产品组件全部复用，无重复。**无可删。**

**核心结论**：选型文档中规划的“删除旧职责”，绝不能理解为在适配层接管前机械删除支撑整个产品运行的核心模块。真正的职责收敛只能发生在未来 adapter 链路在功能与体验上 100% 覆盖生产链路、并正式确立为唯一主路径之后。

---

## Phase 2.5 前置条件（2026-09-08）

本次复核确认，原阶段划分缺少“生产表面组装与可逆切流”这一必要阶段。Phase 1/2 证明组件可独立工作，不能证明 adapter 已接管 `InteractiveMode`。因此 Phase 3 的删除条件必须拆成前置阶段：

1. 冻结 `InteractiveView`、`ViewActions`、`ViewSnapshot` 最小合约，解除 `keymap`/`pointer` 对具体 `InteractiveSurface` 的硬编码依赖；
2. 组装完整 adapter view，补齐生产链路已验证的选区内容坐标、Toast、滚动条拖拽、流式工具卡片和权限 overlay；
3. 通过 `InteractiveMode` 显式表面工厂接线，保证单终端单写入者、生命周期可恢复、失败可回退；
4. 在真实 CLI 完成长粘贴、中文输入、滚轮/滑块、选区复制、审批三决策、resume、非 TTY/CI 的连续 smoke；
5. 重新做删除审计，只删除被替代的专属胶水，不删除共享 `TUI`、文本测量、编辑器和终端底座。

## Phase 2.5 执行记录（历史）

> 本节保留当时的生产组装、双表面对照与可逆切流证据。Phase 3 已删除第二条表面及其选择/回退机制；当前架构见文末「结论」。下列旧路径和环境变量仅用于历史审计，不是当前可用接口。

| 阶段 | 当时落地位置 | 当时证据 |
|---|---|---|
| 2.5-A 合约 | `presentation/tui/view.ts`（后移至 `surface/contract.ts`） | `keymap.ts` / `pointer.ts` 合约测试 |
| 2.5-B 组装 | `adapter/view.ts`、`adapter/pane.ts`（后移至 `surface/`） | 组件表面与共享转写窗口测试 |
| 2.5-C 接线 | `cli/interactive/surface.ts`、`ViewHost`（已删除） | 双表面首帧与输入回归 |
| 2.5-D 对照与回退 | `surface.test.ts`（已删除） | 双表面逐帧对照与回退验证 |

验证：
- `tsc -p tsconfig.build.json` 通过。
- 交互与 TUI 49 套件 598 项全部通过（较上轮新增 31 项）。
- golden main path 门 1/1 通过。
- 真实 CLI 伪终端单轮冒烟（隔离 HOME、临时项目目录）：`frame` 与 `composed` 两条表面均正常进入/退出备用屏、开关鼠标上报、固定硬件光标、显示欢迎与提示符、执行 `/help` 全屏阅读器、输入中文、双击 Ctrl+C 退出，退出码 0，无回退提示；两者输出字节仅差临时目录名长度。

当前结论：**Phase 2.5-A 至 2.5-E 全部通过；真机多轮流式、审批三决策（含拒绝理由支持与模型反馈）、选区复制（含输入框内拖选与边缘自动滚屏）、长粘贴与中文输入、模式切换与 resume 历史重构、非 TTY 管道输出均实测验证通过，两条表面行为一致；Phase 2.5 正式交付闭环，Phase 3 删除审计前置门槛已满足，解除阻塞。**

## 下一步路线图

## Phase 2.5-E 手动测试清单（历史）

> 以下清单记录 Phase 3 前的两条表面验证。第二条表面、环境变量和回退机制已删除；不要按本节启动当前程序。当前生产链路只有 `InteractiveMode → InteractiveSurface → TUI`。

> 历史验证结果（2026-09-10）：E0~E6 均通过，包括备用屏启停、流式会话、审批、滚动选区、长粘贴、压缩、模式切换、resume 和非 TTY 输出。
> E5 全过：模式切换仅更新状态带无多余文本提示；/resume 完整重建工具卡片与折叠态。
> E6 全过：管道重定向输出纯文本无转义残留，退出码 0。

### E0 环境准备
- [x] 隔离 HOME 与临时项目目录启动，欢迎信息、提示符、备用屏进入/退出、退出码 0（2026-09-10 PTY 实测，两条表面均过）。
- [x] `composed` 表面启动时 transcript 无"The composed surface failed to paint"回退提示（同上实测）。

### E1 连续两轮流式会话

- [x] 第一轮：提问并等待完整回答，assistant 文本、思考块折叠、工具卡片（成功折叠、失败默认展开）正常。
- [x] 第二轮（不清屏）：继续提问，模型能引用第一轮内容；两轮之间滚动位置不跳变。
- [x] 中断一次正在流式的回答：无网络错误提示，transcript 记一次中断说明；`/resume` 可继续。

### E2 审批三决策

- [x] ask 模式下触发写操作，弹出内联选项面板：允许一次 / 始终允许 / 拒绝。
- [x] ↑/↓ 切换、Enter 确认、Esc 拒绝均有效；选"始终允许"后同类命令不再弹窗。
- [x] 审批后控制台无纯文本覆盖污染备用屏；支持拒绝时可选输入理由并反馈给模型。

### E3 滚动、选区与复制

- [x] 长会话中 PgUp/PgDn 翻屏、滚轮滚动 3 行、滑块拖拽定位，滚动条只在内容超高时出现。
- [x] 向上滚动后新输出到达：正在阅读的行不动，只增加"可回到末尾"的距离。
- [x] 拖拽选中反显并可复制（Ctrl+C），复制后底部提示行显示字符数且不换行；发送新消息回到底部；支持输入框内拖拽选区复制及边缘自动滚屏。

### E4 长粘贴与中文输入

- [x] 大于 10 行粘贴就地展开为占位符，连击粘贴显示全文；中文输入不乱码、光标位置正确。
- [x] `/compact` 执行后上下文占用数值下降（gauge 不再显示压缩前的旧值），下一轮对话仍连贯。

### E5 模式切换与 resume

- [x] 三种模式切换无多余文本提示（状态只在底部带显示），切换后行为确有区别（2026-09-10 PTY 实测：Shift+Tab 与 Alt+P 只改底部带）。
- [x] 退出重进后 `/resume` 列出会话并恢复历史（含工具卡片），空会话不出现在列表。
### E6 非 TTY 可读性

- [x] 管道/重定向下（`echo "提问" | agents ...`）得到可读最终文本，无备用屏转义残留，退出码 0（2026-09-10 实测通过）。

### 通过标准（历史）

> 本标准用于 Phase 2.5 的双表面对照，现已完成；当前生产路径不再有表面选择或回退。

## Phase 3 删除审计（2026-09-10）

### 审计方法

- 以 import 图为唯一证据：对交互与 TUI 模块列出生产导入方；只被测试导入的模块视为未接入生产。
- 对每个候选回答三个问题：谁替代了它；它是否属于共享终端底座；删除后哪些行为测试需要保留。
### 保留清单（共享底座，不删）

`render/engine.ts`、`render/frame.ts`、`render/paint.ts`、`terminal.ts`、`text/*`、`editor.ts`、`pastes.ts`、`input/*`、`chrome/*`、`transcript/*`，以及 `surface/contract.ts`、`surface/pane.ts`、`surface/scroll.ts`、`surface/view.ts`。这些模块共同组成当前唯一备用屏渲染链路。

### 测试覆盖移植

- `adapter.test.ts` 的滚动视图用例 → `surface/scroll.test.ts`；主屏差分、overlay 栈、视图模型用例随被删模块删除（生产差分由 `render/engine.test.ts` 覆盖，overlay 由 `cli/interactive/overlay.test.ts` 覆盖）。
- `benchmark.test.ts` 的性能预算 → 改为对 `Transcript` + `TranscriptPane` + `InteractiveSurface.renderFrame` + `diffPaint` 的预算（去掉 `Message` / `ToolCard` / `diffLines`）。
- `components.test.ts` / `products.test.ts` / `spike.test.ts` 随模块删除；其覆盖的 band / composer / hints / options / modal 各自已有 `chrome/*.test.ts`。
- `view.test.ts` + `frameSurface.test.ts` + `surface.test.ts` 的对照脚本 → 合并为唯一表面的行为测试（把"两者相同"改写为对具体行为的直接断言）。
- `firstFrame.test.ts` 删去"composed 经宿主"三项（回退不再存在）。

### 收敛后的布局

`presentation/tui/surface/contract.ts`（原 `view.ts`）、`surface/view.ts`（`InteractiveSurface`）、`surface/pane.ts`、`surface/scroll.ts`。目录名从 `adapter` 改为 `surface`：删除之后它不再适配任何东西。

### 顺带修复（先看参考实现再动手）

- 退出时转写不见了：备用屏 `?1049l` 原样恢复终端，会话内容一个字都不留在回滚区，用户退出后只看到一行 `--resume` 提示。参考实现的备用屏 stop 在恢复主屏后把完整逻辑文档逐行打印到主屏，其规划文档把这列为硬性目标。照此实现：`TUI.stop({ document })` 在离开备用屏后打印转写全部行，宿主在 stop 时传入当前宽度下的转写行。
- `InteractiveMode` 头注释仍写着"运行在普通屏幕、转写退役进回滚区"，与备用屏架构不符，随修改一并纠正。

### 执行记录（2026-09-10）

按审计清单完成删除与收敛：删除未接入生产的组件包装与第二条表面，目录统一为 `surface/`，退出时将最终转写写回主屏。Focused TUI tests、golden 门和 PTY 冒烟均通过。

净变化：`packages/ts-shell/src` 相对 Phase 2.5 基线删除重复表面职责，当前表面相关源文件为 `surface/contract.ts`、`surface/view.ts`、`surface/pane.ts`、`surface/scroll.ts`。

#### PTY 实测（退出文档）

隔离 HOME、临时 git 项目、synthetic provider、`--non-interactive-approval allow-once`、100×30：输入一句含中文的提问并回车，双击 Ctrl+C 退出。退出码 0；最后一个 `?1049l` 之后主屏依次出现欢迎头（`Coding Agent` 与项目路径）、用户消息块（含中文）、回复行，再是 `--resume` 提示；7 行擦行写入；无提示框、无状态带；autowrap 先关后开。

**实测抓到的一处错误**：第一版把文档写在 `terminal.stop()` 之前。驱动的模式恢复电池本身含 `?1049l`（保险），它把光标放回进入备用屏时的位置，随后的 `--resume` 行就把文档覆盖掉——PTY 输出里文档字节存在、但最终屏幕上看不到。调整为驱动先恢复、再离开备用屏并写文档后通过；对应单元测试断言了文档在 `?1049l` 之后、以复位与显示光标收尾。

#### 结论

Phase 3 完成。生产路径上只有一条渲染链路：`InteractiveMode` → `InteractiveSurface`（`surface/view.ts`）→ `TranscriptPane` + `chrome/*` → `TUI` 差分引擎。共享底座（`render/engine.ts`、`render/paint.ts`、`terminal.ts`、`text/*`、`editor.ts`、`chrome/*`、`transcript/*`）未动。后续新的表面能力直接落在 `surface/` 与 `chrome/`，不再开第二条链路。
