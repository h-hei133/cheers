# UI 容器几何与状态投影

Phase 20 的 W4 公共前置：输入区、面板、选择器共用同一套预算与命中规则，避免每个
picker 各自猜屏幕大小。

## 1. 输入区预算

- 每侧留白 1 cell；装饰（gutter、边框、gap、footer）不计入 16 行正文目标。
- `MAX_COMPOSER_CONTENT_ROWS = 16` 是正文上限，仍受实际屏幕钳制。
- `composerRowBudget(height) = min(height - 1, max(3, min(20, floor(height * 0.6))))`：
  20 行终端给 12 行、40 行及以上给 20 行（正文 16 + 至多 4 行装饰），
  并始终为 transcript 留至少 1 行。
- 八种形态、源文复制、软换行、IME 尾、emoji 与 caret 行为不变。

## 2. 面板与两栏

- `renderPanel` 只在传入的 `width`/`capacity` 内绘制：`capacity === 0` 返回空，
  `capacity === 1` 只返回 footer，`width <= 0` 返回空。
- 宽 ≥ 60 且提供 `detail` 时启用两栏：列表占 45%（至少 20 列），
  余下为详情列，中间一条 `│`；窄屏自动退化为单栏，焦点与选中不变。
- 每个可选行记录 `{id, from, to}` 命中区间；详情列点击不改变焦点。
- 每帧渲染先清空行映射，因此 resize、过滤、异步更新后旧命中立即失效；
  模态框沿用同一映射（整行可点）。

## 3. 状态与进度

- loading、empty、error 三态分开：error 使用 `error` 色，loading 与 empty
  保持 dim；不会把加载失败画成“没有选项”。
- `ProgressProjection` 只有三种：`determinate`（used/total 均为有限数且 total > 0）、
  `indeterminate`（有活动、无分母）、`unknown`（无法声称任何比例）。
  后两者绝不输出百分比；比例钳制在 0..1，窄屏先牺牲进度条而不是标签。
- `renderChips` 在单行内保持活动 chip 可见，两侧溢出以 `…` 标记，宽度严格有界。

## 4. 验证

- `composer/geometry.test.ts` 8 项：16 行上限、5 种终端高度的预算、八形态 × 5 宽度 ×
  4 高度的宽度/行数不越界、单侧留白。
- `chrome/panel.test.ts` 4 项、`chrome/progress.test.ts` 4 项、`chrome/chips.test.ts` 3 项。
- `overlay.test.ts` 新增详情列点击不聚焦；composer/chrome/overlay/settings/pointer
  组合 14 文件 190 项通过。

## 5. transcript 语义源投影

- `SourceLine` 记录所属 block、该视觉行的源文本与 `soft`/`logical` 断点；
  `projectText` 用与渲染相同的宽度逐逻辑行 wrap，因此软换行不产生 `\n`。
- `sourceLinesFor` 只在渲染行数与源行数完全对齐时返回投影；markdown 列表、
  表格、折叠块或自定义 `rows` 渲染器返回 `undefined`，复制回退到渲染文本清理，
  不从未知装饰反推原文。
- 选择复制要求整行起点（首列 0）且终点到达行尾；跨 block 或落在装饰行则拒绝。
- `Transcript.render` 与屏幕行对齐返回 `sources`；pane 的 `extractSource`
  按 block 拼接，pointer 优先使用它，未提供时回退 `extractSelection`。
- 源投影按渲染帧重建；resize/stream 后旧行映射不再存在，选区不会指向旧源。

**验证**：`transcript/source.test.ts` 4 项（soft/logical、对齐拒绝、整行复制、
中途/装饰行拒绝）；surface/transcript/selection/pointer 14 文件 229 项通过。
