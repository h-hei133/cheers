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
| TUI 全套件 | 339/339 通过（25 文件） |
| 交互冒烟（loop/mode/firstFrame） | 13/13 通过 |
| 长 transcript 基准（新增 `adapter/benchmark.test.ts` 6 项） | 通过：200 turn 渲染 < 1s（实测约 24ms 量级），缓存重渲染 < 200ms，20 次流式追加 < 500ms，viewport 切片 30 行 < 1s，流式帧 diff < 30 行 |
| adapter spike（新增 `adapter/spike.test.ts` 5 项，后续决策点 1） | 通过：transcript+composer+statusbar 同帧、permission overlay、assistant/thinking/tool/loader 流式、editor 提交、启停恢复 |
| `tsc -p tsconfig.build.json` | 通过 |
| 适配层外部项目名 | 零命中 |

## 删除审计结论：本次不删

- `render/engine.ts`：生产默认链路（`InteractiveMode`）与 adapter `Surface` 各持一个实例，但同一进程同一时刻只启一个，无双链路竞争；`Surface` 是对 `TUI` 的组合而非重写。删 `engine.ts` 同时摧毁生产链路与 adapter。**不删。**
- `tui/editor.ts`：`InteractiveSurface`、`historyStore`、`keymap` 直接依赖；adapter 的 `PromptEditor`/`Composer` 是薄封装。删底座等于摧毁封装对象。**不删。**
- scroll/ANSI/text（`text/*`、`chrome/window.ts`）：adapter 的 `screen/scroll/overlay/layout` 全部复用，无重复实现。**无可删。**
- 产品渲染器（`blocks.ts`、`band.ts`、`composer.ts`、`hints.ts`、`live.ts`）：产品组件全部复用，无重复。**无可删。**

真正的"删除旧职责"只能发生在未来某天 adapter 链路接管默认链路之后——那时删的是被替代的旧链路，而不是现在这些仍被生产链路与 adapter 同时依赖的底座。迁移期间单默认渲染链路保持不变。

## 后续

- 真机门槛仍未验证：大粘贴/IME 真机、非 TTY 管道输出——需真终端环境，留给接入默认链路时。
- 若长 transcript 基准未来成为瓶颈，再按选型文档单独评估性能路线（含 Node 20 兼容性与发布成本），不提前引入。
