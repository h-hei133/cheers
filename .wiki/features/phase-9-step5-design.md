---
title: "Phase 9 施工记录：第 5 步 —— 图片输入"
category: article
sources: [phase-9-decisions, ref-clipboard-2026-09-25, ref-image-wire-2026-09-25]
created: 2026-09-25
tags: [features, phase-9, execution, multimodal]
summary: "Phase 9 第 5 步施工（跨层改动）。裁决：加宽 `content` + `messageToText`。前置复核确认三处耦合点：`sessionMessage.ts:13`、`sessionEventCodec.ts:165` 的运行时守卫、`turn/prompt.ts:21`。**最关键风险**：守卫是 `typeof content === \"string\"`，而 `decodeTranscriptLineSafe` 在守卫失败时返回 `undefined` 且被跳过——加宽类型而不放宽守卫会让**带图片的消息重载后静默消失**，故两者必须同批改。剪贴板链照参考实现（Wayland/X11/WSL 三路 + 原生兜底），本机为 WSL 且 `powershell.exe` 可用。"
confidence: high
---

# Phase 9 第 5 步施工

## 1. 前置复核（三处耦合点）

| # | 位置 | 现状 | 为何是耦合点 |
|---|---|---|---|
| 1 | `session/schema/sessionMessage.ts:13` | `content: string` | 要加宽的类型 |
| 2 | `session/sessionEventCodec.ts:165` | `typeof record.content === "string"` | **运行时守卫**；`decodeTranscriptLineSafe`（`:174-184`）在守卫失败时**返回 `undefined`**，`readTranscriptEvents` 跳过该行 |
| 3 | `turn/prompt.ts:21` | `content?: string \| null` | 送往 provider 的形状 |

**最关键风险**：**只加宽 1 而不放宽 2，带图片的消息会在重新加载时静默消失**——类型层会编译报错，而守卫失败**不报错、只是丢数据**。故 1 与 2 **必须同批改**，并加一条「带图片的消息经编解码往返后仍在」的测试钉住。

## 2. 我方已有的一半（复核修正）

`model-adapters/multimodal.ts` **已存在**（72 行，**零 import**——是叶子模块），已定义：

| 导出 | 状态 |
|---|---|
| `ImageContent` / `TextContent` / `MultimodalContentBlock` | 已定义，**零消费者** |
| `toAnthropicImageBlock`（`:50`）/ `toOpenAIImageUrlBlock`（`:61`） | 已定义，**零消费者**，返回 `Record<string, unknown>` |
| `isImageFilePath` / `getImageMimeType` / `formatNonVisionFallback` | **已被 `core/tools/registry.ts:4` 消费**（read 工具遇到图片时说明不返回图片） |

即：**格式转换的逻辑已有，但签名与目标类型都不兼容**（复核实测）：
- 返回 `Record<string, unknown>`，而 `anthropicMessages.ts:108-112` 的 `ContentBlock` 是**严格判别联合**（无 `image` 分支）；
- `turn/step.ts` 的 OpenAI 分支要求 `content` 是**数组**，而转换器产出的是**单个块**。

**故工作量是「扩联合类型 + 适配签名」，不是「接上即可」。**

## 3. 剪贴板（参考实现机制，本机可用）

参考的链路（`clipboard-image.ts`，实测）：

| 路径 | 命令 | 说明 |
|---|---|---|
| Wayland | `wl-paste --list-types` → 选 MIME → `wl-paste --type <mime> --no-newline` | 首选项 |
| X11 | `xclip -selection clipboard -t TARGETS -o` → 逐个试 MIME | 兜底 |
| **WSL** | `wslpath -w <tmp>` + `powershell.exe` 读 Windows 剪贴板存 PNG | **因为 Linux 剪贴板拿不到 `Win+Shift+S`** |
| 原生 | 原生绑定 | 我方无此依赖，跳过 |

