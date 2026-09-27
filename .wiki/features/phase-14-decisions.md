---
title: "Phase 14 裁决：缺陷修复与死代码处置的施工方案"
category: article
sources: [phase-14-pre-research-2026-09-27, check-call-reachability-2026-09-27]
created: 2026-09-27
updated: 2026-09-27
tags: [features, phase-14, decisions, audit]
summary: "对 phase-14-pre-research.md 的 6 类缺陷、10 项 SUBSTANTIAL 与 65 个零调用模块给出施工裁决。分 6 步，按「静默错误 → 响亮失败 → 能力补齐」排序。含 3 个须维护者拍板的裁决点（§5）。每项任务附验收标准与证伪方式。"
confidence: high
---

# Phase 14 裁决

**依据**：`.wiki/features/phase-14-pre-research.md`（6 scout + 2 reviewer 复核，含对主代理 4 处更正）。

**本阶段目标**（维护者原话）：
> 「将所有只是做了一小块功能的 demo 代码找出来，然后将它对照着 pi 项目升级为企业级生产代码。」

**审计结论已说明**：不存在「大量 demo」。真正待升级的是 §1 的 6 类缺陷与 §2 的 10 项未完备。
**本阶段按「把它们做成生产级」执行，不重写已核实为生产级的部分。**

---

## 1. 施工原则

1. **不重写已核实为生产级的模块**（pre-research §1.1 的 15 项）——重写会破坏已验证实现。
2. **接线优先于新建**：D1/D2/D4 的共同形态是「实现存在但没接上」。
   **先接已有的，再接新写的**。凡有可复用件（如 SSRF 守卫），优先复用。
3. **每项必须先写「失败复现」再改**——即先证明当前行为是错的（或缺失的），
   再改，再证明通过。**这是本仓库既有纪律**（`phase-13` 复核轮的 revert-prove 方法）。
4. **零新增运行时依赖**（当前 6 个）。
5. **删除按连通分量整簇**（`plan.md` §2.2），不按单文件。

---

## 1bis. 施工进度（**滚动更新**）

| 步 | 任务 | 状态 | 提交 |
|---|---|---|---|
| **步 1** | T1a 守卫提取到 `core/security/egressGuard.ts` | ✅ | `a86edb25` |
| | T1b 扩充守卫（IPv6 范围 / IPv4-mapped / CGNAT / `0.0.0.0` / 裸主机名） | ✅ | `a86edb25` |
| | T1c `webFetch` 接入守卫（**仅 webFetch**——`webSearch` 复核确认无 SSRF 面） | ✅ | `a86edb25` |
| | T2 流式读取 + 字节上限（`response.text()` → 流 + 5MB 上限） | ✅ | `a86edb25` |
| | T3 重定向逐跳校验 + 跳数上限 | ✅ | `a86edb25` |
| | T4 沙箱 `failClosed`（含**三条调用路径**：工具前台、后台、hook） | ✅ | 见下 |
| **步 2** | T5–T8 | ⏳ 进行中 | |
| **步 3–6** | | ⏳ 待做 | |

**步 1 的两处实测修正**（记录备查）：

1. **`webSearch` 不在 SSRF 范围内**。初稿把它和 `webFetch` 并列。实测：它只向
   **三个硬编码主机**发请求，用户输入只作查询串——**没有可被选择的地址**。
   所以 T1c 只做 `webFetch`；加 `webSearch` 会是「什么都保护不了的一行代码」。
2. **T3 的重定向是真实攻击面**，不是理论问题。原生 `fetch` 默认**内部**跟随重定向，
   于是守卫只看得到**第一个** URL——而第一个 URL 恰恰是攻击者不需要控制的那个。

**并修掉一个自己的测试缺陷**：T4 的第一版测试写成
「若本机有 launcher 则提前返回」，而**本机恰好装了 `bwrap`**，
于是它**通过**——**在把修复删掉之后也通过**。即它什么都没验证。
修法：把决策抽成纯函数 `planWithoutLauncher(rules)`，与「查找 launcher」分离，
使该分支在任何机器上都可测。**修后撤销验证：2 项失败。**

---

## 2. 六步施工方案

### 步 1：安全（D4 + D5）

