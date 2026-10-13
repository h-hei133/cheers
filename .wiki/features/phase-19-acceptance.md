---
title: "Phase 19 集成验收与剩余证据"
category: article
created: 2026-10-11
updated: 2026-10-13
tags: [phase-19, acceptance, validation]
summary: "记录完整源码图、契约门禁、全套测试、实际 CLI 及平台范围；保留尚未完成的对象隔离和外部验收。"
---

# Phase 19 集成验收

Phase 19 总目标仍为 **active**。本表以[裁决](phase-19-decisions.md)的 16 批、76 项为范围，分别记录实现、局部验收和剩余条件。W16 修复了此前无法取得完整依赖图证明的检查器，并恢复重构后失效的契约门禁；全阶段完成仍需下面列明的剩余工作。

§1–4 的完整套件和冻结证据属于 W16 提交 `f43ae09ec90a5890b768598ab52a17821c5e9efc`。后续 SAFE-02 Linux 原生读取变更分别记录在 §7–17；最新源码的完整套件已重新运行，见 §18，不能把 W16 的历史全套直接套用到后续源码。§19 补充未改源码的 Windows UNC 读取证据。

## 1. 本轮源码与验证范围

- W16 起点为 `e712ec48acd4282fd7214ad46e9c24bd21909b35`。该批 63 个源码/验证文件的冻结 SHA-256 为 `2b6ffc0e333392f453d9b949594bde8831772da1a0dedf038c2b10579c3face9`，清单位于 `.tmp/integration/source-final.json`。其中 51 个 TypeScript 文件、39 个生产文件；运行时改动仅提取中性类型及调整类型导入，35 个已有生产文件的 JavaScript 输出逐字节不变，4 个新增类型模块仅输出空导出。
- W16 全套 TypeScript 测试实际完成：**782 文件通过、1 文件原有跳过；7862 项通过、10 项原有跳过，零失败**。Node 20.3.0、两个工作线程、隔离 HOME/USERPROFILE/TMPDIR/CHEERS_TEST_ROOT；日志 `.tmp/integration/full/runner.log`。冻结清单与该提交 TypeScript 内容复验一致。该批后续改动仅在验证脚本，不把旧失败运行或不同次数的局部测试相加成一次全套结果。
- 初轮全套为 23 文件/44 项失败，单独复跑并分类后修正了旧命令语义预期、会话存储身份夹具、异步 picker/loop 生命周期及临时项目边界。没有删除失败用例或新增跳过。原生日志仍保留在 `.tmp/parity/validation/integration-full.log` 与 `integration-failures.log`。
- TypeScript 构建及单文件构建均已运行通过，日志为 `.tmp/parity/validation/integration-final-build.log`、`integration-final-executable.log`。本轮实际 CLI 再次覆盖两种产物，见 §4。源文件、编译产物、真实请求和账户能力分别取证。
- 用户原有 `.gitignore` 修改保留，SHA-256 为 `20e91ccf19fdc755718372e6fcc9ef77ca6a579280ff4b0dc1f69c73a2eaf2d3`，不纳入本批提交。

## 2. 完整结构证明与契约门禁

[检查器适配](../../.normproof/patches/graph.patch)使用固定的 TypeScript 5.9.3 AST 解析器，覆盖静态导入、重导出、import-equals、类型导入和字面动态导入。解析失败使整次采集不完整；显式 `.ts` 不替换成同名 `.tsx`，自导入保留为环。当前清单包括 TS 与 TSX，**2424 模块、10360 条边，零未解析目标，混合值/类型图无环**。

采集器与表达式求值器的边界同时调整为 16384 条边；第 16385 条仍产生 `not_proven`，不输出可被误判为完整的部分图。[义务配置](../../.normproof/norm-packs/software-structure-v0/profile.json)未削弱：未解析模块仍阻断，其他义务的原有等级不变。计算路径、非源码资源和外部包不属于本声明图的本地模块解析承诺。

包内固定解析器的许可为 Apache-2.0，许可证和第三方声明随包保存。它只供验证工具使用，产品运行时没有新增语言或执行平面。[构建元数据](../../.normproof/bundle.json)保存基础提交、原包/补丁/成员/解析器/产物的 SHA-256；[重建脚本](../../.normproof/package.mjs)先逐项核验，再应用零 fuzz 补丁并确定性打包。输出包 SHA-256 为 `6c1a37e95434bcc149f29ce2568bbccb3a3aeec91df6547535675865f6aca985`。重建需要 GNU tar、patch 和当前固定的解析器文件；从元数据的基础提交读出原包，不能把已适配的包当作原包再次应用补丁。

中性类型归回 session/store、edit/recovery、CLI bootstrap、command navigation/syntax，原导出保持兼容。定向比较运行循环依赖中性契约、契约不回引运行循环的组织方式后采用此边界。没有更改会话磁盘格式、命令权限、provider 行为或批准语义。

完整 judge 的两项图义务满足，退出 0；整体仍为 `partial`，来自 4 个既有函数数量 advisory：CLI 基线测试、交互 turn sink、shell session runtime、账户凭据 owner。本轮没有增加这些模块的函数数量；不把 advisory 改写成结构完全达标。材料 `.tmp/integration/normproof-self-final/`。

原验证脚本含已删除路径、旧源码片段和不存在的合成 HOME，无法证明当前路径。[共享契约运行器](../../scripts/support/contract.mjs)现在运行当前 owner 的真实套件，逐文件确认至少一个实际断言且全部通过；空选择、跳过、pending、todo、失败均拒绝。它只证明所列契约，进程和终端证据另见 §4。

| 门禁 | 实际套件/断言 | 范围 |
|---|---:|---|
| `verify:result-contract` | 6 / 149 | terminal truth、turn/session、shell、readiness、TUI sink、print |
| `verify:session-lifecycle` | 7 / 154 | 存储、replay、bootstrap、导航、shutdown、实际输入流 |
| `verify:query-orchestration` | 8 / 151 | 回合、重试、工具、队列、完成、MCP 与 CLI runtime 桥 |
| `verify:workspace-safety` | 8 / 147 | sandbox、workspace、file access、工具编辑与 plan 限制 |

最终脚本套件 **57 项通过、零跳过/失败**，中断修复后另跑 result-contract 的 149 项通过；日志 `.tmp/parity/validation/integration-signals-final-scripts.log`、`integration-signals-final-result.log`。import-cycles、config-consumers、declarations、node-floor 和 docs-drift strict 均通过；strict 保留 118 条既有非阻断源码引用 advisory。新验收表的链接另行逐条检查。

独立审查复现了原有超时只杀父进程的问题。修复采用所属进程组清理，并为 SIGINT/SIGTERM 和 owner 退出维护清理责任；监听器在结束后还原。继承管道最多再等待 2 秒，脱离进程组或清理未确认显示 `cleanup-unconfirmed`，中断、超时和未知均拒绝成功。Windows 调用系统目录内的原生进程树终止工具，尚无本批 Windows 实机证据；SIGKILL、机器失联及主动脱离组的进程不属于可保证回收范围。[原生回归](../../scripts/contract.test.mjs)验证实际存活/终止、中断和监听器恢复，测试自身清理脱离组的进程。

反转证据包括采集器/求值器容量、显式 TSX 解析、非法语法、自导入、ASI、TSX 清单、跳过断言拒绝与中性类型边界，9 次均产生行为断言失败，恢复后 13 项通过。额外把进程组清理反转成仅杀父进程，实际回归失败且夹具最终回收后代。材料 `.tmp/integration/reversal.json`、`timeout-reversal.json`；不是单凭工具退出非零算作有效反转。

## 3. 76 项交付的证据索引

以下范围连续覆盖全部任务 ID。详细正常、拒绝、失败、未知和恢复契约仍由[裁决 §8](phase-19-decisions.md)所列 owner 与证据维护；此表不把历史实施记录当作全部平台的完成证明。

