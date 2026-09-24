---
title: "Phase 7 裁决：开工前的唯一裁决源"
category: article
sources: [phase-7-pre-research-2026-09-24, pi-source-2026-09-24, phase-6-decisions-2026-09-23, phase-5-decisions-2026-09-23]
created: 2026-09-24
updated: 2026-09-24
tags: [features, phase-7, decisions, rulings]
summary: "Phase 7 的**唯一裁决源**。5 项主决策 + 14 项补充裁决。核心裁决：①**T1 OAuth 凭据接线**——登录/刷新/解析/预检四段全在且有测试，**请求路径只读 `apiKey`** 而 account-auth 凭据没有该字段，所以 `/connect login … --account` 之后每个请求发**空 `Bearer`**；裁决**接线**（同 Phase 6 T1 的性质），并在请求层做刷新，不是新建 OAuth。②**T2 技能与提示词模板展开**——**必须在同一路径串联**（照 `pi` 的 `_expandSkillCommand` → `expandPromptTemplate`），分开实现会产生两套分词与优先级；且 `/skill:name` 的解析**必须在未知命令分支之前**，否则永远走不到（实测 `/skill:demo` 当前报「Unknown slash command」）。③**T3 转录内搜索**——长会话核心可用性，照 `pi` 的粘性搜索条设计。④**T4 Undo 合并**——扩展**已有**的 `lastAction` 机制到输入，不新增机制。⑤**T5 `get_entries(since)` / `get_tree`**——数据都在（`parentId` 树 + 不透明条目 id），缺的是对外查询面；但**必须先决定 `firstRetainedEntryId` 的去留**，它是 T5 要读的字段。⑥**T6 判定回写**——**四条判定已被证伪**（重复压缩、rewind 分支摘要、鼠标选择、Undo），其中两条有测试在钉住已实现的行为。"
confidence: high
---

# Phase 7 裁决

> **性质**：Phase 7 的**唯一裁决源**。凡与本文冲突的旧结论，以本文为准。
> **输入**：`phase-7-pre-research.md`（含每行的可复现命令）。
> **输出**：任务清单、顺序、边界。

---

## 0. 裁决原则

三条，按优先级：

1. **先让现有承诺成立，再扩大承诺范围。** 用户按文档操作会失败的事，优先于新功能。
2. **能接线就不重写。** 仓库里已有完整实现而只缺一个调用点时，接线是任务，重写不是。
3. **没有参考就不发明。** `pi` 有等价方案时照它的**设计与不变量**（不照抄代码）；
   `pi` 没有时，先问「这是缺口还是范围选择」，再决定。

---

## 1. 主决策

### §1.1 T1：OAuth 凭据接线（**首要任务**）

**问题**（`phase-7-pre-research.md` §1.1①）：`/connect login openai --account` 会成功、
会存 token、预检会放行，**然后每个请求发空 `Bearer `**。

**裁决**：**接线，并在请求层做刷新。不新建 OAuth。**

**理由**：
1. 三段实现（登录/解析/预检）**全在且有测试**——这是接线任务，性质同 Phase 6 T1。
2. 就绪预检 `providerReadiness.ts:105` 已经认 `accountAuth.accessToken`，
   **只有请求路径不认**。修一处即可，不需要重新设计认证。
3. `providerReadiness.ts:130-134` 的注释声称「Let the model adapter perform refresh-token exchange」，
   而**没有任何 adapter 做这件事**。既然裁决要修请求层，刷新就落在同一层——
   **否则注释继续描述一个不存在的消费者**（Phase 6 复核轮已记录此型缺陷两次）。

**具体做法**：

- `ProviderTarget`（`turn/step.ts:33-45`）增加认证信息，而不是只加 `apiKey`。
  **不能**把 OAuth token 塞进 `apiKey` 字段——那会让「这是 API key 还是 access token」
  不可区分，而 `pi` 的 `authMode` 概念正是为此存在（我方 `providerCredentials.ts` 已产出
  `authMode: "api-key" | "account-auth"`，只是**没有传播到请求层**）。
- 头部构造按 `authMode` 分支：`api-key` → `Bearer <key>`；`account-auth` → `Bearer <accessToken>`。
- **刷新**：`expiresAt` 到期且 `refreshToken` 存在时，在**发出请求前**刷新并**回写存储**。
  照 `pi` 的**双检锁串行化**——并发刷新会互相覆盖，第二个用失效的 refresh token 换失败。

