---
title: "TUI Phase 3：基线验证与删除审计"
category: article
sources: [local-tui-state, verification-gates]
created: 2026-09-07
updated: 2026-09-07
tags: [tui, adapter, phase-3, verification]
summary: "执行选型文档阶段 3 的前置验证：golden 主路径、交互冒烟、长 transcript 基准、adapter 集成 spike；审计结论为本次不删除任何旧模块。"
confidence: high
---

# TUI Phase 3：基线验证与删除审计

## 方向复核

选型文档阶段 3 原文：**当 golden main path 与交互 smoke 场景通过后，再删除**旧 `render/engine.ts`、重复 editor、重复 scroll/ANSI 逻辑；后续决策点 2/3 要求先建长 transcript 基准、先证接口稳定再动依赖与删除。

Phase 0/1/2 的 wiki 均记录"未验证真实 CLI，只到组件层"。所以 Phase 3 第一步是基线验证，不是直接删文件。

## 验证结果

| 门槛 | 结果 |
|---|---|
| golden main path | 1/1 通过 |
| TUI 全套件 | 按本次复核重跑为准（见下） |
| 交互冒烟（loop/mode/firstFrame） | 13/13 通过（本次复核：`cli/interactive` 随回归重跑通过） |
| 长 transcript 基准（`adapter/benchmark.test.ts` 6 项） | 通过：50 turn（200 blocks）渲染 < 1s，缓存重渲染 < 200ms，20 次流式追加 < 500ms，viewport 切片 30 行 < 1s，流式帧 diff < 30 行 |
| adapter spike（`adapter/spike.test.ts` 5 项，后续决策点 1） | 通过：transcript+composer+statusbar 同帧、permission overlay、assistant/thinking/tool/loader 流式、editor 提交、启停恢复 |
| `tsc -p tsconfig.build.json` | 通过 |
| 适配层外部项目名 | 零命中（本次复核重查：产品代码与本文零命中） |

## 独立复核（61aba79a → 本次修补）

查出并修复 2 个问题：

1. **空测试（MEDIUM）**——`spike.test.ts` 的 "uses a manual scheduler deterministically" 自带 `void scheduler`：`Surface` 构造不接受 scheduler（engine 支持注入但 Surface 未透传），测试与 scheduler 无关，只剩 `now() >= 0` 空断言。改为真断言："restores the terminal on stop"（启停后 `terminal.stopped`），启停恢复本就是验证门槛之一。scheduler 透传属功能新增，Phase 3 只验证不加功能，不做。
2. **名实不符（LOW）**——benchmark 标题 "renders 200 turns" 但 `buildTranscript(50)`（50 turns × 4 blocks = 200 blocks）。标题改为 50 turns，预算不变；本文表格同步。

确认无问题：`textBlock` 存在；`TranscriptView` 在 benchmark/spike 各定一次是测试内 7 行 helper，跨文件抽反而增依赖，保留；删除审计结论维持（本次不删）；文件名简洁（`benchmark`/`spike`）；`spike.test.ts` 未用 import 已清理。

## 再次复核（a5ef83af → 本次修补）

复核范围：上一轮修补后的 11 项门测试，逐项重验断言强度、helper 语义（`textBlock` 缺省 finalized、`rowsFor` 缓存、`RecordingTerminal.stopped`）、删除审计取证（`new TUI`/`new Editor` 调用点）与外部名卫生。

查出并修复 2 个测试强度问题：

1. **流式基准只测耗时不测内容（MEDIUM）**——"streams one block" 循环 20 次只在最后断耗时：渲染把流式块吞掉也照样通过。循环内加断言：行数大于 settled 基线且含流式正文。耗时预算不变。
2. **overlay 冒烟只断标题不断合成（LOW）**——"shows a permission overlay" 断 `drain` 含 "Write file"，但标题行即使 overlay 没盖住 transcript 也会出现。加断底 transcript 行（"delete the file"）同帧出现，证明 overlay 是合成而非替换。

确认无问题：上一轮两处修复正确（空 scheduler 测试已删、`terminal.stopped` 真断言；标题 50 turns 与 `buildTranscript(50)` 一致）；删除审计结论维持——`new TUI(` 仅生产链路与 adapter 各一处、`new Editor(` 生产侧仅 frameSurface，删底座即摧毁生产链路与封装对象；产品代码与本文零外部名；文件名简洁；复用均为薄封装。

验证（本次复核重跑）：适配层 61 项通过；TUI+theme+approval+interactive 回归 530 项通过（45 文件）；`tsc` 通过；门测试 3 次重跑无抖动。

## 删除审计结论：本次不删

- `render/engine.ts`：生产默认链路（`InteractiveMode`）与 adapter `Surface` 各持一个实例，但同一进程同一时刻只启一个，无双链路竞争；`Surface` 是对 `TUI` 的组合而非重写。删 `engine.ts` 同时摧毁生产链路与 adapter。**不删。**
- `tui/editor.ts`：`InteractiveSurface`、`historyStore`、`keymap` 直接依赖；adapter 的 `PromptEditor`/`Composer` 是薄封装。删底座等于摧毁封装对象。**不删。**
- scroll/ANSI/text（`text/*`、`chrome/window.ts`）：adapter 的 `screen/scroll/overlay/layout` 全部复用，无重复实现。**无可删。**
- 产品渲染器（`blocks.ts`、`band.ts`、`composer.ts`、`hints.ts`、`live.ts`）：产品组件全部复用，无重复。**无可删。**

真正的"删除旧职责"只能发生在未来某天 adapter 链路接管默认链路之后——那时删的是被替代的旧链路，而不是现在这些仍被生产链路与 adapter 同时依赖的底座。迁移期间单默认渲染链路保持不变。

## 后续

- 真机门槛仍未验证：大粘贴/IME 真机、非 TTY 管道输出——需真终端环境，留给接入默认链路时。
- 若长 transcript 基准未来成为瓶颈，再按选型文档单独评估性能路线（含 Node 20 兼容性与发布成本），不提前引入。
