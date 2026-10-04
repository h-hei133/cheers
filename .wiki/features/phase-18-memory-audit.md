# Phase 18 记忆与上下文行为审计

W7-29仍在执行。本批只闭合存储事务、候选身份、检索排序和显式注入准入；
不以定向测试通过代替全部模块的行为审计。当前非测试模块为memory 38、context 29；
裁决中的36+28是历史数量，本批开始时为37+28，新增一个存储事务owner。
以下源码路径相对 `packages/ts-shell/src/`。

## 第一批：存储与检索边界（2026-10-04）

| 问题与决策 | 实现 | 可执行证据 |
|---|---|---|
| 删除直接截断JSONL，失败可能丢失其他记录；不同进程读改写互相覆盖 | `memory/store/transaction.ts`复用既有文件锁，锁内读取；删除复用`session/store/sessionFileStore.ts`的临时文件、fsync及rename，提取文本写入供JSON写入共用 | `memory/store/transaction.test.ts`：部分写入、rename失败、锁占用、锁后重读；`memory/store/concurrency.test.ts`：六个独立进程同时保存同一记录、各自新增和删除 |
| 显式recordsFile别名可能锁不同文件或被删除操作替换 | 物理路径归一后同时用于锁和读写；悬空符号链接拒绝；新目录0700、文件0600 | 同一目标经别名争锁、成功删除保留符号链接、悬空链接与权限断言 |
| 合法JSON但枚举错误进入排序和呈现；写入端接受不符合契约的对象 | `memory/memoryPersistence.ts`共享记录校验；错误行保留诊断，健康记录仍可读，损坏存储拒绝继续修改 | `memory/memoryPersistence.test.ts`验证读写准入与损坏行；startup fixture改为合法枚举并断言实际写入成功 |
| 非拉丁文本及同一长前缀产生相同候选ID | `memory/projectMemoryCandidate.ts`对完整trim后文本计算摘要，删除旧slug截断 | `memory/projectMemoryCandidateExtractor.test.ts`覆盖不同中文和相同长前缀、重复稳定性 |
| 时间取模导致较旧记录周期性排在新记录之前 | `memory/projectMemoryRetrieval.ts`先相关性、再真实时间、再ID稳定排序 | `memory/projectMemoryRecallCommandRunner.test.ts`覆盖跨日期边界排序 |
| wake先截取20条再分层，可能丢掉稳定事实；待审/拒绝记录进入显式注入 | wake先按准入与层级筛选再应用5/8条上限；adapter及消费阶段复用`memoryRecordIsInjectable` | 同套件覆盖30条临时事实不能挤掉稳定事实；`memory/projectMemoryFutureTurnInjection.test.ts`覆盖待审、never-remember与rejected记录 |

## 参考决策与差异

检查目标实现之后，定向复核本地参考的`core/settings-manager.ts:331-359`：
已有文件先取锁再读、回调修改、finally释放。采用该顺序并复用本仓锁；
不同之处是本仓对不存在的文件也在读取之前取锁，且显式别名使用物理路径，删除不直接截断原文件。
锁前读取的反转由事务测试中“前一写入方记录仍保留”的断言捕获。

本地记忆参考的`memory/main.py:1008-1034`按完整UTF-8文本摘要去重：采用完整文本身份，
沿用本仓已有SHA-256；不引入数据库或另一套候选管理。
另一参考的`searcher/sqlite_bm25.py:220-245`按created_at降序回退：采用真实时间排序，
本仓保留既有相关性优先，不照搬全文检索后端。中文/长前缀与跨日期断言覆盖这些决策。

## 验证与边界

- 隔离HOME/USERPROFILE/TMPDIR、CHEERS_TEST_ROOT与Git ceiling，运行
  `npm run test -w packages/ts-shell -- --threads=false src/memory src/context src/session/store src/core/commands/slashRouter.test.ts`：48套297项通过。
- `npm run build:cli`、五个静态阻断门、43项脚本测试通过。NormProof两项图义务满足，exit0；整体仍partial，六个职责上限advisory不属于本批新增模块。
- 九个生产文件撤销到HEAD后，五套回归25失败/30通过；逐文件字节恢复，以上297项在恢复后通过。
- 普通与全屏编译JS CLI各执行wake→delete→recall：30条临时事实之外的稳定事实可见；删除报告与磁盘相符，独有词检索为0，保留30条其他记录和一条删除墓碑，无残留锁，两模式exit0。无provider调用。
- 首次PTY查询含公共证据词，正确匹配了其他记录；按独有词修正验收后通过，没有为验收修改产品检索规则。
- 初次测试命令经根npm脚本转发时被npm拒绝`--threads`，改为直接运行workspace脚本；该次不算测试执行。