**必须做的验证**：
1. **反向验证**：去掉 `authMode` 分支 → 断言请求头的测试失败。
2. **接缝测试**（这是本轮缺的那一环）：三处既有测试各测一段，
   **新增一处从「凭据对象」直接到「HTTP 请求头」的测试**——用本地 HTTP server 收请求，
   断言 `Authorization` 等于存储的 token。
3. **实机**：本地 server 扮演 provider，`/connect login` 写入假 token 后跑一个真实 prompt。

**边界（不做）**：
- 不实现新的 OAuth 提供方。
- 不改 `pi` 的 `auth.json` 布局类比物——我方已有 `providerConnections` 存储，**沿用**。
- **端到端真实端点验证**需要真实订阅账号，**本轮明确不做**，如实记录。

---

### §1.2 T2：技能与提示词模板展开（**两者必须同一路径**）

**问题**（§1.1②③）：`/skill:name` 不存在且**当前直接报错**（实机：
`Unknown slash command: /skill:demo`）；磁盘提示词模板引擎不存在。

**裁决**：**两件事在同一次展开中完成，且展开点必须在斜杠路由的未知命令分支之前。**

**理由**：
1. `pi` 在**同一路径**串联（`agent-session.ts:1649-1650`）：
   ```ts
   expandedText = this._expandSkillCommand(expandedText);
   expandedText = expandPromptTemplate(expandedText, [...this.promptTemplates]);
   ```
   **分开实现会产生两套分词（引号处理必须一致）与两套优先级判断**。
   这是一个**契约决定**，不是实现细节。
2. **路由顺序**：`slashRouter.ts:12` 按空白切分命令名，`skill:demo` 查不到就落到
   `buildUnknownSlashOutput`。所以展开**必须在 `routeSlashCommand` 之前或之中**，
   且**先于**未知命令分支。放在之后等于永不可达。
3. **技能内容成为用户消息**（`<skill>` 块），**不是**命令输出。
   这是与 `/skill <name>`（只打印）的**语义区别**，必须保留两者。

**具体做法**：

- 新增一个纯函数模块承担展开：输入 `{ text, skills, templates }`，输出展开后的文本。
  **纯函数**是为了可测——展开逻辑不需要会话状态。
- `SkillLoader` 已有的 `disableModelInvocation` 语义**照 `pi`**：
  不进系统提示词，**但可经 `/skill:name` 显式调用**。
- 模板语法照 `pi`：`$1`/`$2`/`$@`/`$ARGUMENTS`/`${1:-default}`/`${@:N}`/`${@:N:L}` + 引号分词。
  **不要自创语法**——用户的肌肉记忆来自 `pi` 一类工具。
- 发现路径：项目级 + 用户级，与 `SkillLoader` 的既有布局**一致**（不要为模板发明第二套目录约定）。

**必须做的验证**：纯函数测试覆盖每个占位符形态 + 引号分词 + 不匹配时**原样返回**。

**边界（不做）**：
- 不做模板的可视化编辑 / `--prompt-template` CLI 旗标（`pi` 有，但本轮无需求证据）。
- 不做 `enableSkillCommands` 的**动态开关 UI**——先给配置字段。

---

### §1.3 T3：转录内搜索

**问题**（§1.4③）：长会话里无法定位先前内容。`chrome/pager.ts` 的过滤是**全屏命令输出**的模态，
**不是**转录搜索。

**裁决**：**做，照 `pi` 的粘性搜索条设计。**

**理由**：这是**可用性缺口**而非新契约——所有数据（已渲染的行）都在内存里，
缺的只是查找与高亮。

**具体做法**（照 `pi` 的 `alt-screen-search.ts`）：
- 底部**粘性**搜索条（不是模态遮罩——用户要能看到匹配的同时看到上下文）。
- 全部匹配高亮 + 当前项**反显**（两个不同主题令牌，不是一个）。
- `Enter`/`Shift+Enter` 循环，视口**居中**到匹配。
- 显示 `x of y`（**没有这个数字用户不知道还有几处，也不知道要不要继续按**）。
- `Escape` 关闭并把焦点还给编辑器。

**必须做的验证**：**实机 PTY**——渲染类改动不能只靠单测（Phase 4 §15.6 的教训：
「测试看不到缺陷」）。用真实终端跑一个长会话并截图确认高亮与循环。

**边界（不做）**：
- 不做正则搜索（`pi` 也没有）。
- 不做跨会话搜索。

---

### §1.4 T4：Undo 合并粒度

**问题**（§1.4①）：输入 "hello" 产生 5 个撤销快照。