| # | 任务 | 参考 | 验收 |
|---|---|---|---|
| **T1a** | **把守卫从 `browser/` 提出**到中立位置（`core/security/`），供两侧共用 | `browser/networkAllowlist.ts:239` - 该模块依赖 browser 类型，从 `core/tools` 反向导入会把依赖方向倒过来 | `browser/` 与 `core/tools/` 都能导入；`verify:import-cycles` 仍 pass |
| **T1b** | **扩充守卫**：补 IPv6 链路本地（`fe80::/10`）、`fd00:ec2::254`、CGNAT（`100.64.0.0/10`）、`0.0.0.0` | 该守卫注释**自述**这些是**有意未覆盖**的，并警告调用方不要单独依赖它 | 各地址被拒；**先证明现在不拒** |
| **T1c** | `webFetch` 接入扩充后的守卫（**仅 webFetch**——复核确认 `webSearch` 只向三个硬编码主机发请求，用户输入只作查询串，**无 SSRF 面**） | — | 私网/元数据地址被拒；**先证明现在不拒** |
| **T2** | `webFetch` 改**流式**读取并设字节上限 | pi 无此工具，按 Node `stream` 惯例 | 大响不整读进内存；测试用一个 20MB 响应断言内存上限生效 |
| **T3** | `webFetch` 重定向跳数上限 + 每跳重新校验地址 | — | 重定向到私网被拒；跳数超限报错而非静默跟随 |
| **T4** | 沙箱 `fail-closed` 选项 | `SandboxRules` 在 `sandbox/osSandbox.ts`——**不在 `config/runtimeConfig.ts`**，故 `check:config-consumers` 不适用 | 开启后 launcher 缺失时**拒绝执行**；**须同步 `osSandbox.test.ts` 的既有断言与 `tighten()` 合并语义** |

**为何排第一**：这些是**安全缺口**。

**注意 T1 被拆成三项**：审计初稿写「守卫已存在，复用成本近零」，**这个判断被复核推翻**——
守卫的注释自述它**有意不覆盖 IPv6 元数据与 CGNAT**，并写明
「不该单独依赖它」。所以正确做法是**先提取、再补全、最后接入**，
而不是「接上就完事」——否则修完仍留半个防线。
`log.md` 记的 Phase 11 排序原则：静默错误 → 响亮失败 → 能力补齐。

**裁决点 Q1**（见 §5）：`T4` 的默认值时 fail-open 还是 fail-closed。

---

### 步 2：接线（D2 + D1）

| # | 任务 | 参考 | 验收 |
|---|---|---|---|
| **T5** | 注册记忆工具给模型（`memory_retain` / `memory_recall`） | 复用既有 `memoryTools.ts` 四个**执行函数**；但**必须新建 `createMemoryToolDefinition` 工厂**——`memoryTools.ts` 没有 `ToolDefinition` 契约的工厂，而 `check:declarations` 要求 `core/tools/` 下每个 `create*ToolDefinition` 都被 registry 调用 | 实机：模型可自主写入并从下一轮读回；**先证明现在无此工具** |
| **T6** | 修通被动注入的接线（构造 `projectMemoryInjectionStateStore`） | 复用既有 `buildPromptWithFutureTurnInjections` | 实机：写入的记忆出现在下一轮 prompt |
| **T7** | `lsp` 的 `documentSymbol`/`definition`/`references`/`workspaceSymbol` 改用既有 AST 解析器 | `context/graph/ast/parser.ts` `parseSourceSymbols`（返回真实 span/kind/imports） | 断言 `documentSymbol` 返回**真实声明行/列**（非正则猜测）；大文件不再整读。**注意**：跨文件 `definition` 仍是**同名声明搜索**——见下方约束 |
| **T8** | 给 `lsp` 补测试文件（当前 **0 测试**） | — | 五个操作各有行为断言 |

**为何合并 T5+T6**：D2 的两半（写、读）是同一能力的两个方向，
只做一半等于记忆仍然无用。**维护者要求「不要老是做 demo 模块」。**

**T7 的真实边界（复核确认，必须写进验收标准）**：
`parseSourceSymbols` 基于 `ts.createSourceFile`——**单文件语法树，无 `TypeChecker`**，
因此**做不到真正的跨文件符号绑定**。所以：
- `documentSymbol`（单文件）：可做到**精确**（真实 span）；
- `definition` / `references`（跨文件）：只能做到**按名字的声明搜索**，
  比现在的正则好（认得出 `export const`、生成器、类型别名），但**不是语义解析**。