| 批次与任务 | 实现与直接验证入口 | 当前边界 |
|---|---|---|
| W1 SAFE-01–08 | §8.1–18、58–66、108–112；[工具](../../packages/ts-shell/src/core/tools/)、[执行](../../packages/ts-shell/src/runtime/execution/)、[编辑 authority](../../packages/ts-shell/src/edit/authority/) | Linux 文件及原生读取的正常/拒绝/取消证据已补至 §18；非 Linux 实际对象绑定及 §5 所列限制仍未关闭，不能整体勾选 |
| W2 CMD-01–04 | §8.19–57、67；[语法](../../packages/ts-shell/src/core/commands/syntax/)、[补全](../../packages/ts-shell/src/cli/interactive/completion/) | 共享语法、原稿替换、动态目录与过期响应已有本地证据；保留独立 raw invocation 语义 |
| W3 CFG-01–05 | §8.68–85；[配置](../../packages/ts-shell/src/config/)、[模型会话](../../packages/ts-shell/src/session/model/) | schema、JSONC、字段 CAS、发布和会话/全局作用域已验；账户与真实端点能力另验 |
| W4 UI-01–07 | §8.86–101；[输入布局](../../packages/ts-shell/src/presentation/tui/composer/)、[呈现](../../packages/ts-shell/src/presentation/tui/)、[启动度量](../../packages/ts-shell/src/observability/startupTiming.ts) | 两模式 PTY、八形态、源文复制、状态和计量已有本地证据；用户前端像素/字体/IME 实证仍缺 |
| W5 SES-01–05 | §8.102–108；[选择器](../../packages/ts-shell/src/cli/interactive/picker/)、[续接](../../packages/ts-shell/src/session/continuation/) | current、大小、分支、新会话、多根和同 ID 迁移已验；跨文件崩溃原子性不作承诺 |
| W5 EDIT-01–03 | §8.109–111；[批次](../../packages/ts-shell/src/edit/patch/)、[恢复](../../packages/ts-shell/src/edit/recovery/) | 提案、批准、收据、整组 undo、partial/unknown 和外改保护已验；不自动重放未知写入 |
| W6 TOOL-01–05 | §8.112–116；[媒体读取](../../packages/ts-shell/src/runtime/execution/media/)、[语言服务](../../packages/ts-shell/src/language/)、[浏览器](../../packages/ts-shell/src/browser/)、[桌面](../../packages/ts-shell/src/desktop/) | 公共异步读/枚举、有界媒体、真实语言服务与浏览器、Linux X11 已验；技能异步资源界见 §9，其他原生平台仍有限制 |
| W7 AUTO-01–05 | §8.117–121；[目标](../../packages/ts-shell/src/planning/goal/)、[顾问](../../packages/ts-shell/src/advisor/) | 无 cap 续轮、共享请求账目、暂停、批准条件、顾问闭环已验；无法证明请求上界的协议在显式 cap 下仍为 unsupported |
| W8 RSC-01–05 | §8.122；[研究](../../packages/ts-shell/src/research/) | 软件/论文来源、独立审查、阶段恢复和有序报告已有本地证据；来源不全或审查不可用保留缺口，不保证模型结论为真 |
| W9 GIT-01–04 | §8.123；[Git 工作台](../../packages/ts-shell/src/workflow/git/) | 原生 hunk/index/commit/worktree、失效预览和远端 unknown 已验；推送仍需独立授权和远端读回 |
| W10 SEC-01–03 | §8.124；[安全分析](../../packages/ts-shell/src/security/)、[命令控制](command-controls.md) | 有界分析器、SARIF、finding 历史、批准修复及同条件复测已验；缺分析器不记作零发现 |
| W11 ECO-01–05 | §8.126–130；[扩展注册表](extension-registry.md)、[代理定义](agent-definitions.md)、[MCP](mcp.md) | 来源签名、包生命周期、角色模型、资源/提示/通知、配置与 OAuth 本地协议已验；公共服务与真实账户互通仍需外部证据 |
| W12 REM-01–05 | §8.131–132；[协作](collaboration.md)、[SSH](ssh.md) | 自托管 ACL/撤权/观察控制、共享请求、远端作业/取消已验；受控本地服务不能代替公网 TLS、生产 SSH 和部署验收 |
| W13 FLOW-01–03 | §8.133–138；[作业](jobs.md)、[交接](handoff.md)、[编排](director.md)、[固定评测](improve.md) | 持久命令/代理/DAG、一次性交接、worker、固定 evaluator 与独立发布批准已验；保留 Linux 隔离及评测覆盖限制 |
| W14 MEDIA-01–02 | §8.139；[媒体](media.md) | 合成协议、native 进程、明确启用、录制隐私和安全回放已验；真实设备、声音质量与真实 Live 服务尚未验 |
| W15 PAR-01–05 | §8.140；[命令控制](command-controls.md) | 历史/上下文、todo/记忆、模型/tier、诊断/restart、规则提案闭环已验；未知账户权益和远端缓存不造成功状态 |
| W16 QA-01 | 本文 §2、§4、§18；完整源码图、最新全套、反转与独立审查 | 本地证据已扩展；最终逐项验收仍受下面明确的未覆盖格约束 |
| W16 QA-02 | 本文 §5、§6；[历史外部矩阵](phase-18-acceptance.md) | 源码、构建与平台范围已记录；外部服务、用户前端、精确远端 CI 和发布证据仍需补齐 |

## 4. 跨域矩阵与实际 CLI

26 文件/408 项组合与 5 文件/34 项补充均已通过，完整套件随后再次覆盖这些文件。材料 `.tmp/parity/validation/integration-matrix.log`、`integration-matrix-supplement.log`。下面把裁决 §7.2 的八组反例逐项对应到证据及未覆盖范围。

| 反例 | 当前直接证据 | 证据边界 |
|---|---|---|
| 1. 未答问询、取消/预算不足后继续写 | [ask](../../packages/ts-shell/src/core/tools/ask.test.ts)、[批准验收](../../packages/ts-shell/src/planning/goal/acceptance/acceptance.test.ts)、[工具决策](../../packages/ts-shell/src/turn/tools.test.ts)；实际 CLI 规则 deny→approve | 答案、批准与完成分别判断；合成模型不能证明真实模型遵从 |
| 2. 相反锁序、A 写成后 B 失败且 A 被外改 | [patch 批次](../../packages/ts-shell/src/edit/patch/batch.test.ts)、[操作收据](../../packages/ts-shell/src/edit/recovery/operation/index.test.ts)、[undo](../../packages/ts-shell/src/edit/recovery/undo/service.test.ts)；§8.111 重启 partial/unknown 实际 CLI | 锁、最后读取与条件补偿均有断言；不宣称跨文件事务或覆盖第三方写入 |
| 3. 会话切换后的旧 picker/补全/目录响应 | [补全导航](../../packages/ts-shell/src/cli/interactive/completion/navigation.test.ts)、[会话选择器](../../packages/ts-shell/src/cli/interactive/picker/)、[配置发布](../../packages/ts-shell/src/config/publication.test.ts) | 按各 owner 的 generation/identity 验证；目录条数不是生效证明 |
| 4. 无 cap 续轮、共享准入、重试/摘要、unknown 与暂停 | [调度](../../packages/ts-shell/src/planning/goal/run/scheduler.test.ts)、[预算](../../packages/ts-shell/src/planning/goal/budget.test.ts)、[请求账本](../../packages/ts-shell/src/core/agent/request/ledger.test.ts)、[重试](../../packages/ts-shell/src/turn/retry.test.ts)、[压缩](../../packages/ts-shell/src/core/query/compaction/summarize.test.ts) | 真实请求边界在合成协议中验证；strict cap unsupported 不升级为可证明的真实 provider 上界 |
| 5. 重复来源、相反证据、伪造 ID、摘要限制与审查超时 | [来源约束](../../packages/ts-shell/src/research/evidence/validation.test.ts)、[审查约束](../../packages/ts-shell/src/research/review/validation.test.ts)、[研究运行](../../packages/ts-shell/src/research/run/runtime.test.ts) | 不把来源数量、模型审查完成或未找到反证当真值 |
| 6. 分享/包/远端/SARIF 的注入、凭据和超大数据 | [协作服务](../../packages/ts-shell/src/collaboration/service.test.ts)、[SARIF](../../packages/ts-shell/src/security/analysis/sarif.test.ts)、[扩展协议记录](extension-registry.md)、[SSH 传输](../../packages/ts-shell/src/runtime/execution/ssh/transport.test.ts) | 本地受控服务及载荷的权限/大小/脱敏证据；外部真实部署尚未证明 |
| 7. index 变化、远端写后断线、恢复 blob 篡改 | [Git operation](../../packages/ts-shell/src/workflow/git/operation/operation.test.ts)、[恢复收据](../../packages/ts-shell/src/edit/recovery/operation/index.test.ts)、[SSH command](../../packages/ts-shell/src/cli/ssh/command.test.ts) | 原生本地 Git 与合成远端故障；生产网络故障和主机恢复另验 |
| 8. 八形态、两模式、窄窗、源文复制与 IME | [布局](../../packages/ts-shell/src/presentation/tui/composer/layout.test.ts)、[形态](../../packages/ts-shell/src/presentation/tui/composer/shapes.test.ts)、[surface](../../packages/ts-shell/src/presentation/tui/surface/view.test.ts)、[输入外观](../../packages/ts-shell/src/presentation/tui/input/appearance.test.ts)；§8.86–90 实际 PTY | 自动测试与 PTY 不证明用户 Windows 前端字体、像素、IME 候选窗或系统鼠标选择；这些格保持未验 |