**裁决**：**做，扩展既有的 `lastAction` 机制，不新增机制。**

**理由**：`editor.ts:76` 已有 `lastAction: "kill" | "yank" | null`，
`:253` 已用它做连续 kill 的合并。缺的是**把这个机制覆盖到输入**——
`insert()` 在 `:154` 无条件 `this.lastAction = null`，主动放弃了连续性。
**新增第二套合并机制会与 kill/yank 语义冲突**（例如「输入后马上 kill」应算两次还是合并）。

**具体做法**（照 `pi` 的 fish 风格，`packages/tui/src/components/editor.ts:1201-1211`）：
- 连续**单词字符**合并为一个撤销单元。
- **空白单独成界**：空格前先落一个快照（这样撤销会连「空格+后一个词」一起去掉，符合直觉）。
- **原子操作跳过合并**（粘贴是一次操作，不该拆成 N 次撤销）。
- 保持 `redo` 语义不变——我方有 redo 而 `pi` 没有，**这是我们的优势，不要为了对齐而删掉**。

**必须做的验证**：反向验证——去掉合并逻辑，断言「输入 hello 后一次撤销清空」的测试失败。

---

### §1.5 T5：`get_entries(since)` 与 `get_tree`

**问题**（§1.3①）：有完整的**内部**树，无任何对外查询面。
`TranscriptEvent` **没有 `parentId`**，所以光有 `transcript.jsonl` 无法重建树。

**裁决**：**做查询面；但先决定 `firstRetainedEntryId` 的去留，再动手。**

**理由**：
1. 这是 02 里**唯一**不是「新契约设计」的缺口——`SessionThreadSnapshot` 的
   `id`/`parentId`/`activeLeafId`/`branches`/`compactions` 都在，
   `sessionTreeProjection.ts` 已有完整投影。缺的是**导出**。
2. `pi` 的契约（`docs/rpc-commands.md:683-711`）关键点有二：
   **① entry id 就是持久游标**（跨重启有效，因为 id 稳定）；
   **② `since` 返回严格晚于游标的条目**（不是「包含」）。
   这两点必须照做——「包含或晚于」的歧义会让客户端重复处理或丢事件。
3. **`firstRetainedEntryId` 必须先决定**（§2 裁决 1）：它是 「first kept entry」在
   我方 schema 里的对应物，**正是 T5 的 `get_tree` 要读的字段**。先删后接会拆掉前提。

**具体做法**：
- 在 `SessionManager` 上加查询方法，**不新增存储**——遍历已有快照即可。
- 返回结构照 `pi`：条带 + `leafId`（消费者要能知道「当前站在哪」，
  否则拿到的树不知道哪条是活跃路径）。
- **不把 `parentId` 塞进 `TranscriptEvent`**：那会改**已有文件的格式**，
  是迁移，不是查询。树关系已在 `state.json` 里，查询方法**读它**即可。

**边界（不做）**：
- 不做 stdin/stdout JSONL RPC（Phase 5 §9.2 #21、Phase 6 §7 两次裁决，维持）。
- 不做 SDK 门面（同上）。
- 不做 HTML 导出 / 分享链接 / CBOR 协议族（同上，逐项维持）。

---

### §1.6 T6：四条判定回写 + 死字段处置

**问题**（§0.2）：**四条判定已被证伪**；另有 `firstRetainedEntryId` 死字段。

**裁决**：**回写四条判定（附证据与反向验证），并把死字段裁决前置到 T5 之前。**

**理由**：
1. Phase 6 已证明**过时判定会导致错误决策**（主代理自己就是被 `03-*` 的表误导的）。
   本轮更糟：判定**不成立**，而其中**两条有测试在钉住已实现的行为**——
   `compaction.test.ts:543` 的标题就是「revises the checkpoint it finds instead of
   summarizing it again」。**表格说没做，测试说做了且会失败**。
2. 回写排在**最后**（同 Phase 6 §3.3：先改代码再回写，否则要写两遍），
   **但死字段的处置必须前置**（§2 裁决 1）。

**具体做法**：
- 四条判定改为「已收口」并**附反向验证**（改了哪一行 → 哪些测试失败）。
- **`06-*` 的鼠标条目**：同时记录**「启用鼠标上报会破坏终端原生选择」**这一事实——
  这是**做 `tuiMode: "regular"` 时必须一起考虑的前提**（§1.7 预埋）。

---

## 2. 补充裁决

