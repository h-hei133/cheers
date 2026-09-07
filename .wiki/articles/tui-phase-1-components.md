---
title: "TUI Phase 1：底层组件适配"
category: article
sources: [local-tui-state, reference-comparison]
created: 2026-09-07
updated: 2026-09-07
tags: [tui, adapter, components, phase-1]
summary: "在 Phase 0 适配边界上补齐底层组件：文本/布局、Markdown、编辑器、选择列表、加载器与权限弹窗，全部是对现有自有模块的薄封装。"
confidence: high
---

# TUI Phase 1：底层组件适配

## 范围

按 `tui-framework-selection.md` 阶段 1 的接入顺序执行，只做底层终端能力，不碰产品组件迁移（阶段 2）与旧 renderer 删除（阶段 3）。

控制面冻结：模型、工具、权限、会话状态不进组件。组件只消费 view model 和发出用户动作。

## 复用方案

全部是对现有自有模块的薄封装，无新依赖，无外部项目名/标签进入产品代码：

| 新增文件 | 复用对象 | 说明 |
|---|---|---|
| `adapter/layout.ts` | `text/layout.ts`、`text/measure.ts` | `Text`（换行+内边距+背景+缓存）、`VStack`、`HStack` |
| `adapter/markdown.ts` | `transcript/markdown.ts` | `Markdown`，流式时去尾部残缺围栏 |
| `adapter/editor.ts` | `tui/editor.ts` | `PromptEditor`，焦点同步+提交/变更回调 |
| `adapter/select.ts` | `chrome/options.ts`、`chrome/window.ts` | `SelectList`，键盘/滚轮/指针，溢出计数行 |
| `adapter/loader.ts` | `transcript/live.ts` | `Loader`，复用 spinner/耗时格式 |
| `adapter/dialog.ts` | `sandbox/escalationWorkflow.ts`、`cli/approval/permissionScope.ts` | `PermissionDialog`，allow-once/allow-always/deny，与升级工作流决策对齐 |

参考侧差异核对结论：自有 `Editor` 已有 grapheme/IME 光标/粘贴占位/历史/undo，不需替换；自有 `renderMarkdown` 已有围栏/表格/流式去闪，不需替换；自有 `OptionModel` 已有过滤/多选/disabled 跳过，只缺组件化渲染与指针——本次补齐。

## 验证

- 新增 `adapter/components.test.ts` 15 项：布局换行/堆叠、Markdown 标题与流式围栏、编辑器输入提交与光标标记、选择列表过滤/接受/溢出、加载器标签与活动、权限弹窗三决策与光标移动。
- 适配层共 33 项通过；现有 TUI 回归 139 项通过（engine/blocks/container/markdown/editor/stdinBuffer/options/turnSink）。
- `tsc -p tsconfig.build.json` 通过；适配层无外部项目名命中。
- 未验证（按验证门槛留给后续）：真实 CLI 长 transcript 基准、大粘贴/IME 真机、非 TTY 管道输出——本次只到组件层，未改默认渲染链路。

## 独立复核（cbf011c8 → 本次修补）

复核范围：6 个新组件 + 15 项测试，对照自有模块（`text/layout.ts`、`chrome/options.ts`、`chrome/window.ts`、`editor.ts`）与参考实现的选择列表指针映射、滚动视图、行合成逻辑逐项取证。

查出并修复 2 个真问题：

1. **`select.ts` 指针行偏移（HIGH）**——`render` 无标题行（第 0 行即首个 option），`handlePointer` 却用 `window.offset + event.y - 1`，整列表点击下偏一行、首行永远点不中。参考实现为窗口起点加事件行号。改为直接映射。回归测试：首行 click 选中 `a`、次行 press 移动光标到 `b`。
2. **`layout.ts` 自造换行器（MEDIUM）**——`wrapPlain` 按 code unit 切分：CJK 无空格长行整行超宽、ANSI 转义序列计入宽度被切断。`Text.render` 改复用自有 `wrapToWidth`（cell 宽度 + grapheme + 样式携带），保留左右 padding 语义。回归测试：CJK 文本按 cells 换行且无超宽行。

确认无问题：dialog 三决策与升级工作流/bridge 菜单一致（裸 `allow` 为旧兼容值，不提供是对的）；loader 读 `Date.now()` 是 spinner 时间驱动本性；`PromptEditor.handleInput` 只吃单字符是 Surface 给 raw bytes 的结构性限制——中文 IME 多字节直达会被丢弃，真修要接 `stdinBuffer` 解码，留给后续输入链路任务，不在组件层扩大范围。

卫生：适配层无外部项目名命中；import 均为 type-only 跨域或同级拥有模块，无运行时循环；各文件函数数远低于 20 上限。

## 再次复核（67c6748e → 本次修补）

复核范围：上一轮修补后的 6 个组件 + 19 项测试，逐项重验指针映射、窗口语义与边界渲染。

查出并修复 3 个问题：

1. **`layout.ts` 重复 `StackOptions` 声明（LOW）**——同一接口定义两次，`tsc` 因结构相同未报错，但属实实在在的冗余。删其一。
2. **`select.ts` 指针窗口基准与溢出计数行（MEDIUM）**——`handlePointer` 用 `model.total`（= `matches.length`，当前等价）而 `render` 用 `visible.length`，过滤变化瞬间两者可脱节；且溢出时 `render` 末尾多一行 `(1/10)` 计数行，点中它会按 `window.offset + y` 误选一个 option。改为与 `render` 同基准（`visible.length`），并对窗口外行（含计数行）直接返回 `undefined`。回归测试：点计数行不触发 `onSelect`。
3. **`layout.ts` `HStack` 空子项崩溃（LOW）**——`children` 为空时 `Math.max(...[])` 得 `-Infinity`，`for (row < -Infinity)` 不执行，实际返回 `[]` 未崩溃，但语义靠巧合。加显式早退 `if (children.length === 0) return []` 并改 `Math.max(0, ...)`。回归测试：空栈渲染得 `[]`。

确认无问题：dialog 指针行 `event.y - 2` 与 `render` 的标题+详情两行一致；`PromptEditor.handleInput` 单字符限制与上一轮结论一致（Surface 给 raw bytes，需接 `stdinBuffer` 解码，仍留给输入链路任务）；loader `Date.now()` 为 spinner 时间驱动；`Markdown` 缓存键未含 `streaming` 但 `setStreaming` 已清缓存，等价正确。

验证：适配层 37 项通过；TUI 全套件 22 文件 315 项通过；`npm run build:ts` 通过。
