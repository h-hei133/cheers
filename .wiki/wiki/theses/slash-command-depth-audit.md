---
title: "Slash 命令实现深度审计"
category: theses
created: 2026-09-02
updated: 2026-09-03
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

## 三、第二轮：四项全部补完

按上一轮排定的价值顺序，四项都落地了，且都不是措辞修改。

### 1. `/workflow` 有了执行器

原实现比"缺消费者"更糟：`run` 造四个样例任务，状态预先写成 `completed` 与
`in_progress`，`currentBatchIndex` 指向第二批，然后回答"initiated successfully"；
`status` 于此对着没有执行过的批次画勾。三个"模板"只是散文描述，没有实现。
**它显示的是编出来的进度。**

现在工作流由项目自己声明（`.agents/workflows/<name>.json`，步骤带 `needs` 依赖），
`DAGResolver` 解析出批次，`ParallelDispatcher` 以声明的并发度跑一批，失败批次终止整轮，
后续步骤记为 `skipped`——不是 `pending`，也不是 `passed`，这三个是不同的事实。
每步的判定就是它的退出码；失败步骤的输出原样带出，因为只有那段输出能让失败可行动。
运行记录落盘（`workflow.json`，与项目状态同目录），所以 `status` 在运行它的进程消失后
仍然回答的是发生过的事。

实测：4 批 / 5 步，两个 0.3s 的步骤并行完成于 0.3s 墙钟，`gate` 以真实 exit 3 失败，
`publish` 记为 skipped，重启后 `status` 从磁盘读回同一份记录。

### 2. `/goal` 与 `/fast` 落盘

两者共用一个按项目定位的状态文件（`~/.private-agents/projects/<name>-<hash>/state.json`）。
不是写进 settings：settings 由用户书写、经常入库，代理悄悄改它是另一种意外。也不是写进
session：同一项目里的新会话仍然应该知道要做的是什么。目录名带项目名（可读）与全路径哈希
（同名项目不共用一个文件）；子目录共享同一份状态（向上找 `.git`/`.agents`）。
读取从不抛错——缺失、截断、或版本不认识的形状都读成"没有记录"。写不成功会明说
"没能写到磁盘，进程结束就会丢"，而不是照旧说"已设置"。

### 3. `/brainstorm` 的问卷真的依据 challenge

原实现不只是问卷是常量：三个"假设"连优劣、复杂度、"过度工程风险分数"都是硬编码，
challenge 只被插进句子里。"multi-tenant rate limiter" 与 "in-memory cache" 得到同一份
权衡与同一个分数。**不随问题变化的权衡不是分析。**

现在它展开成提示词：三个"形状不同而非同一个说三遍"的方案、以此问题的约束陈述代价、
一个说明"什么会推翻它"的推荐（没有可推翻条件的主张是偏好而非权衡），并要求读相关文件、
不许用编出来的分数排序。`-i` 只问不答，且要求先看仓库已经回答了哪些问题；`-s` 让模型用
write 工具落盘，并且**只有工具报告成功之后**才允许说出路径。三个模板类连同其测试一并删除。

### 4. `/loop` 真的驱动修复

门先在本地跑一次，它打印的东西直接进提示词——这个顺序是关键：失败是被观察到的，
而不是被描述的。门已经通过时不花任何回合，命令直接回答并停止。

驱动重复的是已经存在的 agent 回合循环：它用工具改、用工具跑、读回来的东西、再来一遍，
有回合预算与重复调用检测兜住。这条命令瞄准那个循环，不在旁边再造一个。协议要求每次尝试
以"用 bash 重跑门并读它说什么"结束——那是把"修好了"从主张变成观察的唯一办法；
逃逸条件写成条件而非鼓励（同一失败原样再来一次就说清排除了什么，而不是第三次同样的编辑）。
尝试数是告诉模型的预算，回合预算是真正的界——两者都写出来，因为只有建议性的上限
不该被描述成强制的。

实测：一个 `for (let i = 1; ...)` 少加首元素的 bug，门 exit 1；一次尝试内定位、
改成 `i = 0`、用 bash 重跑门看到 exit 0，报告里给出原因、最小改动与验证。
再跑一次同一命令：`already passes`，没有请求任何回合。

## 四、`/connect` 的 OAuth

原来是两份各约五百行的实现（openai 与 google），各自带一份 PKCE 数学、回调服务器、
浏览器启动、令牌交换与重试策略——意味着修好一边另一边照旧坏着，而两边都没有刷新。

现在是一条共享流程加每个 provider 一份声明（端点、client id、scope、端口、
该服务器要求的额外授权参数）。954 行变成 731 行，并且多了原本两边都没有的东西：

- **令牌刷新**。没有它，登录一小时后失效，且失效的样子像 provider 坏了而不是令牌过期。
  服务器轮换 refresh token 时用新的，不轮换时保留旧的——在不轮换的 provider 上丢掉旧的，
  会把一个能用的登录变成下次刷新即死。
- **端口回退**。原实现在 1455 被占用时以 EADDRINUSE 结束登录，并建议去找占用它的进程。
- **授权 URL 由真正绑定到的端口构造**。反过来做（用希望的端口）会在端口被占时产生
  `redirect_uri_mismatch`，读起来像配置错误。
- **不再往 stdout 写诊断**。终端属于正在绘制它的东西，一行打在帧中间就落在界面里。
- **keep-alive 套接字立即丢弃**。浏览器保持连接复用，而 `close` 等所有套接字结束：
  等一个 keep-alive 空闲超时会给已经结束的登录再加几秒。实测 12.1s → 90ms。