| # | 议题 | 裁决 | 理由 |
|---|---|---|---|
| 1 | **`firstRetainedEntryId` 的去留** | **删除**（初稿误判为「接线」，已更正） | **初稿说「T5 的 `get_tree` 要读它」——已被复核证伪**（§4.1）：`pi` 的 `getTree()` 只用 `id`/`parentId`，我方树投影同理。它是**声明 + 被读 + 从不被写**（两种检索形态确认；`threadState.test.ts:128` 只在测试里构造），且 `check:config-consumers` **不覆盖 schema 字段**，所以没有任何门禁会提示它。**既然没有消费者、也没有规划中的消费者，就删掉**——保留一个永不写入的字段会让下一个读者以为某处会填它。**删除范围**：`sessionThread.ts:47` 的声明 + `sessionTreeProjection.ts:224` 的读取 + 测试里的构造。**注意**：`sessionTreeProjection.ts:247/269` 的 `firstKeptEntryId` 是**另一个**字段（来自 `SessionCompactionRecord`），**不要一并删**——先按名字检索再逐个确认来源 |
| 2 | **技能展开 vs `/skill <name>`** | **两者并存，语义不同** | `/skill:name` 把技能内容**送进模型**；`/skill <name>` **只打印**。删掉后者会让用户失去「先看看这个技能写了什么」的能力——那个能力在**决定要不要调用**之前是必要的 |
| 3 | **模板与技能展开的顺序** | **技能先，模板后** | 照 `pi`（`agent-session.ts:1649-1650`）。理由：技能体里可能**含有**模板语法（技能内部想引用参数），反序会让模板先展开掉技能体里的字面 `$1` |
| 4 | **展开失败时的行为** | **技能报错，模板留空**（初稿的「原样返回」是错的） | 两类**分开**处理，因为它们对用户的意义不同：**未知技能**（`/skill:foo`）是**拼错的命令**→ 给出「未知技能，可用的有…」提示，**与 `/help` 的未知命令体验一致**（当前实机就是 `Unknown slash command`，所以报错是**已有行为**，不是新增）；**模板缺参**（`$1` 无参）→ **留空**，照 `pi` 的 `${1:-}` 语义。**初稿把两者合并成「原样返回，不报错」，与自己在同一格里的解释矛盾**——已更正。**一处必须与 `pi` 的差异记录在案**：`pi` 的 `_expandSkillCommand`（`agent-session.ts:1798`）对未知技能**返回原文**（不报错），因为它**不拦截**斜杠路由；我方**有**斜杠路由，所以未知技能走的是路由的未知命令分支。**这是架构差异，不是行为疏漏** |
| 5 | **OAuth token 放哪个字段** | **新增认证承载，不复用 `apiKey`** | 复用会让「key 还是 token」不可区分，且**破坏 `authMode` 的既有语义**（`providerCredentials.ts` 已产出该字段，只是没传播） |
| 6 | **刷新失败时** | **报认证错误，不静默重试** | 静默重试会让用户以为是网络问题。照 `providerReadiness.ts:120-127` 的既有行为：refresh token 缺失时明确报「Re-run /connect login」 |
| 7 | **转录搜索是否也搜工具输出** | **搜**（搜索对象是**已渲染的行**） | 用户的记忆是「我见过那段输出」，不是「它在哪一类块里」。只搜消息会漏掉最有价值的部分（错误、diff） |
| 8 | **搜索是否高亮流式新增内容** | **不** | 流式期间行在变，高亮会跟着跳。搜索在**输入框为空且非 streaming** 时可用即可（与 `pi` 的 `busy` 检查一致） |
| 9 | **`get_tree` 是否返回被放弃分支** | **返回** | `pi` 的 `get_entries` 文档明确写「includes pre-compaction history and abandoned branches」。**只返回活跃路径等于把树压成链**，那正是要解决的问题 |
| 10 | **`since` 的边界语义** | **严格晚于** | 歧义会导致客户端重复处理或丢事件。照 `pi` 文档原文「entries strictly after it」 |
| 11 | **Undo 合并是否影响 redo** | **不影响** | 合并只减少**过去的快照数**，`future` 栈语义不变。**必须补测试**：合并后 undo 一次 → redo 一次回到原状 |
| 12 | **`tuiMode: "regular"` 与鼠标** | **本轮不做，但记录前提** | `06-*` 的鼠标条目要记下「启用鼠标上报会破坏终端原生选择」（`pi` 的 `docs/tui.md:58-62`）。**做 regular 模式时必须同时放开鼠标**，否则用户在主屏下既无原生选择、又失去应用内选择 |
| 13 | **cache 保活（03）** | **不做** | 会**主动发请求**，与「无未经询问的对外请求」的既有姿态冲突。且 `pi` 的决策模型 `expectedSavings = continuationProbability * missCost - warmCost` **依赖它的计费结构**，我方内置目录**零 `cost` 声明**（Phase 6 T3 已记录），**没有可算的经济学** |
| 14 | **更新检查（06）** | **维持不做，理由收紧** | 不是「产品决策未定」，而是「**需先建立对外请求的同意机制与离线开关**」——那是独立立项。本轮**新增**这条理由 |
| 15 | **检查点位置不变量的测试** | **补测试，不改实现** | `readContextCheckpoint` 只看 `messages[head]`（`session/compaction.ts:489-491`）。实测：检查点**不在** `head` 时（Case C）会被当作普通历史重新摘要——**正是原判定描述的缺陷**。当前不可达，因为 `applyCompaction:556-557` 无条件把检查点放在 `head` 之后，而分支摘要追加到末尾。**但这个不变量没有断言**，一旦有人改了 `applyCompaction` 或让别的消息抢先，缺陷会静默回归。**裁决：补一个断言「检查点由 `applyCompaction` 放在 `head` 之后、且被下一次压缩识别」的测试**，而不是改实现去支持任意位置——**支持任意位置需要扫描全表，而「检查点在开头」是压缩引擎的基本前提** |
| 16 | **双击选词／三击选行**（pre-research §2 第 8 项） | **纳入 T4**（与 Undo 同属编辑器/指针的人体工学） | **初稿漏了它**（复核者发现）。它与 T4 无依赖，但**同属「指针与编辑器的人体工学」**，且都要改 `pointer.ts` 的指针事件处理——**分开做会两次改动同一个事件分派**。照 `pi`（`packages/tui/src/tui-alt-screen.ts:81-84`）。**规模：小** |
| 17 | **`--json` 暴露会话路径**（pre-research §2 第 9 项） | **纳入 T5** | **初稿漏了它**（复核者发现）。T5 本来就要碰会话路径的解析（`get_entries` 要读 `state.json`），**在同一处顺手把路径放进 `query.started` 或结束事件**，消费者不必再拼 `~/.cheers/sessions/<id>/`。`run-event-stream.v1` 是**版本化**契约，**加字段是兼容变更**（消费者按 `schemaVersion` 分支）——**但要把它记进契约文档**。**规模：小** |

