# Phase 20 交付状态

本文只记录有实际证据的状态，不把实现等同于交付。提交、推送与 CI 分别列出；未运行的真实 provider、PTY、跨平台与发布验收不算通过。

## 当前剩余工作（2026-10-25，真实认证与HTTP连接补证）

范围只来自 [Phase 20 决策](phase-20-decisions.md) 及其引用要求。机器矩阵当前为 **38 complete / 9 partial / 0 open**，整体 partial。原36项complete保留已有证据；PAN-07以真实OpenAI登录/取消/刷新/撤销失效/本地退出补证，PAN-08以用户指定HTTP MCP两轮产品连接/发现/只读调用/关闭补证。正式质量、真实多账号及桌面交互按用户决定延后，不兑换成完成。

用户需要准备的信息、环境和回填模板见 [剩余验收准备清单](phase-20-inputs.md)；已有配置不重复索取，QA收口由代理负责。

| ID | 尚缺证据 | 所需输入或结束条件 |
|---|---|---|
| PRV-03 | 两个可区分真实账号的池选择/切换与隔离 | 同一账户的两次独立OAuth登录、刷新、撤销后失效、本地退出及跨profile拒绝已验；用户暂缓多账号，不把两profile称两账号 |
| PRV-05 | 可信远端结算/账单与本地ledger对照 | 官方API Usage/Costs入口已核对；本轮账户接口只返回quota。仍需可访问的账户/项目账期或脱敏导出，OAuth Free配额不能当USD结算 |
| TOOL-02 | 同模型full/dynamic真实配对、总量/cache成本、参数质量、四语言校准 | 固定模型/协议、预算和正式评测条件 |
| PAN-06 | 实际系统剪贴板/平台接受结果 | 适用终端与系统复制实测；本地copy/back/restore/undo/cleanse有限生命周期已覆盖 |
| INPUT-01 | 真实IME、系统复制、Windows交互终端 | 适用机器、终端、输入法；本地五模式/字素/粘贴/源选区/外编合同已有证据 |
| QA-01 | 剩余多账号/账单/质量/平台任务的适用验收 | 本地47行索引及真实单账号OAuth、stdio/HTTP MCP已补证；随剩余外部任务更新 |
| QA-02 | Windows交互PTY、真实IME、系统复制 | 新Platform QA40098086773在d8192609的20个支持格全部通过；Windows仍只含line/print，未覆盖交互/IME/系统复制 |
| QA-03 | 真实配对运行与双盲评分 | 固定模型/预算、评分者；启动性能已有独立START-03结果并已索引 |
| QA-04 | 全范围最终交付、精确SHA CI及结构/双构建/全套证据；函数数量超限仍有8个模块 | compaction检查点提取后21→19，本地judge仍partial；其余8项见下表，不能只归因于外部输入。历史CI失败保留，新SHA结果独立读回；不要求公开Release |

累计OS physical I/O、page cache、总heap、最长响应仍为补充WATCH；原规划没有要求在任意机器证明其统一绝对上界。观察到的逻辑body bytes、owner缓存/页数、source cap、句柄及绘制矩形分别报告，不互相替代。back外层source/sourcePending闭包仍有源码上的保留疑虑；本轮未测可达性，不称已证明泄漏或heap释放，也不据此新增隐式功能要求。restore运行时attempt index有既有16个上限，关闭单面板不要求清空全局cache；undo每次接受/翻页仍按原合同完整重验ledger，不追加跨页累计读取cap。

## 2026-10-25 QA-04 检查点职责与结构证据

- 精确文档提交 `81987b36e2384396b8dc6f5315e8c8a4f087975f` 已提交/推送且远端main一致。CI40153576073/job121050021116仍在运行，静态/script门和TS build已通过；Watch40153576102 workflow success，但artifact12583686700实际verdict为partial：cycles/imports satisfied、函数上限failed advisory、9个proof gaps。旧SHA结果不归给本批源码。
- 本批只将既有检查点marker、format/read移入 `session/compaction/checkpoint.ts`，压缩协调器保留兼容re-export；marker字节、摘要识别、生成及提交行为不变。先读本仓，再对照参考实现的既有摘要显式修订决定；保留本项目格式和既有重复压缩回归，不重复实现摘要系统。协调器声明21→19，新owner两函数。
- 主代理串行静态五门、47行矩阵、diff check通过；package-local compaction.test.ts共36项通过，TS build通过。有效反转把checkpoint识别guard改成恒拒绝，原suite有3个AssertionErrors（写入后识别、无system message识别、修订旧摘要）；恢复精确源码字节后36项再次通过。无本地全套、exe、真实20k PTY或子代理验证。
- build `2ca5e72aef8b5c6abe30447cf7745975e61b60c0feaaf0c7e25ff9d3fc8cd89d`，inputs `02ef9a692b391316d2d1fe395085ae1ab2815b0623a49440468c3e62c59eb2ac`，artifact `b1035f821e4eb3b4190115692ea13c32e12624a28313b10f1174c0b212336140`；本地Node24.15.0，不替代远端Node floor证据。默认normproof executable缺失exit127是可用性问题；使用仓内既有tgz的同一CLI串行judge实际exit0/partial，无cycle/unresolved specifier，8个proof gaps、0阻塞缺口。analyze:module-facades也不再报告compaction。安全摘要、manifest和judge结果保存在Git忽略的 `.omx/artifacts/phase20-checkpoint/`，临时解包随后清理。本批提交/推送和自身CI另读回，QA-04不升为complete。

| 当前函数上限finding（20） | 声明数 | 处理边界 |
|---|---|---|
| cli-baseline.test.ts | 29 | 既有集成fixture；保留历史disposition，未拆场景 |
| cli/interactive/turnSink.ts | 22 | 单turn输出状态；既有defer，不以记录当豁免 |
| core/shell/sessionRuntime.ts | 21 | session公共状态面；既有defer，未改运行语义 |
| presentation/tui/surface/view.ts | 22 | terminal view职责仍待复核 |
| provider/aws/credentials.ts | 26 | provider签名/凭据owner；既有defer，不能用QA日志掩盖认证改动 |
| session/SessionManager.ts | 24 | session facade，历史处置保留；judge仍报告 |
| session/store/sessionStoreAccess.ts | 22 | store accessor/校验，既有defer；记录不改变verdict |
| workflow/jobs/local/registry.ts | 24 | 本地job登记职责仍待复核 |

## 2026-10-25 允许执行的真实验收