本轮重新运行实际 Node 20.3 与单文件 CLI，各覆盖 regular、fullscreen、print/pipe，共六条路径、24 次本地合成 POST。实际验证 tier 和 temperature 独立、附件 digest 变化零发送、规则拒绝零写与批准后精确 BOM/CRLF/receipt、todo 不结束 goal、记忆审批/保存/使用分离、同 PID/同 session 重启、旧 trace listener 已关闭、pipe 不重放以及全局配置原字节保留。

原始材料为 `.tmp/parity/cli-node-1791716856466777330/results.json`、`.tmp/parity/cli-exe-1791716856466697931/results.json` 及其每条路径日志。它们证明当前命令至真实终端/会话/文件路径的闭环，不单独覆盖上表其余预算、协作和八形态条件。

## 5. 平台、协议与剩余工作

| 范围 | 已取得证据 | 剩余条件 |
|---|---|---|
| Linux/WSL、Node 20.3、单文件程序 | 构建、全套、原生文件/进程/Git/沙箱、两模式 PTY | 用户实际前端逐帧、字体、IME 和系统复制仍需同前端证据 |
| Linux X11、媒体设备、语言服务、分析器 | 各适配器的明确能力与有界 native 进程路径 | 未安装/不支持状态继续可见；真实声音设备/Live、其他桌面协议另验 |
| Windows | 原生 Windows Node 20.3/24.12 访问 WSL UNC：两版各 6 项读取/目录检查通过；目录句柄与受管目录创建另验，见 §19 | 本地 NTFS、原生禁止重解析/对象路径绑定、完整 Windows CLI/套件、进程树、前端及设备仍未验 |
| macOS | 部分 profile、接口与纯逻辑用例 | 原生路径/文件描述符、进程树清理、终端与设备尚未取得等价实机证据 |
| 模型传输与严格预算 | 合成 HTTP/SSE/usage/重试/unknown、统一 request admission | W7-33 四端点真实 TLS/HTTP2 矩阵仍缺；无法证明上界的请求继续拒绝 strict cap 准入 |
| 公共包、认证、协作和 SSH | 受控服务、签名、ACL、撤权、重连与未知副作用 | 真实账户、公共部署 TLS、真实远端主机/主机密钥和生产互通验收 |
| SAFE-02 | Linux 公开文件工具的检查/句柄/拒绝/清理及受管编辑目录固定；原生 Git/ripgrep 私有视图、配置准入和 child 完成收据；异步技能发现、批准前捕获与共享预算；读取期间及 catalog 发布前已捕获 manifest/ignore/Git 来源变化拒绝；本地remote-URL条件及native配置错误拒绝；已枚举目录修订、visit先捕获后探测规则，可选native/技能根来源的父目录/alias观察、已知消失传播及成功/null最终复验，见 §7–17 | 非 Linux 实际对象绑定、未观察树与私有镜像剩余成本继续开放；外部 metadata 仍拒绝，未知future hasconfig不宣称支持，资源计数器不约束原生进程内部全部读取 |

技能发现的同步正文/Git 忽略路径已按 §9 替换；§10 拒绝检测到的读取期间源变化，§11–12 在 catalog 发布前复查已捕获 manifest、ignore 与 Git 来源。§14拒绝已枚举目录的已知修订变化，§15修复native visit的规则探测顺序；§16复验可选native来源已观察父目录及alias，§17观察可选技能根parent并保留已知消失状态。SAFE-02继续处理非Linux对象绑定、未观察树和镜像成本，扩展外部metadata/条件支持须重新证明准入。逐源检查不保证其后全部变化或整目录事务。早期“继续跟踪”记录不自动变成延期批准。上述缺口存在时，不把W1–W16或Phase19总目标标为完成。

## 6. 迁移、回退与交付

本轮没有会话、配置、receipt、权限或目标 schema 迁移；现有类型导出保持兼容。回退运行时改动只需回退对应源提交并重建，不需要改写或删除用户数据。恢复旧检查器会重新遇到 8192 边容量和 TSX/解析遗漏，届时应如实恢复 `not_proven`，不能沿用新版 judge 的通过记录。

回退前保留当前源提交、包 checksum 与上述证据；原包可从 `.normproof/bundle.json` 的 `baseCommit` 取回。确定性重建实际已核验，独立审查也逐项检查了基础包、两个补丁成员和三个 parser/许可成员。升级解析器时须同时更新固定版本、许可与成员 digest，并重跑原生阻断和容量反例。

最终冻结 `2b6ffc0e…` 获得独立代码 **APPROVE**、架构 **CLEAR**，综合 **APPROVE（限本批源码）**，报告 `.tmp/integration/review/code-final.md`、`architecture-final.md`。代码审查独立使用 Node 24.15 验证信号/超时/监听器，架构审查使用 Node 20.3 完成七项原生检查。预设路由的 503 和中途请求限流均不计通过；最终实际返回的独立证据取代早期未完成结果。该结论没有关闭 §5 的剩余任务。

本批代码与验收文档已提交/推送为 `f43ae09ec90a5890b768598ab52a17821c5e9efc`，远端分支读回同 SHA。该提交的 CI 38136502604/job 114461346739 与 Architecture Watch 38136502606/job 114461346594 均为 completed/failure、`steps=[]`；分别读取的 annotations 确认付款/spending-limit 阻止作业启动，未取得远端验证通过。材料 `.tmp/integration/delivery.json`。起点 W15 的历史运行不替代这份证据；后续文档或源码提交按各自 SHA 追踪，当前没有发布或合并结论。

## 7. SAFE-02 Linux 原生读取局部验收（2026-10-13）

本批起点为上述 W16 提交；27 个 TypeScript 文件、16 个 production 文件，逐文件冻结在 `.tmp/native-read/final/inventory-latest.json`。production digest 为 `80aba0992538c322d4f68e8d7b74747bfe504dff9c0b94366fc06ce0997f8f2e`。默认 Git/ripgrep 调用均经私有镜像，Git 配置依赖先准入，gitdir/onbranch 探测期间禁用原 include，正文搜索经已核验描述符；只有 launcher 证明 child 完成后才接受普通原生退出码。

| 证据 | 实际结果 | 范围/材料 |
|---|---|---|
| Node20.3 受影响组合 | 22 文件/298 项通过 | `.tmp/native-read/final/affected-final.log`；不是全仓套件 |
| 新增条件回归后的私有视图复验 | 3 文件/41 项通过，包括 2 项新增回归 | `.tmp/native-read/final/source-final.log`；common/worktree 条件、配置恢复、真实/伪造 child status |
| 构建与源码门 | TS/单文件构建、import cycles/config consumers/declarations/Node floor、57 scripts 通过 | `.tmp/native-read/final/`；生产字节与两审查一致 |
| strict docs/完整 NormProof | strict 通过；judge exit0、未解析与混合环义务 satisfied，整体 partial | `.tmp/native-read/final/{docs-drift-final.log,normproof-delivery-out}`；118 项既有文档源码引用和 4 项既有函数数量 advisory 保留，新增模块无超 20-name ceiling |
| 三类隔离反转 | 均出现真实 AssertionError，原源码未改动 | 默认调用绕过边界、移除完成收据、移除 inert config；条件测试 1 失败/1 通过，`.tmp/native-read/final/reversals/results.json` |
| OS 外部 include 读取对照 | 当前零 inotify 事件，移除 inert config 后 IN_OPEN/IN_ACCESS | 拒绝结果相同而读取事实不同；正向监测控制有效，见反转材料和独立 code report |
| 原生失败为空结果的反转 | 原实现 failed，移除收据后错误返回成功/零匹配 | `.tmp/native-read/final/{baseline-rg-receipt,reversed-rg-receipt}.log` |
| 实际 print CLI | Node/单文件各有界搜索与排除匹配，共四条通过、8 合成 POST | `.tmp/native-read/final/cli-smoke-results.json`；检查本次 tool_call_id 与原文件字节，首次历史结果选择错误已单独保留 |
| 独立 code | APPROVE；Node24.15 8 文件/110 项及新增 2 项通过 | `.tmp/native-read/review-final-code/report.md`；两 HIGH 修复后重新取证 |
| 独立 architecture | WATCH；Node20.3 11 文件/142 项、16 断言及真实 launcher-status 探针 | `.tmp/native-read/review-final-architecture/report-final.md`；旧 BLOCK 报告保留为历史 |