---

## 3. 执行顺序

```
T1 (OAuth 接线)
  ↓
T2 (技能 + 模板展开，同一路径)
  ↓
T3 (转录搜索，需实机)
  ↓
T4 (Undo 合并 + 双击/三击选择)   ← 裁决 16
  ↓
T5 (get_entries/get_tree + `--json` 暴露路径)   ← 裁决 17
  ↓
T6 (判定回写 + 文档 + 裁决 15 的不变量测试)
```

### 3.1 顺序理由

**T1 第一**：修的是**已经承诺但失效**的能力。失效的承诺优先于新功能（原则 1）。

**T2 第二**：它与 T1 无依赖，但**排在这里是因为它是 T1 之后第二重的「文档化用法报错」**
（实机证明 `/skill:demo` 直接报错）。

**T3/T4 可并行**：两者无共享文件（T3 在 `transcript/` + `chrome/`，
T4 在 `editor.ts`），**且都是 TUI**——若并行，**T3 的实机验证要等两者都落地**，
否则 PTY 截图会被 T4 的改动干扰。**建议串行：T3 → T4。**

**T5 第五**：它是本轮**唯一涉及存储读取**的任务。裁决 1（删除死字段）**不再**是它的前置——
初稿以为 `get_tree` 要读那个字段，已被复核证伪（§4.1），所以两者现在**没有依赖关系**；
删除可以放在 T6 与判定回写一起做。

**T6 最后**：回写在代码之后（否则写两遍）。**但裁决 1 的字段接线属于 T5 的前置，不属 T6。**

### 3.2 一处必须记录的判断

**为什么 T5 排在 T3/T4 之后，而不是之前？**

T5 的**证据强度最高**（数据都在、缺查询面），按「证据强度」排序它应该更前。
**但它不是行为缺口**：用户当前不会因为缺少 `get_entries` 而**操作失败**，
只是无法从外部集成。而 T1/T2 是**文档化操作直接失败**。

