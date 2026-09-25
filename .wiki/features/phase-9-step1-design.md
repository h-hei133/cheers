---
title: "Phase 9 施工记录：第 1 步 —— 传输诚实化与写入目标策略"
category: article
sources: [phase-9-decisions, ref-transport-2026-09-25, ref-write-path-2026-09-25]
created: 2026-09-25
tags: [features, phase-9, execution, mcp, security]
summary: "Phase 9 第 1 步施工。两项都是既有缺陷的修补：N1（MCP 非 stdio 传输报告虚假成功）与 S1/N3（/export 与 /report 的写入路径无围栏）。参考实现研究给出明确结论：所有被查项目在遇到未实现的传输时都抛错或返回类型化失败，无一返回成功桩；用户键入的导出命令在各参考项目中同样无围栏，但模型工具写入一律有围栏与升级——故本轮按「命令由人键入」这一前提采用工作区外需显式确认的策略。"
confidence: high
---

# Phase 9 第 1 步施工

> **本步修的是既有缺陷，不是新功能。** 两项都属于「报告与事实不符」：
> 一个说成功而没做，一个能写到工作区外。
> **参考研究先行**（两个只读子代理），结论见 §1、§3，实现按结论落地。

## 1. N1：MCP 非 stdio 传输报告虚假成功

### 1.1 缺陷全貌（实测）

不止一处。`core/mcp/client.ts` 有**两条**说假话的路径：

| 位置 | 行为 |
|---|---|
| `:117-121` `invokeTool` | 非 `stdio` 分支**直接 return** `{content: "MCP tool X executed successfully on server Y"}`，**无任何调用** |
| `:49-56` `connect` | `http`/`ws` 且给了 `url` 时，落到 `:54-56` 返回 **`{type:'connected'}`**——即**未实现的传输被报告为已连接** |

**放大链路**（这才是危害所在）：
`:54` 的 `connected` → `gateway.ts:58-62` `describeMcpConnectionState` 判 `executable: true`
→ `mcpControlCliSurface.ts:71-73` 打印 **`transport=http ... executable=yes`**。
即用户看到「已连接、可执行」，模型调用后收到「执行成功」，而**整条链上什么都没发生**。

**实测复现**（临时测试，未入库）：
```
new CoreMcpClient("remote", {transport:"http", url:"https://mcp.example.test"})
  .invokeTool("do_thing", {a:1})
→ {"content":"MCP tool do_thing executed successfully on server remote"}
```

违反 `AGENTS.md:25`：「Do not hide unverified write outcomes behind success-like terminal or session states.」

### 1.2 参考实现的处置（子代理实测，五家全查）

| 项目 | 声明了哪些传输 | 未实现分支的行为 |
|---|---|---|
| source-claudecode | `stdio/sse/sse-ide/http/ws/sdk`（6 种，`types.ts:20-23`） | `sdk` **抛错**：`throw new Error('SDK servers should be handled in print.ts')`（`client.ts:859-860`）；未知类型 `throw new Error('Unsupported server type: ...')`（`:958-960`） |
| opencode | `local`/`remote`（判别联合） | 失败即返回类型化状态 `{status:'failed', error}`（`mcp/index.ts:246-251`） |
| gemini-cli | `stdio/sse/http` | 配置不匹配任何模式即**抛错**（`mcp-client.ts:2413-2415`） |
| codex | stdio + Streamable HTTP | 不支持的重定向策略抛 `UnsupportedRedirectPolicy`（`oauth_http_client.rs:43-44`） |
| pi | **不实现 MCP** | 文档明示改用进程内扩展（`docs/extensions.md:1-25`） |

**结论（子代理原话）**：「**no reference ever returns a success-shaped value or fake completion for an unimplemented transport**」——
五家里**零**个返回成功桩。三种处置形态：①抛错；②抛错后由外层捕获转成类型化失败状态；③失败即类型化状态。
source-claudecode 的 `MCPServerConnection` 判别联合（`types.ts:221-227`：
`connected | failed | needs-auth | pending | disabled`）**与我方 `McpConnectionState`（`types.ts:40-45`）形状一致**——
即我方已有的类型足够表达，**不需要新类型**。