**关键语义**（参考注释明确）：「`undefined` 表示后端失败；`null` 表示后端无图片。
空的 Wayland 剪贴板**不得**落到陈旧的 X11 内容上。」——这个区分必须保留，
否则用户会拿到一张他早已覆盖的图。

**本机实测**：`powershell.exe` 可用（`/mnt/c/...`），WSL 判定为真，`DISPLAY=:0` 与
`WAYLAND_DISPLAY=wayland-0` 都设了——即**三条路径本机都可能命中**，WSL 那条是主路径。

**限制**（照参考）：支持 `png`/`jpeg`/`webp`/`gif` 四种；
**首版不做格式转换**（转换需原生解码器处理攻击者可控字节），**不支持的格式明确拒绝**。

## 4. 决定

| # | 决定 | 依据 |
|---|---|---|
| **I1** | `content` 加宽为 `string \| readonly MultimodalContentBlock[]` | 裁决 |
| **I2** | **`messageToText(content)` 放在 `model-adapters/multimodal.ts`** | 该模块**零 import**，是叶子；放这里使 `sessionMessage.ts` 不必依赖任何上层。纯图片返回 `""`；面向人的读者传 `placeholderForImages: true` |
| **I3** | **codec 守卫与类型同批改** | 见 §1 |
| **I4** | 两个转换器**改签名**为具名类型，并给 `anthropicMessages.ts` 的联合**加 `image` 分支** | 不加宽就传数组会生成 `{type:"text", text:[object Object]}`，被 provider 以 400 拒绝 |
| **I5** | 视觉能力**声明在目录上**（`CatalogModel.vision?`），不按模型名猜 | 照 `promptCache` 先例；`check:config-consumers` 只管 `RuntimeConfig`/`TuiPreferences`，目录字段不受约束 |
| **I6** | 粘贴通道**并行于** `PasteStore` | `held` 是 `Map<number, string>`、`expand()` 返回 `string`，二进制无法通过。占位符可复用，存储必须并行 |
| **I7** | 首版**不做格式转换**，只接受四种已知类型 | 保持「零新依赖」口径为真；转换需原生解码器处理不可信字节 |
| **I8** | `microCompact` 的 `typeof === "string"` 守卫**保留** | 实测它**跳过而非崩溃**；工具结果本就是字符串。但需确认跳过不会让带图片的消息绕过压缩而膨胀——记为已知边界 |

## 5. 文件

| 文件 | 改动 |
|---|---|
| `model-adapters/multimodal.ts` | 加 `messageToText`；两个转换器改具名返回类型 |
| `session/schema/sessionMessage.ts` | `content` 加宽 |
| `session/sessionEventCodec.ts` | 守卫放宽（**与上一条同批**） |
| `turn/prompt.ts` | `ChatMessage.content` 加宽 |
| `provider/endpoints/anthropicMessages.ts` | 联合加 `image` 分支；按块产出 |
| `turn/step.ts` | OpenAI 分支按块产出 |
| `core/models/catalog.ts` | `CatalogModel.vision?` |
| `presentation/tui/clipboardImage.ts`（新） | 三路剪贴板读取 |
| `presentation/tui/pastes.ts` | 并行图片存储 |
| `cli/interactive/keymap.ts` | 提交时收集图片 |
| 12 个文本读者 | 走 `messageToText` |
| 测试 | 往返、守卫、转换器、剪贴板降级、视觉回退 |

## 6. 验证方式

| 项 | 验证 |
|---|---|
| **往返不丢数据** | 带图片的消息 encode → decode 后**仍在**（这是本步最关键的一条） |
| 旧数据兼容 | 只有 `string` 的老 transcript **照常解析** |
| wire 形状 | 两个端点各自产出正确块（Anthropic `source.base64` / OpenAI `data:` URL） |
| 剪贴板降级 | 无图片 → `null`；后端失败 → `undefined`；**空 Wayland 不落到 X11** |
| 文本读者 | `messageToText` 后既有行为不变（回归） |
| 实机 | 本机 WSL 的 `powershell.exe` 路径可测 |