**排序依据因此从「证据强度」改为「失败的用户操作数」**——
这与原则 1 一致，也是本轮与 Phase 6 排序逻辑的唯一差别：
Phase 6 全是行为缺口，所以证据强度就是决定因素；
本轮混有「缺失的新能力」，需要把「已承诺」与「未承诺」分开。

---

## 4. 与前两轮裁决的关系

| 前轮裁决 | 本轮 | 说明 |
|---|---|---|
| Phase 5 §9.2 #5 `transcript 加 header/version 行` **不做** | **维持** | T5 **不改文件格式**——树关系已在 `state.json`，只加查询方法。所以 #5 的前提没变 |
| Phase 5 §9.2 #7 `firstKeptEntryId 接线` **不做** | **维持**（初稿误判为推翻，见 §4.1） | 初稿说 `get_tree` 需要这个字段——**核实后不成立** |
| Phase 5 §9.2 #21 / Phase 6 §7 RPC·SDK **不做** | **维持** | 已核实原文。T5 只做**查询方法**，不做协议 |
| Phase 5 §9.2 #18 Mermaid **不做** | **维持** | 需新依赖 |
| Phase 6 §7 更新检查 **不做** | **维持，理由收紧** | 见补充裁决 14 |
| Phase 6 §7 HTML 导出 **不做** | **维持** | 需渲染依赖（纯模板可行，但裁决已做且无需求证据） |

### 4.1 一处被复核推翻的自我更正（初稿是错的）

初稿把 #7 判为**推翻**，理由是「`get_tree` 需要『保留的第一条』这个字段」。
**这条理由建立在一个未经核实的假设上，复核者证伪了它。**

- `pi` 的 `getTree()`（`packages/coding-agent/src/core/session-manager.ts:1522-1550`）
  **只用 `entry.id` / `entry.parentId` / label** 建树：

  ```ts
  getTree(): SessionTreeNode[] {
      const entries = this.getEntries();
      ...
      for (const entry of entries) {
          const node = nodeMap.get(entry.id)!;
          if (entry.parentId === null || entry.parentId === entry.id) {
              roots.push(node);
          } else {
              const parent = nodeMap.get(entry.parentId);
  ```

  **`firstKeptEntryId` 一次都没出现。**
- 我方同理：`firstRetainedEntryId` 是 `SessionCompactionRecordProjection` 的字段
  （`sessionTreeProjection.ts:25-28`）——**压缩记录的描述符，不是树导航指针**。
  树投影（`projectSessionTree`）走的是 `SessionThreadSnapshot` 的 `parentId`。

**两者不在同一条链上。** 所以 #7 的**前提没有变**：Phase 5 说「不接线，因为压缩用另一条路
（`[Context Checkpoint]`）达成同一意图」**依然成立**（§1.6 已独立证明压缩那边确实成立），
而 `get_tree` **不需要**这个字段，不存在「新消费者」。

**维持原裁决。裁决 1 相应地从「接线」改为「删除」**（见 §2 更正）。

**这处错误的性质值得单独记**：我**把两个同名概念当成了同一个**——
`firstKeptEntryId` 在 `pi` 里是**压缩记录**的字段，而 `get_tree` 用的是**树条目**的 `parentId`。
然后**没有核实就据以推翻一条既有裁决**。

**这是本轮第三次同型错误**（§0.3 前两次是「同名不等于同功能」），
且这次更严重：前两次只是判错一行，这次是**推翻别人的正确结论**。
**新增纪律**：推翻既有裁决前，必须先证明**该裁决的前提真的变了**，
而证明的唯一方式是**读被引用方（`pi`）的实现**，不是读自己的推断。

## 5. 未做的裁决（如实记录）

| 项 | 原因 |
|---|---|
| T1 的真实端点端到端验证 | 需真实订阅账号与外部授权服务器。**本轮明确不做** |
| T2 的模板动态开关 UI | 无需求证据；先给配置字段 |
| T5 的 `since` 跨客户端重启验证 | 需两个真实客户端进程；方法层面的语义已按 `pi` 文档对齐 |
| 扩展宿主 / 包分发 / RPC / SDK / HTML / 分享 / CBOR / 图片 / Mermaid / cache 保活 / 更新检查 | 逐项登记为独立立项，见 §2 与 `phase-7-pre-research.md` §2.2 |
| 任何代码改动 | 本文件性质是裁决 |

---

## 6. 复核轮（**2026-09-24，施工之后**）

> **性质**：Phase 7 施工完成后，对 5 个实质提交（`74ace9ab`/`86047ac7`/`4419ebf6`/`6f594127`/`2dc93296`）逐片复核的**结论追加**。凡与上文冲突者以本节为准，并逐条给出证据与反向验证。