两审查生产清单逐文件与最终源一致；aggregate 编码不同，未直接混比 aggregate hash。额外两项测试由 code lane 独立复核。与 opencode ripgrep 决策比较后保留单一执行 owner、no-config、原生流与有界输出；其部分 exit 2 接受策略未采用，本项目的失败输出保持失败。

交付前只清理三个生产文件各一个末尾 LF，两独立复核确认精确差异、当前清单/暂存字节及生成 JavaScript 相等。上表行为测试与反转仍归属于原运行字节，不将格式清理冒充重跑；最终源码完整 judge 和 strict docs 已另行运行。

私有镜像的成本已实测。相同 Linux/Node20.3 环境、50 个目录、每组 3 次；以下为中位数，返回文件名称逐项一致。

| 文件数 | 原生 Git | 私有视图 Git | 原生 rg 枚举 | 私有视图 rg 枚举 |
|---:|---:|---:|---:|---:|
| 1000 | 10.43ms | 793.10ms | 13.51ms | 568.73ms |
| 5000 | 14.50ms | 2791.29ms | 13.80ms | 2098.29ms |

材料 `.tmp/native-read/final/benchmark-results.json`；该测试只比较合成目录枚举，不证明正文搜索、真实大仓或高并发性能。镜像每次 O(n) 工作仍是实质成本。外部 linked worktree metadata、hasconfig 条件及非 Linux 原生视图保持明确拒绝；同步 discovery 的替换竞态、跨进程正文内容变化和系统加载器环境的完整 OS deny 仍无保证。SAFE-02 与 Phase19 继续 active，未从本批局部测试推断全仓、交互 PTY、真实 provider 或外部服务通过。提交/推送及本批精确 SHA CI 单独记录。

该组件已提交/推送 `72374db9098ff7eabce07112271f719f2e59a531`，远端读回同 SHA。CI 38280517934/job 114916398458 与 Watch 38280517938/job 114916398656 均 completed/failure、steps=[]；annotations 确认付款/spending-limit 阻止启动，未计远端通过，材料 `.tmp/native-read/final/delivery.json`。

## 8. SAFE-02 私有视图性能局部验收（2026-10-13）

起点为 §7 提交，本批只修改 4 个 TS 文件、其中 2 个 production owner。Linux 路径包含检查每次使用原生 realpath 并保留 JavaScript 回退；空占位文件每批最多 8 个并发写入，全部结算后才报告失败/取消和清理。名称准入、metadata 捕获、私有挂载、完成收据及遍历总预算继续使用原机制。

| 证据 | 实际结果 | 范围/材料 |
|---|---|---|
| 同场 Node20.3 基准 | 5000 文件 Git 2761.69→1668.29ms、rg 2140.32→1267.66ms；39.59%/40.77% 改善 | 50 目录、3 次中位数、1000/5000 文件名称逐项匹配；预设双路 25% 门槛通过，`.tmp/native-read/performance/comparison.json` |
| 受影响组合 | 29 文件/370 项通过 | 路径/读写/私有视图/metadata/预算/清理/搜索/技能；`.tmp/native-read/performance/affected-final.log` |
| 两种构建、静态门 | TS/单文件及四源码门通过；完整 judge exit0/partial | 未解析/混合环 satisfied，4 项既有 ceiling advisory；本批未重跑全仓套件或 scripts，`.tmp/native-read/performance/` |
| 两类隔离反转 | 均出现真实 AssertionError，原源码未改动 | 去掉解析回退会误放行逃逸；提前失败的批次在 7 个活跃写入时清理，`reversal-*.log` |
| 实际 print CLI | Node/单文件四条工具链、8 合成 POST 通过 | 超过一批的占位名称、有界搜索/排除匹配、本次 call ID、原文保留；`cli-smoke-results.json` |
| 独立 code/architecture | APPROVE/WATCH，综合 COMMENT | 同一冻结；独立 38/135 项和别名/零正文打开/真实 EMFILE 探针，`review-code.md`、`review-architecture.md` |

剖析与只切换原生解析的中间结果均保留，未把不足 25% 的结果称为达标。真实 ulimit64 反例观察到最多 8 个占位写入、8 个均结算、5 个 EMFILE，清理开始时零活跃写入且镜像已删除。当前冻结与用户 `.gitignore` 原 SHA 均复验一致；材料 `.tmp/native-read/performance/{inventory.json,acceptance.json}`。

O(n) 镜像成本仍是 architecture WATCH，性能门槛通过不关闭 §5 的其余 SAFE-02 和外部边界，也不证明正文搜索、真实大仓、高并发、非 Linux 或全阶段完成。新提交/推送/精确 CI 单独记录，Phase19 保持 active。

该性能组件已提交/推送 `d6cfaaf5a8c863eda291e298bfae2c9137493ff8`，远端读回同 SHA。CI 38283637758/job114926652699 和 Watch 38283637674/job114926652491 均 completed/failure、steps=[]；annotations 确认付款/spending-limit 阻止启动，未计远端通过，材料 `.tmp/native-read/performance/delivery.json`。

## 9. SAFE-02 异步技能发现局部验收（2026-10-13）

起点为 §8 性能提交。现有[技能 owner](../../packages/ts-shell/src/core/skills/discovery.ts)复用核验目录/文件句柄和私有 Git 视图，同步 discovery 正文读取与 Git 子进程已删除。内置与扩展共用遍历预算及 512 manifest/单项512KiB/总8MiB；warm cache 保留字段也计入。普通缺失保持诊断，resource/limit/cancel/cleanup 不返回完整 catalog；目录忽略结合 indexed descendants，保留 ignored-but-tracked 技能。

| 证据 | 实际结果 | 范围/材料 |
|---|---|---|
| 源码冻结 | 43 TS 路径/31 production（含删除），两独立 lane 逐文件前后相符 | `inventory-final-repair.json` SHA256 `25eb2b46edab17c70a2aeb69a6929da5843254567eae9ab32f89ad7ab9fc1469`；用户 `.gitignore` 原 SHA 保持 |
| 受影响组合与修复回归 | 此前40文件/552项；修复后10文件/192项；最后resource修复4文件/96项，分别通过 | `tests-final`、`tests-repaired`、`tests-ignore-final`；不同阶段的运行不合并成全套或最终字节全套证据 |
| 最终构建/静态 | TS/单文件、四源码门及完整 judge exit0 | `build-final`、`executable-final`、`*-final`；图义务满足、4项既有ceiling advisory/partial，无新增 |
| 独立 code/architecture | APPROVE/WATCH，综合 COMMENT，没有未解决 blocker | 最终225/186项及七/六实际探针；`review-code.md`、`review-architecture.md` |
| 五组隔离反转 | 正向副本通过，五反转均真实 AssertionError；源字节不变 | 对象复验、准备先于批准、缓存预算、清理优先级、fallback resource；`reversals/results.json` |
| actual print | Node/单文件四条工具链、8合成 POST、exit0 | 自动catalog/skill工具正文、ignored/tracked/contained-excludes、显式路径+noSkills；`cli-smoke-results.json` |
| actual PTY | Node/单文件×regular/fullscreen四条、4合成 POST、exit0 | 同步实际启动prompt、技能展开和参数、隐藏技能零发送、技能/config原字节；`cli-pty-results.json` |

异步 preparation 通过原 WeakMap 能力在实际捕获及准入复验后发布，权限 hooks 等待同一准备 seam；worker、director 和 side-agent 不在完整技能捕获前批准。最终 catalog 复验 contribution owner/current，Git 实际生效源进入现有观察器。直接复核修复了 warm cache 绕预算、读取清理被取消覆盖、资源失败被吞与 excludes 变化不通知的问题。

参考方案可跳过不可读 ignore 源，本项目保留普通缺失而明确传播 resource/cleanup，不以隐藏来源漏出换取部分成功。CLI 初次夹具的默认拒绝、无效相对 excludes cwd 和 RTK proxy 的非TTY输出分别保留失败记录；修正夹具后才计上述通过。没有重跑全仓套件或真实 provider。

WATCH 为非 Linux/bwrap 可用性、较大目录的1.5s补全截止与原生查询延迟、256个源订阅和缓存过期回退、整catalog的并发内容一致性；单项快照不构成目录事务，扩展 inventory 仍使用原同步身份验证。SAFE-02 其余边界及 W7-33、用户前端、真实外部服务保持 §5 状态，Phase19 active；本批源码提交/推送/精确CI另行核对。

