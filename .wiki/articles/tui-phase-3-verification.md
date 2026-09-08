---
title: "TUI Phase 3：基线验证与删除审计"
category: article
sources: [local-tui-state, verification-gates, cli-interactive]
created: 2026-09-07
updated: 2026-09-08
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

## 下一步路线图

1. **能力增量对齐**：将近期在生产链路验证通过的核心能力（C3 内容空间选区锚定与 Toast 提示、C4 规范级滚轮条几何计算与拖拽状态机、A3 交互式审批面板）反哺并对齐到 `adapter/` 架构中。
2. **切流验证（Cutover Spike）**：在 `interactiveMode.ts` 中通过无侵入适配器进行主链路切换验证，在真实终端中充分检验长文本输入、中文 IME、复杂滚轮交互与权限审批。
3. **最终收敛（Cleanup）**：当 adapter 经过生产长期验证无任何退化后，再稳健清理历史专用的旧胶水代码，保证产品平滑演进。