### 6.1 复核推翻的施工结论（7 项）

| # | 项 | 施工结论 | 复核结论 | 证据 | 处置 |
|---|---|---|---|---|---|
| R1 | T4 双击选词 | 「实机可用；测试抓出 release 覆盖 focus 一处真缺陷，已修」 | **在真实终端里双击永远不成立** | `selection.ts` 的 `release` 分支在「未选中任何内容」时调 `clear()`，而 `clear()` 清 `lastClick`；真实终端的双击序列是 `press→release→press→release`，第一次 release 就把计数清空 | **已修**：拆出 `endDrag()`（结束拖拽、保留计数）与 `clear()`（显式取消、结束计数）。反向验证：`repro` 3 项失败 → 修复后全通过 |
| R2 | T4 的测试证明了接线 | 「断言走 `DragSelection` 而不是只测 `spanForClick`——正确的辅助函数不能证明它被接上了」 | **测试本身掩盖了 R1** | `selection.test.ts` 的双击用例是 `press,press,release`，**缺少真实终端必然发出的中间 release**。正是那个 release 触发 `clear()` | **已修**：用例改为真实序列。这是「驱动各段」还不够——**驱动顺序也得是真实的** |
| R3 | T4 单字符词 | 未提及 | **双击 `a`/`x`/`i` 这类单词选不中** | `extractSelection` 末尾的 `MIN_SELECTION_CELLS=2` 把单格跨度判为「一次点击而非选择」 | **已修**：`extractSelection` 增 `{kind:"unit"}`，点击已经决定了单位，不存在「是不是选择」的疑问 |
| R4 | T4 反向拖拽 | 「词/行选择在拖拽中保持」 | **反向拖拽把两个词都切掉** | `drag` 分支一律 `focus = span.to`、`anchor` 不动；复现：双击 `beta` 后左拖到 `alpha` → 复制出 `lpha be` | **已修**：照 `pi` 的 `selectionInitialRange` 按方向交换锚点（`pi` `tui-alt-screen.ts:1202-1218`） |
| R5 | T4 跨空白拖拽 | 未提及 | **指针越过词间空格时选择冻结** | `spanForDrag` 缺失，`spanForClick` 在空白处返回 `undefined` → `focus` 不更新（`pi` 此时选中的是空白段，故不冻结） | **已修**：新增 `spanForDrag`（空白也算单位） |
| R6 | T5 `get_tree` | 「树返回多根；父链断裂保留为根」 | **自引用父节点导致栈溢出** | `readSessionTree` 把 `parentId === id` 的条目的父节点找到（即它自己）→ 递归排序无限递归。`pi` 显式处理：`if (entry.parentId === null \|\| entry.parentId === entry.id)`（`session-manager.ts:1533-1547`） | **已修**：`parentId === id` 视为根。反向验证：构造自引用条目 → 修复前 `RangeError`，修复后该条为根 |
| R7 | T1 刷新失败 | 「刷新失败不致命：保留原 token」 | **与裁决 §2 第 6 行冲突，且与 `pi` 相反** | 裁决写「报认证错误，不静默重试」；`pi` 抛 `ModelsError("oauth", …)`（`resolve.ts:155`）；带一个已被拒绝的 token 发请求，用户看到的是网络错误而非登录失效 | **已修**：`renewAccountAuthIfExpiring` 返回 `failure`，invocation 层用与就绪失败同一条终态事件上报 |

### 6.2 未完成项（施工记录了但没做，本次补做）

| # | 项 | 施工状态 | 复核后处置 |
|---|---|---|---|
| R8 | T1 并发刷新串行化 | 裁决 §1.1 明确要求「照 `pi` 的双检锁串行化」，施工**未做** | **已补**：模块级 per-provider in-flight Promise；等待者复用 leader 的结果、不重复交换（refresh token 是一次性的，并发第二个必然失败）。测试断言 `exchanges === 1` |
| R9 | T1 压缩路径的续期 | 施工只把 `apiKey` 换成 `headers`，**未接续期** | **已补**：`/compact` 与「被放弃回合摘要」两条路径先续期再建头（它们不经 invocation 路径，拿不到回合自身的续期）。回合自身路径不重复续期 |
| R10 | T1 的过期注释 | 裁决 §1.1 理由 3 要求「否则注释继续描述一个不存在的消费者」 | **已改**：`providerReadiness.ts:132` 原文「Let the model adapter perform refresh-token exchange」改为描述真实的续期位置 |
| R11 | T3 `Shift+Enter` 反向循环 | 裁决 §1.3 与搜索条自己的帮助文本都承诺 Enter/Shift+Enter 双向；施工只处理 `enter`/`down`/`up` | **已补**：`SearchKey` 增 `shift`，`enter + shift` 反向。新增 `searchState.test.ts`（此前 `searchState` **零测试**，这正是漏掉它的原因） |
| R12 | T3 流式期间不高亮 | 裁决 §2 第 8 行明确「不」；施工只做了「输入框为空」，**没有 busy 检查** | **已补**：`openSearch` 在运行中不打开；已打开的搜索在运行中不染色（查询与计数保留）。`pi` 同样避开流式 |