### 1.3 决定

| # | 决定 | 依据 |
|---|---|---|
| D1 | **`invokeTool` 非 stdio 分支改为抛分类错误**，class 用**既有** `config`（→ plane `user-config`） | 「配了一个未实现的传输」本质是用户配置问题。参考实现的 `Unsupported server type` 亦归此类。**不新增 failure class**——现有 11 个类已覆盖 |
| D2 | **`connect` 对非 stdio 返回 `{type:'failed', error}`**，而非 `connected` | 与 opencode 的 `status:'failed'`、source-claudecode 的 `FailedMCPServer` 同形；且我方 `failed` 分支已被 `describeMcpConnectionState` 正确映射为 `executable:false` + 理由 + 下一步 |
| D3 | **保留 `McpTransport` 类型成员**，不删 `http`/`ws`/`sdk` | 删掉会让配置文件里写了 `http` 的用户得到「未知传输」而非「未实现」——前者不告诉他该改什么。保留 + 明确失败 = 可诊断。这也正是 source-claudecode 保留 `sdk` 成员却抛错的做法 |
| D4 | **`connect` 的校验前置**：先判传输是否受支持，再判 url/command 是否缺失 | 让「传输未实现」优先于「字段缺失」——后者在传输本就不存在时是无意义的次要信息 |

**不做**：不实现 http/ws 传输（那是新功能，属「扩展路径 2」的收尾范围，且当前无需求证据）。

## 2. 文件与改动面（N1）

| 文件 | 改动 |
|---|---|
| `src/core/mcp/client.ts` | `connect` 增加受支持传输判定；`invokeTool` 非 stdio 分支抛 `McpClassifiedError` |
| `src/core/mcp/errorTaxonomy.ts` | **不改**（复用 `config`） |
| `src/core/mcp/types.ts` | **不改**（`failed` 状态已存在） |
| `src/core/mcp/gateway.test.ts` | 补测试：非 stdio `connect` → `failed`；`invokeTool` → 抛分类错误 |

## 3. S1 / N3：写入目标策略

### 3.1 缺陷全貌

| 命令 | 位置 | 行为 |
|---|---|---|
| `/export` | `exportCommandRuntime.ts:107` `path.resolve(root, requested)`；`:59-61` `mkdirSync(recursive)` + `writeFileSync` | 无围栏 |
| `/report` | `reportCommandRuntime.ts:93-94` 同形 | 无围栏 |

两处都**不 import** `verifyPathContainment`（`core/security/pathJail.ts:15`），
而 `core/tools/registry.ts:315,432,528` 的 read/write/edit **都调它**。

### 3.2 参考实现的处置（子代理实测，六家全查）

**关键发现：参考项目同样不对用户键入的导出命令加围栏，但对模型工具写入一律加。**

| 项目 | 用户键入的导出命令 | 模型工具写入 |
|---|---|---|
| pi | `/export` → `resolvePath(outputPath, process.cwd())`，**无校验**（`session-export.ts:36-39`） | — |
| gemini-cli | `/export-session` → `path.resolve(process.cwd(), args)`，**无校验**（`exportSessionCommand.ts:70`） | **拒绝**工作区外写入（`config.ts:3379-3440`） |
| source-claudecode | `/export` → `join(getCwd(), filename)`，**无校验**（`export.tsx:59`） | 工作区外需 allowlist 或**升级为 ask**（`pathValidation.ts:210-230`） |
| opencode | 导出走**浏览器下载**，不碰服务端路径 | 工作区外**弹确认**（`external-directory.ts:20-44`） |

**统计（4 个有 CLI 导出命令的项目）**：无限制 3（pi / gemini-cli / source-claudecode）／浏览器托管 1（opencode）／
**仅限工作区 0**。即「仅限工作区」**没有任何参考先例**。

