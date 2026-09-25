---
title: "Phase 10 裁决"
summary: "Phase 10 是 01–07 的收尾阶段：6 项施工（T1–T6）+ 2 项裁决（D1 维持不做、D2 仅改文档）。核心取舍：凡「能验证」的收口优先做，凡「无法验证」的新表面一律不加——因此本阶段不加新协议、不加新 provider，而是把已有的扩展点做成真的。"
---

# Phase 10 裁决

> **唯一裁决源。** 施工以此为准；与 `01-*`～`07-*` 冲突时以本文件为准并回写文档。
> 前置研究见 `phase-10-pre-research.md`；范围出处与排除项见其 §0。

## 0. 任务表

| # | 任务 | 来源行 | 判定 |
|---|---|---|---|
| **T1** | Session 版本头 + 导出 header | `02:50` + `02:51` | **做**（同一根，一次做） |
| **T2** | 崩溃日志时效上限 | `06:54` | **做** |
| **T3** | 主题热重载 | `04:61` | **做** |
| **T4** | Cache 浪费分析 | `06:62` | **做** |
| **T5** | 端点协议分支收敛 | `03:53` | **做**（收敛，**不加新协议**） |
| **T6** | 认证 provider 注册收敛 | `03:49` | **做**（收敛，**不加新 provider**） |
| **T7** | 内置目录的 `cost` 数据 | `06:60` 正文余量（**复核补**） | **做** |
| **D1** | `SYSTEM.md` 替换语义 | `01:64` | **维持不做**（理由已更正，见 §8.1） |
| **D2** | 技能发现注记更正 | `01:57` | **仅改文档**（代码无余量） |
| **D3** | Session 分享／发布链接 | `02:53` | **不纳入**——独立立项，非宿主下游（见 §8.3） |
| **D4** | thinking 档位扩到 7 档 | `03:58` 正文余量 | **不纳入**——正文自述属**产品决策**（见 §8.4） |

**执行顺序**：见 §9（按风险排序，非依赖）。

---

## 1. 贯穿本阶段的两条取舍

### 1.1 能验证的才做

本阶段有 **7 项**候选，但其中两项的余量**天然无法验证**：
- `03:49` OAuth：**登录成功路径需要真实订阅账号**。
- `03:53` 端点：Vertex／Bedrock 各自的认证与流式语义差异大，同样无账号可验。

**裁决**：这两项**不扩充新表面**，只做**它们各自已存在的结构缺陷**。
两处缺陷都是**实测到的**，且都**可完整验证**：

| 项 | 实测缺陷 | 证据 |
|---|---|---|
| `03:49` | 「家」的清单**散在 4 处**，加一家要改 4 个地方，且**漏改不会报错** | `providers.ts:91` 硬编码 / `authorization.ts:104-113` 分派 / `providerAuthRuntime.ts:20-22` `CONTRACTS` / `cliArgs.ts:21` `VALID_PROVIDERS` |
| `03:53` | 协议分支**散在 6 处**，其中 `turn/step.ts:216-217` 与 `chatRequest.ts:50-51` **各判一次** | `chatRequest.ts:40,50` / `chatResponse.ts:14` / `step.ts:180,216` / `authorization.ts:8` |

**为什么这样取舍**：加入无法端到端验证的认证流程或协议实现，等于**交付一个没人跑过的代码路径**——
比不做更差（用户会以为它能用）。而收敛分支**让「加一个」这句话变成真的**，
是把能力做实，而不是把表面做大。

### 1.2 不许把「不加」写成「已具备」

T5/T6 完成后，`03:49` 与 `03:53` 两行的判定列**仍是部分收口**——
它们的余量（真实端点验证、更多协议）**依然存在**。文档必须写清「结构已收敛，家数仍为 N」，
不得因为改了架构就宣称缺口关闭。

---

## 2. T1 — Session 版本头 + 导出 header

### 2.1 目标
让 transcript 文件与 `/export jsonl` 的输出**自带版本**，使读方能判断自己在读什么格式。

### 2.2 为什么合并做一个
`02:50`（entry 级版本化）与 `02:51`（导出保留 header）**是同一个根**：
没有版本，就没有东西可导。分开做会产出「有 header 但 header 里没版本」的半成品。

### 2.3 形状：首行 header 记录（照参考实现的形状）

参考实现 `docs/session-format.md:64-75` 的首行是：
```json
{"type":"session","version":3,"id":"uuid","timestamp":"…","cwd":"…"}
```

**我方采用同一形状**，字段用我方既有命名，不照抄字段名无关的部分：

```json
{"type":"session","version":1,"id":"<sessionId>","timestamp":"<ISO>","cwd":"<workspaceRoot>"}
```

### 2.4 关键设计：为什么这是安全的（三条已实测的性质）

**① 旧 build 读新文件不会失败。** `isTranscriptEvent`（`sessionEventCodec.ts:186-197`）
对未知 `type` **返回 false**，`decodeTranscriptLineSafe` 返回 `undefined`，
`readTranscriptEvents`（`sessionTranscript.ts:19-27`）把它跳过。
**即：老代码遇到 header 行会安静忽略它。**

**② 新 build 读旧文件不会失败。** 老文件首行是 entry，不是 header。
读方按「首行是否为 `type:"session"`」判定；**不是则视为 v0（无版本）**——
这与参考实现的 `entry.version ?? 1` 是同一手法（`docs/session-format.md:258`）。

**③ ~~加字段是纯增量~~——复核指出这一条与首行 header 方案无关。**
`isTranscriptEvent` 确实不拒绝多余字段，但那是**entry 级**方案的论据。
既然选了**独立首行 header**，老读方跳过它的**唯一原因**就是断言 ①（未知 `type` → `false`）。
**header 的安全性只依赖那一条守卫，不依赖字段容忍度。**

### 2.5 硬约束：不许迁移重写
仓库已有先例 `legacyTranscriptEntryId`（`sessionEventCodec.ts:110-119`），注释写明：

> 「rewriting old transcripts would break the promise that they are append-only」

**裁决**：老文件**不重写、不迁移**。版本**只在读时推断**。写入 header **只在创建新会话时**发生。
`/export jsonl` 对无版本的老会话输出 `"version":0`——**如实说明它没有版本**，不猜。

### 2.6 为什么 header 与 append-only 不冲突（主代理已核实写入路径）

**疑问**：header 必须在**首行**，而 append-only 只能往**末尾**加。这两件事看起来矛盾。

**核实结论：不矛盾。** transcript 文件**不是**在第一次 append 时才出现的——
创建会话时先建立一个**空文件**：

