---
title: "Phase 9 施工记录：第 4 步 —— HTML 会话导出"
category: article
sources: [phase-9-decisions, ref-export-secrets-2026-09-25, ref-export-client-2026-09-25]
created: 2026-09-25
tags: [features, phase-9, execution, export]
summary: "Phase 9 第 4 步施工。用户裁决首版做「等价交互」（侧栏树/过滤）。两个只读子代理分别核脱敏与客户端架构。关键发现：①参考实现的导出**不做任何脱敏**（会话数据直连 base64），而我方 `redactReportText` 的 10 条规则里 5 条是**报告专用**（删 oldText/newText/隐藏推理/<html>），照搬会掏空导出内容——故按「只取秘密类规则」新建导出专用脱敏；②`TranscriptEvent` **不带 parentId**，树在 `state.json`，故导出必须**联接两处**；③参考用**一个解析器 + 两个渲染器**（终端 ANSI / HTML），而我方 markdown 解析与终端渲染**焊在一起**——故先抽出块分类器再写 HTML 渲染器，避免第二份解析逻辑。"
confidence: high
---

# Phase 9 第 4 步施工

> **裁决**：HTML 导出首版做**等价交互**（侧栏树 + 过滤 + 客户端脚本上千行）。
> **前置**：第 1 步的写入策略（`writeTarget`）与脱敏（S4）已就位；本步把 S4 具体化。

## 1. 三项前置发现

### 1.1 脱敏：不能照搬报告用的规则

`core/security/redaction.ts` 只导出 `redactReportText`，其内部 `applyRedactionRules`（`:95-107`）
有 **10 条规则**，子代理分类与主代理复核一致——**5 条秘密类 / 5 条报告专用**：

| 类别 | 规则 | 导出是否适用 |
|---|---|---|
| **秘密类**（`:96-100`） | 真实 provider home 路径、`Bearer <token>`、`api_key/token/secret/password=…`、`sk-*`/`ghp_*`/`github_pat_*`、`provider.env` | **适用** |
| **报告专用**（`:101-105`） | `oldText`、`newText`、`raw provider output`、`hidden reasoning`、`<html>…</html>` | **不适用** |

**为何报告专用规则不适用**：它们**删除内容**。导出的用途恰恰是**看 diff、看代码、看推理**；
`<html>` 规则会毁掉任何 web 相关任务的产物。此外 `redactReportText` 还会
**折叠空白**（`:75-77`）与**截断长度**（`:83-87`）——两者都会毁掉代码块与 diff。

**参考实现对照**：pi 的导出**不做任何脱敏**（`index.ts:160` 直接 `JSON.stringify` → base64，
无 scrub）；source-claudecode、gemini-cli 同样无脱敏；**只有 opencode 有 `--sanitize`**，
但它是**结构性剥离**（把几乎所有文本替换为占位符），不是秘密扫描。

**决定**：新建**导出专用**脱敏，只取秘密类 5 条，不折叠空白、不截断、不删内容。
实现方式：把规则链拆成两个函数并导出**秘密子集**（而非复制正则）。

### 1.2 树：`TranscriptEvent` 不带 parentId，必须联接两处

| 数据 | 位置 | 内容 |
|---|---|---|
| 事件日志 | `transcript.jsonl` | `message`/`lifecycle`/`query-event`/`compaction`/`branch_summary`，**无 `parentId`** |
| 树结构 | `state.json` 的 `SessionThreadSnapshot` | `id`/`parentId`/`order`/`role`/`kind`，**无消息内容** |

当前 `/export`（`exportCommandRuntime.ts:98-105`）**只读 transcript**，故**拿不到树**。
**决定**：导出同时读两处并**联接**（`readSessionThreadSnapshot` + `readSessionTree`，两者均已有生产消费者）。
**实测已验证**该读取路径可行（3 entries → 1 root + 1 child）。

### 1.3 Markdown：参考是「一个解析器 + 两个渲染器」，我方是焊死的

