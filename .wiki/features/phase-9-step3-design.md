---
title: "Phase 9 施工记录：第 3 步 —— 声明式扩展面（技能字段与主题令牌）"
category: article
sources: [phase-9-decisions, ref-skill-format-2026-09-25, ref-theme-tokens-2026-09-25]
created: 2026-09-25
tags: [features, phase-9, execution, skills, theme]
summary: "Phase 9 第 3 步施工（扩展路径 1）。两处都是「声明了但没接线」而非「缺功能」：技能 frontmatter 用自写扁平解析器只读 4 个字段，参考实现五家全部用真实 YAML 解析器；主题 39 个令牌中 15 个无读取者，而调色板**早已给出全部 15 个的值**——它们是接线问题。实测发现 5 处硬编码 ANSI 转义绕过了本应使用的令牌（用户消息文字、3 处选中背景、dim）。"
confidence: high
---

# Phase 9 第 3 步施工

> **裁决背景**：扩展只做路径 1（声明式）与路径 2（进程外）。本步是**路径 1 的两项**：
> 技能 frontmatter 字段与主题令牌。两者同性质——**能力已声明，读者缺失**。

## 1. 技能 frontmatter

### 1.1 现状（实测）

`core/skills/skillLoader.ts:347-357` 的 `parseFields` 是**自写的扁平 `key: value` 解析器**，
`readSkill`（`:314-340`）只读 4 个字段：

| 字段 | 行 |
|---|---|
| `name` | `:334` |
| `description` | `:335` |
| `disable-model-invocation` | `:338` |
| `enabled`（我方自有） | `:332` |

`parseFields` 的注释自述「刻意不用 YAML 解析器」——**这个判断需要复核**。

### 1.2 参考实现（子代理实测，五家全查）

**五家全部使用真实 YAML 解析器**，且其中三家额外加了一层「未加引号的冒号」容错：

| 项目 | 解析器 | 容错 |
|---|---|---|
| pi | `yaml` 包（`utils/frontmatter.ts:34`） | 无预处理，解析错误被捕获（`skills.ts:296-302`） |
| opencode | `gray-matter`/`js-yaml`（`config/markdown.ts:5-9`） | `sanitize()` 把含未加引号冒号的行改写成块标量（`:20-33`） |
| source-claudecode | `Bun.YAML`/`yaml`（`utils/frontmatterParser.ts:134-144`） | `quoteProblematicValues()` 给含特殊字符的值加引号（`:84-124`） |
| gemini-cli | `js-yaml`（`skills/skillLoader.ts:45-60`） | 失败后回退到逐行正则解析（`:67-106`） |
| codex | `serde_yaml`（`skills/src/parser.rs:50-61`） | `repair_frontmatter_scalar_fields()` 修复未加引号的冒号与流式字符（`:94-177`） |

**为何需要容错**：`description: Build for AWS: ECS` 在 YAML 里是**语法错误**（第二个冒号）。
作者不会为此加引号，故三家都选择「容忍并修正」而不是「报错拒绝」。

**格式规范**：生态已收敛到 **Agent Skills 规范**（pi `docs/skills.md:7` 与 opencode `docs/skills.mdx:1-48` 都引用）。
该规范定义的字段：`name`、`description`、`license`、`compatibility`、`metadata`、`allowed-tools`、`disable-model-invocation`。

**未知字段**：**五家全部静默忽略**，无一拒绝或告警。opencode 文档明写「Unknown frontmatter fields are ignored.」

### 1.3 决定

| # | 决定 | 依据 |
|---|---|---|
| **S1** | **保留自写解析器，不引入 YAML 依赖** | 五家用 YAML 是因为它们要读**嵌套结构**（`metadata.short-description`）。我方只读**扁平标量**。引入一个 YAML 库（含传递依赖）来读 4 个标量，与我方「依赖需有充分理由」的既有标准不符。**但必须补上真正的缺陷**（见 S2/S3） |
| **S2** | **补「未加引号的冒号」容错**——这是自写解析器的**真实缺陷** | 当前 `parseFields` 用 `line.indexOf(":")` 取**第一个**冒号，故 `description: Build for AWS: ECS` 会得到 `Build for AWS: ECS`——**其实已经正确**。真正的缺陷在别处（见下） |
| **S3** | **未知字段的静默丢弃改为可选诊断** | 五家都静默忽略，故**不告警未知字段**（跟随生态）。但**规范定义的字段被忽略是另一回事**：作者写了 `license`/`compatibility`/`metadata`/`allowed-tools` 会以为生效。**只对规范字段**给出「已读取但未使用」的诊断 |
| **S4** | **新增读取 `allowed-tools`** | 唯一在参考实现里有**真实消费者**的规范字段（source-claudecode `loadSkillsDir.ts:243`）。但需先确认我方是否有对应能力（见 §1.4） |

