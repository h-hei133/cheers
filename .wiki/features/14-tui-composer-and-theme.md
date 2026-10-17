---
title: "16：Composer Shape 转接与配色重构设计"
category: article
sources: [14-user-experience-research, oh-my-pi, codex, pi, current-source-28ff98ce]
created: 2026-10-05
updated: 2026-10-05
tags: [research, tui, composer, theme, design, selection]
summary: "Phase 19 待实施方案：dark 同义角色精确采用参考调色板；八种中性命名形态全部纳入，default 为默认；左右各 2 cells 内容留白；逐行布局映射保证复制原文、排除装饰。纠正令牌计数、终端默认色、IME、viewport 与复制设计中的错误。"
confidence: mixed
---

# 16：Composer Shape 转接与配色重构设计

## 1. 范围与结论口径

本文是 **Phase 19 待实施设计**。本次审查只修正文档，未修改产品源码、测试、配置或 package scripts，也未运行动态 PTY。源码基线为 `feat/phase-18` @ `28ff98ce`；引用参考仓只用于语义比较。

已确认的用户要求：

1. 在既有 `dark` 上精确采用参考仓同义角色的调色板，不创建带参考项目名的新预设。
2. 八种输入框形态全部纳入 Phase 19；默认采用上下横线与右端状态 chip 的几何，产品 id 为 `default`，全部 id 中性化。
3. 文本区域左右各留 **2 cells 空白**；边框、gutter、端帽不计入这 2 cells。
4. 应用内拖选复制排除布局生成的装饰与空白，**完整保留用户原文的缩进、尾空格、tab、空行和逻辑换行**；软折行不增加换行。

本文已直接替换旧草稿中的冲突方案。§10.4 的非同义颜色映射已由用户批准；本文不再保留待答裁决。

## 2. 当前 Cheers 输入区实现（源码）

