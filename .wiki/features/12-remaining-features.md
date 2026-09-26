---
title: "08 与 11 文档中仍未完成的 features"
summary: "复核轮（2026-09-26）逐条实机核实的未完成清单。Phase 11 完成的是「已登记为任务的 13 项」，不是「08/11 的全部缺口」。剩余 12 项分三类：可做未登记 4 项、无环境可验 4 项、需维护者裁决 6 项。每条附检索命令与结果。"
---

# 08 与 11 中仍未完成的 features

> **复核口径**：每条都用**实际命令**核实，不读二手结论、不读合计行。
> 命令与结果都写在下表里，可复现。

## 0. 先说结论：Phase 11 完成了什么、没完成什么

| 口径 | 数量 |
|---|---|
| `08-*` §4 登记的缺口（MISSING 10 + DEFICIENT 14） | **24** |
| 其中 `phase-11-decisions.md` §0 登记为任务的 | **16**（T1–T13 + D1–D3） |
| Phase 11 **实际施工完成**的 | **13**（T1–T13） |
| **从未被登记为任何任务或裁决点的** | **8** |
| 剩余待办合计 | **12** |

**关键更正**：Phase 11 完成的是**「已登记为任务的全部 13 项」**，
**不是「08/11 的全部缺口」**。24 项与 16 项之间的差额从未说明过。

---

## 1. 第一类：可做，但从未登记（**4 项**）

这四项**不是「决定不做」，是漏了**。它们可做、可验证、无需账号。

| # | 缺口 | 08 编号 | 核实命令 | 结果 | 成本 |
|---|---|---|---|---|---|
| **F1** | **子代理不是真 agent**——`task` 工具是一次 `fetch` 补全调用，`subagentDef.tools` 被忽略、worktree 里的改动没有 agent 去改 | D10 / 08 T5 | `grep -c 'runTurn\|AgentCore\|createStepFunction' core/tools/taskTool.ts` | **0** | **高**（最重的一项） |
| **F2** | **压缩后不恢复工作文件**——压缩丢掉文件内容后不重新装入，模型继续工作会缺上下文 | M8 | `grep -rn 'POST_COMPACT\|restoreFile\|filesToRestore' src` | **0** | 中 |
| **F3** | **中途不能改模型/推理档**——`prepareNextStep` 只用于压缩，无法在回合中途升级模型 | D11 | `grep -rn 'modelOverride' turn/session.ts` | **0** | 中 |
| **F4** | **指令文件的 `@import` 只做了展开，没做转写**——展开已完成（T12），但 08 `M9` 原本还包含「转写」语义 | M9 | `grep -c 'expandImports' context/instructions/projectInstructions.ts` | **3**（展开已做） | 低 |

> **F1 的状态说明**：`phase-11-decisions.md` §15 已定**方向**（改为真 agent，倾向进程内方案 A），
> 但 §16.6 把**形状**列为裁决点。**方向已定、形状未定、代码未动**。
> §0 任务表原把它记成「做」，读起来像已施工——**本轮已更正为「待裁决」**。

---

## 2. 第二类：可做，但无环境可验证（**4 项**）

这四项**代码可写，但无法端到端验证**。`AGENTS.md` 要求「不新增无法验证的表面」，
`phase-10-decisions.md` §1.1 已有先例裁决。**要做的前提是提供可验证环境。**

| # | 缺口 | 08 编号 | 核实命令 | 结果 | 为什么无法验证 |
|---|---|---|---|---|---|
| **F5** | **OAuth Device Code 流**（无浏览器环境登录） | M3 / 08 T15 | `grep -rn 'deviceCode\|device_code' core/auth/oauth/` | **0** | 无订阅账号 |
| **F6** | **Copilot / Anthropic 订阅 OAuth** | M6 | `grep -n 'copilot\|anthropic' core/auth/oauth/providers.ts` | **0**（只有 openai/google） | 同上 |
| **F7** | **Bedrock 协议** | M4 | `ls provider/endpoints/` | 只有 `anthropicMessages` + `openaiCompatible` | 无 AWS 账号 |
| **F8** | **Google GenAI / Vertex 原生协议** | M5 | 同上 | 同上 | 无 GCP 账号 |

---

## 3. 第三类：需维护者裁决（**6 项**）

这六项**不是能力缺失，是取舍冲突**。`phase-11-decisions.md` §16 有完整分析，
每项都有推荐选项。**未经裁决不应施工。**

