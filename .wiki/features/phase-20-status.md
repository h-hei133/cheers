# Phase 20 交付状态

本文只记录有本地证据的状态，不把实现等同于交付。提交、推送与 CI 分别列出；未运行的真实 provider、PTY、跨平台与发布验收不算通过。

## 返工复核（2026-10-18）

复核基线为 `12a7d4e0`。先前“只剩四项未闭合”的结论撤回：下方旧记录包含部分实现、未完成验收及重复任务，不能证明全部裁决兑现。保留历史提交证据，逐批按决策文档重新验收；不以本轮少量回归通过重判整个任务完成。

| 批次 | 当前复核结果 | 后续范围 |
|---|---|---|
| W1 CFG-01…05 | CFG-02/04 发现并修复导入相对路径规则改变目标的问题；default、named、legacy、preview 后源变化回归通过 | 继续核查全部身份 consumer、配置快照及失效合同 |
| W4 UI-01…04 | UI-02/03 修复固定八项上限、详情被候选数裁短、tab 点击区域覆盖、缺键盘切组及 modal 不显示分组；可用矩形和旧命中失效回归通过 | 其余公共原语、源选区及各消费者仍按合同复核 |
| W2 | 连接/角色/目录、委派续期、主/cache/辅助费用及池限制/退避已有逐批证据；只读可用性现共用完整池拓扑、自身凭据与当前代次等待，active 不可用和无目录成员保真 | 本批提交/远端按日志记录；完整 consumer/publication 与 provider/endpoint/受众复核仍开放 |
| W3 | CTX-03 有界分段/合并、永久重播证据、原生 source CAS 与精确发布证明已有本地及独立验收；自动/overflow 未验证发布停止 turn | 两项架构 WATCH 为容量拒绝和锁内同步 I/O，已记录取舍；本批提交/远端按日志；CTX-01/02/04、TOOL-01 继续复核 |
| W5 | SET-02 已修复选中分组后无法搜索其他组的问题；复用文字匹配排序，跨组按最佳得分和固定组序展示；清空搜索回原组，从详情 Back 回字段所属组并聚焦 | CMD-01/02、SET-01/03 全部验收；SET-02 其余来源/状态细节继续按合同核查 |
| W6 | modal 的项目范围切组现已可达；不能由此证明完整目录分页/搜索 | PAN-01…08 各动作、只读边界、分页和 revision |
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

用户已允许后续验证的环境/真实模型项：START-03 受控冷缓存及剩余响应测量、QA-02 跨平台/IME/系统复制、QA-03 真实质量、TOOL-02 成本与 tokenizer 校准。**这项保留不覆盖可在本地完成的缺失实现和合成端到端验收。**

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
| PAN-04（部分） | `6736f402`、本次 | `/usage account` quota 进度投影、`/thinking` effort 选择器 |
| PAN-06（部分） | `6736f402`、本次 | copy 移除 recent-30 窗口；restore 生成可解析的 preview draft，绑定项目及复合快照身份，提交前重读元数据，明确失败/部分目录与取消 |
| PAN-07（部分） | 本次 | `/extensions` 为 `/plugin` 别名 |
| START-01（补强） | `0afab79a`、本次 | build manifest、五种拒绝状态、`start`/`start:dev`；轻量 `--version`/`--help`、组合参数和坏配置准入；fresh packaged gate 通过 |
| JOB-01（补强） | `dd43bcce`、本次 | 单次 spawn、detach/kill、adopt/promote、60s/新消息晋升、撤权 kill、重启 unknown 不重播；detach 后保留 settlement 与 300s 总期限 |
| JOB-02（补强） | `7da6e6d4`、`8c7f949f`、本次 | 本地 notice、opt-in follow-up（去重/预算/截断）、脱敏/reload、取消不转后台 |
| EDIT-01（补强） | `57e1ffb3`、`8c7f949f`、本次 | 稳定且绑定 baseline/hunk content/add content 的 group id、依赖分组、同文件 hunk 选集、无选集拒绝、重规划 revision、requested/selected/skipped receipt |
| START-02（本地证据闭合） | `3de906fe`、本次 | 10k 首帧不扫描；持久摘要索引；0/100/1k/10k bootstrap 不枚举探针；TUI/line 首帧 write completion 后 recovery hint；routing sink 与 transcript ownership 分离；键盘/鼠标/粘贴/picker/line 用户意图 fence；line close/stop 主动取消 MCP/SSH/collaboration/current run 并释放 goal scheduler；真实 scheduler drain 超时结算 captured host，sink 对迟到 goal dispatch 保持 discard fence；teardown sink 顺序、`runCliProcess` fullscreen 集成与 Node/exe × regular/fullscreen 两次 seeded PTY |
| PAN-05 | `2a4bafe5`、本次 | advisor 只读面板 + enable/review/apply 分别授权；plan-review 结构化报告与版本化 approve/reject/execute；btw 结构化报告、带外；面板查看不启模型，模型工作只走显式命令/普通 turn |
| PAN-03（部分） | `070f1405` | hub 本地作业输出页（脱敏/截断）、后续页指引 |
| PAN-08（部分） | `93302750` | MCP 逐项向导；临时定义 0600 且必删 |
| START-03（部分） | `a6ba2665` | Node/exe 与 regular/fullscreen/pipe 各 30 次首帧、命令→退出基准 |

## 部分完成（有实现，验收未闭合）

