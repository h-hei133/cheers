---
title: "Slash 命令实现深度审计"
category: theses
created: 2026-09-02
updated: 2026-09-02
tags: [slash-commands, audit, honesty]
summary: "逐个检查 15 个被怀疑\"只做了个大概\"的命令：哪些真的接在子系统上、哪些是壳、壳在哪一层，以及每一个要补什么。"
confidence: high
---

# Slash 命令实现深度审计

审计对象是用户点名的 15 个命令。判定标准只有一条：**输出所声称的事情，是否真的发生了**。
按这条标准分三档——真实（接在子系统上并产生效果）、单薄（有真实效果但很浅或不持久）、
壳（声称的事情没有发生）。

## 一、结论表

| 命令 | 判定 | 依据 |
|---|---|---|
| `/review` | 真实 | 读 `git status --short` 与 `git diff HEAD`，产出审阅上下文；工作树干净时明说无可审 |
| `/shell` | 真实 | 接 `ShellManager`，真的切换 bash / git-bash / powershell / wsl 后端并影响后续执行 |
| `/btw` | 真实 | 自己发一次 provider 请求，答案不写入主对话历史——这正是它存在的理由 |
| `/log` | 真实 | 接 `RotatingFileSink`，tail / path / export / clear 都作用于真实日志文件 |
| `/compact` | 真实 | 接 compact 契约、checkpoint 存储与注入状态机，preview 与 write 分离 |
| `/warmup` | 真实 | 接启动预热缓存存储，status / build 作用于真实缓存 |
| `/browser` | 真实 | 接受保护的浏览器能力面与执行回执 |
| `/memory` | 真实 | 17 个导入全部指向真实的记忆子系统：save / use / delete / inspect / retain / recall |
| `/deep-research` | 真实 | `DeepResearcher.research()` 真的跑递归树搜索，`webSearch` 工具真的发 HTTP（DuckDuckGo / Exa / Tavily）|
| `/restore` | 真实 | 接快照账本，preview 绝不写入，execute 需显式 `--execute` |
| `/goal` | 单薄 | 状态是进程内变量，但 `agentLoop` 真的把 active goal 注入环境行。**重启即失** |
| `/fast` | 单薄（已修措辞）| `agentLoop` 真的据此把 temperature 降到 0.2。原输出声称 "Model Routing: 优先高速模型"——**它不换模型** |
| `/brainstorm` | 单薄 | 真写 spec 文件到磁盘；但"苏格拉底问卷"是模板常量，不随 challenge 变化 |
| `/workflow` | 壳 | `DAGResolver` 真的解析批次，但 `getActiveWorkflow()` **全仓库无消费者**——解析结果不驱动任何执行 |
| `/loop` | 壳（已修措辞）| 真跑一次验证命令；然后声称 "Armed autonomous loop driver" 与 "will now drive up to N repair turns"——**没有任何驱动器** |
| `/undo` | 已重做 | 原本是一份报告（遥测 + 文件计数 + 整个 `git diff HEAD`），且 `--hard` 会 `git checkout -- . && git clean -fd` 丢掉整个工作树 |

## 二、本轮已改的两处虚假声明

这两处不是"做得浅"，是**说了没发生的事**，违反 AGENTS.md 的
"Do not hide unverified write outcomes behind success-like terminal or session states"，
所以当轮改掉：

- `/loop`：不再说驱动器已就绪。现在的措辞是"验证门跑了一次，结果如下；没有东西在驱动修复"，
  并把失败输出原样给出——那正是下一个修复回合需要的上下文。
- `/fast`：不再说切换了模型路由。它改的是采样温度，输出照实说，并指向 `/model`。

`/undo` 整个重做：只回答"最近一次编辑是哪一次、动了哪些文件、用哪条命令原样还原它"，
还原本身仍走已审计的 `/restore` 路径（因为那是会写工作树的动作）。`--hard` 被移除并解释原因。

## 三、剩下要补的（下一轮）

按价值排序：

1. **`/workflow` 需要一个消费者**。DAG 解析是真的，缺的是执行器：把批次交给回合调度，
   逐批执行并把每批结果回写状态。没有消费者的解析器等于没有。
2. **`/goal` 与 `/fast` 需要持久化**。两者都是进程内变量，重启即失。目标尤其不该丢——
   它存在的理由就是防止长会话里的目标漂移，而长会话最可能跨进程。
3. **`/brainstorm` 的问卷要真的依据 challenge**。模板常量在任何输入下给同一份问题。
4. **`/loop` 的自主驱动**。如果要它真的驱动修复回合，需要一个回合循环
   （改 → 跑门 → 读失败 → 再改），有迭代上限与逃逸条件。这是一个子系统，不是一次措辞修改。