| # | 裁决点 | 冲突 | 推荐 |
|---|---|---|---|
| **D2** | 数据驱动权限规则（M1） | 照 Claude Code 做规则表，与「进程边界才是安全边界」相反。**我们完全没有 deny 概念** | 只补 deny（绕过免疫），不做完整规则表 |
| **D3** | `cheers.json` / `.agents/settings.json` | 两份**字节相同**、都被 git 跟踪、**都没有读取者**；`cheers.json` 还含**外部项目名**（违反 `AGENTS.md`） | **两份都删** |
| **D4** | 动态工具装载增量（M10） | 参考的机制前提是「工具集会变」，我们固定于会话构造 | 只处理 `maxSteps` 时工具静默消失的情况 |
| **D5** | 后台命令执行（M2） | 与 `ambientFacts.ts:9`「shell 无分离执行模式」冲突 | 先查 `processTree.ts` 是否已覆盖孤儿清理 |
| **D6** | 死代码处置（`core/workflow/` 6 模块 508 行、`interception.ts` 411 行） | `plan.md` §2.1「可达性不授权删除」 | 逐簇六项检查后删 |
| **D7** | D1 的形状（进程内 vs 子进程） | 进程内：2 个产品级先例；子进程：零改造继承但需 4 个新 CLI 参数 | 进程内（方案 A） |

---

## 4. 已明确裁决「不做」的（**记录，不计入剩余**）

| 项 | 裁决 |
|---|---|
| 08 `D6` SSE 事件头 | **不做**——11 §2.6 已证伪（OpenAI 不发该头，Anthropic 的 JSON 自带 `type`） |
| 08 `T17` 路由期命名残留 | **不纳入**——文档卫生，不占施工预算 |
| 08 `T16` 死代码 | **转 D6 裁决点**（需授权） |
| 08 `T18` 新协议 | **转 F7/F8**（无账号可验） |

---

## 5. 本轮复核另发现的 4 个**真缺陷**（已修复，不在原清单里）

复核不是走过场——它找出了施工轮自己没看见的问题：

| # | 缺陷 | 为什么施工轮没发现 |
|---|---|---|
| **R1** | `compat` 等**嵌套对象被整体替换**——用户设一个标志会抹掉 `systemRole`/`maxTokensField` | T1 只修了**顶层**合并，嵌套那层同型问题没看见 |
| **R2** | 编辑唯一性**只在精确路径计数**——缩进不同的两个块被算作一个，静默改错位置 | T3 修了精确路径，**模糊路径**同型问题没看见 |
| **R3** | `budget_tokens` **抬高 `max_tokens` 覆盖用户上限**——默认配置下每个请求都变成 17,408 token | T6 的实现方向对（要发 budget），但**谁优先**判断反了 |
| **R4** | `thinkingSignature` **写进 transcript 却读不回来**——重启后签名丢失，T7 修复失效 | T7 只测了**写入**，没测**读回**；恢复路径 `transcriptEventToSessionMessage` 漏了字段 |
| **R5** | `~~~` 围栏与**四反引号套三反引号**未被识别为代码块 | T12 的手扫只认反引号且要求**等长**配对 |
| **R6** | `SimpleRequest` 有 `temperature` 却没有表达「模型不接受」的字段 | T5 只给完整请求加了门控，**无工具的那条路径**没有可用的开关 |

**共性**：R1/R2/R4 都是**「修了同型问题的一层/一路，漏了另一层/另一路」**。
这是复核最有价值的产出类型。

---

## 6. 修复后的验证

| # | 修复 | 撤销验证 |
|---|---|---|
| R1 | 嵌套对象逐字段合并 | 撤销后 1 项失败 |
| R2 | 唯一性按策略各自的匹配计数 | 撤销后 2 项失败 |
| R3 | budget 在 ceiling 内取 `min` | 撤销后 2 项失败 |
| R4 | transcript 双向携带 `reasoning`/`failureClass` | 撤销后 2 项失败 |
| R5 | 双围栏 + 按长度配对 | 撤销后 2 项失败 |
| R6 | `SimpleRequest.supportsTemperature` + 门控 | 撤销后 1 项失败 |

**全部 6 项都做了「撤销修复 → 测试必须失败」的验证。**

---

## 7. 复现方式

```bash
cd /home/wang/projects/cheers
# 第一类（应为 0 命中）
grep -c 'runTurn\|AgentCore\|createStepFunction' packages/ts-shell/src/core/tools/taskTool.ts
grep -rn 'POST_COMPACT\|restoreFile\|filesToRestore' packages/ts-shell/src | wc -l
grep -rn 'modelOverride' packages/ts-shell/src/turn/session.ts | wc -l
# 第二类（应为 0 命中）
grep -rn 'deviceCode\|device_code' packages/ts-shell/src/core/auth/oauth/ | wc -l
grep -n 'copilot\|anthropic' packages/ts-shell/src/core/auth/oauth/providers.ts | wc -l
ls packages/ts-shell/src/provider/endpoints/
# 第三类（应为 0 命中——D3 的两份配置都没有读取者）
grep -rn 'cheers.json' packages/ts-shell/src --include='*.ts' | wc -l
```
