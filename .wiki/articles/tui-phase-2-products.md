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

## 独立复核（df43329c → 本次修补）

复核范围：4 个新组件 + 10 项测试，对照自有渲染器（`blocks.ts`、`band.ts`、`composer.ts`、`hints.ts`、`live.ts`）与参考实现的选择列表指针映射逐项取证。无外部项目名进入产品代码，文件名简洁（`messages`/`card`/`chrome`），跨域 import 均为 type-only 或同级拥有模块。

查出并修复 3 个问题：

1. **`messages.ts` toggle 缺省与 kind 脱节（MEDIUM）**——`toggleCollapsed` 固定 `?? true`：包 thinking 正确，包 tool 时首次 toggle 成无操作（tool 缺省展开，`!(undefined ?? true)` 仍是展开）。改为按 kind 取缺省（thinking 缺省折叠，其余缺省展开），与 `toBlock` 对齐。`ToolCard` 的 `?? false` 与 tool 缺省展开一致，保留。回归测试：tool 消息首次 toggle 即折叠。
2. **`chrome.ts` Composer 有焦点无输入（LOW）**——`focused = true` 却无 `handleInput`，挂到 Surface 上按键无响应。补与 `PromptEditor` 同形的组件层边界：可打印单字符插入，换行/控制键/转义留给上层 keymap，忙时不吃输入。
3. **控制字符可插入（LOW，两处同修）**——`PromptEditor`/`Composer` 的单字符守卫放行 `DEL`（0x7f）及 C0 控制字符。加 `>= " "` 下界与 DEL 排除（转义写法 `\u007f`，避免不可见字面量）。

确认无问题：`StatusBar.render` 的 `renderBand` 是单个 string 元素（非 spread），无拆字符 bug；dialog 三决策与升级工作流一致；`ToolCard` press 取焦点/click 切换与常规选择列表同形；`card.ts` 下划线参数已正名。

已知限制（留给输入链路任务）：组件层只吃单字符，中文 IME 多字节直达仍被丢弃，真修要接 `stdinBuffer` 解码。

## 再次复核（16b47aa9 → 本次修补）

复核范围：上一轮修补后的 4 个组件 + 13 项测试，对照自有渲染器（`blocks.ts` 的 `renderThinking`/`renderTool` 折叠分支、`composer.ts`、`hints.ts`、`band.ts`）逐项重验折叠缺省、输入守卫与提示链。

查出并修复 2 个问题：

1. **`messages.ts` 缺 `command` 工厂（LOW）**——`AgentMessage` 的 `command` kind 在 Phase 0 已映射、`renderBlock` 也有 `command` 分支，但工厂只有 user/assistant/thinking/notice/error 五个，调用方想发命令块只能手拼对象。补 `commandMessage(title, text)`。回归测试：工厂渲染含正文。
2. **复核记录含外部项目名（卫生）**——产品代码零命中已确认；两篇复核记录里的对照来源表述改为"参考实现"，不点名。选型文档是研究结论本身，保留。

确认无问题：`Message.toggleCollapsed` 按 kind 取缺省与 `toBlock` 对齐（thinking 缺省折叠、tool 缺省展开）；`ToolCard` 的 `?? false` 一致；`Composer` 空闲无提示行是自有 `renderHints` 的"零或一行"语义（空闲且无 ambient 即无行），透传正确，不在此层加行；`StatusBar` 的 `renderBand` 单 string 无拆字符；输入守卫 `>= " "` + DEL 排除正确（测试字节经 `cat -v` 确认为 DEL 与 ESC 转义）。

验证：适配层 50 项通过；TUI 全套件通过；`npm run build:ts` 通过。