### 6.3 复核新发现（施工裁决未覆盖）

| # | 项 | 问题 | 证据 | 处置 |
|---|---|---|---|---|
| R13 | T2 裸名展开会静默改写用户句子 | 施工让**裸名**（`review auth`）也展开模板。于是存在 `review.md` 时，用户输入的正常句子 `review this function` 被整句替换成模板正文——**用户自己的字被删掉且无人过问** | `pi` 的 `expandPromptTemplate` 首行即 `if (!text.startsWith("/")) return text`（`prompt-templates.ts:305`），**从不**展开裸名。施工记录把这个差异写成「both go through the same module」，但那是**同一模块**，不是**同一契约** | **已删**：裸名展开路径移除，模板**必须带斜杠**（`/explain args`）。反向验证：桥接断言「普通句子原样通过」在修复前失败 |
| R14 | T2 项目模板优先级被反转 | `TemplateLoader` 把 `projectDirectories` 结果 `.reverse()`，而合并是「后者覆盖」→ **最外层项目目录取胜**，与技能加载器（就近取胜）及其自身注释相反 | 新增测试：仓库根与子目录各一份 `shared.md`，从子目录读取必须得到子目录那份；修复前得到根那份 | **已修**：去掉 `.reverse()`，与 `SkillLoader` 的前后顺序一致 |
| R15 | T2 优先级归属 | 施工把「谁赢」放在 `expandSubmission` 里（技能先、模板后），但**注册表在它之后**才被查询 → 一个与模板同名的内置命令会被模板顶掉 | `audit` 是 `/review` 的别名；实测 `/audit` 命中命令（正确），但那是巧合——顺序上模板本可先拿走它 | **已修**：查找拆为 `expandSkill`/`expandTemplate`，路由按 **技能 → 注册表 → 模板 → 未知命令** 决定优先级，「谁赢」回到路由层。测试钉住 `audit.md` 不能顶掉 `/audit` |
| R16 | T2 一个算出来没人读的报告字段 | `ExpansionResult.unknown` 的 `kind: "template"` 分支被计算后**无人消费**（路由只读 `kind === "skill"`），而裸名路径的文本不以 `/` 开头 → **两条路径都到不了** | 全仓检索 `unknown?.kind`：只有 `slashRouter.ts:40` 的 `skill` 分支 | **已删**（R13 同时使模板 case 无意义）：改为 `expandSkill` 返回 `unknownSkill`，模板查找不产生报告 |

### 6.4 复核不采纳（1 项，附理由）

| # | 项 | 复核者建议 | 不采纳理由 |
|---|---|---|---|
| N1 | T4 双击连续性用**词界**而非单元格 | 复核者指出 `pi` 的 `getClickCount` 以 `wordStart/wordEnd` 判定连续性（`pi` `tui-alt-screen.ts:1225-1240`），因此指针有 1 格抖动仍算双击；建议照做 | **维持施工裁决**。裁决原话「只有**同一单元格**、且在时间窗内才延续」是**有理由的显式决定**（「指针移动了就是拖拽」），而 `pi` 的词界判定与其拖拽检测分属两条路径。改为词界会反过来破坏「按下→微移→松开」应算拖拽的语义。**记录为已裁决的差异**，不是缺陷 |

### 6.5 复核未覆盖

| 项 | 原因 |
|---|---|
| T1 真实订阅账号的端到端验证 | 同 §5，需外部授权服务器与真实账号 |
| 全量套件的性能基准项（`surface/benchmark.test.ts`） | 阈值型断言（1000ms），在并发负载下抖动；判定见 `phase-7-execution.md` §9.1 |
| `pi` 7 家 OAuth 提供方 | 维持 §5：接线优先于扩面 |