该组件已提交/推送 `4e30b0b453d9e4434e4909238d5c846bb264bbf2`，远端读回同 SHA。CI 38290174983/job114948097412、Watch38290174987/job114948098104 均付款/spending-limit 阻止启动，steps=[]、failure，未计远端通过。交付前关闭 rename 识别后逐项审计 46 个原始路径/blob/删除与文档字节、排除用户 `.gitignore`；材料 `.tmp/skill-discovery/{commit-audit.json,delivery.json}`。

## 10. SAFE-02 读取期间源变化局部验收（2026-10-13）

起点为 §9 技能提交。[原读取 owner](../../packages/ts-shell/src/runtime/execution/read.ts)核验打开时的 size/mtimeNs/ctimeNs 与路径/身份，在 consumer 返回后复验，原生输入在后续打开完毕后复查早期输入。已知打开后替换/消失/逃逸/正文修订采用 `ReadChangedError`；搜索不发布匹配，ignore/技能不省略已知变化，媒体适配为原 `changed` 分类，清理不确定性保持优先。

| 证据 | 实际结果 | 范围/材料 |
|---|---|---|
| 最终冻结 | 13 TS/7 production，逐文件两 lane 前后相符，用户 `.gitignore` 原 SHA 保持 | `inventory-final.json` SHA256 `96c841200d90e258992c276c40b1b28a3db4bb97546e9d731bda2d7fecbaf707` |
| 子进程基线/修复 | 原完整读/分页/rg 描述符发布变更结果；最终均拒绝、零字节、关闭 | `baseline-probe.log`、`repaired-probe.log`及独立 `review-*-child-final`；是 reader/native owner 证据 |
| 最终受影响组合 | Node20.3 26文件/350项通过 | `tests-final.log`，包含 editEngine/LSP/conditionalWrite/媒体；不存在测试过滤不计通过，本批未重跑 scripts/全仓 |
| 构建/静态/完整结构 | 两产物、四源码门通过；judge exit0/partial，未解析和混合环 satisfied | `build-final`、`executable-final`、`gates-final`、`normproof-out`；4项既有ceiling advisory，无新增 |
| 独立 code/architecture | APPROVE/WATCH，综合 COMMENT，没有未解决 blocker | `review-code.md`、`review-architecture.md`；独立164/161项、快照第三stat、六个替换/消失消费者、媒体分类与bounds/优先级探针 |
| 四组隔离反转 | 正向通过，四反转均真实 AssertionError，原源字节不变 | 最终检查、早期输入检查、路径/快照类型；`reversals/results.json` |
| 八条实际 print 工具链 | Node20.3/单文件 × read/grep × stable/changed，16 合成 POST、exit0 | `cli-smoke-results.json`；真实 IN_ACCESS watcher child 写入，stable正常正文、changed明确工具失败/零needle，核对本次call ID |

复审修复 snapshot 自有最后 stat 的通用错误被技能吞掉、身份/路径变化被 fallback/ignore/技能当作不可读及媒体现有 `changed` 分类被共享验证抢先覆盖。已知变化的拒绝不是初始缺失或普通不可读；真实执行失败和关闭不确定性不降级为变更或取消。

证据止于最终逐文件 metadata 核验；ctime-only 变化可保守拒绝，即使正文相同。没有 OS 锁、跨文件/整 catalog 事务、最后检查以后稳定、非 Linux 实际对象或本批延迟基准。实际 CLI 的 exit0 与模型收尾不升级 changed 工具结果为成功。本批没有真实 provider、PTY或外部服务新增验收。§5 的其余条件、SAFE-02 和 Phase19 继续 active；提交/推送/精确 SHA CI 单独核对。

该组件已提交/推送 `6852c9012b9177b28706f69df7280adf9104936b`，16 个原始路径/blob审计通过、用户 `.gitignore` 原字节排除，远端读回同 SHA。CI38293312382/job114958327518、Watch38293312397/job114958327471 均付款/spending-limit 未启动、零步骤 failure，未计远端通过；材料 `.tmp/read-currency/{commit-audit.json,delivery.json}`。

## 11. SAFE-02 已捕获 manifest 发布前复验（2026-10-13）

起点为 §10 读取提交。现有[discovery owner](../../packages/ts-shell/src/core/skills/discovery.ts)保存受 manifest 预算约束的 metadata，并在已有 loader/catalog 最终发布检查复验。重复选择保持最早修订；元数据策略统一到[读取 owner](../../packages/ts-shell/src/runtime/execution/read.ts)，snapshot/媒体/私有视图删去重复表达式。没有正文重读或保留句柄。

| 证据 | 实际结果 | 范围/材料 |
|---|---|---|
| 最终冻结 | 7 TS/5 production，两 lane 全部路径前后相符，用户 `.gitignore` 原 SHA 保持 | `inventory-final.json` SHA256 `8bb2264aabc9c1a34be94b7e52b1e18f8ebc808b25b165beb4255fcaa89719c1` |
| 实际子进程基线/修复 | later-manifest 与 contribution 两公共边界原先发布旧指令，当前安全拒绝/关闭全部句柄 | `baseline-scoped-probe.log`、`repaired-probe.log`及独立复跑 |
| 受影响组合/构建/门 | Node20.3 18文件/247项、两构建、四源码门通过；完整judge exit0/partial | `tests-final.log`、`build-first`、`executable-final`、`gates-final`、`normproof-out`；build后的修正仅测试，production未变；4既有ceiling advisory |
| 独立 code/architecture | APPROVE/CLEAR，综合 APPROVE（限本批） | `review-code.md`、`review-architecture.md`；独立122/151项及source/重复/resource/取消/cleanup/metadata-only探针 |
| 两个有效反转 | 正向通过，移除 final verify 与覆盖旧重复修订均实际 AssertionError，原源未变 | `reversals-final/results.json`；初次多命中文本匹配中止不计有效 |
| 四条实际 print CLI | Node/单文件 stable均exit0、共4合成 POST；changed均exit1、零POST/零旧指令 | `cli-smoke-results.json`；先实际观测首源关闭，再于第二源IN_ACCESS后child pwrite；stable本次call ID/源正文、第二源原字节 |

初次重复选择测试的第三次回调没有发生，属于 harness/setup drift；改为实际第二次并断言次数后才记通过。普通初始不可读、资源失败、取消与cleanup契约保持区分，已有变更不能省略成完整catalog。

这里保证已读 manifest 到其最后一次逐源 metadata 核验；不是目录/ignore全源事务，也不保证尚未枚举来源或之后全部变化。没有本批非 Linux、全仓/scripts、PTY或真实provider证据；§5其余条件、SAFE-02/Phase19 active。提交/推送/精确CI另验。

该组件已提交/推送 `d589e8d02c5299f0de4a3a25169b9aea1a742540`，10路径/blob审计通过，用户 `.gitignore` 原字节排除、远端同 SHA。CI38295056304/job114964024097、Watch38295056278/job114964022341 均付款/spending-limit 未启动、零步骤 failure，没有远端验证通过；材料 `.tmp/catalog-currency/{commit-audit.json,delivery.json}`。

## 12. SAFE-02 已捕获 ignore/Git 来源发布前复验（2026-10-13）

起点为 §11 manifest 提交。现有 verified-read 在成功核验和关闭后报告中性 metadata，fallback ignore 通知在可选读取 catch 外，native view 保留原路径/别名和最早 staged revision。技能 discovery 共用一个有界 ledger，loader/catalog 发布前复查实际捕获的 manifest、ignore、config/index 等来源，不保留描述符或重读正文。

| 证据 | 实际结果 | 范围/材料 |
|---|---|---|
| 最终冻结 | 11 TS/8 production，用户 `.gitignore` 原 SHA 保持 | `inventory-final.json` SHA256 `f19007ffad95ca869139a223546f66e8781166840dbb0d8a0f04f0991cf0d20b` |
| 实际 child 基线/修复 | native/fallback 原先在规则关闭后改写仍发布技能，修复后安全拒绝、全部句柄关闭 | `baseline-repaired-probe.log`、`repaired-probe.log`；初始继承外层仓库未触发为 harness/setup，不计产品证据 |
| 受影响组合/构建/门 | Node20.3 14文件/224项、两构建、四源码门通过；完整judge exit0/partial | `tests-first.log`、`build-first`、`executable-first`、`gates-first`、`normproof-out`；4既有ceiling advisory，无新增 |
| 独立 code/architecture | APPROVE/CLEAR，综合 APPROVE（限本批），全部冻结路径前后相符 | `review-code.md`、`review-architecture.md`；独立142/156项及child、source-owner、contribution/metadata-only/path-budget检查；launcher/root-cwd失败和中止不计通过 |
| 两个有效反转 | native/fallback 来源通知分别移除后实际 AssertionError，正向副本通过且原源字节不变 | `reversals/results.json` |
| 四条实际 print CLI | Node/单文件 stable均exit0、共4合成 POST；changed均exit1、零POST/零旧指令 | `cli-smoke-results.json`；实际 ignore 关闭后、manifest IN_ACCESS时 child 改写；stable可见/隐藏技能、本次call ID及源字节 |