```ts
// src/session/store/sessionStore.ts:26-28
if (!fs.existsSync(input.layout.transcriptPath)) {
  fs.writeFileSync(input.layout.transcriptPath, "", "utf8");
}
```

调用链已确认为**唯一**的创建入口：
`createBoundSession`（`session/store/sessionCreation.ts:68-75`）→
`callbacks.writeSession(session)`（`:74`）→ `sessionStoreAccess.writeSession`（`:107-112`）→
`writeSessionRecord`（`sessionStore.ts:18-32`）→ 建空文件。

**关键**：`createBoundSession` 在 `writeSession` **之后**才返回，而回合是之后才追加的
（`appendSessionTurn`，`sessionTranscript.ts:193-204`）。所以 header 写在
**建空文件的那一刻**——文件此时是空的，写首行**不是插入、不是重写**，就是它的第一次写入。

**因此规则是**：
- header 在**文件为空时**写入（无论是建文件那一刻，还是首次追加前）；
- 已写下的字节**永不**被改写——补 header 只发生在 **0 字节文件**上。

这样 append-only 的承诺完全保留。

> **⚠️ 位置已由复核更正**：本节最初写「header 只在 `writeSessionRecord` 里写」。
> `RvP10T1` 指出那是**接口旁路**——`appendTranscriptEvent` 是公开导出的，
> 绕过 `sessionStore` 的路径会丢掉 header。**最终方案见 §2.12**：
> 把「确保首行合法」放进 `sessionTranscript` 模块内部（唯一追加入口）。

### 2.7 改动面
| 文件 | 改动 |
|---|---|
| `src/session/sessionEventCodec.ts` | 新增 `TRANSCRIPT_FORMAT_VERSION`；`SessionHeaderEvent` 类型；`createSessionHeaderEvent()`；`decodeTranscriptLineSafe` 识别 header 行 |
| `src/session/transcript/sessionTranscript.ts` | **追加时**确保首行合法（见 §2.12）；`readTranscriptEvents` 跳过 header 行（**且不计入 `lineNumber`**，见 §2.10）；新增 `readTranscriptWithHeader`（见 §2.11） |
| `src/session/store/sessionStore.ts:26-28` | 建文件时写入 header（快路径；**不作为唯一保证**，见 §2.12） |
| `src/core/commands/exportCommandRuntime.ts` | `asJsonl` 首行输出 header（含推断出的版本） |
| `src/core/commands/exportCommandRuntime.ts` | `/export jsonl` 的说明块补一句「首行是 header，entry 数 = 行数 − 1」 |

### 2.8 验证
- 新增老格式文件（无 header）→ 读回全部 entry，版本报 0。
- 新建会话 → 首行是 header，版本 1。
- 导出两种文件 → JSONL 首行都是 header。
- **反向验证**：把 header 识别去掉 → 老文件用例应仍过、新文件用例应失败（证明该判定有承重）。

### 2.9 风险与规避
| 风险 | 规避 |
|---|---|
| 用户脚本按「行数 == entry 数」 | `/export` 输出里**明确点出**首行是 header（该命令已有解释块） |
| **header 行占用 `lineNumber`** | **复核否定了原先「两者不冲突」的说法**——见 §2.10 |

### 2.10 行号偏移风险（复核发现，**必须处理**）

原裁决说「老文件无 header，其行号不变；新文件 entry 全有真 id，两者不冲突」。
**复核指出这是「理想假设下的断言」**，并给出反例。实测确认风险真实：

`readTranscriptEvents`（`sessionTranscript.ts:13-25`）**对每个非空行都 `lineNumber += 1`**，
**不管 `decodeTranscriptLineSafe` 是否认出了它**：

```ts
for (const line of fs.readFileSync(transcriptPath, "utf8").split("
")) {
  if (!line) continue;
  lineNumber += 1;                                   // ← header 也占用一个号
  const event = decodeTranscriptLineSafe(line, lineNumber);
  if (event) events.push(event);
}
```

**两个真实后果**：
1. **导出的 JSONL 若被回读**：T1 会给无 header 的老会话在导出时**补一行 `version:0`**。
   老 entry 的派生 id 于是从 `line-1` 变成 `line-2`，与 `state.json` 里存的 id **错位**。
2. **新 build 若产生无 id 的 entry**（异常或外部注入），其 id 会是 `line-2`；header 一旦被剥离又漂回 `line-1`。

**裁决**：**header 行不参与 `lineNumber` 计数**。
实现上：先判该行是否为 header，是则 `continue`（**在 `lineNumber += 1` 之前**），
使**第一个 entry 仍是 `line-1`**。这样老文件的派生 id 与带 header 文件的派生 id **语义一致**。

**这条必须有用例钉住**：同一个无 id entry，放在「无 header 文件的首行」与
「有 header 文件的首行」，**必须得到相同的 id**。反向验证：去掉「header 不计数」→ 该用例失败。

### 2.11 `readTranscriptEvents` 的返回签名（复核发现，**设计未定**）

`readTranscriptEvents` 的返回类型是 `TranscriptEvent[]`，全仓有 **9 处生产调用方**
（`agent/persistence.ts:68`、`store/sessionStore.ts:95`、`export/collect.ts:108`、
`core/commands/entriesCommandRuntime.ts:33`、`exportCommandRuntime.ts:177`、
`lifecycle/sessionLifecycleWrites.ts:225`、`SessionManager.ts:100` 等）。
**直接改返回值会大面积破坏**。

**裁决**：**不改 `readTranscriptEvents` 的签名**。新增一个**独立函数**
（如 `readTranscriptWithHeader`）返回 `{ version, events }`，供 `/export` 与版本报告使用；
`readTranscriptEvents` 内部复用它、**只返回 `events`**（保持既有契约）。
**空文件**（老版本创建的 0 字节文件）→ 版本判为 `0`，events 为空。

### 2.12 header 的写入职责（复核发现，**与原 §2.6 冲突已解**）

原裁决把 header 写在 `sessionStore.ts:26-28`（建空文件处），但 `appendTranscriptEvent`
是**公开导出**的（`sessionTranscript.ts:84`），多处直接调它。**若某条路径先建文件再追加，
header 就丢了**；且磁盘上已存在的 **0 字节文件**（老版本建好但还没写 turn 的）
在新版本追加首个 turn 时**永远失去**写 header 的机会。

**裁决**：把「确保首行合法」的逻辑**收敛进 `sessionTranscript` 模块内部**，
在追加时检测「文件为空或首行不是 header」→ **先补 header 再追加**。
理由：`sessionTranscript.ts` 是**唯一的追加入口**，把不变量放在这里，
所有调用方自动满足，不依赖「必须走 sessionStore 建文件」这种不成文的约定。