**参考**（`packages/tui/src/components/markdown.ts`，1,015 行）用 `marked` 解析成 token，
再由**两套渲染器**分别产出终端 ANSI 与 HTML。**一个解析器，两种输出。**

**我方**（`presentation/tui/transcript/markdown.ts`，198 行）**解析与 ANSI 渲染写在同一个循环里**
（`renderMarkdown` 内既判块类型又直接产出带色行），**没有中间表示**。

**若直接为导出另写一份 markdown 渲染，就会有两套块判定逻辑**——正是本仓反对的
「同一事实两处描述」，且同一会话在终端与导出页会长得不一样。

**决定（重构而非新增）**：**抽出块分类器** `scanBlocks(text)` 返回块的判别联合，
`markdown.ts` 改为「分类 → ANSI 渲染」，导出用同一分类器产出 HTML。
**这既是参考实现的架构，也消除重复。** 由既有 23 项 markdown 测试保证**这 23 项覆盖到的行为**不改变（见 §6.5「关于等价性的边界」）。

## 2. 文件

| 文件 | 改动 |
|---|---|
| `presentation/tui/transcript/markdown.ts` | 抽出块分类器；`renderMarkdown` 保持签名与输出不变 |
| `presentation/tui/transcript/markdownScan.ts`（新） | `scanBlocks` + 块类型；两处共用 |
| `core/security/redaction.ts` | 规则链拆为秘密类/内容类；导出 `redactExportText`（秘密类，无折叠无截断） |
| `session/export/collect.ts`（新） | 读 transcript + state，联接出 `{tree, entries, leafId, header}` |
| `session/export/html.ts`（新） | 载荷 → 单文件 HTML（base64 内嵌 + 内联 CSS/JS） |
| `session/export/template.ts`（新） | HTML 骨架 + CSS + 客户端脚本（TS 字符串常量，避免资源路径解析） |
| `session/export/htmlRender.ts`（新） | 用共用分类器把 markdown 渲染为语义 HTML |
| `core/commands/exportCommandRuntime.ts` | 加 `html` 分支；**未知格式报错**（S4） |
| 测试 | 分类器等价性、脱敏边界、载荷联接、HTML 转义、未知格式 |

**命名理由**：`session/export/` 而非顶层 `export/`——导出的输入是 session 数据，归属该域。
模块名 `collect`/`html`/`template`/`htmlRender` 均为短职责名，不堆砌名词。

## 3. 载荷契约

```ts
interface ExportPayload {
  header: { sessionId: string; exportedAt: string; workspace: string };
  tree: Array<{ id: string; parentId?: string; role?: string; kind: string; preview: string }>;
  entries: Array<{
    id: string; role: string; content: string;
    toolCalls?: Array<{ id: string; name: string; arguments: string }>;
    toolCallId?: string; origin?: { provider?: string; model: string };
    timestamp: string;
  }>;
  leafId: string | null;
}
```
- `tree` 由服务端算好（`readSessionTree` 已存在），客户端**不重建图**——省掉参考实现里 219 行的树构建。
- `preview` 服务端预计算，客户端不解析正文只为算侧栏文字。

## 4. 客户端（首版「等价交互」）

**做**：树构建（消费服务端树）/ 展平与连接符 / 过滤（文本 + 「只看用户」）/ 条目渲染 /
工具卡片（bash/read/write/edit 与默认）/ 长输出折叠 / 统计头部 / 深链（`?leafId=&targetId=`）。

**不做**（各附理由）：
- **预渲染 ANSI→HTML 管线**（参考的 `renderedTools`）：参考为把 TUI 组件输出转成 HTML 而引入，
  我方直接渲染结构化卡片，不需要模拟终端。
- **iframe/gist 注入钩子**（参考的 `pi-url-params`）：那是为分享托管服务准备的，自包含文件不需要。
- **浏览器内重导 JSONL**：与 HTML 导出无关。
- **5 档过滤模式**：我方只需「全部 / 只看用户」+ 文本搜索。

## 5. 验证方式

