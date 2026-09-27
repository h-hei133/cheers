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

### 步 4：零调用模块的逐簇处置（65 文件 / 12,855 行）

**这一块最大，必须逐簇裁决**，按 `plan.md` §2.2 的六项检查。

**已知分组**（pre-research §3.5）：

| 组 | 文件 | 初判 |
|---|---:|---|
| `planning/` 规划状态机 | 16 | **删**——Agent 主循环从不经过；无参考实现有等价物 |
| `provider/proposal/` + `edit/proposal/` | 16 | **删**——同族，且活轨编辑已用另一条链（`editEngine` + `presentation/.../diff.ts`） |
| `context/graph/` + `acquisition/code/` | 7 | **删**——除 `ast/parser.ts`（**步 2 要用，保留**） |
| `tools/policy/{interception,strategy}.ts` + `tools/result/split.ts` | 3 | **作为同一连通分量删**——`split.ts` 引 `interception.ts` 的类型 |
| `core/query/runtime/{proof,actionAuthority,batch}.ts` | 3 | 逐簇核实 |
| `sandbox/{auditTrail,escalationWorkflow,sandboxEnforcer}.ts` | 3 | **删**——闭环孤岛，真实权限已由 `cli/approval/` 接管 |
| `core/context/model/*` | 2 | 逐簇核实 |
| `core/commands/{google,openai,subscription}AccountAuth.ts` 的**裸函数导出** | 0（文件保留） | 文件保留（契约对象在 `providerAuthRuntime.ts` 被用）；**只删未被引用的裸导出** |
| 其余 | ~15 | 逐簇核实 |

**准入检查（每簇必过）**：
1. `grep` 确认零生产调用点（用 `check:call-reachability` 的输出 + 手工复核）；
2. 确认**不是编译契约**（类型被活文件引用——`interception.ts` 即是此例）；
3. 确认**不是公开 API 面**（见 §5 Q4）；
4. 确认**不是侧效应注册**；
5. 确认对应的**测试**一并处置（删或改，按 `dead-code-tiers` §4 的原则：
   断言落在死模块上 → 删；拿活模块当夹具 → 改）；
6. 删除后 `tsc` + 全量套件 + 门禁全绿。

**步 4 完成后**：把 `check:call-reachability` 从 **advisory 改为阻断**（见 pre-research §6 尾注）。

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