**注意**：这**不**违反 append-only——补 header 只发生在**空文件**上（0 字节，无已写字节可破坏）。
**若文件非空且首行不是 header**，则视为老格式，**不补**（那才是真正的重写）。

---

## 3. T2 — 崩溃日志时效上限

### 3.1 目标
崩溃记录不再永久驻留：超过 **7 天**的记录不再被当作有效记录。

### 3.2 实测现状
`crashLog.ts:38` `MAX_CRASH_RECORDS = 5`；`:86` `slice(-MAX_CRASH_RECORDS)`。
**只有条数上限**，`grep expire|days|prune|maxAge` → **0**。

### 3.3 形状：照参考实现，但**要写清它是「新鲜度」不是「删除」**

参考实现（`crash-log.ts:16`）`MAX_AGE = 7 * 24 * 60 * 60 * 1000`，
其**消费点在 `takeUnnotifiedCrash`（`:146-150`）**——即**过期记录不提示，而不是被删**。

**裁决（经复核更正）：只做「读取不返回」，不做删除。**

**原裁决错了，且错在两处**：
1. **理由与事实不符**。原裁决称「否则文件只增不减」——
   实测 `crashLog.ts:86` 已经在写前 `slice(-MAX_CRASH_RECORDS)`，
   且 `:88` 是 `writeFileSync`（**整文件重写**，不是追加）。**文件物理上早已被限制在 5 条**，
   「只增不减」不成立。
2. **与自己的前置研究矛盾**。§6.3 明确写了参考实现的 7 天是「**提示新鲜度**而非删除」，
   §6.5 还专门警告「别把『过期不提示』写成『静默删除』」。裁决却反过来做了删除。

**为什么不该删除**：`/report`（`reportCommandRuntime.ts`）打包诊断报告时会读这个文件。
删掉 7 天前的记录，等于**在用户要交 bug 报告时删掉他仅有的那次崩溃证据**——
而且越是罕见的崩溃越可能只发生过一次。**这正是「不提示」与「删除」的区别所在。**

**因此**：`readCrashLog` 过滤掉超过 7 天的记录（用于 `/crash` 展示与新鲜度判断），
**但不在 `recordCrash` 里删除**。文件内容仍由既有的 `MAX_CRASH_RECORDS` 限制。

**若将来要真删**：需要的是**合规或隐私上的硬性要求**，而目前没有这样的要求。

### 3.4 改动面（按更正后的裁决）
`src/observability/crashLog.ts`：新增 `MAX_CRASH_AGE_MS`；
**`readCrashLog` 过滤**超龄记录；**`recordCrash` 不改**（保持既有 `MAX_CRASH_RECORDS` 语义）。

**注意 `/report` 的影响面**：`reportCommandRuntime.ts` 也读崩溃记录。
需确认过滤后它读到的是「近 7 天」而非「全部」——**这可能在 bug 报告里造成一种新的信息损失**，
实施时要判断：`/report` 是否应该看**未过滤**的记录（因为用户交报告时正是需要那次崩溃）。
**本裁决倾向 `/report` 读未过滤**，`/crash` 读过滤后的。

### 3.5 顺序问题（实测已确认无冲突）
现有序是**旧在前、新在后**（`crashCommandRuntime.ts:44-46` 注释自述「reading a crash report
means reading forward through what happened」）。按时间淘汰自然从头部淘汰，**不破坏**既有遍历。

### 3.6 验证
- 写入 8 天前的记录 + 今天的记录 → 只读回今天那条。
- 写入 6 天前的记录 → 仍读回。
- 边界：恰好 7 天 → 按「≤ 保留」还是「< 保留」**要对齐参考实现的判定**（`<= MAX_AGE`）。
- **反向验证**：去掉时间过滤 → 「8 天前不再返回」的用例失败。

---

## 4. T3 — 主题热重载

### 4.1 目标
改主题文件后**无需重启**即可生效。

### 4.2 前置：缓存失效已就绪，**但重绘通知没有**（经复核更正）

**原裁决说「重载后画面跟上已经做完了」——复核否定了这一句。**

缓存**键**确实已就绪（下面实测部分），但**缓存失效 ≠ 画面更新**：
`container.ts:123-127` 的校验**只在 `render()` 被调用时**才执行。
若用户静止在终端前，**没有任何东西会调用 render**，调色板变了屏幕也不会动。

实测：`applyTheme`（`theme.ts:264-275`）**只有两行**——`loadTheme` + `defaultTheme.apply` +
记名，**没有任何通知**；全仓也没有 `onThemeChange` 之类的回调（参考实现有）。

**所以本任务有两件事，不是一件**：
1. 检测文件变化（watcher）；
2. **变化后触发一次重绘**——接入既有的 `tui.requestRender()`
   （`interactiveMode.ts:108,113,124,164,168,218,224,291` 已有大量先例）。

**下面这条仍然成立**：调色板换了之后，缓存**会**因为 `colorRevision` 变化而失效——
即重绘时不会拿到旧颜色的行。缺的是「谁来触发重绘」。

### 4.2.1 缓存失效机制（实测）
`Theme.apply()`（`theme.ts:128-132`）每次换调色板就 `this.revision += 1`，
`colorRevision`（`:135-137`）被两处缓存用作 key：
- `presentation/tui/transcript/container.ts:123-127`（`cached.revision === revision`）
- `presentation/tui/transcript/mermaid.ts:123`（缓存 key 前缀）

`Theme.apply` 的注释**写的就是重载场景**：
> 「the reload would change the palette and nothing on screen would follow」

**所以缺的只是「发现文件变了」这一步。**

### 4.3 形状：`node:fs` 的 `watch`，**零新依赖**

仓库**全仓无任何 watcher 基础设施**（`grep fs.watch|FSWatcher|chokidar|watchFile src/` → 0）。
引入方式：`node:fs` 的 `watch`，**不引第三方库**。

**照参考实现的七条判断**（`modes/interactive/theme/theme.ts:826-910`），逐条采纳并注明理由：

| # | 判断 | 理由 |
|---|---|---|
| 1 | **只监听自定义主题**，`dark`/`light` 直接返回 | 内置的不在磁盘上，监听无意义 |
| 2 | 只监听**已存在**的文件 | 否则监视一个永远不出现的路径 |
| 3 | **100ms 防抖** | 编辑器保存会连发多次事件 |
| 4 | 防抖回调里**先比对当前主题名** | 切主题后旧定时器会把新主题覆盖回去（**这是个真 bug 的防法**） |
| 5 | 文件暂时消失时**保留上一个好主题** | 编辑器保存的中间态文件可能不存在 |
| 6 | 解析失败**吞掉**（不崩） | 「文件可能正在被编辑」 |
| 7 | **监听目录**而非文件 | 参考实现 `footer-data-provider.ts:315` 注释：「fs.watch on a file stops working after the inode changes」 |