## 6.5 实现结果（2026-09-25）

### 迁移面：编译器枚举出 20 个文件

加宽 `content` 后 `tsc` **逐个报出**每个读者——这比我事先估的 19 个更可靠。按处置分类：

| 类别 | 数量 | 处置 |
|---|---:|---|
| **真改**（契约/wire） | 7 | `sessionMessage`、`sessionEventCodec`（类型+守卫）、`turn/prompt`、`turn/step`、`anthropicMessages`、`microCompact`（接口）、`requestShape`（vision） |
| **需 `messageToText`** | 13 | `history`、`interactiveMode`、`picker/rewind`、`picker/session`、`exportCommandRuntime`、`contextAnalysis`、`sessionContinuitySnapshot`、`sessionReentrySurface`、`replay/builder`、`sessionContinuityModule`、`turn/projection`、`turn/synthetic`、`core/agent/tools`、`session/compaction`、`cliSessionRuntimeFactory`（压缩专用转换） |
| **透传/不受影响** | — | `microCompact` 的运行时守卫（实测**跳过而非崩溃**） |

### 关键实现决定

| # | 决定 | 理由 |
|---|---|---|
| 1 | **`messageToText` 放在 `model-adapters/multimodal.ts`** | 该模块**零 import**（实测），是叶子；放这里使 `sessionMessage.ts` 不必依赖上层 |
| 2 | **纯图片返回 `""`**；面向人的读者传 `placeholderForImages` | 13 个文本读者已把空串当「无话可说」，占位符会让会话标题里出现一行「图片」；而**显示**消息的读者必须让图有痕迹 |
| 3 | **`vision` 缺省为 `false`**（三处一致） | 未声明 = 未知 = **安全侧**。发图给读不了图的模型会**整个请求失败**并丢掉用户同时写的文字；描述只丢模型本就用不上的部分 |
| 4 | **压缩用独立转换** `toCompactionMessages` | 摘要模型是来**概括对话**的，不是来看图的；给它图会花 token 答一个没人问的问题 |
| 5 | **`ChatMessageLike` 接口加宽而非各调用点转型** | 该压缩器**运行时已守卫**字符串，加宽接口让它**原样带过**数组 |

### 剪贴板：本机实测三路可用

`presentation/tui/clipboardImage.ts`（照参考机制）。**关键语义**：`null`（问了，没有）与 `undefined`（问不了）**必须区分**——
前者**终止**搜索，否则会落到陈旧的上一个剪贴板内容；后者才继续下一路。

**本机（WSL）实测**：
```
1) 无图时        → 664ms 返回 no image（不抛错、不挂起）
2) 用 PowerShell 把一张 PNG 放进 Windows 剪贴板
3) 再读          → image/png 172 bytes
4) 签名校验      → 89504e470d0a1a0a（有效 PNG）
```
即 **WSL 那条路径真的能拿到 Windows 剪贴板的图**——这正是参考实现注释里说「Linux 剪贴板拿不到 `Win+Shift+S`」的那个场景。

### 自身修掉的问题

1. **两处 `vision` 缺省不一致**：端点写 `vision === false`（未声明视为**可读图**），而 `DEFAULT_REQUEST_SHAPE` 写 `false`。**测试抓到**（未声明模型应走描述路径），已统一为 `vision === true` 才发图。
2. **`step.ts` 的 Anthropic 分支漏传 `vision`**：两个分支只有一个传了。已补。
3. **`execFile` 默认按 UTF-8 解码**：图片字节会被替换字符破坏且**不报错**。已显式要 `Buffer`。
4. **项目规则 `ts-promise-with-resolvers` 触发**：已改用 `Promise.withResolvers()`。

### 测试与验证