**验收标准据此收紧**：断言 `documentSymbol` 的行列**等于 AST 给出的行列**；
`definition` 的验收改为「**命中所有同名声明**」而非「精确唯一的定义」。
**不得**在文档或工具描述里声称它做类型解析——工具描述已诚实写明
「This is a symbol scanner, not a language server」。

**为什么 `lsp` 不引入真语言服务器**：
- 我方运行时规则 `ts-no-dynamic-import` 禁止动态导入，LSP 客户端需要它；
- `typescript` 已是运行时依赖，**编译器 API 就在库里**，
  而 `hover` 分支**已经在用它**——所以这是**接线问题**，不是能力问题。
- **不新增依赖**（约束 4）。

**裁决点 Q2**（见 §5）：`lsp` 是否顺带补 `rename` 或位置式查询（`line`/`character`）。
**注**：`hover` 已经是 AST 实现，不需改。

---

### 步 3：协议完备（D3 + S4/S5/S6）

| # | 任务 | 参考 | 验收 |
|---|---|---|---|
| **T9** | Copilot 网关请求头 | pi `api/github-copilot-headers.ts` | 断言请求含 `Editor-Version`/`Copilot-Integration-Id`/`User-Agent`；**先证明现在不含** |
| **T10** | Bedrock Throttling 与 context-overflow **分开**分类 | pi `bedrock-converse-stream.ts` | 节流**不再**触发强制压缩；各一条测试 |
| **T11** | Google 适配器级 408/409/429 重试 | pi `retryGoogleRequest` | 适配器层重试；断言不落到回合层 |
| **T12** | 流中途断线的续读/重试 | pi 各 client 的两阶段重试 | 流中断**不再**直接冒泡为终态；测试注入中途断流 |

**裁决点 Q3**（见 §5）：T12 的范围（仅重试 vs 断点续读）。

---

### 步 4：零调用模块的逐簇处置（**59 文件 / 11,890 行**）

**这一块最大，必须逐簇裁决**，按 `plan.md` §2.2 的六项检查。

> **数字经三轮修正**（66 → 65 → **59**）。**每轮都是因为检测器看不见某样东西**：
> 漏读 `.tsx`、漏读三字母名（`TUI`）、漏读 `export const` 单例。
> **所以门禁输出只是线索，不是授权**——已剔除的 6 个假阳性
> （含**被 CLI 实际使用**的终端类）见 pre-research §3.4。

### ⚠️ 复核推翻了三处「整簇删除」

复核（`ReviewPlanB`）逐条追引用，找到 4 处「**函数零调用，但被活模块以值或类型引用**」的模块。
**主代理逐条实测确认全部成立**。这正是 `plan.md` §2.2 警告的
「看着像死代码、其实是编译契约」——**它不是特例，是一类**：

| 模块 | 被谁引用 | 证据 | 处置 |
|---|---|---|---|
| `core/context/model/contextContinuityManifest.ts` | `contextStateProjection.ts:2,428`、`context/compact/continuity/routeContinuityHandoff.ts:10,237` —— **值导入** | `CONTEXT_CONTINUITY_MANIFEST` 被装进 handoff 证据链 | **保留**。要删须先搬走该常量 |
| `provider/proposal/providerEditContext.ts` | `repair/verificationRepairContext.ts:9,187` —— **值调用** | `redactProviderEditText` 脱敏函数 | **保留该函数**；同目录其余文件可评估 |
| `sandbox/escalationWorkflow.ts` | **21 个生产文件**引 `EscalationPrompt`/`EscalationResponse`（`entrypoints/cliApprovalModule.ts:5`、`approvalPromptBridge.ts:11` …） | 类型是**全系统审批流契约** | **保留类型**；实现可评估。删前须迁契约 |
| `tools/result/split.ts` + `tools/policy/interception.ts` | `tools/types.ts:6` 导入 `ToolResultDetails`/`ToolReportSafeProjection` | 核心工具层类型 | **保留类型**；先迁契约 |

### 分组与初判（**已按上述修正**）