原始证据位于仓内`.tmp/memory-final-MjPFqj`、`.tmp/memory-reversal-huxpt9li`和
`.tmp/memory-pty-jdcw1tyy`。本批为主代理复核，未取得独立审查结论。

保证仅覆盖遵守相同文件锁的写入方；外部直接修改、硬链接别名、跨主机锁fencing不在保证内。
追加仍使用原JSONL追加策略，不承诺断电或ENOSPC下追加完整；损坏行会阻止后续修改并保留可读记录。
原子替换不等于跨文件事务或目录fsync后的断电持久性。CLI验证覆盖显式命令；模型注入准入由定向测试验证，未宣称本批完成模型端PTY验收。

## 后续范围

继续按W7-29核对剩余候选提取/质量、冲突与审批、注入预算/合并/消费、context选择与compact各owner的行为证据。
既有startup与compact修复可复用原测试和裁决，但须逐模块映射后才能关闭本项；之后才继续W7-33及剩余W8。


## 第二批：批准对象、保存准入与冲突键（2026-10-04）

`projectMemoryReviewState.ts`原先只按摘要继承批准；摘要不变而证据、保留范围、理由或安全状态变化，
新对象会获得旧批准。现使用Node已有的深比较核对完整候选，字段变化回到该候选的初始待审状态，
清除旧决定时间；内容完全相同的重新装配保留批准，不引入第二套审批存储。

`projectMemorySaveCommandRunner.ts`原先计算quality但不执行拒绝项，且会把session-scoped-only写入持久文件。
现在逐个已批准候选同时满足safe、持久保留范围和无quality reject才调用writer。
一条不合格候选不会阻止其他合格批准保存；缺证据、原文理由、错误的临时事实保留范围与session-only均有反例。
原“存储层拒绝原文”断言改为更早的“零writer调用、质量拒绝且磁盘无文件”，没有删除该场景。

`projectMemoryConflictDetection.ts`结构化键改为序列化元组，避免subject/predicate中的冒号产生假冲突。
否定短语先归为否定状态；同时有肯定/否定的文本不推断单一状态。词面矛盾仍只警告，
同一结构化事实的不同值才阻止注入，不增加自动失效或模型裁决。

### 定向参考与差异

参考工具的`tools/edit.ts:835-875`把原内容和新内容同时纳入确认对象；`575-586`比较内容摘要后使用新版本修正。
这支持把批准绑定具体对象而非展示摘要，但它不是等价的记忆审批协议：完整候选刷新失效和quality准入是本仓自研，
没有宣称参考具备同一实现。变化五字段的审批回归以及完整相同对象保持批准验证该边界。

参考记忆图的`utils/maintenance/edge_operations.py:538-573`在显式关系和有效期上处理矛盾，
不靠几个英文状态词自动覆盖事实。本仓保留结构化冲突与词面提示的强度差异；
不引入它的模型判定/自动过期机制。否定、混合文本、元组边界与明确冲突共8项直接断言覆盖此决策。

### 验证及第一批CI补正

第一批ba9b29b2的CI 37206366059为5259通过/1失败/1跳过；唯一失败是并发测试使用
`--import tsx`在Node 20.3不能加载.ts。该测试现通过既有tsx CLI启动独立进程，
没有修改Node floor、package scripts或生产行为；Node 20.3单项实跑通过。
同版本下，隔离HOME等目录运行memory、context和slashRouter共37套254项通过。
当前Node上的相同254项也通过；build:cli、静态阻断门和43项脚本测试通过。
三生产owner撤销后18失败/8通过（含原存储拒绝场景现要求更早拒绝），字节恢复后三套26项通过。

证据：`.tmp/memory-quality-floor-3BV9ze`、`.tmp/memory-quality-Bh64qT`、
`.tmp/memory-quality-reversal-gu84bmpl`、`.tmp/memory-nodefloor-ELXa6w`。
本批未运行新的PTY或真实provider验收；审批/保存接线由真实slashRouter测试覆盖，第一批PTY不作为本批审批证据。
主代理复核，未取得独立审查结论。W7-29仍未完成，注入质量与剩余owner的逐模块映射继续。