| 项 | 结果 |
|---|---|
| 往返（**最关键**） | 带图片的消息经 `encode → decodeTranscriptLineSafe` 后**仍在**；3 项在**移除守卫改动时失败** |
| 旧数据 | 只有 `string` 的老 transcript 照常解析 |
| 非法块 | 未知块类型 / 缺 `mimeType` 的图片块 → **拒绝**而非当作消息读入 |
| 文件级 | 经 `readTranscriptEvents` 读取三行（含图片行）**一行不少** |
| wire 形状 | Anthropic `source.base64` / OpenAI `data:` URL；不读图的模型得到描述 |
| 目录 | `claude-sonnet-4-5`/`gpt-5.3`/`o4-mini` = `vision=true`；**`gpt-5.3-codex` 保持未声明** |
| 剪贴板 | 本机 WSL 路径实测拿到有效 PNG |

### 一处测试自身的修正

初版往返测试用了 `decodeTranscriptLine`——**实测它是无校验的强制转换**（`JSON.parse(...) as TranscriptEvent`），
故 7 项里只有 1 项在移除守卫时失败。改为走**校验过的** `decodeTranscriptLineSafe` 后，
**3 项**在移除守卫时失败。即：**测试必须走真正做判定的那条路**，否则它测的是转换而非守卫。

### 补：粘贴通道（复核时发现的缺口）

复核时发现**剪贴板读取器、`PasteStore` 的图片通道、键盘绑定全部就位，但没有任何调用方**——
从编辑器一侧看，这与「没有这个能力」完全等价。缺的是最后一跳：图片到不了模型。
补齐如下。

**按键**：`alt+v` → `app.editor.image`。与终端自带的粘贴分开，因为二者是不同的东西：
终端递送的是**文本**，而图片**从来不以文本到达**。已加进按键指南（`chrome/keys.ts`），
且 `keymap.test.ts` 会断言「指南列出的键 = 实际绑定的键」——绑定没人找得到就等于没有。

**链路**（8 跳，`PromptAttachments` 是 ctor 之外唯一的载体）：

```
keymap submit ──images──> onSubmit ──> run ──> routeInteractiveCommand
  ──> buildCliCommandExecution ──> runInteractivePromptExecution
  ──> executeResolvedPromptTurn ──> sessionRuntime.executePrompt
  ──> runPrompt ──> cliSessionRuntimeFactory ──> streamCliRuntimePrompt
  ──> cliRuntimeInvocation ──> turn/session:opening
```

**开消息**：`turn/session.ts` 在**有图时**才把 `content` 建成块数组
`[{type:"text", text:环境行+提示}, ...images]`，无图时保持原来的字符串。
即下游读到的形状**只在真有图时才变**，没有图的历史路径一个字节都没动。

**自身修掉的问题**：`expand()` 原本把**图片占位符原样留下**，于是消息里会带上
字面量 `[#2 image image/png 12KB]`——**形似内容而不是内容**。现在 `expand()` 遇到
「占位符指向已持有的图片」时展开为**空串**（图片不是文本，另行随消息走）。
这一条是**新写的测试抓到的**：我最初把断言写成了旧行为，而旧行为是错的。

**模块归属**：attach 逻辑放在 `inputPreferences.ts`（本就在管编辑器输入动作），
不是放在 `interactiveMode.ts`。后者加上这个方法会到 **21 个函数**、越过 20 的职责上限
（`analyze:module-facades` 抓到，monoliths 5 → 6）；移出后回到 5。

**测试**：`pastes.test.ts` 新增 5 项（占位符内容、按草稿取图、无附件时为空、
文本与图片两条通道互不干扰、`clear()` 一并清掉图片）。`keymap.test.ts` 43 项全绿。

## 7. 本步不做

- 不做图片缩放/格式转换（需原生解码器；首版拒绝不支持的格式）。
- 不做 TUI 内联图片渲染（终端无图形协议，第 2 步已确认）。
- 不做视频/PDF。