最多4096来源路径并占用既有累计 path budget；manifest文件/字节限额不变。普通初始缺失/不可读与后续已知变化、取消/resource/cleanup保持区分。此证据不覆盖未读/初始缺失来源、目录事务、最后逐源检查之后的变化或非Linux实际对象；§5的外部metadata/hasconfig、平台、真实服务与用户前端条件仍开放。未重跑全仓/scripts/PTY/真实provider，Phase19 active，提交/推送/精确CI另验。

该来源组件已提交/推送 `5416bc6c4d5fd8fade9b135ed58e3cdf3729bbab`，14路径/blob审计通过，用户`.gitignore`原字节排除、远端同SHA。CI38297427374/job114971784410、Watch38297427106/job114971783285均付款/spending-limit未启动、零步骤failure，没有远端验证通过；材料 `.tmp/catalog-sources/{commit-audit.json,delivery.json}`。

## 13. SAFE-02 本地 remote-URL 条件与配置错误局部验收（2026-10-13）

起点为 §12 来源提交。现有config准入按native扫描策略捕获全部本地`hasconfig:remote.*.url`依赖图，包含未匹配条件；native继续拥有glob、后值优先、worktree scope、深度与禁止条件remote URL。repo布局识别复用原inert config，与完整配置验证分离，配置错误不再变成无仓库fallback。

| 证据 | 实际结果 | 范围/材料 |
|---|---|---|
| 最终冻结 | 3 TS/2 production，用户`.gitignore`原SHA保持 | `inventory-final-reversal.json` SHA256 `db9a381184e80a266a3f2546fa4026fb2d66d2789fa4c10c0299255743fa86e3` |
| native基线/修复 | baseline有效本地条件拒绝，修复后列表与普通Git相符 | `baseline-probe.log`、`repaired-probe.log` |
| 受影响组合/构建/门 | Node20.3修复后10文件/170项、两构建/四源码门通过；完整judge exit0/partial | `tests-repair.log`、`build-final`、`executable-final`、`gates-final`、`normproof-out`；4既有ceiling advisory，无新增 |
| 最终断言/独立评审 | 最终native文件36项复验；code APPROVE、architecture CLEAR，综合APPROVE（限本批） | `tests-final-assertion.log`；code相同生产66项与最终断言3项子集、四项检查；architecture133项与最终native36项、parity/child/metadata-only/恢复失败检查；全部最终哈希相符，未编辑源码/测试/文档，复验不相加 |
| 两个有效反转 | 条件准入、inert布局隔离分别移除后实际AssertionError，正向副本通过、原源字节不变 | `reversals-effective/results.json`；初次未捕获Error不计strict断言反转 |
| 四条actual print CLI | Node/单文件×后置URL/后值覆盖，exit0、共8合成POST | `cli-smoke-results.json`；技能catalog/正文、隐藏零泄漏、本次call ID与源config/manifest字节 |

首轮新增回归实际发现间接非法remote URL导致128后错误fallback，属于product behavior drift，修复后再通过170项。随后只调整列表对照的promise成功断言，production未变。外部匹配/未匹配条件来源均未打开；未知future hasconfig、外部metadata和其余§5平台/枚举/真实服务缺口继续开放。未重跑全仓/scripts/PTY/真实provider，Phase19 active，交付另验。


该条件配置组件已提交/推送 `415ff5d24dc0450aa3a35ad1cbd6cefcc1f5c4fe`，6个原始路径/blob对照冻结源码和文档审计通过，用户`.gitignore`排除且原SHA保持、远端同SHA。CI38299423064/job114978414682与Watch38299423076/job114978414529均completed/failure、steps=[]；annotations确认付款/spending-limit阻止作业启动，无远端验证通过。材料 `.tmp/git-condition/{commit-audit.json,delivery.json}`。

## 14. SAFE-02 已枚举目录修订局部验收（2026-10-13）

已捕获目录与文件metadata复用现有source ledger和最终发布检查。目录新增/删除改变修订时拒绝旧的完整结果；保持4096来源和原遍历/path预算，逐源检查不保证目录/catalog事务。

| 证据 | 实际结果 | 材料/边界 |
|---|---|---|
| 最终冻结 | 9TS/6production，用户`.gitignore`原SHA保持 | `inventory-final-guard.json` SHA256 `02321067d3bcc16fd4c43fce948e77073a800d80a96f3ad753583770a15ab431` |
| 受影响组合/构建/门 | Node20.3 12文件/199项、两构建/四源码门通过；完整judge exit0/partial | `tests-final.log`、`build-final`、`executable-final`、`gates-final`、`normproof-final-out`；4既有ceiling advisory |
| 四项有效反转 | 目录读取核验、native ledger、catalog ledger和文件种类准入分别移除后实际AssertionError；正向副本通过且原源不变 | `reversals-final/results.json`；初次脚本文本匹配中止不计有效 |
| 四条实际print CLI | stable共4合成POST；changed两组exit1、零POST/零旧指令 | `cli-smoke-results.json`；实际目录关闭后新增manifest，原manifest/ignore字节保持 |

直接目录读取的Linux与模拟无proc分支、成功关闭后metadata通知、native和catalog发布拒绝均有focused证据。首轮技能用例未触发预定修改，属于harness/setup，不计行为通过；实际open触发修正后再验。初始缺失/未枚举来源、最后逐源检查后变化、非Linux实际对象、外部metadata和§5其余外部验收仍开放。本批未重跑全仓/scripts/PTY/真实provider，Phase19 active，独立评审及交付另验。

最终独立code **APPROVE**、architecture **CLEAR**，综合 **APPROVE（限本批）**；code原149项后在最终字节通过4项native子集、guard与六项capture探针，architecture原151项后在最终字节通过native38项、安全mixed及四项currency/alias/budget探针。原冻结套件不当作最终全套，复验不相加；两lane最终9路径前后哈希一致，无源码/测试/文档编辑。材料 `.tmp/directory-currency/{review-code.md,review-architecture.md,review-architecture-guard.md}`。

未覆盖的具体窗口为规则不存在探测之后、目录初始修订捕获之前；此间新增规则可能未进入本次视图。目录复查不把该窗口或未枚举树变成已验证。文件capture缓存复用现在先保留普通文件准入，拒绝原始EISDIR而返回safe owner错误；实际回归、guard增量评审和第四项反转均通过。


该目录修订组件已提交/推送 `1fc329c685b38da1dab69c7bef2ba30667eac2a5`，12个原始路径/blob对照冻结源码/文档审计通过，用户`.gitignore`排除且原SHA保持、远端同SHA。CI38333984581/job115089837603与Watch38333984529/job115089837690均completed/failure、steps=[]；annotations确认付款/spending-limit阻止启动，无远端验证通过。首次读取annotations遇到EOF，属于观察网络失败，重读同run/job成功后才完成归因；材料 `.tmp/directory-currency/{commit-audit.json,delivery.json}`。

## 15. SAFE-02 原生规则探测顺序局部验收（2026-10-13）

现有native visit先捕获目录，再探测规则；缺失规则探测之后的child创建改变已保留revision，拒绝旧完整答案。native glob/ignore优先级、tracked与prune语义不新增解析器或重复遍历。

| 证据 | 实际结果 | 材料/边界 |
|---|---|---|
| 最终冻结 | 2TS/1production，用户`.gitignore`原SHA保持 | `inventory-final.json` SHA256 `255ef93b43222be8353511bb17fd164b0d426778ec241bfab2aa66bced894166` |
| 两路基线/修复 | corrected基线Git/ripgrep均AssertionError；修复9文件/167项通过 | `tests-baseline-repair.log`、`tests-first.log`；初次search调用错误只计harness/setup |

材料 `.tmp/rule-order/`；顺序修复只覆盖native visit目录，ancestor-only规则、初始缺失metadata、未枚举树、非Linux实际对象和外部metadata保持未验。逐源revision不是全目录事务或未来稳定保证。构建/门/反转/actual CLI、独立评审和提交/推送/精确CI分别取证；Phase19 active。

两构建、四源码门、docs strict通过；完整judge exit0，图义务satisfied、4既有ceiling advisory仍partial。一项隔离顺序反转使两路回归均实际AssertionError，正向副本通过、原源码/用户`.gitignore`保持。Node20.3/单文件×stable/changed四条actual print CLI共8合成POST：stable实际grep返回目标正文；changed在已有规则IN_ACCESS后child创建新规则，工具安全返回Search stopped: failed，零END_NEEDLE/零旧结果；CLI exit0表示回合完成，不计搜索成功。原数据/已有规则字节保持，本次call ID核对。