### 1.4 S4 的前置核实

`allowed-tools` 在参考实现里用于**限定该技能可用的工具**。我方是否有对应的执行面？
需核实 `turn/tools.ts` 的工具门是否按「技能」维度生效。**若无对应面，则 S4 降级为「读取并在诊断里说明未生效」**——
声明一个不生效的字段比不声明更糟。

**核实结论**：我方工具门（`turn/tools.ts:244` `evaluateToolPermissionScope`）按**工具名与权限范围**判定，
**没有技能维度**。故 `allowed-tools` 无执行面。**降级为 S3**：读取并在诊断里说明「本构建未按技能限定工具」。

## 2. 主题令牌

### 2.1 现状（实测，口径已修正）

**39 个声明令牌中，24 个到达访问器，15 个从未到达**：

```
assistantText  borderMuted  dim  selectedBg
syntaxComment  syntaxFunction  syntaxKeyword  syntaxNumber  syntaxString  syntaxVariable
thinkingText  toolErrorBg  toolPendingBg  toolSuccessBg  userMessageText
```

**关键发现：调色板早已给出这 15 个的值。** `dark.json`/`light.json` 都定义了全部 39 个
（如 `dim: "#5f6673"`、`userMessageText: "#ffffff"`、`selectedBg: "#31363f"`、
`toolPendingBg: "#1d2129"`、`syntaxKeyword: "#569cd6"`）。
**故这不是「缺数据」，是「数据无人读」**——与 pre-research 的判定一致，但本轮把它坐实了。

**同时实测到 5 处硬编码 ANSI 转义，绕过了本应使用的令牌**：

| 位置 | 硬编码 | 本应使用 |
|---|---|---|
| `theme.ts:114` `dim()` | `\x1b[2m` | `dim` 令牌（48 处调用会随之生效） |
| `blocks.ts:107` 用户消息文字 | `\x1b[97m` | `userMessageText` |
| `suggestions.ts:31` | `\x1b[48;5;238m` | `selectedBg` |
| `panel.ts:92` | `\x1b[48;5;238m` | `selectedBg` |
| `modal.ts:75` | `\x1b[48;5;238m` | `selectedBg` |

### 2.2 参考实现对照（子代理实测）

| 参考 | 令牌数 | 死令牌 | 我方对应的死令牌在其处是否有消费者 |
|---|---:|---|---|
| pi | 55（48 色 + 7 背景） | **0** | `dim`/`thinkingText`/`borderMuted`/`selectedBg`/`tool*Bg`/全部 `syntax*` **都有真实消费者** |
| opencode | 51 | **0** | 同上（`syntax*` 由语法高亮器消费） |
| gemini-cli | 19 + 15 语义 | **1**（`FocusColor`） | — |
| source-claudecode | 63 | 若干 shimmer | — |

**即：我方这 15 个死令牌，在参考实现里几乎都有真实消费者。** 说明它们不是「多余的设计」，
而是**我方尚未接线**。

### 2.3 决定（逐令牌）

**接线（5 个）**——因为**已存在真实且被硬编码绕过的表面**：

| 令牌 | 接到哪里 | 理由 |
|---|---|---|
| `dim` | `theme.ts:114` 的 `dim()` 方法 | 48 处调用点自动生效；硬编码 `\x1b[2m` 是绕过 |
| `userMessageText` | `blocks.ts:107` | 硬编码 `\x1b[97m` 是绕过；且自定义主题下白色可能失去对比 |
| `selectedBg` | `suggestions.ts:31`、`panel.ts:92`、`modal.ts:75` | 三处硬编码同一个颜色，是**重复的第三份意见** |
| `thinkingText` | `blocks.ts` 的 `renderThinking` | 思考块当前用 `dim()`；它有自己的语义，参考实现也单列 |
| `borderMuted` | 面板/模态的次级分隔线 | 我方所有边框都用 `border`，缺少层级 |

**删除（10 个）**——**没有消费者，且短期内不会有**：

