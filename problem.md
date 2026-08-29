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
10. [问题 10：Slash 命令体系与顶尖项目（Pi / Claude Code / OpenCode / DeepSeek-Harness / Oh-My-Pi）的综合对比与缺失清单](#问题-10slash-命令体系与顶尖项目pi--claude-code--opencode--deepseek-harness--oh-my-pi的综合对比与缺失清单)（待处理）

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
- **状态**：📌 **待处理（Backlog / Next Sprint）**
- **背景与各大顶尖项目命令剖析**：
  我们深度排查了五大标杆项目的全部内置 Slash 命令：
  1. **Pi Agent** (`core/slash-commands.ts`)：
     - 会话管理：`/new`, `/resume`, `/fork`, `/clone`, `/tree`, `/session`, `/export`, `/import`, `/share`, `/name`
     - 模型与思维：`/model`, `/thinking`, `/scoped-models`
     - 扩展与配置：`/settings`, `/trust`, `/login`, `/logout`, `/reload`, `/hotkeys`, `/compact`, `/quit`
  2. **Claude Code** (`commands/`)：
     - 工作流与代码控制：`/init` (生成 CLAUDE.md 与架构规则), `/review` (代码审查), `/cost` (Token 与费用统计), `/clear` (清空屏幕/会话), `/rewind` (回滚指定回合), `/vim` (切换按键模式), `/insights` (分析历史模式)
  3. **OpenCode** (`command/index.ts`)：
     - 模板命令：`/init` (初始化项目), `/review` (快速 review 变更)
  4. **DeepSeek-Harness** (`packages/goal/` & `interaction/commands/`)：
     - 目标与任务：`/goal` (设定与追踪高阶目标), `/feedback` (结构化反馈)
  5. **Oh-My-Pi** (`scripts/` & `python/robomp/`):
     - 自动化流水线：`/verify` (自动化验证), `/triage` (任务分诊), `/status`

- **去重与合并后，我们当前项目（已有 17 个命令）真正缺失的高价值核心 Slash 命令清单**：
  *(去除了功能重复或纯别名的命令，提炼出 7 个最具杀手级价值的缺失命令)*

| 缺失命令 | 推荐主命令 | 别名 (Aliases) | 来源参考 | 职能定义与落地方案 |
| :--- | :--- | :--- | :--- | :--- |
| **1. 会话重置/清空** | `/clear` | `/reset`, `/cls` | Claude Code, Pi (`/new`) | **清空当前对话历史**，释放上下文内存，开启崭新会话（保持当前工作区与模型配置不变）。 |
| **2. 代码变更审查** | `/review` | `/audit`, `/check` | Claude Code, OpenCode | **一键审查当前工作树变更**：自动读取 `git-diff`，调用 Reviewer 提示词对修改的代码进行安全性、正确性、规范性审查。 |
| **3. 项目规则初始化** | `/init` | `/setup` | Claude Code, OpenCode | **分析当前项目并生成/更新 `AGENTS.md` / `CLAUDE.md`**：自动识别技术栈、包管理器、构建与测试命令，生成标准架构规则。 |
| **4. Token 与消耗统计** | `/cost` | `/tokens`, `/stats` | Claude Code, Pi (`/session`) | **展示当前会话与历史累计的 Token 消耗、调用轮数与预估成本**。 |
| **5. 历史回滚与撤销** | `/undo` | `/rewind`, `/revert` | Claude Code (`/rewind`), Pi (`/fork`) | **撤销上一步操作或回滚到指定历史回合**（丢弃最后一次有害的代码修改或无效回答）。 |
| **6. 会话导出与归档** | `/export` | `/save` | Pi (`/export`), Claude Code | **将当前会话历史导出为 Markdown / HTML / JSONL 归档文件**，便于事后复盘或知识留存。 |
| **7. 剪贴板快速复制** | `/copy` | `/cp` | Pi (`/copy`), Claude Code | **快速将大模型最后一条回答的内容复制到系统剪贴板**，提升终端开发流转效率。 |

- **改进建议与落地设计**：
  在 `packages/ts-shell/src/core/commands/` 下按模块化规范（单文件 $\le 20$ 函数）实现上述 7 个高频核心命令，并注册到 `registry.ts` 和 `slashCommandRegistry.ts`。
