# Phase 18 完成验收核对

2026-10-05，基线8a998664。**整体未完成**。本表按裁决的44个编号项和8个小项保留52个执行位，
不是以当前已做工作重定义范围。精确接口、撤销验证及明确例外以phase-18-decisions.md §2/§4/§5/§6/§10为准。
本轮完成51个执行位的有界证据核对；第33项仍缺外部验收条件。核对包括当前源码/断言和既有验证记录，
不代表本轮重跑全部测试，也不把合成传输提升为真实提供方证据。

| 执行位 | 必须证明的行为 | 证据入口 | 本轮核对状态 |
|---|---|---|---|
| 1 | 条件写入原文复核与冲突 | conditionalWrite/edit入口，§8.4 W1-1 | 有界证据已核对 |
| 2 | 非交互命令声明与默认拒绝 | slashRouter/nonInteractive，W1-2 | 有界证据已核对 |
| 3 | --json独立模式与全输出JSON | cliModeDispatch/输出器，W1-3 | 有界证据已核对 |
| 4 | 重复请求不虚称状态无进展 | turn/tools与doomLoopDetector，W1-4 | 有界证据已核对 |
| 5 | 日志年龄和数量上限 | rotatingFileSink与logs/retention，W1-5 | 有界证据已核对 |
| 6 | 浏览器关闭失败不得成功 | browser/sessionManager，W1-6 | 有界证据已核对 |
| 7 | /tree导航与损坏链准入 | session/query/navigation、cli/runtime/navigation，W2-7 | 有界证据已核对 |
| 8 | /back参数预选且确认后导航 | picker/rewind、overlay，W2-8 | 有界证据已核对 |
| 9 | 记忆命令使用真实健康状态 | memory/store/health与命令面，W2-9 | 有界证据已核对 |
| 10 | /btw失败分类与安全报告 | btwCommandRuntime、request/completion，W2-10 | 有界证据已核对 |
| 11 | 标准MCP协议与跨回合长连接 | core/mcp、runtime gateway生命周期，W3-11/R3 | 有界证据已核对 |
| 12 | 会话切换及两删除路径释放todo | todoPersistence、sessionLifecycleStore，W3-12 | 有界证据已核对 |
| 13 | 原五容器：四个有界并标丢弃，readCache已退役 | compact/memory状态owner，W3-13 | 有界证据已核对 |
| 14 | 锁持有保护及release身份校验 | session/store锁，W4-14；不加fencing | 有界证据已核对 |
| 15 | 用量持久化及provider/model分桶 | session/store/usage、observability/usage，W4-15 | 有界证据已核对 |
| 16 | 退役恒空parity规则而保留真实终态 | continuation与resume消费者，W4-16 | 有界证据已核对 |
| 17 | 单文件编辑边界与逐项恢复说明 | edit工具description及readiness，W5-17 | 有界证据已核对 |
| 18 | TERM/KILL与Windows等待，明确逃逸限制 | platform/processTree与local.process，W5-18 | 有界证据已核对 |
| 19 | Google单次/流式URL和转换成对 | provider端点与单次调用，W5-19 | 有界证据已核对 |
| 20 | 键位文档、索引和重绑定一致 | keyGuide/keybindings/keymap，W5-20 | 有界证据已核对 |
| 21 | sidebar snapshot命名与实际输出一致 | sidebar命令/补全，W5-21/R1 | 有界证据已核对 |
| 22 | 不可达数量使用最终闭包口径 | 登记册§12与Phase17最终闭包 | 有界证据已核对 |
| 23 | sidebar编号OBS-11/12唯一 | 登记册§10/§11bis及引用 | 有界证据已核对 |
| 24 | 浏览器/记忆/失败状态数字纠正 | 登记册与前置研究历史口径 | 有界证据已核对 |
| 25 | auto主题、48个实用令牌及4套预设 | themes令牌/加载/系统模式；W7-25裁决修正 | 有界证据已核对 |
| 26 | session四域逐模块行为矩阵 | phase-18-session-audit.md；本轮补齐46模块 | 有界证据已核对 |
| 27 | 四协议形状/流/用量/超时矩阵 | phase-18-provider-audit.md；明确认证准备限制 | 有界证据已核对 |
| 28 | receipt原九模块及新增validation保证边界 | W7-28实施记录及receipt回归 | 有界证据已核对 |
| 29 | memory/context逐模块审计 | phase-18-memory-audit.md；当前38+29且审计后无代码漂移 | 有界证据已核对 |
| 30 | 子代理递归/继承/权限/工作区生命周期 | W7-30实施记录及subagents/task回归 | 有界证据已核对 |
| 31 | Shell完整行为矩阵 | phase-18-shell-audit.md；当前38，后续取消增量见W8-39 | 有界证据已核对 |
| 32 | startup六模块及旧read去重 | W7-32实施记录及startup/read回归 | 有界证据已核对 |
| 33 | 四端点真实TLS/HTTP2流边界 | 2026-10-05显式门禁auth/exit3；真实矩阵缺失 | 外部前置失败，未完成 |
| 34 | 父/定义/请求权限交集 | W8-34与W7-30共用证据 | 有界证据已核对 |
| 35 | Google流式alt=sse与单次方法 | W8-35与W5-19共用证据 | 有界证据已核对 |
| 36 | SSE多行data保留换行 | W8-36与Provider审计 | 有界证据已核对 |
| 37 | Retry-After跨失败step进入重试 | W8-37与Provider审计 | 有界证据已核对 |
| 38 | 空锁短宽限且读错误不夺锁 | session/store/lockStaleness，W8-38 | 有界证据已核对 |
| 39 | 取消持久化与订阅事件、信号退出 | cancellation.test及W8-39/Node20修正 | 有界证据已核对 |
| 40 | 子代理失败含部分答复仍报失败 | W8-40与task/runner回归 | 有界证据已核对 |
| 41 | MCP严格只读标注与真实权限门 | d0f7dfe2、toolPolicy和真实stdio回归 | 有界证据已核对 |
| 42 | /tools与模型共享当前工具目录 | 37685986；catalog/CLI；本轮双模式PTY | 有界证据已核对 |
| 43 | 研究命令去伪机制并改名 | 89c1dd18；collector/CLI；本轮双模式PTY | 有界证据已核对 |
| 44 | /review交给模型回合 | c8146b40；80项/CI；本轮双模式PTY | 有界证据已核对 |
| CMD-11 | 未闭合参数保留字面文本 | arguments测试与W5小项 | 有界证据已核对 |
| CMD-12 | marketplace持久化与移除假搜索 | marketplace/store与W4小项 | 有界证据已核对 |
| CMD-13 | reload显示主题加载失败 | reload命令与W5小项 | 有界证据已核对 |
| TUI-10 | 可视行映射与历史边界 | 编辑器/键位与W5小项 | 有界证据已核对 |
| TUI-11 | picker/补全点击聚焦及键盘确认 | pointer/overlay与W5小项 | 有界证据已核对 |
| OBS-13 | 别名候选和参数解析 | slashSuggestions与W2小项 | 有界证据已核对 |
| OBS-14 | 移除无消费newlineKey链 | W5小项及hotkey现有入口 | 有界证据已核对 |
| TOL-11 | 异步流式grep、取消/超时/限量 | 8a998664；51项与编译CLI，两项远端检查通过 | 有界证据已核对 |