### 4.4 改动面
| 文件 | 改动 |
|---|---|
| `src/presentation/themes/watch.ts`（新） | watcher 的启停、防抖、陈旧保护；`node:fs` 的 `watch` |
| `src/presentation/theme/theme.ts` | `applyTheme` 成功后启动；暴露停止入口 |
| `src/cli/interactive/` 切主题的命令路径 | `/theme` 切换时**先停旧 watcher 再启新的** |
| 进程退出路径 | 释放 watcher |

### 4.5 风险：**生命周期**（本项最容易出的真 bug）

**原裁决只写了「非交互模式不启动」——复核指出这不够。** 实测风险面：

| 风险 | 为什么「非交互不启动」挡不住 |
|---|---|
| `node:fs.watch` 保持事件循环活跃 | 交互模式下**进程本来就要退出**（用户按 Ctrl+C / 退出命令），watcher 会让它**卡住不退出** |
| 100ms 防抖的 `setTimeout` 同样保持事件循环 | 同上，且防抖定时器在退出时刻可能正挂着 |
| `/theme` 切换时重复调用 `applyTheme` | 旧的 watcher **不释放**就泄漏一个（切 5 次主题 = 5 个 watcher） |
| 测试进程调用 | vitest 的 worker 可能因未关闭的 watcher **挂起** |

**必须做的四件事**（缺一不可）：
1. 启动 watcher 时 **`unref()`**，使它不阻止进程退出（或确保退出路径显式关闭）。
2. 防抖定时器**同样 `unref()`**。
3. `applyTheme` 在**启动新 watcher 前先关旧的**（幂等停止），否则每次切主题泄漏一个。
4. 退出路径**显式关闭**，且测试里**不启动** watcher（或提供可注入的空实现）。

**验证必须包含**：实机退出后进程**确实退出**（不是靠超时杀）；
连续切 3 次主题后**只有一个** watcher 存活。

### 4.6 验证
- 实机：`/theme <custom>` 后改磁盘文件 → 画面变色，**且进程不重启**。
- 切到另一个主题后，改**前一个**主题文件 → **不应**影响当前画面（验证判断 4）。
- 把文件写成非法 JSON → 不崩，保留上一个好主题（验证判断 6）。
- **退出后进程不挂起**（可用 `ps` 或命令超时验证）。

---

## 5. T4 — Cache 浪费分析

### 5.1 目标
`/cost` 能回答「本可命中却没命中多少 token、多花了多少钱」。

### 5.2 实测现状与**对旧记录的一处更正**
旧记录说「只差 `usageTelemetry` 记录请求时间戳……从『无基础设施』降为『接线』」。
**实测更正**：不是只差时间戳，而是**缺一个按请求的滑动状态**——
算 `idleMs`/`missedTokens` 必须保留**上一次请求**的
`{promptTokens, modelKey, timestamp, reportedCache}`。今天只有一个**覆盖式**的
`lastUpdated`（`usageTelemetry.ts:70,227,243`），**无历史**。

**已就位的前置**（这些是真的）：
- TTL 声明：`core/models/catalog.ts:70-76` `promptCache?: { short?: number; long?: number }`
- 费率投影：`core/models/cacheEconomics.ts:109-152` `evaluateCacheWarming`
- 每次请求的 token 与模型**都在记**：`usageTelemetry.ts:169-178`

### 5.3 形状：照参考实现的算法
`pi` 的 `src/core/cache-stats.ts`（实测读过）：
- `NOISE_FLOOR_TOKENS = 1024`——低于此视为分块粒度噪声，**不计入 miss**。
- `missedTokens = min(prev.promptTokens, promptTokens) - usage.cacheRead`
- `missedCost = missedTokens × max(0, 已付单价 − 缓存读单价)`
- `idleMs = max(0, 本次时间戳 − 上次时间戳)`
- `modelChanged = \`${provider}/${model}\` !== prev.modelKey`
- 扫描时遇 **compaction／branch_summary 重置 prev**——上下文合法重建**不算浪费**。

**最后一条是必须照抄的语义**：不重置会把压缩本身记成浪费，那是**误报**。

### 5.4 改动面（按 §5.6 的离线扫描形状）
| 文件 | 改动 |
|---|---|
| `src/observability/cacheStats.ts`（新） | `CacheMiss`／`CacheWasteTotals` 类型 + `detectMiss` + `scan`（**纯函数**） |
| `src/core/commands/costCommandRuntime.ts` | 调用 `scan` 并展示命中率与浪费 |
| `src/observability/usageTelemetry.ts` | **不改**（复核后改为离线扫描，不需要在这里加状态） |

### 5.5 约束：函数上限
`usageTelemetry.ts` **已接近 20 个函数名的上限**（`AGENTS.md` 规则 3，`analyze:module-facades` 为 advisory）。
新逻辑**放新模块**，不要堆进它。

### 5.6 接线空洞（复核发现，**这是本任务最容易漏的地方**）

参考实现是对**会话条目做离线扫描**（读整条历史，遇到重置点就清 prev）。
而我们的 `/cost` 读的是**内存里的 `getSessionUsage`**（在线累计）。
**两者形状不同**——在线维护 prev 状态时，**谁来通知它「上下文被重建了」？**

实测：`compaction` 与 `branch_summary` 的落点在
`sessionTranscript.ts:145` / `:163` 与 `appendCompactionEvent`／`appendBranchSummaryEvent`，
**这些路径目前完全不碰 `usageTelemetry`**。

**裁决**：**采用离线扫描，不采用在线状态**。理由：
1. 参考实现的做法**已经被验证过**，且天然处理「历史被重建」这件事；
2. 在线状态需要在 compaction／branch 两处新增通知，**漏一处就永久误报**（而误报会一直累积）；
3. 离线扫描是**纯函数**——输入历史，输出统计，**可独立测试**，不需要给 `usageTelemetry` 加可变状态。

**即 T4 的形状改为**：`cacheStats.ts` 暴露一个 `scan(events, priceLookup)` 纯函数；
`/cost` 调用时传入本次会话的历史条目。**不往 `usageTelemetry` 里塞状态。**