| 组 | 文件 | 初判 |
|---|---:|---|
| `planning/` 规划状态机 | 16 | **删**——Agent 主循环从不经过；无参考实现有等价物。**仍需过准入 7/8** |
| `provider/proposal/` + `edit/proposal/` | 16 | **部分删**——`providerEditContext.ts` **必须保留**（值被引用）；其余逐个核 |
| `context/graph/` + `acquisition/code/` | 7 | **删**——除 `ast/parser.ts`（**步 2 要用，保留**） |
| `tools/policy/interception.ts` + `result/split.ts` + `tools/types.ts` | 3 | **先迁类型契约**再评估；`tools/types.ts` 是核心，大概率保留 |
| `sandbox/{auditTrail,escalationWorkflow,sandboxEnforcer}.ts` | 3 | **先迁 `Escalation*` 类型**（21 个消费者），再评估实现 |
| `core/context/model/*` | 2 | **`contextContinuityManifest` 保留**；`contextLayerModel` 有类型消费者，先核 |
| `core/query/runtime/{proof,actionAuthority,batch}.ts` | 3 | 逐簇核实（需过准入 7/8） |
| 其余 | ~12 | 逐簇核实 |

**准入检查（每簇必过）**：

1. `grep` 确认零生产调用点（用 `check:call-reachability` 输出 + 手工复核）；
2. 确认**不是编译契约**（类型被活文件引用）；
3. 确认**不是公开 API 面**（见 §5 Q4）；
4. 确认**不是侧效应注册**；
5. 确认对应的**测试**一并处置（删或改，按 `dead-code-tiers` §4 的原则：
   断言落在死模块上 → 删；拿活模块当夹具 → 改）；
6. 删除后 `tsc` + 全量套件 + 门禁全绿；
7. **生产值引用检查**——`grep` 该模块每个导出名，确认无活模块**以值导入并使用**。
   **仅「函数零调用」不足以授权删除**（本轮 4 例中的 2 例即死于此）；
8. **类型契约检查**——确认其类型**不被活模块引用**；若被引用，
   **先把类型迁到中立位置**（或保留该文件）**再**评估删除。

> **第 7、8 条是复核要求，已采纳。** 它们把 `plan.md` §2.2 的六项检查具体化，
> 并把 `_index.md` §13.10 尾注（`interception.ts` 类型被引用）从特例推广为**通用准入**。

**步 4 完成后**：把 `check:call-reachability` 从 **advisory 改为阻断**
（见 pre-research §6 尾注）——届时 59 项应全部归零，门禁变绿才有意义。

---

### 步 5：观测与配置（D6 + S7/S8）

| # | 任务 | 验收 |
|---|---|---|
| **T13** | 全局缓存命中率（`/cost` 呈现） | 断言数值来源与 `usageTelemetry` 一致 |
| **T14** | 事件流补 `turnId`/`toolCallId` 关联 | 外部消费者可把事件配回请求；断言 id 稳定 |
| **T15** | transcript 每行记 `parentId` | 单靠 `transcript.jsonl` 可重建分支拓扑；断言旧文件兼容（版本 0） |
| **T16** | 配置多进程写保护 | 并发写不互相覆盖；**先证明现在会覆盖** |

**T16 已确认可行（复核实测）**：Node 20 标准库下用**原子锁文件**
（`fs.open` + `wx` 标志）或**临时文件 + 原子 rename** 即可，**无需新增依赖**。
故 T16 **纳入本轮**，不再是「视情况」。

---

### 步 6：收尾

- 全量套件 + **八道门禁**（新增 `check:call-reachability`）；
- `check:call-reachability` 改阻断；
- 同步 `plan.md` §1 计数表、`.wiki/log.md`、`_index.md`。

---

## 3. 明确**不做**（并保留理由）

| 项 | 理由 |
|---|---|
| 扩展宿主 / 插件执行 | `phase-9-decisions.md` §1.2 已裁：进程边界与同步渲染不兼容，**架构约束非偏好** |
| RPC / SDK / CBOR 协议族 | 用户面为零时发出是 premature commitment（`_index.md` §6.2）；本轮**不因规模悬殊而改裁** |
| 通用 Flex 组件树重写（S9 的彻底路径） | 现方案满足交互；重写破坏既有结构 |
| 重写编辑引擎 / 压缩 / OS 沙箱 | pre-research §1.1 已证为生产级 |
| 子代理后台异步调度（S2 的完整形态） | **本轮只做登记**——需要把 `await runSubagent` 改成任务句柄，**牵动 turn/tool 契约**，属独立立项 |

---

## 4. 与维护者原话的对应

| 维护者要求 | 本方案如何满足 |
|---|---|
| 「找出 demo 代码」 | pre-research §2（6 类）+ §3（65 文件） |
| 「对照 pi 升级为企业级」 | 每项任务附 pi 参考位置（§2 各表的「参考」列） |
| 「自行分步」 | 6 步，按缺陷类别而非文件顺序 |
| 「派遣子代理探索细节」 | 已用 6 scout + 2 reviewer；施工中按需再派 |
| 「不要造重复功能，破坏原有结构」 | 原则 1 + 原则 2（接线优先于新建） |