| 令牌 | 删除理由 |
|---|---|
| `assistantText` | 与 `text` **值相同**（`#d4d4d4`），语义重复。参考实现用 `text` 即可 |
| `toolPendingBg`/`toolSuccessBg`/`toolErrorBg` | 我方工具卡是**描边卡片**（`╭─ tool ─╮`），不是填充背景；状态用字形（`✔`/`✖`）表示。**结构不同，不是缺接线** |
| `syntaxKeyword`/`syntaxFunction`/`syntaxVariable`/`syntaxString`/`syntaxNumber`/`syntaxComment` | 我方**无语法高亮器**。bash 围栏由 `commandHighlight.ts` 处理，用的是 `command*` 系列（7 个，全部活）。这 6 个是「等语法高亮立项」的占位 |

**`phase-4 §15.3` 的「不删死令牌」裁决经本轮实测推翻其理由。** 该裁决的原文理由是
「删令牌会让用户已写的主题名失效」。实测：

- `Theme.apply`（`theme.ts:74-78`）把文件里的键**原样存入 map**，`fg`/`bg` 按名查表（`:85-93`）；
- `loadTheme`（`presentation/themes/index.ts`）**不校验未知键**；
- 「无未知令牌」那条测试**只作用于我方内置的两个调色板**（`theme.test.ts:28-36`）；
- 实测：一个含 `syntaxKeyword`/`toolSuccessBg` 的用户主题**照常加载并渲染**。

即**删除令牌不会让任何用户主题失效**——多出来的键只是被忽略。故原理由不成立，
`syntax*` 6 个（无语法高亮器、无消费者）一并删除。

**最终决定**：**删除全部 10 个无消费者的令牌**，并**新增 3 个**（见 §2.4）。

**结果：39 → 32 个令牌（删 10、增 3），5 个接线，0 个死令牌。**

### 2.4 施工中发现的额外缺陷（同类：硬编码绕过主题）

清点「硬编码 ANSI 颜色」时又找到 3 处，与 §2.1 的 5 处同性质：

| 位置 | 硬编码 | 处置 |
|---|---|---|
| `chrome/band.ts:34` | `\x1b[48;5;236m` 状态带背景 | **新增 `statusBandBg` 令牌**并接线 |
| `transcript/viewport.ts:52` | `\x1b[90m│` 滚动条轨道 | **新增 `scrollbarTrack` 令牌**并接线 |
| `transcript/viewport.ts:52` | `\x1b[37m█` 滚动条滑块 | **新增 `scrollbarThumb` 令牌**并接线 |

**命名依据**：`scrollbarTrack`/`scrollbarThumb` 是参考实现里**已有**的令牌名（可选令牌），
故沿用该命名而非自造。`statusBandBg` 按我方既有 `<surface>Bg` 形状命名。

**保留不动的两处**（非缺陷）：`theme.ts:150` 与 `:164` 是 `colorToAnsi` 的**未知颜色名回退**
（`\x1b[37m` 白 / `\x1b[40m` 黑），属于函数契约的一部分，不是绕过主题。

**滚动条测试改判**：`viewport.test.ts` 原用例断言**硬编码转义**（`\x1b[37m█`）。
该断言的对象已不存在，且其**意图**（默认主题下可见）原本就写错了——钉住转义会让
「滑块与轨道同色」的主题也通过。已改为**通过主题断言两色不同**，并新增一条
「跟随主题变化」的用例。

**一处自身修正**：滚动条默认值最初写成**默认参数的对象字面量**，
而默认参数**每次调用都会构造**——违反本仓「不无谓分配」的标准。
已改为函数体内按需构造，同时保证颜色在**主题应用之后**才读取（模块导入期求值会冻住主题）。

## 3. 文件

| 文件 | 改动 |
|---|---|
| `core/skills/skillLoader.ts` | 读 `allowed-tools`/`license`/`compatibility`/`metadata`（仅记录）；`inspectSkill` 补「规范字段已读取但未生效」诊断 |
| `presentation/theme/theme.ts` | `dim()` 走 `dim` 令牌；删除 4 个令牌 |
| `presentation/tui/transcript/blocks.ts` | `userMessageText`、`thinkingText` 接线 |
| `presentation/tui/chrome/suggestions.ts`、`panel.ts`、`modal.ts` | `selectedBg` 接线（消掉 3 处硬编码） |
| `presentation/themes/dark.json`、`light.json` | 删 4 个令牌的值 |
| 测试 | 技能字段诊断；令牌「声明 == 有读者」不变量 |

## 3.5 实现结果（2026-09-25）

### 技能 frontmatter