## 最终复核证据索引

下表路径相对 `packages/ts-shell/src/`；波次对应裁决文档的同名实施记录，保留其中的失败分类、反转及PTY边界。

| 执行位 | 当前断言与复核结论 |
|---|---|
| 1–3 | `runtime/execution/conditionalWrite.test.ts` 覆盖快照前后原字节比较、外部进程改写、删除及BOM/CRLF；registry三类编辑转交expectedContent。`core/commands/nonInteractive.test.ts` 覆盖默认拒绝且execute不运行、允许的退出/清空别名。`entrypoints/cliModeDispatch.test.ts` 与 `presentation/terminal/jsonEvents.test.ts` 覆盖JSON独立入口、文本转义及非成功事实；实际CLI/JSON记录见W1。 |
| 4–6 | `turn/tools.test.ts` 的重复调用/请求循环断言不将检测器描述为状态进展判断。`observability/logs/retention.test.ts` 覆盖年龄/数量、当前记录、其他活跃进程及不可读存活信息；`browser/sessionManager.test.ts` 覆盖初始化并发、逐资源关闭失败、保留句柄后重试。 |
| 7–10 | `cli/runtime/navigation.test.ts`、`session/query/navigation.test.ts` 验证持久叶节点、损坏祖先和busy拒绝；`cli/interactive/picker/rewind.test.ts` 验证参数仅预选、Enter才导航。`memory/store/health.test.ts` 区分disabled/损坏/不可读并读取修复后状态；`core/commands/btwCommandRuntime.test.ts` 验证分类、期限和私密正文不显示。 |
| 11–13 | `core/mcp/lifecycle.test.ts` 以真实stdio子进程验证握手、跨回合复用、替换/关闭和断线不重放；SessionManager与runtimeContext回归覆盖todo清理。compact checkpoint/injection、memory review/injection的内外层上限及dropped/incomplete断言仍在。第五个readCache按W7-32退役，不能称为五个现存缓存均通过。W3容量反转7失败、标记反转8失败是当时证据。 |
| 14、38 | `session/store/lockStaleness.test.ts`、`session/store/sessionFileStore.test.ts` 验证活跃本机PID不因过龄被夺锁、release身份、空锁短宽限和读错误保守处理。同步临界区采用活跃持有者保护，未实现同线程heartbeat；PID复用可能保守等待，缺身份宽限只是恢复启发式，不是fencing。W4-14反转8失败，SES-09反转2失败；SIGSTOP/CONT实进程证据保持原边界。 |
| 15–18 | `session/store/usage.test.ts`、`observability/usage/persistence.test.ts` 覆盖锁内增量及真实provider/model桶；W4-15双模式PTY恢复用量。`session/sessionResultParity.test.ts` 保留真实stopped原因，`session/sessionCompactModule.test.ts` 拒绝退役标签，不把文件名中的parity误判为旧恒空规则。registry编辑说明与 `edit/result/editCapabilityReadiness.test.ts` 明确逐文件提交。`core/shell/platform/termination.test.ts` 验证TERM宽限、KILL、不可观测失败与Windows launcher等待；逃逸子孙/父SIGKILL仍不保证。 |
| 19、35–37 | `provider/endpoints/googleRequests.test.ts` 捕获单次与流式URL及解码；`provider/endpoints/sse.test.ts` 逐字节输入LF/CRLF/CR及多字节文本，非法字符串跨data行不得拼出答案；`turn/retry.test.ts` 覆盖Retry-After跨失败step、上限、长定时器及取消。W5-19及Provider审计保留撤销/本地HTTP/PTY证据，不代表真实Google或四端点传输通过。 |
| 20–24 | `cli/interactive/keyGuide.test.ts` 比对动作/手势表和文档示例实际重绑定。`core/commands/sidebarOverlay.test.ts` 与 `presentation/sidebar/sidebarLivePanelRuntime.test.ts` 验证snapshot及旧别名单帧、补全不再承诺watch；W5-20/21双模式PTY记录已核对。登记册保留CDE-01历史12候选、最终闭包来源；OBS-03/04/11/12编号独立，浏览器历史164与后续167区分，CTX-08及PRV-04状态按修复事实纠正。当前可达性门检查906模块、7项advisory，未将其称为零问题。 |
| 25 | `presentation/theme/selection.test.ts` 覆盖auto迟到报告、具名选择不被覆盖、加载失败保留现态和自动内置palette；`presentation/themes/presets.test.ts` 覆盖四套预设、完整令牌及对比度。48令牌口径及新增语法/Markdown消费见W7-25修正；两批反转分别5/4失败，双模式PTY验证真实ANSI及切换。 |
| 28 | W7-28原九owner矩阵及新增 `browser/receipt/validation.test.ts` 覆盖派生字段一致性、非法日期、循环及冲突tombstone；lifecycle/persistence回归覆盖旧owner、替换身份、读回失败、rename旧字节保留、写入与cleanup分别结算。18套137项与26失败反转为既有记录。仅稳定本地目录中合作写入方互斥，不承诺fencing/fsync或认证作者。 |
| 30、34、40 | `core/subagents/boundary.test.ts`、`turn/subagent.test.ts` 验证工具交集、禁递归、父/定义/请求最窄模式、拒绝继承、定义不能授予批准权；实际模型schema与可执行工具相同。`core/tools/taskWorkspace.test.ts`、worktree回归覆盖分配/取消/清理/脏目录保留；taskTool与runner回归保证部分正文不能提升失败。既有真实注册表合成运行不冒称真实模型委派。 |
| 32 | `core/tools/readFreshness.test.ts` 四条回归分别覆盖同mtime改写、读取后改写、父子共享目录正文可见、新上下文复用session标识；旧缓存已删除。startup六模块矩阵仍见W7-32，health回归验证禁用无I/O、结构/项目/签名/TTL及256KiB界限；未知来源不能称fresh。既有warmup双模式PTY仅证明本地默认禁用/阻断。 |
| 小项 | `core/commands/arguments.test.ts` 未闭合引号保留正文，尾反斜杠仍报语法错误；marketplace store验证持久化与失败保留旧字节；reload回归验证失败保留主题并显示原因。`cli/interactive/keymap.test.ts` 覆盖可视行走完才进历史，overlay/pointer验证鼠标聚焦及拖动归属；slashSuggestions验证别名参数与动态缓存失效。当前源码无newlineKey。W4/W5及W2小项已有反转/PTY记录按各自范围保留。 |