**但这不等于我方应该照抄「无限制」**，理由有二：
1. 参考项目的模型工具写入**都有**围栏与升级，说明「写入目标需要把关」是这些项目的共识——只是它们把「人键入」当作已授权。
2. 我方 `AGENTS.md` 有一条比参考项目更严的明文要求：
   「Do not hide unverified write outcomes behind success-like terminal or session states」，
   且把「**权限待定 / 拒绝 / 阻断 / 已批准写入 / 写入成功**」列为必须**区分**的状态。
   一个能静默覆盖工作区外文件、且用户只看到「导出成功」的路径，正是这条规则针对的形态。

### 3.3 决定

**采用「工作区默认 + 工作区外需显式确认」**，形态取自 opencode 的 `external-directory` 升级与
source-claudecode 的 `ask` 升级，但**适配我方已有的权限层**，不新造一套。

| # | 决定 | 依据 |
|---|---|---|
| D5 | **默认写入落在工作区内**；未给路径时按既有规则生成于工作区 | 与所有参考项目一致（默认都在 cwd） |
| D6 | **相对路径逃出工作区 = 拒绝** | 这条**无争议**：`../` 逃逸是打错，不是意图。三个参考项目的「无限制」是**有意**允许绝对路径，不是允许拼错 |
| D7 | **显式绝对路径（工作区外）= 需确认**，而非直接拒绝 | 导出到 `~/Desktop` 是**合理用法**（§3.2 的统计说明直接拒绝无先例）；确认把「有意」与「打错」区分开，正合 `AGENTS.md` 的状态区分要求 |
| D8 | **策略落在单一模块**，`/export` 与 `/report` 共用 | N3 表明这是**两个**命令的同一缺陷。两处各写一份 = 下一处又会漏。与 `core/network/policy.ts` 的既有做法一致（单一判定而非各调用点自查） |
| D9 | **确认机制复用既有升级通道**，不新造交互 | 我方已有 `sandbox/escalationWorkflow`（**注意：实测该类仅测试使用**）与 `cli/approval/`。需先查明可复用的真实通道再定形态 |

**D9 已定案**：`escalationWorkflow` 类经实测**无生产调用者**（`grep "new EscalationWorkflow"` 仅测试），
不能复用；`CommandContext` 也**没有**交互提问通道（命令是一次性的）。查得**本仓既有的同类先例**：
`restoreCommandRuntime.ts:77-79` 的 `requireExplicitExecute` —— 风险操作要求用户**显式传参**
（`--confirm execute`）而非弹窗。故采用同一形态：**`--outside` 旗标**。
这与参考项目把「用户键入」视为已授权的做法一致，且把「有意」与「打错」分开。

### 3.4 文件（S1/N3）

| 文件 | 改动 |
|---|---|
| `src/core/security/writeTarget.ts`（新） | 单一判定：给定 `requested`、`root`，返回 `{allowed, resolvedPath, reason, requiresConfirmation}` |
| `src/core/commands/exportCommandRuntime.ts` | 改用该判定 |
| `src/core/commands/reportCommandRuntime.ts` | 同上 |
| 两处测试 | 补「相对路径逃逸被拒」「工作区外绝对路径需确认」用例 |

**命名理由**：`writeTarget` 说的是它判断的对象（写入目标），不堆砌名词；
与 `core/security/` 下既有的 `pathJail`、`projectTrust`、`redaction` 同一层级与命名风格。

## 3.5 实现结果（2026-09-25）

### N1 已修（`core/mcp/client.ts`）

| 改动 | 结果 |
|---|---|
| 新增 `SUPPORTED_TRANSPORTS = {stdio}` 与 `isSupportedTransport` | 单一判定，`connect` 与 `invokeTool` 共用 |
| `connect` 增加受支持判定，**置于字段校验之前** | 「传输不存在」优先于「字段缺失」——后者在传输本就不存在时是次要信息 |
| `invokeTool` 非 stdio 分支改为**抛 `McpClassifiedError`**（class `config`） | 不再是成功桩 |
| 未新增 failure class | 既有 11 类中 `config` → plane `user-config` 已覆盖 |

