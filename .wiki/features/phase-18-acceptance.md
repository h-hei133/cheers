# Phase 18 完成验收核对

2026-10-05，基线8a998664。**整体未完成**。本表按裁决的44个编号项和8个小项保留52个执行位，
不是以当前已做工作重定义范围。精确接口、撤销验证及明确例外以phase-18-decisions.md §2/§4/§5/§6/§10为准。
“待最终复核”不表示重新施工；它表示既有实施记录尚未在本轮逐项核对，不自动变成完成。

| 执行位 | 必须证明的行为 | 证据入口 | 本轮核对状态 |
|---|---|---|---|
| 1 | 条件写入原文复核与冲突 | conditionalWrite/edit入口，§8.4 W1-1 | 待最终复核 |
| 2 | 非交互命令声明与默认拒绝 | slashRouter/nonInteractive，W1-2 | 待最终复核 |
| 3 | --json独立模式与全输出JSON | cliModeDispatch/输出器，W1-3 | 待最终复核 |
| 4 | 重复请求不虚称状态无进展 | turn/tools与doomLoopDetector，W1-4 | 待最终复核 |
| 5 | 日志年龄和数量上限 | rotatingFileSink与logs/retention，W1-5 | 待最终复核 |
| 6 | 浏览器关闭失败不得成功 | browser/sessionManager，W1-6 | 待最终复核 |
| 7 | /tree导航与损坏链准入 | session/query/navigation、cli/runtime/navigation，W2-7 | 待最终复核 |
| 8 | /back参数预选且确认后导航 | picker/rewind、overlay，W2-8 | 待最终复核 |
| 9 | 记忆命令使用真实健康状态 | memory/store/health与命令面，W2-9 | 待最终复核 |
| 10 | /btw失败分类与安全报告 | btwCommandRuntime、request/completion，W2-10 | 待最终复核 |
| 11 | 标准MCP协议与跨回合长连接 | core/mcp、runtime gateway生命周期，W3-11/R3 | 待最终复核 |
| 12 | 会话切换及两删除路径释放todo | todoPersistence、sessionLifecycleStore，W3-12 | 待最终复核 |
| 13 | 五个状态容器及外层表有界并标丢弃 | compact/memory状态owner，W3-13 | 待最终复核 |
| 14 | 锁持有保护及release身份校验 | session/store锁，W4-14；不加fencing | 待最终复核 |
| 15 | 用量持久化及provider/model分桶 | session/store/usage、observability/usage，W4-15 | 待最终复核 |
| 16 | 退役恒空parity规则而保留真实终态 | continuation与resume消费者，W4-16 | 待最终复核 |
| 17 | 单文件编辑边界与逐项恢复说明 | edit工具description及readiness，W5-17 | 待最终复核 |
| 18 | TERM/KILL与Windows等待，明确逃逸限制 | platform/processTree与local.process，W5-18 | 待最终复核 |
| 19 | Google单次/流式URL和转换成对 | provider端点与单次调用，W5-19 | 待最终复核 |
| 20 | 键位文档、索引和重绑定一致 | keyGuide/keybindings/keymap，W5-20 | 待最终复核 |
| 21 | sidebar snapshot命名与实际输出一致 | sidebar命令/补全，W5-21/R1 | 待最终复核 |
| 22 | 不可达数量使用最终闭包口径 | 登记册§12与Phase17最终闭包 | 待最终复核 |
| 23 | sidebar编号OBS-11/12唯一 | 登记册§10/§11bis及引用 | 待最终复核 |
| 24 | 浏览器/记忆/失败状态数字纠正 | 登记册与前置研究历史口径 | 待最终复核 |
| 25 | auto主题、48个实用令牌及4套预设 | themes令牌/加载/系统模式；W7-25裁决修正 | 待最终复核 |
| 26 | session四域逐模块行为矩阵 | phase-18-session-audit.md；本轮补齐46模块 | 有界证据已核对 |
| 27 | 四协议形状/流/用量/超时矩阵 | phase-18-provider-audit.md；明确认证准备限制 | 有界证据已核对 |
| 28 | receipt九模块的保证边界 | W7-28实施记录及receipt回归 | 待最终复核 |
| 29 | memory/context逐模块审计 | phase-18-memory-audit.md；当前38+29且审计后无代码漂移 | 有界证据已核对 |
| 30 | 子代理递归/继承/权限/工作区生命周期 | W7-30实施记录及subagents/task回归 | 待最终复核 |
| 31 | Shell完整行为矩阵 | phase-18-shell-audit.md；当前38，后续取消增量见W8-39 | 有界证据已核对 |
| 32 | startup六模块及旧read去重 | W7-32实施记录及startup/read回归 | 待最终复核 |
| 33 | 四端点真实TLS/HTTP2流边界 | 2026-10-05显式门禁auth/exit3；真实矩阵缺失 | 外部前置失败，未完成 |
| 34 | 父/定义/请求权限交集 | W8-34与W7-30共用证据 | 待最终复核 |
| 35 | Google流式alt=sse与单次方法 | W8-35与W5-19共用证据 | 待最终复核 |
| 36 | SSE多行data保留换行 | W8-36与Provider审计 | 待最终复核 |
| 37 | Retry-After跨失败step进入重试 | W8-37与Provider审计 | 待最终复核 |
| 38 | 空锁短宽限且读错误不夺锁 | session/store/lockStaleness，W8-38 | 待最终复核 |
| 39 | 取消持久化与订阅事件、信号退出 | cancellation.test及W8-39/Node20修正 | 有界证据已核对 |
| 40 | 子代理失败含部分答复仍报失败 | W8-40与task/runner回归 | 待最终复核 |
| 41 | MCP严格只读标注与真实权限门 | d0f7dfe2、toolPolicy和真实stdio回归 | 有界证据已核对 |
| 42 | /tools与模型共享当前工具目录 | 37685986；catalog/CLI；本轮双模式PTY | 有界证据已核对 |
| 43 | 研究命令去伪机制并改名 | 89c1dd18；collector/CLI；本轮双模式PTY | 有界证据已核对 |
| 44 | /review交给模型回合 | c8146b40；80项/CI；本轮双模式PTY | 有界证据已核对 |
| CMD-11 | 未闭合参数保留字面文本 | arguments测试与W5小项 | 待最终复核 |
| CMD-12 | marketplace持久化与移除假搜索 | marketplace/store与W4小项 | 待最终复核 |
| CMD-13 | reload显示主题加载失败 | reload命令与W5小项 | 待最终复核 |
| TUI-10 | 可视行映射与历史边界 | 编辑器/键位与W5小项 | 待最终复核 |
| TUI-11 | picker/补全点击聚焦及键盘确认 | pointer/overlay与W5小项 | 待最终复核 |
| OBS-13 | 别名候选和参数解析 | slashSuggestions与W2小项 | 待最终复核 |
| OBS-14 | 移除无消费newlineKey链 | W5小项及hotkey现有入口 | 待最终复核 |
| TOL-11 | 异步流式grep、取消/超时/限量 | 8a998664；51项与编译CLI，两项远端检查通过 | 有界证据已核对 |

