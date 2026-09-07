---
title: "TUI Phase 2：产品组件迁移"
category: article
sources: [local-tui-state, reference-comparison]
created: 2026-09-07
updated: 2026-09-07
tags: [tui, adapter, product-components, phase-2]
summary: "在 Phase 1 底层组件上补齐产品组件：消息、工具卡片、状态栏与输入框，全部是对现有自有渲染器的 ViewComponent 封装。"
confidence: high
---

# TUI Phase 2：产品组件迁移

## 范围

按 `tui-framework-selection.md` 阶段 2 执行：迁移产品组件，不复制整个应用。控制面依然冻结——组件只消费 `AgentMessage`/`SessionFacts` view model 和发出用户动作，不碰模型、工具、权限、会话状态。

阶段 3（删除旧 renderer 重复职责）未执行：默认渲染链路仍是现有 `InteractiveSurface` + `TUI` 引擎，本次只新增可用的产品组件。

## 复用方案

全部是对现有自有渲染器的薄封装，无新依赖，无外部项目名/标签进入产品代码：

| 新增文件 | 复用对象 | 说明 |
|---|---|---|
| `adapter/messages.ts` | `transcript/blocks.ts`（`renderBlock`） | `Message` + `user/assistant/thinking/notice/error` 工厂，折叠切换 |
| `adapter/card.ts` | `transcript/blocks.ts`（`renderTool`） | `ToolCard`，点击折叠/展开，press 取焦点 |
| `adapter/chrome.ts` | `transcript/live.ts`、`chrome/band.ts`、`chrome/composer.ts`、`chrome/hints.ts` | `StatusBar`（活动行+状态带）、`Composer`（提示块+提示行，焦点同步） |

`AgentMessage` 的 `command` kind 已在 Phase 0 映射到 `command` block，本次消息组件直接复用。

## 修复

- `adapter/model.ts` 的 tool 映射漏传 `collapsed`（Phase 0 遗留）：`ToolCard` 传 `collapsed: true` 经 `toBlock` 后丢失，折叠卡片实际按展开渲染。补上透传。回归测试：折叠卡片只显示行数摘要，不含正文。

## 验证

- 新增 `adapter/products.test.ts` 10 项：用户气泡、助手 Markdown、思考折叠/展开、通知/错误、工具卡片折叠/展开/流式、状态栏、输入框提示行、忙时排队提示。
- 适配层共 47 项通过；现有 TUI 回归 171 项通过（engine/blocks/container/markdown/editor/stdinBuffer/options/band/composer/turnSink）。
- `tsc -p tsconfig.build.json` 通过；适配层无外部项目名命中。
- 未验证（留给接入默认链路时）：真实 CLI 长 transcript 基准、大粘贴/IME 真机、非 TTY 管道输出。