### 5.7 验证
- 纯函数级 fixture：连续两次请求，第二次 `cacheRead` 明显小于第一次 prompt → 报出 miss 与金额。
- **compaction 重置**：夹一个 compaction → **不报**浪费。
- **branch_summary 重置**：夹一个 branch_summary → **不报**浪费。
  （**复核指出原验证计划漏了这条**——只测 compaction，漏掉 branch_summary 时用例仍会全绿。）
- `missedTokens <= 1024` → 不报（验证噪声地板）。
- 换模型 → `modelChanged` 为 true。
- **反向验证**：分别去掉 compaction 重置、去掉 branch_summary 重置 → **各自**对应用例失败
  （两条独立用例，不能合成一条）。

---

## 6. T5 — 端点协议分支收敛

### 6.1 目标
**不加新协议**。让「加第三种协议 = 加一个模块」这句话**变成真的**。

### 6.2 实测缺陷：**也比旧记录严重**（本节已按实测更正）

前置研究数出 **6 处请求构造分支**。写本裁决时按「命中 `EndpointKind` 或协议字面量」全量统计，
实测 **46 处，散在 16 个文件**：

| 命中数 | 文件 |
|---:|---|
| 7 | `turn/step.ts` |
| 7 | `provider/endpoints/chatRequest.ts` |
| 6 | `core/models/catalog.ts` |
| 4 | `core/commands/connect/preset.ts` |
| 3 | `core/commands/modelCommandRuntime.ts` |
| 3 | `config/runtimeConfig.ts` |
| 3 | `provider/endpoints/chatResponse.ts` |
| 2 及以下 | `providerReadiness.ts`、`registry/provider.ts`、`request/authorization.ts`、`cliSessionRuntimeFactory.ts`、`cliArgs.ts`、`btwCommandRuntime.ts`、`query/compaction/summarize.ts`、`models/catalogStore.ts`、`runtime/resources/descriptor.ts` |

**注意**：这 46 处**不全是**需要收敛的分支——`core/models/catalog.ts` 的多处是**数据声明**
（哪些模型属于哪种协议），`registry/provider.ts` 是诊断标签。**判断哪些该收敛，本身就是本任务的第一步。**

**真正的「请求形状」分支经复核是 8 处**（前置研究列出 6 处，复核补了响应读取的 2 处）：

| 位置 | 内容 |
|---|---|
| `provider/endpoints/chatRequest.ts:39` | `chatPath()` |
| `provider/endpoints/chatRequest.ts:49-50` | `chatBody()` |
| `provider/endpoints/chatResponse.ts:14` | 响应读取 |
| `turn/step.ts:180-181` | `endpointFor()` |
| `turn/step.ts:216-217` | **主回合又判一次** body |
| `turn/step.ts:460` | **非流式**响应解析（`readAnthropicBody`）——**复核补** |
| `turn/step.ts:463-465` | **流式**响应解析（`readAnthropicStream` vs `readCompletionStream`）——**复核补** |
| `provider/request/authorization.ts:8` | `anthropicHeaders` |

**`chatRequest.ts:5-18` 的注释自述**它要解决的就是这个：

> 「three copies of 'which endpoint wants what' is three chances for one of them to be missed」

但同一注释也承认主回合那条路径**没被覆盖**：

> 「The turn's own request is not built here: it carries tools, streaming and a listener,
> and folding that in would make this a worse version of it.」

**所以 `step.ts:216` 是最容易漏的一处**——它和 `chatRequest.ts:50` 是同一个判断的两份拷贝。

### 6.3 形状（并按实测上调范围）

**先分类，再收敛。** 46 处命中分三类，只对第一类动手：

| 类 | 例 | 处置 |
|---|---|---|
| **① 请求形状分支** | `chatPath`/`chatBody`/响应读取/认证头/`endpointFor` | **收敛进描述表** |
| ② 协议**声明**（数据） | `core/models/catalog.ts` 标注模型属于哪种协议 | **不动**——它是数据，不是分支 |
| ③ **诊断标签** | `registry/provider.ts` 的 `endpointClass` | **不动**（见 §6.4） |

形状本身收敛为**单一描述表**：每种协议在一个模块里声明自己的
路径、请求体构造、响应读取、认证头。调用方**按协议取用**，不再各写分支。

**不要**把主回合折进 `chatRequest`（那会让它变成更差的版本）——
而是让**主回合也从同一张表取**判定结果，消除那份拷贝。

### 6.4 一个容易搞错的点
`provider/registry/provider.ts:115` 的 `endpointClass`（`"default" | "openai-compatible" | "custom" | "unknown"`）
属于 `ProviderDescriptor`（**诊断/就绪度注册表**），**不是**协议选择器
（协议是 `EndpointKind = "openai-compatible" | "anthropic-messages"`）。**不要动它。**

### 6.5 验证
- 现有两种协议的行为**完全不变**（既有测试全绿是主要证据）。
- 新增一个**测试桩协议**（仅在测试中）→ 只需加一个文件即可接入，
  **不改** `step.ts`／`chatRequest.ts`／`chatResponse.ts`／`authorization.ts` 的分支。
  **这个测试就是「一个模块」这句话的证据**。
- **反向验证**：把描述表的某项改错 → 对应协议的行为测试失败。

### 6.6 风险
纯重构，风险在**行为等价**。要求：**任何行为变化都必须能解释**，不能靠测试通过来证明等价。

---

## 7. T6 — 认证 provider 注册收敛

### 7.1 目标
**不加新 provider**。让「加一家 = 加一个声明」这句话**变成真的**。

### 7.2 实测缺陷：**比旧记录严重得多**（本节已按实测更正）

前置研究阶段按「注册点」数出 4 处。写本裁决时**重新按分支点全量统计**，
实测结果是 **54 个分支点，散在 8 个文件**——比 4 严重一个数量级：

| 分支点数 | 文件 |
|---:|---|
| 15 | `core/commands/modelCommandRuntime.ts` |
| 12 | `core/shell/providerCredentials.ts` |
| 7 | `core/shell/providerReadiness.ts` |
| 6 | `provider/request/authorization.ts` |
| 5 | `core/auth/providerAuthRuntime.ts` |
| 4 | `core/commands/connect/preset.ts` |
| 4 | `config/runtimeConfig.ts` |
| 1 | `core/commands/connect/renderer.ts` |

**统计口径**：`provider === "…"`、`connection.provider === "…"`、`authType === "…"`、
`account.type === "…"`、`config.type === "…"` 在 `src/`（排除测试）中的出现次数。

**「注册点」经复核更正为 3 处 OAuth 注册 + 1 处易混淆项**：

