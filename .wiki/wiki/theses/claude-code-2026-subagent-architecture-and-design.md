# 对标 Claude Code 2026 官方子代理架构规范深度审计与落地设计方案

> **所属知识库**：`.wiki/wiki/theses/`  
> **权威信源**：通过 TinyFish MCP 检索并解析 Anthropic 官方最新规范（`https://code.claude.com/docs/en/sub-agents`）  
> **更新时间**：2026-08-30  
> **核心目标**：彻底消灭单轮 fetch 假子代理，完整实现 `.claude/agents/*.md` 自定义子代理加载器、多轮 ReAct 工具循环、物理工作区隔离、持久化 Agent 记忆挂载与生命周期 Hooks 联动。

---

## 目录
1. [Claude Code 2026 官方子代理核心规范解构](#一-claude-code-2026-官方子代理核心规范解构)
2. [当前项目对比官方规范的四大关键差距](#二-当前项目对比官方规范的四大关键差距)
3. [SOTA 生产级自定义子代理系统架构设计](#三-sota-生产级自定义子代理系统架构设计)
4. [实施路线图与实施计划](#四-实施路线图与实施计划)

---

## 一、 Claude Code 2026 官方子代理核心规范解构

```mermaid
graph TD
  subgraph "Claude Code 2026 官方自定义子代理体系"
    Loader["1. 5 级作用域加载器 (Subagent Loader)<br/>- 扫描 ~/.claude/agents/*.md 与 .claude/agents/*.md<br/>- 严格解析 YAML Frontmatter (name, description, tools, disallowedTools, model, isolation, memory, skills, maxTurns)"]
    
    ReAct["2. 独立 ReAct 主执行循环 (Child ReAct Loop)<br/>- 子代理继承工具池并按 tools/disallowedTools 严格裁剪<br/>- 运行独立的 runAutonomousReActLoop 实例，拥有独立的上下文窗口"]
    
    Worktree["3. 物理工作树隔离 (isolation: worktree)<br/>- 自动执行 git worktree add -b subagent/<id><br/>- 在物理独立目录运行修改与构建，完成后自动 squash-merge 并清理"]
    
    Memory["4. 持久化代理记忆挂载 (memory: user|project|local)<br/>- 挂载 ~/.claude/agent-memory/<name>/MEMORY.md<br/>- 跨会话沉淀该专有子代理的领域经验"]
    
    Hooks["5. 生命周期 Hooks 深度联动<br/>- 派发 SubagentStart / SubagentStop 钩子事件<br/>- 支持通过 agentId 进行后续会话恢复 (Resume)"]
  end
```

---

## 二、 当前项目对比官方规范的四大关键差距

| 序号 | 官方 2026 规范标准 | 当前项目现状（严重短板） | 差距定性与影响 |
| :---: | :--- | :--- | :--- |
| **1** | 支持从 `.claude/agents/*.md` 与 `~/.claude/agents/*.md` 加载自定义子代理声明与 Frontmatter | **完全缺失加载器**，系统内无任何扫描和解析 `.claude/agents/` 目录的机制 | **无法支持用户自定义的专职智能体**（如 `code-reviewer`, `security-auditor`） |
| **2** | 子代理执行完整的独立多轮 ReAct 循环（具备 `read`, `write`, `grep`, `bash`, `lsp` 等工具） | `taskTool.ts` 目前仅发起单次单轮无工具的直接 fetch 问答 | **子代理沦为纯问答模型，无法真正读写文件或运行代码** |
| **3** | 支持持久化代理记忆（`memory: project\|user`）挂载与 `skills` 预加载 | 缺失 `agent-memory/<name>/` 目录挂载机制，未实现技能预注入 | **子代理无法跨会话积累领域经验，技能无法自动生效** |
| **4** | 完整分发 `SubagentStart` 与 `SubagentStop` 生命周期 Hooks，支持按 `agentId` 恢复会话 | `taskTool.ts` 内部未调用 `hookDispatcher.dispatch`，无 `agentId` 记忆恢复 | **破坏了 2026 官方生命周期监控链条，无法追踪子代理轨迹** |

---

## 三、 SOTA 生产级自定义子代理系统架构设计

```mermaid
graph TD
  subgraph "生产级自定义子代理系统架构 (Subagent Subsystem)"
    AL["SubagentLoader (子代理加载器)<br/>- 递归扫描 .claude/agents/ 与 ~/.claude/agents/<br/>- 解析 YAML Frontmatter，构建规范化的 SubagentDefinition 注册表"]
    
    TT["task / agent Tool (子代理调用工具)<br/>- 匹配 subagent_type 或动态派发<br/>- 支持 isolation: 'worktree' 物理隔离<br/>- 自动挂载 agent-memory 与预加载 skills"]
    
    AR["Child runAutonomousReActLoop (子智能体多轮循环)<br/>- 注入按 tools/disallowedTools 过滤后的专用 ToolRegistry<br/>- 派发 SubagentStart / SubagentStop 生命周期事件<br/>- 最终将结构化结果总结回传主会话"]
    
    AL --> TT --> AR
  end
```

### 1. 子代理加载器 (`SubagentLoader`)
- **文件路径**：`packages/ts-shell/src/core/subagents/subagentLoader.ts`
- **功能**：
  - 扫描 `.claude/agents/*.md`（项目级）与 `~/.claude/agents/*.md`（用户级）；
  - 解析 YAML Frontmatter：
    ```yaml
    ---
    name: code-reviewer
    description: Expert code reviewer. Proactively reviews code for quality and security.
    tools: Read, Grep, Glob, Bash
    model: inherit
    isolation: worktree
    memory: project
    ---
    System prompt body...
    ```

### 2. 真实多轮 ReAct 子代理执行器
- 升级 `taskTool.ts`：
  - 实例化独立的 `runAutonomousReActLoop`；
  - 根据子代理声明挂载 `GitWorktreeManager` 隔离工作树；
  - 自动读取 `~/.claude/agent-memory/<name>/MEMORY.md` 注入上下文；
  - 完整分发 `SubagentStart` 与 `SubagentStop` 生命周期事件。

---

## 四、 实施路线图与实施计划

```mermaid
timeline
  title SOTA 自定义子代理落地计划
  阶段 1 : 实现 SubagentLoader 解析 .claude/agents/*.md YAML Frontmatter
  阶段 2 : 改造 taskTool.ts 接入 child runAutonomousReActLoop 独立多轮工具循环
  阶段 3 : 接入 agent-memory 目录挂载与 SubagentStart/SubagentStop Hook 分发
  阶段 4 : 全量编写自动化测试矩阵并完成端到端工程验证
```