## 第三批：注入预算与边界（2026-10-04）

记忆和compact预算器原先让关键行无条件突破maxChars，并在超限后把结束标记移动到部分正文之前。
`context/budget/lines.ts`现在共用线性行选择逻辑：预留必需行和裁剪说明的容量，
其余完整行按原顺序保留；结束标记不重排。无容量保留必需内容时返回fits=false和空context。
两个planner在消费状态之前检查fits，拒绝该次注入并保留pending，后续足够预算仍可使用。
保留各owner已有关键行分类和列表上限，不引入另一套注入状态；context新增一个生产模块，现为29个。

定向参考`core/tools/truncate.ts:78-140`：首行已超限时返回空内容和明确标志，
只收集完整且不超限的行。采用“放不下就显式拒绝”和完整行边界；不同点是本仓沿用字符预算，
需要优先预留既有关键行，不能照搬该工具输出的字节前缀截断。共享预算测试覆盖两种格式、
无效/微小上限、超大关键行、原顺序、闭合标记及显式裁剪说明；两个planner测试验证pending不被消费。

隔离环境memory/context/slashRouter共38套268项通过，CLI构建通过；四个owner撤销后17失败15通过，
逐字节恢复后三套32项通过。最终行选择实现移除重复字符串拼接，八套41项再通过。
静态阻断门和43项脚本测试通过，职责上限六项既有advisory；独立审查与新PTY未执行。
证据位于`.tmp/context-budget-final-ZXhOA7`、`.tmp/context-budget-reversal-hdb8uag7`和
`.tmp/context-budget-linear-hIZcZO`。预算拒绝由planner返回显式warning，未宣称整个回合失败。
W7-29仍需完成其余模块行为映射；本批不以预算测试代替整体上下文正确性。


## 第四批：源码事实身份与解析边界（2026-10-04）

`context/acquisition/code/source.ts`原来把路径、factId与展示摘要都裁成220字符，
并压缩路径中的连续空格。两个长路径/ID或不同空格文件名会被错误合并，目标筛选可能使用另一文件的事实。
现路径和ID保留完整身份，仅展示摘要裁剪；保留既有反斜杠分隔符归一，不新增文件访问。
新增断言覆盖长前缀碰撞、ID选择、连续空格、空证据过滤、冻结结果和不从成功诊断文字制造事实。

目标检查后定向对照参考`core/tools/path-utils.ts:48-58`：路径解析保留完整路径，并优先使用原本存在的文件。
采用身份不使用展示摘要截断的边界；本仓此层只是事实匹配，不复制文件探测、Unicode候选查找或cwd解析。
反转source owner后2失败2通过，字节恢复后4项通过。

`context/graph/ast/parser.test.ts`补8项直接断言：TSX声明/导入/位置、扩展名、JSON无符号及残缺TS容错。
这些测试仅证明当前TS/JS语法提取入口；其他语言仍是基于行的声明提示，不能宣称完整AST、语义引用或准确嵌套关系。
没有为了扩大测试数量重写解析器或更改工具能力承诺。

隔离context、core/tools/lsp和session/harness/state共27套136项、build:cli、静态阻断门与43项脚本通过。
原始证据`.tmp/context-identity-ILbPED`与`.tmp/source-identity-reversal.log`。本批无新PTY或独立审查结论。
771e0c21的主CI 37207619451已成功，架构检查37207619453成功；cf994879主CI仍在运行，未记为通过。

### 剩余审计的固定范围

后续只完成既定W7-29的模块映射与必要反例，不继续扩大相邻功能：

| 待收口部分 | 已有入口 | 尚需确认的内容 |
|---|---|---|
| 候选提取与评审呈现 | candidateExtractor、reviewCommandRunner、saveCommandRunner测试 | 逐字段来源与派生状态，审核/保存/持久化边界一致 |
| 注入质量、合并与命令契约 | futureTurnInjection、injectionState、Chain、slashRouter测试 | 空结果、损坏读取、替换与消费的分支映射，不以文件存在作通过证据 |
| compact来源与呈现 | compact各直接测试及既有会话审计 | 全部owner的输入来源、未知状态、摘要与恢复边界 |
| startup、指令、选择 | startupWarmContextHealth、importExpansion、projectInstructions、selection/model测试 | 复用W7-32等既有证据并逐模块映射，明确启发式能力范围 |

W7-29仍未完成；源码身份修复和解析直接测试不替代上述完整审计。