Anthropic 的 OAuth 没有加：它需要把另一个产品的 client id 与一个以该产品命名的 scope
（`user:sessions:claude_code`）写进代码里，这与"项目里不出现他方名字"直接冲突。
OpenAI 那条已有的授权参数（`originator`、`codex_cli_simplified_flow`）是该授权服务器
对这个 client 的硬性要求，去掉登录就失败，因此原样保留并在声明处注明它们是 wire 值而非
本项目选的名字——与 catalog 里 `claudecode` runtime id 的既有处理一致。

Google 仍要求用户自带 Desktop OAuth client id（`GOOGLE_OAUTH_CLIENT_ID`）。这比另一种
做法多一步设置，也是诚实的那一种：另一种是带上别人的 client 凭据，以他们的应用身份登录。

## 五、第三轮：又三个说了没发生的事

前两轮按用户点名的 15 个命令审计。这一轮反过来查那些没被点名、看着"真实"的命令，
判定标准不变：**输出所声称的事情，是否真的发生了**。

### `/export` 导出了一个不含对话的文件

Markdown 分支的整个正文是一句话——`(Session transcript recorded and preserved in
working store)`——然后命令回答"Session history successfully exported"。
JSONL 分支只写一行 header。**文件里没有任何对话，却被描述成对话的导出。**
这是对一次写入的虚假成功声明。

现在它读会话真正记录的 transcript（`readTranscriptEvents` +
`projectTranscriptMessages`），Markdown 里工具结果折进 `<details>`（它们是发生过的事，
但通常比周围一切都长），JSONL 一行一条消息。空 transcript 报告为空并且**不写文件**，
而不是把"成功导出了零条对话"写出来。用你那个流式 bug 的会话实测：8 条消息、4 问 4 答，
文件 1255 字节，内容对得上。

### `/context` 把编出来的数字放在"Measured Tokens"表头下

- 没有回合时 footprint 回退到字面量 `2_500`
- 系统提示词 = `min(1500, footprint * 0.35)`
- 工具 schema = 固定 `1_200`，说明写"11 core & web tool parameter definitions"（我们有 13 个）
- history = 剩下的

四行里三行是发明的，而一份上下文报告存在的意义就是被核对。现在只报可测的量：
工具 schema 按**真正上线的字节**序列化后计数（`buildOpenAITools(createCoreToolRegistry())`），
prompt 总量取 provider 上报的值，剩下的部分**命名为余数**而不是拆成发明的几份。
没跑过请求就说没跑过，而不是编一个 2500。

### `/cost` 把固定费率的乘法叫做 "Actual Cost"

token 数是实测的（provider 上报），钱不是——费率表是常量，不随模型变化。
表头改为 "Estimated" 并把费率显示在旁边，末尾说明"以 provider 账单为准"。

### 顺带清掉的死配置

`TuiSettings` 有五个字段，只有 `statusItems` 被读过：`mode`、`resizeScrollback`
（随备用屏迁移一起失效）、`showThinking`、`theme` 全都是声明了但无人读取的旋钮。
**不起作用的旋钮比没有旋钮更糟，因为它是界面没有兑现的承诺**，一长串这样的旋钮就是
一个配置页面而不是一个好的默认值。删掉四个，剩下的由项目决定：会话独占一屏、
推理放在可折叠块里、主题跟随终端。

这也是不加 `/settings` 的原因——用户明确说不要那种高自定义形式。

## 六、新增的三个命令

从 omp 的 182 个内置命令里**有意识地挑**，标准是：日常真的会用、能接在已有子系统上、
不与现有命令重复。

### `/commit`

先在本地读 `git status --short` 与 `git diff --staged`，把 diff 放进提示词。
**从描述写出来的提交信息说的是这次改动本该是什么，从 diff 写出来的说的是它是什么。**
协议要求先跑 `git log --oneline -12` 按仓库自己的惯例来（它自己的惯例胜过任何通则）、
主题行说改了什么和为什么而不是哪些文件动了、用工具提交并读回它打印的东西再报告 hash。

**不代替用户 stage。** stage 决定这次提交包含什么，而那是唯一一件事后无法纠正的事，
所以空索引报告为空并列出可以 stage 的东西，而不是挑一个。

实测：一个 `Number(value)` 改成严格解析 + 范围检查的改动，它读了仓库只有一条提交的 log、
判断惯例是小写祈使句而非 Conventional Commits、写出 `validate port range in parsePort`
加一段说明为什么，用 heredoc 提交让正文换行存活，报告了真实 hash `a67962e`。

### `/tools`

直接读构建请求的那个 registry，所以列表不可能与实际提供的工具漂移——
手工维护的工具名单在第一次加工具时就错了，而且没人会注意到，直到模型调用一个名单说
不存在的东西。plan 模式逐工具标注（allowed / blocked / read-only）而不是用散文描述
"只读工具是允许的"——后者无法核对，前者可以。`/tools <name>` 给出参数表与必填项。

### `/thinking`

发 `reasoning_effort`（OpenAI 兼容拼法）。这里有一个真实的死配置要清理：
`thinkingBudget` 在 `config/types.ts` 里声明了，**从未被任何请求使用**。

实测 SiliconFlow 的 DeepSeek 确实响应这个字段（同一道题：low 690 / medium 970 /
high 1721 reasoning tokens，不设为 2028），所以这不是空写。措辞上不声称 token 预算——
字段收的是级别，级别值多少由 provider 决定。不支持的 provider 忽略它；**拒绝它的
provider 会被丢掉该字段并原地重试这一回合**（本地 mock 双向实测：接受时发一次即完成，
拒绝时发两次、第二次不带该字段、用户看到答案而不是 provider 错误）。