| 位置 | 内容 | 属 OAuth 注册？ |
|---|---|---|
| `core/auth/oauth/providers.ts:91-93` | `oauthProviderIds()` 硬编码 `["openai", "google"]` | **是** |
| `provider/request/authorization.ts:105-114` | `oauthConfigFor()` 的 if 链 | **是** |
| `core/auth/providerAuthRuntime.ts:20-22` | `CONTRACTS` 数组 | **是** |
| `entrypoints/cliArgs.ts:21-28` | `VALID_PROVIDERS` | **否——复核更正** |

**复核更正**：`VALID_PROVIDERS` 含 `anthropic`／`antigravity`／`claudecode` 等
**非 OAuth provider**，它是「CLI 可指定的运行时 provider 集合」，**不是 OAuth 注册表**。
把它算进来是**概念混淆**，**本任务不动它**。

**复核另补 3 处真实分支**（前置研究漏）：`authorization.ts:46-47`（凭据类型与 provider 是否匹配）、
`authorization.ts:88-91`（某家特有的账号 id 头）、`providerAuthRuntime.ts:368-375`（凭据包装）。

**但注册点之外还有 50 处行为分支**——例如 `providerCredentials.ts:218-231` 逐家映射环境变量名、
`preset.ts:97-102` 逐家判定「是否 OpenAI 兼容风格」、
`authorization.ts:46-47` 逐家校验凭据类型与 provider 是否匹配。
**加第 3 家要改的远不止 4 处。**

`core/auth/oauth/flow.ts` **是 provider 无关的**（全部走 `config.*`）——
**「加一家是加一个声明」只对 flow 那一层成立**，对上面 4 处注册不成立。

### 7.3 形状（并按实测上调范围）

**原计划**：把 4 个注册点收敛成一张注册表。
**实测后修正**：4 个注册点只是**入口**。真正的问题是 **50 处行为分支各写一遍「这家是什么样」**——
环境变量名、是否兼容风格、凭据类型、标签文案、就绪度判定，全都按家硬编码。

**裁决**：本任务收敛到**「每家一处声明该家的属性」**，把 8 个文件里的逐家分支改为从声明**派生**：
- 声明里带：provider id、环境变量名、凭据类型、是否兼容风格、显示标签、OAuth 配置（若有）。
- 注册点（上述 4 处）从声明表**派生**，不再各自维护清单。
- 行为分支改为**查声明**，不再按 id 硬编码。
- `flow.ts` 不动（它已经是 provider 无关的）。

**范围上限**：**不改任何凭据读写语义**，只改「这些属性从哪里来」。
54 处不可能一次收敛干净——**先收敛 4 个注册点 + 属性明确的那几类分派**，
其余（如 `modelCommandRuntime.ts` 的 15 处，多为命令 UI 分支）如超出预算，**如实记录未收敛的部分**，不假装做完。

### 7.4 验证
- 现有 2 家的行为**完全不变**（既有测试全绿）。
- **反向验证（核心证据）**：从声明表**移除一家** → `oauthProviderIds()`、`CONTRACTS` 解析、
  `VALID_PROVIDERS` 闭包**同时**失去它。这证明它们真的从同一处派生，而非各自维护。
- **新增属性时**：加一个字段到声明 → 各分支**自动**取到，无需逐文件改。
  反向验证：把某家的环境变量名改掉 → `providerCredentials` 的测试应失败（证明它读的是声明）。

### 7.5 明确不做与风险
- **不加第 3 家 provider**：登录成功路径**无法端到端验证**（需真实订阅账号）。
  交付一个跑过的路径比交付一个没跑过的更好。
- **风险**：认证路径属 `AGENTS.md` 说的「provider/auth 核心，需明确任务范围」——
  本任务**只做结构收敛，不改任何凭据读写语义**。任何凭据行为变化都是越界。
- 判定列**仍是部分收口**：家数仍为 2，真实端点验证仍缺（见 §1.2）。

---

## 8. T7 — 内置目录的 `cost` 数据（**复核补纳入**）

### 8.1 为什么它是本阶段的项
它写在 `06-*.md:169` 的**正文**里（对应 `06:60`），而该行的判定列写的是「已收口」——
**原范围枚举只读判定列与行内余量子句，漏了正文**（见 `phase-10-pre-research.md` §0.3）。

### 8.2 实测
- `core/models/catalog.ts:31` 声明了 `readonly cost?: ModelCostRates`。
- **但 `grep -c "cost:" core/models/catalog.ts` → 0**——**没有任何内置模型填它**。
- 于是 `observability/usageTelemetry.ts:95` 的 `USAGE_RATES = { promptPerMTok: 0.14, completionPerMTok: 0.28 }`
  这两个**写死的常量**成了唯一的费率来源（`:107`、`:158` 的 `?? USAGE_RATES` 回退）。

### 8.3 与 T4 的关系（**这是纳入它的真正理由**）
T4 要算「本可命中却未命中多花了多少钱」。**没有真实费率，T4 算出来的金额是错的**——
而 `/cost` 已经在输出时如实标注「estimates at a fixed fallback」。
若 T4 引入一个**看起来精确**的浪费金额、但底层费率仍是那两个常量，
等于把一个**已知的估算**升级成一个**看起来精确的估算**——**比不做更差**。

### 8.4 改动面与风险
| 文件 | 改动 |
|---|---|
| `core/models/catalog.ts` | 给内置模型补 `cost` 数据（输入/输出/缓存读/缓存写 四个费率） |

**风险**：费率是**会变的外部事实**。裁决：
- 只填**有公开定价、且相对稳定**的模型的费率；
- 拿不准的**不填**，让它继续回退到常量，并**保持输出里的免责说明**；
- **不**从网络抓取费率（那是另一个特性，会引入网络依赖与缓存失效问题）。

### 8.5 验证
- 任一填了 `cost` 的模型 → `/cost` 用该模型的费率，**不再**用 `USAGE_RATES`。
- 未填的模型 → 仍回退，输出仍带免责说明。
- **反向验证**：去掉某个模型的 `cost` → `/cost` 对它回退到常量（证明读取链真的生效）。

---

## 9. 裁决（D1／D2／D3／D4）

### 9.1 D1 — `SYSTEM.md` **维持不做**

**旧理由**：「替换会连带删掉 harness 自身的执行规则，是不同的信任决定」。

**复核结论：理由成立，但原理由的表述被削弱了——已按复核意见更正。**

原裁决说「替换会让这些规则**彻底失效**」，隐含「提示词文本是这些规则的保护」。
**复核实测推翻了这一点**：三条规则都有**提示词之外的强制层**。