独立code **APPROVE**（native40项及两路capture-before-probe/child/关闭/清理检查），architecture **CLEAR**（native40项及parent/child目录各枚举一次、捕获先于规则探测的独立检查），综合 **APPROVE（限本批）**；两lane最终2路径前后哈希相符，未改源码/测试/文档。材料 `.tmp/rule-order/{tests-first.log,review-code.md,review-architecture.md,reversals/results.json,cli-smoke-results.json,normproof-out/}`。本批未重跑全仓/scripts/PTY/真实provider，提交/推送/精确CI另验，Phase19 active。

该顺序组件已提交/推送 `4ae5ca8f2550971501793bbe3c4b16ce798facbd`，5个原始路径/blob审计通过，用户`.gitignore`排除且原SHA保持、远端同SHA。CI38334654789/job115091919308与Watch38334654875/job115091919479均completed/failure、steps=[]；本轮分别读取annotations确认付款/spending-limit阻止启动，无远端验证通过。材料 `.tmp/rule-order/{commit-audit.json,delivery.json}`。

## 16. SAFE-02 可选原生来源观察局部验收（2026-10-13）

原view source owner在可选规则、repo marker和metadata absence前观察最近已存在父目录，复用核验/关闭和最早revision ledger；原生命周期在成功及null发布前复验。contained目录alias也保留原路径绑定，包括cache命中新alias；canonical/alias共用4096记录及path budget，观察不增加目录enumeration或保留句柄。无repo的技能过滤委派同一owner，确认null后使用已有fallback。

| 证据 | 实际结果 | 材料/边界 |
|---|---|---|
| 最终冻结 | 8TS/6production；用户`.gitignore`原SHA保持 | `inventory-alias.json` SHA256 `34b9a7430bc99ff1a88e1391e8a236de6deef540b910f368e5b4bf573485aefe` |
| 原基线 | 四项actual-child AssertionError | ancestor Git/search规则、初始repo marker、missing include；`tests-baseline.log` |
| 最终受影响组合 | Node20.3，12文件/203项通过 | `tests-alias.json/.log`；包括fresh/cached alias回归 |
| 构建/门 | TS/单文件、四源码门通过；完整judge exit0 | `build-ts-alias`、`build-exe-alias`、`gates-alias`、`normproof-alias-out/`；4既有ceiling advisory/partial保留 |
| 五项有效反转 | 全部actual AssertionError，正向副本通过 | `reversals/results.json`；原source和用户`.gitignore`保持 |
| 四条actual print CLI | stable/changed各两产物，共8合成POST | `cli-smoke-results.json`；ancestor IN_ACCESS后child写规则；changed工具安全失败、零旧匹配，CLI exit0不计搜索成功 |

材料 `.tmp/optional-sources/`。首轮遗漏async consumer是实现回归，54个unhandled errors及构建失败未计通过；无repo不再启动Git后，旧launcher fixture未进入原生路径，加入真实repo后保留原断言。独立actual-child发现的父目录alias缺口在原ledger修复，早期BLOCK冻结不计批准。最终203项、构建/门/反转/CLI单独绑定新冻结，早期201项不替代它。

仅证明已观察父目录及绑定至最后逐源核验；无关条目变化可能保守拒绝，没有OS锁、全目录/catalog事务或之后稳定保证。未观察树、非Linux实际对象、外部metadata、镜像剩余成本与§5其余实际环境条件继续开放，SAFE-02/Phase19 active。本批未重跑全仓/scripts/PTY/真实provider，独立评审与提交/推送/精确CI另验。

最终独立code **APPROVE**（7文件/144项、原alias反例及六项owner/取消/资源/清理检查），architecture **CLEAR**（最终native/absence 48项、原alias反例、零enumeration/关闭观察、cached alias回调/精确path budget及cycle门），综合 **APPROVE（限本批）**。architecture早期144项属于被拒绝的21dd冻结，不与最终48项相加。两lane最终8路径及用户`.gitignore`前后哈希相符，未改源码/测试/文档；早期HIGH/REQUEST CHANGES/BLOCK与实际失败材料保留。报告 `review-code.md`、`review-architecture.md`，提交/推送/精确CI另验。


该可选原生来源组件已提交/推送 `379dca3705ef4529f727a23ec329ea87d2ef2c73`，11个原始路径/blob审计通过、用户`.gitignore`原字节排除，GitHub git-ref API读回同SHA。CI38337159014/job115099739827与Watch38337158956/job115099739651均completed/failure、steps=[]；本轮分别读取annotations确认付款/spending-limit阻止启动，无远端验证通过。SSH关闭连接及代理EOF属于推送后的观察失败，未归为push失败；去除代理环境后API读取成功。材料 `.tmp/optional-sources/{commit-audit.json,delivery.json}`。


## 17. SAFE-02 技能可选根目录观察局部验收（2026-10-13）

项目、用户和显式技能根在stat前观察最近已存在parent；原SkillDiscovery ledger保留最早metadata及pathname，最终loader/catalog复验拒绝已知变化。初始普通文件/ENOTDIR阻挡向上找到目录；已经选择的parent在核验中消失保留ReadChangedError，不能变成optional absence。目录owner共享Linux核验句柄及原非Linuxpath分支，观察零enumeration、capture前关闭、无manifest jail扩张。

| 证据 | 实际结果 | 材料/边界 |
|---|---|---|
| 修复冻结 | 6TS/3production，用户`.gitignore`原SHA排除 | `inventory-repair.json` SHA256 `5f4e3d80100348cb530050162f6dcbf04206fc57bb87565f422312dcc618e214`；b7b3为被拒绝冻结 |
| 最终受影响组合 | Node20.3，11文件/157项通过 | `tests-repair.json/.log`；skills、extensions、read/directory、tool和completion consumers |
| 构建/源码门 | TS/单文件、四源码门通过，judge exit0 | `build-ts-repair`、`build-exe-repair`、四源码门及`normproof-repair-out/`；图satisfied，同4既有ceiling advisory/partial |
| 三项有效反转 | 全部actual AssertionError，正向副本通过 | `reversals-repair/results.json`；observer、retention、changed分类分别撤销，原source/用户`.gitignore`保持 |

初始catalog/工具consumer probes实际缺少预期拒绝；两lane额外实际复现普通文件阻挡及path核验parent消失，原拒绝审查和失败日志保留，修复后同probe重验。首轮测试的父观察handle计数和nested temp Git ancestry分别作为stale expectation/harness修正，原manifest变化拒绝和关闭断言保留。早期初版测试/CLI证据不替代最终修复freeze。

材料 `.tmp/skill-roots/`。元数据观察可能因无关parent条目变化保守拒绝；只能证明至最后逐源核验，非全目录/catalog事务或之后稳定。非Linuxpath分支模拟不等于非Linux实机/实际对象证明，§5其余边界继续开放，Phase19 active。本批没有全仓/scripts/PTY/真实provider新增结论；独立评审和提交/推送/精确CI另验。


最终独立code **APPROVE**（5文件/90项、七项owner/consumer probes和原initial/final path消失反例重验），architecture **CLEAR**（最终3文件/77项、原阻挡parent反例、alias binding、零enumeration/关闭及resource/budget/取消/清理检查），综合 **APPROVE（限本批修复冻结）**。两lane六路径与用户`.gitignore`前后哈希匹配；初始b7b3的HIGH/REQUEST CHANGES/BLOCK及失败日志保留，不混入最终计数。Node20.3/单文件两条actual print自动技能发现/调用CLI共4合成POST通过，忽略内容未发送、tool call ID与原manifest字节核对；这是stable路径，changed路径由实际catalog/tool consumer child probes证明，未声称changed CLI或PTY验收。报告 `.tmp/skill-roots/{review-code.md,review-architecture.md,cli-smoke-results.json}`。提交/推送/精确SHA CI单独取证，Phase19 active。

该技能根组件已提交/推送 `e9dc426cee2872feb4b1209ea495823f37bf0782`，远端同 SHA，用户 `.gitignore` 原字节排除。精确 CI38340153756/job115109091168 与 Watch38340153769/job115109091176 均 completed/failure、`steps=[]`；各自 annotations 确认付款/spending-limit 阻止启动，无远端验证通过。材料 `.tmp/skill-roots/{commit-audit.json,delivery.json}`。

## 18. QA-01 沙箱取消与最终集成验收（2026-10-13）