---

## 4bis. 本方案经 2 个复核者证伪（**主代理被更正 9 处**）

施工方案不是一次写成的。**2 个独立复核者**逐条追引用后，主代理**实测确认并采纳**以下更正：

| # | 复核指出 | 主代理实测 | 落在哪一节 |
|---|---|---|---|
| 1 | **`presentation/tui/terminal.ts` 是活代码**——被 `interactiveMode.ts:20,169` 用作 CLI 终端 | **成立**。根因：门禁只查 `export function`/`class`，**漏 `export const` 单例**（`export const processTerminal = new Terminal()`）。**已修门禁 + 加回归测试** | pre-research §3.4 |
| 2 | **`contextContinuityManifest` 有生产值引用** | **成立**（`routeContinuityHandoff.ts:10,237`） | 步 4 |
| 3 | **`providerEditContext.redactProviderEditText` 被活模块值调用** | **成立**（`repair/verificationRepairContext.ts:9,187`） | 步 4 |
| 4 | **`escalationWorkflow` 的类型被 21 个生产文件引用** | **成立**（`cliApprovalModule.ts:5` 等） | 步 4 |
| 5 | **`tools/result/split.ts` 被 `tools/types.ts` 依赖** | **成立**（`types.ts:6`） | 步 4 |
| 6 | **`parseSourceSymbols` 是单文件语法树，无 `TypeChecker`**，做不了跨文件 `definition` | **成立**（`ts.createSourceFile`，无 `createProgram`）。**T7 验收标准已收紧** | 步 2 |
| 7 | **`SandboxRules` 在 `osSandbox.ts`，不受 `check:config-consumers` 管** | **成立**。T4 的验收说明已改 | 步 1 |
| 8 | **`memoryTools.ts` 没有 `ToolDefinition` 工厂**，`check:declarations` 会拦 | **成立**。T5 已补「必须新建工厂」 | 步 2 |
| 9 | **T16 在零依赖下可行**（原子锁文件 / 临时文件 rename） | **成立**。T16 由「视情况」改为**纳入** | 步 5 |

**这一节保留的意义**：方案里最容易错的就是「删什么」与「能不能验证」。
**9 处更正里，5 处是「准备删的东西其实是活的」**——
即如果没有这轮复核，步 4 会直接破坏生产代码。**这就是为什么复核不是形式。**

---

## 5. 须维护者拍板的 4 个裁决点

> 这几项**不该由我单方面决定**：或涉及破坏性删除、或涉及安全默认值。

| # | 问题 | 选项 | 我的建议 |
|---|---|---|---|
| **Q1** | 沙箱 `fail-closed` 的**默认值** | (a) 默认 fail-open（现状），用户可开启 fail-closed<br>(b) 默认 fail-closed，用户可退回 | **(a)**——默认拒绝会让没装 `bwrap` 的环境**完全不能用**；而现状**每次都提示**，风险可见。变更默认值属于行为破坏 |
| **Q2** | `lsp` 的范围 | (a) 只修既有 5 个操作用 AST<br>(b) 另补位置式查询（`line`/`character`） | **(a)**——`phase-11` 刚把死参数 `line`/`character` **删掉**（D13），补回来需要先证明确有需求 |
| **Q3** | T12 流中断的处理 | (a) 仅重试（重新发请求）<br>(b) 断点续读（需要协议支持） | **(a)**——OpenAI 兼容流不带可续读的游标；**(b) 在多数 provider 上不可实现** |
| **Q4** | `index.ts` 公开 API 面（pre-research §3.7） | (a) 删除（它是无消费者的承诺面，根包 `private: true`）<br>(b) 保留并明确为受维护的公开 API<br>(c) 保留但标注为不保证兼容 | **(c)**——删掉会失去「未来可做 SDK」的锚点；但**当前无消费者是事实**，不应伪装成已承诺的 API |

**另外两项需知会（不需选择，但如果反对请说）**：

- **步 4 会删除约 12,800 行**。这是**破坏性操作**，全部可 revert（有完整 git 历史）。
  **逐簇核实后单独提交**，便于逐簇回退。
- **`check:call-reachability` 先做 advisory**，步 4 清完再改阻断——
  理由是「一直红的门禁会被关掉而不是被遵守」。
