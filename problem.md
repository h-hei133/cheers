# 项目核心使用与架构能力问题清单 (problem.md)

本文档记录用户在实际使用本项目时暴露出的核心缺陷、体验病灶以及与顶尖业界 Agent（如 **Pi**、**Claude Code**、**OpenCode**、**Playwright-MCP**、**DeepSeek-Harness**、**Oh-My-Pi**）对比发现的架构级能力差距与落地设计规范。

---

## 目录
1. [问题 1：静态规则拦截（Prompt 被硬编码规则截胡）](#问题-1静态规则拦截prompt-被硬编码规则截胡)（已修复）
2. [问题 2：自主 ReAct 工具调用循环缺失（纯文本裸聊）](#问题-2自主-react-工具调用循环缺失纯文本裸聊)（已修复）
3. [问题 3：工具参数缺失 JSON Schema 定义](#问题-3工具参数缺失-json-schema-定义)（已修复）
4. [问题 4：终端交互转义序列与内部 Continuation 转储污染](#问题-4终端交互转义序列与内部-continuation-转储污染)（已修复）
5. [问题 5：基础 Slash 命令与 Plan Mode 安全机制缺陷](#问题-5基础-slash-命令与-plan-mode-安全机制缺陷)（已修复）
6. [问题 6：内置文件工具链与 Pi Agent 的核心能力差距（待补齐）](#问题-6内置文件工具链与-pi-agent-的核心能力差距待补齐)（已修复）
7. [问题 7：Web 搜索与轻量网页抓取能力缺失（对比 OpenCode）](#问题-7web-搜索与轻量网页抓取能力缺失对比-opencode)（已修复）
8. [问题 8：浏览器自动化工具粒度与交互能力差距（对比 Playwright-MCP）](#问题-8浏览器自动化工具粒度与交互能力差距对比-playwright-mcp)（已修复）
9. [问题 9：上下文压缩（Compact）与自动压缩（Auto-Compact）两层渐进式架构规范（对比 Claude Code / Pi / DeepSeek-Harness）](#问题-9上下文压缩compact与自动压缩auto-compact两层渐进式架构规范对比-claude-code--pi--deepseek-harness)（已修复）
10. [问题 10：Slash 命令体系与顶尖项目（Pi / Claude Code / OpenCode / DeepSeek-Harness / Oh-My-Pi）的综合对比与缺失清单](#问题-10slash-命令体系与顶尖项目pi--claude-code--opencode--deepseek-harness--oh-my-pi的综合对比与缺失清单)（已修复）
11. [问题 11：高阶工作流与交互式 Slash 命令套件深度分析（Goal, Loop, Todo, Fast, Context, Btw）](#问题-11高阶工作流与交互式-slash-命令套件深度分析goal-loop-todo-fast-context-btw)（待处理）

---

## 问题 1：静态规则拦截（Prompt 被硬编码规则截胡）
- **状态**：✅ 已修复 (`124bd8b`, `207d958`)
- **现象**：当用户输入"检查一下当前目录下的项目使用的架构是什么"时，系统被 `repoAwareRouting.ts` 内部的静态正则表达式截胡，直接返回固定文本 `"Use /cd <path>..."`，完全未发给大模型。
- **根因**：使用了脆弱的关键词正则匹配试图拦截所谓的"仓库状态"问题。
- **修复**：彻底废除静态规则对自然语言的截胡，所有用户提示词 100% 直通大模型 ReAct 决策循环。

---

## 问题 2：自主 ReAct 工具调用循环缺失（纯文本裸聊）
- **状态**：✅ 已修复 (`124bd8b`, `207d958`)
- **现象**：自然语言模式下大模型没有挂载任何读写工具，退化为纯文本问答，无法读取本地任何真实文件。
- **根因**：先前依赖多轮 P-C-R（Planner-Coder-Reviewer）复杂的抽象流，普通交互路径未注入 OpenAI 格式标准 Tools。
- **修复**：实现统一的 `runAutonomousReActLoop`（`core/query/agentLoop.ts`），永久向大模型挂载完整标准工具集，支持自主多轮 `tool_calls` 执行与结果自动回传。

---

## 问题 3：工具参数缺失 JSON Schema 定义
- **状态**：✅ 已修复 (`124bd8b`, `207d958`)
- **现象**：大模型发起 tool_calls 时频繁出现参数缺失或不敢调用工具。
- **根因**：`createCoreToolRegistry` 中各个工具的 `argsSchema` 仅声明了 `required: [...]`，缺少各参数在 `properties` 中的字段名与语义说明。
- **修复**：为所有工具补全了标准 JSON Schema `properties` 声明与清晰的参数描述。

---

## 问题 4：终端交互转义序列与内部 Continuation 转储污染
- **状态**：✅ 已修复 (`124bd8b`, `207d958`)
- **现象**：终端输出充斥大量未格式化的内部 Continuation Seed、Handoff 审计日志与混乱的转义字符。
- **修复**：`sessionEventSurface.ts` 与 `sessionTerminalState.ts` 采用现代化的动态徽章（`⠹ [tool: name]`, `✓ [tool: name done]`），默认隐藏内部状态转储。

---

## 问题 5：基础 Slash 命令与 Plan Mode 安全机制缺陷
- **状态**：✅ 已修复 (`124bd8b`, `207d958`)
- **现象**：缺少 `/exit`、`/quit` 命令退出 CLI；Plan 模式在执行层未拦截 `bash` 命令。
- **修复**：实现标准 `/exit` 优雅退出；并在 `agentLoop.ts` 与 `evaluator.ts` 中严格限制 Plan 模式下的只读白名单（只允许 `read`, `glob`, `grep`, `git-status`, `git-diff`）。

---

## 问题 6：内置文件工具链与 Pi Agent 的核心能力差距（待补齐）
- **状态**：✅ 已修复 (`72313fc`)
- **交付**：实现了原生纯 TS 跨文件 `grep` 工具，升级了 `read` 分页（`offset`/`limit`）与 30KB/1000 行安全截断。

---

## 问题 7：Web 搜索与轻量网页抓取能力缺失（对比 OpenCode）
- **状态**：✅ 已修复 (`3a12343`)
- **交付**：实现了毫秒级轻量 `web_fetch`（HTML 转 Markdown + 10k 限制）与标准 `web_search` 搜索引擎适配层。

---

## 问题 8：浏览器自动化工具粒度与交互能力差距（对比 Playwright-MCP）
- **状态**：✅ 已修复 (`3a12343`)
- **交付**：内核支持了完整的 Direct Playwright 交互与自愈执行流水线。

---

## 问题 9：上下文压缩（Compact）与自动压缩（Auto-Compact）两层渐进式架构规范（对比 Claude Code / Pi / DeepSeek-Harness）
- **状态**：✅ 已修复 (`3a12343`, `71469e8`)
- **交付**：落地了第 1 层 0ms 纯内存 Microcompact（修剪 3 轮前旧工具输出 Head/Tail），第 2 层 8-Section 结构化 Checkpoint，支持 `/compact [custom_instructions]`，动态 Token 预算触发与 Context Overflow 运行时无感自愈重试。

---

## 问题 10：Slash 命令体系与顶尖项目（Pi / Claude Code / OpenCode / DeepSeek-Harness / Oh-My-Pi）的综合对比与缺失清单
- **状态**：✅ 已修复 (`facdc1b`)
- **交付**：落地了 7 大核心高频命令：`/clear`、`/review`、`/init`、`/cost`、`/undo`、`/export`、`/copy`。

---

- **状态**：✅ 已修复 (`aada736`)
- **交付**：实现了 `/goal`、`/loop`、`/todo`、`/fast`、`/context`、`/btw` 6 大高阶工作流命令与对应测试套件。

### 1. `/goal`（高阶目标持久化管理）
- **标杆参考**：**DeepSeek-Harness** (`packages/goal/command-goal/`)
- **实现剖析**：
  - DeepSeek-Harness 将目标建模为状态机：`active`（执行中）、`paused`（暂停）、`blocked`（受阻）、`complete`（完成）。
  - 支持 `/goal <objective>`（新建或切换目标）、`/goal edit <objective>`（重写当前目标）、`/goal pause` / `/goal resume` / `/goal clear`。
  - **核心价值**：防止大模型在多轮复杂重构任务中发生“目标漂移（Goal Drift）”，每次决策前将当前活跃目标置顶注入系统提示词。

### 2. `/loop`（自主循环执行与迭代直到达标）
- **标杆参考**：**Oh-My-Pi** (`scripts/run-rs-task.ts`, `loop-phase.test.ts`) 与 Ralph / Auto-loop 模式
- **实现剖析**：
  - 设定最大迭代轮数与验收判定标准（例如：`npm test` 退出码必须为 0）。
  - 每一轮由 Agent 执行修改，自动运行验证命令，未通过则将报错再次作为输入驱动下一轮，直至全部绿灯或达到轮数上限。
  - **核心价值**：实现真正全自动无人值守的代码修复与测试驱动开发（TDD）。

### 3. `/todo`（任务清单与阶段拆解追踪）
- **标杆参考**：**OpenCode** (`tool/todo.ts` 与 `session/todo.ts`)
- **实现剖析**：
  - 将大任务拆解为结构化项：`[{ id, content, status: "pending" | "in_progress" | "completed" }]`。
  - 支持 `/todo`（查看当前任务进度）、`/todo add <task>`、`/todo done <id>`、`/todo clear`。
  - **核心价值**：让长任务的进度完全透明可视化，并在每次 Turn 结束时向用户展示清晰的勾选清单。

### 4. `/fast`（快速模式切换 / 模型极速档）
- **标杆参考**：**Claude Code** (`commands/fast/fast.tsx`)
- **实现剖析**：
  - 一键切换当前会话至低延迟、低成本的轻量快速模型（如从 Claude 3.7 Sonnet / DeepSeek-V3 切换至 Haiku / DeepSeek-V4-Flash / Mini-model）。
  - 支持 `/fast on`、`/fast off` 或带有参数的快速切换。
  - **核心价值**：适合简单查代码、小文件修改或快速问答，极大降低 API 费用并提升响应速度。

### 5. `/context`（上下文可视化与 Token 分布透视）
- **标杆参考**：**Claude Code** (`commands/context/context.tsx` & `context-noninteractive.ts`)
- **实现剖析**：
  - 结构化透视当前上下文窗口中每一部分的 Token 占比：
    - System Prompt & Tools Schema 占用
    - 历史用户/助手对话占用
    - 工具调用输出（Tool Results）占用
    - 剩余可用空间（Free Space）与 预留自动压缩缓冲（Autocompact Buffer）
  - **核心价值**：帮助开发者和 Agent 准确洞察当前 Token 瓶颈，决定何时运行 `/compact`。

### 6. `/btw`（侧信道提问 / 零上下文污染轻量问答）
- **标杆参考**：**Claude Code** (`commands/btw/btw.tsx` 与 `runSideQuestion.ts`)
- **实现剖析**：
  - 用户在长会话进行中，突然想问一个临时性问题（如“这个环境变量是什么意思？”或“Rust 中的 unwrap 会 panic 吗？”），但**绝不想把这个临时问题和回答写入主会话上下文**，以免污染长任务的历史。
  - `/btw <question>`：拉起单次轻量独立调用（Side-question），在悬浮窗/临时控制台渲染回答，按任意键关闭，**主历史 0 污染**。
  - **核心价值**：极致保护长任务上下文纯净度，避免无意义问答占用 Token。

---

## 阶段规划与架构落地设计（纳入 GOAL.md Phase 5）

| 命令 | 别名 (Aliases) | 标杆复用来源 | 架构落地文件 | 核心职责 |
| :--- | :--- | :--- | :--- | :--- |
| **`/goal`** | `/objective`, `/target` | **DeepSeek-Harness** | `core/commands/goalCommandRuntime.ts` | 目标设定、阶段状态机（active/paused/complete）与防漂移系统提示词置顶注入 |
| **`/loop`** | `/ralph`, `/autoloop` | **Oh-My-Pi** | `core/commands/loopCommandRuntime.ts` | 自主迭代执行循环：直到指定测试命令通过或达到指定最大轮数 |
| **`/todo`** | `/tasks`, `/checklist` | **OpenCode** | `core/commands/todoCommandRuntime.ts` | 结构化任务拆解、实时进度展示与状态更新 |
| **`/fast`** | `/turbo`, `/speed` | **Claude Code** | `core/commands/fastCommandRuntime.ts` | 一键在高性能主力模型与极速轻量模型之间快速切换 |
| **`/context`** | `/ctx`, `/tokens-map` | **Claude Code** | `core/commands/contextCommandRuntime.ts` | 上下文 Token 分布图表与使用量全景透视 |
| **`/btw`** | `/side`, `/ask` | **Claude Code** | `core/commands/btwCommandRuntime.ts` | 侧信道单次临时问答，回答完毕即丢弃，0 污染主历史 |

---

## 问题 12：缺乏生命周期 Hook 拦截与编译器/测试级物理验证自愈闭环（已修复）
- **状态**：✅ 已修复
- **背景与顶尖项目对比**：
  - **Claude Code 官方最新 Hooks 规范**（经 TinyFish 查证）：定义了三级生命周期节拍（SessionStart/End, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, PostToolBatch, Stop），支持 Shell 命令与 JSON stdin/stdout 双向决策交互。
  - **早期 docs/ 宝藏资产（sp059, VR001~VR011）**：沉淀了深厚的编译器诊断自愈、受影响单测自动定位与 Claim Ledger 确定性物理证据链。
- **落地交付方案**：
  1. **Hook 核心调度引擎** (`core/hooks/hookDispatcher.ts` & `types.ts`)：
     - 支持 `UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`Stop` 全生命周期事件拦截；
     - 支持 `allow`, `block`, `retry` 决策判定。
  2. **三大开箱即用内置验证 Hook** (`core/hooks/builtin/`)：
     - `postMutationLspGuard.ts`：写后自动校验语法/括号平衡，发现错误自动生成 `[Verification Guard]` 反馈触发自愈。
     - `affectedUnitTestRunner.ts`：修改源文件后自动推断匹配的单元测试文件并提供针对性测试推荐。
     - `evidenceReceiptCollector.ts`：自动沉淀物理执行成功回执（Receipt），确保交付真实无幻觉。
  3. **与自主 ReAct 循环打通**：在 `agentLoop.ts` 中无缝调度，写后错误自动进入下一轮进行自我修复。