| 任务 | 已做 | 缺 |
|---|---|---|
| PAN-01 | model 两栏与详情、同名 relay 区分、预设行 | 连接/role 的绑定 revision 搜索验收 |
| PAN-02 | 时间分组、pin、树形、跨项目完整授权目录搜索、10k 分页批处理、全屏事实/对话预览、窄屏 stacked preview、current tree focus、pin 持久化；Linux TUI fork/切换/确认删除组合通过 | 其余动作身份/revision 边界继续复核；restore preview 另归 PAN-06 |
| PAN-04 | quota 进度、thinking picker | effort/model 联合约束与 unknown 非 0 的更多模型验收 |
| PAN-06 | copy 全量、pin；copy 100 项分页、continuation、源 revision 与 stale 拒绝；restore 100项分页/续页、全目录搜索、有界目录缓冲与记录保留、复合身份消歧、元数据digest重验、特殊路径参数及preview-only业务链 | history 完整树、copy 到头/失败/取消边界、back/undo 审计；restore 每页/搜索仍线性扫描目录，不宣称扫描延迟上界或原子目录快照 |
| PAN-03 | hub 主从视图、本地作业输出页（脱敏/截断、后续页指引）、watcher 注销与 unknown status 回归 | agents 专用操作仍归 `/jobs`；其余 journal/revision 边界继续复核 |
| PAN-07 | alias、逐项确认 | login/logout 设备码安全显示的端到端验收 |
| SET-03 | status/theme 预览 | 外部更新撤销的端到端验收 |

## 未闭合

- START-03：已保存八组各30次原始样本，渲染键响应关闭 PTY echo 并等待完整 UTF-8 字符；runtime-ready、受控冷缓存、1000项列表键响应、复杂 stream 单次阻塞与分位数不确定性仍未验。

- QA-02/03：Linux Node/exe × regular/fullscreen/line/pipe 八格合成 CLI 通过；TUI 覆盖会话/任务/发现/审批/settings 保存/profile 重启，line/pipe 覆盖任务/发现/显式审批和 settings 只读；Windows/macOS/IME/系统复制与真实质量仍缺环境/模型。
- TOOL-02：静态描述/schema 字节成本已进 `/tools` 报告（`size.unit=utf8-bytes`，`tokens=not-measured`）；同模型质量/缓存对比与 tokenizer 校准仍需真实模型。
- QA-02 的 restore preview 已在 Linux 八格通过，并验证文件/记录/blob 字节不变；line/pipe 完整 profile/save 仍缺。QA-01 矩阵已补齐独立任务行，但仍不能作为 47 项全闭合证明。

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

未测：受控冷缓存（清页缓存需特权，首样本单列但不冒充冷启动）。

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
- 仍未闭合：START-01/02 的新提交/推送/精确 SHA CI；RENDER/PAN 其余消费者仍按原合同复核。START-03、QA-02/03、TOOL-02 的用户已允许环境/真实模型项继续延期，不把本轮合成测试替代它们。

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
- 仍未闭合：fork/restore/delete 的组合 PTY 验收；START-03 的真实 ready/key/event-loop/raw sample/受控冷缓存仍缺，QA-02 的 line/pipe 五条业务链和跨平台/IME 仍缺，QA-03/TOOL-02 真实质量与 tokenizer 仍未验。本批 `20e6ee61` 已提交/推送，CI 与 Watch 已按精确 SHA 读回 success。


### 2026-10-21 QA-02 业务链与 START-03 测量返工

- `qa:pty` 已扩至 Linux Node/exe × regular/fullscreen/line/pipe。TUI 合成链覆盖 seed recovery、fork、新旧会话切换、显式确认删除、resume/tools 关闭、bash、task、tool_search/tool_load/skill、逐次审批、settings 写后读回和 profile 重启后命名目录 session 读回；line/pipe 覆盖任务/发现/显式 allow-once 与 settings 文件字节不变。最终八格 exit 0，持久 transcript 按工具名、call ID、success 和实际 payload 关联。
- 修复合成驱动跨轮次复用 call ID，以及旧 outstanding call 在新实例中被重新派发、无关 tool result 推进计划的问题。意图解析归 `turn/intents.ts`，入口只组装；持久 tool call 使用既有 function 形状，不新增执行路径。
- 新 benchmark 区分首帧/输入提示/TUI listener/write/批处理首答/命令退出，键响应关闭 PTY echo 并等待完整 UTF-8 字符。原来首 chunk 命中、字段误读和旧构建拒绝的失败记录保留。最终基准保存8组各30次共240个原始样本与机器/构建摘要；runtime-ready、冷缓存、1000项列表和复杂stream阻塞、分位数不确定性仍未验。
- 聚焦 7 文件/86 项通过；脚本 96 项通过，两种构建通过；静态 cycles/config/declarations/Node floor 通过。独立 code APPROVE、architecture WATCH，WATCH 为仍缺的验收指标、采样 histogram 与构建前后摘要的证据边界。本批提交/推送/CI 状态以日志中精确 SHA 读回为准；全部47项仍保持原范围复核。
- 全量 TypeScript 实际为 9348 passed / 1 failed / 10 skipped（412.74s、exit 1）；唯一失败是 MCP 畸形配置四次 CLI 启动在并发下超过25秒。相同用例隔离 `--single-thread` 复跑 1 passed（16.63s），原失败日志保留，暂归并发负载夹具超时，不记为全量绿。