| 项 | 验证 |
|---|---|
| 分类器重构不改变终端输出 | **既有 23 项 markdown 测试必须全绿**（证明这 23 项覆盖的行为未退化；**不等于** CommonMark 意义上的完备等价，见 §6.5） |
| 脱敏只去秘密 | 导出后 `sk-*`/`Bearer` 被替换，而 `oldText`/`<html>`/代码块**原样保留** |
| 未知格式报错 | `/export html out.html` 走 html；`/export xyz` **报错**而非静默 markdown |
| 写入围栏 | 沿用第 1 步：工作区外需 `--outside` |
| HTML 转义 | 正文含 `</script>` 与 `javascript:` 链接的用例 |
| 实机 | 构建产物导出真实会话，用浏览器打开确认树与对话渲染 |

## 5.5 实现结果（2026-09-25）

### 文件

| 文件 | 行数 | 作用 |
|---|---:|---|
| `presentation/tui/transcript/markdownScan.ts`（新） | 162 | `scanBlocks` 块分类器（**终端与导出共用**） |
| `presentation/tui/transcript/markdown.ts`（改） | 198→178 | 改为「分类 → ANSI 渲染」，输出不变 |
| `core/security/redaction.ts`（改） | — | 规则链拆为秘密类/内容类；新增 `redactExportText` |
| `session/export/collect.ts`（新） | 239 | 读 transcript + state，联接出载荷；导出脱敏在此 |
| `session/export/htmlRender.ts`（新） | 142 | markdown → 语义 HTML（同一分类器） |
| `session/export/template.ts`（新） | 347 | 页面骨架 + CSS + 客户端脚本 |
| `session/export/html.ts`（新） | 34 | 载荷 → 单文件 HTML |
| `core/commands/exportCommandRuntime.ts`（改） | — | `html` 分支；**未知格式报错** |

### 实机（浏览器打开导出页）

用 headless Chromium 打开真实导出的页面，逐项验证：

| 项 | 结果 |
|---|---|
| 侧栏树 | **301 行**（300 条消息 + 根），层级缩进正确 |
| 对话区 | **300 个 turn** 渲染，标题/列表/代码块/表格/引用/链接全部正确 |
| 首次渲染 | **209ms**（300 条消息） |
| 水平溢出 | **无** |
| 过滤 | 输入 `message 29` → **11 行**；真实退格清空 → **恢复 301** |
| 「只看我的」 | 300 条中 **150 条**（user/assistant 各半） |
| 深链 | 点击树行 → `#turn_…` 写入 URL；**重新加载后仍定位到该分支**（4 turns） |
| 高亮 | 选中行有 `aria-current`；目标 turn 短暂高亮 |
| 侧栏开关 | 切到 `no-sidebar` 生效 |
| 浅色主题 | `prefers-color-scheme` 生效（实测 accent 变为浅色值） |

**安全（在真实 DOM 上验证）**：
```
注入的 script/img 节点: 0
javascript: 链接: 0
https 链接保留: https://example.com/health
markup 作为文本显示: true
凭据: Bearer sk-… → [redacted]
```
即：正文里的 `<img onerror=…>` 与 `[bad](javascript:…)` **既不执行也不成链**，而 `<html>`/diff/代码块**原样保留**（这正是与报告脱敏的区别）。

### 施工中修掉的 3 个自身缺陷

1. **链接正则吃掉右括号**：`[bad](javascript:alert(2))` 剥离后残留 `bad)`。
   改为支持 URL 内配对括号的模式，并**先抽链接再转义**——否则 URL 里的 `&` 会被转义两次（`&amp;`）。
2. **静态正文与载荷重复**：初稿把会话同时写进 markup 与 base64，**每个消息在文件里出现两次**。
   静态副本对有脚本的读者不可见，即「一份内容两处描述」。已删，改为 `<noscript>` 提示。
3. **「会话不存在」报成「没有对话」**：`locateExistingSessionLayout` **不校验目录存在**（只投影路径），
   故查一个从未写过的会话会读到空 transcript 并报「没有对话记录」——把读者引向缺失的消息而非缺失的会话。已加存在性检查。