结果门禁的旧路径/旧标记债务已在W7-31第九批修复，当批6套136项、43项脚本及反转后复跑通过；
此前各批记载的失败仍是历史事实，不改写旧日志。本轮没有重跑该动态门禁，也没有新增独立审查结论。

## 验证与交付要求

- 每项提交及反转证据：已匹配裁决§8.4各批记录及后续同名实施小节；纯文档项22–24不要求代码反转。当前代码测试结果来自8a998664及各批记录，本次仅复核断言，不重复构建/测试。
- 最新命令PTY：`.tmp/phase18-commands-pty-ep9szrra`，明确Node20.3；普通/全屏各运行/tools、/web-research、旧名/deep-research、/review。前三者零模型请求，review一次请求；工具列表与请求schema相同；评审文件/索引不变；退出0。运行时按既有设计写入`.ts-shell/prompt-history.txt`，不宣称工作区完全无副作用。
- 远端：c8146b40的CI 37216205149与Architecture Watch 37216205171成功；CI为557文件、5339通过、1既有跳过。8a998664的Architecture Watch 37216948768成功，CI 37216948763成功（559文件、5351通过、1既有跳过）。
- 文档基线bed97496的CI 37218193877与Architecture Watch 37218193870均成功；本次追加验收文档的提交需单独核对远端结果。
- 本次文档验收：docs strict、diff check、import-cycles、config-consumers、declarations与node-floor实际通过；引用测试文件路径存在。
- 本地门禁：最近代码批次构建、import-cycles/config-consumers/declarations/node-floor/docs-drift与43项脚本通过；NormProof阻断义务满足、advisory仍partial。没有全仓零advisory的结论。
- PR #1仍为draft/open，head已推送；用户要求提交至GitHub，不据此推断合并或发布授权。

## 范围与外部条件

R1使用W5-21默认snapshot方案，未实现真分栏；R2原文中143个fixture模块逐行审计属于独立待裁产品范围，不因session审计完成而冒充完成；R3标准MCP协议已随W3-11执行。
明确不做的多文件事务、fencing、subreaper/cgroup与CMD-05未知flag规则不重开；SES-02按裁决保留OPEN及缓解边界。

W7-33：清空调用环境的第一次探针为missing-config；保留既有显式环境后，安全门禁再次为auth/exit3。
不读取或转述真实配置，不落盘原始提供方响应；分类不足以判断凭据或端点根因。已请求用户通过既有安全渠道恢复认证；本地验收复核已完成，等待该外部条件后再重试真实矩阵。
本地HTTP、合成SSE、绿CI与历史两端点可用记录都不能证明四端点真实TLS/HTTP2验收。