起点 `e9dc426`；当前 17TS/7production 冻结为 `inventory-close.json`，SHA256 `5572549e5ffa30f51aedbecaef240ad51d6ad18ff1be5031c4f0bf27c26802a2`。用户 `.gitignore` 原字节排除。沙箱计划只在原 detached execution owner 已负责会话时省去第二 `setsid()`；direct-execFile hook 保留默认。director 两处关闭对新 `endedAt` 取 `createdAt` 下界，避免回拨使原 codec 拒绝；不改变 schema、CAS、已记录结束时间或 unknown/重放规则。

| 证据 | 实际结果 | 材料/边界 |
|---|---|---|
| 最终全量 | 789 文件通过、1 文件原有跳过；7984 项通过、10 项原有跳过，零失败 | `full-suite-close-final.json/.log`，Node20.3、隔离合成环境、两个工作线程，601.77秒；最终源码清单核对一致 |
| 最终两种构建 | TS 与单文件通过 | `build-ts-close`、`build-exe-close`；包含两处时钟修复 |
| 最终源码结构门 | import cycles/config consumers/declarations/Node floor 通过；judge exit0 | `*-close`、`normproof-close-out/`；未解析及混合环 satisfied，4项既有ceiling advisory/partial保留 |
| 脚本套件 | 本批57项通过，零跳过/失败 | `scripts.json/.log`；脚本文件此后未改，不冒称重新运行 |
| 受影响组合与关闭 | 原沙箱组合106、82、87项分别通过；最终director/invocation两文件23项通过 | `failures-final`、`sandbox-owner`、`native-hooks`、`director-clock-final`；组间不累加为一次全量 |
| 三类有效反转 | 两个第二会话反转分别实际失败；原始关闭时钟使两个生命周期断言失败；正向副本通过 | `reversals/results.json`、`clock-reversal/results.json`；原source及用户`.gitignore`保持 |
| 六条actual print CLI | Node20.3/单文件×两类grep和sandboxed bash，12合成POST通过 | `cli-smoke-results.json`；call ID、正文/排除、实际marker/pwd和原字节；沙箱源码未变，未声称覆盖director关闭 |
| 原沙箱独立审查 | code APPROVE、architecture WATCH，原范围综合COMMENT | `review-code.md`、`review-architecture.md`；进程组、PTY/早期取消/timeout证据保持；最终时钟差异补审另记 |

早期全量的22、1、2项失败原样保留。中断/未完成的`full-suite-integration`以及旧线程CLI参数导致启动拒绝的`full-suite-close`不计通过。定向命令/存储探针证明1ms回拨会使两处关闭失败；修复后两个既有生命周期用例仍验证真实取消/清理、持久状态和零额外请求，不把时钟反例断言为此前随机失败的唯一根因。

查询/budget测试隔离metadata/materialization准备，仍检查实际plan/status/output/deadline/cancellation/cleanup；未mock的native套件负责视图集成。搜索测试要求实际descriptor原文/零replacement marker，并把已知替换与撤权分别报为changed/failed。独立Git根只隔离临时测试项目，没有弱化生产发现或权限规则。

架构WATCH继续为注入执行接口的detached session契约；当前默认图及实际进程已证明，未来adapter须保留该义务。隔离PID namespace内主动脱离组的探针不扩称普通shell、SIGKILL/OOM或全部平台的任意后代都可回收。

私有镜像两性能候选均未达预声明双路20%门槛，结束该方向、零生产性能补丁；`.tmp/native-mirror/`保留实验和harness失败，已有O(n)成本保持可见。

材料 `.tmp/integration-current/`。没有用户数据schema迁移；回退源提交并重建会恢复旧取消组/回拨缺陷，不需要重写用户数据。§5列明的非Linux对象、W7-33、实际前端/设备及公共服务/账户/SSH部署保持开放，Phase19 active。文档门禁及提交/推送/精确CI另记。

最终补审绑定同一 `5572549e…` 冻结：独立 code **APPROVE**（实际 Node20.3 的 7 项生命周期测试及 5 项命令/存储探针），architecture **WATCH**（独立 7 项通过、owner/CAS/codec 原字节检查），综合 **COMMENT（无阻断，限本批）**。两条 lane 前后 17 路径和用户 `.gitignore` 哈希一致；WATCH 为注入执行适配器必须维持 detached session 义务，不要求为假设中的适配器新建执行系统。原专用路由 503 不计审查；继承当前会话配置的两条独立 lane 实际返回证据。代码探针启动器和架构错误工作目录的失败保留，后者生成的两处自有临时目录在确认进程终止后已精确清理。报告 `.tmp/integration-current/{review-code-close.md,review-architecture-close.md}`。

本批代码及验收文档已提交/推送 `32b3110705c4588d264c30ee2d1ad7b6a0c23535`，远端 git-ref API 读回同 SHA；20 个提交路径的原始 blob 与冻结清单逐项一致，用户 `.gitignore` 原字节排除。最终 strict docs 门禁通过，验收表 76 个本地路径链接均存在。精确 [CI 38389024800](https://github.com/h-hei133/cheers/actions/runs/38389024800) / job 115267873427 与 [Architecture Watch 38389024889](https://github.com/h-hei133/cheers/actions/runs/38389024889) / job 115267873468 均 completed/failure、`steps=[]`；各自 annotations 确认付款/spending-limit 阻止启动，**没有取得远端验证通过**。材料 `.tmp/integration-current/{commit-audit.json,delivery.json}`。后续交付补记只修改文档；本批源码、全量/构建、提交/推送和外部前置失败分别取证，Phase19 总目标仍 active。

## 19. Windows UNC 读取局部验收（2026-10-13）

取证起点 `60ab0f66f87ee26ec7d8956d871965c00b04cf87`，产品源码仍为 §18 已交付版本。WSL 可以启动宿主的原生 Windows 进程；本轮在 Windows NT 10.0.26100.0 上，分别用 Windows Node **20.3.0** 与 **24.12.0** 访问仓库 UNC 路径。Node 20.3 来自官方发行文件，SHA256 与官方清单一致，记录在 `.tmp/windows-read/node-verification.json`。运行前把 HOME/USERPROFILE/TEMP/TMP/CHEERS_TEST_ROOT 指向仓库内隔离目录，再动态加载现有编译 owner；未调用 provider。

| 检查 | 实际结果 | 范围 |
|---|---|---|
| 文件与目录行为 | 两个版本各 6 项通过 | 稳定正文含 BOM/CRLF、稳定枚举、越根拒绝、预先取消拒绝、已观察目录修订变化拒绝、打开后文件替换拒绝并核对 descriptor 仍读到原字节 |
| Windows 目录能力 | Node 20.3 的目录 `openSync`/`fstat` 成功，既有 `ensureWorkspaceDirectory` 创建嵌套目录成功并清理 | `O_DIRECTORY`/`O_NOFOLLOW` 均未定义；这些常量缺失不能单独证明目录句柄不可用，也不提供禁止重解析保证 |
| 源码与编译产物对应 | 六个读取、目录、路径及编辑 owner 的 ESM 输出逐字节一致；源码、对应 dist 和用户 `.gitignore` 哈希保持 | TypeScript 5.9.3 内存转译比较，不是新一轮全量构建或类型检查 |

行为原始结果为 `.tmp/windows-read/baseline-node20.json`、`baseline-node24.json`；目录能力为 `capability-results.json`；源码/产物清单及范围为 `inventory.json`、`compiled-inventory.json`、`audit.json`。首次孤立转译没有读取 package 的 `type: module`，把 NodeNext `.ts` 当成 CommonJS，六项比较均失败；该 harness 记录保留在 `source-emission.json`。按项目 ESM 格式修正转译后，六项实际相等，材料 `emission.mjs`、`source-emission-esm.json`，没有为迁就检查器修改源码或 dist。

[读取 owner](../../packages/ts-shell/src/runtime/execution/read.ts)与[目录 owner](../../packages/ts-shell/src/runtime/execution/directory.ts)在非 Linux 分支仍依赖路径复验和 metadata/descriptor identity 比较。定向参考比较区分了路径级检查与原生禁止重解析、句柄对象验证；后者不能由本轮通过的路径检查替代。本轮没有发现新的具体产品回归，也没有新增原生模块或执行平面。

证据只覆盖 **Windows 进程访问 WSL UNC**，不覆盖本地 NTFS、原生对象路径绑定、macOS、完整 Windows CLI/套件、PTY/字体/IME 或设备。§5 的真实服务/账户、四端点 TLS/HTTP2 与远端 CI 条件仍开放；Windows 局部通过不改变 Phase19 **active**。本批仅更新文档，§18 的全套与构建未重复运行。
