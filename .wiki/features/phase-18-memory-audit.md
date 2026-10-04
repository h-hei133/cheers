# Phase 18 记忆与上下文行为审计

W7-29仍在执行。本批只闭合存储事务、候选身份、检索排序和显式注入准入；
不以定向测试通过代替全部模块的行为审计。当前非测试模块为memory 38、context 28；
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