- 源码基线 `b60631add93dd98b6b8b3a720e7d49a71e02ab35`，本轮通过本地tsx执行原TypeScript owner，没有修改产品或构建，也不声称生成新二进制。全部探针主代理串行、Node heap限768MiB、状态隔离在 `.tmp/phase20-live-auth`；没有子代理验证、本地全套或20k真实PTY。安全摘要及私有网络回滚备份保存在Git忽略的 `.omx/artifacts/phase20-live-lifecycle/`，正文不保留API响应、账户值、凭据或headers。
- Windows Chrome实际完成两次独立profile授权（同一Free账户）：原 `runProviderAccountAuthLogin` → PKCE/loopback callback → issuer token exchange → pending/connected条件保存成功。两次均有access/refresh与账户claim、约10天有效期，主配置SHA-256未变。另一次原登录在progress回调取消：pending→error，无凭据，原accepted连接与mirror字节语义不变，1455 listener关闭。对照本地参考的PKCE、精确issuer及loopback决定；本轮不改既有协议常量或callback实现。
- 两次原 `renewStoredAccount` 各只发送一次真实refresh请求，HTTP200、access及refresh变化、账户claim不变、writeState persisted、原rotation receipt确认、无cleanupFailed。探针仅临时把Date.now推进到本地expiry gate，在真实HTTP发送前恢复时钟；响应有效期/持久阶段按真实时间处理。证明真实刷新协议及原lease/CAS owner，不称自然等候10天过期。异profile持同一旧resolution尝试刷新在发送前拒绝，0 HTTP、无异profile config、原config不改；这是owner隔离，不是两真实账号切换。
- 用户授权的两次专用grant撤销，固定issuer `/oauth/revoke` 均HTTP200（诊断调用，不宣称产品新增撤销动作）。撤销后原续期各HTTP401、stored false/writeState unchanged；第二轮在同一到期gate重复调用，累计HTTP仍1，failure保留；lease文件实际为rotated-persisted及unknown。随后原 `removeConnection` 删除精确连接，写后无连接、无accountAuth、空env重新解析无凭据；主配置不变。第一轮探针误断言HTTP400而真实为401，exit1且后续未执行；保留该harness错误，第二轮修正400/401语义后完整exit0，不以新通过改写旧失败。旧resolution重复请求保护有第二轮实测；多账号仍延后。
- Windows有效DNS确认fake-IP blacklist、IPv4 `198.18.0.1/16`、IPv6 `2001:2::0/64`；两端初始GitHub解析 `198.18.0.149` / `2001:2::96`，原策略拒绝。用户随后明确授权直接修改Windows配置：在既有全局脚本追加两域名例外，保留原三条；chatgpt.com的上游受污染，追加该域名经已有proxy group访问Google DoH的policy。两份原配置备份0600，最终generated YAML除dns.fake-ip-filter及该policy外逐值相等；原TUN、rule mode、mixed port7897不变。通过实际service named pipe重载HTTP204并读回控制状态；配置文件的sidecar pipe已失效，读取实际pipe后才连接，reload payload保留实际production pipe。原出口策略/TLS没有放宽。最终GitHub解析140.82.114.21；chatgpt解析172.64.155.209/104.18.32.47及对应IPv6，和独立公开DoH一致。依据[DNS例外与加密查询官方规则](https://wiki.metacubex.one/config/dns/)。
- GitHub沿原 `CoreMcpGateway` 两轮创建独立HTTP连接，继承环境变量名GITHUB_PAT_TOKEN；每轮connected、49工具（29有readOnlyHint），固定search_repositories查询 `repo:h-hei133/cheers`，实际命中、isError false、响应391 bytes、SHA-256 `b6c8f9cb73baf162b64b14bb09fe9082c40ef3a553b4bc35f9cac29e3288111c`。每轮await gateway.close后peekSnapshot undefined，原本机MCP配置和隔离fixture未改；不称环境Bearer有OAuth刷新，也不称远端连接DELETE receipt已验。PAN-08原缺HTTP产品路径已覆盖。
- 第二轮原 `loadAccountUsage` 在DNS修正后成功：primary usedPercent0、resetAt2026-11-24T02:06:59Z，reset creditStatus available/count0。这是当前quota窗口，不是token消费/结算账单；本轮未调用模型、未消耗正式评测预算。官方[认证](https://learn.chatgpt.com/docs/auth)、[计划用量](https://learn.chatgpt.com/docs/pricing)、[API Usage](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage)与[API Costs](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs)分别核对：API-key计费与ChatGPT计划额度分离；Usage含token/cache/model/project及请求聚合，Costs含amount/currency/project/line_item/time bucket、使用Admin key。网页[API用量入口](https://platform.openai.com/usage)需账户权限（匿名读取403）；没有账期/项目或导出不能完成PRV-05。当前Free官方说明Luna桌面rollout，不以登录成功推断Cheers可调用哪些模型。
- 精确基线CI40102647934于2026-10-24T14:47:45Z success（Build & Test120897783546，静态/script tests/TS/单元/结构步骤均success）；Watch40102647931于14:28:53Z success是workflow结论，不兑换全部结构义务satisfied。前代码0951b1c9 CI40100450408同样completed/success。新文档提交/推送及其CI另读回，未继承为新SHA结果；38/9/0是适用补证后的任务计数，不是阶段全通过。

## 2026-10-24 用户指定真实连接与平台探针修复

### 用户指定 GitHub HTTP MCP Bearer 适配（本批）

- `.cheers.mcp.json`（本机 Git 忽略）保留既有 `code-index` Serena stdio 定义，并加入 `github` HTTP 定义；只保存 `bearerTokenEnvVar = GITHUB_PAT_TOKEN`，不保存或打印 token。静态 Authorization 与环境引用冲突、非法变量名、非 HTTP transport 均拒绝。
- HTTP transport 在物理连接创建时捕获并校验环境凭据；每次请求在准入后、发送前和响应继续使用前复核，缺失、非法或变化均拒绝且不咨询 OAuth、不重放、不把凭据发往其他路径。`/mcp auth` 与 `/mcp logout` 对外部 Bearer 返回 `unchanged` / `not-tested`，提示配置环境并显式重连。
- 新增配置/HTTP 回归与既有 MCP/auth 测试共57项通过；四项有效反转（Bearer wiring、OAuth fallback、环境变化 fence、错误 auth/logout 路径）各以 AssertionError 失败，恢复后源码字节一致。静态五门与 TypeScript build 通过；独立只读代码审查 APPROVE。
- 隔离 provider 探针未打印响应体或凭据：无凭据 GET 返回401，当前环境 Bearer 的直接 HTTPS 探针返回405，初始化 POST返回200。Cheers 产品探针被本机严格 DNS 出口策略拒绝（`api.githubcopilot.com` 解析为 `198.18.0.137` / `2001:2::85` 特殊地址），归类为 provider/network policy blocked，不冒充产品连接成功；待适用出口解析环境再复验真实只读工具发现和调用。该外部 Bearer 不证明 OAuth 登录、刷新、失效或退出。

- 基于源码 `7bff50a4fe9ff44729247ffab455f48b8ce4d3b5` 及原 TS build `612f7166d0b41ab4e0b694d41922c965bb3db1cc5fc94506b77c0b9984c17b58`（inputs `6b7f3f0eab6a0609d2915907d6d0d8804d2f695e5e2d27adb4ff90220a16bb6c`、artifact `f7f1ce062002083170299bf59d9807c1c71d19135ac54aa848a1e7f7c19ed67a`）进行了真实验收。用户已指定本机 stdio MCP executable 和现有 provider 配置，并授权正常运行时调用。两者串行，HOME/USERPROFILE/XDG/session/cache/fixture均隔离；未打印密钥、token、headers或真实响应正文。
- 真实 stdio MCP 经原 `CoreMcpGateway` 两轮连接，每轮发现23个工具；`search_for_pattern` 只读查找隔离项目 `probe.ts` 的已知标记，每次响应136 bytes、SHA-256 `057301218042488b3aea0d9fd8c90ef50e86d028176efd7504caeacf39ed0a34`。每轮 `gateway.close()` 后真实PID均为ESRCH，fixture源码bytes不变。首次诊断探针误选当前context不提供的工具、误用不存在的shutdown方法，外层120秒超时；这是探针错误，未当产品缺陷或通过，已检查无所属残留进程。修正工具/关闭方法后的两轮才计通过。
- 已将用户给定配置转换为本项目 `.cheers.mcp.json`，命名 `code-index`、保留stdio启动参数并关闭自动dashboard；原runtime加载确认project scope、stdio、正确sourcePath和可用executable。该文件为本机配置，加入本地Git exclude，未进入提交；主provider配置未改。`startup_timeout_sec=60` 不属于本仓MCP schema，未静默写入，仍遵守原共享30秒catalogue deadline。连接证据来自小型隔离TS项目，不宣称已对整个产品仓库完成语义索引。
- 模型经原 `node dist/cli.js --print --json --config <existing-config> --config <isolated-overlay> --project <isolated-project> --no-context-files --no-skills --non-interactive-approval deny --tools read <fixed-marker-prompt>` 完成一次真实请求。overlay只限制输出至128 tokens并关闭MCP，不改用户连接/凭据。exit0、completed/success、返回预定标记、0 tool calls、stderr0 bytes、7679ms；返回正文只在内存比对，报告只保留29 bytes和SHA-256 `dd37418ae3753a97702dfc221ab9827d0b3bc18b2dc6e77de606859b1f207037`。隔离ledger为1条turn request，attribution `openai-compatible` / `auto`，prompt1006、completion50；真实provider主配置stat版本与fixture源码不变。未核对可信账单，也未把配置别名auto当作固定实际模型版本。
- 此服务不要求OAuth；连接成功不能验收OAuth登录/刷新/失效/退出。当前provider成功也不等于账号池完整生命周期或正式模型质量。PRV-03、PAN-07、PAN-08、TOOL-02及QA依赖继续partial；所缺输入已在顶部逐项缩窄，不再要求重复提供已成功使用的配置。
- Platform QA `40095404655` 绑定上述源码SHA，20个受支持CLI格实际为17 pass /2 fail /1 skipped：Windows两种line/print启动共4格通过；Linux/macOS常规PTY均通过；macOS Node fullscreen与Linux executable fullscreen均在第二次diff source copy超时，macOS executable fullscreen随前一步失败跳过。保留这次failure，不以本地通过覆盖。
- 实际失败artifact证明首次OSC52后，复制结果toast多占一行，diff由CUP row55移至row54且row55被清空；原探针“固定row55”假设错误，分类为harness readiness/geometry race。只修QA：等待完整复制结果行及当前完整source行，按renderer实际CUP(row,1)…K重写/清除定位下一次点击；初始分块、覆盖分块、原CUP+J清屏均使未完成行不可选。两侧精确OSC52源文顺序断言保留，未改产品复制、权限或渲染行为。
- 最终静态五门、requirements矩阵、`node --test scripts/qa-clipboard.test.mjs`六项、harness语法检查及`QA_PTY_TARGET=node QA_PTY_MODE=fullscreen NODE_OPTIONS=--max-old-space-size=1536 node scripts/qa-pty-smoke.mjs`串行通过。最终Node fullscreen为Linux/x64/Node24.15.0、exit0，沿上述原TS build；不冒充Node floor20.3或新exe验证。恢复固定第二行、把OSC52当就绪、保留覆盖中旧行、忽略renderer原CUP+J清除四项反转均exit1且实际AssertionError，helper bytes逐项恢复；最终helper SHA-256 `5b92f381a49cf28f12aad515bcd22f141cda9e40c2d68adc32584cfa2c3d40ad`。定向对照参考复制owner以native settlement约束顺序操作的决定，本仓将等待放在QA动作间，保留原产品即时offer语义。独立只读代码APPROVE/架构CLEAR，指出的初始/覆盖分块与原清屏均已补回归。没有运行本地全套、重新构建exe或真实20k压力；本批不修改产品源码，沿用原TS artifact而不称新SHA重建。提交/推送和新的跨平台/CI结果仍分别取证，旧failure保留。

- 交付读回：QA修复及真实连接记录已提交、推送为 `d81926093a88aaf34740058e2c72d709968cc5a3`，远端main精确一致且tracked worktree干净。新[Platform QA40098086773](https://github.com/h-hei133/cheers/actions/runs/40098086773)绑定该SHA，2026-10-24T13:28:30Z completed/success，20个支持CLI格全部success：Linux job120884441022与macOS job120884441258各8格，Windows job120884441245为4格；各平台TS及单文件exe构建也实际成功。两个旧失败的fullscreen格及原跳过的macOS executable fullscreen均已通过。只证明既有支持矩阵，不外推Windows交互/真实IME/系统clipboard；旧40095404655 failure继续保留。常规CI40098055650/job120884344406及前SHA7bff50a4的CI40095140860/job120875691133在本次读回时仍in_progress，不能称全套或NormProof通过。本次后续提交只记录这些结果，不宣称已对其新文档SHA重跑平台。

### 47行有限审计处置

两路独立只读审计按原决策逐组复核源码/fixture/既有反转与交付索引；它们没有运行测试，以下保留证据不冒充新测试执行。`verify:phase20-requirements`只验证ID/状态/非空索引，不证明行为。

| 完成任务组 | 数量 | 处置 |
|---|---:|---|
| CFG-01…05 | 5 | 保留profile/input/scope/environment成功、拒绝与身份变化证据；CFG-03修正到真实inputs/runtime与publication fixture |
| PRV-01/02/04 | 3 | 保留relay精确身份、原子preset、refresh unknown证据 |
| CTX-01…04、TOOL-01 | 5 | 保留预算/compaction/report及实际HTTP动态schema组合 |
| UI-01…04 | 4 | 保留几何、current hit、unknown progress及精确源复制 |
| CMD-01/02、SET-01…03 | 5 | 保留语法、失效、typed editor及外部publication/preview |
| PAN-01…05 | 5 | 保留已有身份/能力/任务/报告/PTY；PAN-02目录、tree、管理、分页、取消及真实source→host链有限复核闭合 |
| RENDER-01…03、EDIT-01 | 4 | 保留源文、有界渲染、精确hunk审批及反转 |
| JOB-01/02、START-01…03 | 5 | 保留生命周期、构建身份及已有性能结果 |
| 上表11项partial | 11 | 外部条件及其最终验收依赖逐项保留；36+11=47 |

已有CTX-02×TOOL-01、restore×undo、profile×approval、catalogue/listing/files、tree/navigation/OverlayHost、cleanse burst/drain、管理动作及PAN-08消费者不重复列为缺失。§6.1要求关键保护有效反转，并不要求另造47个独立mutation。全套与两种构建仍由适用远端CI承接，遵守本轮禁止本地全套/真实20k压力和严禁并行重验证的红线。

## 2026-10-24 PAN-08 原report合法超限的可读投影

- 原help200×4096字摘要、skills200×2048 CJK描述、tool detail100×4096 CJK参数及24000逻辑行描述、debug summary10000tool names、metrics2000groups、logs200条合法多字段CJK记录，共七回归在原producer真实RangeError（共享resource/line limit）。不是来源不可用，也不应失去整个只读报告。
- 新report/window对已捕获、有界metadata先尝试完整候选，只有typed ReportLimitError时用零prefix和二分重试同一createReport/reportText，保留已验证前缀；不建立第二套预算估算器，不承诺最大prefix或整体heap/时延。metadata redaction、aggregation、原schema/description字节测量及获取都在retry外。help/skill/tool detail/logs/metrics分别保留总数、shown/omitted/coverage；logs/metrics的source status与projection partial分开。debug summary固定最多200 names，count仍pool.size，另记name omissions。已有tools list最坏多字节200项仍完整可持久化，未改其生产逻辑。
- 把codec原bounded traversal提取到report/limits并在createReport最终snapshot复用，生产/持久化共用20k结构节点/深度/byte要求；原REPORT_BYTES/NODES/LINES/DEPTH不提高，typed limit仍为RangeError子类。tool description在原48k字符外加1000逻辑行界，raw description/schema bytes保持、省略明确。非空源零prefix不伪称空目录/无参数/无日志。所有新overflow报告均验证text及readReport(JSON roundtrip)；source数组/总数/原测量不变。
- 独立review发现function/cycle facts可被误当resource overflow后省略，回归原candidate实际AssertionError后改为遇到非法primitive/ancestor cycle抛TypeError；共享非循环引用仍可detach，普通producer RangeError/TypeError不吞。只保证遇到的错误传播，不宣称会遍历所有被省略单元做完整验证。纯window还有normal一次投影、control expansion/有效零prefix、固定内容超限及decoder结构界测试。
- 七项有效反转（prefix fit、typed-only catch、snapshot/codec共同结构界、tool line cap、debug name cap、help omission与非法facts）均exit1+AssertionError，production bytes恢复；typed-only首版因builder在零prefix也抛同错而green，改为零prefix合法后有效，不算首版反转。先9文件56项通过；最终恢复后的实际11文件106项及全部静态门/matrix、TS build串行通过，测试/build heap1536/2048MiB。命令里误列不存在的metrics/reader.test.ts被runner忽略，未计该coverage；该owner只有report.test，未改reader。build `8567bd91b1808237d278a47c402f82da5322231e7a075d562109b30af9bcd954`，inputs `6bbf0a45074d69e95549162c0cbd0355b889ed6d5a957aa0fbbecb43bdbf03a1`，artifact `ac7568573fafff17eda40d5e4a5e2cdff7cfd5ff5aa6965db060a3b4a423105a`。独立只读代码APPROVE/架构CLEAR，两路未验证；无scratch/full suite/exe/PTY/20k真实压力。
- 参考实现把line/byte双界与源total/output计量分开；本仓沿原report owner适配，未复制参考代码。有限PAN-08动作/overflow审计的两项本地缺口（accepted owner、原producer可读overflow）已分别补证，外部真实MCP连接/认证及原平台/质量条件保留，不把physical I/O/总heap/最长响应WATCH写成新增硬门槛；35complete/12partial/0open暂不提高。PAN-02/PAN-06及QA-01有限剩余复核继续，当前批提交/推送/新SHA CI另取证。
- 前批`51c38bcfed8bb9b12b18739f999f71354f320374` CI `40090390221`/job `120861687202`于2026-10-24T11:51:42Z completed/success，Watch `40090390362`success。`7097be968fef09ed46f4ba319e597218661001a7`已提交/推送/main精确一致且当时clean，CI `40091752154`仍in_progress，Watch `40091752142`success，各绑定自身SHA。

## 2026-10-24 PAN-07/PAN-08 accepted检查动作的真实终端取消（`7097be96`；已推送、CI运行中）

- 真实pickerHost未提供runCancellable，tools/skill accepted读只有timeout，debug调用也无owner；新增实际InteractiveMode→onSubmit→Enter→ShellSessionRuntime回归在原实现三项AssertionError。接入owner后同三项仍在真实Ctrl+C失败，定位holdInput吞键、keymap不识别local command和idle interrupt不取消/排空三条缺链。现在只在存在command owner时放行app.clear/app.interrupt绑定，继续阻挡普通typing/paste；原commands.run提供单一owner，idle interrupt等待原cancelAndWait，不占turn sink。无owner的held picker仍保护原草稿。
- tools/skill accepted inspection合并原signal、command和30秒timeout；load仍归browser。command自身取消即使原signal仍live也不发布unavailable；成功与fallback的admission回调后均复核command/original signal。独立复审发现的两类reentrant取消各由两项实际AssertionError复现后修复，早期BLOCK/REQUEST CHANGES已解除，最终只读代码APPROVE/架构CLEAR。
- 原host tools的Ctrl+C/Escape与debug tools的Ctrl+C，挂起snapshot port直至release，确认owner在settlement前保留、原draft不丢、零迟到报告/错误/模型请求。skill真实128KiB manifest仅在accepted的第二次open挂起首64KiB；Ctrl+C后descriptor未提前释放，release后close且零下一chunk/正文/draft，源bytes不改。32字节body的真实accepted成功另证browser退休后仍显示正文、插入原技能draft。**128KiB成功终端绘制未验证**：首版成功夹具同步render耗时异常，主代理主动终止该次7项外层链（实际6文件选择）进程，exit143，不计通过；取消大body和小body成功不相互替代。
- 八项有效反转（host port、held key gate、keymap interruptible、idle drain、tools/skills成功publication fence及各fallback fence）均exit1+AssertionError，production bytes恢复。首次过窄-t筛选零测试的exit0属于harness selection drift，不计有效反转。最终静态门/matrix、恢复后的7文件178项与TS build串行通过，heap1536/2048MiB；build `393dd2dd81db5470f405baf3eba3031d782cc75b3b766f038bd9068277fb721e`，inputs `23f1c7e9b0d69de9f0293f80f94615307b76730f116d2efdb1f0362bd6ddaaae`，artifact `7716b2c19ff2fc0de2f2cfada8ba56b150191784dab8e244f8a6a781efd1dc2f`。无全量/exe/PTY/真实20k测试；本批交付另取证。
- 前批`22fe64d9652144e112af587b4486f97922502f2f` CI `40089243043`/job `120858338863`于2026-10-24T11:34:20Z completed/failure：10429 passed/3 skipped/1 failed，唯一browser/runtime/process.test external native cancellation在读marker时Unexpected end of JSON。源码确认existsSync可看见writeFileSync刚创建但未写完的就绪文件，分类为fixture readiness竞态；夹具改为同目录.pending完整写入后rename发布，原cleanup状态和双PID停止断言不变，六项focused通过。未更改browser产品运行时。
- `51c38bcfed8bb9b12b18739f999f71354f320374`已提交/推送且精确读回main，CI `40090390221`仍in_progress、Watch `40090390362` success。有限PAN-08动作/超限审计已确认原help/tools/skill/context/cost/usage/debug多数动作与source生命周期有证据；本地下一项只补help/skills/tool detail/debug summary/metrics/logs合法输入超过CommandReport共享预算时的可读partial，来源总数及原计量不得丢失。真实认证仍需外部条件，原资源WATCH不扩成新全局指标；35complete/12partial/0open保持。

## 2026-10-24 PAN-07/PAN-08 直接检查命令取消与debug降级边界（`51c38bcf`；已推送、CI success）

- `/tools`、具名tools及`/skill`、具名skill原handler没有进入交互桥提供的runCancellable。真实route→ShellSessionRuntime→toolPool/catalog→挂起gateway port的tools两项及真实128KiB manifest前64KiB挂起的skill两项，在原实现均实际AssertionError。现在解析成功后才注册现有command owner、合并原signal；helper在两次admission回调后重检，consumer在await后拒绝迟到投影。工具endpoint配置回调即使被原fallback捕获，取消仍在报告前拒绝；named匹配语义保留。
- 受影响`/debug tools`原catch把取消转成unavailable，summary直接调用getToolPool且未注册owner；debug picker忽略原signal。新增十项原代码AssertionError后，summary/tools沿单一owner执行，内部tools委托关闭嵌套注册，summary复用readToolPool。降级catch复核signal/admission，普通来源失败仍安全unavailable。debug picker在admission前后核对原signal并抑制迟到成功/错误。未扩大provider/auth核心。
- 真实manifest取消测试观察descriptor先保持、release后close一次、正文仅64KiB且零下一chunk，报告/正文不发布、源bytes不改；gateway仅证明snapshot port边界，不冒充真实MCP wire/auth。共享reader的final admission取消另由tool picker无browser signal回归独立覆盖，防止直接handler的后置检查掩盖缺陷。
- 七项实际保护反转（tools owner、skill owner、tool reader final fence、endpoint fence、debug summary owner、debug tools fallback及debug picker原signal）均exit1且AssertionError，每项后production bytes完全恢复。原it.each数组参数展开及旧路由fake runtime缺commands端口归harness drift，已按真实接口修正，没有弱化行为断言。
- 最终恢复后的7文件135项、全部静态门/matrix与TS build串行通过，测试/build heap上限1536/2048MiB；build `ed1ce984b84fb938bfb218ba50ee0966e7a095a7d3da8a5ee24fc30b527394de`，inputs `e680fb11d17f49fb679d3ce5e188aa8c291303909f7cd5b4b8aa8db5c6718319`，artifact `83692ba592aca6f4282b8462dd0a4fa6d7b29a8a3ec39f3aaa897af4645a47b1`。独立只读代码APPROVE/架构CLEAR，两路未执行验证。参考取消dialog的signal所有权与迟到结果拒绝，复用本仓边界；不复制参考代码。无反转scratch、全量回归、exe/PTY或真实20k测试。
- 下一批明确本地缺口：accepted tools/skill picker仍只使用timeout helper读取，真实pickerHost尚未提供runCancellable；需补接受动作的owner/取消排空，不把本批直接命令证据外推。任意扩展贡献Promise排空、全目录options、总heap/physical I/O/硬延迟仍无本批保证。矩阵35complete/12partial/0open保持；本批commit/push/新SHA CI分别取证。
- 前批交付读回：`d81387c7ba4e486186eab6f6f986bef434d71bbd` CI `40087846921`/job `120854306178`于2026-10-24T11:08:24Z completed/success；`5bd0a5a05974ac56bcd8061a5d7efcb9d596ce0f` CI `40088907743`/job `120857363446`于11:25:28Z completed/success，两者Watch均success。`22fe64d9652144e112af587b4486f97922502f2f`已推送/main精确读回且当时clean，CI `40089243043`/job `120858338863`仍in_progress，Watch `40089243040` success；均只绑定各自SHA。

## 2026-10-24 PAN-08 help 重复交互与usage overview（`22fe64d9`；已推送、CI failure（夹具readiness竞态））

- 原helpPicker/registry/OverlayHost在32字节/128KiB两档summary各十轮打开、alias过滤、20规定矩形绘制、live registry update及Esc中计量。每次打开两次listSlashCommands（load一次、subscribe立即publish一次），每次live update再一次；过滤/绘制与关闭后update零新增该入口调用、零host apply，options/model/row索引清空。选中option<5KiB且detail≤4096字符、raw summary保持；不把入口调用次数当作内部所有枚举计数，也不宣称完整registry字节有界。
- usage从真实本地usage ledger，经原PickerLifecycles/OverlayHost Enter接受、overview/costReport、真实Pager，各十轮过滤/20矩形/关闭。账本110 tokens/1 recorded request事实、转录block/report不变；reader report/source/rows/filter释放，绘制无额外readConfiguration、零account fetch。无真实账户调用或实际terminal输出声明。
- 两项关键保护的实际反转（OverlayHost释放unsubscribe、help detail安全投影）均非零且AssertionError，生产文件逐bytes恢复；未创建scratch。原test误假定subscription不立即publish及未支持execute字段已按接口修正，分别计harness drift/测试设计，不当产品缺陷。恢复后的两文件23项、最终静态门与需求矩阵串行通过，独立只读APPROVE/CLEAR；只补测试与证据，不重复产品build，沿前批build绑定，不把它标为本SHA重建。
- 已补help/context/cost/tools/具名及扩展skill/usage overview的小型获取→投影→保留→关闭链；全目录options、full-ledger投影、真实MCP认证与其余动作/超限索引复核仍按剩余表保留，35complete/12partial/0open不提高。

## 2026-10-24 PAN-08 context/cost/usage 取消与扩展技能组合（`5bd0a5a0`；已推送、CI success）

- 原`/context`仅在getToolPool后检查signal，真实交互桥虽传runCancellable但handler未进入，故等待MCP目录时没有命令controller。新增真实routeInteractiveCommand→ShellSessionRuntime→toolPool/catalog→挂起gateway port回归在原代码实际AssertionError。status现在沿现有命令owner运行并合并原signal；非status的rule-controls路由保持。pre-abort零配置/工具获取及final admission同步abort零schema访问也在原代码实际失败。
- usage原signal未进入load/freshness检查，真实PickerLifecycles/OverlayHost关闭后旧overview/account/reset仍返回，已接受account在原owner取消后仍可发布成功/错误；六项原实现AssertionError。现在load与isCurrent复核原signal，配置只捕获一次；accepted Enter仍可沿独立浏览生命周期工作。cost同步路径的pre-abort、admission内abort、配置回调内abort三类原实现也实际AssertionError，现在分别拒绝；不称cost存在普通异步竞态。
- 原context/cost producer的report接真实Pager，各十轮获取、过滤、20规定矩形绘制、关闭：逐轮只获取一次，绘制不重新读取；reader的report/source/rows/filter关闭释放，转录block保留同一未改变报告。只读复核确认这是预期保留，不能把collapsed transcript误报为泄漏。
- 实际registerPackage→SkillLoader/catalog→skillPicker/OverlayHost补32字节/128KiB两档body各十轮cold/warm打开、过滤、20矩形绘制/取消，追踪同步assertInventory正文与异步manifest descriptor分别计数。缓存命中仍有inventory重读，不能宣称零正文I/O；parsed manifest只冷加载一次，单option<512字节、descriptor全部关闭，绘制/关闭/旧apply不新增获取。缓存后实际dirty或unregister发生在Enter接受之后，精确重解析均拒绝正文与draft。
- 首轮六文件94项通过后补原signal与实际ShellCommandRuntime同时存在回归。十一项实际反转分别撤销context注册、早期取消、final admission检查、signal合并、cost两处、usage三处、扩展parsed cache及Pager report释放，均非零退出并产生AssertionError；每项后生产source逐字节恢复。初次usage等待host安装、gateway positional signal及路由拒绝预期按harness drift修正，不算产品缺陷。最终静态门/matrix、恢复后的六文件95项与TS build串行通过，测试/build heap上限1536/2048MiB；build `6c676985d8dc343ac1e22c1f7813b0c7804cf7c5f80b3ca8f671f3d944ef931b`，inputs `6385123fa01f1e97d525053a02da2b112298474a95b33e06f826f1e62bad6400`，artifact `35f29e69af0917770982ee61dd97abf1b83e68a429d485a12eb995a10f024869`。只读独立代码APPROVE/架构CLEAR，早期取消BLOCK已解决，两路均未执行验证；无临时反转文件残留，无全量回归、exe/CLI/PTY或真实20k压测；提交/推送另取证。
- 只证明以上小型consumer、gateway port与真实本地扩展组合；不冒充MCP wire/认证、实际终端输出、全目录options、全ledger投影或总heap/physical I/O/硬延迟。help既有真实host更新/关闭订阅证据保留，重复交互及其余consumer动作仍按剩余表核对；35complete/12partial/0open不变。

- 代码SHA `5bd0a5a05974ac56bcd8061a5d7efcb9d596ce0f` 已提交、推送并精确读回远端main，工作区当时干净；CI `40088907743`/job `120857363446`于2026-10-24T11:25:28Z completed/success，Watch `40088907727` completed/success，只绑定该SHA。

## 2026-10-24 PAN-08 skill 关闭失效与真实 manifest 生命周期（`d81387c7`；已推送、CI success）

- 原面板完成加载后按Esc，offered集合仍可由旧picker.apply使用并重读正文；32字节/128KiB真实技能文件两项回归在原实现实际AssertionError。取消/替换视图现在通过现有previewEnd清空offered。Enter接受路径原本就不调用该hook，仍沿独立timeout重新解析精确身份并一次消费，不复用已退休的浏览signal。
- 架构复核发现final admission可同步关闭host，使初版cleanup后又填回offered；host/direct两个真实回归也实际AssertionError。发布前新增浏览/原命令双signal和load generation检查；取消或旧load不能重填集合。真实post-acquisition admission内host.close、直接previewEnd及原signal.abort三类均覆盖，不添加新的admission回调。
- `picker/skills/lifetime.test.ts` 连接原readSkillCatalog/SkillLoader、实际manifest descriptor、skillPicker及OverlayHost。两档body各十轮load/filter/20规定矩形绘制/Esc：逐轮manifest正文恰读一次、一个小于512字节且无body的option，过滤/绘制/旧apply零新增获取；manifest descriptor峰值1且全部关闭，文件bytes不变。实际64KiB read pending时关闭后排空不读下一chunk、不发布；Enter接受重读一次且仍可用、实际源换名拒绝替代body。
- 两文件32项通过；取消集合、host abort、body-free投影、精确身份、post-load signal、post-original signal、generation七项反转均实际AssertionError，最终两个生产文件逐字节恢复。独立代码APPROVE/架构CLEAR，早期WATCH已由真实回归和发布前复核消除；两路只读未验证。对照参考selector的取消/退出清理加载，复用本仓previewEnd及accepted生命周期，不复制其目录结构。
- 只计选中manifest的descriptor/返回body bytes与小型consumer组合，不外推其他目录handle、扩展贡献总量、全目录options、OS physical I/O、总heap/硬延迟或真实认证。矩阵仍35 complete /12 partial /0 open；无全量回归/exe/CLI/PTY/真实20k压测。最终静态门/matrix、恢复后的两文件32项与TS build串行通过，测试/build heap上限1536/2048MiB；build `03d0102435ff48c83ab0e0809fff79ea12689f25fd5cf1135bdc02a4f4af4a9f`，inputs `8ecee5bc57c64fde303fbe5a886ced7a64275270afc3200570effeea431b9138`，artifact `1805e616c9d4436bc28e2f84f74b81e9507a5584bf5f72a5242f749cf8463bf6`。临时反转目录已清理；提交/推送分别取证。

- 代码SHA `d81387c7ba4e486186eab6f6f986bef434d71bbd` 已提交、推送并精确读回远端main，工作区当时干净；CI `40087846921`/job `120854306178`于2026-10-24T11:08:24Z completed/success，Watch `40087846911` completed/success，只绑定该SHA。

## 2026-10-24 PAN-08 help 行预算前置（`9f8d5b09`；已推送、CI运行中）

- 原report虽然最终最多200行，但一个command的1000个named invocations会先生成/脱敏1001行。新用例在原实现实际AssertionError：元数据投影2002次而非保留200行的400次。共享guideRows现在接受可选行预算，report在label/detail投影前累计消费200行，保留精确total/shown/omitted/partial与原安全投影；picker默认仍投影完整目录，alias搜索和named选择不变。
- 单command展开与跨command共享预算均有回归；两文件14项通过。恢复末端slice或移除累计扣减两项反转均实际AssertionError，生产source逐字节恢复后通过。独立代码APPROVE/架构CLEAR，均只读未验证。对照参考selector先确定可见范围再转换行description的决定，沿用本仓report owner，不复制其列表结构。
- 只约束最终报告保留行的label/detail投影；canonical invocation枚举/计数、alias聚合、源数组及中间副本仍不在此界内，不宣称全目录/交互options/总heap/硬延迟有界。无真实CLI/PTY/20k压测，矩阵保持35 complete /12 partial /0 open。最终静态门/matrix与TS build串行通过，测试/build heap上限1536/2048MiB；build `2eec7b1f03caf8c858f40382c7dc3a2e861674f6441798a4d33b63401946dde7`，inputs `76175470f2b3f1cd389ef38524c438a47a4908f5a0f5273d8a9fab4badf7eb03`，artifact `04b02d0ce7dc392c609ffc15cbafdb2b5da7080d9f4ceae4d90380dbdfdf8ce6`。临时目录已清理；提交/推送另取证。剩余原consumer组合继续按上表验收。
- 代码SHA `9f8d5b09119ab64ffb0cda5fd604620f14a2390b` 已推送并精确读回远端main；CI `40086797404` 仍in_progress，Watch `40086797384` completed/success，只绑定该SHA。

## 2026-10-24 PAN-08 tools 原命令取消与真实目录生命周期（`afcc4ce7`；已推送、CI运行中）

- 原 `readToolPool` 只使用调用方传入的面板 signal，遗漏 `CommandContext.signal`。新增预先取消与真实 stdio `tools/list` 挂起期间原命令取消两个用例，在原实现均取得 AssertionError；现在共享读取入口合并两个生命周期，在 acquisition 前和返回后检查。显式文档选择仍使用独立 timeout，不复用已关闭面板的 signal；工具执行与权限合同保持。
- `picker/tools/lifetime.test.ts` 连接原 `toolPoolFor`、catalogue、CoreMcpGateway、实际小型 stdio server、toolsPicker 和 OverlayHost。32字节/128KiB description 两档各十轮打开/过滤/20种规定矩形绘制/取消：每轮恰一次 `tools/list`，descriptor JSON 字节在 description bytes 与其加1024之间且十轮一致，保留一个小于512字节的安全 option；过滤/绘制/关闭零额外协议获取，host options/model/行索引清空，配置和定义 bytes 不变，零 `tools/call`。
- 原命令与面板两类取消均观察真实 `listTools` 的 finally 和一次 `notifications/cancelled`，然后分别检查 runtime 共享连接仍存活及 owner.close 后退出。最初把外层 Promise 结束与子进程退出等同于面板 drain 的断言过强，按原连接 owner 合同修正，并按审查补内部请求观测；未改变 gateway 生命周期。忽略 signal 的任意外部贡献仍可能持续工作，本批不承诺强制抢占或硬 deadline。
- 原 signal、host close abort、host retained options、detail 截短四项保护反转均实际 AssertionError，三个生产文件逐字节恢复；恢复后的3文件27项通过，测试heap上限1536MiB。独立代码APPROVE/架构CLEAR，综合APPROVE，两路均只读未执行验证。对照参考 selector 的 controller 传播、当前加载发布与关闭释放；本仓共享连接由 runtime owner 管理，不复制参考列表结构。
- 本批只证明小型真实 catalogue→options→绘制函数→close 组合，不把descriptor JSON字节当成wire或physical I/O，不外推全目录交互options上界、总heap、最长响应、实际终端输出或真实账户/MCP认证。未跑全量回归、exe、PTY或真实20k消息压测。矩阵保持35 complete /12 partial /0 open。最终静态门与matrix、TS build串行通过，build heap上限2048MiB；build `23eca6e4b6a26bd34e4661cb1440f3b37b7ed4f17ccfc64c26161fa3dcfe4168`，inputs `c2f29a5b39c4d112b19bf94908079cc54ebaabb9e9512fca5966f60845b6bed4`，artifact `309262f74009cd19c5d688b6afe3cb8bb4142a39080d1f20403bab4cca585f46`。临时目录已清理；提交/推送和新SHA CI分别取证。
- 前批文档SHA `c57daafc785d1efa07d3420d26174c41a3cd015c` 精确CI `40084588877` / job `120844792165` 于2026-10-24T10:06:26Z–10:21:05Z completed/success；该SHA的Watch `40084588937` completed/success。undo代码SHA `65660f16183222ed5d1fd7b5fa21562709359c77` 的CI `40085273785` / job `120846814871` 仍in_progress，Watch `40085273768` completed/success；cleanse代码SHA `b2b72b57` 的CI `40084447090` 仍in_progress，不借后续文档SHA替记成功。
- 代码提交 `afcc4ce7d3a0b4a53ffc7d12c1a0cc61f64cbbeb` 已推送并精确读回远端main。CI `40086195986` / job `120849521362` 自2026-10-24T10:30:41Z仍in_progress；Watch `40086195984` / job `120849521387` 于10:30:41Z–10:31:03Z completed/success，只绑定该源码SHA。

## 2026-10-24 PAN-06 undo 历史可取消批次与源复核（`65660f16`；CI/Watch success）

- 原历史页同步消费整个ledger，即使只保留40条也无法处理receipt之间排队的关闭。三个真实小型receipt回归在原实现产生两项AssertionError：关闭来不及处理、已散列receipt随后变化仍返回成功页。新异步投影复用同一operation scan及共享digest/page accumulator，每receipt后让出事件循环；主命令同步接口、原canonical scope+receipts digest、跨进程cursor、unknown barrier和write/approval合同保持。
- operation owner在单次32MiB扫描预算内保留目录、index及已读receipt的紧凑stat版本，单文件读取前后及完整扫描结束时复核；最多10002个source版本，不保留所有解码receipt。异步消费每次acquisition前后重检signal/admission/scope；picker load代际丢弃旧结果，旧失败不关闭新页，选择仍重读完整revision并复核opening host。
- `undo/history.test.ts`补真实OverlayHost关闭、下一条receipt零返回字节、receipt/index/inventory在批次间变化拒绝、同步异步page/cursor一致、新旧load及撤销准入；损坏尾部和三页可达原断言保留。聚焦3文件42项通过；让出事件循环、禁止先收集全receipt、source复核、逐条准入和load代际五项保护反转有效。代际反转首次为直接抛错，改用明确resolves断言后产生AssertionError，未改变预期合同。
- 对照参考逐文件signal检查、可取消stream和selector当前controller发布；本仓继续复用原同步descriptor reader与全ledger校验，不复制summary读取方案。单个JSON读取/parse/hash、index/inventory及结束stat pass仍为同步有界步骤，source version只是乐观新鲜度，不宣称跨文件原子快照、硬最长响应、physical I/O/总heap或跨页累计上界。Phase20保持35 complete /12 partial /0 open。
- 最终恢复后的3文件42项、静态门/47项matrix及TS build串行通过，测试/构建V8 heap限制1536/2048MiB。build `be393c7a3f0623756ba501efb011034a34b7340c051b05532e344235295f9f50`，inputs `4379bacf767c917d2c8ac8fe1f7836778a1682f18355fbf1f380587b074eca87`，artifact `5a1f184d9397a622b84a8c86f5293e1bfb36029c9364f7819338a22582157993`。独立代码APPROVE/架构CLEAR，综合APPROVE；两路只读审查未执行验证，确认生产模块未超20函数上限。未跑全量回归、exe、PTY或真实20k消息压测；本批提交/推送/新SHA CI分别取证。
- 代码SHA `65660f16183222ed5d1fd7b5fa21562709359c77` 已推送；精确CI `40085273785` / job `120846814871` 于2026-10-24T10:16:46Z–10:36:13Z completed/success，Watch `40085273768` completed/success。覆盖本节旧pending记录，不外推后续tools/help源码。

## 2026-10-24 PAN-06 cleanse 刷新排空与合并（`b2b72b57`；已推送、CI运行中）

- 原订阅在每个强制 native publication 后 abort 旧读取，立即启动新 inspection。持有真实 metadata descriptor 尚未交回 source 时，50次通知实际启动51次 inspection，新用例在原实现产生两项 AssertionError；取消不等于 filesystem acquisition 已结束。
- 原 `cli/runtime/security.ts` 保留 pending controller 到 promise 最终结束，期间强制通知撤销旧 generation、abort 并合并为一个 trailing 标志；排空后只补读一次最新来源。关闭订阅清除该标志、取消在途读取且不再启动。原同步读取、同源轮询跳过、revision 前后复核、失败恢复与 owner/draft 合同保持。
- `cli/runtime/security/refresh.test.ts` 用真实 bound store/descriptor 验证突发期间一次活跃 inspection；排空后最后一条过程内 unknown-durability 证据可见。该夹具累计打开/关闭3个 descriptor，峰值1，返回正文恰好为一次 metadata+state 大小；关闭 queued 状态仅原 metadata descriptor 被关闭、零正文/发布。新增实际 inspector→cleansePicker→OverlayHost 组合，load、被取消的首次subscription及合并后refresh累计5个descriptor、正文恰为两次metadata+state、峰值1，最新证据进入detail和绘制，关闭后原owner通知零读/发布。失败后下一轮轮询恢复，unchanged idle 不读正文。首次修复后夹具缺 unknown durability，被原 inspectionState 正确忽略，补齐合法过程内证据而未修改 merge 合同。
- 绕过 pending guard、移除尾随刷新、移除排空后的 slot release 三项反转均产生实际 AssertionError，产品文件逐字节恢复。移除尾随刷新的前两次尝试被普通轮询及 `vi.waitFor` 自动推进 fake timer 兜底而误过，不计有效反转；通知用例改为可清理的真实 no-op timer，隔离轮询后才证明尾随保护。此修正只针对夹具，不改变产品poll周期。
- 对照参考 selector 的单个作用域只保留一个活跃加载、当前 controller 才能发布及取消清理，沿用本仓 owner；额外保留一个 trailing native 请求以避免丢掉最新证据，不复制参考目录架构。只证明单订阅队列与本夹具 source acquisition，不外推全进程 heap、OS physical I/O、最长响应、跨视图或其他 consumer。矩阵仍35 complete / 12 partial / 0 open。
- 恢复后的3文件37项、静态门与matrix、TypeScript build全部串行通过，测试/构建heap上限分别1536/2048MiB。build `a8bcdd32d28ad57e3548116edacd1ea6f75ded8244a359906d018bdc49776c52`，inputs `b5414419b3c0d438ff7059c1adf52f9caf40ecbbc7975ede988597ae152b7c5b`，artifact `dae1d5e4955c394331b0c1052f2f2b01a97ba9aa8744e7a00ac17f6a87cf20b7`。独立代码APPROVE/架构CLEAR，综合APPROVE，均只读审查未执行验证。未跑全量回归、exe、PTY或真实20k消息压测；若底层读取不settle，后续刷新会继续等待排空，不声称有新的硬deadline。
- 代码提交 `b2b72b57c97be164bcd51aa6d392ccd761fb4e5b` 已推送并精确读回远端main；CI `40084447090` / job `120844379409` 自2026-10-24T10:04:18Z仍in_progress，未计成功。Watch `40084447084` / job `120844379500` 于10:04:18Z–10:04:44Z completed/success。结果仅绑定该代码SHA，不外推后续文档提交。

## 2026-10-24 PAN-02/PAN-06 tree 真实读取与绘制生命周期（`6c79b86f`；CI/Watch success）

- `picker/tree/lifetime.test.ts` 直接使用 SessionManager 保存记录、真实 navigation/source、treePicker 与 OverlayHost，不替换导航查询。四条分支消息加一个根节点，32 字节/128KiB 附加文本两档各打开十轮；逐路径 descriptor 返回字节每轮恰好等于三个源文件大小，过滤/折叠/20种规定矩形绘制不增加读取。每轮三个 descriptor、峰值一个、每次请求≤64KiB，全部关闭；host 清空保留的 options、model 和行索引，旧 picker 不再提供详情或选择。
- 真实 transcript 首个64KiB read 已完成但响应仍 pending 时关闭，排空后不再读取下一块/发布迟到树，全部句柄关闭。读取中改变源被拒绝；选择前改变 metadata 后实际重读并拒绝版本差；损坏 transcript 保留五个只读 disabled 节点，浏览/拒绝不改变持久 bytes。
- 撤掉 host close abort、保留关闭 host catalogue、保留关闭后的行索引、撤掉选择版本校验四项反转均产生 AssertionError；两个生产文件逐字节恢复。聚焦3文件/61项通过；Vitest 单进程、1536MiB heap，所有验证串行。初始根目录 Vitest 与包内 runner 混用导致原测试也在 hook 注册失败，改用包内入口；初始按键断言早于 host 发布，改为等待实际帧后操作，未修改产品行为。审查发现关闭后的 render 会清空行索引而掩盖释放断言，已改为关闭后立即检查，并新增对应有效反转；取消夹具改用有界等待，确保失败也进入 finally 排空。`HANDOFF.md` 记录 runner 陷阱。
- 只补本地小型真实 acquisition→projection→绘制函数→close，不宣称实际终端输出、OS physical I/O、总 heap/最长响应或其他 consumer 验收完成。未运行构建、PTY、全量回归或真实二进制20k压测；矩阵仍为35 complete / 12 partial / 0 open。
- 独立代码 APPROVE / 架构 CLEAR，综合 APPROVE；两路仅只读审查，未独立运行验证。
- 提交 `6c79b86f9fc1956dade013c3823192d88073fad9` 已推送；精确CI `40083284126` / job `120841026998` 于2026-10-24T09:46:30Z–10:05:23Z completed/success，Watch `40083284139` completed/success。结果只绑定该SHA，不外推本批产品修复。

## 2026-10-24 PAN-02 picker 资源链与重复交互（`d9593a3c`；CI/Watch success）

- `picker/session/lifetime.test.ts` 使用原 SessionCatalog、SessionFiles 和 sessionPicker，不再 mock 文件大小采样。四个真实 saved session、32 字节/128KiB prompt 附加文本两档各执行十轮四页浏览；实际打开十二个 descriptor，累计 body bytes 等于十二个 core file 的大小之和，后续页和重开不增加正文读取，每轮仅一次 discovery，所有文件和目录句柄均关闭。
- 单页最多保留一个 page row 加 current，每次真实 size sample map 最多两项；summary cache 为四项，十轮后最多八个 browse attempt/三十二个 compact boundary。关闭后详情为空、原 offered action 拒绝。历史 metadata descriptor 已打开但尚未返回时关闭，排空后不读其 body、不发布迟到页，重新打开可正常完成。
- 三项实际反转分别移除关闭时 abort、保留关闭后的 projection、强制续页重新 discovery，均产生 AssertionError；原三个生产文件逐字节恢复。恢复后串行聚焦 3 文件/37 项通过，Vitest `--threads false`、V8 heap 上限 1536MiB。静态门禁通过；只有测试/证据改动，未重复产品构建、全量回归或 PTY。
- 比较参考 selector 的 per-load abort、释放已加载列表及 active-controller 发布检查；保留本仓分页/index owner。上述计数只证明小型真实 consumer 的 acquisition→projection→retained page→close，未运行终端绘制，不宣称 OS physical I/O、总 heap、任意数量延迟或 tree 链闭合；原 35 complete / 12 partial / 0 open 不变。首轮夹具把 disabled 分组行计为 session，并误期望关闭详情为 undefined；按既有空数组接口修正，未修改产品行为。独立代码 APPROVE / 架构 CLEAR，综合 APPROVE；均为只读审查，未独立重跑验证。
- 提交 `d9593a3ce9a056019d1c090b9b42f32ece40fcdd` 的精确 CI `40081909194` / job `120837029305` 于2026-10-24T09:25:46Z–09:40:48Z completed/success，Watch `40081909202` completed/success；只绑定该 SHA，不外推到本批 tree 测试。

## 2026-10-24 PAN-02 续页取消与累计预算生命周期（`60a3f2a5`；CI/Watch success）

- 修复正常“下一页”交接失败：原 catalogue attempt 的累计读取预算捕获了第一页的 AbortSignal；`action:more` 关闭原 SessionListing 后，下一页沿共享预算再次检查该旧 signal，误报取消。累计字节 quota 现在独立于单页生命周期，原 discovery、boundary/cache hit、文件 body、batch 和发布继续使用当前页 signal。
- 原 64MiB attempt 累计预算、超限 partial/no continuation、scope/version/boundary 与并发 claim 均保留，未为续页重置 quota。比较参考 selector 的 per-load controller，以及原 restore catalogue 的共享字节状态/当前调用准入；只采用生命周期分离，不复制其目录或分页架构。
- 小型真实目录回归先在原实现产生普通/搜索续页两项 AssertionError，以及累计预算用例的旧取消错误；最终 3 文件/34 项通过，含实际 catalogue → SessionListing → picker 的下一页交接、当前页读前取消零正文/零发布和旧页关闭后累计超限。恢复旧 signal 绑定、逐页重置 quota 两项反转均实际 AssertionError，生产源码逐字节恢复后再次通过。
- 静态门禁与 TypeScript build 通过。build `c2ab1e4c3cd34684ec623fe7b2031ce8335e5ea827090ed938568c765a6daf96`，inputs `2d066543fcd7637a0ea3707e19305c7e0ac5d49d125a28d97d98b4c6858869c0`，artifact `1d620ba4d822913b82719f80c88ad9b0904bb88f928dae5bd4d1ace779ee6a6b`。测试/构建串行，V8 heap 分别 1536/2048MiB；未跑全量回归、exe 或 PTY，大数量边界仍只允许单元 Mock/切片。
- 独立代码 APPROVE / 架构 CLEAR，综合 APPROVE；两路只读源码审查未运行验证。本批关闭 PAN-02 的一处真实分页取消缺陷与对应 QA-01 组合，原资源链、实际平台和外部输入缺口仍保留，矩阵仍 35 complete / 12 partial / 0 open。
- 提交 `60a3f2a57f3001a99ee0ea1e883c2067e0e51ad1` 的精确 CI `40080965312` / job `120834257835` 于2026-10-24T09:11:23Z–09:25:44Z completed/success，Watch `40080965258` / job `120834257633` 于09:11:24Z–09:11:45Z completed/success；不外推后续提交。

## 2026-10-24 QA-01/QA-02 非交互 profile 与审批生命周期（`6ba4f994`；CI/Watch success）

- 新增 `cli/print/profile.test.ts`，line/pipe 各顺序启动四个实际源码 CLI 进程：alpha 显式 allow-once、alpha 默认拒绝、beta 默认拒绝、beta 显式 allow-once。每次使用同一精确目标并由夹具重置，验证审批、tool、terminal event 与文件 bytes/不存在一致；两份持久审批库无 grant，模型声称成功不能抬高拒绝结果。
- 每个进程验证实际 HTTP endpoint、model 与合成凭据匹配自己的 profile；切换请求及带伪造 confirmation 的请求都被非交互守卫拒绝，原身份不变、不生成 handoff，未启动的 beta 存储与默认 profile session 不被使用。隔离 HOME 只含本地 fixture，未读取真实凭据或调用远端模型。
- 恢复后的聚焦验证为 2 文件/7 项通过，其中新增 2 项顺序启动 8 个小型子进程。Vitest 单进程 1536 MiB、新增场景每个子进程 512 MiB heap 上限；没有并发验证、全量回归、构建或 PTY。移除非交互切换守卫、错误持久化 allow-once 两项反转均实际 AssertionError，原源码逐字节恢复。最初 `^pipe` 过滤导致全跳过，不计反转；精确替换检查未命中的尝试也不计通过。
- 首轮夹具误将恢复历史中的旧 tool 当当前回应，随后又在审查中发现不同目标不能验证精确 grant 生命周期；两项均修正为当前 turn、append-only transcript delta 和同目标重试，未改生产逻辑。独立代码 APPROVE / 架构 CLEAR；两路只读审查未运行验证，不冒称独立重跑。
- 现有 Platform QA `39834842595` 已证明其对应历史构建的 20 个支持平台格。本批只补当前源码的本地 line/pipe 组合，未声称新的 exe 或平台运行；QA-02 仍缺 Windows 交互 PTY、真实 IME、系统复制。47 项矩阵仍为 35 complete / 12 partial / 0 open。
- 提交 `6ba4f994526b5676a815b4702cbbfd9e489ec0cb` 已推送；精确 SHA 的 CI `40080028964` / job `120831469775` 于 2026-10-24T08:57:10Z–09:15:09Z completed/success，Watch `40080028970` success。此结果不外推到后续提交。

## 2026-10-24 PAN-06 undo 逐条读取与有界结果保留（`518e5bb6`；CI/Watch success）

- operation owner 新增 `scanOperations()`；原 `readOperations()` 数组接口复用同一扫描，保持原 8MiB 单 JSON、32MiB 单 scan、50k 文件与目录/index 校验。历史页对每条 receipt 立即生成 digest，仅保留 40 条当前页；latest 与精确 ID lookup 同样只保留所需结果，但仍读完并校验整个 ledger。
- `revision:operationId` cursor、完整 scope/receipt 的 canonical JSON digest、85 条三页完整顺序、精确 ID、unknown barrier 和取消/字节不变合同保留。坏尾部不能因当前页已满或结果已找到而被跳过；没有改用 mtime 缓存或引入新的持久格式。
- 3 文件/35 项以 `--threads false` 和 1536 MiB V8 heap 上限通过；提前读完 source、调用层收集全数组、latest 提前返回、满页停止校验四项反转均实际 AssertionError，源码逐字节恢复后再次通过。静态门禁与 TypeScript build（2048 MiB heap 上限）通过。build `68d3b93523cd42c50ba17b6f98cba01b473f57a8af4e48da41ee49df68690709`，inputs `002fdcb629e4f45d76e07b9338bc70197fb9cf2a47d7a84ca71a2edc0105da7b`，artifact `a556e7c488c531a01fede2269022d044c9bb491ee7a93f5468cac0040d6d3b67`。
- 本批只证明 acquisition/hash 顺序、有界结果保留和完整拒绝语义；不证明全局 heap、最长响应或累计 physical I/O。未运行全量回归、exe 构建或真实 20k PTY；矩阵保持 35 complete / 12 partial / 0 open，不声称 PAN-06 或全阶段完成。
- 代码提交 `518e5bb687a24324422beeffad0336b99d36bb85` 已推送并精确读回远端 `main`；CI `40078459456` / job `120826791666` 于 2026-10-24T08:32:49Z–08:50:33Z completed/success，Watch `40078459541` completed/success。独立代码 APPROVE / 架构 CLEAR，综合 APPROVE；两路均为只读源码审查，不把作者测试/反转当独立执行。

## 2026-10-24 PAN-02/PAN-06 增量可读前缀与提前节点准入（`855b9bf3`；CI/Watch success）

- 异步 salvage 路径逐行消费最多 64 KiB 的 descriptor chunk，不再先分配整段 transcript buffer 或保留完整 source text；达到行数上限即停止后续读取。跨块 UTF-8、空行、CRLF、末行无换行、损坏行、重复身份及截断语义沿用原 codec；提前停止后仍检查文件身份、大小及 mtime/ctime，变化或取消不会发布结果。
- 同步/异步 session snapshot 均在 state 读取后、transcript 打开前检查树节点上限；小夹具证明超限时不会获取 transcript body，不依赖真实大历史或终端进程。
- 最终单进程 `vitest --threads false` 聚焦 3 文件/51 项通过；移除行数停止、取消 chunk 大小上限、将节点准入后移至投影的三项反转均实际 AssertionError，恢复后通过。静态门禁、TypeScript build 与 NormProof blocking obligations 通过；NormProof 整体仍 `partial`，保留既有 1 failed advisory/9 proof gaps。
- build `fabc645a95a4c61736912ebcdfaf72ae4673c85172f402ada56ef3e91b7a77f0`，inputs `27392e2d92a139110d16f090ee9613bb8f62d7f7d8284cb8c2bf4adfb89e161c`，artifact `d9c6c1a2331c887c9f0c4477673dcd9b4e705e74f7b165ce89d01a5883153ac1`。本批未运行全量回归、exe 构建或 PTY；20k 边界只允许单元 Mock/切片验证，不运行真实二进制全量消息压测。
- 这是源获取分配与逻辑读取证据，不是 OS physical I/O、总 heap、最长响应或真实平台证明。PAN-02/PAN-06、QA-01 与全阶段保持 partial，矩阵仍为 35 complete / 12 partial / 0 open；本节不借用旧 SHA 的 CI。
- 代码批 `855b9bf32b77d2aeba49ad7bd5c50d22fd80e311` 已提交、推送并精确读回远端 `main`。推送后首次读取 CI `40077116994` 为 `in_progress`；后续读回 job `120822759684` 于 2026-10-24T08:12:20Z–08:31:28Z completed/success，Architecture Watch `40077116885` 为 `completed/success`。结果只绑定该代码 SHA，不外推到后续提交。

## 2026-10-24 PAN-02/PAN-06 可取消导航源读取（`b2720df6`；CI/Watch success）

- 导航查询新增 `readSessionNavigationAsync` 和 transcript-only async source。metadata、state、transcript 通过可取消的异步读取；transcript 按 descriptor chunk 读取并在解析、树投影和结果投影之间检查 `AbortSignal`。读取前后继续复核文件身份、版本和 session 目录，取消或变化不会发布部分导航结果。
- tree、back、rewind、completion navigation、cleanse 以及 security inspector 将浏览器的取消信号传到 source acquisition；替换中的 load、关闭后的订阅和 stale session/workspace 绑定会丢弃迟到结果。同步命令读取保持原有合同。
- 聚焦验证为 12 个文件、318 项通过；静态门禁全部通过；TypeScript build 通过并生成 manifest `527c3fd1e468`。代码批 `b2720df618198e573d8eba23374b8e73a0e0eb90` 已提交并推送，远端 `main` 精确读回同一 SHA。
- CI `40074158042` / job `120813841714` 于 2026-10-24T07:26:48Z–07:44:22Z completed/success；955 个测试文件通过、1 个跳过，10,348 项通过、3 项跳过。NormProof blocking job 成功，但 verdict 仍为 `partial`（0 open obligations、1 failed advisory、9 proof gaps）。Watch `40074158133` / job `120813842071` 于 07:26:48Z–07:27:14Z completed/success。
- 证据只覆盖本地取消、分块读取、变化检测和生命周期回归；不扩大为跨全部页面的 OS physical I/O、瞬态 heap、最长响应、平台输入、真实 provider/MCP 或 20k PTY 压测证明。矩阵仍为 35 `complete` / 12 `partial` / 0 `open`。

## 2026-10-24 PAN-06 restore × undo 操作快照路由（`6c97eab6` CI failure；`697c518c` 测试修正后 CI/Watch success）

- recovery authority index 新增 `operationOwned`，由原始记录是否带 operation 身份生成。`/restore` 对 operation-owned snapshot 显示 `use /undo`，禁用该行并拒绝生成 preview draft；standalone snapshot 的 `/restore preview` 与显式 `/restore execute --execute` 保持不变。operation-owned snapshot 沿既有 `/undo` receipt、preview revision 和 current-content guard 恢复，不新增第二条恢复 writer。
- catalogue 将保留的 `operations` receipt 目录排除出 edit snapshot authority，避免把内部 receipt 误报为 unavailable authority；`fs.opendir()` 迭代期间由 Bun 延迟抛出的 `ENOENT` 现在与 Node 的目录消失语义一致，按 unavailable 记录继续扫描。
- 真实 patch operation 回归证明 operation snapshot 不可由 restore preview，随后 `/undo` 恢复精确 bytes；较晚 operation 已改同一文件时，较早 operation 的 preview 被 `current-content-changed` 阻断。catalogue 回归覆盖迭代中目录消失。移除 `operationOwned`、显式 execute 确认或 operation current-content guard 均产生真实 AssertionError，恢复后通过。
- 最终聚焦集 15 文件/255 项通过；`verify:result-contract` 6 套/158 项、`test:scripts` 157 项、cycles、config 53/53、declarations 18+11、Node floor 通过。NormProof blocking obligations 满足，0 open；既有 1 项 failed advisory/9 项 proof gaps 保持，verdict 仍为 `partial`。
- build `b493ee119b5e59edcdff4bce8528fd579dcbc98665dce33d6c5f8dea17f0e7ed`，inputs `b54e70e9fbbd98600c2b9df292a459fc9af317ffdd4731fe415a8ea107b73ea0`，artifact `b2da1dc1e8c304d3817972558ca9b5b9e917c5155d943510e95b5a8a1fd641df`，exe SHA-256 `5ef977268e9301a657519b07c68e35de5604bdfb4aaeddf598bc364a40bec5b2`。同 build Node/exe × regular/fullscreen 四格 PTY 全部 pass/exit0：`/restore` 显示 `/undo` 路由、未生成 preview、无 false unavailable，`/undo` 恢复 exact bytes，snapshot/blob/未触碰文件 bytes 不变；证据目录 `.omx/artifacts/phase20-restore-undo-routing/pty/`。初始 exe 探针曾因 Bun 延迟 `ENOENT` 失败，最终实现修复后四格重跑通过。
- 代码批 `6c97eab602213815961a9d3e0c0be93b500ffa8a` 已推送并读回远端 `main`。CI `40049468563` / job `120738649415` 于 2026-10-24T01:22:09Z–01:39:43Z completed/failure：954 个测试文件通过、1 个失败，10,314 项通过、1 项失败、3 项跳过；唯一失败为 `src/cli/collaboration/command.test.ts` 的 `EADDRINUSE 127.0.0.1:36553`，分类为 `freePort()` 先 bind port 0、关闭 reservation 后再由 service 重绑之间的测试夹具 TOCTOU，不是产品回归。同 SHA Watch `40049468573` / job `120738649363` completed/success。
- 测试修正提交 `697c518ce7bf61f0190ce9eefdbc006511941f31` 只在 collaboration test owner 增加 `EADDRINUSE` 重试：每次重新选择未尝试的 ephemeral port，其他启动错误不重试；真实回归证明第一次冲突后第二次使用不同端口且 service 可启动。该提交已推送并精确读回远端 `main`；CI `40051091258` / job `120743717608` 于 2026-10-24T01:43:38Z–01:56:37Z completed/success，955 个测试文件通过/1 跳过，10,316 项通过/3 跳过；Watch `40051091265` / job `120743717784` completed/success。失败 run 保留，不回溯改写为成功。
- 本批关闭一条 `PAN-06 restore × undo` 跨任务 QA-01 路由，不关闭 PAN-06、QA-01 或 Phase 20。矩阵仍为 `35 complete / 12 partial / 0 open`；tree/back/cleanse 完整源读取、累计 physical I/O、瞬态 heap/最长响应、真实 provider/MCP、IME、系统剪贴板、Windows 交互 PTY 与真实评测仍未证明。

## 2026-10-24 PAN-02/PAN-06 累计源预算与 continuation one-use（代码批已推送；CI/Watch success）

- `SessionCatalog` 新增 attempt-local 64MiB 逻辑源预算。每个 metadata/state/transcript 文件在分配和读取 body 前按 opened expected size 计费；失败不退款，续页共享同一预算。达到上限时返回 `sourceLimited: true` 的 `partial` 结果并停止发行 continuation，不把源拒绝伪装成空目录或 complete。
- Session catalogue 与 restore catalogue 的 continuation 都改为一次消费：同一 cursor 在首轮读取完成前被并发重放时直接拒绝。成功返回下一页 cursor 后才释放下一次 claim；失败、取消或超限保持已消费，要求重新打开 picker。
- 聚焦测试覆盖 exact budget、非法字节数、取消、累计续页超限、并发重放和 partial/end 状态；反向移除字节 admit 或移除任一 claim 检查均产生真实 AssertionError，恢复后通过。最终 11 文件/187 项 catalogue/picker 聚焦测试、`test:scripts` 157 项、`verify:result-contract` 6 套/158 项、CLI 入口 19 项和静态门禁通过。
- build `178e73e86fd3304ae081bfe85bc401c7aa2d91341e4c9b5a719b15b288ca35fc`，inputs `35cd988d32dbc2a376fcf1fa4d61061a545a84a4012858ed5c3b384f2446df04`，artifact `c12b2e48b8f9453a205077d4b31f26a3a9634dfc5b3bee9973618e8ee43e3859`，exe SHA-256 `30a1f9fa83fb6119585594177f0c9acfd7c942af099a6d01ae5c24c6ec0a206b`。同 build Node/exe × regular/fullscreen 四格 PTY 全部 pass/exit0，`catalogChecks` 均为 45 matches、40 fixed page、older page 可达且取消后文件不变；证据目录 `.omx/artifacts/phase20-catalog-budget-178e73e86fd3/`。
- 首个代码批 `bfcbf42653f561dc849053ad68aec2763b43f211` 已推送并精确读回远端 `main`。CI `40044155393` / job `120721880231` 于 2026-10-24T00:16:31Z–00:34:17Z completed/failure；全量测试为 954 个文件通过、1 个失败，10,311 项通过、1 项失败。唯一失败是 `restore.test.ts` 在已消费 cursor 上继续期待 `changed`，实际 one-use 保护返回 `Snapshot page is already being read`；这是测试未适配新合同，不是把并发重放放宽为允许。同 SHA Watch `40044155433` / job `120721880146` 于 00:16:31Z–00:16:53Z completed/success。
- 测试对齐提交 `ea3c1fae71398da1aaf1dea655b8589f04a621c5` 先创建独立 continuation，再修改 ledger，保留真实 revision-change 断言，未削弱 one-use claim。该提交已推送并精确读回远端 `main`；CI `40045727856` / job `120726879977` 于 2026-10-24T00:35:27Z–00:48:52Z completed/success（13m22s），覆盖其父提交中的产品实现；Watch `40045727887` / job `120726879841` 于 00:35:27Z–00:36:04Z completed/success。两项只绑定 `ea3c1fae`，不回溯改写 `bfcbf426` 的失败记录。
- 本批只证明逻辑源字节准入与 cursor 生命周期，不证明 OS physical I/O、page-cache 行为、总 heap、最长响应或跨平台；PAN-02/PAN-06 及 Phase 20 仍保持 `35 complete / 12 partial / 0 open`。

## 2026-10-24 QA-01/PAN-06 跨任务预算与 restore 累计读取（代码批 `3cf010da` 已推送；CI/Watch success）

- `CTX-02 × TOOL-01`：`cli/provider/step.test.ts` 通过本地 HTTP 发送首个仅含 `small` schema 的请求并取得 usage；随后 `ToolDiscovery.load(['large'])` 载入带 40,000 字符 schema 的工具。第二请求的 schema digest 已变化，prompt 预算在实际 dispatch 前以 `Context overflow` 拒绝，HTTP server 仍只收到一个请求。
- 该测试绑定真实 `createProviderStep → createStepFunction → requestBudget` composition，而不是直接调用底层 budget。三个反转分别移除 `toolSnapshot` 读取、从 overhead 移除 `tools`、移除 provider 的 discovery 接线，均产生实际 AssertionError；恢复后同文件 `8/8` 通过。
- PAN-06 restore catalogue 将一次 browse attempt 的初始 metadata 字节数保存为续页累计上限；每页 `readAccess.admit` 共享同一 `used`，超过上限在 body 读取前抛出 `RecoveryReadLimitError`。因此初始扫描≤32MiB、续页累计≤初始扫描，单 attempt 主动 metadata 读取≤64MiB。205 条三页样本确认续页不调用 `opendir`，并在第二页读取后增长第三页记录时 fail-closed；cursor revision 篡改也在读取前拒绝。
- restore 的反转分别把每页 verification budget 重置为 `used: 0`、移除 continuation `readAccess`、移除 cursor revision/position 校验、移除内层 caller check；累计超限、续页重叠和 caller 撤销测试均失败。恢复后 `catalog.test.ts` 9项、`catalog/read.test.ts` 12项、`cli/provider/step.test.ts` 8项，共 `29/29` 通过。
- build `88c051cd8afe48d5848d2f4b3e1d0641b4a0a2ebed050e154c54e98cdaa30c9f`，inputs `4bf89febb4526dcb6d5a231ea1f97e93bdebf621a3b48bb2e350904483e35554`，artifact `d7a098a374757d4fb278f4ddb2afd254ea11fbec09f69397b08e3501372c2bcf`，exe SHA-256 `a0d76c3dc09aa5cc629c3510590238f83c153d06f96ecd46cb28e067696208e5`；`build:ts`、`build:exe` 与 CLI 入口 19 项通过。本批未声称新的专用 PTY，内部 catalogue 路径由聚焦测试和既有 CLI 入口覆盖。
- 代码批 `3cf010dad62cb872019852a2850355230e7dfa96` 已推送并精确读回远端 `main`。CI `40039157370` / job `120705867116` 于 2026-10-23T23:20:59Z–23:39:51Z completed/success；Watch `40039157330` / job `120705866893` 于 23:20:59Z–23:21:18Z completed/success。两项只绑定该 SHA，不扩展到随后文档 evidence 提交。
- 本批只新增测试、restore attempt-local 读取预算及文档；不证明 tree/back/cleanse 的完整源读取、累计 physical I/O、瞬态 heap/最长响应或真实模型/MCP。矩阵仍为 `35 complete / 12 partial / 0 open`，QA-01 仍未闭合。

## 2026-10-24 PAN-02/PAN-06/PAN-07/PAN-08/INPUT-01 本地硬化与独立复审（代码批 `186fde15` 已推送；CI/Watch success）

- INPUT-01 将原 modal 状态按 types/buffer/motion 拆分；Replace 命名键不再被当作文字覆盖，Backspace 恢复最近覆盖字素；Normal 安静 Escape 与 Ctrl+C 交还宿主，question 输入绕过 Vim；Visual/Visual-Line 的 Ctrl+C 复制真实 source revision/range，host 拒绝过期范围；StdinBuffer 单次上限 8 MiB，PasteStore 文本与图片共享 128项/32 MiB LRU，失效 placeholder 阻止提交；复合 operator/motion count 钳到 9,999，`2dG`/`d2G` 与 `1dG` 的前置/动作 count 分开保留。
- INPUT-01 的 paste 占位符按本 store 实际签发的完整字符串识别；普通方括号文本、未签发 ID，以及已签发 ID 但 payload 不同的手输文本不再被误判或展开，`clear()` 后真正失效的原占位符仍阻止提交。
- PAN-07 的 device-code poll 可被 abort 立即取消，迟到 token 不发布；extension unknown outcome 写入独立持久 journal，新进程恢复后继续 fail-closed，只有显式 `resolveUnknown()` 清除；关闭未 drain、uninstall cleanup 和 lifecycle unknown 都保留跨重启阻断。extension panel 限制 64 notices、每包 32 detail 行及累计 512 KiB，并将 package 基础字段、actions 与 detail 全部计入预算，输出 partial/omitted；picker 明确显示被省略的 actions，并对旧快照缺省字段保持兼容。
- PAN-02/PAN-06 的 preview 只扫描首个非空逻辑行并按需截取 1,200 字符；Option/Tree/Copy/Rewind 使用按候选对象缓存的搜索文本。`SessionCatalog` 保存最多 8 个 browse attempt、每个最多 20k 个有序 boundary 的 compact index，restore catalogue 保存最多 16 个 attempt-local index；后续页只读取当前页记录并复验 boundary/version，不再重新 discovery 或整 ledger 扫描。`partial/limited/unreadable` 状态跨续页累计继承；索引超限显式保持 partial。损坏/超限 transcript 保留可读前缀并作为 `actionSafe: false` 的只读 partial 展示。
- PAN-08 在 clone/freeze/render 前限制 report 的 1 MiB/20k节点/20k行/深度32；持久报告超限回退安全文本；skill 正文使用 display-only Markdown 并中和 OSC/CSI/C0。MCP catalogue 统一 30 秒绝对期限、4 MiB/10k tools，client 跨页、gateway 跨 server 与 peek 均使用累计预算并 fail-closed；在途 deadline 保留 `McpGatewayBlockedError`，并关闭 transport；即使 cleanup 无法确认也保留 blocker 语义。`/tools`、`/skill`、`/cost`、`/help`、`/context` 增加 producer top-N/omitted/partial，`/context` 传播取消并按工具增量测量 schema JSON。
- 两轮只读独立复审累计提出 12 项 findings：MCP deadline/cleanup、catalogue partial/20k/limited、extension omitted/legacy type、paste 普通文本与已签发 ID 碰撞、过期矩阵/contract、`2dG`，以及两项反转测试缺口。上述问题均已修复并加入可反转测试；两位 reviewer 对最终工作树均给出 no blocker。
- 最终聚焦集 7文件/244项通过；两个无关长链测试在首轮并发全量中失败后分别 14/14、12/12 隔离通过，保留为并发负载分类。按既有 `VITEST_MAX_THREADS=2 VITEST_MIN_THREADS=2` 最终完整 `test:ts` 为 955文件/10,295项通过、1文件/10项跳过、0失败，耗时860.48秒。
- `test:scripts`157、`verify:result-contract`6套158项、CLI入口19项、cycles、config 53/53、declarations 18+11、Node floor 均通过；`analyze:module-facades` 保持9个既有 advisory、call reachability 保持11个既有 advisory，均未新增本批文件。`interactiveMode.ts` 保持20个函数以内。
- build `4c2cd4069623760c8daa5974fc057ed8fc176609afe8e1324236507209fb0d31`，inputs `dc55921a92422c0b04396c897387b93110a571d2393b8e8423843f8c5a6aa2d9`，artifact `8a0990e5f6d1d9038e8398318be7a0bec75eb325118e58deb2dd6636276a5c9f`，exe SHA-256 `2bc092f5e32161c3cf30b3cac253c7d12579f00d77e9e8f7b59cfd579df0e3cb`。同 build Node/exe × regular/fullscreen/line/pipe 八格 PTY 全部 pass/exit0，证据目录 `.omx/artifacts/phase20-local-hardening-4c2cd4069623/`。
- 仍保留 WATCH：tree/back 与 cleanse 的完整源读取、跨全部 catalogue/restore 页面的累计 physical I/O、瞬态 heap/最长响应、真实 MCP/认证、真实 IME、系统剪贴板、Windows 交互 PTY、真实模型评测及剩余 PRV/TOOL/PAN/QA 外部验收。本地 `rtk normproof judge` 当前 exit127（命令不在 PATH），不计本地通过；CI 的自包含 NormProof Watch 已单独 success。
- 代码批 `186fde15209c96b86d4e2e03803f72df421293c7` 已推送并精确读回远端 `main`。CI `40032612651` / job `120684290419` 于 2026-10-23T22:17:13Z–22:35:23Z completed/success；Watch `40032612536` / job `120684290044` 于 22:17:13Z–22:17:39Z completed/success。两项只绑定该 SHA，不扩展到随后文档提交；机器矩阵继续为 35 `complete` / 12 `partial` / 0 `open`。

## 2026-10-24 PAN-02/PAN-06 原tree/history/fork选择生命周期（本地及独立审查通过；交付另绑定）

- 原tree owner在load开始撤销旧选项，failed reload、closed与generation改变不能恢复旧选择；加载/投影/实际fresh selection读取前后复验原signal、admission、session/profile及物理cwd/projectRoot。正常OverlayHost接受先捕获browser结束状态，仅解除该browser signal，原runtime控制不放宽；one-use先消费后沿原rewind/fork或精确history草稿，关闭清选项/detail/action引用。
- 提炼原cleanse/state为共用picker/selection/state，移除旧实现；保留cleanse原消息与契约，增加明确projectRoot（legacy fallback cwd）、独立project/cwd物理身份及初始live root绑定。registry只透传原live session accessor，不新增中央行为。原readSessionNavigation fullsource/256KiB metadata/8MiB state/16MiB transcript/50klines/20kentries限制保持；tree在load和fresh读取检查saved session id/projectRoot，合法cwd子目录与projectRoot分离仍可用。
- 原源码三个真实AssertionError复现failedreload旧draft、close后复活、freshread内准入撤销仍draft。最终10项有效反转exit1且六hash恢复一致；四个初始单保护被laterguard兜底green保留、不计有效，final共同保护反转重新绑定。早期四个不存在/workspace与后续explicit projectRoot/source.session旧夹具失败按harness drift修正，未削弱合同；typecheck错误config路径与test变更后exe freshness拒绝留存，不计构建通过。
- 最终7suite296项在Node24与准确Node20.3.0通过，production strict TS、双构建/静态门/CLI入口19/47项matrix/NormProof exit0partial通过，原advisory与proof gaps保持。scripts/gates未改，157项为同日轮询批证据，不称本批重跑。独立code APPROVE（28actual-owner探针两runtime/296focused/typecheck）；architecture source CLEAR/resource WATCH（47探针两runtime/260focused/AST/import/cycles，含实际consumer迟到owner/surface/stop拒绝）。六hash与两报告绑定，综合COMMENT无BLOCK，ownfixtures清除。tree15/shared4/cleanse13不超ceiling、registry37为原超限未增；完整author-binding见`.omx/artifacts/phase20-tree-selection/`，commit/push/newSHA CI分别取证。
- 同build`51cae2e97a93c5c8d4c37f6f7f8f68a96efd6ff90598cc5eb818238c0022de2f`，inputs`e7dc4717086968b78656e3009bb526ecf242b63e39cada5a21d1df3b02cbac48`，artifact`a3a0ba716404969ea427c3816ab4a2156c831d791677854a41a841d5db7eb988`，exe`dc50bff756f404f8dafb2162310ecf1a97ec82315b5ea7dddd5d6d6effceda8a`；Node/exe regular/fullscreen四格PTY pass/exit0且before/afterbuild一致。206messages/fullprompt弃置分支search、带空格ID精确historydraft、tree/fork取消无写、缺transcript拒绝重开、外改selection拒绝及current原生导航通过，原workspace bytes与消息保持。
- 参考active controller在progress/settled前复验及failedload清列表、timer disposal/refresh释放旧children用于生命周期对照。同步fullsource仍不能在read/parse中途抢占；source caps、后置fences、释放引用不证明整体heap/最长响应/累计physical I/O/平台或crash atomicity。35complete/12partial保持，后续沿原navigation/query资源owner继续；不扩展审批/writer。

## 2026-10-24 PAN-06 原security一次准入克隆与资源测量（`a15c8dc8`已推送；CI/Watch success）

- 原JSON owner新增cloneJsonSource，将raw source准入、原JSON.stringify及encoded4MiB/parse/object检查放在同一操作，只省略本地inert clone的重复结构遍历。外部boundedJson仍完整准入且原错误顺序保持；完整inspection独立8MiB准入、decode schema/freeze/hash、unknown receipts和writer不变，无validation bypass参数/cache或限制下调。
- 同准确脚本`5b5db59b055ddcd2774bcca4b5f74c0bed370743644c165263dc972c521301d3`各150process比较，五档每档30个导入后first-open、其中一个进程30次key/search/轮询/close/reopen；64KiB/1MiB/8MiB小security、8MiB大string、8MiB含40k小对象（81,254nodes）。corrected baseline已保存raw aggregate/script/build，clone样本及comparison见`.omx/artifacts/phase20-cleanse-resources/`。
- 样本p95（ms）：81k节点first-open278.3→258.8、reopen217.4→164.3、changed-poll121.9→98.1；8MiB小security reopen100.2→80.7、大string114.7→107.1。其他档位和key有双向波动，不能称全部性能改善；所有档位原source calls/bytes完全相同，idle轮询0body。一次打开仍read两次，8MiB约16MiB正文；一次变化轮询约8MiB，没有消除原fullsource成本。
- 初始Ctrl+U夹具未清Overlay filter，相关key/search样本作废保留；改为真实backspace、96项恢复及match/no-match断言后重跑。baseline原cell文件名后来被candidate覆盖，冻结baseline.json仍保留每操作raw样本，不能声称旧cell文件逐项仍匹配。CPU profile使用旧夹具、whole cell含setup/fixture写/GC，只用于定位，不绑定最终时间。heap端点/GC后process delta含measurement数组与夹具，maxRSS新样本最高457,936KiB含导入/build/setup；不证明picker峰值或无泄漏。
- 本地55项host及准确Node20.3.0通过，四有效AssertionError反转（preadmission/encoded/external/detached）exit1三hash保持；静态门/build/exe/CLI入口19/NormProof0partial通过。原脚本门157在同日轮询批通过且本批未改scripts/gates。totalheap/physicaldisk I/O/冷OScache/真实terminal paint/硬延迟与其他平台不据此闭合，35complete/12partial保持。
- 独立code APPROVE（54host+54floor探针、55focused/typecheck），architecture源码无findings、资源WATCH（两runtime各19checks+300generated shapes，原admission AST不变/7functions/private parse；独立96reachable/exactdraft/cancel queued0bytes/零gates）；三源码hash与两报告绑定。资源code另核实300reports/2700actions/45comparisons、分位数/bootstrap/memory/body计量及双immutable builds。综合COMMENT无BLOCK；上述测量是author执行，两lane分别审计，未冒称独立重跑150process。完整绑定见`.omx/artifacts/phase20-cleanse-clone/author-binding.json`；commit/push/newSHA CI分别取证。
- finalbuild`628b5bbb1f4298976de68641d3a39f3da8a93d3295b2d941f75b2b13724f1ce2`，inputs`a52f6bcbadee9a41676bd7e65aa31bf0f7971885913f6bf98449a4d3cf41133f`，artifact`495148e1cfc90922c7575f6049e9f2c5cb52fcb9aa9a1e100925b09c6d6987c9`，exeSHA`2858b4f8db6f57902fa9eb4d833a2033528876d905bc50fc4212be1e0954a1d2`；同build四格PTY pass/exit0且before/after一致，96retained/search/exactdraft/cancel无写、live失效恢复/外改与actualsession8MiB+1/metadata256KiB+1拒绝及重开；metadata/state/transcript/workspace原只读字节保持。
- 前批`5893dc4974ff7b58729fa04612086db10056d007`已commit/push/远端main读回；精确CI`39989467674`/job`120537159420`success至17:13:27Z，Watch`39989467406`/job`120537158458`success至16:46:11Z。仅绑定轮询批，不扩展到本批源码。
- 本批`a15c8dc8fdd63ff3944bd1a7e1dee9c268a552a0`已commit/push并读回远端main；精确CI`39995822789`/job`120558952310`completed/success，17:31:54Z–17:49:24Z，Watch`39995822831`completed/success。仅绑定clone批。

## 2026-10-24 PAN-06 原security inspector未变化轮询（`5893dc49`已推送；CI/Watch success）

- 原session owner提供可选修订接口，复用metadata/state/transcript文件版本、原路径祖先身份、canonical目录、session标量及workspace身份；原security publication维护通知修订，service组合来源与live owner，CLI只在成功实际读取且前后修订一致后跳过下一次未变化轮询。无snapshot cache/新watcher/reader/schema/writer；custom store缺失或失败修订时保持每轮读取。
- 直接read始终fresh，原生notify立即强制检查；失败、前后修订不一致及直接read失败都使跳过权限失效。独立复现并修复直接read失败留下订阅旧标记、修订回调同步close后仍读正文；代次/关闭检查防止重入与queued回调发布旧画面，release清timer/listener/token。原unknown证据和实际writer/审批合同保持。
- 合成固定十轮基线40次metadata/state descriptor读取、7,920bytes/10inspection，最终为0次/0bytes/0inspection；外改仍实际读取后才去重，失效两轮重试、恢复及原生通知/直接read均实际检查，关闭后十轮及通知为0。计量见`.omx/artifacts/phase20-cleanse-polling/`，不把小夹具字节量当完整I/O或延迟上界。
- 最终7suite48项在Node24与准确20.3.0通过，7有效AssertionError反转exit1且六hash保持；单failure/native/notify/queued保护被其他guard兜底的green保留、不计有效，native与queued最终按共同保护反转。scripts157/静态门/CLI入口19/build/exe/NormProof exit0partial通过，0open/原1advisory failed及10proof gaps保持。独立codeAPPROVE（37host+37floor探针、finalruntime17floor/typecheck，8suite74在最后close delta前）；architectureWATCH（29probe、final5suite49/AST/import/cycles），综合COMMENT无BLOCK，六hash两报告匹配。service20/runtime18/bound8/store11/publication6不超ceiling。
- finalbuild`48d01c0ba325e28bf01e116f66cfdfae613d3de771314c94b28ab3aafcf0359b`，inputs`f46a789eb0470f26149683132addee946d3fe94141af4c8abf0fde871ecf9974`，artifact`089d5d9ae6d328375e683da2b83b9957cd16cd0e92f28b56a8750916a58e6f70`，exeSHA`aeb996d526d683d1dffbf7262a50fde76920911508668ee1eb47311b2b525e33`；same-build Node/exe regular/fullscreen四格PTY pass/exit0且before/after一致：96retained、十秒浏览、exactdraft/search/cancel无写、live失效恢复/外改及实际session8MiB+1/metadata256KiB+1拒绝和重开。原session/workspace只读步骤字节保持；资源计量由source探针承担，PTY不冒作I/O计量。
- WATCH：stat字段可能对同大小/同时间精度变化相同，不是content digest/原子快照；每轮仍做stat/path工作，变化/native通知仍fullread。每订阅一个token是数量界而非token字节/总heap界，BigInt计数长度随通知数增长，custom revision须遵守来源契约。物理workspace替换触发读取，但沿原reader重新捕获语义，不冒称所有替换拒绝。完整重复交互/heap/latency/累计physical I/O/平台仍缺，35complete/12partial保持。
- 前批`8183a9dc9a312d825584c65e38f3d7bb2af4d54d`已commit/push/远端main读回；精确CI`39986691826`/job`120527589040`completed/success（16:25:51Z–16:39:55Z），Watch`39986691815`/job`120527589327`success至16:26:14Z。仅绑定此前序列化批；本批commit/push/newSHA CI分别取证。

## 2026-10-24 PAN-06 完整security源序列化前准入（`8183a9dc`已推送；CI/Watch success）

- 原security analysis JSON遍历复用为admitJsonSource，decodeSecurity在原JSON.stringify/4MiB encoded check前限制raw key/string UTF8累计4MiB、100knodes/depth24；inspection在count/map及原SHA256(JSON.stringify([context,state]))前对完整context/state累计8MiB，合并唯一unknown记录96项/97拒绝整源。合法parsed/security字段、原版本摘要/encoded4MiB、unknownreceipts与精确身份保持，无新serializer/schema/cache或writer。
- 两lane实际复现toJSON/getter/Proxy/自定义数组iterator、nonenumrequired字段、arrayforEach、primitiveconversion及functioncustomprototype绕过。原owner现在按普通/nullproto own data descriptors、indexedarray、NodeisProxy检查拒绝执行hooks/accessors/nonordinaryprototype/customarraymethods；不可枚举data也按rawsource计量，普通sharedaliases/sparse/NaN/noncallabletoJSON与无hookfunction原JSONomission保留。typedpublicationIterable/全局intrinsics不冒作JavaScript隔离保证；Object.getOwnPropertyNames会分配namesarray，不承诺heap/time总界。
- 本地最终6suite40项pass，准确20.3.0先39项后finalfunction10项复验；4有效AssertionError反转exit1且四hash保持（decoder/inspection/97merge/hook）。单proxy保护被第二hookguard兜底green留存不计有效；中间mixedsource测试与旧floor/typecheck/hash漂移均不算final证据。静态gates/47matrix/diff/build/exe/NormProof0partial通过；ownerjson5/store9/inspection7低于20。独立codeAPPROVE/architectureWATCH，综合COMMENT，无BLOCK；code48host+48floor探针、finalJSON10floor/typecheck，原5suite35在最后delta前另列；architecture35probe/final5suite36/AST/import/cycles，四hash两报告一致。samebuildPTY与commit/push/newSHA CI分别绑定。
- finalbuild`0ffcf5a3c901fd112069714fd8f458bcbf81401fcbdb5c4e2dc9d15c3df7e7cb`，inputs`a12483d2f2fd4c2d0932c72113128e4f8215b6b1f5b1f8684cd506ca62fff718`，artifact`09297c4c765a1567a7302ad8cac71d2fbd464c9f5235fc6bf4a50aea005b04bc`，exeSHA`c74fcbcdc0a5f08173b57cb87fcc73fbcaf25d9774f13b1e70b535d52ed1d4a1`。旧build四格业务pass后finalfreshness明确拒绝（functionprototype修复期间构建变动）；失败保留，finalsamebuild Node/exe regular/fullscreen四格pass/exit0、before/after完全相等，state/transcript/metadata/workspace只读步骤原字节保持；结果见author-binding/pty-function-final。sourcebudget实际边界及hook不执行由生产探针覆盖，PTY保留96records/fullsearch/draft/cancel/no-write及实际session/metadata超限回归。
- WATCH/剩余：rawsource bytes不是精确encoded总界，普通admitted对象仍原JSON/string/hash；polling累计physicalI/O/瞬态heap/时延/平台仍本地缺口，35complete/12partial保持。下一步原inspector轮询与完整重复交互测量，不能把本批预准入当性能闭合。
- 前批`ad3985c0ada79a9f2bc1b86f7bb85856e28ea54e`已commit/push/readback，精确CI`39983073147`/job`120515120233`于16:15:52Zsuccess、Watch`39983073161`16:00:42Zsuccess；选择批`7528a3cf`CI`39980621177`/job`120506638733`15:58:11Zsuccess，Watch39980621185success。分别仅绑定各自SHA。

## 2026-10-23 PAN-06 原security session来源读取（`ad3985c0`已推送；CI/Watch success）

- 原readBoundSessionState/readCurrent增加可选只读metadata/state limits，直接沿readSessionMetadataRecord/readStateSnapshotRequired→readTextFile描述符reader；SecurityStore.read采用已有navigation同级256KiB metadata/8MiB state。打开后size检查在body分配/读取与JSONparse前，exact可读/+1整源拒绝、UTF8/path/identity/version/retry保持。无limits的原consumer及writer/locked publication维持原合同，无新reader/schema/cache，也不截断或丢durability unknown证据。
- 本地6suite42项在Node24及准确Node20.3.0均通过，3有效AssertionError反转（metadata/state/原caller）exit1且三hash保持；原初始global read计数误拒合法metadata先读，现按descriptor dev/ino只计超限target body，失败记录保留。静态gates/47matrix/diff、TS/exe构建/NormProof exit0partial通过；scripts157在前一批同日通过且本批未改gate/script。target现有navigation有界reader、参考有界header exactEOF决策对照；完整reference load仍无总界，未复制或伪称相同session schema。
- same-build`61396d2fd6d093c64f15f7aee2949266fa081c3fbbe3baf4918dc481885eb3e4`，inputs`9a58c1706a96319d430d3a20b343def8dfd1c4945970ffd5601a457cdf2e37a0`，artifact`156c10172b3ef8af948ed4c9844f7b03b9b9e41c5115dbc4673c0c302ce95c00`，exeSHA`76502e6518b3f50ebb9e1f77e4b8b45b9ae8488d6a862c158b998a9d0b6df626`；Node/exe regular/fullscreen四格PTY pass/exit0、before/after相等：96原retained、exactdraft/search/cancel无写/livefailure恢复/外改、原decoder97record拒绝，实际8MiB+1state与256KiB+1metadata明确unavailable/恢复重开；所有只读步骤state/transcript/metadata/workspace原字节保持，无模型/工具调用。证据`.omx/artifacts/phase20-cleanse-acquisition/`及author-binding。
- WATCH/剩余：约束单read文件来源，不保证累计physicalI/O、每秒poll/JSON序列化成本、瞬态heap/latency；security writer与其他无limitsconsumer不冒称受限。下一步完整security投影/轮询测量仍本地可执行，35complete/12partial保持；独立codeAPPROVE/architectureWATCH，综合COMMENT无BLOCK，三hash与报告读回一致；code26host+26准确20.3探针、66focused/typecheck，architecture24probe/34focused/AST/import/cycles，ownfixtures清除。commit/push/newSHA CI分别取证。
- 前批`7528a3cfcf4c6acd815df0d68f0681a6ea2a83ab`已commit/push/readback；Watch`39980621185`completed/success至15:43:13Z，精确CI`39980621177`最近仍in_progress，不借用68c298f0 success。

## 2026-10-23 PAN-06 cleanse选择、来源投影与原消费者（`7528a3cf`已推送；CI/Watch success）

- 原SecurityInspector保持只读owner；opening捕获原session/workspace/profile/admission/signal，并使用既有实时sessionContext验证接受结果。source在option/search join前整源准入96items、8Mi UTF-16、4096detail lines，复制不可变精确目标后重验，不静默截断。load失败清offered；订阅获取前检查、重复立即释放、同步首发close及queued stop均安全；detail/status按原控制拒绝旧数据，close释放原source/context，accepted仅保留必要身份接口。
- 原OverlayHost新增可选previewAccept，在正常接受前捕获且随后结束browser signal；直接已取消选择拒绝，父级signal/admission仍贯穿fresh read与draft publication。选项一次消费，fresh原身份/version/target匹配，保留原unknown/unavailable/stale与完整合法detail/search；仅生成quoted `/cleanse diagnose` 草稿，无工具/修复/隐式删除或native scan cancellation。独立复现并修复原真实InteractiveMode丢草稿、临时WeakRef context GC失效、mutable版本/target、source拒绝后复活及多种订阅/回调控制缺口。
- 本地8文件237项在Node24与准确20.3.0均通过；最终一项订阅时序断言增强后19项两runtime重跑。13有效AssertionError反转exit1、十source/test hashes前后相同；current检查因source内再次check兜底green、replace反转被测试后来显式stop遮蔽green均保留，后者增强立即释放断言后有效。初始已消费picker复用、假/workspace物理/配置准入、callback close错误分类及中间构建测试input过期均留存，未削弱断言。scripts157/静态gates/47项matrix/diff通过，NormProof exit0/partial、0blocking、1原ceiling advisory/10gaps；原audit保持。
- 独立code APPROVE/architecture WATCH，综合COMMENT，无BLOCK；code34host+34准确Node20.3探针、256focused/production typecheck及最终19项增强复验；architecture44production/control/consumer探针、GC释放、232focused及最终19项、AST/import/cycles。十hash与报告绑定。owning cleanse/source/state为13/2/4names，原registry37/overlay25未增。直接无live accessor的accepted caller保留其身份port到picker被回收；production使用实时owner，不持有完整commandContext。
- build`096cb76f03f82f6bcdf3ec52d27f2e800d3d45b0ce6eb9c25d7a73175d3348cc`，inputs`25c89246585a0cf8080312e8f4d5b2c30c2a2e7ad4f1569f7afab999cf570bf2`，artifact`828bffe9a7194ba8baeabcc1e564e4695de6743b6dd3fa0a19123bf37a3887b9`，exe SHA-256`39a5e3962e2d1946d224a47cd4fe409441081caeab5c449c572df3a92bd76181`。same-build Node/exe regular/fullscreen四格PTY pass/exit0、before/after相等：32scan+64remediation、orphanunknown、完整detail/search/exact diagnosisdraft、cancel无写、live不可读恢复/外改refresh、原97record document拒绝与重开；state/transcript/metadata/workspace在只读步骤原字节保持，无模型/工具调用。hostile投影边界由实际source探针覆盖，PTY的97项属于原持久decoder拒绝，不冒作同一boundary。证据`.omx/artifacts/phase20-cleanse-selection/`及author-binding。
- WATCH/剩余：投影cap不约束更早fullsession acquisition、完整security JSON/hash、每秒polling、总physical I/O/heap/latency或跨平台。原provider/审批/writer不扩展，本地下一步仍原source owner获取/序列化；35complete/12partial保持。本批commit/push/newSHA CI分别取证。
- 前批`68c298f02bf0b4fe61dae5b45f90a18299105b0b`已commit/push/readback；精确CI`39975873837`/job`120490192135`completed/success至`2026-10-23T15:36:48Z`，Watch`39975873905`success。该成功仅绑定前批SHA。

## 2026-10-23 PAN-06 原restore执行读取与完整控制（`68c298f0`已推送；CI/Watch success）

- 原bridge完成preview后，one-use attempt共享128MiB fresh metadata/blob及独立384MiB locked target source预算，每file64MiB；原primitive preflight、commit before/current/after四次descriptor inspection分配/读取前计量，失败不退款。direct primitive默认同policy，原readAccess/abort/file-access与共享owner按单次调用组合，不双计同caller回调；原target locks/current equality/selected order/receipt-required/writer保持，无新schema/cache/commit实现。
- 独立实际复现并修复共享owner忽略原call controls/bytes、异步cancel未latch、current body取消误报unknown、final verification body取消仍verified、one-shot file-access拒绝不保留及workspace alias转向另目录。已有preview identity owner增加原词法路径至原canonical root绑定，贯穿command/preview/bridge/execute；执行owner捕获original workspace string，primitive输入提前复制。control在admit回调后、prep catch、locked current读后与commit返回后检查；writer-start前blocked，之后unknown，先前已接受verified结果及后续blocked各自保留。
- 最终15文件151项、准确Node20.3.0十文件96项、scripts157项通过；16有效AssertionError反转全部exit1且六source/test hash相等。原1541c1f源码19实际AssertionError/2pass，两个owner-only已有实现不计原product失败；初次构造budget后改mock limit、相对config路径setup失败、冗余prepared/initialcheck green反转等留存，不计有效。独立code APPROVE/architecture WATCH，综合COMMENT无BLOCK；code25探针在host与准确20.3.0均通过、83项/production typecheck，architecture25production/control探针、41项/AST/import/cycles，六hash两报告绑定、own fixtures清除。实际64MiB exact/+1/lockedgrowth、failedblob无退款和384MiB预算边界分别注明source admission与实际I/O证据。
- build`2c44d46db8eb91278978600772c0f055ad79373ae81ca471c4731d7953e59fea`，inputs`69cef82cc536f57440a021259e48e81a7ebb738182d32974f8b4dd7ef5979919`，artifact`b99aa407730a3464c4cc0e029d5c8d7f3da283bd5d60edb1bbf78b3079dd38e9`，exe SHA-256`434a210be9d7750f8108be5776ddddd2322c34c97dc24931aa44719eedc5e3b7`。最终双构建fresh、同准确build Node/exe regular/fullscreen四格PTY pass/exit0且before/after相等：205snapshot三页到最旧preview/search/cancel/stale/index拒绝、actual128MiB准备和64MiB+1 current拒绝零写、合法显式selected CRLF+emoji恢复，原record/blob及其他workspace bytes保持。专用PTY与报告/author-binding见`.omx/artifacts/phase20-restore-writer/`。中途旧build业务四格pass后的freshness拒绝及后续旧build启动拒绝分别保留，不算最终证据。
- source预算是本attempt累计读取准入，不等于总瞬态heap、physical write/store I/O、重复交互时延、其他平台或跨文件崩溃原子性。原conservative writerStarted unknown可能早于实际rename，不能改写为未执行。cleanse及完整测量仍本地后续，35complete/12partial保持。本批commit/push/newSHA CI分别取证。

## 2026-10-23 PAN-06 explicit restore准备与最终预览准入（`1541c1f6`已推送；CI/Watch success）

- 原preview读取链复用recovery descriptor/budget，单call累计128MiB index、重复prepared metadata、before blob及current source，单current file64MiB；opened size在body分配/读取前扣量，失败不退款。selected IDs在await前复制，`--all`首次index和后续准备共用原owner与预算。普通缺失/path/content mismatch继续原逐文件诊断；资源/control拒绝整call，不能在后续execute恢复先前eligible子集。
- 独立审查实际复现preview返回后准入撤销仍写文件、all首次读取未计量/捕获替换root及最外层command仍发布旧preview，均修复并保留失败探针。bridge在首次读取前捕获workspace/profile/signal/admission，after-await重验并传入原primitive file-access边界；runner/local command提前捕获原身份，只在preview返回前重验，原已执行/unknown结果完整保留。原selected顺序、显式execute、guarded writer及receipt-required语义保持，无新writer/schema/cache。
- 最终14文件115项在Node24与准确Node20.3.0均通过；原write-access12项、commit consumer24项、result-contract158项、scripts157项通过。11有效AssertionError反转全部exit1、九source/test hashes前后相等；原5c79d6bc源码11项实际AssertionError。独立code APPROVE/architecture WATCH，综合COMMENT无BLOCK，十个最终source/test哈希与两报告绑定；code独跑78项/18production探针、准确Node20.3.0另31项，architecture60项/18production探针及AST/import/cycles，作用域全部低于20函数。Node20目录关闭测试一行修正另经两lane复核，未弱化ERR_DIR_CLOSED断言。
- 上批index `5c79d6bc29f4533dc0f8fc78307e329fc2920815`已推送；精确CI`39967258892`/job`120460258412`于14:27:20Z failure，948文件/10133项通过、两项关闭目录测试失败，Watch`39967258922`success。本地准确20.3.0回放原断言同样两项ERR_DIR_CLOSED失败，修正Promise内调用以捕获同步throw后31项及完整受影响115项通过；属于测试跨版本捕获错误，不改production cleanup，也不将上批CI升为成功。
- 最终build`5b0aced4cac9aa1679a8f1af569748a7ed759e8deca6dad95afc40a544301fd2`，inputs`204a56a524dac28f2c80b7bb9ecf4ae567134db33305ca21b28bbc73a61febb5`，artifact`c22c860db4a9370ff8376f8839fcf2abdb18d08fb48c5c37cda98a73c8110234`，exe SHA-256`64a8e183cca473a8d674a9d2d9c23b856eb51b67ca24a9fe3759da65fda388c8`。双构建及同build Node/exe regular/fullscreen四格PTY pass/exit0、before/after身份相等；205snapshot三页/最旧exact preview/search/cancel/stale与index超限拒绝，actual两33MiB before/current pairs导致128MiB准备拒绝、actual64MiB+1 current拒绝且零写，合法显式execute恢复一个selected CRLF+emoji target。全部原record/blob及其余workspace bytes保持。最终结果与author-binding见`.omx/artifacts/phase20-restore-preparation/`。初次旧build四格浏览pass、测试变更后的freshness拒绝及首次增强探针等待未渲染Markdown标记超时分别保留，不算最终证据。
- WATCH/剩余：128MiB只约束preview准备，原primitive执行时再次metadata/blob、locked current/commit及physical write I/O不计入；JSON/hash/string瞬态heap、同步响应、重复scan、cleanse与跨文件崩溃原子性不据此保证。PAN-06及47项仍35complete/12partial；后续先原restore执行资源，再cleanse和完整测量。本批commit/push/newSHA CI分别取证。

- 代码批`1541c1f69034360a931da0b225224a06efeec27e`已commit/push并读回远端main；精确CI`39972785178`/job`120479542134`completed/success，14:48:31Z–15:05:57Z；Watch`39972785542`/job`120479543001`completed/success，14:48:32Z–14:48:57Z。修复了上批5c79d6bc的Node20测试捕获失败；此CI仅绑定1541c1f，不扩展到后续执行source批。

## 2026-10-23 PAN-06 原恢复索引累计准入（`5c79d6bc`已推送；CI测试失败，后续批修复）

- 原namespace/record index退出full readdir数组，owner内复用opendir32缓冲、Dir.read前后准入与finally close；每call32MiB metadata source、20k选中ID/接受names、50k全部实际direntries（含忽略项）。原显式ID先计数再复制，重复ID仍逐项计量，外部数组在异步metadata读取中追加不能扩大本次选集；完整排序、ID/filter/missing与filesystem区别、blob presence-only及原catalogue100页投影保持。
- Local budget与caller readAccess两signal/check/admit组成原descriptor reader准入；坏JSON/重复失败读取不退款，超限整call拒绝，不返回已保留page或missing-only空成功。namespace新增optional control并在inner返回至public列出前再次检查。首次拒绝在本call保留，directory或metadata close EIO不能盖掉control/limit；public直接重放原limit类别，ordinary cleanup错误仍blocked，不声明拒绝时close成功。
- 独立审查实际复现namespace publication、close吞拒绝及mutable selected ID绕过，均修复并保留失败证据。最终12文件93项、恢复20项、scripts157通过；13有效AssertionError反转exit1且四source/test hashes前后相同，原7e0b327d源码20项全部实际AssertionError。初次retained单保护因later explicit count兜底green、typed改动same-message green、latch改动后旧反转pattern setup失败及limit-check错误夹具均保留，不算有效；最终绑定actual retained/class、mutable selection等合同。cycles/config/declarations/Node floor/docs strict/47项矩阵/diff通过，packaged NormProof exit0/partial、0open/1failed advisory/10proof gaps，audit residue恢复。
- 独立code APPROVE/architecture WATCH，综合COMMENT无BLOCK；code独跑10文件91项/13actual boundary/control探针/typecheck，实际32MiB+128KiB重复malformed opened reads、20kID+1、20k有效namespace+1与50k忽略项+1及large append；architecture6文件58项/16探针/AST/import/cycles，32MiB实read及20k/50k synthetic Dir.read inventory接原bridge。四hash两报告/final-binding一致，own fixtures清除。public index7函数等于base7、read4/limits0，不增加中央行为。
- build`3a7c0d52d5545fc79d3f92a16f2b69e147e73e79ac10b9f106eef35bcd50cde9`，inputs`5f00d08720eea5c177b6a3ccbd6a74fb12cfbf2923909d1fd7ca1c3baaa256ea`，artifact`1c192883cd2035493c38ee8e84fa8a9052258fc1bd004e8b1ed552686a5e58c8`，exe SHA-256`95664d44000cfdd47fa2567132b7245ab2758d7504721a3a656bf2753359f482`。同准确build Node/exe regular/fullscreen四格PTY pass/exit0，build-before/after相等；205snapshot三页到最旧exact只读preview、全search/cancel/stale cursor/累计catalogue拒绝及原explicit `--all`来源超限明确拒绝，移除fixture可重开。全部原workspace/record/blob bytes保持。证据`.omx/artifacts/phase20-restore-index/`与author-binding。
- WATCH/剩余：单index call source/names计量不证明blob/current content准备、writer I/O、decode/hash瞬态heap或重复交互physicalI/O/响应；explicit restore内容准备与cleanse仍本地后续，35complete/12partial保持。目标已有catalogue/session Dir.read取消及descriptor计量方案沿原owner适配，参考selected checkpoint JSON/Git无相同多record累计policy，未复制代码。

## 2026-10-23 PAN-06 restore 选择来源与生命周期（`7e0b327d`已推送；CI/Watch success）

- opening在原registry绑定session/project上下文副本、canonical workspace身份、profile身份与原command admission/signal；same-owner准入拒绝可显示，changed-owner迟到结果沿原host抑制。账本路径在准入后延迟解析，目录内metadata读取通过原readAccess重验，没有新增reader/cache/writer/schema或写批准。
- 取消、有效选中和续页handoff一次消费旧page，abort浏览、失效generation并清offered/page/base/query；closed load/search拒绝，clear/apply不能复活。每call独立signal组合并finally移除listener，取消单个search可重试。界面先abort load再apply，接受动作因此只保留原opening access与选中metadata引用，沿原index fresh equality重读后产preview draft；多选同authority、quoted路径、hidden metadata digest、pending/invalid/mixed拒绝保持。
- 两lane独立复现内层read返回至外层load继续之间的取消竞态；补load closed与load/search原准入/signal publication检查。失败探针保留，修复后独跑通过。build首次TS2322发现lazy ledgerRoot未收窄，补保存page前明确root guard后build通过；初次workspace反转因已有assertWorkspaceRoot兜底green、signal反转只得到AbortError均保留，改为真实identity/resolves合同断言，最终12有效AssertionError反转均exit1且七source/test hashes前后相同。原e435261d源码11项实际AssertionError/1pass，两state-only项排除；原代码已支持单search取消/accepted信号分离，不虚报新增失败。
- 最终9文件258项、恢复14项、scripts157通过，cycles/config/declarations/Node floor/docs strict/47项矩阵/diff通过；packaged NormProof exit0/partial，0open/1failed advisory/10proof gaps，audit residue已恢复。独立code APPROVE/architecture WATCH，综合COMMENT无BLOCK；code137项/11探针/production typecheck，architecture50项/15production探针/3actual host项及AST/import/cycles，七hash与final-binding一致，各自fixtures清除。registry保持原37function-like names，restore16/state3/catalogue6，行为仍归本域。
- build`52b4bdeeec0d143baf8d55f4b77da68744d5594f80d26e8c6f67ea1f954bb828`，inputs`28621998e4d9988adcbda23654140cc67c7aa9844f4bf93354d002c96bc40885`，artifact`8adbc704bd37c9e7ffbdd9fe8eb5906ae5938f4ed98e9d54db4a5c1c110d9805`，exe SHA-256`d93932da9146089bb1fadef7a172484ca0f8885d149b44eafcb5274b320a3881`。同准确build Node/exe regular/fullscreen四格PTY pass/exit0，build-before/after相等；205snapshot三页到最旧exact preview、全search、cancel/reopen、hidden metadata stale续页拒绝及累计source拒绝。全部原workspace/record/blob bytes保持。证据`.omx/artifacts/phase20-restore-selection/`与author-binding。
- WATCH/剩余：每page/query仍fresh complete scan，source准入与释放引用不等于总heap/physical I/O/最长响应；explicit restore command准备与default index inventory、cleanse consumer仍本地待处理。registry已有超ceiling聚合未增加，不在本批扩展。PAN-06与47项保持35complete/12partial。

- 代码批`7e0b327de11235422c915d1037aff878a2092e2f`已commit/push并读回远端main；精确CI`39963636126`/job`120447709415`completed/success，13:43:54Z–13:56:15Z；Watch`39963636176`/job`120447709765`completed/success，13:43:54Z–13:44:22Z。仅绑定此SHA；原index后续批不扩大此CI证明范围。

## 2026-10-23 PAN-06 restore catalogue 来源与取消（`e435261d`已推送；CI/Watch success）

- 原streaming catalogue每complete call最多32MiB metadata source bytes、20,000record candidates与50,000ledger/records目录项（含无关名称），跨全部authority累计；metadata128KiB单项限制保持，validated opened descriptor在分配/读取前计量，坏JSON/失败read不退款。超限整call拒绝，不返回已保留的100record page或空成功；原complete100项分页、全文query、revision/cursor、unavailable/empty/no-match区别保持，blob presence只stat，不读blob/current body，无新scanner/writer。
- 原index加可选readAccess，effective signal进入已有metadata descriptor reader，在read/stat/readdir后重验，typed limit/control错误不被吞成missing。shared budget只新增可选limitMessage，catalogue错误不冒用undo文本；default index的full readdir数组和explicit consumer接受规则保持。目录buffer32及iterator/finally关闭保持；完整scan catch与root-open catch重验取消，EACCES/ENOENT或两层iterator EIO同时取消保留exact reason，无OS syscall cancellation deadline声明。
- 原`b11afed3`源码最终11实际AssertionError/1pass；rootENOENT取消原本能在后续end check检测，不虚报新失败。最终10文件67项、恢复12项通过，七有效AssertionError反转均exit1且五source/test hash前后相同；root-open保护因outer scan catch覆盖而单独反转green，原日志保留不计有效。最初六/七反转分别绑定当时源码，final sweep重新绑定。scripts157、静态门/diff通过，NormProof packaged judge exit0/partial、0open/1failed advisory/10proof gaps。
- build`bee73a658dbb955dd52cf10665646b5c1ff10161f9479342a55fb2879bea53f5`，inputs`6095f8578c7fca83d2f8ed7ec62b3e392264edf2dffe736b251e4c0d69bd1d64`，artifact`bdf8e9cd9e45688c0c3e5fcdc83c05873ca31856e203d1f1904bff33481196e5`，exe SHA-256`ddc7d9c2a97897ef927d3252fa17b7d8dd43f8064958de397c44f86458609979`。同准确build Node/exe regular/fullscreen四格PTY pass/exit0，build-before/after完全相等；205record三页到最旧exact read-only preview、全query找到另一页、取消不写、hidden metadata变化拒绝续页；300份120KiB坏JSON导致累计source拒绝，移除fixture后可重开。全部原205workspace/record及blob bytes保持。初次多选More漏space toggle超时留存，按原multiple语义修probe后中间build四格通过；最终control源码再次rebuild、四格重跑才绑定。证据`.omx/artifacts/phase20-restore-catalog/`及author-binding。
- 独立code APPROVE/architecture WATCH，综合COMMENT无BLOCK，最终四production/newtest五hash匹配两报告/反转/final-binding。审查实际发现并修复root-open及iterator失败遮盖取消来源，两级actual Dir handle关闭回归保持。code独跑8文件59项、14实际production policy探针和六final control探针，实文件exact32MiB、20k/50k边界/default接受/完整分页及错误保真；首次pre-format hash guard拒绝留存不算pass。架构独跑6文件50项/12production探针，实文件exact32MiB+1、跨authority和typed错误；20k/50k exact/+1使用synthetic inventory接原reader，证明政策而非实盘scale/时延。所有import独立解析/AST职责上限及cycles通过；各自fixture已清除，不以supplied67项/PTY替代独跑。
- WATCH/剩余：每page/query仍fresh complete scan，20krecord的200page可累计4,000,000metadata acquisition，32MiB/call不代表全过程heap/latency/physical I/O或cache正确性。fingerprint仍乐观mixed-epoch detector，选择沿原选中record fresh equality及preview draft，非原子snapshot。default index inventories及restore picker one-use/surface admission、cleanse资源仍待后续；参考选择器实际cancelLoads/late identity与本仓reader取消一致，checkpoint单JSON/Git不提供同类累计policy。35complete/12partial保持。

- 代码批`e435261d55aa6a0c3d87c43c125a8e806d848cc8`已commit/push并读回远端main；精确CI`39960212912`/job`120436029565`completed/success，13:19:16Z–13:36:44Z；Watch`39960212790`/job`120436029146`completed/success，13:19:16Z–13:19:37Z。仅绑定此SHA。上段picker缺口由后续selection批处理，不能据此关闭PAN-06。

## 2026-10-23 PAN-06 undo 锁内目标读取（`b11afed3`已推送；CI/Watch success）

- 原`operation/restore`在批准后refresh通过才建立384MiB累计target-source读取准入，每file64MiB，覆盖完整locked preflight与原`commitWorkspaceFile`的before/final-current/after三次检查。共享commit只加neutral可选admitBytes，默认调用保持原路径，maxBytes与opened-size分配前计量由原workspace inspector负责；失败不退款，absent零body。普通来源`current+blob+metadata<=128MiB`推出`3current+blob<=384MiB`，没有改变preview128MiB政策。
- pre-intent全部target预检查超限明确blocked、receipt/target不变；durable intent之后沿原逐文件blocked/partial/unknown，已发布但读取验证拒绝保持unknown，不能升级success或自动重放。已restored-verified file仍进完整preflight但不再写；原exact approval、fresh revision/latest receipt、target/store locks、final state/path/identity/mode/content与temporary cleanup保持，无第二writer。
- 新八项在原`e40da34c`源码七项真实AssertionError；修复后12文件144项、恢复后1文件8项、scripts157与静态门通过。六有效AssertionError反转/hash前后相等；首次单次refusal用例因少一次检查后更晚仍throw而green，保留后改用精确三次charge vector；首次growth夹具未sync ESM导出、未触发锁注入失败保留，syncBuiltinESMExports修正后原源码读1028bytes而当前仅3bytes。NormProof packaged judge exit0/partial，0open/1failed advisory/10proof gaps。
- build`9815ce293fe76f2e0767f183681bbe7414e124a976b51008faa5b369a87828ea`，inputs`52bf57ff61d93375a10a4e278173cd715a19fb3e7c3239a77858d76cf961cf4b`，artifact`d076bf901faeeef7ccbd8ccb23cc85782eee4f75818399b082ea3ced2b83c881`，exe SHA-256`7b3732de81c711497e98d931f34878d104e1bd13c3e29bfb284e9a2653474e76`。同准确build Node/exe regular/fullscreen四格PTY pass/exit0，before/after完全相等：85条初始picker三页/最旧ID/cancel/stale/oversized拒绝，原owner新增第86条commit，preview取消不写、fresh明确确认后exact CRLF+emoji与durable restored-verified，最终command三页40/40/6；原workspace文件与85receipt字节保持。证据`.omx/artifacts/phase20-undo-writer/`及author-binding。
- 独立code APPROVE/architecture WATCH，综合COMMENT，无BLOCK；最终三production和新test hash均匹配两报告/反转/final-binding。code独跑6文件101项与12实际source探针（准入growth/UTF8/absent/approval/locked stale/partial恢复/unknown重放）；architecture独跑3文件29项和八实际production探针（实际64MiB+1零read、完整verified target检查、仅剩余file重写、post-publication unknown），366,145整数MiB组合验证预算算式，cycles零及AST ceiling通过。两lane直接root Vitest重复安装问题/serialized undefined夹具失败分别保留分类，正常workspace runner及精确serialized比较后通过；各自清除synthetic fixture，不以supplied144项/PTY代替独跑。
- 384MiB只是本attempt四处target-source准入，未覆盖store rereads、physical I/O/write bytes、其他explicit恢复consumer；保留原/refresh preview、同步inspection/hash/temporary内容仍非heap或最长响应保证。参考selected checkpoint+Git恢复无同类exact receipt累计界，本仓复用原maxBytes/admission/approval/writer，非whole-workspace snapshot。继续restore/cleanse/catalogue/heap/响应/平台缺口，35complete/12partial保持。

- 代码批`b11afed37ce6326a73e0e74932ce67318d19ceac`已commit/push并读回远端main；精确CI`39958229805`/job`120429334772`completed/success，13:04:35Z–13:21:39Z；Watch`39958229704`/job`120429334471`completed/success，13:04:35Z–13:05:00Z。仅绑定此SHA。

## 2026-10-23 PAN-06 undo preview 准备读取（`e40da34c`已推送；CI/Watch success）

- 原recovery record/prepare/blob链承载read access，每次preview累计128MiB来源bytes，包含snapshot JSON、blob和current file；JSON仍128KiB、blob/current各64MiB。按已验证opened descriptor size在分配/读取前扣量，失败不退款；累计拒绝清除此前prepared/current bodies，完整receipt文件均显示`preview-source-limit`且不能恢复，不回退older receipt。原workspace inspector只加可选admitBytes，启用时读取恰好已准入的原size，后续growth由原final stat拒绝；其他调用保持原读取路径。
- 原text reader改为exact validated size分配、64KiB异步分块，在metadata/blob操作及块之间检查signal/admission，前后验证path/inode/final stats并finally关闭。显式read-control错误穿过原metadata/blob catch，readAccess-only signal使用同一effective signal；原OperationAccess两次file assertion均经过同一typed admission，单次拒绝也不能被后续允许吞掉。preview revision按原`{receipt,files}`完整JSON字节增量hash，full current FileState身份/hash/mode/content绑定保持；原审批、refresh、target/store locks、receipt compensation与逐文件结果保持，无新writer/schema/executor。
- 原`eca77e90`源码七项实际AssertionError；最终16文件227项、恢复后2文件16项通过。12有效AssertionError反转均exit1且九份source/test hash前后相等；初次green/syntax-error反转尝试留存，不计有效证据。scripts157、cycles/config/declarations/Node floor/docs strict/diff通过；NormProof packaged judge exit0/partial，0open/1failed advisory/10proof gaps，裸CLI不可用不假报通过。证据`.omx/artifacts/phase20-undo-preview/`及final-binding。
- build`25029c0492bebb678a5f9739498c8f3cdaec392215b299f85e4a83120c1aa268`，inputs`1fbbd653b89546dc9b587ac7f5a0f18c71e8b798e0cd99955c987f33f5f9999e`，artifact`4ae99ec1e06034e036bd9e418026df97f501c4d6324251a303d01ecad6989749`，exe SHA-256`f1443622f813122620586905b88b70f672a56d25457d6763f0a5d3dfa752cab0`。同准确build Node/exe regular/fullscreen四格PTY pass/exit0，build-before/after相等；初始85receipt三页/最旧ID、cancel、stale/oversized拒绝，随后原compiled owner实际创建第86条committed operation，preview取消保留after内容/undo none，fresh明确确认后恢复exact CRLF+emoji并持久`restored-verified`。最终direct command完整86条三页40/40/6；original workspace file及85份original receipt bytes保持，新增target和receipt的显式恢复分别断言。result旧字段receipts85仅指初始浏览，final-binding另记commandReceipts86。最初preview/confirmation同步和index85→86夹具失败原日志保留，修正后四格重跑。
- 独立code APPROVE/architecture WATCH，综合COMMENT，无BLOCK；最终七production owner hash均匹配两报告，九source/test hash匹配反转与final-binding。code独跑十个exact limit/growth/approval/cancel/单次准入探针及3文件32项；architecture独跑growth实际回归、7文件49项、最终2文件16项及cycle/AST检查，全部owner不超过20声明。两lane实际发现并修复未计量growth、alternate signal吞取消、单次metadata及workspace admission吞拒绝；supplied与独跑证据分开记录。
- WATCH/剩余：128MiB只是该call已准入source bytes，decode/reencode/per-file JSON仍有临时内存，approved和refreshed preview可共存；current inspection/hash同步，块间取消不保证OS I/O deadline。后续锁内target/commit inspection未有maxBytes，legacy explicit restore/cleanse未加入累计policy，不能宣称完整writer I/O、heap/latency或跨文件崩溃原子性。目标catalog reader已采用stat-size/64KiB/final-version机制，本批在recovery owner适配；参考checkpoint/Git restore未发现同类exact receipt累计政策。继续这些本地缺口，35complete/12partial保持。

- 代码批`e40da34ce8ad15b076f85e6b7e158dce867a865e`已commit/push并读回远端main；精确CI`39956460655`/job`120423407252`completed/success，12:51:08Z–13:02:36Z；Watch`39956460529`/job`120423407196`completed/success，12:51:08Z–12:51:29Z。锁内target缺口由后续批处理，仍不升级全PAN-06。

## 2026-10-23 PAN-06 undo receipt 扫描与一次页面（`eca77e90`已推送；CI进行中/Watch success）

- 原operation store复用descriptor-bound `inspectWorkspaceFile`，index/receipt的8MiB限制移到读取前；每次完整scoped scan最多32MiB已准入UTF-8 JSON（含index）、50,000 receipt file entries和20,000目录项（含无关名称，opendir buffer32）。超限整份拒绝，不截断、不空成功；file数在单份最多256条的receipt解析后计入，允许检查一份超出累计条目预算的receipt才拒绝。目录cap只用于readOperations，allocateOperation沿原目录接受规则；直接readOperation仍可读合法单项。保留索引全receipt核对、顺序、profile/session/workspace及unknown/partial barrier和原写入器。
- 完整receipt值增量JSON hash与原`JSON.stringify({scope,receipts})`字节相同，游标兼容；每次page/action仍 fresh full read/hash，避免额外整份序列化字符串，未增加失效不完整的cache。root/history/confirmation关闭、选中和handoff一次消费并释放引用，迟到preview不能复活；registry接原surface准入，原scope/config/surface检查跟随既有OperationAccess进入恢复owner。same-owner拒绝可显示，换owner迟到结果不回填；取消后Restore必须重开确认。
- 原`cdce79a2`源码六项真实AssertionError，最终9文件246项通过；11有效AssertionError反转均exit1且11份source/test hash前后相等，初次10组另保留。scripts157、cycles/config/declarations/Node floor/docs strict/diff通过；NormProof本机裸命令不可用记录保留，仓库packaged judge exit0/partial、0open/1failed advisory/10proof gaps。原UI夹具不存在的workspace已明确mock其持久owner并publish匹配configuration，保留实际preview/Cancel/Restore检查；首次state文案夹具失败留存。
- build`acd77c67f3c9c064d94c79af92f8849cabd19d64a2e34939560311ebe0048405`，inputs`8866c32bb5f1ab6917748146cf1dc341cb5ee609299ffd4fac706b806bb0ad47`，artifact`07df074af53bd20469b617d2b4df8474ee63c47d000a2241ba1c2ad9624a0995`，exe SHA-256`37dbc0851968a2d208bfb379fc9d6e8b3dd89ae4cf0ca1eddf45ea2ebbce1e03`。同准确build Node/exe regular/fullscreen四格PTY pass/exit0，85条三页及最旧ID、cancel、外改receipt stale拒绝、8MiB+1 receipt拒绝，workspace及receipt字节保持；直接print三页有序完整。首次四格业务通过后因新增test输入freshness拒绝整份证据，日志保留；重建后build-before/after相等。证据`.omx/artifacts/phase20-undo-boundary/`与final-binding。
- 独立code APPROVE/architecture WATCH，综合COMMENT，无BLOCK；两报告绑定最终七owner hash。code独跑18个精确边界/身份/取消race探针、最终6文件124项；architecture独跑50 owner项、最终146 UI项、四probe组（100 cursor等价、reader-only cap与allocation分离、mixed epoch、生命周期）。归属清晰，不以supplied命令代替独立验证。实际owner最多15函数；registry既有37 property callbacks未新增，本批只改原薄delegate参数。
- WATCH/剩余：32MiB是已准入source JSON bytes，不是decoded/临时heap、总物理I/O/最长响应；同步full read/hash不能在事件循环中途响应Esc。现undo preview还保留snapshot/body及current content并序列化revision，单blob64MiB/最多256文件未建立累计预算；恢复accept后的取消沿原owner。跨receipt可mixed-epoch，fresh hash是乐观重验，原restore locks/approval/逐文件验证继续保证写入准入，非原子账本/跨文件崩溃快照。继续preview/restore/cleanse/平台与完整资源验证，35complete/12partial保持。

- 代码批`eca77e90a2bc8c0f25605709ebb9c43a831f8538`已commit/push并读回远端main；精确CI`39953749814`/job`120414346135`于12:29:56Z开始，最后读回in_progress（前13步success，tests运行中）；Watch`39953749731`/job`120414346195`completed/success，12:29:56Z–12:30:16Z。不升级CI状态；上段preview累计准备缺口由后续本地批处理，仍不等于PAN-06完成。

## 2026-10-23 PAN-06 back 持久来源与版本（`cdce79a2`已推送；CI/Watch success）

- 真实host的sessionTurns复用原`readSessionNavigation`，经已有metadata256KiB/state8MiB/transcript16MiB、50k物理行/20k tree entry限制取得active turns与version；原`getSession`吞异常后空数组路径退出该consumer。读失败、错误project root、损坏父链及活跃路径缺失消息均拒绝为unavailable；不把缺失的活动消息筛成成功，非活跃无关分支缺失仍不阻断back。
- opening version在同一source的每个RewindPoint保持，经分页选择传原`navigateSession`预读取检查及原revertTo/state-lock重验；已变化的来源不导航、不写文件、不回填draft；取消零导航。保留直接array picker API兼容，不加入第二套持久读取器/执行器。阅读参考active-branch/entry-ID/disposal决策后，本仓沿已有owner增加明确stat版本准入，实际draft仍来自原导航成功回读。
- 修正真实trust夹具后，两条host回归在原`4dccf94a`源码均实际AssertionError，原始fixture失败另存；独立审查实际复现并修复active-path缺失消息漏项，该回归先失败后通过。最终8文件223项、six effective AssertionError反转/hash前后一致、scripts157和静态门通过；NormProof exit0/partial、0open/1failed advisory/10proof gaps。反转期间review修复使初次sweep source-change拒绝，日志保留，最终六组重跑绑定。
- build`b9f4ce3848c0e5f3ded5fbfecad0dba201be306d036ff8ed450ff129beb89c55`，inputs`50a677650be71981020ba3f9a5a37974b6f29ec665589e31684773eca034fbbb`，artifact`65a9f00e03c8f4827ae2b5e0b47f383714d552ff067e1b17aae962f4c605e786`，exe SHA-256`8de4964af9783109f230a058d83b7628df55dc129769b7b46a34c474c29a354f`。同build Node/exe regular/fullscreen四格60题PTY全部pass/exit0：无效state明确unavailable、不改坏源；外部新增消息后选择拒绝且leaf保持；重新打开后确认原branch/draft，分页、取消与全部原消息/文件保持。build/源/hash前后相等；原构建中途测试改动freshness拒绝及exe stale拒绝留存后准确重建。证据`.omx/artifacts/phase20-back-binding/`。
- 独立代码APPROVE/架构WATCH，综合COMMENT（无BLOCK）；两报告绑定最终五份生产owner hash。审查lane分别独立编译probe验证不可读/合法空/活跃消息缺失/无关分支容忍、三页原version及exact选择；supplied223项/PTY与reviewer自跑检查分开记录。
- 完整已有navigation还构造所有branch投影，byte/record cap不证明瞬态heap或最长UI响应；stat version是乐观源身份，不是内容hash/跨文件原子快照。本批无新的性能改善声明；source/page性能只属于上批build。剩余undo/restore/cleanse及完整资源/平台/质量验收继续，不关闭PAN-06/47项，35complete/12partial保持。

- 代码批`cdce79a2bccbda032c8d2256ae309584f2da0355`已commit/push并读回远端main；精确CI`39951053368`/job`120405317114`completed/success，12:08:09Z–12:25:47Z，Watch`39951053367`success。仅绑定该SHA。

## 2026-10-23 PAN-06 back 来源与页面生命周期（`4dccf94a`已推送；CI/Watch success）

- 原`/back` opening捕获问题、原branch/navigation owner、完整raw prompt/ID/dropped、25项分页和全文搜索保持；新增source owner在构造候选及多模态join前计量：50,000来源turn、20,000候选、50,000 recorded non-context user content parts（有ID）、32Mi UTF-16 code units含ID/文本/分隔符。超限整份列表明确拒绝；同query匹配引用缓存跨页共享，取消/确认/交接释放原source/offered引用且旧页面一次消费。numeric literal ID先于ordinal，重复候选ID拒绝。
- registry在原session/config admission及signal许可后才调用既有sessionTurns；picker枚举及load/apply重验原准入。无新导航writer、模型消息或文件撤销路径，成功草稿仍来自原owner的实际持久回读。source限额是访问候选的边界，不是heap或原getSession整个文件读取的边界。
- 新六组用例在原代码均实际断言失败；最终7文件201项通过，11隔离反转均exit1/AssertionError且生产/测试hash恢复相等，恢复后12项通过；scripts157及cycles/config/declarations/Node-floor/docs严格门通过。NormProof exit0/partial、0open/1failed advisory/10proof gaps；source与rewind均在职责上限内，registry既有property callbacks未增加，advisory工具仅识别3个顶层声明。
- 固定2,500问题/10,240,000文本units/每题820逻辑行/30同Node warm调用，历史不可变build`3a6e68d86cda…`与本批`286e04001d95…`：99次续页总p95 708.70→1.33ms，构造加load p95 1.71→0.64ms，完整search p95 5.62→5.46ms；process peakRSS207,500/120,684KiB含fixture/imports/全操作，非瞬态heap。脚本/source/artifact前后hash相等；不声明max cap/fresh-process/exe统计性能。
- build`286e04001d95674d83a24b0a4ebacac971d9d544f53775fd751b9949152fd8da`，inputs`8ab79e0bc0ebae082f578ad9c1176cb156572e6c1ae26bdec5e215820d8894e7`，artifact`e803a55811e4eb36feeadd99c2457c261a994189640a1de35bfdddcab760987d`，exe SHA-256`6a779af96426236c6b59cb09f27250a8a2986988ee9076a074ddb323faaa0c1e`。同build Node/exe regular/fullscreen四格60题PTY全部pass/exit0：三页到头、取消保持leaf、exact/numeric focus、确认才原branch+draft、全部原消息/工作区字节保持。首轮exe/fullscreen等待重复footer超时保留；raw输出含目标页，probe改为等待title/question并保留最终leaf/draft断言后四格重跑通过。证据`.omx/artifacts/phase20-rewind-boundary/`。
- 独立代码APPROVE/架构WATCH，综合COMMENT（无BLOCK）；两份报告逐一绑定三份最终owner hash。reviewer独立真实Overlay关闭/捕获分页/一次消费/准入/多模态界通过，并以300个混合role/context/multimodal用例逐项对照原构建；supplied测试/PTY与独立probe分开记录。
- 剩余边界：原sessionTurns的getSession失败仍可映射空列表；构造前完整会话读取、打开时持久文件version、完整query同步/临时case-folding和heap仍待下一批。不以本批关闭PAN-06或47项；35complete/12partial保持。

- 代码批`4dccf94afe71d5bcf38710cd507ae0fcdf6aaf50`已commit/push并读回远端main；CI`39949109526`/job`120398929588`completed/success、11:52:04Z–12:19:19Z；Watch`39949109534`/job`120398929821`completed/success，11:52:04Z–11:52:24Z。仅绑定该SHA。

## 2026-10-23 PAN-06 复制来源与取消后派发（`c4cb2834`已推送；CI/Watch success）

- `/copy` 使用原 `Transcript` 来源和原剪贴板命令；打开只捕获 revision，admitted load 才枚举来源。每 opening 最多20,000个块及32 Mi UTF-16 code units（原文与label合计；不是heap bytes），超限明确拒绝，不截成成功。保留earlier来源、全文搜索、精确ID和原文；续页共享一个完整源快照及一个query匹配引用缓存，关闭/成功/交接使旧页不可复用并释放引用。摘要与复制行计数不再split全文成数组。
- picker 的load/apply检查原session/config admission及signal；原文revision拒绝在同owner的真实 `InteractiveMode` 仍显示，换owner的迟到结果不回填。原剪贴板owner在终端offer前、每个fresh native fallback前和最后失败后重验；已经派发的成功仍为copied，终端offer保持offered，取消/blocked不能授权下一次程序派发。双系统单候选回归覆盖最后失败，不声称已派发动作可撤回。
- 最终8文件205项通过；result-contract 6套158项、scripts157及静态门通过。11组实际AssertionError反转绑定最终四份生产源码hash并保持字节不变；首次新增取消/准入用例在原代码3项失败。独立代码APPROVE/架构WATCH；复核发现并修复同owner拒绝提示被吞、异步fallback取消后继续派发及单候选末尾状态遗漏。反转首次扫描期间源码因这些修复变化，hash guard拒绝计为最终证据；最终重跑已绑定。
- 固定2,500块、10,240,000源码units、每块820逻辑行，历史不可变build `de428d7ffd2d…` 与最终同机同Node各30次warm调用：24次续页总p95由222.66ms降至0.76ms，load p95由4.04ms降至0.88ms；最终search p95 6.59ms。无冷盘/fresh-process/exe分布声明；process peakRSS213,252/113,348KiB包含导入/fixture/全部调用，非瞬态heap峰值。脚本/生产源码/compiled artifacts前后hash相等。
- build `3a6e68d86cda3b90d0f0ea0a48adacc0c81ad030ff5d8dbcd04d82d621e434a9`，inputs `4a1ed9fe8734fd78c10a2d574025ca47e741e813ce34031a2a005bbd899e5b0c`，artifact `35fe5e1b744fd64992c68108cc6b202217ed80f347510244b7353f267c5a6f6f`；exe SHA-256 `d051a88ec2db59d9048487370944edfc48c08c1e300bf4ad6d3acbaf5872abd4`。同build Node/exe × regular/fullscreen四格copy专用PTY pass/exit0，205原block完整三页及全文到最旧源、取消零clipboard、精确原文OSC52、原branch/工作区/205原消息保持；不声称真实系统剪贴板接受。证据 `.omx/artifacts/phase20-copy-boundary/`。NormProof exit0/partial，0 open、1 failed advisory、10 proof gaps。
- WATCH：参考选择器的dispose和一次完整history成本边界已作只读比较；本仓保留完整分页可达及原copied/offered/unavailable状态。完整query仍同步扫描admitted text，临时大小写字符串/clipboard encoding和宿主已有transcript内存不是该source cap的heap保证；copy本批不扩大为全PAN-06闭合。矩阵仍35 complete/12 partial；其他导航消费者、真实系统复制与全阶段交付继续原范围。

- 代码批 `c4cb28347313178f140849812139113ac78bb2ff` 已提交、推送并读回远端 main。CI `39946998111`/job `120391995287` completed/success，11:34:20Z–11:51:42Z；Watch `39946998109` completed/success，11:34:16Z–11:34:39Z。状态只绑定该SHA。

## 2026-10-23 PAN-02/PAN-06 树面板重复渲染（`3eed364f`已推送；CI/Watch success）

- 原 `renderPanel` 每次焦点按键重新测量完整候选label。现 `OptionModel` 在候选/过滤应用时递增revision，panel以WeakMap保留三个数字（revision/longest/measured），焦点移动复用；饱和后停止扫描，扩大窗口后继续，same-array刷新也失效。保留原全局详情列对齐，未改成随viewport漂移。参考的visible-window渲染决策用于避免每帧catalogue工作；当前初次/过滤/展开仍单独评估。
- 恢复后7文件203项、scripts157、静态门、build/exe、diff check通过。六有效AssertionError反转（复用、候选revision、filter revision、饱和、resize续测、详情列位置）均恢复原hash；详情非空、明确列起点和fresh filtered oracle防止伪等价。独立代码APPROVE/架构CLEAR，综合APPROVE；审查另60,000次width公式随机对照通过。
- 固定20,000节点saved chain的实际 `treePicker+OverlayHost`，120×40、同Node进程30次交替Up/Down加render。历史build `8e2c15e28017…` p50/p95/max为172.12/203.02/287.96ms；最终build `de428d7ffd2d959f38a913bd8770dec99ab1c7c97cbf201e7f4b965623c3be7f` 为3.34/8.38/18.16ms。load210.86ms、完整尾部search24.69ms、close0.28ms均仅一个observed call；processPeakRSS207,032KiB含导入/全部调用，非瞬态heap。每份script/source/artifact前后hash相等；未声明冷盘/fresh-process/exe性能分布或完整byte-tier资源完成。报告 `.omx/artifacts/phase20-resource-measurements/panel-{baseline,final}.json`。
- 最终inputs `e1a86ca2ee2a2a7d31ca07277981f8fd34e174ac76a96833801a46f99775e3a2`、artifact `95d807819c210aa05fe7af93fe899e3186ab6123efc6c4ef57d574d3ad054e1e`、exe SHA-256 `a9caef548956536606a0260a882c61ca69ac0077828f4c797006733fb2cfbca2`；Node/exe regular/fullscreen四格全部pass/exit0。证据 `.omx/artifacts/phase20-panel-de428d-{node,exe}-{regular,fullscreen}/`。补测试后首次两格build freshness拒绝保留，重建后通过。NormProof exit0/partial，0 open/1 failed advisory/10 proof gaps；矩阵仍35 complete/12 partial，PAN-02/PAN-06不因本批完成。

- 上批 `3eed364f04fb9b82f45d17f0fe2b94aba827b15b` 已从GitHub读回：CI `39938115685`/job `120362573820` completed/success，10:18:07Z–10:29:07Z；Watch `39938115906` completed/success。仅绑定该SHA。

## 2026-10-23 PAN-02/PAN-06 深树终端与摘要资源增长（代码批 `47b4f300` 已推送；CI/Watch success）

- `/tree` fallback 与 `/history` 共用 `cli/output/navigation.ts`：最多20,000条body行、16 MiB UTF-8 body，显示缩进最多10层加明确深层标记；完整entry ID/label/current/unavailable保留，持久树depth/parent不变。嵌入CR/LF/U+2028/U+2029行字段拒绝为unavailable，不截断成成功；实际20,000链与multiline保存ID同时验证两个caller及保存字节保持。
- 原 branch_summary 每次spread累计messages，长尾compaction每次slice/spread；现在branch直接append，compaction使用顺序消息tail窗口与反向checkpoint前缀，最后一次flatten。丢弃前缀至少占buffer一半才copyWithin回收；累计移动可归于已丢弃消息，不重复复制长尾。undefined/空summary、timestamp、kept/reset及旧fractional/Infinity兼容保持；180递增参考前缀及独立37,500随机前缀一致。源准入夹具20,000节点+30,000 branch/compaction记录、50,000物理行均保持原文件。
- 反转恢复后10文件155项通过（projection5），scripts157、静态门及build/exe通过；七有效AssertionError反转并恢复hash：indent、rows、bytes、line boundary、branch copy、compaction copy、reclaim。首次indent反转只触发预算Error，追加明确not.toThrow assertion后才计有效。独立代码APPROVE、架构CLEAR，综合APPROVE；此前discarded-prefix retention WATCH已由回收及40批/400移动引用回归解决。
- build `8e2c15e28017f75a95134dfe458dbd3406e221529ea7fb239c8dc7abab040f9b`，inputs `bc7d8bc81e8294db2e1860f7339a838e7c405fb85ad6fd4e4ec9d1c1a26294d9`，artifact `267fc962f917a2627871b6a9edb8972aa8739d9fe50993e756f69e6fbd927520`，exe SHA-256 `42867873e0511a6ac06a4f83d7a1eff4f86605a737f135c160e27fd7abc5dcaa`。同build Node/exe regular/fullscreen四格pass/exit0，tree/catalogue/管理/stale-choice业务链通过。首次exe fullscreen保留query前第二行焦点导致first=00假设超时，harness读实际identity逐步Up至00再逐Down验证；失败保留，未改产品焦点。证据`.omx/artifacts/phase20-resource-synchronized-{node,exe}-{regular,fullscreen}/`。
- 资源测量绑定同build compiled Node模块，固定isolated fixture在child外准备；parent/child脚本、所有源文件与compiled artifacts前后hash相等。9组每组30次同进程调用/强制GC，普通链、30k branch与30k保全tail checkpoint分别测acquisition/tree/history。body输出由历史400,597,883/873 B降至1,097,729/719 B；最终acquisition p95为212.73/245.53/255.59ms，tree/history p95范围227.04–394.59ms，整个30-call child peakRSS范围236,704–307,676KiB。每次6个descriptor read、实际源bytes4,164,940/7,772,728/7,862,732。peakRSS含imports/全部调用，heap只是阶段保留值；并非瞬态peak heap、冷盘、fresh-process分布或exe性能证明。
- 历史build `1420dbb8c480…`仅9组各一个observed call，branch/checkpoint acquisition为20,303.92/27,709.43ms；无baseline p95/统计内存改善声明。早期未绑定脚本及夹具重写/脚本中途修改被version/hash保护拒绝的尝试保留，最终frozen baseline与reclaimed报告前后hash均相等。证据`.omx/artifacts/phase20-resource-measurements/{baseline,reclaimed}-summary.json`。9非文档输入冻结读回在resource-delivery；真实全屏interaction/search/render峰值、取消响应、完整catalogue累计I/O和其余PAN-06消费者仍缺，PAN-02/PAN-06与47项矩阵保持partial。

## 2026-10-23 PAN-02/PAN-06 保存管理动作准入（代码批 `4942064c` 已推送；CI running/Watch success）

- rename/delete/pin 复用原 lifecycle owner：准备前、异步目录解析后和原锁内写入前重验实际 surface/configuration 权限；带参数的 `/pin` 与 scripted rename 也捕获同一配置准入。已关闭、pending stop、停机或权限撤销拒绝迟到动作，保留保存字节和当前身份。
- direct delete/rename 的 preview 仅消费一次；取消使旧 preview 和 title editor 失效，合法 parent→editor 交接保留准入。参考选择器的取消清除目标与 disposed 后拒绝迟到结果决策；本仓库继续使用现 writer/lock，不另建持久状态。
- 受影响6文件196项通过，六有效反转均实际 AssertionError 并恢复 SHA-256：surface、locked admission、delete cancel、editor cancel、scripted rename、scripted pin。反转恢复后3文件51项通过；scripts157、syntax、cycles/config/declarations/Node floor及要求矩阵通过；NormProof exit0/partial，0 open/1 failed advisory/10 proof gaps。独立代码 APPROVE、架构 CLEAR，综合 APPROVE，只覆盖本批管理动作。
- build `1420dbb8c4801999484096de9c11a9bcfbdc60a56df9e6499a6a52e9ce1d42e1`，inputs `2c325e9677ca10c0ff9d8f73c5030c75bdd81f101666d791707d9bb9ddafd39e`，artifact `b2f2a4e426ad6861b7d2f05ad158476a7096341486a356cc6b9d8d59a98b1239`，exe SHA-256 `cc3165dc2acf2e66694f5f2f5ae6f54d3f03b0865dfdcc4d06a5835783ff8f60`。同 build Node/exe × regular/fullscreen 四格 pass/exit0，删除取消 hash 不变、改名 editor 交接/写后 title 读回及对话/当前会话字节保持；tree、45匹配/固定40行目录续页及四种 stale choice 回归通过。证据 `.omx/artifacts/phase20-management-complete-{node,exe}-{regular,fullscreen}/`。
- 首次 exe regular 批量方向键检查超时，改为逐行等待实际 Identity 与 next-page 焦点；rename probe 等待可选择动作行和 target ID 后再确认。最后一次 build 后缺 verified exe 的两项 preflight refusal 保留，重建 exe 后四格通过。scripts 首次旧 PTY relay 重复输入造成 EPIPE，未改该测试，原套件重跑157通过；保留失败分类。交付输入冻结及读回在 `.omx/artifacts/phase20-management-delivery/`，PAN-02/PAN-06 和47项总矩阵仍 partial。
- 代码批`4942064c3129ae9c48b2cb0ad4b8cac39f04aa74`已推送，远端main精确读回；CI`39931286844`/job`120339906621`最后读回in_progress，2026-10-23T09:21:40Z开始，前13步success、tests运行中；Watch`39931286854`completed/success。间歇GitHub API EOF不升级CI状态，两项只绑定此SHA。

## 2026-10-23 PAN-02 完整授权目录与固定页（代码批 `d5e18253` 已推送；CI/Watch success）

- 原 search 在 newest 10k 之后过滤，完整 scan 仍可能将旧匹配报告为不存在；More 累加到10k即停止。现在原 catalogue 在scope/reentry/query过滤后保留最多41个排序候选，另保留matching current；输出最多40条普通行加current，cache512、diagnostic samples32、discovery16/64、concurrency4不随目录条数累加。
- 固定页续接绑定session、normalized project、allProjects、query、page size以及原pinned/time/ID边界与exact source version；仅scan结束且anchor后二验后发布。下一页前后二验原anchor，变化/丢失要求reopen。每页是live rescan，不能证明冻结目录；新增/重排行落在前页范围时需刷新。complete表示扫描结束，partial源不宣称no-match或已到头。
- query-clear停止continued base并推进generation，迟到订阅不能恢复旧页；scope/query/local pin重新从首批获取；原previewEnd释放，accepted选择先捕获target/version再释放请求/maps。action:more/action:refresh位于合法saved ID字母表之外，实际saved IDs more/refresh仍可恢复。current首帧/原writer/锁/版本准入保持；排序提取后保留原invalid-date回退语义。
- 受影响8文件128项与原consumer6文件195项通过，scripts157、静态门与build通过；五有效反转均实际AssertionError并恢复hash：过滤前置、final-only cursor、anchor、query-clear subscription、action ID。独立代码APPROVE/架构WATCH，W6整体仍partial。
- 最终排序兼容集合3文件80项通过；13个非文档输入hash读回相等。build `eec8d50d5356ec02122c00c9a565f620d30cc82131e391bb9315d33d287f388a`，inputs `05b61ddae181911b4c13df3b0a08edf1e233f00b6d81a5ee92a4aac739f7ac4a`，artifact `a8742320eca8be94d329c025078145c92be19c876f38bed61713b518264dcd0e`，exe SHA-256 `498d4a2caff7dd32b3eaafb25d9e52a67022eeba153a6833403691c4e20f5b5f`。Node/exe regular/fullscreen四格在同一build重验pass/exit0：45条真实chooser查询、40条首批、第二页和取消保存hash不变，同时回归四种stale choice、tree与既有业务链；证据`.omx/artifacts/phase20-catalog-order-{node,exe}-{regular,fullscreen}/`。首次旧narrow footer断言失败已分类为explicit end状态覆盖footer的旧预期并保留log，未改renderer。代码批 `d5e18253081fa59a513f422ba621dc5d122485b6` 已推送并精确读回；CI `39923165586`/job `120313029789` completed/success，08:13:41Z–08:31:01Z，937文件/9,986项通过、3项跳过、949.74s；Watch `39923165752`/job `120313030605` completed/success。两项只绑定该SHA。

## 2026-10-23 PAN-02 tree 表单与有界获取（代码批 `a0a38886` 已推送；CI/Watch success）

- /tree 复用现 full-screen panel 的宽屏详情列与窄屏 Preview；TreeModel 只持有显示展开态和 parent/end 索引，Left 为 collapse/parent、Right 为 expand/child。搜索完整 admitted 节点文本，临时穿透折叠而不清除展开态；稳定 current focus、未展示节点不 apply、取消和已接受选择释放保存投影，重复 pending 选择零动作。fork/history 保留原动作表面。
- 每次打开上限先冻结再实现：metadata 256 KiB、state 8 MiB、transcript 16 MiB，合计24.25 MiB源文本；20,000个树节点、50,000物理transcript行、1,200字符详情摘录。原 descriptor reader 在 open 后再次校验字节/UTF-8/identity；catch-up 在构建前比较既有与缺失节点总数，context summary 不算新节点。上限不代表已测heap或时延，超限报告 unavailable。
- bounded acquisition 拒绝损坏/未知provenance transcript、重复event ID、重复树ID及catch-up之前缺失的named active leaf；修复display edge的cycle/orphan仍显示disabled。原普通replay兼容与writer/lock保持。path改为push/reverse，深20,000节点验证不调用unshift。
- 聚焦11文件261项、脚本157项、cycles2,777文件零runtime/type、config53/53、declarations18/18+11/11、Node floor、strict docs/diff check通过；NormProof exit0/partial，0 open/1 failed advisory/10 proof gaps。独立代码APPROVE/架构WATCH，synthesis COMMENT；source bounds不是性能完成证据，既有overlay callable count23未增加。
- 七组有效反转均实际assertion failure并恢复字节：collapse、full search、preflight size、descriptor size、damage warning、catch-up cap、accepted-choice cleanup。首次pending cleanup反转只触发timeout，不算有效，追加accepted-choice assertion反转后七项闭合。
- build `2e2164f27b2d607cd1ebd6ec79e7b3d0820bb7ffcd0bbdd00054b74a69c988b8`，inputs `a93860d273b99e8552874a7d6fff2a214a15386cbd9fecbc52a4560214cd8abf`，artifact `1fa6c1f273594c629992f39d374a958978aa9c6b13a15f2361bc623101ee5521`，exe SHA-256 `cf40e424983d55b82f1629d77a85b2771faf7d0ac877f994a6616e9736591b61`。Node/exe × regular/fullscreen四格pass/exit0，tree details/keys/search/cancel与四种stale selection均取证，保存文件hash相等。证据 `.omx/artifacts/phase20-tree-2e2164-{node,exe}-{regular,fullscreen}/`；node regular成功retry另在后缀`-retry`目录。旧失败保留：两次harness误将collapse/parent和expand/child合一步；一次源码反转中运行导致build freshness拒绝；一次Node启动读取build transaction失败，单格retry通过。
- 最终完整 `test:ts` exit0，935文件通过/1跳过，9,955项通过/10跳过，825.94s；采用现有Vitest环境变量限制为两worker，测试后17个非文档输入SHA-256全部与冻结快照相等。代码批 `a0a3888697dc669c32807bc9cbe0bd4c05728651` 已推送，远端main精确读回；CI `39919466867`/job `120300924977` completed/success，07:41:36Z–07:58:43Z，935文件/9,962项通过、3项跳过、939.96s；全部步骤success。Watch `39919466951`/job `120300925354` completed/success，两项只绑定该SHA。PAN-02保持partial：上述admission是源/记录上限，累计同步I/O、peak heap、交互响应与全部目录/动作合同未闭合。

## 2026-10-23 PAN-02/PAN-06 保存选择边界（代码批 `2e68fd54` 已推送；CI/Watch success）

- resume/tree/fork/history 绑定实际展示时的 session ID、完整保存版本和原 admission；resume 在异步解析后及原 state lock 内重验，fork 在创建新目录前重验，tree 导航在 summary 后的原 writer 边界重验。分支 A→B→A 也使旧选择失效。
- 导航比较 metadata/transcript 版本及除 usage/requestLedger 外的完整 state；实际 summary usage sink 的记账保留且不误拒绝自身计量，外部 transcript/state 修改仍拒绝。
- 原 interactive owner 将 stop/closing、取消 revision、aborted controller 传入选择 admission，自身 command busy 不使合法选择失效。激活开始后的 writer/lock-cleanup 错误分开报告：精确文件版本与只读 registry 读回一致时采用目标并显示警告；无法验证时保留旧 runtime 并阻止继续操作。两者均不自动执行恢复任务，不暴露原异常正文。
- 独立代码审查 APPROVE，架构 WATCH，无剩余阻断；WATCH 为既有职责上限及本批不闭合的 tree/资源范围。已有 drag/copy 的 42 项测试按 HEAD 原字节恢复，新生命周期用例独立放置。
- 受影响集合 24 文件/398 项通过，新增 registry 三分支只读/普通修复合同 3 项通过；result-contract 6 套/158 项、脚本门 157 项通过。六组有效反转均实际断言失败并恢复原字节：resume offered version、tree stale、summary fence、surface lifetime、read-only registry、publication-start。
- TypeScript build `e76a93d26bea083712065ebc14af837f8508b67bd5e6aef7d04d1e4f336e05d2`，inputs digest `cbc141ffb6843cc105a2fefd8f5ac210b3f69df36d1fe5461bbc88cbe5aa05f5`，artifact digest `5ccaf5f041fd7129e547b4ec66578925fbbc2d47cf955eb3a28e8fa49385b4c8`，exe SHA-256 `efaed6e1c5a5d86ff6f62043c3fbe823d0cd4f8f1712a6371b0f7ecd1414e7a9`。Node/exe × regular/fullscreen 四格全部 pass/exit 0，每格拒绝四种过期选择并记录注入后 metadata/state/transcript/current pointer 的 SHA-256 不变，同时保留合法恢复、数学源复制/导出及既有业务链。证据目录 `.omx/artifacts/phase20-selection-e76a93-{node,exe}-{regular,fullscreen}/`。
- cycles 2,773 文件/零 runtime/type cycles、config 53/53、declarations 18/18与11/11、Node floor、strict docs 与 diff check 通过；NormProof exit 0/partial，零 open obligation、一个 failed advisory obligation及10个 proof gap，既有 ceiling 不改写为通过。首次误写不存在的 tgz 版本导致 ENOENT，改用仓库实际 `normproof-0.1.0.tgz` 后运行通过，未修改门禁。
- Node/exe × line/pipe 另四格全部 pass/exit 0，仅回归既有命令、工具发现、任务与审批链，合计 Linux 八格通过。旧失败保留并分类：并发 executable build 的启动拒绝是构建调度；误将 `/resume panel` 报告面当选择器导致两格超时是 harness 入口错误，改用裸 `/resume` 后上述四格通过。
- 首次完整 `test:ts` 实际失败：930文件通过/3失败/1跳过，9,931项通过/5失败/10跳过，535.64s。五项均位于三个浏览器CLI scenario文件，超时或缺预期输出；隔离重跑结果见下一项，不能将此轮记为通过。
- 上述三个失败文件保持代码/断言不变，以 `--threads=false` 单独重跑3文件22项全部通过，163.95s；定位为并发负载下CLI子进程/超时失败。最终全量用 Vitest 现有 `VITEST_MAX_THREADS=2 VITEST_MIN_THREADS=2` 控制执行并发，未修改 package scripts/build/测试超时或断言；最终全量 exit 0，933 文件通过/1 跳过，9,936 项通过/10 跳过，877.36s。
- 本批不将 PAN-02/PAN-06 改为 complete。最终完整测试已通过。代码批 `2e68fd54e2552121e41cf3044a06a2476146c086` 已推送，远端 main 精确读回；CI `39914569820` completed/success，933 文件/9,943 项通过（3 项跳过，917.30s），静态/脚本/构建/完整测试/NormProof 步骤均 success；Watch `39914569843`/job `120285089017` completed/success。CI job `120285088911` 后续读回 completed/success，06:56:18Z–07:13:00Z；先前 job 字段延迟现已同步。

## 2026-10-23 RENDER-01 数学 token、显示边界与打包导出（代码批 `5150a635` 已推送；CI/Watch success）

- `presentation/tui/transcript/math.ts` 现在拥有有界 math finder：代码 span、escaped dollar 和金额优先，未知/缺参数命令使整个公式回原文；`equation*`/`align*`/`gather*`/`multline*`/`cases` 与五种矩阵环境按行投影，nested 环境、12 行/12 列/64 cell/24 行/64 KiB 超限均保留完整源码。
- `presentation/tui/text/inline.ts` 在 code span 之后、link/emphasis 之前把数学作为 opaque token 处理；`$a*b*c$` 不会被当成强调，公式内 Markdown link 不会生成 OSC8。`markdown.ts` 与 `session/export/htmlRender.ts` 共用同一 finder，HTML 对投影文本再次转义，`template.ts` 以 `white-space: pre-wrap` 保留矩阵行。
- 裸 `\begin{...}` 由共享 scanner 识别为一个 math node，完整环境保留给投影和源复制；未闭合 opener 在逐字 stream 中立即显示，闭合后才投影。完整 matrix node 的 selection 通过 `block.raw` 返回原始 LaTeX。
- 聚焦 6 文件/158 项通过：math 8、markdown 59、source 20、HTML 40、template 10、export runtime 21。三组有效反转均实际失败并恢复：移除 opaque math token；HTML 改回 scalar conversion；恢复 partial unknown-command projection。
- 完整 `test:ts` 为 931 文件通过/1 跳过、9,905 项通过/10 跳过、359.32s。`test:scripts` 157/157；Node/exe × regular/fullscreen 四格打包 PTY 全部 pass/exit 0，验证 math 投影、`/copy` 原始 LaTeX、`/export html` payload，fullscreen 还验证矩阵行和旧/新 diff 源复制；Node/exe × line/pipe 另外四格 pass/exit 0，只回归既有业务链。
- TypeScript build `99e27b71db4bd5f9bf17edceec5e433bda2a058a9b836fd173a04e38f38e41f4`，inputs digest `616922d083cfdb4aab69b2f2c95467ec1332e3c4ea7f05f6b26d1a9661d08b87`，artifact digest `f30da6af85545cf13a7915e064679aa0d84ce95e25d3bd7bf2ad78798599cac8`，executable SHA-256 `506d47a52a7572a5e2589f0a4271bf6b43c26cfd5c4d899c9228341e816d7a49`。证据目录 `.omx/artifacts/phase20-render-math-pty-99e27b71db4b/`。
- 当前矩阵为 35 `complete`/12 `partial`/0 `open`。代码批 `5150a63590275f76ff497e1b40a88fd928201d4a` 已推送；CI `39905250082`/job `120255608099` completed/success，全部步骤 success，05:20:55Z–05:32:36Z。Architecture Watch `39905249968`/job `120255607874` completed/success；两项结果仅绑定该 SHA。本次重新从 GitHub 读回结果，修正此前未提交/CI pending 的过期文字。

## 2026-10-23 RENDER-03 大 diff 完整查看与 RENDER-02 CI 稳定化（代码批 `9250632d` 已推送；CI/Watch success）

- `presentation/tui/transcript/diffPage.ts` 现在拥有 400 行/64 KiB 的源页预算、精确 UTF-8 边界和跨页 old/new 行号状态；`diff.ts` 在 `split` 前先按双预算扫描源，左右源选择的分界改为两内容 cell 之间的 divider，`diffLines.ts` 承接 header、EOL、byte 和终端安全显示辅助。
- `chrome/pager.ts` 对超出 inline 预算的 diff 打开有界完整阅读器，支持 PgUp/PgDn、滚轮、Home/End 和分页续行；`surface/pane.ts` 将 pointer 的 content 坐标映射回 screen 行，修复填充行/滚动窗口下的源复制。`source.test.ts` 与 `paneDiffSource.test.ts` 已改为只通过 `screenToContent()` 传入 selection。
- `markdown.test.ts` 的超链接断言现在先快照并固定 `defaultTheme` 为无颜色模式。该 CI 失败已用 `FORCE_COLOR=3` 本地复现：颜色 SGR 位于 OSC8 label 内，旧断言错误地要求 open/label/close 连续。
- 聚焦 9 文件/199 项通过。三组真实反转均取得断言失败并恢复：移除有界源扫描使零宽超预算 diff 不再出现截断标记；恢复旧内容分界使左右源复制返回 `new line`；移除 content-to-screen 映射使两侧源复制返回 `undefined`。产品文件 SHA-256 已逐项读回恢复值。
- 完整 `test:ts` 为 931 文件通过/1 跳过、9,893 项通过/10 跳过。`test:scripts` 157/157、cycles 2,771 文件/0 runtime/0 type、config consumers 53/53、declarations 18/18 + 11/11、Node floor、strict docs/rules 与 `git diff --check` 通过；NormProof exit 0/partial，0 open obligations、1 failed advisory obligation、10 proof gaps。
- TypeScript build `69952ded38bf2b30096cb18b8d3470972aea0d7f8e6682ea1ac3865b92d7c6f2`，executable SHA-256 `09e49dd189a22a2b1e2bd263c3f0339df54747122962a99a11be572a8e518c54`。Node/exe × regular/fullscreen 四格打包 PTY 全部 pass/exit 0；两份 fullscreen raw output 的 OSC52 payload 解码后均精确为 `qa-old-side-source` 与 `qa-new-side-source`。证据目录 `.omx/artifacts/phase20-render-diff-pty-69952ded38bf/`。
- RENDER-02 的精确提交 CI `39894148326`/job `120220534823` 为 completed/failure：929 文件通过/1 失败/1 跳过，9,889 项通过/1 失败/3 跳过；失败项就是上述 hyperlink 断言，并非 viewport 行为。该失败 run 保留。
- 代码批 `9250632d9946295d55215dc9941959174abb3af3` 已推送，远端 `main` 精确读回同 SHA。CI `39898564931`/job `120234580498` 为 completed/success，耗时 17m06s；完整测试 931 文件通过/1 跳过、9,900 项通过/3 跳过，静态门、脚本门、构建、Chromium 安装、完整测试与 NormProof 步骤均 success。Architecture Watch `39898564927`/job `120234580519` 为 completed/success。两项只绑定该代码 SHA。`verify:phase20-requirements` 更新为 34 `complete`/13 `partial`/0 `open`，RENDER-02/03 闭合，Phase 20 整体仍为 `partial`。

## 2026-10-23 RENDER-02 OSC8 与打包源复制（前序本地代码批；后续结果见顶部）

- `presentation/tui/text/link.ts` 现在由单一策略校验 terminal/HTML 共用链接目标：只允许 `http`、`https`、`mailto` 和无 scheme 相对目标，剥离 C0/C1 控制符，拒绝 `javascript:`、`data:`、`file:` 等可执行或本地文件 scheme。可见 URL 与 OSC8 目标都先经过该策略，恶意 BEL/ESC 不能闭合或改写终端超链接。
- Markdown link label 通过 OSC8 投影；ANSI-aware 软换行会在每个物理行末关闭仍打开的 hyperlink，下一行由原 escape prefix 重新打开。表格 cell 在填充前再次封闭未完成 hyperlink，因此边框、padding 和后续列不会被链接污染。
- `session/export/htmlRender.ts` 改为复用同一 URL 策略，不再维护第二套允许列表。源复制仍绑定原始 Markdown source：表格 row 显示 OSC8，但完整 source selection 返回原始 `[label](url)` 字节。
- 聚焦 6 文件/144 项通过。两项隔离反转取得实际失败：移除 scheme guard 使 unsafe 用例把 `javascript:` 写入 OSC8；移除逐行关闭后，长 label 的首个换行行不再包含 hyperlink close。产品源码已恢复。
- 最终完整 `test:ts` 为 930 文件通过/1 跳过、9,883 项通过/10 跳过、382.96s。`test:scripts` 157/157、cycles 2,768 文件/0 runtime/0 type、config consumers 53/53、declarations 18/18 + 11/11、Node floor、strict docs/rules、`git diff --check` 与仓库 tgz NormProof exit 0/partial（0 blocking、11 项既有 ceiling advisory）通过。
- TypeScript build `bebadefb62b754b0f8d3aed2ada99271c2de536c615bfb519e0178d816050cfb`，executable SHA-256 `a260a038354d02c91df0d15afec50f6ef9af664707550bdbc7f8a683cfd80722`。Node/exe × regular/fullscreen 四格打包 PTY 均 pass/exit 0；四份 raw output 都含目标 OSC8，`/copy` 的 OSC52 payload 解码后均为 49-byte 原始 Markdown source。证据目录 `.omx/artifacts/phase20-render-link-pty-bebadefb62b7/`。
- 本批当时只把 RENDER-02 的本地、完整测试、构建与打包证据闭合；后续 `9250632d` 批修复 CI 断言并完成矩阵更新，最终状态见顶部。

## 2026-10-23 浏览器响应预算错误优先级修复（代码批 `7262c80f` 已推送；CI/Watch success）

- 证据文档提交 `eedd737028f139c587670ded008717c8eeecc000` 的 CI `39889803714`/job `120206584567` 在完整测试第 634 秒失败：`src/browser/smoke/request.test.ts` 的 gzip 解压预算用例期望 `unsafe-output`，实际得到 `request-failed`；其余 927 文件通过/1 跳过、9,882 项通过/3 跳过。该提交的 Architecture Watch `39889803712`/job `120206584691` 为 completed/success。失败 run 保留，不记为通过。
- 同一代码 SHA 的上一轮 CI `39888154616` 已成功，说明该失败不是稳定功能回归；但新增 `core/network/body.test.ts` 用解压后超预算并伴随 decoder cleanup error 的确定性场景复现了真实竞态：原实现会把 `response_limit` 覆盖为 `invalid_response`，最终投影为 `request-failed`。
- `responseBody()` 现在记录预算已越界这一终态事实；decoder cleanup 与 `pipeline` 收尾不得把该终态降级为通用解析错误。未越界时仍按原合同把损坏压缩流归一为 `invalid_response`，且不泄露 decoder 诊断。
- 聚焦验证 44 项通过：body 回归 1、connection/response 20、browser smoke 23。`npm run build` 通过，build ID `2899cba44e0c`；`test:scripts` 157/157、import cycles 2,766 文件/0 runtime/0 type、config consumers 53/53、declarations 18/18 + 11/11、Node floor、strict docs/rules 与 `git diff --check` 通过；docs-source 118 项仍为 advisory。仓库 tgz NormProof exit 0/partial，0 blocking，保留 11 项既有 function-ceiling advisory。
- 失败 run 的 rerun 已完成：CI `39889803714`/job `120210780809` 为 completed/success，但只绑定旧证据 SHA `eedd7370`，不证明修复代码。修复批 `7262c80f9386e8d74fe6ddece21d8615b2931ad7` 已推送且远端 `main` 精确读回；CI `39891648409`/job `120212557672` 为 completed/success，929 文件通过/1 跳过、9,884 项通过/3 跳过、947.35s；Architecture Watch `39891648398` 为 completed/success。两项只绑定该修复 SHA。

## 2026-10-23 PAN-03/PAN-05 and RENDER-02/03 rework（代码批 `cd28d8ca` 已推送；CI/Watch success）

- `hubPicker` now rejects old-session applies, stops publishing after a same-id session/workspace rebind, exposes a stale status, and sends command/note/directory/output metadata through the existing report redactor before display. The agents subscriber applies the same rebind fence.
- `advisorPicker` revalidates the exact advisor state on load/apply without doing filesystem reads during render, reports stale state, and redacts checkpoint/note metadata. `btwPicker` redacts retained question/failure metadata. Plan review continues to bind the exact plan version and side questions continue to bind transcript revision.
- Table cells now finish inline Markdown rendering before ANSI-aware soft wrapping. Links and styles that cross a cell wrap no longer leak raw `](` syntax, and line-count budgets use the rendered cell.
- Diff rendering strips CRLF terminators from display and spells embedded C0/C1/ESC controls as text while retaining the original UTF-8 byte accounting. A malicious carriage return or terminal escape cannot execute inside the rendered diff.
- Focused panel tests passed 3 files/65 tests; renderer tests passed 5 files/115 tests; `test:scripts` passed 157 tests. Seven isolated product reversals produced the intended failures: raw hub command text, stale hub apply, stale advisor apply, raw advisor metadata, raw side-question metadata, raw table wrap, and raw diff controls. All source reversals were restored.
- The final source passed the full TypeScript suite: 928 files passed, 1 skipped; 9,876 tests passed, 10 skipped. Import cycles, config consumers, declarations, Node floor, strict docs/rules, `git diff --check`, and repository-tgz NormProof (exit 0/partial, 11 existing ceiling advisories) passed.
- TypeScript build `6e0b5dec32e306689aa3e314ca456f53da5e85fec779859cf85a90306fa16a02` and executable build passed; executable SHA-256 is `0db726b3513d2c20fb7504ae57af04f11d2481d32ccc287703d9757055be21f5`.
- The isolated PTY harness now opens/closes `/hub`, `/agents`, `/plan-review`, `/btw`, and `/advisor` after enabling it, then disables it before the existing synthetic turn fixture. Node/exe × regular/fullscreen all passed 4/4, exit 0, on the build above; the sequence asserts the assistant message count did not change. Evidence is `.omx/artifacts/phase20-panel-pty-final-6e0b5dec32e3/`; intermediate failed runs are retained separately.
- `verify:phase20-requirements` moves to 32 `complete`/15 `partial`/0 `open`. PAN-03 and PAN-05 are now complete; RENDER-02/03 remain partial for OSC8, packaged visual/source-copy, and full-view resource edges.
- Three required `cn:deepseek-v4.1-flash` subagent audits all failed with HTTP 429 after retry exhaustion. No independent approval was obtained, and no substitute model was used.
- Code batch `cd28d8ca662706137f34c281330d455d46eba772` is pushed and remote `main` reads back the same SHA. CI `39888154616`/job `120201145121` completed/success in 16m46s; the CI test run passed 928 files/1 skipped and 9,883 tests/3 skipped in 916.72s. Architecture Watch `39888154776`/job `120201145625` completed/success. Both results bind only this code SHA.

## 2026-10-23 PAN-04 effort and quota acceptance（代码批 `2147cb6d` 已推送；CI/Watch success）

- `picker/thinking.test.ts` now drives the capability-aware effort panel against an exact relay address. The relay's `high: null` mapping disables only `high`; directly applying that disabled level is refused, while `low` goes through the ordinary `/thinking` path and persists only the session preference.
- An unlisted custom model keeps its effort rows actionable but reports every level as `unverified`; applying `medium` preserves the explicit warning instead of claiming support. Duplicate catalogue owners for the same endpoint disable every row as ambiguous and refuse `auto` without writing a session model.
- `cli/runtime/usage.test.ts` now distinguishes a quota payload with no windows (`Account quota windows: unknown.`) from a measured `used_percent: 0`. The unknown case emits no percentage, while the measured zero remains a real `0%` observation.
- The broader acceptance set passed 8 files/149 tests: thinking picker, usage, effort, progress, model target/request shape, panels and pickers. Three isolated reversals produced real failures: dropping endpoint binding changed supported to unverified; mapping an unknown model to unsupported disabled the unlisted rows; mapping a null quota window to zero removed the unknown text. All product reversals were restored; no product source changed.
- `verify:phase20-requirements` now reports 30 `complete`/17 `partial`/0 `open`, with Phase 20 still `partial`. TypeScript build `fae9161112d0`, `test:scripts` (157), import cycles, config consumers, declarations, Node floor and `git diff --check` passed.
- 代码批 `2147cb6d5957441c9295cb5574d45167fee15911` 已提交并推送，远端 `main` 精确读回同 SHA。CI `39878549205`/job `120170060403` 为 completed/success，耗时 12m13s；928 文件通过/1 跳过、9876 项通过/3 项跳过，测试耗时 664.51s，静态门、脚本门、构建、Chromium 安装与 NormProof 步骤均 success。Architecture Watch `39878549170`/job `120170060130` 为 completed/success。两项只绑定该验收 SHA；后续证据文档不扩大产品范围。

## 2026-10-23 PRV-03 Copilot opaque token audience binding（代码批 `0e21c3f2` 已推送；CI/Watch success）

- `core/auth/oauth/copilot/policy.ts` now parses the opaque session token's `tid` and `proxy-ep` metadata. Missing `tid`, duplicate fields, malformed fields, hostile hosts, and explicit empty audiences are refused; a token without `proxy-ep` may use only the native individual default, while business and enterprise accounts require an explicit audience.
- `assertCopilotAccount` binds the parsed audience to the stored connection address before a request can use the credential. The pool's owned-credential path therefore marks a mismatched Copilot member unavailable instead of falling back to a sibling, environment key, or profile key.
- The subscription flow now rejects invalid or untrusted token metadata before persisting a credential, and all Copilot request/readiness fixtures use the native opaque-token shape.
- Added a pool-level reversal test with individual and business origins: swapping either token to the other connection yields `pool-unavailable` with no credential. Disabling the audience guard makes that test fail; restoring it passes.
- Focused PRV-03 set: 8 files/165 tests passed. Broader auth/config/provider/shell set: 72 files/1,054 tests passed on the final rerun; an earlier unrelated `fetch.test.ts` deadline assertion failed under parallel load and passed 29/29 in isolation.
- `verify:import-cycles` (2,764 files, 0 runtime/type cycles), `check:config-consumers` (53/53), `check:declarations` (18/18 hooks, 11/11 factories), `check:node-floor`, `test:scripts` (157), `verify:docs-drift:strict` (118 existing source advisories), `git diff --check`, TypeScript build, executable build, and NormProof exit 0/partial with the existing 11 function-ceiling advisories passed.
- TypeScript build ID `a58dfcd24f10f6ce1bcaf439429c6a74a56f751dd0ed22338b81cefd85057344`, inputs digest `78897a48c56602798fedf02697fed1a08ee384eb3713f0eba5cf641d1687c397`; executable SHA-256 `c60eee11c3750a1adde1a5dd2b03a963674962025b7aa92436764927cb2aa003`.
- 代码批 `0e21c3f2c6d470dc05ab4ce19e3bdd3cbd25c4fa` 已提交并推送，远端 `main` 精确读回同 SHA。CI `39858979177`/job `120104440105` 为 completed/success，耗时 23m25s；完整测试 927 文件通过/1 跳过、9861 项通过/3 跳过，测试耗时 692.18s，静态门、脚本门、构建与 NormProof 均 success。Architecture Watch `39858979216`/job `120104440365` 为 completed/success。PRV-03 remains `partial` because no real account lifecycle evidence was obtained.

## 2026-10-23 PRV-05 auxiliary request attribution（代码批 `9a7e3869` 已推送；CI/Watch success）

- Existing request-ledger and backoff coverage already proves per-credential generation waits, late 429 isolation, pre-reserve and pre-handoff checks, unknown retention, cap enforcement, and no replay of partial/unknown streams.
- `cli/provider/identity.test.ts` now exercises main, delegated, side-question, compaction-summary, and cache-refresh sends against real local HTTP. Each reservation retains its non-secret `credentialId`, rotation-sensitive generation, and purpose; summary/cache tests also verify the committed ledger totals and empty pending set.
- Advisor uses the subagent request path and jobs use the shared parent policy; their existing native HTTP and budget tests remain part of this matrix. Session titles are derived locally from the first prompt and do not create a provider request.
- The auxiliary matrix passed 10 files/208 tests. A loading-time reversal that removed the cache-refresh policy from `sendSentRequest` made the new identity assertion fail with zero reservations; restoring the policy passed 5/5 identity tests.
- TypeScript build ID `7deb2f1e19bbb943a4be88ed67100a4a5989a5eb5a5cb146d00a332d2f97dcb3`, inputs digest `57d8a7007d314082fa7273ee14872560561fda8f6a10eed7b4fd399b3dc56616`; executable SHA-256 `bb2bdc3a82706a044c1ea735a510daaac4ea6b0f5bbf1a84661efb435d3654c1`.
- The required independent reviewer using `cn:deepseek-v4.1-flash` returned `503 Service Unavailable`; no independent approval was obtained.
- 代码批 `9a7e386982577d64c84e970ad3e661d9f329c5bc` 已提交并推送，远端 `main` 精确读回同 SHA。CI `39862167681`/job `120115317655` 为 completed/success，耗时 22m19s；完整测试 927 文件通过/1 跳过、9863 项通过/3 项跳过，测试耗时 673.80s，静态门、脚本门、构建、Chromium 安装与 NormProof 步骤均 success。Architecture Watch `39862167651`/job `120115317662` 为 completed/success。两项只绑定该代码 SHA。
- 证据文档提交 `43454907625facdab29b1683b69371601eff12c5` 已推送，远端 `main` 精确读回同 SHA。CI `39865094007`/job `120125167416` 为 completed/success，耗时 24m09s；完整测试 927 文件通过/1 跳过、9863 项通过/3 项跳过，测试耗时 766.63s。Architecture Watch `39865094080`/job `120125167788` 为 completed/success。该提交只补文档，不扩大产品行为证据。
- PRV-05 remains `partial`: no trusted remote settlement or billing evidence was obtained. The local ledger and quota projection are not a substitute for provider-side accounting.

## 2026-10-23 SET-03 settings preview external invalidation（代码批 `286c961c` → `cbde43e0` 已推送；最终 CI/Watch success）

- `picker/preview.ts` now captures the active configuration publication revision for composer and status previews; a later publication invalidates the preview before it can be shown again. Theme preview keeps its existing generation-bound lease and refuses a superseded selection.
- `ComposerPreference.read()` drops a staged composer preview when the configuration revision changes, and `InteractiveMode` drops status preview state when a publication advances. Both paths therefore return the newly accepted value rather than the old display proposal.
- The settings picker tests cover composer and status previews, the real `refreshShellRuntimeConfig` publication path, and theme revision protection. The final affected set is 10 files/319 tests; the initial pre-fix run failed the composer and status revision assertions, and three isolated reversals failed the preview guard, composer invalidation, and status publication checks respectively. CI then exposed one theme-specific stale-preview message assertion that the first commit had generalized; the follow-up preserves `Theme preview` while composer/status retain `Display preview`.
- The final TypeScript build is `124883cf2cf00ed6efa79089ec83cf929c662b3846b6f45862cb3c3ff2dcd301`, inputs digest `5ace5cd64a6026d6df7028b3713917ba7383c72c047b66118a06098982a04695`, artifact digest `a69a74836ff5f57bbf3044ceb9f51d801bdb70c6db1f3317c646b77ec8459b82`; executable SHA-256 `19e1c4965ac7dc697228bab42dd34332a4a92ed0e282db433160d9fe7717cbe8`.
- `verify:import-cycles` (2,764 files, 0 runtime/type cycles), `check:config-consumers` (53/53), `check:declarations` (18/18 hooks, 11/11 factories), `check:node-floor`, `test:scripts` (157), `verify:cli-entry` (19), TypeScript build, executable build, `git diff --check`, Node/exe × regular/fullscreen/line/pipe synthetic PTY smoke (8/8), and repository NormProof exit 0/partial with 11 existing function-ceiling advisories passed. SET-03 is now `complete`; Phase 20 remains `partial` because the other matrix rows retain their stated gaps.
- 代码批 `286c961c3fcf319d95054c12cac69ae2cb281706` 已推送；CI `39867401287`/job `120132949473` 为 completed/failure，测试 9868 项通过、1 项失败、3 项跳过，耗时 766.52s；Architecture Watch `39867401240`/job `120132949040` 为 success。失败项是 theme stale-preview 文案被泛化，未把该 run 记成成功。
- 修复批 `cbde43e0a7f9e1a34ade16b2487363351ad0d5e1` 已推送，远端 `main` 精确读回同 SHA。CI `39869615352`/job `120140442661` 为 completed/success，耗时 25m23s；完整测试 927 文件通过/1 跳过、9869 项通过/3 项跳过，测试耗时 819.25s，静态门、脚本门、构建、Chromium 安装与 NormProof 步骤均 success。Architecture Watch `39869615369`/job `120140443173` 为 completed/success。两项只绑定该修复 SHA。
- 证据文档提交 `9678a3bb6d75b29d9507917bd25ed1406acb85a1` 已推送，远端 `main` 精确读回同 SHA。CI `39872599463`/job `120150383303` 为 completed/success，耗时 17m29s；完整测试 927 文件通过/1 跳过、9869 项通过/3 项跳过，测试耗时 966.52s。Architecture Watch `39872599468`/job `120150383395` 为 completed/success。该提交只补文档，不扩大产品行为证据。

## 2026-10-23 PAN-01 revision-bound model search（代码批 `aee2a1ab` 已推送；CI/Watch success）

- `picker/model.test.ts` now drives the real `OverlayHost`: pasting `relay b` leaves only the relay-B model row, and pasting `review` leaves the named profile-role row. The displayed row is accepted through the ordinary Enter path rather than a synthetic direct apply.
- After relay search, the test advances the accepted publication revision before Enter and requires `Model selection expired`; session model bytes remain unchanged. After role search, it replaces the same profile role with a different model, then requires `Model preset changed` instead of silently applying the new target; session model bytes remain unchanged.
- Focused picker/model host set: 3 files/74 tests passed. Two isolated reversals failed as expected: removing connection ID/label from the row made relay search fail, and removing the preset-owner comparison made the changed role apply instead of being rejected. Both source reversals were restored.
- No product source changed in this batch; it closes the previously missing PAN-01 search/revision acceptance. The matrix moves to 29 `complete`/18 `partial`/0 `open`; Phase 20 remains `partial` because the other rows retain their stated gaps.
- 代码批 `aee2a1ab59f418d85d019656dfd14695543d7627` 已推送，远端 `main` 精确读回同 SHA。CI `39873115272`/job `120152093788` 为 completed/success，耗时 26m24s；完整测试 927 文件通过/1 跳过、9871 项通过/3 项跳过，测试耗时 868.04s，静态门、脚本门、构建、Chromium 安装与 NormProof 步骤均 success。Architecture Watch `39873115198`/job `120152093747` 为 completed/success。两项只绑定该验收 SHA。
- 证据文档提交 `74c250a0477d3895350addb1f34e8ce5dba75a0e` 已推送，远端 `main` 精确读回同 SHA。CI `39876052475`/job `120161797308` 为 completed/success，耗时 17m30s；完整测试 927 文件通过/1 跳过、9871 项通过/3 项跳过，测试耗时 962.01s。Architecture Watch `39876052380`/job `120161797289` 为 completed/success。该提交只补文档，不扩大产品行为证据。

## 2026-10-23 全 47 项复核与 QA-03/TOOL-02 harness 返工（代码批 `6ed28019` 已推送；CI/Watch success；真实模型项仍 partial）

- `scripts/phase20-requirements.json` 现在逐项记录决策表全部 47 个唯一 ID：29 项 `complete`、18 项 `partial`、0 项 `open`，整体仍为 `partial`。`scripts/phase20-requirements.mjs` 与 4 项回归强制矩阵 ID 和决策表完全相等，complete 行不得保留缺失证据，partial 行不得隐藏缺口。该矩阵明确保留 PRV-03/05、PAN-02…08、INPUT-01、RENDER-01…03、TOOL-02、QA-01…04 的开放验收，不再把“未闭合”简化为 QA-03/TOOL-02 两项。
- 默认 `npm run qa:quality` 改用 `scripts/qa-quality-formal.json` 的 20 项 qualifying corpus：12 项发现/执行、4 项摘要、4 项渲染；decoder 强制分类下限，starter corpus 只留作回归。`--validate-fixtures` 在不发 provider 请求的情况下准备 20 个隔离 home/project 并调用本地 `/tools`，实际 20/20 通过；固定 allowlist 下 MCP fixture 完整池 18 项、extension fixture 完整池 18 项，其余 18 个任务各 17 项。
- harness 现在逐 arm 记录 turns、tool calls、argument errors、missed discovery、批准结果、成功工具、cache read/write、实际 usage 与捕获价格成本 coverage；任务支持批准拒绝、文件必须不存在、任一编辑工具成功、隔离 MCP、受原 state/inventory 校验的 Linux extension，以及同一 session 的跨进程 follow-up。缺失 session、换 session、无 measured request、未知 tokenizer 或未定价 cache token 均 fail closed。blind-human 输出写入独立 mode `0600` candidate，arm 映射单独保存；`--resume --ratings` 可在不重复 provider 请求的情况下重投影报告。两臂统一使用 `temperature=0`、`topP=1`、`maxOutputTokens=4096`，报告缺少数值时不能判为 complete。
- 每个真实 run 在 `run-meta.json` 与 `tokenizer.json` 之后生成 revisioned `run-manifest.json`，绑定 run metadata、tokenizer evidence、全部 pair/raw arm、脱敏 candidate、review map 与评分文件。resume 先验证精确文件集合和每个 SHA-256；已有 artifact 变更、未登记 artifact、重复/缺失 pair 或非法评分都会在重投影前失败。评分文件只在解析与双评分校验通过后复制到 private 目录，再以 revision+1 追加到 manifest。
- `scripts/qa-tokenizer-corpus.json` 固定英文、中文、代码、混合 CJK/emoji 四层。真实运行对每层发送同 project、同完整工具池的两组首次请求，以 provider prompt-token 差值计算实测值；样本文本不写入报告，只保存 SHA-256 与字符数。dry-run 仍为 `inconclusive`/exit 2，明确没有真实质量结果。
- 用当前构建生成 100 个合成 pair 后，`--resume --ratings` 在不调用 provider 的情况下重投影为 `complete`，manifest 从 revision 1 扩展到 revision 2、绑定 344 个 artifact，并把评分文件复制到 run private 目录。证据目录为 `.omx/artifacts/quality-runs/synthetic-manifest-validation/`，扩展后 manifest SHA-256 为 `9cffc2606b06331e2945a85e794df9f39a0ea3bdfb81ede525191ce10e252cc8`，绑定 exe SHA-256 `4fdfcb0836c7339e86ab0e3edab1699a9b1600eeb9f12df2466417542f3ba342`。该运行只证明 resume/评分/报告合同，不是模型质量证据。
- `npm run test:scripts` 实际 157 项通过；`node --test scripts/qa-quality.test.mjs` 22 项、`node --test scripts/qa-quality-manifest.test.mjs` 3 项、`node --test scripts/phase20-requirements.test.mjs` 4 项、`node scripts/phase20-requirements.mjs` 均通过。dry-run 实际输出 `inconclusive`/exit 2，fixture validation 为 20/20。尚未执行真实 provider、双人盲评、100 个真实 pair、真实成本或四语言 tokenizer 数值，因此 QA-03/TOOL-02 仍为 partial。
- 本轮重新核对 `complete` 行时，对最容易受历史状态漂移影响的任务补跑当前源码聚焦集：JOB 相关 47 项、EDIT-01 相关 67 项、START 相关 9 项均通过；其余 complete 行仍以其绑定测试、构建或精确 SHA CI 证据为准。指定 `cn:deepseek-v4.1-flash` 的独立 reviewer 再次返回 `503 Service Unavailable`，因此没有独立批准，不能把本矩阵当作 QA-04 或 Phase 20 完成。
- 代码批 `6ed28019162c87260a32df251f1c2456bc595583` 已提交并推送，远端 `main` 精确读回同 SHA。CI `39850665748`/job `120075621131` 为 completed/success，耗时 16m45s；完整测试实际 927 文件通过、1 文件跳过，9857 项通过、3 项跳过、921.47s，静态门、脚本门、构建、Chromium 安装与 NormProof 步骤均 success。Architecture Watch `39850665653`/job `120075621701` 为 completed/success。两项只绑定该代码 SHA；真实 provider、盲评、真实成本/cache 与 tokenizer 数值仍未运行，QA-03/TOOL-02 不因 CI success 转为 complete。

## 2026-10-23 QA-02 跨平台 CLI 矩阵（代码批 `fa493e2e` 已推送；Platform QA/CI/Watch success）

- `.github/workflows/platform.yml` 在 GitHub `ubuntu-24.04` x64、`macos-14` arm64 与 `windows-2022` x64 上使用 Node `20.3.0`、Bun `1.3.14`，覆盖 Linux/macOS Node/exe × regular/fullscreen/line/pipe 各八格，以及 Windows Node/exe × line/pipe 四格；Windows regular/fullscreen 明确标记为不支持的交互 PTY 路径，不伪装成跳过后的通过。
- 首轮 Windows 失败不是断言放水：先暴露 `/tools` 在平台不兼容的原生读取前失败，修复后又暴露项目 skill 的 `Read target is outside the authorized directory`。根因是 Windows 8.3 短名 `RUNNER~1` 与 `realpathSync.native` 返回的 `runneradmin` 长名在 read root、containment 和 catalog 复核中混用；最终由 path owner 统一既有路径的 canonical spelling，并让 containment 在词法前缀不匹配时仍先尝试 native 解析。失败 run `39830583247`、`39831629803`、`39832079951`、`39832441907`、`39834065300`、`39834360782` 保留为反转证据，不覆盖为成功。
- 最终手动 `Platform QA` run `39834842595` 为 completed/success；jobs 为 Linux `120020320612`、macOS `120020320517`、Windows `120020319978`。20 个 JSON 全部 `status=pass`、`exitCode=0`、bytes 为正，平台/架构/target/mode 与预期逐项一致；20 个 transcript 均包含成功的 `bash`、`task`、`tool_search`、`tool_load`、`skill` result、审批 resolution 和 `qa-skill-body` payload。
- Linux/macOS 共享 TS build ID `58cca24b15858754afd2b576b5d7ac28c058b8aff40a476db756672308f14d24`、inputs digest `b0d80fb795665149129c17af6410f2faa46b8cbc0adfe4b220fcac60c532c660`、artifact digest `a16dab3c00554ed3712e8b6f1fc400530446a92125b938be9e565bc283a7e320`；Linux/macOS exe SHA-256 分别为 `31cdf84fcfc1fa46f7308c141e8407e8c7776f2bd22e985e0eaac25787876eb1`、`c0bd5072fc21454b184b8c69221d0ae80bd4efdc4579f220864eeb4a995e2146`。Windows build ID `da633dea4e9f70a9fd3d0596a753f5094811f60e59aa5429e57b850e8eea5c56`、inputs digest `1b84c7c343c2dce36b537a1e05abc93c1b259de137367247b551d6821ef42ecb`、artifact digest `ce7667041ce10b94984261048a404062ce812c7b3e85a9deecbfb12ab81be4fc`、exe SHA-256 `ac518a05f0e2c85d1125ce7dc3aa7ed9059e4b08c24339db9b694e53d78c9c02`。证据目录为 `.omx/artifacts/platform-39834842595/`。
- 代码批 `fa493e2e8c6608e768ccb312204553c722467522` 已提交并推送，远端 `main` 精确读回同 SHA。CI `39834842366`/job `120020311437` 为 completed/success，耗时 16m41s；完整测试实际 927 文件通过、1 文件跳过，9857 项通过、3 项跳过，测试耗时 918.53s，静态门、脚本门、构建、Chromium 安装与 NormProof 步骤均 success。Architecture Watch `39834842316`/job `120020311060` 为 completed/success。
- 本矩阵闭合 QA-02 的跨平台合成 CLI 线/管道与 Linux/macOS TUI 路径，并验证 restore preview、settings 保存、命名 profile 创建/重启读回、任务、发现、审批和 skill payload。仍不闭合 Windows 交互 PTY、真实 IME 行为、系统复制，也不证明真实模型质量；Phase 20 其余开放项保持原范围。

## 2026-10-23 START-03 受控冷/热启动基准（代码批 `2c55ec8b` 已推送；Performance/CI/Watch success）

- 新增 `global-cold` 缓存控制：每个样本先执行 `sync`，再由 `sudo -n tee /proc/sys/vm/drop_caches` 写入 `3`；默认仍为 `warm-uncontrolled`。非 Linux、未知模式、缺少免密 sudo 或任一命令失败都会在启动样本前 fail-closed。`scripts/bench-cache.test.mjs` 6 项通过，`test:scripts` 135 项通过。
- 手动 `Performance` 运行 `39817293051`/job `119959021646` 为 completed/success，耗时 18m30s，使用 GitHub `ubuntu-24.04`、Node `20.3.0`、Bun `1.3.14`、4 vCPU Xeon。它先跑 warm，再跑 cold；四份 JSON 使用同一 build ID `91c1045a9d1ad20a59d64780b6aada71419e6d53ef54b9050e32c92627c3bcc2`、inputs digest `663c429db5ebcd854cb53348c77763f2ab0f9120d551c94cf29695fd9ce58fa1`、artifact digest `aa25ff526e0ae405c011c1b91c7707907b5fa3f716fb596c66c7c378bc793db2` 和 exe SHA-256 `a3170741780421323d9e9677bfdae11fe6ba3cf200e69ac2a53993aefa2156dd`。
- 进程启动各 30 次，Node warm p50/p95 `400.0/414.6ms`、cold `1869.3/1912.6ms`；exe warm `273.6/282.4ms`、cold `481.4/488.6ms`。cold 运行记录 60/60 次 cache drop，warm 为 0/60。
- 交互启动各 target × 四模式各 30 次。regular/fullscreen 的首帧 p50/p95 如下；line/pipe 没有首帧或键响应，分别保留 first-byte、runtime-ready、exit 等独立字段，不混报为 TUI 指标。

| target | mode | warm first frame | cold first frame | warm key response | cold key response |
|---|---|---:|---:|---:|---:|
| node | regular | 1857.9/1887.0ms | 3526.6/3591.5ms | 52.2/60.3ms | 54.0/62.3ms |
| node | fullscreen | 1861.2/1879.8ms | 3534.4/5567.9ms | 50.7/67.3ms | 50.9/63.0ms |
| exe | regular | 749.6/794.1ms | 996.1/1020.0ms | 48.8/49.8ms | 49.5/51.1ms |
| exe | fullscreen | 747.7/762.7ms | 997.9/1071.6ms | 48.8/50.1ms | 50.1/52.6ms |

- line first-byte p50/p95：Node warm `1766.4/1808.4ms`、cold `3435.3/3498.9ms`；exe warm `664.4/683.2ms`、cold `902.3/928.0ms`。pipe first-byte p50/p95：Node warm `1858.0/1885.6ms`、cold `3507.5/5476.6ms`；exe warm `760.2/788.3ms`、cold `999.2/1028.2ms`。interactive cold 记录 240/240 次 cache drop，warm 为 0/240。
- 证据目录为 `.omx/artifacts/phase20-performance-39817293051/performance-39817293051/`；SHA-256 分别为 start-warm `acace637cf224b0a279cec7eb2aa5ce1683e77a49928c2354407b32e90c935d3`、start-cold `2ea259acaa501474a0b783e121331c3b98bdd28fbb3fd55af80eccbadb683fbc`、interactive-warm `69a047a08bbfc535e59de75817b3fcc5c617822aea228015eb77d3e7e3950e35`、interactive-cold `f0671f10deaa923365b0fa5c34d745952216dae13cfdd7dda52555d57a6ce1e1`。该运行闭合 START-03；此前 WSL warm 数据只保留为另一台机器的观测，不替代本 run 的同机 warm/cold 对照。

## 2026-10-23 Phase 20 本地返工与全量复核（代码批已推送；CI/Watch success；延期项保留）

- 续接上一轮未提交工作树，完成 `/review` 空 focus、output-aware `/context` 与 runtime protocol facts、动态发现 generation/subscription、transcript pointer source revision、Vim operator motion、Markdown source/diff/math/table、bounded usage attribution、provider fallback/profile scope 和 executable manifest 绑定返工。自审又修复了 pointer 自动滚动被自身 revision 误失效、同一毫秒相同 usage 请求可能丢失、非法右花括号数学被静默截断，以及 host-verified executable 版本可与 build 不同的四个真实缺陷；均有修前回归或等价断言。
- QA harness 现在要求 qualifying corpus 至少 20 项、确定性任务至少一个可观察检查、文件字节与 mode policy 证据、事件流 observation-only、每臂一致的 provider/model/endpoint、完整 protocol 探针、双独立盲评与明确裁决；`complete` 还要求 100 个正式 pair、唯一 ID、无执行失败、零 policy violation 和无限制项。starter corpus 保持 `qualifying:false` 的 6 项，dry-run 固定 `inconclusive`。
- 最终聚焦复跑包括 129 项脚本测试、253 项 pointer/usage/renderer/turn 测试和 67 项 Git 集成测试；默认并行 `npm run test:ts` 实际为 927 文件通过、1 文件跳过，9845 项通过、10 项跳过，360.71s，无失败。`test:scripts`、`verify:result-contract` 6 套/158 项、golden main path、`verify:cli-entry` 19 项、cycles/config-consumers/declarations/Node-floor、strict docs/rules、`git diff --check` 均通过；docs-source 118 项与 module facade 11 项保留 advisory。
- 最终 TS build ID `2ac423b5a8dac7aa1992bf6645a4aa3b000b83df3ea8cd20bc67f523c14ad8bb`，inputs digest `6a3ddbb67f142b5ca01126d5a8c595c957cdf235a96b655cb15a13de50fe3736`，artifact digest `aa25ff526e0ae405c011c1b91c7707907b5fa3f716fb596c66c7c378bc793db2`；immutable exe 102,758,528 bytes、mode 755、SHA-256 `2b9c04625b3b15c96a224d2f2bd0bdd7505bc9fb29a8ebd83033a894c78b868f`。`npm start -- --version`、stable exe 和 immutable exe 均输出 `0.1.0`。
- 同 build 的 Linux Node/exe × regular/fullscreen/line/pipe 八格 PTY 全部 pass/exit 0，覆盖 settings 保存、命名 profile 创建与重启读回、任务、发现、逐次审批、会话和 restore 字节对照；所有 JSON 均绑定上述 build/artifact/exe。QA quality dry-run 为 `inconclusive`/exit 2，明确表示没有真实模型质量结果。
- 同 build 的 START-03 补充证据：`bench:start` 各 30 次，Node p50/p95 `405.6/415.8ms`、exe `214.5/231.9ms`；`bench:interactive` 保存 Node/exe × 四模式共 240 个样本，regular/fullscreen 均取得 runtime-ready、首帧和完整 UTF-8 键响应；`bench:responsiveness` 30 次通过 1000 项列表 p95 `<50ms` 与 math/table/diff 单次阻塞 `<100ms` 阈值。全部为 warm/uncontrolled 缓存，不能替代受控冷缓存。
- NormProof 实际 exit 0/partial：blocking unresolved-specifier 与 cycle obligations satisfied，0 blocking；11 项 function-ceiling advisory 保留。委派 reviewer 使用指定模型多次遇到 429/503，不可用不等于批准；本轮结论来自本地自审和实际门禁，不声称独立 review approval。
- 代码批 `0d42697d3aa6130412d57afdf76cf2ae15d0a539` 已提交并推送，远端 `main` 精确读回同 SHA。CI `39810323144`/job `119934502881` 为 completed/success，耗时 17m35s；静态门、脚本门、构建、Chromium 安装、完整测试与 NormProof 均 success，CI 测试实际为 927 文件通过、1 文件跳过，9852 项通过、3 项跳过，967.66s。Architecture Watch `39810323104`/job `119934501742` 为 completed/success。两项只绑定上述代码 SHA；本段后续文档证据补记另提交，不扩大产品范围。
- START-03 已由上方受控冷/热运行闭合；QA-02 的 Linux/macOS/Windows 支持矩阵随后由 2026-10-23 `Platform QA` 闭合，但 Windows 交互 PTY、真实 IME 与系统复制仍未闭合；QA-03 正式 20 项 corpus、真实模型执行和双盲评分；TOOL-02 同模型总成本/cache/参数质量/多语言 tokenizer 校准。Phase 20 不因本批本地返工而宣称全部 47 项完成。

## 2026-10-22 面板、源投影与 W2/W3 本地返工（代码批 `152d9ecc` 已推送；CI/Watch success）

- 补齐 `/jobs`、`/agents`、`/usage`、`/plan-review`、`/btw` 的既有 picker consumer。`/agents` 通过 jobs owner 的 `agentProjection` 投影 live owner、detached、stored/running→unknown 与保留运行，通过 `agentPage` 提供脱敏、截断的文本页；同时展示 `SubagentLoader` 的有效定义和经安全投影的 discovery diagnostics，不借用 jobs 的本地任务身份；`/usage` 打开时只读本地账本，账户读取必须显式选行并在配置 revision 变化后丢弃迟到结果；`/plan-review` 绑定已加载版本，`/btw` 只读 transcript 中的保留报告。
- `/settings set <key> <value> [--project]` 已沿交互、line、pipe/print 与 command bridge 接入同一 CAS writer；用户范围、显式项目范围、非法值、未知键和 session 变更拒绝均有回归。Linux Node/exe × regular/fullscreen/line/pipe 八格隔离 smoke 通过，line/pipe 覆盖 profile 创建、切换的显式非交互拒绝和 `maxTurns=7` 文件读回。
- UI-04 保留 Markdown 原始行偏移并为表格、fence、标题、列表、引用、数学与分隔线生成 source mapping；换行后的标题、段落、列表和代码行保留逻辑换行，结构化行必须完整覆盖一个逻辑节点才能复制，fence 内空白源行也保留可复制身份，表格预算截断行不再产生可复制来源。
- W3 将 compaction 阈值接到共享 `requestBudget()` 软带，`buildCompactionWiring` 传入实际 output ceiling；`enabled: false` 阻止软带触发，retained tail 也扣除 output headroom。step 记录实际发送的消息数与有效 wire schema/system 指纹；compaction 的测量身份在 schema/system 不完整时拒绝。读取时 schema identity 与回退 `overhead` 都从当前 discovery snapshot 和实际工具过滤重新计算，system identity 则固定为主 turn 实际发送的 system prompt，避免 tool_load 后把未发送的提示误当请求身份。`/context` 不重建请求身份，而是使用最后一次请求保留的 `lastPromptIdentity`；`CommandContext.promptIdentity` 仅作显式 host override。严格测量（`/context` 与 compaction）要求 endpoint/schema/system 完整且逐项相等，无身份或部分身份记录均 fail closed；只有非严格 legacy caller 保留无身份测量兼容。这样动态工具发现快照与嵌套 `cwd` 都对照实际请求，而非命令侧重建出的另一套配置；状态栏至少要求可解析 endpoint。opaque subscription token 的 issuer/audience 证明仍未闭合，不能据此宣称完整 PRV-03。
- 独立复核先确认生产命令上下文缺少 system digest 会把正常测量误报为 stale；后续又证明按命令侧完整工具池重建在默认动态发现下错误，使用 `projectRoot` 重建也在请求采用 `runtimeContext.cwd` 时错误。最终修复保留请求侧共享 `core/prompts/systemContext.ts`，但 `/context` 只消费精确请求身份；动态 schema、回退 overhead 与嵌套目录正向回归、部分身份拒绝和显式冲突 override 回归均通过。另一轮独立复核发现严格 helper 仍接受无身份/同等部分身份、`/usage` picker 缺少 interactive binding、compaction identity 在 tool_load 后冻结、fence 空白行丢失来源、`/agents` 未满足 live view/diagnostics；这些均已修复并由对应回归覆盖，`/agents` 现在复用 jobs owner 的 liveness/output projection。
- 最终聚焦 23 文件/430 项通过。最终字节的完整 `test:ts` 使用仓库外临时配置以 2 worker、1 次 retry 运行，实际 926 文件通过、1 文件跳过，9781 项通过、10 项跳过，804.69s，无失败或 retry 标记；这不等同于默认 8-worker 结果。此前默认并行下的 browser/CLI 负载型失败保留原分类，未用低并发结果冒充默认并行通过。旧提交 `5576b1d3` 的 CI `39717903140` 仍只证明旧 SHA。
- `test:scripts` 106 项、`verify:result-contract` 6 套/154 项、golden main path、`verify:cli-entry` 19 项、cycles/config-consumers/declarations/Node-floor、strict docs/rules 与 `git diff --check` 通过；module facade 仍为既有 8 项 advisory，docs-source 仍为 118 项 advisory。NormProof 实际 exit 0/partial，blocking import/cycle 义务 satisfied、0 blocking，既有 8 项 function-ceiling advisory 保留。
- 最终 TS build ID `faeb78a44674365c5490409b013b6eb7dfe9c7f71b9fbb23ab4dcadf3fc65e5e`，inputs digest `70aedc13fda716d9778be5460ef2e985ffb1a44aa4a1714e8f9e8199cef1a513`，artifact digest `813a2891a181c948e6e6b57a727c784008e59020406db2491d40f2b4c94d8c96`；exe 102,742,144 bytes、mode 755、SHA-256 `355d84e9e1d9c5f731fd82a76243670f629a52114d0d19cf333d8fca1eb6274f`。该产物 Node/exe × regular/fullscreen/line/pipe 八格隔离 PTY 全部 exit 0；最终 exe 上的 19 项 CLI hard gate 也全部通过。
- CLI hard gate 的单 hunk 检查现在证明非交互无 group-selection host 时拒绝且零写入；正向单 hunk 应用仍由 patch/turn 聚焦回归覆盖，未把无选择宿主伪装成成功路径。已执行并恢复的最终反转包括 wrapped-node 逻辑换行、JSON list 设置、no-tools wire schema、compaction 身份与 opt-out、compaction 回退 overhead live getter、output-aware retained tail、context/status 身份、retained identity fallback、部分身份严格拒绝、interactive usage binding、live discovery compaction identity、fence blank-line source、agents live binding 与 owner projection、agents continuation syntax、UTF-8 分页、panel 控制字节、jobs workspace identity 和 `/btw` retained report。所有反转均取得真实失败，恢复后源码 SHA256 与反转前一致。代码批 `152d9ecc7d55ff8ced88a338ff1db7eb153aa4f7` 已提交并推送；CI `39753892764`/job `119740926577` 与 Architecture Watch `39753892815`/job `119740927033` 均 completed/success，只绑定该代码 SHA。该历史批次当时保留 START-03、QA-02/03、TOOL-02；START-03 已于 2026-10-23 后续受控冷/热运行闭合。

## 2026-10-22 MCP 服务器刷新与安全报告返工（PAN-08 部分）

- 当前未提交批次的 21 个源码/测试 SHA256 与两份独立审查和最终构建绑定逐项相符，本次实际重跑 `mcp-picker/bind.mjs` 通过。原精确服务器身份、单次选择、原准入、host 取消、client 目录发布与 report-safe 投影已有最终证据；具体合同见 [MCP 交互式服务器选择与刷新](mcp.md#交互式服务器选择与刷新)。
- 最终本地受影响 18 文件/247 项及补充 4 文件/24 项通过；18 项加载时反转取得真实断言失败。两构建、Node/exe × regular/fullscreen 四格专用 MCP PTY 和 Linux 八格通用 smoke 通过。专用 PTY 验证精确 `all`/空格名称、取消后最终清理与重新打开、安全展示及持久化，无 tools/call 或模型消息。以上是与当前哈希相符的既有运行证据，不声称本次全部重跑。
- 既有两路独立代码 APPROVE、架构 WATCH，综合 COMMENT；本次重新核对审查哈希。源值修改后还原、实际清理时限、未支持编码、总资源界和继承函数上限仍有边界，未将 WATCH 当作完整架构批准。
- 本次四项 cycles/config-consumers/declarations/Node-floor 实际重跑 exit 0。既有 result-contract 6 套/154 项通过；两个 MCP 门禁仍因删除前测试路径返回 exit 1，属于验证脚本漂移，原失败日志保留，单独修复。strict docs/diff、提交、推送和新 SHA CI 按后续实际证据记录。
- 前批 help 精确 SHA `eeeb9268c5f879c457a43c3cdee96f43d2965173` 的 CI `39614206610` 和 Watch `39614206887` 已 completed/success，只证明前批。完整 PAN-08、其余既有 picker 与全部 47 项继续原范围复核；用户允许延期的四类环境/真实模型验收范围不扩大。

## 2026-10-22 MCP 验证门返工与 EDIT-01 显式选集

- 三个 MCP 验证门已从删除前的固定文件/场景清单迁回当前 owner 测试，并把关键成功、报告安全、取消、拒绝和 stale 场景作为必需断言逐项校验。共享 contract gate 现保留 `0=pass`、`1=product-regression`、`2=execution-inconclusive`、`3=config-failure`，release-core 使用归一化退出码；成功运行清理隔离产物，失败保留 `runner.log`/`tests.json`。`test:scripts` 106 项、MCP routing 92 项、local execution 26 项、error taxonomy 28 项及 result-contract 154 项通过。
- EDIT-01 修复了单组 patch 的隐式选集：交互选择器和 CLI bridge 必须原样传递非空、去重、已知组 ID 与精确 `selectionRevision`；即使 `accept-edits`/`allow-all`、approval-mode、allow-once cache 或 allow-always grant 已存在，选择必需提示仍绕过这些权限自动回答。无 group picker 时明确 deny，apply_patch 的 allow-always 在持久化前降级为 deny。patch owner 再次拒绝无选集、重复/空白/非字符串 ID 和 stale revision，不能从单组数量推导授权。
- 本地六个聚焦文件/133 项通过，生产 TypeScript 构建通过；七项有效反转分别移除 bridge 字段、恢复 turn/tool 单组 fallback、恢复 scope 自动回答、删除直接执行的重复/非法 ID 校验、删除 apply_patch allow-always 降级或恢复 approval-mode 二次读取，均取得真实失败。`result-contract` 154 项、`test:scripts` 106 项、cycles/config-consumers/declarations/Node-floor 通过，module facade 仍为既有 8 项 advisory。
- 最终 TS build `ad9988c1ee596bfe76481547521acefea43dfc293a543dd738c3ea96c48e312e`，inputs digest `461d3a63c0a656a811f67446f2d8a79c1b9d9c1722f3b88c9f2ed1352ede8368`，artifact digest `7329d1bdbf4d98dc194132d5dc930a5502c78dbc68a6154bf3158708dfad461d`；exe 102,725,760 bytes、SHA-256 `4875859d1f893c0390d3941d075e156eea07237ffbdd1e1d7f9ca669161f42ad`。Node/exe × regular/fullscreen/line/pipe 八格隔离 PTY 全部 exit 0。
- 独立 MCP verifier 复核 APPROVE；EDIT-01 代码复核 APPROVE、架构 CLEAR。以上只证明本轮门禁与精确 patch 选集，不闭合 PAN-08、EDIT-01 的跨平台/真实模型项或其余 47 项。commit、push 与精确 SHA CI 尚未执行，后续按实际结果补记。

## 返工复核（2026-10-18）

复核基线为 `12a7d4e0`。先前“只剩四项未闭合”的结论撤回：下方旧记录包含部分实现、未完成验收及重复任务，不能证明全部裁决兑现。保留历史提交证据，逐批按决策文档重新验收；不以本轮少量回归通过重判整个任务完成。

| 批次 | 当前复核结果 | 后续范围 |
|---|---|---|
| W1 CFG-01…05 | CFG-02/04 发现并修复导入相对路径规则改变目标的问题；default、named、legacy、preview 后源变化回归通过 | 继续核查全部身份 consumer、配置快照及失效合同 |
| W4 UI-01…04 | UI-02/03 修复固定八项上限、详情被候选数裁短、tab 点击区域覆盖、缺键盘切组及 modal 不显示分组；可用矩形和旧命中失效回归通过 | 其余公共原语、源选区及各消费者仍按合同复核 |
| W2 | 连接/角色/目录、委派续期、主/cache/辅助费用及池限制/退避已有逐批证据；只读可用性现共用完整池拓扑、自身凭据与当前代次等待，active 不可用和无目录成员保真 | 本批提交/远端按日志记录；完整 consumer/publication 与 provider/endpoint/受众复核仍开放 |
| W3 | CTX-03 有界分段/合并、永久重播证据、原生 source CAS 与精确发布证明已有本地及独立验收；自动/overflow 未验证发布停止 turn | 两项架构 WATCH 为容量拒绝和锁内同步 I/O，已记录取舍；本批提交/远端按日志；CTX-01/02/04、TOOL-01 继续复核 |
| W5 | SET-02 已修复选中分组后无法搜索其他组的问题；复用文字匹配排序，跨组按最佳得分和固定组序展示；清空搜索回原组，从详情 Back 回字段所属组并聚焦 | CMD-01/02、SET-01/03 全部验收；SET-02 其余来源/状态细节继续按合同核查 |
| W6 | modal 的项目范围切组现已可达；不能由此证明完整目录分页/搜索 | PAN-02、PAN-03、PAN-05…08 各动作、只读边界、分页和 revision；PAN-01 已由后续搜索/revision 验收闭合，PAN-04 已由 effort/quota 验收闭合 |
| W7/W8/W9 | 2026-10-20 返工已补上同文件 hunk 的 baseline/content identity、detach 后保留晋升总期限、adopted settlement、follow-up 脱敏/reload、轻量 `--help`/`--version`、首帧 bootstrap 扫描探针，以及最终 Markdown/HTML code-span、diff rows/bytes/rename 与 copy 反例；START-02 现有 packaged 首帧恢复提示与用户意图 fence，START-01 fresh packaged gate 已在本工作树通过 | 其余 INPUT/RENDER consumer 仍按合同复核；START-01/02 的新提交 CI 与跨平台验收另行取证 |
| W10 | 本批 135 文件/1813 测试通过；修改前实现使 20 项回归失败；两路独立复核通过；Node/exe × regular/fullscreen 的 settings/resume 切组、关闭与退出 PTY 通过 | QA-01/02/04 随后续返工累积；本批不等于全阶段交付 |

本批静态检查、构建、提交和 CI 的精确状态见开发日志。本轮 PTY 鼠标只验证 fullscreen；regular 仍由终端负责鼠标滚动与选择。

基础批已提交并推送为 `d622d491`；CI run `39094520395`、Architecture Watch `39094520337` 均 success。搜索批 `425e290b` 的 CI `39095154347`、Architecture Watch `39095154368` 均 success；另经 114 文件/1563 测试、分组限制反转失败、两构建与四格搜索 PTY 验证；交付结果以开发日志和精确 SHA 的 GitHub run 为准。

具名连接批 `aecc4bcb`、命令角色批 `9bb899ce` 均已推送，Architecture Watch success；各自 CI `39096940454`、`39097452989` 仅两个旧模型菜单测试失败。修复批 `d40f3fdcbadd603924cce44373a59e99a40a43ec` 已推送，CI `39098179492` 与 Architecture Watch `39098179387` 均 success：测试消费真实菜单快照，按实际请求显示当前连接/凭据来源/effort。此前本地受影响集遗漏这两个跨目录测试，未被表述为 CI 通过。

整套预设/subagent 批已推送为 `94122f3f7c97beab3eae8b0bf8e7f29f28e436e5`，Architecture Watch `39099444862` 与 CI `39099444888` 均 success。默认目标和策略一次保存；整套替换清除缺席角色，个别选择保留策略；显式子代理模型/effort 的原优先级保留。

PRV-02 已补齐 `summary`：手动/自动/前缀/分支摘要消费精确角色，主模型阈值与摘要请求预算分离，步骤复用包含摘要身份，预算预检先于 claim。本批已推送为 `c901a58fd9376e3fbc76ecee9cf9303e6c09f666`，Architecture Watch `39101028311` 与 CI `39101028310` 均 success。

当前补齐 `advisor` 的显式启用与自动角色消费、配置/模型 revision 失效，以及主请求/委派/btw 的 credential generation 映射。独立委派账号续期、CTX-03 完整生命周期/分段和其余全部 47 项继续按原范围推进。详细验证与交付边界见开发日志。

advisor 批已推送为 `a7e32d44bcebcbb043760c1d390e7011ed3acf38`，Architecture Watch `39102165544`、CI `39102165549` 均 success。随后 provider-only 模型选择返工的本地验证与提交边界见开发日志；这批不构成完整 W2 或 Phase 20 完成声明。

provider-only 批已推送为 `c6206819db11c88984f95d0dee2c59eed4d9c23a`，Architecture Watch `39103714478`、CI `39103714477` 均 success。精确 endpoint 目录批已有本地受影响 40 文件/555 项、三项有效反转、双构建、八格隔离 PTY 与独立代码/架构复核；其提交与 CI 按开发日志后续证据记录，不把当前通过扩大为全部 47 项完成。

目录批已推送为 `760b078855a4c08ab980dbd85c254e6a343bb5fe`，Architecture Watch `39106440957` success；CI `39106440859` 有一项既有 `grepStream` 夹具 `spawn ETXTBSY` 失败（8652 通过、2 跳过），不能记为 CI success。后续续期前置返工修复 peer 错账号读回和刷新发送标记漏调用，独立顾问/子代理续期接入仍未闭合；细节及验证见日志。

续期前置批已推送为 `30c838271d6c0673e7740f7b1375301731174a5a`，Architecture Watch `39107413351` 与 CI `39107413330` 均 success。后续委派续期、精确 token publication、scope 指纹与可执行文件传输返工的验证/交付边界继续按日志记录；此处不把本地修复视为新 SHA CI 成功，也不收窄全部 47 项范围。

委派续期/传输批 `788b0d3ca4d9dbad0b5e04583c32d2ab0fdd3c50` 已推送，实际读回 Architecture Watch `39111926775` 与 CI `39111926771` 均 success。本批历史费用返工的独立复核与验证见日志；不据此闭合 PRV-05、W2 或其余任务。

历史费用批 `ea770c7be9d6bf826054b15d3384bb45fdaedcd8` 已推送，实际读回 Architecture Watch `39124441199` 与 CI `39124441229` 均 success。辅助费用返工已通过受影响 70 文件/865 项、六项有效反转、双构建、四格隔离 PTY、两进程增量与独立复核；原目录删除/替换的响应只能报告未能持久化，不能归入新会话。此处记录本地证据，提交/远端结果继续按日志及实际 SHA 核对，全部 47 项仍按原范围推进。

辅助费用批已推送为 `6b1eab75cfa089f8f7424e25746fee296ef6bc26`，Architecture Watch `39131315169` success；本轮实际查询 CI `39131315102` 及 job `117686908263` 仍为 in_progress，不能记为通过。主请求续期 checkpoint 批的受影响 32 文件/518 项、六项有效反转、双构建、四格隔离 PTY 与独立 7 文件/138 项复核均通过。缺回执或未确认发布即失效，已保存的凭据仍恰好发布一次；完整 PRV-03…05、CTX-03 与其余任务继续原范围，交付状态以日志和实际 SHA 为准。

checkpoint 批已推送为 `c0f065385597e6cb3a5138b22a5fb7ba65360ad6`，Architecture Watch `39133444455` success；CI `39133444370` 仍为 in_progress。随后 PRV-04 复核发现按年龄删除 dispatched/unknown 使旧 token 重新获准的缺口，修复后受影响 7 文件/147 项、有效反转和两个独立进程重启场景通过，实际续期零 HTTP。该证据只覆盖年龄重播窗口；lineage/旧键迁移、rotated-persisted、完整账号限制与请求账本继续开放，独立复核和新 SHA 交付按开发日志记录。

后续实际终态核对：辅助费用批 CI `39131315102` 为 failure，GitHub 注释 hosted runner lost communication；原始日志为空，没有测试失败断言证据，不能记为通过。checkpoint 批 CI `39133444370` 为 success；年龄保留批 `e4ae423de3a931b82b09a5dde137cc87565663f8` 的 CI `39134059372` 与 Architecture Watch `39134059381` 均 success。完整 SHA、时间与分类见日志。PRV-04 两独立进程的复制槽位复现仍发送两次刷新，新的谱系/grant/attempt/原生响应证据返工正在实施，尚未验收或交付。

用户曾允许后续验证的环境/真实模型项：START-03 受控冷缓存及剩余响应测量、QA-02 跨平台/IME/系统复制、QA-03 真实质量、TOOL-02 成本与 tokenizer 校准。**START-03 已于 2026-10-23 通过同机 warm/cold 运行闭合；QA-02 的跨平台支持矩阵已由 `Platform QA` `39834842595` 闭合；IME、系统复制与 Windows 交互 PTY 仍保留，且该保留不覆盖可在本地完成的缺失实现和合成端到端验收。**

2026-10-21 PAN-02 再次复现真实排队 `/tree` 的焦点错误：exclusive 包装的对象展开在 load 前读掉 `initialSelection` getter，Enter 因而选中旧节点。现在保留属性描述符及 prototype；真实 `InteractiveMode.run('/tree')` 回归先失败后通过，对象展开反转再次失败。受影响 4 文件/129 项、生产类型检查、双构建、打包入口 gate、静态门和 Linux 八格隔离 QA 通过；独立 code APPROVE、architecture CLEAR。该批提交与精确 SHA CI 仍按日志实际结果记录，不据此闭合全阶段。

该 SHA 的 CI `39534315600` 已完成但因 `catalog.test.ts` 在 Node 20.3 关闭目录句柄后同步抛错、测试直接把调用结果交给 `.rejects` 而失败；905 文件/9378 项通过，失败仅此测试。将断言包在 microtask 中同时覆盖同步 throw 与 rejected promise，保留 `ERR_DIR_CLOSED` 精确检查；catalog 4/4、上述 PAN-02 组合 133/133 及生产类型检查通过，代码 APPROVE、架构 CLEAR。修复另行提交，旧 CI 失败保留，不记作新 SHA 证据。

修复提交 `ec09693ee50ca1f05d0c5c656ec6d05ee5f0c9a0` 已推送，远端 main 精确读回；Architecture Watch `39536881716` success，CI `39536881715` 于 `2026-10-21T03:27:30Z` completed/success。CI 9382 项测试（9378 passed、3 skipped、1 skipped file）及 NormProof 均通过；该证据只绑定此测试兼容修复，Phase 20 继续 active。

PRV-04 谱系批本地验收通过：38 文件/682 项、14 项有效反转、两构建、跨进程复制槽位/五组恢复/三组 V1 迁移/default 与 named profile 替换拒绝、Linux Node/exe × regular/fullscreen 四格 PTY。最终独立复核 APPROVED、5 文件/178 项及原生探针通过，计数与本地集重叠不相加。完整 TypeScript 诊断相对 `e4ae423d` 为 149/149、无新增，不能记为全项目 tsc 通过。该批提交/推送/新 SHA CI 按日志及实际查询记录；PRV-03/05 已复现的池外授权与乱序退避、CTX-03 和其余全部 47 项继续原范围。

谱系批已推送为 `87a55c5f0b4fcbdab5a063e0b74a6d399c0f0692`；Architecture Watch `39140810147` success，CI `39140810129` failure，7 项入口续期测试失败、8808 项通过。失败来自旧夹具伪造续期 payload，未提供新的原生响应凭证；当前夹具改走实际原生解码、验证 HTTP 前 dispatched，并补伪造结果拒绝，8 项通过。此失败记录保留，不当作旧 SHA CI 通过。

PRV-03/05 池限制与退避返工本地验收：最终受影响 23 文件/439 项、19 项有效加载时反转、两构建、实际 CLI 子请求/本机 HTTP/账本与独立进程读回、Linux 四格隔离 PTY均通过；最终 L3 APPROVED、6 文件/105 项和实际 HTTP 竞争探针通过，计数重叠不相加。新 SHA 提交/推送/CI 仍按开发日志与实际查询记录。完整辅助 consumer/publication、可用性投影、provider/endpoint/受众绑定、CTX-03 和其余任务继续，不增加用户推迟项。

池限制/退避批已推送为 `2e0ffe09af81b7d0aa0619658ca9e0f7bba5cf56`；Architecture Watch `39144013465` success。CI `39144013469`/job `117724050073` 于 `2026-10-18T16:24:28Z` completed/failure，前十三步 success，8860 项通过、3 跳过；唯一失败为既有 `grepStream` 测试探测新写脚本时的 `spawn ETXTBSY`，入口续期用例已通过，NormProof skipped。原始日志及精确 SHA JSON 已保存，不重写旧 run 的失败结果。后续可用性投影/测试夹具和 CTX-03 正在本地实施，尚未交付。

可用性/CTX-03 本地返工验收：最终受影响51文件/520项、双构建、9编译HTTP/restart场景、Linux四格PTY、14摘要及9可用性有效反转、脚本59项和五项静态门禁均通过。类型反向环已按owner contract修复，独立delta确认接口与运行emit一致。可用性综合APPROVED/CLEAR；CTX code APPROVE/architecture WATCH，按规则综合COMMENT，容量8192与锁内同步I/O取舍见compaction-operations。产品/测试manifest和当前构建绑定已读回；提交/推送/精确SHA CI按日志后续记录，不宣称整个W3或Phase20完成。

可用性/CTX-03 批 `da01dd609797100d6077c15331b86c500452986b` 已推送，Architecture Watch success；CI `39154482779` completed/failure，唯一旧未知 transcript 类型期待失败、8925项通过、3跳过。当前测试保留未知拒绝并补已知legacy兼容和malformed拒绝；root29项、独立36项、两项实际反转失败及独立APPROVE/CLEAR已有证据。仅测试/文档修正，提交及新SHA CI按日志后续记录。PRV-03 endpoint/账号受众、subscription consumer与CTX-01/02/04、TOOL-01及其余任务仍开放。

decoder 批已推送为 `e6311a1415b0fa1cc3ee9c090edad99b84065b17`，实际读回 CI `39248899708`/job `118047529763` 于 `2026-10-19T12:14:43Z` completed/success，Architecture Watch `39248899786` success。

账号地址/subscription 批最终本地验收：受影响24文件/426项、五组有效反转、双构建、外站覆盖零HTTP及Linux四格隔离PTY通过。主readiness保留账号存储地址，后续真实AccountEdit不再产生缺省地址冲突；配置账号owner降至20函数且全源图无回边。独立code APPROVE/architecture WATCH，按规则综合COMMENT：内置默认仍归模型目录，完整issuer/受众、原生Responses/Google/subscription协议与subscription续期继续开放。最终产品/测试manifest和构建指纹已匹配；该批提交/推送/精确SHA CI按开发日志后续记录，全部47项范围不变。

账号地址/subscription 批已提交推送为 `e83e596ef72a9e89096f209d05349e163d2c780d`；CI `39255262496`/job `118068837295` 于 `2026-10-19T13:06:28Z` completed/success，Architecture Watch `39255262491` success。公开 Responses 协议基座本地受影响18文件/280项、十组有效反转、双构建、编译本机HTTP与Linux四格PTY通过；完整有序加密回放和捕获地址/凭据代次 binding 沿现消息链保留。独立审查和精确交付见开发日志。该基座仍不闭合账户issuer/stream-only/cap、Google、subscription及其余全部任务。

公开 Responses 批 `5fbede8ca57bb8ad3b83e989802b3768b57e0513` 已推送；CI `39261638484`/job `118090503736` 于 `2026-10-19T13:52:27Z` completed/success，883 文件通过、1 跳过，9009 项通过、3 跳过；Architecture Watch `39261638354` success。

原生 OpenAI 账户返工本地受影响46文件/797项、后续 consumed-predecessor 修复11项与账户能力断言17项通过（集合重叠不相加），双构建、12项有效反转、Linux Node/exe × regular/fullscreen 四格隔离 TLS PTY通过。issuer 固定协议、辅助 SSE、显式 cap/tier 拒绝、精确 access 账户声明及原生 grant 跨续期回放均有反例；实际登录/续期/旧前代/profile复制和目录替换验证保持原 owner。独立 code APPROVE/architecture CLEAR；能力断言版 manifest `996e289a…211a203`，随后仅修新文件EOF空行，最终59文件 manifest `471a047b…ac39a650`。类型诊断149/149无新增，仍非全项目tsc通过；静态门与脚本59项通过，NormProof blocking义务通过、8项旧ceiling advisory。提交/推送/精确SHA CI按日志后续证据记录。Google、subscription及其余47项范围继续，仅用户原环境/真实质量项推迟。

交付前已因最后测试断言刷新双构建，TS manifest `37313fcfbdfc`、源码摘要fresh匹配；刷新产物四格TLS PTY和编译模块原生grant/身份/SSE/redirect探针均通过。EOF空行修正后TS manifest `590a46e60240`再次fresh，2013非测试emit与exe均未变化；前述PTY/编译探针发生在修正前，产品编译字节一致。两路最终独立评审均重新精确绑定59文件manifest `471a047b…ac39a650`，综合APPROVE限本批。当前本地提交待修订，尚未推送与新SHA CI。

原生账户批 `09e141c8ea7a885693cff221db7bb23cfd4dc632` 已推送，Architecture Watch `39273753281` success；CI `39273753508`/job `118132587473` 于 `2026-10-19T15:14:05Z` completed/failure，9019通过、30失败、3跳过。失败均为usage/reset旧夹具绑定外站，被新issuer规则拒绝；当前仅修账户夹具并保留API-key外站、增加账户外站零HTTP回归，最终本地/独立评审及新SHA交付以日志后续证据为准。整个Phase20继续active。

usage夹具最终1文件/32项通过，独立code实际另跑相同32项并APPROVE，architecture原始字节验证CLEAR；重叠不累加。测试SHA256 `336f85e0…71afe920`，两路报告已独立保存。仅usage测试/两份文档单独交付，Google批仍未提交；新SHA CI尚待实际读取。

usage修正 `61ec1bc0a15282c56792086176d87a7e4a18a0c9` 已推送、远端SHA读回；CI `39279497980`当前in_progress，Watch `39279497944` success。Google批最终37文件/674项、14项有效反转、双构建、编译HTTP/存储探针和四格隔离TLS PTY通过；实际scope/project/secret、issuer/原生codec、unknown零重播和有序签名回放沿既有owner。29文件manifest `77a547ed…7bb8663`、类型149/149零新增；静态门/脚本59通过，NormProof0blocking/8旧advisory。独立codeAPPROVE及architecture最终绑定按日志后续记录；Google尚未提交推送或CI。subscription身份/续期及其余全部47项继续，真实环境/质量仅按用户原推迟范围。

usage修正CI `39279497980` 后续读回completed/success，Watch success。Google最终双路独立codeAPPROVE/architectureCLEAR精确绑定manifest `77a547ed…7bb8663`，严格docs门通过；综合APPROVE限本批，提交/推送及新SHA CI按开发日志后续查询记录。

## 历史实现与交付记录（不代表本次复核通过）

| 任务 | 提交 | 证据 |
|---|---|---|
| CFG-01…05 | `c7b2ec91` 等 | 配置身份/作用域/环境字段；`src/config` 测试通过 |
| PRV-01…05 | `15abda70`…`61a517ea` | 可用性、预设、账号池、刷新租约、429 backoff |
| CTX-01…04 | `46d5be7d`…`744449b6` | 消息计数、测量身份、请求预算、压缩操作幂等、四态报告 |
| TOOL-01 | `dda58393` | 动态发现、pinned/search/load、generation |
| UI-01…04 | `466f28c6`、`56594d08` | 输入区预算、两栏面板、二维命中、进度/chip、transcript 源投影 |
| CMD-01/02 | `0345b44f`、`a4deb45e` | 前缀排序、完整命令提交；102 入口审计沿用既有契约 |
| SET-01/02 | `734f51a4`、`9ce49b16` | 34 项编辑器、7 组 tab、changed 标记 |
| SET-03（预览） | `6736f402` | status/theme 预览撤销；Apply 前不写、CAS 保持 |
| PAN-02（部分） | `6736f402`、本次 | 时间分组、`Ctrl+P` pin、tree 连接线与 current focus、全屏事实/对话预览、窄屏 stacked preview、完整授权目录搜索、10k 分页批处理、pin 持久化 |
| PAN-03（部分） | 本次 | `/hub` 只读主从面板、1s journal 轮询、详情列 |
| PAN-05（部分） | 本次 | `/advisor` 只读 checkpoint/note 主从面板；`/plan-review` 增加结构化 `CommandReport`（版本/阶段/验收项/绑定状态），`/btw` 增加问题/是否送达/答案报告；两者仍只读或独立授权 |
| INPUT-01（部分） | 本次 | 五模式状态机、vimMode、Normal/Visual Enter 不提交、粘贴优先 |
| RENDER-03（补强） | 本次 | 并排 diff、配对行号、严格 rows/bytes 双预算、精确 UTF-8 边界、窄屏 unified 回退、resize 锚点、左右源复制、纯 rename 与 rename/BOM/EOL/EOF facts |
| RENDER-02（部分） | 本次 | 多行 cell、escaped/code pipe、`<br>`、最终 Markdown/HTML code-span 一致性、窄屏源码回退与预算 |
| RENDER-01（部分） | 本次 | 内联数学投影、金额/代码保护、escaped/multi-run/unmatched backtick、未知命令与超预算保原文 |
| PAN-04 | `6736f402`、`2147cb6d` | `/usage account` quota 进度投影、`/thinking` effort 选择器；exact relay/unknown/ambiguous effort 与 unknown-vs-zero quota 验收 |
| PAN-06（部分） | `6736f402`、本次 | copy 移除 recent-30 窗口；restore 生成可解析的 preview draft，绑定项目及复合快照身份，提交前重读元数据，明确失败/部分目录与取消 |
| PAN-07（部分） | 本次 | `/extensions` 为 `/plugin` 别名 |
| START-01（补强） | `0afab79a`、本次 | build manifest、五种拒绝状态、`start`/`start:dev`；轻量 `--version`/`--help`、组合参数和坏配置准入；fresh packaged gate 通过 |
| JOB-01（补强） | `dd43bcce`、本次 | 单次 spawn、detach/kill、adopt/promote、60s/新消息晋升、撤权 kill、重启 unknown 不重播；detach 后保留 settlement 与 300s 总期限 |
| JOB-02（补强） | `7da6e6d4`、`8c7f949f`、本次 | 本地 notice、opt-in follow-up（去重/预算/截断）、脱敏/reload、取消不转后台 |
| EDIT-01（补强） | `57e1ffb3`、`8c7f949f`、本次 | 稳定且绑定 baseline/hunk content/add content 的 group id、依赖分组、同文件 hunk 选集、无选集拒绝、重规划 revision、requested/selected/skipped receipt |
| START-02（本地证据闭合） | `3de906fe`、本次 | 10k 首帧不扫描；持久摘要索引；0/100/1k/10k bootstrap 不枚举探针；TUI/line 首帧 write completion 后 recovery hint；routing sink 与 transcript ownership 分离；键盘/鼠标/粘贴/picker/line 用户意图 fence；line close/stop 主动取消 MCP/SSH/collaboration/current run 并释放 goal scheduler；真实 scheduler drain 超时结算 captured host，sink 对迟到 goal dispatch 保持 discard fence；teardown sink 顺序、`runCliProcess` fullscreen 集成与 Node/exe × regular/fullscreen 两次 seeded PTY |
| PAN-05 | `2a4bafe5`、本次 | advisor 只读面板 + enable/review/apply 分别授权；plan-review 结构化报告与版本化 approve/reject/execute；btw 结构化报告、带外；面板查看不启模型，模型工作只走显式命令/普通 turn |
| PAN-03（部分） | `070f1405` | hub 本地作业输出页（脱敏/截断）、后续页指引 |
| PAN-08（历史部分实现） | `93302750` | 旧MCP逐项向导及临时定义机制；2026-10-21返工发现临时文件不在source授权范围，现已由typed原owner替代，当前证据见下文 |
| START-03（部分） | `a6ba2665` | Node/exe 与 regular/fullscreen/pipe 各 30 次首帧、命令→退出基准 |

## 部分完成（有实现，验收未闭合）

| 任务 | 已做 | 缺 |
|---|---|---|
| PAN-02 | 时间分组、pin、树形、跨项目完整授权目录搜索、10k 分页批处理、全屏事实/对话预览、窄屏 stacked preview、current tree focus、pin 持久化；Linux TUI fork/切换/确认删除组合通过 | 其余动作身份/revision 边界继续复核；restore preview 另归 PAN-06 |
| PAN-06 | copy 全量、pin；copy 100 项分页、continuation、源 revision 与 stale 拒绝；restore 100项分页/续页、全目录搜索、有界目录缓冲与记录保留、复合身份消歧、元数据digest重验、特殊路径参数及preview-only业务链；back 保留完整候选、25项展示续页、numeric/exact-ID定位、完整prompt搜索和共享捕获快照，沿既有草稿/分支回退；四格打包PTY核对60题全可达与文件不变 | history完整持久树沿既有query owner；undo saved-results已补40条续页/明确到头、scope和完整receipt revision重验，精确补偿沿原owner；copy已补完整block搜索/续页/到头/失败/取消及恢复会话早期源；其余identity/revision及资源边界继续复核；back完整候选保留/同步搜索随源大小增长，restore每页/搜索仍线性扫描目录，不宣称搜索延迟上界或原子目录快照 |
| PAN-06 history | 裸 `/history` 复用完整持久树及废弃分支，选择只生成精确 `/tree -- <entry-id>` 草稿；空历史/无匹配/读取失败分开；真实排队焦点、禁用身份与取消无写回归；底栏任务存储读取失败显示 unavailable，恢复后重新读取 | 完整树/全文搜索仍同步且未设总字节/工作量界，10k模拟节点不证明真实大历史响应界；cleanse 面板、其余 identity/revision 及资源合同继续开放；本批293项、专用故障PTY与交付证据见开发日志 |
| PAN-03 | hub 主从视图、本地作业输出页（脱敏/截断、后续页指引）、watcher 注销与 unknown status 回归；`/agents` 复用 jobs owner 的 `agentProjection`/`agentPage`，覆盖 stale/detached 与脱敏输出页 | agents 控制操作仍归 `/jobs`；其余 journal/revision 边界继续复核 |
| PAN-07 | alias、逐项确认 | login/logout 设备码安全显示的端到端验收 |
## 未闭合

START-03 已由 2026-10-23 的受控冷/热基准闭合；以下只列仍开放项。

- QA-02：Linux/macOS 各 Node/exe × regular/fullscreen/line/pipe 八格与 Windows Node/exe × line/pipe 四格在 `Platform QA` `39834842595` 全部 pass/exit 0；20 个 JSON/transcript 已完成平台、架构、target/mode、构建摘要、工具 result 与 skill payload 审计。Windows 交互 PTY、真实 IME 和系统复制仍缺环境，不把 line/pipe 结果外推为完整 Windows TUI。
- QA-03：`npm run qa:quality` 已提供 fail-closed harness、正式 20 项 corpus、隔离 MCP/extension、跨进程续接、build-bound JSON、确定性/双盲评分和 10,000 次 paired bootstrap；真实 100 pair、双盲评分和启动/性能聚合仍缺。
- TOOL-02：`/tools` 已按当前 endpoint 序列化协议声明，报告 description/schema payload、UTF-8 bytes 与 code-unit token estimate；有界 `recentRequests` 持久化 discovery purpose/input/output attribution。正式 harness 已能测同模型 turns/tool calls/argument errors/missed discovery/cache/cost coverage 与四语言 tokenizer 误差，但真实数值尚未运行。
- QA-02 的 restore preview 已在 Linux/macOS 全部 16 格及 Windows line/pipe 4 格通过，并验证文件/记录/blob 字节不变；line/pipe 已覆盖 settings 保存、命名 profile 创建和重启读回，但非交互 profile switch/approval 与 Windows TUI 的完整生命周期仍需按平台实际验证。QA-01 矩阵已补齐独立任务行，但仍不能作为 47 项全闭合证明。

## CI

- `9c8104a6`（copy 测试改为 clipboard sink）：CI success，12m28s。
- 其后的 docs/advisor/resume 提交在写本文时仍在队列中；以 GitHub run 结果为准，不能把本地通过当成 CI 通过。
- 更早的失败提交均已被后续修复覆盖：handoff 的 `todo` pin、director feature tools、settings 标签、firstFrame padding、MCP 启动超时、copy 的环境依赖。
- `57e1ffb3`、`7da6e6d4`、`f0f2f2d2` 的 CI 均因同一对取消测试超时失败（`director/runtime.test.ts`、`jobs/agent/command.test.ts`）：bash 工具改走 `startCommand` 后，测试仍 mock `executeLocally`。`0b8dcdb4` 改为 mock `startStreamed` 并让 `startCommand` 同样报告 settlement；本地全量 8473 通过，CI success（run 39061415399）。`c5da8107`（启动基准脚本与 `bench:start`）CI success（run 39062680340）。`070f1405` CI success（run 39066438514）；`93302750`、`a6ba2665`、`4631ea3a`、`8802e496` CI success。`2bdebf5a` 仅 `browser.test.ts` 的 “blocked without a manifest” 失败（本地 5/5 通过，且其后含同改动的 `4631ea3a` CI success），归为 CI 浏览器环境抖动。`ea0078ab`（索引清理）、`cd881d25`（双构建 PTY）、`df23d812`（并排源复制）、`0ea1c2fa`（预派发取消）、`a8b07008`（浏览器场景超时）、`e3217a14`（CLI 场景超时）CI success；`768903b0`（external 场景超时）CI success（run 39076664306）。`bde00a5e` 再次命中同一 baseline 管道抖动；已改为等待 `- ID:` 行，本地 40/40，后续 SHA 验证。
- `8c7f949f`、`3de906fe`、`2a4bafe5`、`b913c50e` CI success；`dd43bcce` 的 CI 仅 `cli-baseline.test.ts` 的 pipe-spawn smoke 失败（期望 `- ID:`），本地单跑 40/40 通过，且其后的 SHA 同代码 CI success，归为负载下的 spawn 抖动。
- `8ee42201` 的 CI `39460132672`/job `118757136751` completed/failure：9306 项通过、2 失败、3 跳过；两项都在 `cli-baseline.test.ts` 的 non-TTY health/golden 路径，实际原因是 `runPromptInputStream` 绕过 `runLineLoop` 后未接 first-frame/user-intent，导致 recovery hint 与聚合诊断不发布，不是单纯超时。当前工作树已接同一 lifecycle，并将 golden fixture 改为先等待 health 结果再发首个 prompt；本批新 SHA CI 待提交后实际读回。
- `921425a8` 的 CI `39470238485`/job `118792058672` completed/failure：9342 项通过、1 失败、3 跳过；失败是 `picker.test.ts` 的窄宽 footer 契约，因合并 footer 换行只保留 `Enter to …`。后续 `20e6ee61` 为窄宽 footer 增加 `Esc to close` 紧凑回退并保留 capacity 3+ 的 focused row；该失败未被改写为通过。
- `20e6ee614b4e27a3c2bb04e840a76b24d36ef540` 已提交/推送，远端 `main` 读回同 SHA；CI `39473768928`/job `118804307316` 与 Architecture Watch `39473768919`/job `118804307045` 均 completed/success。

## 启动基准（2026-10-18，WSL2，Node 20）

`npm run bench:start`：每个样本一个新进程，测 spawn 到退出的墙钟时间；首样本单列，因为无特权无法清页缓存，不能称为受控冷启动。

| target | runs | first | p50 | p95 | min | max |
|---|---|---|---|---|---|---|
| node `dist/cli.js --version` | 30 | 1991.5ms | 1030.4ms | 1074.6ms | 995.8ms | 1991.5ms |
| exe `dist/bin/cheers --version` | 30 | 492.7ms | 497.5ms | 526.1ms | 469.7ms | 528.2ms |

交互（`npm run bench:interactive`，`script` 提供 PTY 或 pipe，每模式 30 次，`/exit` 在 1200ms 注入）：

| mode | first frame first | first frame p50 | first frame p95 | `/exit` 后退出 p50 | p95 | 命令→退出 p50 | p95 |
|---|---|---|---|---|---|---|---|
| regular | 1041.4ms | 1054.6ms | 1086.0ms | 1361.4ms | 1395.5ms | 157.5ms | 190.5ms |
| fullscreen | 1055.6ms | 1061.0ms | 1139.0ms | 1365.3ms | 1391.1ms | 161.1ms | 187.1ms |
| pipe | 1081.5ms | 1035.7ms | 1082.0ms | 1402.3ms | 1682.6ms | 198.8ms | 480.6ms |

此处旧基准未测受控冷缓存；2026-10-23 的 GitHub `Performance` 运行已另行补齐同机 warm/cold 证据，不能把本表旧 warm 数据与那次 cold 数据混在一起。

## 本地全量

- `0b8dcdb4`：850 文件、8473 通过、1 跳过（`npm run test:ts`，410s）。

- 最新 `test:ts`：8459/8459 通过（fresh dist，含 INPUT-01 与 receipt 去重修复）。
- `test:scripts` 59 项、`verify:import-cycles`、`check:config-consumers`、`check:declarations`、`check:node-floor` 通过；`verify:docs-drift:strict` 只有既有 advisory。
- 全量套件曾暴露的真实缺陷均已修复：`todo`/feature tool 未进首请求、settings 标签、firstFrame padding、MCP 启动超时、copy 环境依赖、并发 receipt 重复。

## 当前门禁

`verify:import-cycles`、`check:declarations`、`check:config-consumers`、`check:node-floor` 通过；`verify:docs-drift:strict` 只有既有 advisory。全量 `test:ts` 结果以运行日志为准。

Google批 `311573ca63f7cbd6e8e4b8d8f417ebc34d83a7a7` 已推送、远端读回；Watch `39284913470` success。CI `39284913496`/job `118168018187` completed/failure：9107通过、2失败、3跳过，失败仅Google畸形JSON SSE旧stop期待。新合同拒绝工具/签名权威，测试/文档单独校正；新SHA结果以日志实际证据为准。Copilot身份/续期与全部47项继续，Anthropic订阅方向按官方第三方应用限制和项目身份边界修正为API-key路径，尚未交付。

### 2026-10-20 返工审计与 Copilot 修复

- Copilot 未提交批次发现并修复：Messages 路由应为 `/v1/messages`；account-auth 头必须按大小写不敏感合并，避免重复 `Content-Type`；Copilot readiness 必须携带 gateway identity 头；省略 endpoint 时允许 native default；设备码流缺 progress 回调不再抛错；Copilot 403 不再被误报为 API-key 失效。
- Copilot 原生登录到持久化 grant、再到 `renewStoredAccount` 的合成链路已加入回归；wire 解析、redirect、proof、base URL 与 issuer 校验仍保持拒绝路径。
- 本地 Copilot 聚焦集 8 文件/113 项通过；renewal/connect/provider 相关集 7 文件/185 项通过；Node/exe 双构建、脚本 59 项、四项静态门禁和 strict docs drift 通过（118 条既有 advisory）。
- Linux PTY smoke 四格通过：Node/exe × regular/fullscreen 均完成 `/tools`、`/sessions current`、`/exit` 并退出 0。
- 全量 `test:ts` 运行 9,120 通过、1 跳过、5 失败；五个失败均为 browser scenario 负载下失败，逐一隔离复跑全部通过，因此本轮不能记作全量绿。相关测试文件为 receipt、cache、skills、healing 和 external handoff。
- 当前批次尚未提交/推送，不能把本地证据当作新 SHA CI；`ec658966` 的 CI `39289335200` 与 Watch `39289335408` 已读回 success。

### 2026-10-20 W7/W8/W9 与 TUI 输入/渲染返工

- 当前基线为 `10f4b579`。本批修复 build manifest 输入/emit/资产绑定、不可变构建、原子 pointer、lock-owner 事务恢复、CLI 硬门禁、同文件多 hunk 选集、后台任务结算/脱敏/reload、首帧 session catalog 扫描，以及 TUI 多反引号表格、raw fallback 字节预算、UTF-8 chunk、字素保持和 Vim 纵向边界。
- build lock 现在由恢复与发布共用：恢复先原子取得锁；active、stale、malformed lock 均 fail-closed；发布必须提供自己的 owner，编译期间 lock 被替换时拒绝发布且不删除替代 lock。stale lock 需人工确认后清理。
- `StdinBuffer` 对跨 chunk 的完整字素使用 8 ms hold，覆盖 ASCII 标点、combining mark、keycap、ZWJ、escape/paste 后文本；控制键不延迟。`InteractiveMode` 复用注入 scheduler，避免测试与生产出现两套时间源。
- JSON CLI 硬门禁验证真实 read 输出、stdin 加 prompt、单 hunk `apply_patch`、default-deny、失败后续、session migration 和 packaged entry；负例覆盖 `success:false`、approval/result 乱序及顶层 `toolCallId` 错配。
- 聚焦 TUI/input/editor/render/HTML/InteractiveMode 套件 11 文件/266 项通过；`scripts/start.test.mjs` 30 项、`scripts/verify-cli-entry.test.mjs` 4 项及其余脚本合计 91 项通过。
- browser/CLI 场景串行 34 文件/214 项通过、1 跳过。非 browser/CLI 完整车道 860 文件/8,983 项通过、1 项失败；唯一失败为既有 `grepPaths` 夹具 `spawn ETXTBSY`，该文件单独复跑 12/12 通过，不能记作该车道全绿。
- 当前源码双构建通过：TS manifest `0ca9903c8a39c2771befc377c316d1f93a1e41eed51e7883b2ca954b62b50094`，1754 个 emit 文件；exe 102,574,208 bytes、SHA-256 `c516f9f1c6c61e036a4ab41b02de2353ac092ef79dda885a28624fe72d253fd6`。Node CLI、exe、`start` 均输出 `0.1.0`。
- `verify:cli-entry` 全项通过；Linux Node/exe × regular/fullscreen PTY 四格通过。严格 docs drift 通过并保留 118 条既有 advisory；NormProof blocking unresolved-specifier 义务 satisfied，仍为 8 项既有函数上限 advisory。
- 首推 `96fae26d877a6d162c0f9909d3726969ca6c635d` 的 Architecture Watch `39397906660` success；CI `39397906657`/job `118545101287` 在 `test:scripts` 唯一失败：Node 20.3 下假 `tsc` fixture 被 `type:module` 当作 extensionless ESM，退出 1。夹具改为显式 CommonJS 后提交 `116639111a491b063904eb502c55f2b749f7df32`，远端 main 已读回。
- 修复 SHA 的 CI `39398373664`/job `118546643247` completed/success，耗时 16m49s，893 个测试文件通过、1 跳过；Architecture Watch `39398373370`/job `118546640910` success。旧 SHA 失败保留，不改写为通过。
- 全部 47 项 Phase 20 范围继续 active。

### 2026-10-20 二次返工：启动、任务、编辑、渲染与 copy

- 独立只读审计确认旧“只剩 4 项”仍不成立，并给出可复现反例。本批没有把实现存在当成验收通过；下列结果均为当前工作树实际运行。
- START-01 入口已拆分：`--version`/`--help` 在加载 `cliProcessRunner` 与 runtime 图前返回；`--profile default --help`、`--help --print` 也按 help 处理，`--` 后的同名文本仍按普通输入。`startup.test` 新增 0/100/1k/10k bootstrap 不调用 `listSessions`，并覆盖缺失显式配置仍在 bootstrap 前拒绝。
- JOB-01 现在把晋升后的总期限传到 `startCommand`/`startStreamed`，`detach()` 只释放前台 abort 绑定而保留 deadline，`stop` 等待 adopted settlement；JOB-02 每次 completion 重新读取 enable 策略，命令与输出均先脱敏。JOB 聚焦测试为 `local.handle` 4 项、`journal` 19 项、`backgroundNotice` 6 项，另 `service` 8 项与 `promotion` 4 项通过。
- EDIT-01 现在把源基线、hunk indexes/content 与 add content 纳入 group identity，选集重建时校验基线，并在 receipt 中同时记录 requested/selected/skipped IDs；同文件双 hunk、依赖组、源变化、同基线内容变化和 stale revision 均由 `batch` 38 项覆盖。
- RENDER 侧修复：diff rows/bytes 均严格受限，ASCII/UTF-8/CRLF/尾换行精确边界不误截断，文件头与 removed/added 分离，side-by-side sources 与 rows 对齐，纯 rename 和 rename/BOM/EOL/EOF facts 可见；数学、表格、Markdown 与 HTML 共用有界 inline token 解析，区分 escaped/multi-run/unmatched，link label 内 code 可达，强调可跨 token 闭合，64 KiB 边界内 64k backtick/escaped-math run 线性处理，超 1 byte 原样保留，80k bracket/60k private-use run 受预算保护，label 内不生成嵌套链接，code 内不解析公式、链接或强调。math/table/diff/markdown/html 合计 122 项通过。
- PAN-06 copy 首屏改为 100 项有界页，提供明确 continuation、source revision 和 stale selection 拒绝；1001-block、下一页与 revision 变化均有回归，`copy` 3 项通过。
- 多轮定向反转分别产生 10、4、3、2 个实际失败：撤销 `stop` settlement、timeout 传播或 detach deadline 后 JOB 用例失败；把函数型 follow-up policy 退化为布尔值后 reload 用例失败；合并同文件 hunk、移除 hunk/add content identity 后 identity 用例失败；恢复 escaped/multi-run 误解析、link label 不递归、固定多计换行字节、纯 rename 早退或把 `---`/`+++` header 当改动后，最终 renderer 与 diff 边界用例失败；强制 bootstrap 调用 `listSessions` 后 0 会话探针失败。反转源码已恢复，`git diff --check` 通过。
- 最终受影响 14 文件/303 项通过；fresh TS 构建 `fae6df0de84b`、exe 102,615,168 bytes/SHA-256 `a2ad338ad80429db850e5c98e930d19d8b63d9167ed87aaae0dcd3400a7de70d`，`verify:cli-entry` 全项与 Linux Node/exe × regular/fullscreen 四格 PTY 通过。`test:scripts` 91 项、TypeScript、import cycles、config consumers、declarations、Node floor、strict docs drift 与 `git diff --check` 通过；docs drift 保留 118 条既有 advisory。
- 本批提交 `a425420aafdc46140075e4b4560c53727f929212` 已推送、远端 main 完整 SHA 读回。CI `39413554234`/job `118596969632` completed/success（16m12s）；Architecture Watch `39413554208`/job `118596969793` completed/success。该证据绑定上述精确 SHA，不改写此前任何失败记录。
- 该历史节点仍未闭合：START-01/02 的新提交/推送/精确 SHA CI；RENDER/PAN 其余消费者仍按原合同复核。START-03、QA-02/03、TOOL-02 当时按用户允许的环境/真实模型项继续延期，不把本轮合成测试替代它们；START-03 已于 2026-10-23 后续闭合。

### 2026-10-20 START-02 首帧恢复提示与用户意图 fence

- `createStartupRecoveryHint` 是 one-shot lifecycle：TUI 只在 `onFirstWrite` 后启动，line 模式只在 prompt write callback 后启动；键盘、鼠标、粘贴、picker apply 与 line 原始输入只推进一次 interaction revision，最终 publish 前再次校验 session/project/config/interaction generation。line close/stop 也推进 fence，delayed callback/result 被显式失效；recovery/startup logger 抛错不会再形成 rejected promise。
- `StreamingRenderer` 区分 `captured`（输出已路由）与 `transcriptOwned`（host 自己绘制 turn chrome）：line mode 为 `captured=true`、`transcriptOwned=false`，因此 turn boundary 保留且 `/sessions` 仍走非交互 overview。line close/stop 主动 abort MCP signal、取消 SSH/collaboration pending、取消 current run 并 detach goal scheduler；真实 scheduler drain 超时只结算一次 captured host。若 goal dispatch 尚未真正 settle，line sink 保持安装并在 `goalOutputActive=false` 时丢弃迟到输出，dispatch settle 后才恢复旧 sink。
- line close/fail 的同步/异步错误统一进入 `failLineLoop`：关闭前 rejection 会让 loop reject 并撤销 signal close handler，正常 EOF 后的迟到 rejection 只记录、不把成功关闭改成失败；cleanup 各阶段与 logger 自身异常均不能阻断 sink 恢复。
- MCP `snapshot/refresh` 将 signal 贯穿到 client connect/listTools；collaboration 的 inspect/test/receipt/start/join/ACL/stop/share/propose 以及 expired-ticket refresh/poll 都继承 host pending signal，claim/dispatch/ACL 保持 mutation 语义。
- `runCliProcess` 集成测试覆盖 fullscreen 与 line visibility、startup notice router、first-frame 触发和真实 recovery hint wiring；hint 进入 interactive transcript，且不直接写 `process.stdout`。
- 聚焦回归 14 文件/157 项通过：streaming 7、cliStartupSurface 3、startupNotice 4、recoveryHint 10、startup 5、cliProcessRunner 2、firstFrame 22、interactiveLoop 5、lineLoop 28、lineLoopGoal 2、interactiveMode 43、cliCommandExecutionBridge 12、cliMcpModule 5、collaboration/command 9。另有真实 gateway abort、真实 scheduler captured-host/drain 和 guest expired-ticket abort 定向测试通过。
- 8 项定向反转均取得实际失败：sink gate、scheduler drain settle、guest parent signal、MCP signal forwarding、collaboration signal forwarding、recovery logger isolation、close-handler settle、line-handler failure cleanup 与失败路径 signal release；源码均已恢复并复跑通过。
- 本轮较早一次全量 `npm run test:ts` 实际为 9213 passed / 49 failed，耗时 605s；失败集中在整套并发下 20–45s 子进程超时及 CLI baseline 争用，不计为全量绿。最终修复后未重跑全量，交付前仍以精确 SHA CI 为准。
- fresh TS build `bd5cc4951f3938e316dcbc7fb3b46e829d49a93ce7a684d88ad121406bbf5448`，inputs digest `a2bd5f4a4e3b166b719c839b52776b415f44d6ae3c7065e084103288300d0d2c`，artifact digest `25044855dbdd183cdfd8ac5476f8afde2261bf9e72b3af2088fa15be08d43568`；exe 102,668,416 bytes、SHA-256 `b8060dd8a4ca6d6a56a380f766ed44b0aa072c59c6626b05218d3dc2356778f4`。`verify:cli-entry` 全项通过。
- `qa:pty` 连续两次通过 Node/exe × regular/fullscreen 四格：等待首帧与 seeded `Recovery hint`，`/sessions current` 输出与 startup 标题匹配精确 current id，`/tools` picker 打开后 Esc 关闭，再 `/exit` 并以 exit 0 证明输入已回到 prompt。
- `test:scripts` 91 项、import cycles、config consumers、declarations、Node floor、strict docs drift 与 `git diff --check` 通过；docs drift 保留 118 条既有 advisory。`normproof` 命令在当前环境不可用，未记为通过。

### 2026-10-21 START-02 独立复核返工与 PTY 隔离

- 独立复核复现了三个产品缺陷并已修复：line prompt write callback / stdout `error` 的异步失败原先只记录 warning，可能让循环永久挂起；MCP gateway 在队列等待阶段忽略 abort，关闭会被前序请求拖住；PTY smoke 继承 `CHEERS_HOME_OVERRIDE`、provider 凭据和 XDG/Git 配置，可能绕过临时 HOME。line 失败现在统一进入 rejection；MCP `run` 让排队请求与 signal 竞速且不会在取消后启动发现；PTY 子进程使用隔离的 home、test root、XDG、TMPDIR、Git 配置与 provider 环境。
- 新增的异步写失败、stream error、MCP queued abort、PTY 环境隔离和 sink 恢复 marker 回归均通过；聚焦集 4 文件/50 项、脚本 92 项通过。`qa:pty` 在隔离环境下 Node/exe × regular/fullscreen 四格通过。
- `/tools` 报告现在把 description/schema UTF-8 字节列和汇总写进普通文本，而非只藏在 `facts`；token 仍明确为 `not-measured`，真实模型质量/缓存/tokenizer 项保持未验。
- 全量 `npm run test:ts` 本轮实际出现 20 项失败，全部集中在 browser CLI 子进程场景的 exit-code/输出缺失；将同一组 11 个失败文件以 `--single-thread` 串行复跑得到 85 项通过、1 项跳过，说明并发负载下的场景夹具失败仍需在 CI/串行车道单独观察，不能记为全量绿。
- fresh TS build `c80b84f0d7af`，inputs digest `9c5cafc1dd17`，artifact digest `4bb084c80969`；exe 102,668,416 bytes、SHA-256 `9420876813f3`。`verify:cli-entry`、`start --version`、import cycles、config consumers、declarations、Node floor、strict docs drift、`git diff --check` 均通过；docs drift 保留 118 条既有 advisory，module facade 保持 8 项既有 advisory（本批触及的 lineLoop 未新增越界）。仓库 tgz 的 NormProof 实际退出 0、verdict partial，blocking unresolved-specifier 义务 satisfied，仍为 8 项既有函数上限 advisory。
- 本批尚未提交/推送；新 SHA CI、最终独立复核和远端结果仍待实际读回，不把工作树结果写成交付完成。

### 2026-10-21 PAN-02 搜索/预览与 non-TTY recovery 修复

- `/resume` 现在使用 full-screen panel；`Picker.fullScreen` 允许 panel 保留两栏并占满帧。session picker 从 catalog summary 渲染当前/选中会话的项目、状态、时间、文件大小、pin、首问和末答摘录，摘录各限制 1200 个 code point；窄于 60 列时使用 stacked preview，footer 先折行而不是丢弃状态。
- 本地过滤不再只搜索已加载的 40 项：picker 的 debounce search port 由 `OverlayHost` 统一持有 generation/AbortController/timer，旧 query 或 scope 的 late result 不能回填；session listing 扫描完整授权目录后分页匹配结果，文件大小按 41 项 batch 采样，显式区分 searching/partial/complete/no-match/failure。search 结果保留首屏外 identity，`more` 可继续搜索分页并携带 query。
- tree picker 以当前健康 entry 为 initial focus，unavailable entry 仍 disabled；pin/unpin 经既有 metadata owner 原子写入、读回确认，并验证 transcript/state 字节不变。
- non-TTY live stdin 不再绕过 recovery lifecycle：`runPromptInputStream` 在启动输出后报告 first frame，在首行输入时推进 user intent；`printModeRouter`/`cliRuntimeModule`/`cliProcessRunner` 传递同一 hooks。取消 recovery hint 不再吞掉已发现的 unreadable-directory 诊断；golden fixture 在首个 prompt 前等待 health 结果，避免把 fence 误当成产品成功。
- 聚焦 13 文件/186 项、完整 `cli-baseline.test.ts` 41/41、`test:scripts` 92 项通过；import cycles、config consumers、declarations、Node floor、strict docs drift、`git diff --check` 通过，docs drift 保留 118 条既有 advisory，module facade 保持 8 项既有 advisory。fresh TS manifest `6c1e9a7232ce`，exe SHA-256 `687d4c069b0e0c1496fdccd883a166d29f6a9733cc2d1c067e09818c22c7aaa8`；Node/exe × regular/fullscreen PTY 四格、`verify:cli-entry` 19/19 通过。仓库 tgz NormProof 退出 0/partial，open obligations 为 0，保留 8 项 proof gap/既有 ceiling advisory。
- 该历史节点仍未闭合：fork/restore/delete 的组合 PTY 验收；START-03 的真实 ready/key/event-loop/raw sample/受控冷缓存当时仍缺，QA-02 的 line/pipe 五条业务链和跨平台/IME 仍缺，QA-03/TOOL-02 真实质量与 tokenizer 仍未验。本批 `20e6ee61` 已提交/推送，CI 与 Watch 已按精确 SHA 读回 success；START-03 已于 2026-10-23 后续闭合。


### 2026-10-21 QA-02 业务链与 START-03 测量返工

- `qa:pty` 已扩至 Linux Node/exe × regular/fullscreen/line/pipe。TUI 合成链覆盖 seed recovery、fork、新旧会话切换、显式确认删除、resume/tools 关闭、bash、task、tool_search/tool_load/skill、逐次审批、settings 写后读回和 profile 重启后命名目录 session 读回；line/pipe 覆盖任务/发现/显式 allow-once 与 settings 文件字节不变。最终八格 exit 0，持久 transcript 按工具名、call ID、success 和实际 payload 关联。
- 修复合成驱动跨轮次复用 call ID，以及旧 outstanding call 在新实例中被重新派发、无关 tool result 推进计划的问题。意图解析归 `turn/intents.ts`，入口只组装；持久 tool call 使用既有 function 形状，不新增执行路径。
- 新 benchmark 区分首帧/输入提示/TUI listener/write/批处理首答/命令退出，键响应关闭 PTY echo 并等待完整 UTF-8 字符。原来首 chunk 命中、字段误读和旧构建拒绝的失败记录保留。最终基准保存8组各30次共240个原始样本与机器/构建摘要；runtime-ready、1000项列表和复杂stream阻塞、分位数不确定性当时仍未验。受控冷缓存随后由 2026-10-23 `Performance` 运行补齐，不改变本条历史状态。
- 聚焦 7 文件/86 项通过；脚本 96 项通过，两种构建通过；静态 cycles/config/declarations/Node floor 通过。独立 code APPROVE、architecture WATCH，WATCH 为仍缺的验收指标、采样 histogram 与构建前后摘要的证据边界。本批提交/推送/CI 状态以日志中精确 SHA 读回为准；全部47项仍保持原范围复核。
- 全量 TypeScript 实际为 9348 passed / 1 failed / 10 skipped（412.74s、exit 1）；唯一失败是 MCP 畸形配置四次 CLI 启动在并发下超过25秒。相同用例隔离 `--single-thread` 复跑 1 passed（16.63s），原失败日志保留，暂归并发负载夹具超时，不记为全量绿。

## 2026-10-21 `/back` 最终修正与交付边界

- 修正已推送初版的 selector/filter 缺口：exact stable ID 优先于 prompt 子串；数字按全局 newest-first 位置定位；文本查询扫描完整 prompt/ID 后再分页，改变查询回首页，续页保留查询。所有页共享捕获候选，continuation 避让真实 ID，apply 仅接收当前提供的单项。
- 最终受影响6文件/153项、生产TypeScript、TS/exe双构建、四项有效反转、四格专用打包PTY、八格smoke、97项脚本和19项入口检查通过；独立代码APPROVE、架构CLEAR，三文件hash绑定一致。PTY验证取消保持原分支、确认持久化目标leaf/草稿、60条原消息保留及工作区文件字节不变。
- 初版 `163b1607` 的 Watch `39542097301` success；CI `39542097297` 在Ubuntu 26.04安装Chromium失败，TS测试与NormProof未运行。独立提交 `5b885bce` 固定Ubuntu 24.04并保留Node 20.3及全部步骤；`/back`最终修正已推送为 `16b030ec727a47f92f595d5ff1ce2b7b59ec51d8`，Watch `39543032753` success；CI `39543032739`于`2026-10-21T04:27:15Z` completed/success，9387项通过、3跳过、1文件跳过，NormProof步骤通过。PAN-06及全部47项范围继续active。

## 2026-10-21 `/undo` saved-results 完整可达

- 面板与直接命令共用recovery undo域的40条分页；`/undo status --cursor=…`和More saved results可到旧记录，末页明确结束。游标绑定profile/session/workspace及完整receipt值；翻页/选择前复核，变化明确stale，不回填旧会话。按operation ID直接查询继续覆盖完整账本。浏览/取消不调用restore；精确预览、显式确认与逐文件partial/unknown结果沿现有owner。
- 本地10文件/271项（分三条受影响命令）、四项有效反转、生产TypeScript和TS/exe构建通过；四格Node/exe TUI及直接print命令均验证85条/三页完整有序可达、最旧单项可读、取消及工作区/receipt字节不变。新SHA交付按日志实际更新。40条仅约束展示页，账本仍全量同步读/hash；不承诺总I/O或延迟上界，PAN-06继续部分。
- 最终19项入口与八格smoke通过；独立代码APPROVE、架构WATCH，综合COMMENT，七文件hash绑定一致。WATCH保留全账本同步读/hash及receipt内文件数成本；没有总资源/延迟承诺。

## 2026-10-21 `/copy` 完整恢复源与边界

- 完整block文本先搜索再分页，每页最多100个block；查询变化回首页、续页保留查询，所有页共享捕获源及revision。单选只接受当前提供的精确ID，末页拒绝继续；复制清除旧raw argv并沿既有native/OSC52 owner报告实际结果。取消无复制，native失败且仅发出OSC52仍只报告offered。
- 打包205条恢复会话探针先复现真实缺陷：history owner仅保留最后60个重建block，copy分页无法到达早期源。现由相同history投影保留earlier blocks交给Transcript，copy显式读取完整重建源，显示窗口仍60；clear释放两部分并推进revision。未新增磁盘reader。历史源是现有重建Block.text，不能冒充SessionMessage字节级原文或独立diff字段导出。
- 最终受影响8文件197项、生产TypeScript、fresh TS/exe、六项有效反转通过；四格专用PTY现均可搜索205条、跨三页到头、取消零OSC52，确认最旧源仅offered，文件/分支/205条持久消息不变。完整源保留、同步搜索和关闭后overlay callback持有源的成本仍未给上界；独立复核/交付按日志最终证据记录，PAN-06与47项仍active。
- 最终五文件独立代码APPROVE、架构WATCH，综合COMMENT；hash匹配。八格smoke及NormProof blocking gates通过（整体partial/8旧advisory），最终新SHA交付另记；页面行数不代表资源保证。

## 2026-10-21 浮层关闭后释放源快照

- OverlayHost取消与普通/快捷键/表单确认共用本域释放：丢弃OptionModel及筛选闭包、baseOptions、输入表单与行映射，abort加载/搜索并注销订阅。接受前捕获已验证ID和空多选语义；保留accept revision以交接下一页，取消仍推进revision并撤销预览。
- 本地9文件241项、四项有效反转、strict TS/exe双构建、静态门、NormProof blocking门通过。隔离compiled模块4路径/24对象WeakRef+GC核对不再由host持有；这不等于进程总内存/搜索延迟上界。四格205源专用PTY通过，完整源与query继续可达，取消零clipboard、原文件/分支/消息不变。最终smoke/入口/独立复核和交付按日志实际更新。
- `/undo`提交`9dfdaf2513d9e11f0983a20372174402025818c6`的CI`39543768435` / job`119037205415`于`2026-10-21T04:36:47Z` completed/success，Watch`39543768378` success。`/copy`已推送`588efa2bfa06a27030494b55cb70e488fd23f15c`并读回remote main，Watch`39544701897` success；CI`39544701974`仍运行，不借用其他SHA结果。PAN-06和47项继续active。

- 浮层批最终独立代码APPROVE、架构CLEAR，综合APPROVE；三源hash一致。最终19项入口和八格smoke全PASS，strict docs drift及diffcheck通过；完整源常驻/同步搜索成本仍WATCH，未据此闭合PAN-06。

## 2026-10-21 `/pin` 独立入口返工

- 源码复核发现旧状态中的“pin已做”只覆盖resume里的Ctrl+P，`/pin`没有picker映射；新增裸命令薄入口，复用sessionPicker目录/预览/完整授权搜索与现有元数据CAS。Enter只调用pinSession并携带offered version，确认改变后重新读回同一面板/query；失败保留owner原note，取消零写，参数形式保留原直接命令。
- 本地最终6文件251项及生产strict TS/静态门通过，真实元数据集成验证pin/unpin、外部更新拒绝、活动身份与state/transcript不变。初次夹具误把目录首个增量当最终结果，后一次误断言unpinned序列化为false；现分别按真实订阅与省略false的既有codec精确验证。双构建/打包/独立复核/交付依最终日志，不借用旧证据。history和cleanse仍缺独立面板入口，PAN-06不闭合。

- pin最终四项有效反转、fresh TS/exe、四格专用PTY、八格smoke和19项入口全通过；独立代码APPROVE、架构CLEAR，综合APPROVE，五文件hash绑定。四格验证真实pin/unpin、取消不写、stale拒绝、直接参数，以及活动会话/state/transcript/工作区不变。copy提交`588efa2b`的CI`39544701974`于`2026-10-21T04:46:39Z` completed/success，9398项通过/3跳过；其Watch亦success。pin新SHA交付继续按实际更新。

## 2026-10-21 `/cleanse` 保留诊断面板

- 裸命令现沿原security owner的结构化快照和发布事件，浏览保留扫描/修复证据；诊断参数形式仍走原命令，选择只生成带引号的精确诊断草稿。打开/搜索/关闭不启动分析或修复、不取消执行、不写会话或文件；运行中无待处理overlay时可打开只读面板，审批/排队控制继续保留。
- 身份与内容hash在选择前复核；live、无owner的pending→unknown、durability unknown分别保留；外部更新/存储不可用/恢复由视图订阅观察，关闭释放计时器和原owner监听。普通同绑定session对象刷新保留process-only未知receipt；同ID换根使旧视图stale，重开绑定新owner。
- 独立复核发现并修复任意保留remediation status的控制符/凭据泄露、草稿target的C1/凭据绕过，以及缓存换根恢复和同绑定未知证据丢失。最终8文件203项、13项有效反转、生产strict TS、双构建通过；四格Node/exe × regular/fullscreen验证96条记录、全文细节搜索、确认仅草稿、取消零写、实时故障恢复和外部更新。完整日志、独立复核和最终交付按开发日志实际结果记录。
- 资源合同仍WATCH：每秒同步读取完整session、解码/hash再去重；4MiB/32/64是持久owner限制，保留durability unknown影子证据可超过它们。没有进程总内存、累计I/O或响应上界证据，不据此关闭PAN-06或收窄全部47项范围。


## 2026-10-21 `/login` 与 `/logout` 面板入口（PAN-07 部分）

- 裸login经provider/实际支持的account method及cancel缺省确认复用原可取消命令host；API key只产原命令草稿。logout逐条列primary saved connections，完整身份不按label/provider推导；安全投影不含凭据，精确确认带原ConfigEdit进既有writer。打开/取消不写，配置/publication/owner变化拒绝，原writer保留并发冲突与unknown语义。参数与非交互路径继续原路由。
- 独立复核发现的compatible relay重复行与flag-shaped saved ID拒绝均已修复。最终6文件253项、strict TS、fresh双构建、七项有效反转、四格专用PTY通过；真实删除只影响选定连接，state/transcript/metadata/工作区原字节保持。原生账户取消合成测试为pending→error，不声称真实登录已验收。证据与精确交付见日志。
- 代码APPROVE/架构WATCH，综合COMMENT：全配置同步读取/哈希/availability投影尚无资源上界；没有据此关闭PAN-07、其他面板或全部47项。debug/plugin与完整认证生命周期仍按原裁决复核。上批cleanse的精确SHA CI/Watch均success，本批提交/推送/新SHA结果分别取证。

## 2026-10-21 `/debug` 只读诊断入口（PAN-07 部分）

- 裸入口从唯一CommandSyntax生成summary/logs/crashes/metrics/timings/tools静态菜单；打开/取消不读取诊断源、不写入。显式选择复用原观测及报告owner，参数与非交互形式保留。崩溃诊断在解析前限制1MiB，区分missing/invalid/over-limit/unreadable与混合无效记录；原崩溃兼容读取仍保留全部记录。缺工具池、不可读日志/指标/崩溃在UI及facts保持unknown/null及来源status，计数不冒充历史总量。
- 独立评审查实并修正原始指标/工具元数据泄露和先截短后脱敏的key前缀泄露；分组、策略和字节成本仍由原始身份计算，再生成安全报告。原admission在选择前/读取后重验，host按原绑定、overlay revision及stopped状态拒绝迟到发布；读取目录时不持有输入锁，Ctrl+C仍可取消正在进行的任务。
- 最终269项受影响测试、9项报告持久化/codec回归、14项有效反转及生产strict TS通过。四格Node/exe专用PTY覆盖菜单/no-match/取消、六视图及直接不可读来源；显式查看只增安全command-output，无模型消息，配置/工作区/state/metadata原字节保持；Linux八格通用smoke和19项CLI入口通过。中间stale build及探针选择/分页断言问题保留失败证据，最终结果见日志。
- 代码APPROVE、架构WATCH，综合COMMENT；两报告21文件hash与最终双构建已读回绑定。全目录同步枚举/逐文件tail和完整catalog仍无全局资源或延迟界，不据此关闭PAN-07。前批认证SHA的CI已success；本批commit/push/新SHA CI各自取证。plugin/extensions及其余47项继续原范围复核。


## 2026-10-21 `/plugin` 与 `/extensions` 原运行时管理（PAN-07 部分）

- 修复真实pickerHost漏接运行时而走legacy的问题；结构化view只读原ExtensionService/store/source，两个alias同状态。单package inspect、精确release安装/更新、retained rollback、workspace启停、独立grant/revoke、uninstall逐条cancel缺省确认，继续使用原签名/lifecycle/普通审批与command cancellation；提交及审批后的writer前复核原snapshot/source/config/session/workspace，不改非交互与参数路由。
- package/source/activation/grant/durability分别投影，source unavailable不抹掉package，state unreadable不冒充空集。原service保留实际卸载cleanup unknown，同store实例重开仍可见并拒绝fresh mutation；不声称跨restart/rebind持久化。修复多行预览neutralise丢布局；安全投影不改精确执行身份。
- 最终受影响6文件208项、strict production TS、TS/exe双构建、12项实际断言反转、四格专用PTY与八格通用smoke、19入口、97脚本及静态门通过。专用PTY取消无写，真实enable审批只新增4条原权限/工具事件，无model消息且grants仍空；不以审批后状态逐字节不变为合同。原错误探针与测试失败独立保留在log。
- 独立代码APPROVE/架构WATCH，14文件hash与构建实际绑定。全量同步获取/解码/hash/projection在dedup前、post-read大小检查无总资源/延迟上界；未知receipt仅原store实例内存。完整面板生命周期、真实registry/平台与全部47项仍须继续复验；前批debug精确SHA CI/Watch成功，本批交付另取新SHA证据。

## 2026-10-21 原生浏览器登录取消与进度（PAN-07 部分）

- 复核真实命令→provider contract→共享OAuth flow，发现OpenAI/Google wrapper虽透传options，但原flow既不消费signal也不调用onProgress。现由原OAuth owner统一控制整次期限与取消，覆盖localhost bind、浏览器等待、回调及token headers/body，迟到结果不能成为已连接凭据；pre-abort在pending配置写入前拒绝。原条件写、native proof、refresh enrollment与保存unknown不换owner。
- 授权URL先校验安全HTTPS/无userinfo、fragment或原始控制符再展示，launcher缺失不产生未处理错误；手动URL仍可用。回调页仅报告收到授权，后续token交换及保存由终端结算。独立复核发现并修复DNS bind阶段的取消延迟，实际延迟lookup探针证实取消立即结算、无fallback/迟到监听。
- 最终175项受影响测试、strict production TS、TS/exe构建、九项有效反转通过；四格专用PTY覆盖面板和参数原生取消，取消缺省确认零写，已启动取消pending→error、不保存凭据、回调端口释放、peer连接及session原字节不变。正常exit按原owner终止state并只追加run-terminated；八格通用smoke及19入口通过。探针与负例失败分类及构建/源码绑定见log。
- 独立代码APPROVE、架构CLEAR，六文件hash均读回一致。这里只证明合成本机认证生命周期；真实授权、系统浏览器关闭、已派发服务端token撤销及完整PAN-07/其余47项仍未闭合。前批插件精确SHA已commit/push且CI/Watch成功，本批新SHA另取证。

## 2026-10-21 扩展注册有界获取与父路径竞态（PAN-07 部分）

- 状态/来源从整文件读取后检查字符数，改为复用原 `core/workspace/files.ts` 有界描述符读取；获取前分别限制8MiB/1MiB，解码后仍检查原2Mi/256Ki UTF-16限额，合法Unicode范围保留。来源明确拒绝叶/祖先链接、非普通文件和非法UTF-8；原state早已拒绝链接。缺失仍无写空集，不可读state为unavailable，来源不可读保留包并显示trust unknown，恢复重新读取。
- 独立架构复核实际复现共享reader在检查后把被替换父目录canonicalize为新根；现从原绝对路径的filesystem root检查，保持原词法路径直到描述符比对。同inode父目录链接替换仍拒绝；普通文件在首次权威观察前被替换不属于普遍竞态拒绝保证。初始BLOCK和修复后报告保留，未用旧四文件批准替代最终六文件复核。
- 受影响集合去重19文件222项通过（主集合108、直接consumer84、补充30；共享16项只计一次），strict production TS、双构建、10项有效反转、四格专用PTY、八格通用smoke及19入口通过。四格证实超大来源unknown/超大state unavailable/恢复、取消无写及原普通审批；精确构建、hash与命令证据见log。
- 独立代码APPROVE/架构WATCH，综合COMMENT；两份报告的六文件hash均读回匹配。每秒全量解码/hash/projection与累计成本、unknown仅实例内存仍WATCH，未据此关闭PAN-07或47项。原生认证已提交推送`4a7b656267b631c43a703c55d6046a93f3d5cbe8`，Watch success；11:59Z前最近读回的精确SHA CI仍in_progress，本批交付及新SHA另取证。

## 2026-10-21 MCP 添加向导原审批链（PAN-08 部分）

- 复核发现旧向导把整行命令放进executable、默认确认添加，且host在系统临时目录生成定义文件，随后被原source授权拒绝。现单独采集executable与有界JSON字符串argv，typed definition进入原MCP配置owner；普通文件命令保留source授权/身份与文本重查，scope/trust/普通审批/精确字节发布及unknown语义仍由原路径承担。
- 每步要求offered、有效单项及一次消费；review默认取消，提交前消耗，原session/root/substrate admission贯穿等待审批及writer，取消仍走原pending owner，迟到note不发布。review省略argv值和URL query，明确Connection: not tested；保存仅失效原连接，不自动执行或发现。独立架构实际render发现输入footer不可见，现将真实阶段放入输入标题并复验，不伪造认证/连接进度。
- 最终6文件178项、strict production TS、双构建、11项有效反转全部通过。Node/exe × regular/fullscreen四格专用PTY验证完整分步输入、默认取消原字节不变、原文件计划/普通审批、精确命令和argv、无临时定义/连接/模型消息；仅目标配置新增，metadata/全局config/工作区不变。Linux八格通用smoke与19项入口通过；失败测试及探针分类、构建hash见开发日志。
- 两路独立代码APPROVE/架构CLEAR，九文件hash与最终构建读回绑定。仅证明本机合成定义保存；真实MCP连接/认证、env/headers交互编辑、其他report消费者及全部47项继续复核，不恢复“只剩四项”。此前原生认证精确SHA的CI `39594034576` 已completed/success（12:01:51Z）；扩展读取已commit/push `d4b5c89343a984540136b001aecb5c681a1c48c3`，CI `39596352846`（12:13:18Z）和Watch `39596352847`均success。本批commit/push/新SHA CI分别取证。

## 2026-10-21 `/tools` 报告投影与原读取准入（PAN-08 部分）

- 新增回归先复现原详情title/description/schema文档及facts含敏感元数据、列表截短留下密钥前缀、异步目录后旧绑定仍返回report/note。现由原工具报告owner先规范terminal文本、再复用既有redactor、最后截短；原始工具ID、required判定、plan policy和完整description/schema字节计量保留，safe facts不作执行schema或权限证明。两种命令入口共用原context admission的读前/读后重验，picker和真实host拒绝旧结果。
- 补充回归复现ANSI先脱敏后移除会重新拼接密钥；修复规范化顺序后，独立架构又找到CRLF显示字面回车的兼容回归，现于本域规范CRLF，保留两行及原byte成本。generic report codec的facts LF转义合同不改；测试误期待literal LF的中间失败单独保留并纠正。最终主集5文件133项、直接consumer5文件13项、strict TS、双构建、10项有效反转通过。
- Node/exe × regular/fullscreen四格专用PTY验证本地MCP不可信metadata在列表/详情/直接命令及持久报告均安全；取消零写，显式查看仅新增2条command-output，无新model消息，state/metadata/config/工作区原字节不变，原catalog discovery仍发生但tools/call为0。八格通用smoke及19入口通过。独立代码APPROVE/架构WATCH，五文件hash绑定；全目录获取/排序/完整schema序列化无总资源/延迟界，不能称检查不启动进程或网络，也不闭合PAN-08及47项。
- 前批MCP添加已commit/push `d69fea2fba8733430624a8c202230b33fca7e567`，远端main同SHA，CI `39599867617`于12:44:21Z completed/success、Watch `39599867653` success。本批新SHA交付分别取证；其他help/skills/context/cost消费者继续复核。

## 2026-10-21 技能只读列表与精确选择（PAN-08 部分）

- 原列表直接展示敏感metadata、重新解析可把移除的大小写技能替换为另一个，特殊名称草稿无法由原parser读回；旧admission/失败与重复选择也未拒绝。现原skill command共用原catalog读取，列表为body-free CommandReport，单offered/一次消费/精确选择，metadata安全投影与原始正文明确分开；可原样安全展示的名称才插入精确quoted草稿。原loader保持不规范名称的诊断及保留语义、trust/noSkills/显式路径与contribution仍生效。
- 两条独立复核补出真实缺口：overlay的load取消未透传；file URL路径解码在plain之后引入C1，后续renderer移除时重组未脱敏密钥。现load合并原signal/overlay signal，accepted apply不复用已释放的load signal；共享report metadata原语在一次path投影两侧plain，最后原scrub/cap，tools同类路径一起修复。正文仍为原loader解析后的指令，只本地显示，不冒充安全报告。
- 本地10文件276项、strict生产TS、双构建、14项有效反转通过；四格Node/exe专用PTY验证安全列表/header/facts、特殊名称草稿、明确读取原正文，取消与选择不增持久消息，原参数列表仅新增1条body-free command-output，无model调用，state/metadata/config/workspace原字节不变。八格smoke与97脚本通过；19入口与严格docs门最终结果见log。
- 独立代码APPROVE/架构WATCH，两报告七文件hash已逐项绑定最终产物；accepted apply尚无独立取消owner、holdInput等待不可强制中断任意贡献Promise，合作式发现预算不证明总延迟/资源界。不闭合PAN-08或47项。前批tools精确SHA `f46e6c97c92497c35b6e4496f930a1124ae42f73` CI `39602459208` / job `119230129576`于13:01:35Z completed/success，Watch `39602459194` success。本批提交/推送/新SHA CI另取证。


## 2026-10-21 context/cost 安全只读报告（PAN-08 部分）

- context请求身份/警告、cost字段与facts仅在报告投影脱敏；原capture/ledger身份、分组、captured/current价格、body/parts/source维度和unknown合同保留。两命令读前原admission，context保留await后检查，均用真实cwd；cost组合标题用分别安全的身份和suffix构造，修复PTY发现的带provider前缀绝对路径漏投影。
- Parent最终10文件97项、strict生产TS/双构建、11项有效反转、四格专用PTY、八格smoke、19入口和97脚本通过。PTY保留三原captured组USD1/2/3及总USD6，只有两安全command-output，无模型消息或原state/config/metadata/workspace变更；累计用量不冒充当前prompt/foreground capture。中途legacy夹具错误、组合标题产品失败、trim分隔符失败与无效反转按日志分类保留。
- WATCH：脱敏key不是全局唯一账本身份，脱敏attribution不能回灌原ledger validator；原array保留组数/精确数值。全量catalog/bucket处理及MCP发现无总资源或延迟界，不闭合PAN-08/47项。前批技能`77700f4f`精确CI`39606383097`于13:28:27Z success、Watch`39606383042`success；本批独立最终绑定/交付及新SHA CI以日志实际读回为准。

- 最终独立代码APPROVE/架构WATCH，综合COMMENT；两报告八文件SHA与双构建已逐项读回绑定。组合标题为各组件分别受限，无单一4096合成界；旧报告绑定拒绝与新字节复验均保留。strict docs/diff通过，本批commit/push/精确CI尚须分别读回。


2026-10-21 help返工本地验收：安全共享CommandReport/rows、精确root/session、原admission与真正通知前检查、原draft-only/alias/named语义、选中后usage提示均已修复；最终12文件189项、13项有效反转、strict生产TS/双构建、四格合成扩展PTY与八格smoke、19入口/97脚本及静态门通过。代码APPROVE/架构WATCH，最终十一文件/两报告/双构建hash已读回绑定；直接help仍原shell-action/pager，不新增报告持久化。完整registry成本及原配置live读无总资源/accepted-publication保证，global completion metadata不据此闭合。accounting提交`972a9ff5`已推送、Watch success，精确CI`39609907792`本次仍in_progress；本批提交/新SHA CI另记。其余picker与全部47项继续原范围，原用户环境/真实模型推迟项不扩大。

## 2026-10-24 PAN-06 back/copy/restore 原始取消边界

- 七个原实现回归实际 AssertionError：back pending read 后原始 signal 取消/准入过期仍返回 rows、准入回调取消后仍获取；copy 首次/下一 native 派发前准入回调取消仍继续；restore 准入回调取消未拒绝、实际 snapshot metadata 重读后的最终回调取消仍返回 preview draft。现 back 获取组合 original/browser signal，获取后和发布前复核；copy/restore 在准入回调后重检 original signal，已完成 copied/offered 的事实保持。
- 四项有效反转（copy/restore 回调后检查、back original signal 转发、back 旧保护整组）均 exit1 + AssertionError，源码逐字节恢复。单独移除 back 回调后检查仍被后续 pre-read signal guard 拦住，未算有效反转。restore 初版回归取消过早而被 reader 拒绝、back 初版对 undefined 使用属性断言，均归测试设计修正，不作为产品失败证据。
- 最终静态门/matrix、8 files/104 tests、TS build 串行通过，heap1536/2048MiB；独立只读代码 APPROVE/架构 CLEAR，两路无验证。build `0483fcd1214c7d45e76d6f8dbf17dd09a66b728537961948c342178766db30ff`，inputs `0f540a74d82c723a9bd184b91d322d5ccf935d0fa79b3daa242ff4bd3dbf72b4`，artifact `5a6c858004a3725852efed6c0b729b8f4e60152dc4c1998c51aa6e38cb227ebd`。未跑全量/exe/PTY/20k真实压力，无scratch残留；提交/推送/当前SHA CI另取证。
- 本地下一步限于 copy/back、restore、undo 的 acquisition→page/search→draw→retain→close/reopen 组合，以及 QA-01 的47行证据复核；不把补充 physical I/O/heap/硬延迟 WATCH 升成新要求。矩阵35complete/12partial/0open保持。
- 前批 `7097be968fef09ed46f4ba319e597218661001a7` CI `40091752154`/job `120865687043` 于2026-10-24T12:08:07Z completed/failure：10465pass/3skip/1fail，唯一失败为 browser/smoke/request 的 decompressed bytes 用例期望unsafe-output、实际request-failed，原因尚未分类；不记成成功，也不改无关browser产品。`b26773aa49d4372bd87b3cd7917bf6fb31f1fa05`已推送，CI `40092866173`仍in_progress、Watch `40092866172`success，各自绑定精确SHA。

## 2026-10-24 PAN-06有限生命周期与47行证据复核

- 新四个owner lifetime fixture连接真实Transcript→CopySource、保存26题→readBackSource/navigation→back、101个实际standalone recovery records→restore、41个实际persisted receipts→undo history，并进入原OverlayHost。copy/back的32字节/128KiB源两档各十轮，copy每次打开仅一次copySources、三项source/search及每页一项+more；back每次打开三个core descriptors，逻辑body bytes等于三文件大小，后续页/搜索/20矩形绘制不再获取，descriptor峰值1/全关闭。关闭检查host/model/row及旧动作，再开重新获取；没有source闭包不可达性或heap释放证明。
- restore用32字节/96KiB metadata padding，两档各十轮：每轮初扫101metadata、续页仅复验末条1metadata且不opendir、host输入search再完整扫101；clear经真实退格键返回tail页、20矩形绘制零额外读取。每轮203 metadata opens、body bytes=两次初扫大小+末条大小，file descriptor峰值1/全关，全部directory关闭；record metadata及唯一共享blob字节保持。原128KiB padding加JSON超过单记录128KiB合法界，初版100rows属不合格夹具，不是产品漏页。
- undo history每页/接受保持完整index+41 receipts校验；十轮两页及两次accept，共40次完整scan，逐inode body bytes精确为源大小×40，观察到的sync descriptors每次scan后均关闭；只保留40项+more或末条host页。真实patch preview在32字节/128KiB源两档各十轮经Pager→默认Cancel确认→关闭，不新增postload readSync/open、不写workspace/receipt/blob；不宣称preview精确body bytes/async descriptor排空。清空reader引用与原只读report事实分别检查。
- 两个真实copy准入回调abort/close在原实现均仍获取并返回源，先红后修；picker owner现回调后复核original signal及browser signal/closed。copy两保护、copy/back source/offered释放四项反转均exit1+AssertionError，生产bytes恢复。定向参考selector的活跃controller才发布、清除加载状态决定，保留本仓分页/原剪贴板owner，不复制参考实现。两路独立只读APPROVE/CLEAR，先前restore search未进入host的WATCH经真实host输入/绘制修正，两路未跑验证。
- 最终静态门/matrix、10 files/195 tests及TS build串行通过，heap1536/2048MiB；无本地全套/exe/PTY/20k真实压力，own scratch已清理。build `612f7166d0b41ab4e0b694d41922c965bb3db1cc5fc94506b77c0b9984c17b58`，inputs `6b7f3f0eab6a0609d2915907d6d0d8804d2f695e5e2d27adb4ff90220a16bb6c`，artifact `f7f1ce062002083170299bf59d9807c1c71d19135ac54aa848a1e7f7c19ed67a`。首版undo在host发布前断言baseOptions、restore误把搜索结果当baseOptions而非model.visible，均按实际宿主合同纠正。
- 47行独立有限复核保留原35complete，PAN-02原范围目录/tree/管理/生命周期已有可追溯证据，升为complete；现36complete/11partial/0open。四条已识别本地生命周期链收口，已有跨任务组合不重复；QA-01仍随真实账户/质量/平台任务验收保持partial。矩阵、当前剩余表、CFG-03实际fixture及QA-03既有START-03聚合引用同步，不把额外physical I/O/heap/最长响应WATCH升成新硬门。
- 精确`b26773aa49d4372bd87b3cd7917bf6fb31f1fa05` CI `40092866173`/job `120868960040`于12:29:21Z failure：10476pass/3skip/2fail，分别为browser/smoke/request解压状态与queued back confirm零rewind。后者fixture仅等待title/active，现确认前等待实际focus ID first，保留queue/rewind断言及loading dismiss。两个文件定向5项通过（其余110未选），browser未改生产，CI触发原因仍未确认，不从一次本地green推断flake/已根治。
- 精确`e4b86ad0457791141abb12ce29639b8adb647732`已提交/推送且远端main一致，CI `40093579333`/job `120871082975`于2026-10-24T12:38:38Z completed/success，Watch `40093579354`success。该success不改写上述历史失败，也不替代本新批次SHA的CI；当前批提交/推送与新CI另读回，全阶段仍partial。