### 规模与门禁

- 300 条消息：构建 1.2s / **导出 8ms** / 228KB。
- 函数数：`collect` 6、`htmlRender` 9、`template` 2、`html` 1、`markdownScan` 2——**均远低于 20 上限**。
- 新增测试：`htmlRender` 20 项、`collect` 6 项、`exportCommandRuntime` +2 项。
- 反向验证：把导出脱敏换成报告脱敏 → 内容被掏空（2 项失败）；未知格式回退 markdown → 2 项失败。
- 受影响套件 92 文件 677 项通过。

### 复核轮补充（2026-09-25）

**① 关于等价性的边界——原文声称过度。** 原文写「既有 23 项测试全绿 = 等价性证明」。复核实测：
那 23 项测的是**扁平的单项语法**，没有一项覆盖**块类型组合**（引用内的围栏、嵌套列表、
列表内的缩进代码、表格里的行内标记）。因此正确结论是「**这 23 项覆盖到的行为未退化**」，
而不是「分类器与完整 markdown 等价」。原文已按此更正（§1 与 §5 的措辞）。
`markdownScan.ts` 的定位应如实描述为**单层行级块扫描器**，不做嵌套容器语法。

**② 连续列表项未合并（真缺陷，已修）。** 分类器按**行**产出块，而 HTML 渲染是逐块 `.map().join()`，
于是 `- a\n- b\n- c` 渲染成**三个独立 `<ul>`**（浏览器里表现为三段带间隙的列表），
`1. a\n2. b` 渲染成**两个 `<ol>`**——**每段都从 1 重新编号**，写五步会看到五个「1.」。

修法是在导出层**聚合相邻同类块**（`groupBlocks`），不动分类器——终端渲染器按行输出本来就是对的。
规则：同类型（有序/无序）且同缩进的列表项合并；空行**结束**列表；引用的空行（裸 `>`）
**开始新段落**而非结束引用。同时 `<blockquote>` 的内容补上 `<p>` 包裹——多段引用原先会连成一段。
新增 4 项测试固定这些行为。

### 注入防护：真实浏览器复核（2026-09-25）

构造一个同时含 5 种注入向量的页面（`javascript:` 链接、实体伪装的 `&#106;avascript:`、
正文内 `<script>`、`data:` 图片、围栏内 `</script>`），生成真实导出文件后在 **headless Chromium 打开**：

```
__pwned / __pwned2 / __pwned3  ->  null   （一个都没执行）
inline handlers (on*=)         ->  0
锚点 href                      ->  "&#106;avascript:alert(1)"  （字面量，无 scheme，相对 URL）
正文                            ->  向量以**转义后的文本**原样显示
```

即：**注入不成立**。其中 `&#106;` 那条**确实生成了 `<a>`**，这是**对的**——
`&` 被转义成 `&amp;`，浏览器解析出的 href 是字面字符串 `&#106;avascript:...`，
**没有 scheme**，因此是无法执行的相对 URL。**我们第一版测试断言它不该有 `<a>`——断言错了，代码是对的**，
已按真实保证改写。这 5 条现已固化为测试（原先只有 1 条 `javascript:` 用例）。

### 一处一次性测量的如实记录

「301 树行 / 300 turn / 209ms / 注入节点 0」是**手工一次性测量**，测试套件里**没有**对应断言
（无 300 条消息的夹具，也无 DOM 注入节点的自动化检查）。即这组数字**不可回归**。
安全断言（`javascript:` 被拒、转义正确）有测试固定；性能与条目数没有。如实记录，不当作已验证保证。

## 6. 本步不做

- 不做分享托管服务（参考的 `buildShareUrl` 指向它的托管端）。
- 不做多主题切换（主题在导出时烤定，与参考一致）。
- 不做语法高亮器（第 3 步刚删掉 `syntax*` 令牌，因为无消费者；此处不重新引入）。
