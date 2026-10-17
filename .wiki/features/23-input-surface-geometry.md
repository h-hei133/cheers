---
title: "输入框几何与编辑表面：左右留白、可视行数与复制选区"
category: article
sources: [repo-audit-2026-10-15, packages/ts-shell/src/presentation/tui/composer/frame.ts, packages/ts-shell/src/presentation/tui/composer/row.ts, packages/ts-shell/src/presentation/tui/composer/projection.ts, packages/ts-shell/src/presentation/tui/surface/view.ts, oh-my-pi/packages/tui/src/components/composer/*, oh-my-pi/packages/coding-agent/src/modes/interactive-mode.ts, codex/codex-rs/tui/src/bottom_pane/chat_composer.rs, 14-tui-composer-and-theme.md]
created: 2026-10-15
updated: 2026-10-17
tags: [features, tui, composer, geometry, gap-analysis]
summary: "源码复核：正常宽度每侧 padding 2 cells，窄屏会收缩；现有 composer 总高上限 10，24 行终端预算 8（默认正文 6）。按用户要求设计为每侧 1 cell、正文最多 16 行，并由外层统一分配装饰、提示、面板与 transcript 预算。应用自身复制选区保留源映射。"
confidence: high
---

# 输入框几何与编辑表面

本轮为**只读研究**：未修改产品源码、测试或配置，未运行测试套件。源码基线 `feat/phase-18` @ `0d30d589`；参考快照 oh-my-pi `c2cb79e4`、pi `4a5d3729`、codex `4210c08d`。所有断言附 `path:line`，实测与推断分开标注。

**2026-10-17 源码复核**：对照当前工作树修正文内算术、能力边界与裁决；本次仅修订研究文档，未新增动态执行或 PTY 验证。原编译产物实测属于 2026-10-15 快照，不代表当前动态验证。任务引用使用 `23/G-xx`。

## 1. 用户报告与实测结论

| 用户报告 | 实测结论 | 判定 |
|---|---|---|
| 左侧留白「好像是两格」 | 正常宽度每侧 `padding = 2` cells，窄屏自动收缩，且在 gutter 之内 | 源码确认 |
| 输入框最多约 7 行 | 实测 24 行终端为 **8 行**（其中内容行 6 行）；上限硬编码 10 | 基本属实（详见 §3） |
| 复制时不应带出 padding 空格 | 应用自身选区按 `contentColumn` 映射，padding 无源单元 | 保留；终端原生选择另验 |

## 2. 左右留白的精确算术

`composerFrame`（[frame.ts:25-32](../../packages/ts-shell/src/presentation/tui/composer/frame.ts#L25)）：

```ts
const bounded = Math.max(0, Math.floor(width));
let left = shape.side === "none" ? 0 : 1;
let right = shape.side === "caps" || shape.side === "round" || (shape.side === "rail" && scrolling) ? 1 : 0;
if (bounded < left + right + 5) left = right = 0;
const gutter = Math.min(visibleWidth(shape.gutter), Math.max(0, bounded - left - right - 5));
const padding = Math.min(2, Math.max(0, Math.floor((bounded - left - right - gutter - 1) / 2)));
return { width: bounded, left, right, gutter, padding, text: bounded - left - right - gutter - 2 * padding };
```

要点：

- `padding` 由 `Math.min(2, …)` 封顶，即**正常宽度下所有形态都是每侧 2 cells**（共 4 cells 被留白吃掉）。
- 它作用在 **gutter 之内**：内容列 `contentColumn = frame.left + frame.gutter + frame.padding`（[row.ts:44](../../packages/ts-shell/src/presentation/tui/composer/row.ts#L44)）。
- 因此文字起点距屏幕左边是 `left + gutter + padding`。默认形态 `gutter = "❯ "`（2 cells），故 **4 cells 之后才是正文**。

实测（`node` 直接调用编译产物，80 列）：

| 形态 | `left` | gutter 宽度 | `padding` | `text` 宽 |
|---|---|---|---|---|
| `default` | 0 | 2 | 2 | 74 |
| `band` | 0 | 3 | 2 | 73 |
| `borderless` | 0 | 2 | 2 | 74 |
| `top-rule` | 0 | 2 | 2 | 74 |
| `padded-rules` | 0 | 0 | 2 | 76 |
| `field` | 1 | 0 | 2 | 74 |
| `rail` | 1 | 0 | 2 | 75 |
| `box` | 1 | 0 | 2 | 74 |

真实渲染证据（`layoutComposer` 输出，40 列）：

```text
"────────────────────────────────────────"
"❯   hello world\u001b_c\u0007                         "
"────────────────────────────────────────"
```

`❯` 之后有 3 个空格：gutter 自带 1 格，padding 再加 2 格；没有额外的正文前填充。用户感受到的「太远」来自 gutter 2 cells 与 padding 2 cells 的叠加。

### 2.1 文档 16 的既有裁决已被用户本轮推翻

[14-tui-composer-and-theme.md](14-tui-composer-and-theme.md) §1.3 曾把「文本区域左右各留 **2 cells** 空白」写成已确认的用户要求。本轮用户要求改为 **1 格**。这是需求变更，不是实现缺陷——实现与当时文档一致。

### 2.2 参考实现：padding 按形态区分，不统一

oh-my-pi 每个形态自带 `defaultPaddingX()`（[packages/tui/src/components/composer/](https://github.com/can1357/oh-my-pi/tree/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/composer)）：

| 形态 | `defaultPaddingX` | 文件 |
|---|---|---|
| `claude` | **0** | `claude.ts:18-20` |
| `band` | **0** | `band.ts` |
| `borderless` | **0** | `borderless.ts` |
| `rule` | **0** | `rule.ts` |
| `box` | `max(0, themePaddingX ?? 2)` | `box.ts` |
| `field` | **1** | `field.ts` |
| `pi` | **1** | `pi.ts` |
| `rail` | **1** | `rail.ts` |

即：参考的 **claude 形态（Cheers `default` 的几何来源）padding 为 0**，留白完全由 `❯ ` gutter 提供。Cheers 把 2 加在了一个本来靠 gutter 定位的形态上，这就是「太远」的直接原因。

codex 侧：`LIVE_PREFIX_COLS = 2`（[ui_consts.rs:10](https://github.com/openai/codex/blob/4210c08defe92fe8828f789b6f9fda287ad3709e/codex-rs/tui/src/ui_consts.rs#L10)），`COLS_WITH_MARGIN = LIVE_PREFIX_COLS + 1`（[chat_composer.rs:4561](https://github.com/openai/codex/blob/4210c08defe92fe8828f789b6f9fda287ad3709e/codex-rs/tui/src/bottom_pane/chat_composer.rs#L4561)）；前缀列是 2 格固定缩进，无额外 padding 概念。

**设计决定**：按用户已提出的「调为一格」，正常宽度每侧 padding 改为 **1 cell**，沿用现有所有形态共享的几何入口；窄屏仍允许降到 0。参考的 0 padding 是比较依据，不覆盖用户要求。gutter、侧框仍分别计宽，不能把「padding 1」解释为正文距终端左缘仅 1 格。

## 3. 可视行数上限

`InteractiveSurface.renderChrome`（[view.ts:207-208](../../packages/ts-shell/src/presentation/tui/surface/view.ts#L207)）：

```ts
const chromeCapacity = Math.max(1, height - MIN_TRANSCRIPT_ROWS);   // MIN_TRANSCRIPT_ROWS = 1
const maxComposerRows = Math.min(chromeCapacity, Math.max(3, Math.min(10, Math.floor(height * 0.35))));
```

`composerChrome` 再把 `maxRows` 扣掉顶部横线、底部横线、gap 与 footer，余下才是内容行（[frame.ts:36-47](../../packages/ts-shell/src/presentation/tui/composer/frame.ts#L36)）。

实测内容行（30 行文本，80 列，`default` 形态）：

| `maxRows` | 总行数 | 内容行 |
|---|---|---|
| 8 | 8 | 6 |
| 10 | 10 | 8 |
| 16 | 16 | 14 |
| 20 | 20 | 18 |

即 `default` 形态下**上下横线各吃掉 1 行**，所以「10 行」实际只有 8 行可见正文。

按终端高度换算 `maxComposerRows`：

| 终端高度 | Cheers `maxComposerRows` | 实际内容行（default） |
|---|---|---|
| 24 | 8 | 6 |
| 30 | 10 | 8 |
| 40 | 10 | 8 |
| 60 | 10 | 8 |
| 80 | 10 | 8 |

用户说「一共只能容下 7 行」与 24 行终端的 6 内容行、30 行终端的 8 内容行基本吻合。

### 3.1 参考上限

oh-my-pi `computeEditorMaxHeight`（[interactive-mode.ts:533-537](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/modes/interactive-mode.ts#L533)），常量在同文件 515-520 行：

```ts
const EDITOR_MAX_HEIGHT_MIN = 6;
const EDITOR_MAX_HEIGHT_MAX = 18;
const EDITOR_RESERVED_ROWS = 12;
const EDITOR_FALLBACK_ROWS = 24;
const EDITOR_MIN_CHROME_ROWS = 4;
const EDITOR_MIN_RENDERED_ROWS = 3;

export function computeEditorMaxHeight(terminalRows: number): number {
  const rows = Number.isFinite(terminalRows) && terminalRows > 0 ? terminalRows : EDITOR_FALLBACK_ROWS;
  const comfortable = Math.max(EDITOR_MAX_HEIGHT_MIN, Math.min(EDITOR_MAX_HEIGHT_MAX, rows - EDITOR_RESERVED_ROWS));
  return Math.max(EDITOR_MIN_RENDERED_ROWS, Math.min(comfortable, rows - EDITOR_MIN_CHROME_ROWS));
}
```

对比：

| 终端高度 | oh-my-pi 上限 | Cheers 上限 | 差值 |
|---|---|---|---|
| 24 | 12 | 8 | +4 |
| 30 | 18 | 10 | +8 |
| 40 | 18 | 10 | +8 |
| 60 | 18 | 10 | +8 |
| 80 | 18 | 10 | +8 |

参考公式以高度减 12 为舒适预算，但还包含最小值与屏幕钳制，不能宣称任何小屏都实际保留 12 行。Cheers 当前是「终端高度的 35%，总高上限 10」。设计将用户希望的 **16 行定义为正文可视行上限**，装饰另计，实际仍由屏幕可用空间钳制；不得只把常量 10 改为 16，却仍只显示 14 行正文。

codex 侧：`desired_height` 直接返回 textarea 的换行行数加上装饰与 popup 高度（[chat_composer.rs:4550-4575](https://github.com/openai/codex/blob/4210c08defe92fe8828f789b6f9fda287ad3709e/codex-rs/tui/src/bottom_pane/chat_composer.rs#L4550)，`textarea.rs:467-469` 的 `desired_height(width) = wrapped_lines(width).len()`），**由外层屏幕布局去钳制**，composer 自身不设固定上限。这是第三种设计：把上限交给布局层。

## 4. 复制选区与 padding 的关系（已满足）

用户要求「用鼠标选中时左右两侧没有空格，方便复制」。应用自身选区通过**源单元映射**实现此要求，不能据此推断终端原生拖选也会排除屏幕空格：

- 每个内容行携带 `cells`，每个单元的 `columnStart/columnEnd` 在构建时整体偏移 `contentColumn`（[row.ts:53-54](../../packages/ts-shell/src/presentation/tui/composer/row.ts#L53)）。
- 选区端点解析 `sourceBoundary`：若 `point.column < row.contentColumn` 直接返回 `row.sourceStart`（[projection.ts:19](../../packages/ts-shell/src/presentation/tui/composer/projection.ts#L19)）；否则在 `row.cells` 中二分到最近的源边界。
- padding、gutter、侧框**没有对应的源单元**，因此拖选跨过它们只会钳到相邻正文边界，不会产生空格字符。
- 高亮同样只作用于有源单元的单元格（[projection.ts:38-50](../../packages/ts-shell/src/presentation/tui/composer/projection.ts#L38)）。

**设计约束**：改变 padding 后仍通过同一 `contentColumn` 构建渲染与源映射；禁止在复制时 trim 正文来掩盖几何错误，因为正文缩进与尾空格可能有语义。是否无回归仍需实现后的反例验证。

## 5. 决策与任务（保留原 ID）

| # | 决策 | 选项 | 证据 |
|---|---|---|---|
| G-01 | `default` 形态 padding | 已按用户要求设计为每侧 1 cell，窄屏可缩为 0 | §2.2 |
| G-02 | 其他形态是否跟随 | 技术决定：沿共享入口全部跟随，gutter/侧框独立计宽 | 避免产生另一套映射几何 |
| G-03 | 可视上限 | 设计为最多 16 行正文；不直接把总高常量改为 16 | 用户希望可见 16 行 |
| G-04 | 上限是否随高度增长 | 技术决定：实际正文随可用预算增长，到 16 行封顶 | 小屏不溢出 |
| G-05 | 装饰行是否计入上限 | 技术决定：16 指正文，装饰计入外层总预算 | 清楚区分内容与 chrome |

### 5.1 生产契约与反例验收

- surface 统一预留 transcript、activity、suggestions、hint 与 overlay，再给 composer 内容及装饰分配空间；不能让新 16 行上限挤掉权限内容、把同一行预算分配两次。现有入口见 [view.ts:207-240](../../packages/ts-shell/src/presentation/tui/surface/view.ts#L207)。
- 覆盖 0/1/8/24/40/60 行屏幕与窄宽度；长草稿增长到预算后滚动，光标、scrollbar、选区和实际内容窗口必须一致。正常宽度正文上限达到 16，缩小屏幕时服从实际预算。
- CJK、组合字符、emoji、tab、首尾真实空白、软换行、滚动后跨行拖选都保留源文本；改变 padding 不得改变被复制的正文。regular/fullscreen 与终端原生选择分别记录证据。

## 6. 未验证项

- 未在真实 PTY 中目视确认 24 行终端的 6 内容行与用户观感一致（结论来自公式与 `layoutComposer` 实测）。
- 未新增验证rail滚动时right从0变1的视觉影响；box的right按round/caps几何独立保留，不能写成box也由scrolling触发。
- 未验证 Windows Terminal / ConPTY 下的宽度测量差异。
