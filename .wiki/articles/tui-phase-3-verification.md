---
title: "TUI Phase 3：基线验证与删除审计"
category: article
sources: [local-tui-state, verification-gates, cli-interactive]
created: 2026-09-07
updated: 2026-09-10
tags: [tui, adapter, phase-3, verification]
summary: "执行选型文档阶段 3 的前置验证：golden 主路径、交互冒烟、长 transcript 基准、adapter 集成 spike，结合真机实测缺陷修复深度复验；审计结论为不进行破坏性删除，平稳推进收敛。"
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

## Phase 2.5 执行记录（2026-09-10）

| 阶段 | 落地位置 | 证据 |
|---|---|---|
| 2.5-A 合约 | `presentation/tui/view.ts`；`keymap.ts`/`pointer.ts` 改依赖 `InteractiveView` | `keymap.test.ts` 35 项、`pointer.test.ts` 5 项在合约类型下通过 |
| 2.5-B 组装 | `adapter/view.ts`（`ComposedView`）、`adapter/pane.ts`（共享 `TranscriptPane`）、`adapter/transcript.ts`、`transcript/viewport.ts`、`transcript/selection.ts` | `adapter/view.test.ts` 5 项、`transcript/viewport.test.ts` 11 项 |
| 2.5-C 接线 | `cli/interactive/surface.ts`（`ViewHost`、`createView`）、`tuiSettings.ts`（`readSurfaceChoice`）、`InteractiveMode` 改持有 `ViewHost` 与 `ViewState` | `firstFrame.test.ts` 新增 3 项：组件表面首帧与默认表面逐字节相同、键入/补全/翻页经组件表面、失败回退 |
| 2.5-D 对照与回退 | `ViewHost.renderFrame` 同帧回退；`surface.test.ts` 逐帧对照 | `surface.test.ts` 12 项（6 项对照、3 项回退、3 项选择读取） |

验证：
- `tsc -p tsconfig.build.json` 通过。
- 交互与 TUI 49 套件 598 项全部通过（较上轮新增 31 项）。
- golden main path 门 1/1 通过。
- 真实 CLI 伪终端单轮冒烟（隔离 HOME、临时项目目录）：`frame` 与 `composed` 两条表面均正常进入/退出备用屏、开关鼠标上报、固定硬件光标、显示欢迎与提示符、执行 `/help` 全屏阅读器、输入中文、双击 Ctrl+C 退出，退出码 0，无回退提示；两者输出字节仅差临时目录名长度。

当前结论：**Phase 2.5-A 至 2.5-D 已执行；2.5-E 尚未满足（缺连续两轮含 resume、审批三决策、长粘贴与非 TTY 的完整门槛）；Phase 3 删除工作保持阻塞。**

## 下一步路线图

1. **Phase 2.5-E**：在真实终端完成连续两轮完整 smoke 与非 TTY 核对，记录两条表面的差异（预期为零）。
2. **Phase 3 删除审计**：门槛满足后重新审计；`TranscriptPane`、`viewport.ts`、`selection.ts` 已是两条表面的共享底座，不属删除对象。

## Phase 2.5-E 手动测试清单（Phase 3 启动门）

每条表面（`frame` 默认、`composed` 经 `CODING_AGENTS_TUI_SURFACE=composed`）各跑一遍，两轮之间不清屏不清会话。任一表面任一项失败即回退该表面并记录差异，不进入 Phase 3。

> 已验证（2026-09-10 PTY 实测，synthetic provider，隔离 HOME+临时项目目录，两条表面各一会话）：
> E0 全过（备用屏进出、欢迎、提示符、`/help` 全屏、中文输入、双击 Ctrl+C 退出、退出码 0、无回退提示）；
> E5 模式切换全过（Shift+Tab 与 Alt+P 只改底部带、无 transcript 文本提示）；
> E6 全过（管道提问得可读文本、退出码 0、无转义残留）；
> E4 `/compact` 无凭证时诚实报告"No credential…"而非假压缩。
> 待你手动：E1 真实流式两轮（需真 provider）、E2 审批面板键位手感、E3 滚轮/滑块/拖拽手感、CJK 长粘贴手感、E4 真压缩后 gauge 下降、E5 resume 历史恢复。

### E0 环境准备
- [x] 隔离 HOME 与临时项目目录启动，欢迎信息、提示符、备用屏进入/退出、退出码 0（2026-09-10 PTY 实测，两条表面均过）。
- [x] `composed` 表面启动时 transcript 无"The composed surface failed to paint"回退提示（同上实测）。

### E1 连续两轮流式会话

- [ ] 第一轮：提问并等待完整回答，assistant 文本、思考块折叠、工具卡片（成功折叠、失败默认展开）正常。
- [ ] 第二轮（不清屏）：继续提问，模型能引用第一轮内容；两轮之间滚动位置不跳变。
- [ ] 中断一次正在流式的回答：无网络错误提示，transcript 记一次中断说明；`/resume` 可继续。

### E2 审批三决策

- [ ] ask 模式下触发写操作，弹出内联选项面板：允许一次 / 始终允许 / 拒绝。
- [ ] ↑/↓ 切换、Enter 确认、Esc 拒绝均有效；选"始终允许"后同类命令不再弹窗。
- [ ] 审批后控制台无纯文本覆盖污染备用屏。

### E3 滚动、选区与复制

- [ ] 长会话中 PgUp/PgDn 翻屏、滚轮滚动 3 行、滑块拖拽定位，滚动条只在内容超高时出现。
- [ ] 向上滚动后新输出到达：正在阅读的行不动，只增加"可回到末尾"的距离。
- [ ] 拖拽选中反显并可复制（Ctrl+C），复制后底部提示行显示字符数且不换行；发送新消息回到底部。

### E4 长粘贴与中文输入

- [ ] 大于 10 行粘贴就地展开为占位符，连击粘贴显示全文；中文输入不乱码、光标位置正确。
- [ ] `/compact` 执行后上下文占用数值下降（gauge 不再显示压缩前的旧值），下一轮对话仍连贯。

### E5 模式切换与 resume

- [x] 三种模式切换无多余文本提示（状态只在底部带显示），切换后行为确有区别（2026-09-10 PTY 实测：Shift+Tab 与 Alt+P 只改底部带）。
- [ ] 退出重进后 `/resume` 列出会话并恢复历史（含工具卡片），空会话不出现在列表。

### E6 非 TTY 可读性

- [x] 管道/重定向下（`echo "提问" | agents ...`）得到可读最终文本，无备用屏转义残留，退出码 0（2026-09-10 实测通过）。

### 通过标准

- 两条表面 E1~E6 全过，且同一操作序列下逐帧行为无未解释差异，方可解除 Phase 3 删除阻塞。
- 任一差异先记入 `tui-known-defects.md` 再修，不带病进入删除审计。