| 改动 | 位置 |
|---|---|
| `parseFields` 支持块标量（`\|-` / `>`）与去引号 | `skillLoader.ts:363-400` |
| 新增 `unquote`（保留引号内的冒号） | `:402-412` |
| `Skill.unhonouredFields` + `UNHONOURED_SPEC_FIELDS` | `:53-77` |
| `inspectSkill` 报告「记录了但不生效」的规范字段 | `:517-524` |

**实测到的真实缺陷**（不是「未知字段被忽略」，那五家都一样）：
`description: |-` 加缩进正文时，旧解析器把**字面量 `"|-"`** 当作描述。
**下游不会报错**——只是描述文本错了，所以一直没被发现。

**实测（修复后）**：`description: |-` + 两行 → `"Build for AWS.\nHandles ECS."`；
`>` → 单行折叠；引号内的冒号保留。

### 主题令牌

| 项 | 结果 |
|---|---|
| 删除 | **10 个**无消费者令牌（`assistantText`、3 个 `tool*Bg`、6 个 `syntax*`） |
| 新增 | **3 个**（`statusBandBg`、`scrollbarTrack`、`scrollbarThumb`）——全部来自被硬编码绕过的表面 |
| 接线 | **8 处**：`dim()`、`userMessageText`、`thinkingText`、`selectedBg`×3、`borderMuted`、状态带、滚动条×2 |
| 令牌总数 | **39 → 32**，两套调色板同步，**0 个无读者令牌** |

**新增的不变量测试**（`theme.test.ts`）：「每个声明令牌都在生产代码里被具名」。
它**扫源码**并**先剥掉联合声明本身**——否则任何令牌仅凭「被声明」就会通过，
而那正是它要检查的事。**这条测试让本步的清理成为可执行规则，而非一次性动作。**

**复核修正（2026-09-25）：这条测试曾有一个盲区，已补。** 它的令牌表取自
`dark.json` 的键，**不是**取自 `ThemeColorToken` 联合。于是「只加进联合、没加进调色板」
的令牌对它**完全不可见**——实测：往联合里加一个无读取点的新令牌，**两个测试都通过**。
（常见路径「联合 + 调色板都加了但忘了接线」它**能**抓到，因为那时已进 `ALL_TOKENS`；
盲区只在两处都没加的那一刻。）令牌表已移到 `theme.ts` 并声明为
`satisfies readonly ThemeColorToken[]`，再用一个 `never` 赋值堵住反方向：
**联合里加了、表里没加**现在直接编译失败。放在 `theme.ts` 而非测试文件是关键——
`tsconfig.build.json` **排除测试**，写在测试里的编译期断言**根本不会跑**。

**实机（构建产物）**：
```
dim()        === fg("dim")          -> true     # 令牌确实在用
userMessageText / thinkingText / borderMuted / selectedBg  -> 均解析为主题色

换成自定义主题后：
  dim()        -> 红      selectedBg   -> 蓝
  thinkingText -> 黄      borderMuted  -> 品红
```
即**这四处现在真的随主题变化**——修复前它们不受主题影响。

### 反向验证

| 移除 | 失败数 |
|---|---|
| 块标量支持（`parseFields`） | 3 |
| `dim()` 接回硬编码 | 含在上面的 3 内 |
| 令牌不变量测试本身 | 修复前它会报 15 个（实测为 15 → 现为 0） |

### 与设计的偏离

一处：设计初稿按 `phase-4 §15.3` **保留** `syntax*` 6 个，实测**推翻该裁决的理由**
（删令牌不影响用户主题，见 §2.3），故一并删除。**这是本轮第二次推翻历史裁决的理由**——
与 Phase 8 的教训同型：**结论可以留，理由必须验**。

## 4. 验证方式

| 项 | 验证 |
|---|---|
| 令牌不变量 | 新增测试：`ThemeColorToken` 的每个成员都在生产代码里到达访问器（**这条测试会让本步的删除变成可执行的规则**，而非一次性清理） |
| 接线生效 | 反向验证：把 `dim()` 改回硬编码 → 测试失败 |
| 技能诊断 | 反向验证：去掉诊断 → 测试失败 |
| 实机 | 真实终端渲染用户消息与选择列表，确认颜色来自主题（改主题应改变它们） |

## 5. 本步不做

- 不引入 YAML 解析器（§1.3 S1）。
- 不告警未知 frontmatter 字段（五家都静默忽略，跟随生态）。
- 不实现 `allowed-tools` 的执行面（我方无技能维度的工具门；声明不生效比不声明更糟）。
- 不删 `syntax*` 6 个（尊重 `phase-4 §15.3` 既有裁决）。
- 不实现语法高亮（那是独立能力，需要真正的词法分析器）。