**实机（构建产物）**：
```
connect state   = failed
error           = MCP server 'remote' is configured with transport 'http', which this build does not implement (supported: stdio)
executable      = false
invokeTool      = THREW config / user-config
```

**两处既有测试改判**：`gateway.test.ts` 原有两个用例用 `transport: "sdk"` + `mockTools` 作为
**测试载体**，断言 `type: "connected"`——即**它们钉住的是这个缺陷本身**。已改为：
①一个用 `http` 断言 `failed` + `executable:false` + 无工具；②一个改用**真实 stdio mock 服务器**
（`fixtures/mockMcpServer.mjs`）继续测 refresh 路由。**不是「改测试以迁就代码」**：
旧断言的对象（假连接）已不存在，且原测试的**意图**（聚合、refresh 路由）都被保留。

### S1/N3 已修（`core/security/writeTarget.ts` + 两个命令）

| 决定 | 落地 |
|---|---|
| D5 默认落在工作区内 | `/export` 无参数时走 `resolveDefaultTarget`（**不经策略**——命令自己选的名字不可能是笔误）；`/report` 默认仍在用户数据目录 |
| D6 相对路径逃逸 = 拒绝 | 在 `defaultOutside` 与 `allowOutside` 判定**之前**，故**旗标无法授权一次相对逃逸** |
| D7 工作区外绝对路径 = 需 `--outside` | 见 §3.5 表格 |
| D8 单一模块 | `writeTarget.ts`，两命令共用 |
| D9 显式旗标 | 照 `restoreCommandRuntime` 的 `--confirm` 先例 |

**实现中发现的额外问题**：`/report` 的**默认目标本就在工作区外**（`~/.cheers/report-*.zip`）。
若一律要求 `--outside`，会把它的**常规用法**判为需要确认。故引入 `defaultOutside`：
**命令自己声明的默认域在外部**时，绝对外部路径无需旗标——但**相对逃逸仍然拒绝**。
即「这条规则对两个命令的含义不同」被显式建模，而不是让两个命令各自绕过。

**实机（构建产物）**：
```
in workspace           -> ALLOW /home/user/project/out/a.md
relative climb         -> REFUSE
relative climb+flag    -> REFUSE      <- 旗标不能授权相对逃逸
abs outside            -> REFUSE
abs outside + flag     -> ALLOW /tmp/a.md
abs + defaultOutside   -> ALLOW /tmp/a.md
empty                  -> REFUSE      <- 空串解析成 root 本身，会覆盖项目目录
```

**反向验证**：删掉 N1 的抛错 → 2 项失败；把 `/export` 的判定换回裸 `path.resolve` → 2 项失败。
**未改**：`/report` 的 `defaultOutside` 若去掉 → **1 项失败**（实测，非估计）——证明该分支被真实需要，而不是防御性冗余。

## 4. 验证方式

| 项 | 验证 |
|---|---|
| N1 | 临时测试证明修复前返回假成功（已做）；修复后同一调用抛分类错误；`connect` 返回 `failed` |
| N1 用户可见 | `/mcp` 输出对 `http` 服务器显示 `executable=no` + 理由（而非 `yes`） |
| S1/N3 | 反向验证：删判定行 → 逃逸用例失败 |
| 全量 | `npm run test:ts`、四项门禁 |

## 5. 本步不做（如实记录）

- 不实现 `http`/`ws`/`sdk` 传输（属扩展路径 2 收尾，无需求证据）。
- 不处理 MCP `resources`/`prompts` 的 mock（属第 6 步 N2）。
- 不删 `mockTools`/`mockResources`/`mockPrompts` 字段（实测**仅测试使用**，是测试夹具泄进生产类型；
  是否清理与第 6 步一并决定，避免本步范围外扩）。