| 丢失项 | 提示词层丢了 | 但**运行时仍有硬拦截** |
|---|---|---|
| 工具清单（`prompt.ts:66`） | 文字说明 | 工具以**结构化参数**传给 provider（`turn/step.ts:224,247` `tools: request.tools`），模型仍看得到可用工具 |
| PLAN/BUILD 守卫（`prompt.ts:67-69`） | 模式声明 | **硬拦截**：`turn/tools.ts:141` 调 `planModeBlock`（`:224-229`），plan 模式下非只读工具**直接 block**，与提示词无关 |
| 规则 5（拒绝必须遵从）（`prompt.ts:76`） | 行为要求 | 拒绝经 `askPermission`（`turn/tools.ts:237-282`）以**工具返回值**注入模型，并有 `DoomLoopDetector` 限制重复调用 |

**因此更正后的理由**：替换**不会**让权限约束「彻底失效」——运行时门禁仍在。
真正的损失是**提示词层的引导质量**（模型少了模式说明与行为规则，更容易走弯路、更容易反复试错），
而**不是**权限失控。

**这个更正不改变结论**（仍维持不做），但**改变了理由**：不能说「不做是因为会失去安全」，
只能说「不做是因为提示词的引导作用有真实价值，而替换它的收益尚无需求支撑」。

**新事实（旧记录没写）**：参考实现**确实实现了**替换
（`resource-loader.ts:1027-1037`），但用两个前置换安全：
①**系统提示分节**（`system-prompt.ts:120-158` 的 `preamble`/`tools`/`rules`/`docs`）；
②**项目级文件走信任门**（`isProjectTrusted()`；`docs/security.md:40-41` 列为敏感资源）。

**我方两个前置都不具备**：`buildSystemPrompt` 是**扁平字符串数组**，没有「不可覆盖的基底」层；
`ProjectTrustStore` **有**（`core/security/projectTrust.ts:43`），但**没有**参考实现那样的交互式确认流程。

**裁决**：**维持不做**。若将来要做，条件是**分节 + 信任门一起立项**，
**不许只做替换**。测试（`projectInstructions.test.ts:271-285`）继续钉住该名字未被认领。

### 9.2 D2 — 技能发现注记：**仅改文档**

`01-*.md:97` 的注记（2026-09-23）声称三项余量，**实测三项全已过时**：

| 旧注记 | 实测 |
|---|---|
| 无名称/描述校验 | ❌ 过时：`skillLoader.ts:541-577` `inspectSkill` 四条名称规则 + 描述必填 |
| 无 `.gitignore`/`.ignore` 忽略规则 | ❌ 过时：`skillLoader.ts:6` 导入、`:357` 实际过滤 |
| 根目录少于参考实现 | ⚠️ **事实成立，但性质已澄清**：数量差距**客观存在**；缺的根属**包系统／扩展宿主／设置项**，均**在排除项 A 内**。**更正**：原裁决写「不构成缺陷」是**回避**——正确说法是「**差距真实存在，但其成因已被排除项覆盖，故本阶段不修**」 |

**裁决**：**只改文档**（注记改为已更正 + 新增一条更正说明）。代码**无余量**，不占施工预算。
`P10ThemeSkill` 与 `P10Sweep` 两个子代理**独立**得出同一结论。

---


### 9.3 D3 — Session 分享／发布链接（`02:53`）
**不纳入 Phase 10。** 原范围枚举把它归入「扩展宿主族的下游」，**复核指出这个归因不成立**：
它的核心依赖是**会话导出 + 网络发布**，与扩展加载机制无关。

**但它也不属于本阶段的「其余」**：它是一个**独立的功能立项**——
发布到哪个服务、用户如何授权、链接如何失效、内容是否需要脱敏，**都是独立决策**。
**如实记录为「独立立项，本阶段不做」**，而不是假借宿主之名静默排除。

### 9.4 D4 — thinking 档位扩到 7 档（`03:58` 正文余量）
**不纳入。** `03-*.md:223` 正文自述：

> 「**档位数仍为 3**（`low`/`medium`/`high`）——扩到 7 档是**产品决策**，
> 而映射是正确性修复，两者分开处理」

实测：`thinkingCommandRuntime.ts:21` `TIERS = ["low","medium","high"]`。
**「产品决策」不是缺陷修补**，且参考实现的档位语义与我方不同（映射规则不通用）。
**如实记录为未纳入**，理由入档。

---

## 10. 执行顺序与理由

**复核更正**：原表用「依赖」当理由，但**T1–T6 在代码层完全正交**，不存在前后依赖。
下表改为**按风险排序**，并说明每条的真实代价。

| 序 | 任务 | 真实理由（非依赖） | 需要什么才能算完 |
|---|---|---|---|
| 1 | **T2** 崩溃日志 | 最小、零兼容风险——先把「改-验-提交」链跑通 | 2 条用例 + 反向验证 |
| 2 | **T1** session 版本 | **唯一有向后兼容风险**，要尽早暴露意外 | 老/新文件互读各一条 |
| 3 | **T3** 主题热重载 | 新基础设施（watcher），**生命周期必须实机验证** | 实机退出不挂 + 单 watcher |
| 4 | **T4** cache 浪费 | 纯新增纯函数，可独立测试 | 4 条用例（含两条重置） |
| 5 | **T5** 端点收敛 | 重构，需既有测试保护 | 桩协议接入不改分支 |
| 6 | **T6** 认证收敛 | **触及 provider/auth 核心** | 派生关系可证 |
| 7 | **D2** 文档更正 | 与代码无耦合 | 注记更正 |

**为什么不把 T6 放最后就不算「缩短暴露面」**：复核指出——把最敏感、范围最大的重构
压到最后，会**压缩它的测试烘焙时间**，一旦临界发现问题反而阻塞收尾。
**改为**：T6 与 T5 之间**不设顺序约束**，两者都应在**提交前留出独立的验证轮**，
不依赖「排在最后所以安全」这种形式理由。

**T1 前置**：施工前先读 `sessionTranscript.ts` 全文，确认写入路径唯一——
若有第二条写 transcript 的路径，header 会漏写。

## 11. 完成后必须回写的文档

| 文档 | 改什么 |
|---|---|
| `02-*.md` | `02:50` 与 `02:51` 两行的判定列与证据 |
| `06-*.md` | `06:54`（时效上限）、`06:62`（浪费分析） |
| `04-*.md` | `04:61`（热重载） |
| `03-*.md` | `03:49` 与 `03:53`——**写清「结构已收敛、家数仍为 N、余量仍在」**（§1.2）；`03:58` 正文余量补 D4 的「不纳入」理由 |
| `01-*.md` | `01:57` 注记更正（D2）；`01:64` 补 D1 的**更正后**理由（运行时门禁仍在，损失的是引导质量） |
| `02-*.md` | `02:53` 补 D3 的「独立立项，非宿主下游」归因更正 |
| `04-*.md:63` | **已修的行级损坏**需在 `_index.md` §6.6 登记（第三处同类损坏） |
| `_index.md` | §6 台账：本阶段完成的项从「不做／开放」移到「已完成」；§6.6 补记第三处表格损坏 |