## 验证与交付要求

- 每项提交及反转证据：保留裁决§8.4各批记录；仍需与上述待复核项逐一匹配，不用提交数量替代。
- 最新命令PTY：`.tmp/phase18-commands-pty-ep9szrra`，明确Node20.3；普通/全屏各运行/tools、/web-research、旧名/deep-research、/review。前三者零模型请求，review一次请求；工具列表与请求schema相同；评审文件/索引不变；退出0。运行时按既有设计写入`.ts-shell/prompt-history.txt`，不宣称工作区完全无副作用。
- 远端：c8146b40的CI 37216205149与Architecture Watch 37216205171成功；CI为557文件、5339通过、1既有跳过。8a998664的Architecture Watch 37216948768成功，CI 37216948763成功（559文件、5351通过、1既有跳过）。
- 本地门禁：最近代码批次构建、import-cycles/config-consumers/declarations/node-floor/docs-drift与43项脚本通过；NormProof阻断义务满足、advisory仍partial。没有全仓零advisory的结论。
- PR #1仍为draft/open，head已推送；用户要求提交至GitHub，不据此推断合并或发布授权。

## 范围与外部条件

R1使用W5-21默认snapshot方案，未实现真分栏；R2原文中143个fixture模块逐行审计属于独立待裁产品范围，不因session审计完成而冒充完成；R3标准MCP协议已随W3-11执行。
明确不做的多文件事务、fencing、subreaper/cgroup与CMD-05未知flag规则不重开；SES-02按裁决保留OPEN及缓解边界。

W7-33：清空调用环境的第一次探针为missing-config；保留既有显式环境后，安全门禁再次为auth/exit3。
不读取或转述真实配置，不落盘原始提供方响应；分类不足以判断凭据或端点根因。已请求用户通过既有安全渠道恢复认证，其余审计继续。
本地HTTP、合成SSE、绿CI与历史两端点可用记录都不能证明四端点真实TLS/HTTP2验收。
