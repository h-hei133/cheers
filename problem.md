# 项目核心使用与架构能力问题清单 (problem.md)

本文档记录用户在实际使用本项目时暴露出的核心缺陷、体验病灶以及与顶尖业界 Agent（如 **Pi**、**Claude Code**、**OpenCode**、**Playwright-MCP**、**DeepSeek-Harness**）对比发现的架构级能力差距与落地设计规范。

---

## 目录
1. [问题 1：静态规则拦截（Prompt 被硬编码规则截胡）](#问题-1静态规则拦截prompt-被硬编码规则截胡)（已修复）
2. [问题 2：自主 ReAct 工具调用循环缺失（纯文本裸聊）](#问题-2自主-react-工具调用循环缺失纯文本裸聊)（已修复）
3. [问题 3：工具参数缺失 JSON Schema 定义](#问题-3工具参数缺失-json-schema-定义)（已修复）
4. [问题 4：终端交互转义序列与内部 Continuation 转储污染](#问题-4终端交互转义序列与内部-continuation-转储污染)（已修复）
5. [问题 5：基础 Slash 命令与 Plan Mode 安全机制缺陷](#问题-5基础-slash-命令与-plan-mode-安全机制缺陷)（已修复）
6. [问题 6：内置文件工具链与 Pi Agent 的核心能力差距（待补齐）](#问题-6内置文件工具链与-pi-agent-的核心能力差距待补齐)（待处理）
7. [问题 7：Web 搜索与轻量网页抓取能力缺失（对比 OpenCode）](#问题-7web-搜索与轻量网页抓取能力缺失对比-opencode)（待处理）
8. [问题 8：浏览器自动化工具粒度与交互能力差距（对比 Playwright-MCP）](#问题-8浏览器自动化工具粒度与交互能力差距对比-playwright-mcp)（待处理）
9. [问题 9：上下文压缩（Compact）与自动压缩（Auto-Compact）两层渐进式架构规范（对比 Claude Code / Pi / DeepSeek-Harness）](#问题-9上下文压缩compact与自动压缩auto-compact两层渐进式架构规范对比-claude-code--pi--deepseek-harness)（待处理）

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
- **状态**：📌 **待处理（Backlog / Next Sprint）**
- **背景与对比**：
  对比顶级开源 Agent **Pi**（内置 8 个核心工具：`read`, `bash`, `powershell`, `edit`, `write`, `grep`, `find`, `ls`），我们当前内置了 11 个原生工具（7 个 Workspace 工具 + 4 个 Playwright 浏览器自动化工具）。
  虽然我们的工具覆盖了主要场景且拥有专用的 `git-status`/`git-diff` 与 `browser.*` 优势，但与 Pi 相比依然存在 **2 个工业级关键细节差距**：

### 差距 1：原生跨文件内容正则检索工具（`grep`）缺失
- **现象与病灶**：
  目前工作区只有路径检索工具（`glob`），没有内容搜索工具（`grep`）。
  当模型需要按文本或正则表达式在全项目中搜索某个符号、函数调用或配置项时，只能被迫通过 `bash` 工具调用外部系统命令（如 `rg` 或 `grep`）。
- **严重危害**：
  1. **Plan 模式（只读模式）瘫痪**：在 Plan 模式下，为了系统安全 `bash` 命令被完全禁用，导致大模型在规划阶段**完全无法搜索项目代码内容**。
  2. **跨平台兼容性脆弱**：依赖主机环境是否安装了 `grep`/`ripgrep`，在 Windows 等环境下表现不一致。
- **改进建议**：
  实现纯 Node.js/TypeScript 原生的内置 `grep` 工具，支持：
  - 正则表达式或纯文本跨文件搜索
  - 输出格式标准：`filepath:line_number: matched_line_content`
  - 支持可选的 `include`/`exclude` 路径通配过滤
  - 原生列入 Plan 模式的只读安全白名单。

### 差距 2：大文件截断与分页读取保护（`read` 保护机制）缺失
- **现象与病灶**：
  当前内置的 `read` 工具是全量读取目标文件的全部文本内容。
- **严重危害**：
  当用户或大模型尝试读取大型依赖文件（如 lock 文件）、日志、编译产物或超过 1000 行的源文件时，整个大文件内容一次性灌入上下文，导致：
  1. **上下文窗口溢出（Context Overflow）**
  2. **消耗巨额 Token**
  3. 大模型迷失在海量无关代码中（Lost in the Middle）。
- **Pi 的成熟设计**：
  Pi 的 `read` 工具支持 `offset`（起始行）、`limit`（读取行数），并在底层有 `truncateHead`/`truncateTail` 保护（默认限制最大字节数和最大行数），超出时截断并提示剩余行数。
- **改进建议**：
  升级现有 `read` 工具：
  - 增加可选参数 `offset`（从第 N 行开始读取）与 `limit`（最多读取 M 行）。
  - 内置单次最大字符数（如 30KB / 1000 行）安全截断阈值，超出时在末尾附加 `[File truncated: showing lines X-Y of Z. Use offset/limit to view more]`。

---

## 问题 7：Web 搜索与轻量网页抓取能力缺失（对比 OpenCode）
- **状态**：📌 **待处理（Backlog / Next Sprint）**
- **背景与对比**：
  对比顶级终端 Agent **OpenCode**（内置 `websearch` 与 `webfetch`）：
  - OpenCode 的 `websearch` 对接了 Exa AI 与 Parallel.ai，返回专为 LLM 提炼清洗后的结构化上下文，并设置了 10,000 字符上下文保护。
  - OpenCode 的 `webfetch` 是毫秒级纯 HTTP 抓取，配合 `turndown` 自动将 HTML 转换为精简的 Markdown 文本，开销极低。
- **现象与病灶**：
  1. **缺少原生 Web 搜索**：当前项目没有任何原生内置的 `web_search` 工具，当大模型遇到新出现的库、最新 API 规范或报错时，无法联网搜索，只能依赖外部挂载 MCP 或由用户手动喂入。
  2. **缺少轻量 Web Fetch（大材小用）**：当模型仅需要读取一个技术文档 URL、查看一段博客或 GitHub Issue 时，目前只能启动庞大的 Playwright Chromium 无头浏览器，面临启动慢（1~3秒）、内存消耗大（数百MB）以及 SPA DOM 噪音多的问题。
- **改进建议**：
  - **实现轻量 `web_fetch` 工具**：基于纯 Node.js `fetch` + `turndown` HTML 转 Markdown，毫秒级响应，自动限制 50KB/10000 字符返回，专用于纯静态文档查阅。
  - **实现标准 `web_search` 适配层**：支持对接主流 LLM Search API（如 Exa / Tavily / Serper）或通过统一搜索引擎适配器返回格式化摘要。

---

## 问题 8：浏览器自动化工具粒度与交互能力差距（对比 Playwright-MCP）
- **状态**：📌 **待处理（Backlog / Next Sprint）**
- **背景与对比**：
  对比微软官方 **`@playwright/mcp`**：
  - 微软 Playwright-MCP 提供了 24+ 个细粒度原子工具（覆盖 `browser_navigate`, `browser_click`, `browser_type`, `browser_fill_form`, `browser_select_option`, `browser_hover`, `browser_drag`, `browser_file_upload`, `browser_press_key`, `browser_console_messages`, `browser_pdf_save` 等）。
  - 我们的项目在架构韧性上远超微软（我们拥有独创的 **自愈 Self-Healing、事务 Txn、录制回放 Replay、出站网络防火墙 Egress Guard 与收执存证 Receipts**）。
- **现象与病灶**：
  我们在模型可见的原子交互能力上过于收敛（仅暴露了 `observe`, `extract`, `click`, `type` 4 个工具）：
  1. **缺少复杂表单操作**：无法直接操作 `<select>` 下拉选框（缺少 `select_option`），无法进行文件选择上传（缺少 `file_upload`）。
  2. **缺少菜单与键盘交互**：无法触发悬停下拉菜单（缺少 `hover`），无法精确按键（如回车 `Enter`、`Tab`、`Escape`，缺少 `press_key`）。
  3. **缺少控制台与网络调试**：虽然内核有 Egress 审计，但大模型在前端调试时无法主动读取浏览器的 `console.error` 日志和网络请求失败信息。
- **改进建议**：
  保持我们自愈和安全架构优势的前提下，补齐 4 个最高频的浏览器原子工具：
  - `browser.select`：支持操作下拉选框
  - `browser.hover`：支持鼠标悬停激活浮层/菜单
  - `browser.press`：支持键盘按键模拟（Enter, Tab, Escape, ArrowDown 等）
  - `browser.upload`：支持文件上传自动化

---

## 问题 9：上下文压缩（Compact）与自动压缩（Auto-Compact）两层渐进式架构规范（对比 Claude Code / Pi / DeepSeek-Harness）
- **状态**：📌 **待处理（Backlog / Next Sprint）**
- **背景与标杆解构**：
  解构业界四大顶级项目的成熟压缩方案：
  - **Claude Code**：三级渐进防御。**Microcompact（微压缩）**在发往 API 前原地修剪历史旧工具输出，**0 额外延迟且不破坏 Prompt Cache**；**Full Auto-Compact** 动态基于 `ContextWindow - 13k Buffer` 触发大模型总结；内置连续 3 次失败熔断器（Circuit Breaker）。
  - **DeepSeek-Harness**：**结构化 8 段 Checkpoint Schema**（严谨规范的 Intent / Tech / Files / Errors / Pending / Current / NextStep / Critical Context），保证被压缩后的上下文信息密度极高且无损；**ToolResultPruner** 采用 `Head(500字) + Tail(500字)` 双向修剪。
  - **Pi Agent**：从历史 tool_calls 中提取 `readFiles` 与 `modifiedFiles` 文件集清单；具备 **Context Overflow 运行时自动剔除报错帧 $\rightarrow$ 压缩 $\rightarrow$ 自动重发本轮** 的无感恢复机制。
  - **OpenCode**：优雅的命令行交互 `/compact [custom_instructions]`。

- **我们项目的核心病灶**：
  1. **硬编码静态轮数触发**：当前代码硬编码 `AUTO_COMPACT_TURN_THRESHOLD = 12`（每 12 轮静态触发），无法感知真实 Token 消耗，在大文件读取冲击下直接发生 Context Overflow 崩溃；在简短对话下又产生无意义打断。
  2. **不支持自定义上下文窗口与阈值**：无法根据选定模型（如 32k、64k、128k、200k）或用户配置动态计算安全水位线。
  3. **缺少日常微压缩（Microcompact）**：几十轮之前的旧 `read`/`bash` 大段输出原样堆积在上下文中，浪费 70%+ Token。
  4. **缺少结构化 Checkpoint 生成**：压缩仅做纯代码静态拼接，缺少大模型语义提炼，丢失关键技术决策。
  5. **缺少 Overflow 运行时自愈重发**：API 报超限时直接报错退出，用户体验中断。

- **不缝合、最优雅的“双层渐进压缩架构”落地设计规范**：

### 1. 架构分层
```text
[用户 Prompt / 自动决策]
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ 第 1 层: 零成本 Microcompact (日常降噪, 0ms 纯内存)           │
│ - 发送给 LLM 前, 仅保留最近 3 轮完整工具输出                │
│ - 3 轮之前的旧工具输出修剪为 Head(500字) + [Omitted] + Tail(500字) │
│ - 节省 60%+ 无效 Token, 维持 Prompt Cache 高命中率          │
└─────────────────────────────────────────────────────────────┘
       │
       ▼ (Token 预算监控)
┌─────────────────────────────────────────────────────────────┐
│ 第 2 层: 结构化 8-Section Checkpoint (Full Compact)         │
│ - 触发条件:                                                 │
│   a) 用户手动输入 /compact [自定义指令]                     │
│   b) 自动触发: 当前 Token >= EffectiveWindow * 80%          │
│   c) 运行时自愈: 捕获 Provider Context Overflow 错误        │
│ - 执行 DeepSeek-Harness 8 段标准总结 Prompt                 │
│ - 写入 compact_boundary, 归档旧历史, 仅保留 Checkpoint 续跑 │
└─────────────────────────────────────────────────────────────┘
```

### 2. 标准 8-Section Checkpoint Schema 规范
压缩总结由辅助模型严格输出以下 Markdown 结构：
```markdown
<compacted-summary>
## Primary Request and Intent
- [用户的核心目标与演进意图]

## Key Technical Concepts
- [涉及的技术栈、架构模式与约定]

## Files and Code
- [涉及的关键文件路径、作用与已完成的修改]

## Errors and Fixes
- [遇到的错误、排查结论与修复方案]

## Pending Jobs
- [明确要求但尚未完成的遗留任务]

## Current Work
- [当前正在进行的具体工作]

## Next Step
- [下一步唯一的明确执行动作]

## Critical Context
- [架构决策、用户偏好、重要约束与未决问题]
</compacted-summary>
```

### 3. 配置规范定义 (`settings.json` 与 CLI 参数)
```json
{
  "compaction": {
    "enabled": true,
    "contextWindow": 64000,
    "autoCompactPercent": 80,
    "reserveTokens": 8000,
    "microcompact": {
      "enabled": true,
      "keepRecentTurns": 3,
      "maxOutputChars": 1000
    }
  }
}
```