| 关注点 | 当前位置 | 已核对事实 |
|---|---|---|
| 提示符与宽度 | [composer.ts](../../packages/ts-shell/src/presentation/tui/chrome/composer.ts) | `CUE = "╰─ "`；文本预算扣 gutter；续行不重复 cue，当前从第 0 列起 |
| 输入 viewport | [editor.ts](../../packages/ts-shell/src/presentation/tui/editor.ts#L447) | 已有 `scrollOffset` 与随 caret 移动的 viewport；缺显式滚动条和输入区手动指针滚动 |
| 状态带 | [band.ts](../../packages/ts-shell/src/presentation/tui/chrome/band.ts) | 独立背景行；宽度压力下丢弃右侧段，全空时回退模型名 |
| 状态项 | [items.ts](../../packages/ts-shell/src/presentation/tui/chrome/items.ts) | 15 个可选项，默认 model/agent-mode/permission-scope/branch/context/directory |
| 组装与几何 | [view.ts](../../packages/ts-shell/src/presentation/tui/surface/view.ts) | 正常 surface 组装状态带、composer、hints；全屏 overlay 接管时清除 composer geometry |
| 拖选 | [pointer.ts](../../packages/ts-shell/src/cli/interactive/pointer.ts) / [selection.ts](../../packages/ts-shell/src/presentation/tui/transcript/selection.ts) | 按渲染行切片，再用 cue 正则、trim/dedent 清洗；无法保证保留原始输入空白 |
| 主题 | [schema.ts](../../packages/ts-shell/src/presentation/themes/schema.ts) / [theme.ts](../../packages/ts-shell/src/presentation/theme/theme.ts) | 48 个 token；解析接受 hex/ANSI 色名，不接受空串；有旧主题继承规则与 revision 缓存失效 |

当前没有 `composerShape` 配置。现有外观与参考 `band` 相似，但续行缩进、空状态带和 padding 行为不同，不能称逐字节等价。

## 3. 参考形态系统及转接边界

参考 [types.ts](../../../oh-my-pi/packages/tui/src/components/composer/types.ts) 定义四种状态挂载位置：`top-border`、`top-band`、`top-rule-chip`、`none`，另有 bottom bar、padding、侧框与行渲染契约。[registry.ts](../../../oh-my-pi/packages/tui/src/components/composer/registry.ts) 注册八种形态。

| 参考 id（仅出处） | 状态挂载 | bottom bar | 参考几何 |
|---|---|---|---|
| `claude` | top-rule-chip | left | 上下横线、`❯ ` gutter、顶线右端 chip |
| `band` | top-band | none | 填充状态带、`╰─ ` gutter |
| `borderless` | none | full | 无上下横线、`❯ ` gutter |
| `rule` | top-rule-chip | left + gap | 单顶线、右端 chip |
| `pi` | none | full | 上下横线，无 gutter |
| `field` | none | full + gap | 填充行与左右端帽 |
| `rail` | none | full + gap | 填充行与左强调栏 |
| `box` | top-border | none | 圆角框，通常末内容行并入底框 |

参考 [box.ts](../../../oh-my-pi/packages/tui/src/components/composer/box.ts#L47) 的 `renderRow` 可输出两行：IME 安全尾分支产生内容行与独立底框。因此 `verticalChrome: 2` 只能作声明信息，不能直接代替实际布局行数。参考 [field.ts](../../../oh-my-pi/packages/tui/src/components/composer/field.ts#L37)、[rail.ts](../../../oh-my-pi/packages/tui/src/components/composer/rail.ts#L36) 同样消费 `imeSafeCursorTail`；该能力须由三种侧装饰形态共用。

## 4. 转接决定

### 4.1 契约与所有权

在 `presentation/tui/composer/` 建立清晰的形态、布局、选择 owner，使用 `contract`、`layout`、`selection`、`registry` 和各形态短文件名。现有 chrome composer 入口保持薄适配，surface 负责分配屏幕预算，editor 保持输入与 viewport 所有权。完整契约见 §11.4，复制链路见 §12。

### 4.2 选择、默认与预览

`tui.composerShape` 使用 §11.2 的八个 id，未设置时为 `default`。当前没有该键的存量值需要迁移；实现后显式选择优先于默认值。`/settings` 外观页承载形态选择，不为了同一配置再建另一套命令状态。

形态和主题可在内存中预览；Esc、错误或取消恢复进入前状态，**Apply 才保存配置**。预览复用实际 renderer，不创建近似预览器；保存失败必须显示失败并保留可恢复的选择状态。

### 4.3 保留的行为与有意变化

保留 `band` 这一产品形态、输入编辑语义、随 caret 移动的 viewport、状态事实来源。统一左右 2 cells 留白、续行对齐、source mapping 和默认形态改变是明确的行为变化，不能用“band 输出逐字节不变”作为验收条件。

### 4.4 风险

CJK 宽字、组合字符、emoji ZWJ、行尾 caret、IME preedit、低行高与 resize 均影响实际布局。留白收紧文本宽度后会增加软折行，从而改变 viewport 与 regular 固定尾块高度；必须联合验收，不能说“只改列、不影响行数”。

## 5. 配色决定与实现边界

用户选择精确参考调色板是审美决定；本轮没有证据证明“原色值差异就是不好看的原因”。最终逐项表见 §10，不再保留近似调色或新增外部项目名主题作为现行选项。

颜色实现不只是 JSON 改值：终端默认前景需要 schema、变量解析、主题模型、ANSI encoder、legacy 适配和所有调用方一致支持；代码高亮 fallback 需要真正的读色方；新 token 的旧主题兼容需要继承旧主题自己的颜色。

## 6. 集成边界

配色与布局可以分批交付，但 Phase 19 验收包含全部八形态。具体 owner 与步骤见 §13；不得将 rail/box 的 IME 安全、source mapping 或原文复制作为后续可选补丁。

## 7. 验证口径

本轮仅修改 Markdown，不运行 build/tests。§12.7、§13.2 是后续实施必须执行的验证计划，不能当作本轮通过证据。动态终端视觉、真实输入法、主题保存与取消均尚未验证。

## 8. 参考

- 目标：[composer.ts](../../packages/ts-shell/src/presentation/tui/chrome/composer.ts)、[editor.ts](../../packages/ts-shell/src/presentation/tui/editor.ts)、[view.ts](../../packages/ts-shell/src/presentation/tui/surface/view.ts)、[pointer.ts](../../packages/ts-shell/src/cli/interactive/pointer.ts)。
- 参考：[形态契约](../../../oh-my-pi/packages/tui/src/components/composer/types.ts)、[形态注册表](../../../oh-my-pi/packages/tui/src/components/composer/registry.ts)、[预览](../../../oh-my-pi/packages/tui/src/overlays/composer-shape-preview.ts)、[dark](../../../oh-my-pi/packages/tui/src/theme/dark.json)。

## 9. 证据边界

源码可以证明当前控制流、token 集合和参考几何；不能证明用户终端的视觉原因或所有终端的复制行为。后文公式是指定 sRGB 颜色上的计算，形态、padding、默认色与 source mapping 是待实施设计。

## 10. 精确调色板与完整令牌对照

基准为 [Cheers dark.json](../../packages/ts-shell/src/presentation/themes/dark.json) 与 [参考 dark.json](../../../oh-my-pi/packages/tui/src/theme/dark.json) 的变量解析值。集合重算：Cheers 48、参考 67；**同名共有 29 = 已一致 15 + RGB 不同 11 + 参考终端默认 3**；Cheers 独有 19、参考独有 38。不能把同义映射当作同名共有，也不能把“对应面”当成一个 token。

### 10.1 完整对照表

#### A. 同名共有且 RGB 已一致（15）

| token | 当前 = 目标 |
|---|---|
| `accent` | `#febc38` |
| `success` | `#89d281` |
| `error` | `#fc3a4b` |
| `warning` | `#e4c00f` |
| `muted` | `#777d88` |
| `dim` | `#5f6673` |
| `userMessageBg` | `#221d1a` |
| `selectedBg` | `#31363f` |
| `thinkingText` | `#777d88` |
| `toolOutput` | `#777d88` |
| `mdCode` | `#e5c1ff` |
| `mdLink` | `#0088fa` |
| `mdLinkUrl` | `#5f6673` |
| `mdListBullet` | `#febc38` |
| `mdQuoteBorder` | `#3d424a` |

#### B. 同名共有、修改 RGB（11）

| token | 当前 | 目标 |
|---|---|---|
| `border` | `#3d424a` | `#178fb9` |
| `borderAccent` | `#5f6673` | `#0088fa` |
| `borderMuted` | `#282c34` | `#3d424a` |
| `mdHeading` | `#0088fa` | `#febc38` |
| `syntaxComment` | `#777d88` | `#6A9955` |
| `syntaxKeyword` | `#178fb9` | `#569CD6` |
| `syntaxString` | `#e5c07b` | `#CE9178` |
| `syntaxNumber` | `#ce9178` | `#B5CEA8` |
| `syntaxType` | `#febc38` | `#4EC9B0` |
| `syntaxFunction` | `#d4d4d4` | `#DCDCAA` |
| `syntaxVariable` | `#89d281` | `#9CDCFE` |

#### C. 同名共有、采用终端默认前景（3）

| token | 当前 | 目标语义 |
|---|---|---|
| `text` | `#d4d4d4` | 终端默认前景 |
| `userMessageText` | `#ffffff` | 终端默认前景 |
| `toolTitle` | `#d4d4d4` | 终端默认前景 |

参考用空串表达终端默认。Cheers 不直接复制空串：现有 [schema.ts](../../packages/ts-shell/src/presentation/themes/schema.ts#L71) 会拒绝，且 [color.ts](../../packages/ts-shell/src/presentation/theme/color.ts#L65) 的未知色兜底会变白。新增明确 JSON 表达 `"default"`，解析成区分默认色与具体色的值；缺失 token 的 fallback 与显式 `default` 必须不同。

在有色输出中，前景默认使用 SGR 39、背景默认使用 SGR 49，嵌套样式进入/退出时按样式栈恢复；不能以“不输出前景序列”误继承外层颜色。`none` 禁用颜色序列，完全纯文本输出另由输出能力策略控制。schema、vars、ThemeConfig、Theme、颜色编码、legacy 主题适配和缓存必须一起支持；未知值继续拒绝，不静默变白。参考 `terminal.foreground #cccccc` 是参考终端配置，不能冒充任意用户终端的默认前景。

#### D. Cheers 独有（19）：同义映射与已批准的产品映射

| token | 当前 | 目标 | 依据 |
|---|---|---|---|
| `statusBandBg` | `#303030` | `#121212` | 同义 `statusLineBg` |
| `filename` | `#89d281` | `#89d281` | 产品路径角色继续用参考 green |
| `command` | `#89d281` | `#89d281` | 产品命令角色继续用 green |
| `commandArg` | `#d4d4d4` | `default` | 与正文 `text` 同一默认前景语义 |
| `commandFlag` | `#178fb9` | `#569CD6` | 产品选项角色映射 `syntaxKeyword` |
| `commandString` | `#e5c07b` | `#CE9178` | 字符串映射 `syntaxString` |
| `commandNumber` | `#ce9178` | `#B5CEA8` | 数字映射 `syntaxNumber` |
| `commandPipe` | `#178fb9` | `#178fb9` | 产品结构符继续用 blue |
| `diffAdded` | `#89d281` | `#89d281` | 同义 `toolDiffAdded` |
| `diffRemoved` | `#fc3a4b` | `#fc3a4b` | 同义 `toolDiffRemoved` |
| `diffContext` | `#777d88` | `#777d88` | 同义 `toolDiffContext` |
| `scrollbarTrack` | `#6c6c6c` | `#808080` | 用户批准的产品映射，见 §10.4 |
| `scrollbarThumb` | `#c0c0c0` | `#e5e5e5` | 用户批准的产品映射，见 §10.4 |
| `syntaxText` | `#d4d4d4` | `#D4D4D4`（RGB 不变） | 成功高亮中的普通源码映射 operator/punctuation；不计大小写为颜色变更 |
| `syntaxBuiltin` | `#89d281` | `#9CDCFE` | 用户批准映射变量色，见 §10.4 |
| `syntaxMeta` | `#5f6673` | `#5f6673` | 产品元信息继续用 dimGray |
| `mdQuoteText` | `#5f6673` | `#777d88` | 同义 `mdQuote`，无需再次裁决 |
| `mdRule` | `#3d424a` | `#3d424a` | 同义 `mdHr` |
| `mdCodeBorder` | `#3d424a` | `#777d88` | 同义 `mdCodeBlockBorder` |

D 表合计：修改 10（9 个 RGB + 1 个默认前景语义）、不变 9。

#### E. 参考独有（38）：新增与同义消费

立即纳入此次主题实现的新 token 共 **6**，必须同时有生产读者：

| 新 token | dark 目标 | 生产读者 |
|---|---|---|
| `statusLineModel` | `#d787af` | 模型状态段 |
| `statusLinePath` | `#00afaf` | 目录状态段 |
| `statusLineGitClean` | `#5faf5f` | 干净分支状态段 |
| `statusLineGitDirty` | `#d7af5f` | 脏分支状态段 |
| `statusLineContext` | `#8787af` | 正常档上下文段；风险档仍走共享阈值策略 |
| `mdCodeBlock` | `#9CDCFE` | 未指定/未知语言、超限或高亮失败的代码正文 fallback |

[syntax.ts](../../packages/ts-shell/src/presentation/theme/syntax.ts#L63) 当前 fallback 直接返回裸源码；`syntaxText` 只在成功高亮的无 scope 文本中使用，未覆盖该路径。新增 `mdCodeBlock` 要逐行着色且保持源文不变；`none`/纯文本仍返回原文，无 ANSI 入存储。

余下 **32** 个参考独有 token 分组核对：状态 9（Bg/Sep/Spend/Staged/Dirty/Untracked/Output/Cost/Subagents）、thinking 6、工具背景 3、自定义消息 3、Markdown 3（CodeBlockBorder/Quote/Hr）、syntax 2（Operator/Punctuation）、toolDiff 3、link/bashMode/pythonMode 3。其中同义角色已由现有 token 消费，不重复建键；未有同义读者的角色在对应 Phase 19 功能批次明确需求后接入，不能为完整复制 JSON 而添加无消费者字段。这不删减大型系统的 Phase 19 范围。

参考 256 色整数不能直接塞入现有 hex/色名 schema。对应值：244→`#808080`、70→`#5faf00`、178→`#d7af00`、39→`#00afff`、205→`#ff5faf`；这些是索引的 RGB 定义，不保证 Cheers 当前降色算法反向得到同一索引，低色模式须另验收。

### 10.2 变更数与 schema 总数

按 A–D 每行计数：原 **48** 键 = **24 个修改**（20 个 RGB + 4 个终端默认语义）+ **24 个不变**。`syntaxText` 大小写不计语义修改。该统计已包括 §10.4 用户批准的三项产品映射。

新增 E 表 6 键后 schema 与四套内建主题均为 **54** 键。不得把新增数从“未改的旧键”中扣除。`dark` 用本表目标；其他三套预设保持自己的明暗语义并显式提供六键。

旧自定义主题缺少新键时，继承它自己的角色：model←accent、path←dim、gitClean←success、gitDirty←warning、context←dim、mdCodeBlock←syntaxText（再按既有继承规则回到 text）。应按依赖顺序解析，不能从新版 dark 借色污染旧 light 主题。旧显式 hex/色名保持有效；显式 `default` 和缺省继承分开。

### 10.3 对比度核算与限制

以下为指定 sRGB 色对的 WCAG 公式值，不是终端目视或全 UI 可访问性认证：

| 前景 | 对 `#303030` | 对目标 `#121212` |
|---|---:|---:|
| `#d4d4d4`（固定示例，非目标正文默认值） | 8.90 | 12.64 |
| `dim #5f6673` | 2.28 | 3.24 |
| `muted #777d88` | 3.19 | 4.53 |
| `accent #febc38` | 7.83 | 11.12 |
| `warning #e4c00f` | 7.44 | 10.57 |

`border #178fb9` 对 `#18181e`/`#121212` 为 4.77/5.05；`borderAccent #0088fa` 为 4.97/5.27。五个新增状态色对 `#121212` 最低为 context 的 5.45。

`dim` 低于普通文字 4.5:1；“次要文本”不是豁免。关键状态、警告和操作说明应选可读角色，并保留文本/字形线索。`#18181e` 是参考终端背景，不是 Cheers 控制的背景；默认前景也由终端决定。因此要在明暗终端、16/256/truecolor 和 contrast 预设上分别验证，不能以此表保证任意终端通过。

### 10.4 用户批准的非同义角色映射

| token | 现值 | 已批准目标 | 说明 |
|---|---|---|---|
| `syntaxBuiltin` | `#89d281` | `#9CDCFE` | 新值借 `syntaxVariable`；内置符号是否与变量同色属产品视觉选择 |
| `scrollbarTrack` | `#6c6c6c` | `#808080` | 新值借 `statusLineSep`，并非同义角色 |
| `scrollbarThumb` | `#c0c0c0` | `#e5e5e5` | 新值借参考 terminal ANSI 15，并非同义角色 |

用户已明确选择以上三个新映射。这是用户批准的本产品视觉决定，不是参考仓唯一的同义值。参考 box 的滚动条实际使用 `borderColor`，不能将本表说成参考滚动条原值。

### 10.5 读色方与回归面

边框影响工具卡、模态、hint、面板与 Markdown 表格；语法板影响 fenced code 与命令高亮；新增状态色由状态展示层消费。默认色改动需连通主题解析/encoder/legacy 与嵌套样式；新 fallback 要覆盖成功高亮之外的分支。具体 token 集合相等并不能证明渲染、继承或取消预览正确。

## 11. 八形态全量落地

### 11.1 可行性与共有能力

八种形态都可在现有 TypeScript TUI 内实现。`default`/`band`/`borderless`/`top-rule`/`padded-rules` 共享无侧框布局；`field`/`rail`/`box` 增加填充面、侧装饰、尾部 caret/IME 安全。无需新语言或第二渲染系统。

保留现有 caret-follow viewport；显式滚动条采用该 viewport 的真实总行数/可见范围，不能凭显示行截断模拟。手动滚动需在 editor 的同一 viewport 中定义鼠标焦点和 caret 可见性，不新建一套输入缓冲。所有侧装饰形态复用光标溢出与 IME 安全尾；保守尾策略先保留右侧空域，是否足够必须由输入法验收决定，不能无验证地裁剪完成标准。

### 11.2 中性命名与几何

| 产品 id | 产品几何 | 来源 |
|---|---|---|
| `default` | 上下横线、`❯ ` gutter、顶线右组 chip、左组底栏 | [claude.ts](../../../oh-my-pi/packages/tui/src/components/composer/claude.ts) |
| `band` | 顶部填充状态带、`╰─ ` gutter、无侧框 | [band.ts](../../../oh-my-pi/packages/tui/src/components/composer/band.ts) |
| `borderless` | 无横线、`❯ ` gutter、完整底栏 | [borderless.ts](../../../oh-my-pi/packages/tui/src/components/composer/borderless.ts) |
| `top-rule` | 单顶线与右端 chip、左组底栏及间隙 | [rule.ts](../../../oh-my-pi/packages/tui/src/components/composer/rule.ts) |
| `padded-rules` | 上下横线、无 gutter、完整底栏 | [pi.ts](../../../oh-my-pi/packages/tui/src/components/composer/pi.ts) |
| `field` | 多行均为填充字段，左右端帽，完整底栏及间隙 | [field.ts](../../../oh-my-pi/packages/tui/src/components/composer/field.ts) |
| `rail` | 多行填充与左强调栏，完整底栏及间隙 | [rail.ts](../../../oh-my-pi/packages/tui/src/components/composer/rail.ts) |
| `box` | 圆角框、顶框状态，末内容行可并底框；IME 分支可独立底框 | [box.ts](../../../oh-my-pi/packages/tui/src/components/composer/box.ts) |

八形态均按用户要求改为左右各 2 cells 内容留白；表中来源表示几何出处，不表示照搬参考默认 padding。

### 11.3 实施顺序

| 批次 | 交付 | 前置条件 |
|---|---|---|
| M0 | 公共布局/source mapping、`band` 与 `default` | 实际行高、真实列宽、默认配置与原文复制契约 |
| M1 | `borderless`、`top-rule`、`padded-rules` | 四种状态挂载、plain 底栏、gap、共享留白 |
| M2 | `field`、`rail` | 填充背景跨 SGR 恢复、侧装饰与共同 IME 安全尾 |
| M3 | `box` | 末行并底框/额外底框的逐行映射、同一 viewport、滚动条投影 |
| M4 | 全量选择与预览验收 | 八形态都可选，取消/Apply/失败与主题切换一致 |

所有批次均属于 Phase 19。不得以 M0 完成替代八形态完成。

### 11.4 类型与布局契约

以下是待实现的最小语义契约示意，字段必须由 owner 内完整类型定义，不传无类型 `facts/selection`：

```ts
export type ComposerShapeId =
  | "default" | "band" | "borderless" | "top-rule"
  | "padded-rules" | "field" | "rail" | "box";
export type StatusAttachment =
  | "top-border" | "top-band" | "top-rule-chip" | "none";

export interface SourceCell {
  readonly columnStart: number; // 屏幕 cell，半开区间
  readonly columnEnd: number;
  readonly sourceStart: number; // editor 原文 UTF-16 索引，必须在 grapheme 边界
  readonly sourceEnd: number;
}
export type ComposerLayoutRow =
  | {
      readonly kind: "content";
      readonly screenRow: number;
      readonly rendered: string;
      readonly contentColumn: number;
      readonly contentCells: number;
      readonly cells: readonly SourceCell[]; // 含 tab 展开到 source 的映射
      readonly sourceStart: number;
      readonly sourceEnd: number;
      readonly breakAfter: "soft" | "logical" | "none";
    }
  | {
      readonly kind: "decoration";
      readonly screenRow: number;
      readonly rendered: string; // 无 source 范围，不能被复制
    };
export interface ComposerLayout {
  readonly sourceRevision: number;
  readonly viewportStart: number;
  readonly rows: readonly ComposerLayoutRow[];
  readonly height: number; // 实际 rows.length，不由固定 chrome 常量推断
}
```

形态定义还需明确 `statusAttachment`、`bottomBar: none|left|full`、gap、左右 decoration/padding、gutter 与填充策略。行渲染上下文包括逻辑/可视行号、是否末行、caret、`cursorOverflow`、`imeSafeCursorTail`、滚动条范围与有限宽高；返回实际布局行。框行、状态行、gap、padding 都是不可复制装饰。source offsets 属于同一 editor revision；resize、编辑或 shape 改变后重新投影，不能混用旧屏幕坐标。

## 12. 左右留白与原文复制

### 12.1 Codex 参考能证明什么

[chat_composer.rs](../../../codex/codex-rs/tui/src/bottom_pane/chat_composer.rs#L1021) 将 textarea 与 gutter 分开布局，并预留右侧空间；[event_stream.rs](../../../codex/codex-rs/tui/src/tui/event_stream.rs#L250) 不将 mouse 事件传给应用。该证据支持“文本与装饰分离”的布局决策。

它**不能证明终端原生拖选天然不含 gutter/padding**：终端仍可选择可见 cell 网格。Cheers 的应用内复制保证依赖自身 source mapping；绕过应用捕获的终端原生选择由终端控制，不能由这套应用契约保证。

### 12.2 当前复制缺口

基线 composer 使用带 cue 的渲染行与屏幕列切片；`cleanComposerSelection` 去 cue，通用 selection 清洗会 trim/dedent 并为屏幕行插换行。Phase 19 §8.87 已删除此 composer 清洗路径，改为源文映射；通用 transcript 的旧复制策略不在本批改动。八形态集成仍待 UI-03。

### 12.3 布局与选择管线

1. editor 先按实际内容宽度布局原文，产出逻辑行、软折行、grapheme/tab 的 source 映射和已有 viewport。
2. 形态增加 gutter、边框、左右 2 cells padding、状态与 gap，生成 §11.4 的逐行屏幕映射。不同内容行起点可以不同；独立底框没有 source。
3. pointer 的屏幕坐标通过当帧映射转换为 source 边界；装饰区按拖选方向钳到相邻内容边界，不产生字符。不能先减 offset，再用该列切含 gutter 的整行。
4. selection 保存 source 范围；复制直接取原文范围，绝不调用 trim/dedent/cue 正则。软折行不新增换行，逻辑换行只来自 source。
5. 高亮从同一 source 范围重新投影到屏幕 cells；它和复制共享映射，避免一份屏幕 offset、一份字符串清洗的双重算法。

宽字和组合字符按完整 grapheme 边界选择；tab 的显示 cells 回映同一原文 tab。拖选期间 source revision 变化须使旧几何失效或按编辑变更重定位，不能拿旧行切新 source。接通该链路后删除 `cleanComposerSelection`，通用 transcript 的清洗策略不得沿用到 composer 原文复制。

### 12.4 真实宽度与留白表

正常宽度下 `contentWidth = W - leftDecoration - 2 - 2 - rightDecoration`。gutter 算装饰，不算空白。续行保留 gutter 宽度的布局占位以对齐首行；占位没有 source。下表是普通内容行预算，合并底框、scrollbar 和 IME 分支还须按该行实际装饰重算；不得把横线当作 2 cells 空白之一。

| 形态 | 左装饰 cells | 左空白 | 右空白 | 右装饰 cells | W=40 内容宽度 |
|---|---:|---:|---:|---:|---:|
| default / borderless / top-rule | 2（`❯ `） | 2 | 2 | 0 | 34 |
| band | 3（`╰─ `） | 2 | 2 | 0 | 33 |
| padded-rules | 0 | 2 | 2 | 0 | 36 |
| field | 1（端帽） | 2 | 2 | 1（端帽） | 34 |
| rail | 1（左栏） | 2 | 2 | 0 | 35 |
| box | 1（边框） | 2 | 2 | 1（边框） | 34 |

滚动条占既有右侧装饰列；rail 显示右 thumb 时先从右侧预算显式保留 1 cell，其内容宽度随之减 1。IME 尾另按真实可用列收缩右装饰，不越过终端边界。所有算式用 `visibleWidth`/cell 宽，不用字符串长度。

窄窗先隐藏可选状态段、间隙和装饰，再对左右 padding 对称缩减，最后使用无装饰最小输入行；优先保留可操作的 caret/内容。在物理宽度不足时明确降级，不能用 `Math.max(8, remaining)` 虚构空间。宽度为 0 时无内容行；任意行的实际可见宽度不得超过终端宽。低行高预算同理，先减非必要 chrome，保留编辑或可恢复的尺寸不足提示。

### 12.5 落点

| owner / 文件 | 责任 |
|---|---|
| `presentation/tui/composer/`（拟新增域） | 形态契约、布局、逐行 source 投影与选择高亮 |
| [editor.ts](../../packages/ts-shell/src/presentation/tui/editor.ts) | 原文、grapheme/tab、软折行和 caret-follow viewport |
| [view.ts](../../packages/ts-shell/src/presentation/tui/surface/view.ts) / [contract.ts](../../packages/ts-shell/src/presentation/tui/surface/contract.ts) | 真实宽高预算与当帧 geometry 生命周期 |
| [pointer.ts](../../packages/ts-shell/src/cli/interactive/pointer.ts) | 屏幕事件适配为 source selection，删除 cue 清洗 |
| [paint.ts](../../packages/ts-shell/src/presentation/tui/render/paint.ts) | 从最终行内 caret marker 取硬件光标；验证 shape/IME/resize 后位置 |

### 12.6 风险约束

框行与末行合并让全局 `textColumnOffset` 不足；必须逐行映射。布局字符可能与用户原文相同，例如用户输入 `❯`、`╰─` 或空格，因此不能按字符值剥离。regular 固定尾块和 fullscreen 都须按新实际行数重算容量；overlay 接管时清除输入 hit-test，关闭后以新帧恢复。

### 12.7 验证计划

- 精确原文断言：含前导缩进、尾空格、tab、连续空行、`❯`/`╰─` 字符；跨软折行复制等于 source 子串，跨逻辑换行保留原换行。
- 每形态覆盖正/反向拖选、起点在 gutter/padding/框线上、viewport 不从第 0 行开始、IME 额外底框，高亮与复制范围一致。
- 80/40/20/8 及更窄列宽、4–8 行高；长 draft、resize、suggestion/activity/overlay 组合，断言真实尺寸不溢出。
- CJK、组合字符、emoji ZWJ、tab、行尾 caret 与中文 IME；regular/fullscreen 两种模式均验收。

## 13. Phase 19 集成与验证矩阵

### 13.1 文件级步骤

| 步骤 | owner | 交付与依赖 |
|---|---|---|
| P1 | `presentation/themes/`、`presentation/theme/` | `default` 色语义、完整逐值表、六个新 token、四预设及旧主题继承，采用 §10.4 已批准映射 |
| P2 | 语法/状态展示 owner | `mdCodeBlock` fallback 与五状态色生产读者，保持 15 号文档共享 context 阈值 |
| P3 | `presentation/tui/composer/`、editor | §11.4 布局/source 契约，保留 viewport；再按 M0–M3 实现八形态 |
| P4 | surface、pointer | 实际尺寸、逐行几何、source selection、复制与 overlay 生命周期 |
| P5 | config、tuiSettings、settings 外观页 | 八值配置、默认 default、真实 renderer 预览、取消恢复与 Apply 保存 |
| P6 | 相关测试与终端验收 | §12.7 与 §13.2；不以静态快照替代 IME/PTY 验证 |

### 13.2 实施验证矩阵

| 面向 | 必要证据 |
|---|---|
| 主题契约 | 48 旧键逐值核对、新 6 键有消费者、四套 54 键完整；默认色与缺失值不同；vars/legacy/嵌套 reset 正确 |
| 旧主题 | 自定义 light/dark 缺新键时继承自身颜色，不从 dark 污染；旧显式值不被覆盖 |
| 代码 fallback | 无语言/未知/超限/失败均保持 source 与新 fallback 色；none/纯文本无颜色序列 |
| 形态 | 八形态 × regular/fullscreen × empty/multiline/超过 viewport；四挂载点与 box 实际行数正确 |
| 输入与复制 | §12.7 原文保持与 source/highlight 一致；反转 source 映射设计时测试失败 |
| 预览与持久化 | 主题/形态预览不写盘；Esc 恢复，Apply 成功/失败真实；theme revision 使旧块重渲染 |
| 终端输出 | truecolor/256/16/none 各验收；NO_COLOR 禁颜色与非 TTY/纯文本禁所有控制序列分开验证 |

### 13.3 关键风险

默认前景无法预先保证任意终端的对比度；低色彩模式需要结构/字形补充。IME 安全尾适用于 field/rail/box 全部，不能只验证 box。source mapping 是复制正确性的依据，必须先于装饰形态落地。新增行高与 padding 改变软折行，必须校验 regular scrollback 与 overlay 恢复。

### 13.4 裁决状态

本文裁决已完成。§10.4 三项产品映射已经用户确认；默认形态、八形态范围、中性命名、左右 2 cells、原文复制、`mdQuoteText` 同义颜色、终端默认前景与共同 IME/source 契约均已确定。后续输入法、低色终端与小屏验证是实施验收，不是未决范围。

## 14. 补充参考

- Codex 布局：[chat_composer.rs](../../../codex/codex-rs/tui/src/bottom_pane/chat_composer.rs#L1021)、[ui_consts.rs](../../../codex/codex-rs/tui/src/ui_consts.rs#L10)。
- Codex 输入事件：[event_stream.rs](../../../codex/codex-rs/tui/src/tui/event_stream.rs#L250)。它不证明终端原生拖选结果。
- 参考侧框与 IME：[box.ts](../../../oh-my-pi/packages/tui/src/components/composer/box.ts#L47)、[field.ts](../../../oh-my-pi/packages/tui/src/components/composer/field.ts#L37)、[rail.ts](../../../oh-my-pi/packages/tui/src/components/composer/rail.ts#L36)。
- Cheers 复制清洗：[selection.ts](../../packages/ts-shell/src/presentation/tui/transcript/selection.ts#L159) 与 [pointer.ts](../../packages/ts-shell/src/cli/interactive/pointer.ts#L29)。

## 15. 本次审查证据边界

本次以目标源码、参考源码、JSON 集合与指定色对算术审查文案，撤回旧版令牌计数、复制平移、原生选择保证和“输入只截断不滚动”的错误。未运行构建、测试、动态 PTY 或真实输入法；所有产品改变仍是 Phase 19 待实施任务。


## 18. UI-02 源文布局实施

- [composer](../../packages/ts-shell/src/presentation/tui/composer/contract.ts)定义逐行 source/cell/viewport/revision 契约；[布局](../../packages/ts-shell/src/presentation/tui/composer/layout.ts)复用 editor 的同一软折行与 caret-follow viewport。[投影](../../packages/ts-shell/src/presentation/tui/composer/projection.ts)将包含式鼠标端点转换为半开源文区间，复制直接取 source.slice，选区高亮复用同一映射。
- 现有 band 输入接通左右各 2 cells，续行保留 gutter 的等宽占位。窄窗先减少装饰，再对称缩减 padding；宽度 0 不产生输入行。物理一列容不下宽字素时使用一个占位显示 cell，tab 使用一个空格，映射仍指向完整原字素/tab；这是显示退化，不改写源文。八形态、default 切换、Settings 选择及预览尚未在此批实现。
- Pointer 保留现有单击/双击/拖动手势，只替换 composer 提取策略。revision、源文和几何不匹配时取消旧拖选；resize 事件同步使 hit-test 失效，之后才排队重绘。源文变化和 fullscreen overlay 接管也立即停止旧输入命中。
- surface 使用真实宽高，缩减 status/hints/suggestions 以保留输入，候选项按剩余高度维持所选身份和点击映射。regular 即使只剩一行仍交付完整 document 给 painter；物理尺寸为零时 engine 不绘制，恢复后不重新追加旧历史。regular 未启用应用鼠标捕获，意外鼠标报告不作用于文档坐标；原生终端拖选不在精确源文保证内。
- 实际 Node 20.3 CLI 在两种模式通过输入、插入/分片中文粘贴、resize 与历史后草稿定位。fullscreen 的正向拖选和 resize 后反向拖选，OSC 52 解码与隔离原生命令 stdin 都严格等于 45 字节源文。未使用系统真实剪贴板；OSC 52 字节不等同于真实终端已更新剪贴板。Windows 像素、真实 IME、八形态验收继续。
- 两路独立代码 APPROVE、架构 CLEAR；四组反转撤回源文提取、保留空白、resize 失效和零容量 document 保留，均触发行为断言，隔离源码副本逐字节/SHA-256 恢复。完整记录与测试数量见 [Phase 19 §8.87](phase-19-decisions.md)。


## 19. UI-03 八形态实施

八形态已由同一个 [metadata](../../packages/ts-shell/src/presentation/tui/composer/shapes.ts)、[frame](../../packages/ts-shell/src/presentation/tui/composer/frame.ts)、[row](../../packages/ts-shell/src/presentation/tui/composer/row.ts) 和 layout 实现。默认形态为 default，八项全部进入配置 schema 与 Settings。状态挂载、footer/gap、padding、侧滚动条和保守 IME 尾共用 source mapping 与 editor viewport；实际行高包含所有装饰。仅 box/rail 需要只读布局预算，其他形态单次折行。

Settings 聚焦时显示真实 composer，暂存不写配置，Apply 即时发布 shape 叶子；取消恢复已接受形态。失败保留选择并显示准确说明，下一次明确 Apply 才获取新 baseline；无法重读仍保留选择，不泄露读取异常。形态变更前的选择 geometry 立即失效，输入源文保持不变。

两模式实际 CLI 已验证八项预览、暂存/取消/Apply、重启持久化、中文宽字素 caret 与 resize；fullscreen box 源文复制与隔离剪贴板输入精确一致。真实输入法及 Windows 像素未验证，保守尾策略不等于 IME 实测通过。独立评审、反转和本地/远端证据见 [Phase 19 §8.88](phase-19-decisions.md)。精确调色板与最终 54-token 集合继续由 UI-04 落实。


## 20. UI-04 调色板与默认色实施

§10 的 dark 精确映射及六个新增角色已经落地；四预设与 schema 均为 54 项。状态 roles 与未知/失败代码块 fallback 有实际读者，旧 light/custom 按自身已有颜色继承。`default` 是明确的 JSON/变量值，不能与缺省 token 或空串混同；低层使用 SGR 39/49。

字符串样式组合中，显式默认开启使用终端等效的完整组 39;39/49;49，与普通 closing reset 区分。中间 wrapper 和布局保留完整组，最终 paint 才归并。这样保留现有字符串 API 并正确恢复多层前景、背景及 reset；不要在后续样式包装之前新增 ANSI 归一化。

29 文件/442 项、构建和四组反转通过，独立 APPROVE/CLEAR；五场实际 CLI 的四种颜色能力与四套主题切换验证了历史代码块重绘。详情见 [Phase 19 §8.89](phase-19-decisions.md)。主题 Settings 预览/取消/Apply、一切真实输入法及 Windows 像素验收仍继续。

## 21. Settings 主题预览实施

Theme 菜单复用既有主题发现与信任/显式路径策略；初始聚焦已接受主题，聚焦时重绘真实界面，Enter 暂存、Apply 保存。失败保留待选值并恢复已接受外观；取消、换菜单和退出均结束预览。不可用主题显示安全说明，不暂存失败预览。

[selection](../../packages/ts-shell/src/presentation/theme/selection.ts) 区分 accepted intent 与可撤销 preview。成功接受主题递增 generation，即使同名也使旧回调失效；取消恢复内存 colors/name/mode 快照并递增色彩 revision。显式预览不被外观报告覆盖，auto 预览跟随报告，已接受 auto 的取消使用最新报告。预览暂停文件 follower，目标解析与已排队 reload 同时受约束；退出先关闭 overlay，再最终停止监听。

两模式实际 CLI 的预览/暂存零写、取消恢复和 Apply 已验证；定向测试、四组反转及独立 APPROVE/CLEAR 见 [Phase 19 §8.90](phase-19-decisions.md)。真实输入法与 Windows 像素证据仍缺，完整 Phase 19 继续。