## 12. 验证纪律

**反向验证（每项必做，且必须是「去掉改动 → 该用例失败」）**：

| 任务 | 反向验证做什么 | 失败即证明 |
|---|---|---|
| T1 | 去掉 header 识别 → 新格式用例失败（老格式用例应仍过） | 判定有承重 |
| T2 | 去掉 7 天过滤 → 「8 天前不返回」失败 | 过滤生效 |
| T3 | 去掉重绘通知 → 实机画面不变（**这条必须实机，不能靠单测**） | 通知有承重 |
| T4 | **分别**去掉 compaction 重置、去掉 branch_summary 重置 → **各自**用例失败 | 两条重置都真的接线 |
| T5 | 加一个测试桩协议 → **不改**任何既有分支文件即可接入 | 表真的收敛了 |
| T6 | 从声明表移除一家 → 三处 OAuth 注册**同时**失去它 | 派生关系真实存在 |

**复核指出的两个弱点已修正**：
1. 原 T5 反向验证写的是「把描述表某项改错 → 测试失败」——那是**破坏配置的平凡断言**，
   证明不了「消除了 `step.ts` 与 `chatRequest.ts` 的分支复制」。改为**桩协议接入**。
2. 原 T6 写的是「移除一家注册」——那是**正向单点用例**，不是反向验证。
   改为「**三处同时**失去它」，这才证明它们派生于同一处。

- **不许**把「没跑过」写成通过。T6 的真实端点、T5 的新协议**明确记录为未验证**。
- 门禁必须保持：`verify:import-cycles`、`check:config-consumers`、`check:declarations`、
  `verify:docs-drift:strict`（advisory 基线 **78**）。
- 模块函数上限 20（`AGENTS.md` 规则 3）：T4 新逻辑进新模块，不要堆进 `usageTelemetry.ts`。

## 13. 复核记录（2026-09-25，裁决之后）

5 个 `reviewer` 子代理并行复核，**全部返回 `overall_correctness: incorrect`**——
即每一份都找到了实质问题。**全部已复核并采纳**：

| 复核者 | 覆盖面 | 采纳的更正 |
|---|---|---|
| `RvP10Scope` | 范围与计数 | ①`04:63` 行级损坏→总数 101→**102**、已收口 51→**52**；②`02:53` **错误链式排除**→改为独立立项（§9.3）；③正文余量盲区→**补纳入 T7**、记录 D4 |
| `RvP10T1` | T1 设计与兼容 | ①断言③**论据错位**（首行 header 只依赖类型守卫）；②**行号偏移风险**（§2.10）；③**返回签名会破坏 9 处调用方**（§2.11）；④**header 写入职责旁路**（§2.12） |
| `RvP10T5T6` | T5/T6 具象性 | ①T5 漏 2 处响应读取分支→**8 处**；②`VALID_PROVIDERS` **不是 OAuth 注册表**（概念混淆）；③**单一描述表无法承载异构上下文**（见下）；④原验证设计**无法证伪**（§12 已改为桩协议接入） |
| `RvP10Rest` | T2/T3/T4 + 纪律 | ①T2 **与自己的研究矛盾**且删除理由**事实错误**（§3.3 已改为只过滤不删除）；②T3 **漏了重绘通知链**（§4.2）+ 生命周期防护不足（§4.5）；③T4 **漏测 branch_summary** + 在线状态接线空洞→改为**离线纯函数**（§5.6）；④执行顺序**无依赖支撑**、反向验证流于形式（§10／§12） |
| `RvP10D1D2` | D1/D2 | ①D1 **夸大了安全风险**（运行时门禁仍在）；②D1 对参考实现的**分节保护理解有误**（它也跳过 tools/rules）；③D2 第三项「不构成缺陷」的表述是 **dodge**（见下） |

### 13.1 一处**未完全采纳**的复核意见

`RvP10T5T6` 判断「单一描述表在 T5/T6 上**都不是正确形状**」，理由是
T5 的两条调用路径上下文差异大（`step.ts` 需要 tools/streaming/listener 推导，
`chatRequest.ts` 只需简单消息），T6 的 provider 各有专有属性（Google 从凭据取 clientId、
OpenAI 注特定头）。

**这条意见部分成立，但不改变裁决**：
- **成立的部分**：正因为上下文不同，**不能**把 `step.ts` 整条路径塞进 `chatRequest`——
  这是方案里本来就写明的（§6.3「不要把主回合折进 `chatRequest`」）。
- **不成立的部分**：「表」本来就不是要统一**整条请求构造**，而是统一**「协议 → 属性」的映射**
  （路径、body 形状选择器、响应读取器、认证头构造器）。**这些是纯函数，可放进表**；
  各自的上下文（tools/streaming）由**调用方**处理。参考实现正是这么分层的。
- **因此**：方案保留，但**在实施时必须先证明**「表能表达现有两种协议的全部差异」——
  若发现某项差异放不进表，**如实记录并停止**，不硬套。

### 13.2 一处**如实记录但不修**的复核意见

`RvP10D1D2` 与 `RvP10Rest` 都指出：文档与代码脱节是**流程问题**——
判定列写「已收口」而正文还记着余量、注记与所注行的判定自相矛盾。
**这不属于 Phase 10 的施工项**，但**本阶段必须做一件事**：
`01:57` 与 `06:60` 两处都是「行的判定列 ≠ 行的正文/注记」。
**裁决**：施工完成后**逐行核对这两处**，并**在 `_index.md` §6.6 记一条流程性观察**——
「判定列与正文余量必须同源更新」。**不新建设流程工具**（那超出本阶段范围）。

## 14. 本轮未验证（如实记录）

1. **P3 的真实端点登录**：无订阅账号，**登录成功路径未跑过**。T6 只改结构，不改该事实。
2. **P4 的新协议可行性**：未评估 Vertex／Bedrock 的认证与流式语义。**本阶段建议不做**。
3. **参考实现的真实运行**：`pi` 无 `node_modules`，其结论均来自源码与文档。
4. **T3 的跨平台行为**：`node:fs.watch` 在 Linux/macOS/Windows 语义不同，
   本阶段只在当前平台验证。
