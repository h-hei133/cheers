# Phase 20 契约矩阵

每一行把任务绑定到所有者、当前测试与一个反转条件。测试通过只证明该行；没有真实 provider、PTY、跨平台或发布证据的行仍保持开放。

2026-10-18 返工复核发现旧表有状态漂移：实现存在或测试数量不能替代完整裁决。当前复核范围及未闭合项见 [交付状态](phase-20-status.md#返工复核2026-10-18)；以下未重新验收的行均是历史证据索引。

## W1 配置

| 任务 | 所有者 | 证据 | 反转 |
|---|---|---|---|
| CFG-01/02 | `config/runtimeConfig.ts`、`config/identity` | `runtimeConfig.test.ts`、`config/*` | 去掉显式输入次序后 `config` 断言失败 |
| CFG-02/04 导入路径规则 | `config/profiles/import/{config,plan,source}.ts` | `import/scope.test.ts`（4）；验证导入后真实工具 scope 的空 allowlist 仍拒绝 read，源变化拒绝发布 | 恢复直接复制相对路径后 default/named/legacy 三例失败 |
| CFG-03 | `config/layers.ts` | `layers.test.ts` | 显式输入不再遮盖文件值时失败 |
| CFG-04 | `config/scope/*` | `scope/*.test.ts`（20） | 目录身份/安全字段不再累积时失败 |
| CFG-05 | `config/fields.ts`、`layers.ts` | `environment.test.ts` | 空环境值不再忽略时失败 |

## W2 provider/认证

| 任务 | 所有者 | 证据 | 反转 |
|---|---|---|---|
| PRV-01 具名连接选择 | `core/commands/model/{choice,selection}.ts`、`session/model/`、`core/shell/providerCredentials.ts` | `picker/model.test.ts`、session/model、providerCredentials；合成 relay 请求及恢复 | 删除 revision 检查、丢失连接后退回默认或使用 CLI/env 的另一账号时失败 |
| PRV-02 具名角色应用 | `core/commands/model/preset*` | presetCommand、presetStore、picker/model；空 session 应用 profile 角色、明确 connection 解析、旧 provider 身份不能消歧 | 跨连接改回拒绝、同名跨层合并或任一无效角色仍写入时失败；自动角色 consumer 另行复核 |
| PRV-03 | `core/auth/account/{pool,presence}.ts` | `account-pool` 测试 | 池外发送回退到 env/profile 时失败 |
| PRV-04 | `core/auth/account/lease.ts` | `lease.test.ts`（7）、renewal（38） | dispatched/unknown 被提前清理时失败 |
| PRV-05 | `provider/request/backoff.ts` | backoff（5）、ledger | A 的 429 阻塞 B 时失败 |
| PRV-05 历史费用 | `observability/usage/`、`turn/step.ts`、`cli/runtime/cache.ts`、`core/commands/cost/` | attribution、turn/usage、store/usage、cache、sessionFacts；本机 HTTP 晚到响应及多进程真实落盘 | 移除发送前捕获、按当前目录重算、取消旧键转义、缓存类型命名空间或 partial 状态标记时失败；完整 PRV-05 仍开放 |

## W3 上下文与工具

| 任务 | 所有者 | 证据 | 反转 |
|---|---|---|---|
| CTX-01 | `context/request/budget.ts`、telemetry | budget（6）、telemetry（22） | `P+O+H>W` 仍发送时失败 |
| CTX-02 | `context/request/budget.ts`、`session/compaction`、turn | budget（6）；等号、软触发、独立 input limit、measured prefix 均按同一预算 | 去掉软触发边界、允许超界 reserve/output 或把 measured prefix 之前内容重复计量时失败 |
| CTX-03 | `session/compactionOperation.ts` | 操作测试（7） | unknown 步骤被重播时失败 |
| CTX-04 | `context/report` | report（6）、sessionFacts（9） | stale 被当作当前值报告时失败 |
| TOOL-01 | `core/tools/discovery/*`、`core/tools/catalog.ts` | discovery（10）、handoff/director | `todo` 或 run feature tool 不在首请求时失败 |

## W4 布局

| 任务 | 所有者 | 证据 | 反转 |
|---|---|---|---|
| UI-01 | `composer/frame.ts`、`surface/budget.ts` | `geometry.test.ts`（8） | padding 改回 2 或正文超过 16 行时失败 |
| UI-02 | `chrome/panel.ts`、`chrome/modal.ts`、`overlay.ts` | panel（9）、picker（16）、surface/view（40）；20–200 列、8–80 行，长草稿和 51 候选 | 固定八项上限、按候选数截短详情或窄屏越界时失败 |
| UI-03 | `chrome/{progress,chips}.ts` | progress（4）、chips（3） | unknown 输出百分比时失败 |
| UI-03 分组输入 | `overlay.ts`、`keybindings.ts`、`chrome/{panel,modal}.ts` | overlay（57）、keybindings（25）；Node/exe 两模式 PTY 的 settings/resume 切组 | 每行只保留最后一个 hit、删除键盘切组或复用已关闭面板 hit 时失败 |
| UI-04 | `transcript/source.ts`、`surface/pane.ts` | `source.test.ts`（4） | 软换行插入 `\n` 或装饰行参与复制时失败 |

## W5 命令与设置

| 任务 | 所有者 | 证据 | 反转 |
|---|---|---|---|
| CMD-01 | `chrome/suggestions.ts`、`keymap.ts` | suggestions（13）、keymap（54） | `/m` 首选 `/mcp` 或完整命令接受旧候选时失败 |
| CMD-02 | `syntax/*`、`37` 审计 | syntax 套件、actions/commands | 未知参数被接受时失败 |
| SET-01 | `config/settings.ts`、`picker/settings.ts` | `settings.test.ts`（6）、picker（11） | 数值/列表落回 JSON 时失败 |
| SET-02 | `picker/settings.ts`、`chrome/options.ts`、`text/search.ts` | settings（31）、picker/settings（15）、原 slash 排序测试；四格 PTY 从 Session 搜索 `mxtrns` 找到 Request 的 Maximum turns | 先按当前分组裁剪搜索全集时，真实 overlay 输入/粘贴用例失败；清空查询未回原组、Back 未聚焦所属组或已存值无标记时失败 |
| SET-03 | `picker/preview.ts` | settings preview、theme selection（2） | 预览关闭后仍覆盖显示时失败 |

## W6 面板

| 任务 | 所有者 | 证据 | 反转 |
|---|---|---|---|
| PAN-01 连接/具名角色选择 | `picker/model.ts` | picker/model、pickers；两栏内保留 target 对象和 admission | 同名 model 不区分 connection、失效项可执行或只应用默认角色时失败 |
| PAN-02 | `picker/session.ts`、`picker/session/preview.ts`、`picker/session/listing.ts`、`tree.ts` | session（33）、session/listing（5）、tree（4）、overlay（64）、panel（11）、management（20）、catalog projection（1）；真实排队 `/tree` 在 load 后读取 current focus，exclusive 包装保留 getter | 分组行可选中、完整目录搜索只扫描首屏、旧 query/scope 回填、10k 页在 41 项批处理边界失败、窄屏 footer 丢状态、连接线/current focus 缺失或跨项目动作被放行时失败；反转对象展开会实际选中旧节点 |
| PAN-03 | `picker/hub.ts` | pickers（39） | `/hub` 在无 composition 时仍打开或 apply 取消任务时失败 |
| PAN-04 | `cli/usage/service.ts` | usage（31） | 无限分母输出百分比时失败 |
| PAN-05（部分） | `picker/advisor.ts`、`core/commands/report/projection.ts`、`btwCommandRuntime` | advisor 只读 checkpoint/note 面板；plan-review 与 btw 结构化报告；打开面板不发模型请求，模型工作走显式命令 | 面板打开触发模型、旧流串入新面板或 plan/btw 越权写入主会话时失败 |
| PAN-06（部分） | `picker/copy.ts`、`picker/rewind.ts`、`picker/restore.ts`、`edit/recovery/{catalog,recoveryAuthorityIndex}.ts`、`transcript/container.ts` | copy（3）；100 项分页、continuation、source revision 和 stale selection；back 25 项有界续页、numeric/stable-id 定位且只调用既有分支/草稿回退；restore（15）、catalog（4）及 recovery index（5），选择仅生成可解析preview draft，复合身份/digest重验；目录buffer32、最多101条排序记录/每页100条，205条跨三页无遗漏/重复、完整搜索、变化拒绝和取消关闭句柄；加载中输入及普通/排队no-match渲染均有回归；Linux八格预览核对文件/记录/blob字节 | dash-leading参数、单record identity、40项截断或移除digest有实际失败；放宽100项页、移除cursor revision、关闭完整搜索或移除search generation亦有反转失败；移除back continuation会使旧问题选择测试失败。每页/搜索仍线性I/O，不承诺扫描延迟上界/原子目录快照；history/undo/copy剩余边界不据此闭合 |
| PAN-07 | `registry.ts` | slashCommandRegistry（11） | `/extensions` 不解析到 plugin 时失败 |
| PAN-08（部分） | `picker/mcpAdd.ts`、`picker/{help,tools,skills}.ts`、`core/commands/tools/report.ts` | mcpAdd（2）、help/tools；逐步 scope/name/transport/confirm，临时定义 0600 且无论成功拒绝都删除；report 只读 | 未确认即发布、临时定义残留或打开 report 触发执行时失败 |

## W7 输入与渲染

| 任务 | 所有者 | 证据 | 反转 |
|---|---|---|---|
| RENDER-01（部分） | `transcript/math.ts`、`text/{codeSpan,inline}.ts` | math（4）、markdown（51）、html（37）；最终 inline renderer 区分 escaped/multi-run/unmatched backtick，link label 内 code 可达，强调可跨 token 闭合，64 KiB 边界内 64k backtick/escaped-math run 线性处理，超 1 byte 原样保留，80k bracket/60k private-use run 受预算保护，label 内不生成嵌套链接，code span 内不投影公式、链接或强调 | 转义反引号被当成 code span、多 run 被拆坏、未闭合 run 吞掉后续文本、link label 丢 code、强调无法跨 token、超长输入平方扫描、超预算改写原文或嵌套 anchor 时失败 |
| RENDER-02（部分） | `transcript/{markdown,table}.ts`、`session/export/htmlRender.ts`、`text/{codeSpan,inline}.ts` | markdown（51）、table（4）、html（37）；raw fallback 以最终 `rows.join("\n")` 的 UTF-8 字节计预算 | 多反引号 code span pipe 被拆 cell、未闭合 run 吞掉后续 pipe、ANSI/行分隔符绕过预算或窄屏截断长尾时失败 |
| RENDER-03（部分） | `transcript/diff.ts` | diff（26）；rows/bytes 均严格不超预算，ASCII/UTF-8/CRLF/尾换行精确边界不误截断，`---`/`+++` header 与 removed/added 分离，side-by-side sources 对齐，纯 rename 与 rename/BOM/EOL/EOF facts 可见 | 零宽内容绕过字节预算、截断标记突破 rows、边界输入误截断、header 被当改动或 facts 被吞掉时失败 |
| INPUT-01（部分） | `editor/modal/state.ts`、`input/{terminal,stdinBuffer}.ts`、`cli/interactive/keymap.ts` | state（12）、keymap（63）、stdinBuffer（25）、terminal（7）；跨 UTF-8 chunk、fused/cross-chunk 字素、combining mark、keycap、paste/escape 后文本与纵向边界 | UTF-8 半码点产生替换字符、`f/F/t/T` 只收到首个 scalar、纵向移动落到 surrogate 中间或字素跨 chunk 被拆时失败；完整 IME/五模式合同仍待复核 |

## W8/W9

2026-10-20 复核撤回了本表此前的“完成”标签：实现存在不等于合同闭合，以下行均保留开放状态。

| 任务 | 证据 | 反转/未闭合 |
|---|---|---|
| JOB-01 | `LocalExecutionHandle`、一次 spawn 的 `adopt/promote`、原 PID 晋升、容量拒绝与重启 unknown 路径；`local.handle`（4）、`journal`（19）、`service`（8）、`promotion`（4）覆盖 detach 后保留生命周期 deadline、adopted settlement、kill gate、撤权、容量拒绝和重启不重播。 | 撤销 `stop` 的 settlement 等待、timeout 传播或在 `detach()` 清除 timer 时，对应真实子进程/服务用例失败。 |
| JOB-02 | 本地 notice、opt-in follow-up、去重/预算/截断、配置 reload 重新读取 enable 策略，以及命令/输出两侧脱敏；`backgroundNotice.test.ts` 6 项通过。 | 将函数型 enable 策略退化为构造时布尔值后，reload 用例实际失败。 |
| EDIT-01 | 稳定 group id、源基线、hunk indexes/content 与 add content 身份绑定、依赖组、同文件双 hunk 选集、重规划 revision 检查、无选集拒绝，以及 requested/selected/skipped receipt；`batch.test.ts` 38 项通过。 | 将同文件 hunk 合并成单组、改变源基线、改变同基线 hunk 内容或 add 内容后，对应选集/identity 用例实际失败或拒绝。 |
| START-01（本地证据闭合） | build manifest 已绑定 lockfile、构建配置、编译器/标准库、全部 emit 字节、五个运行资产和受控 entry；`start.test` 覆盖 journal 恢复、活动/stale build lock fail-closed、恢复期间竞争者拒绝、越界/未登记入口、篡改产物与 launcher/package-main 回滚。`--version`/`--help` 现在由轻量入口在加载 runtime 图前处理；组合参数、坏配置准入与 fresh packaged gate 均已通过。 | stale lock 仍需人工确认后清理；本地 packaged gate 不等于新提交的 CI，精确 SHA CI 另行取证。 |
| START-02（本地证据闭合） | 10k catalog 首屏、持久 reentry 索引、0/100/1k/10k 不枚举探针；recovery hint 由实际 TUI `onFirstWrite`、line prompt write callback 或 non-TTY live first frame 启动；routing sink 与 transcript ownership 分离，line mode 保留 turn boundary 且 `/sessions` 仍走非交互 overview；用户键盘、鼠标、粘贴、picker 与 line 输入只推进一次 fence；teardown 在 sink 恢复前完成，失败路径不调用 `exit(0)`，cleanup 自身抛错或 logger 抛错也保证 sink 恢复；line prompt callback 与 stdout `error` 的异步失败均进入同一 rejection，不再静默挂起；真实 `GoalScheduler` drain 超时结算 captured host，line sink 在 goal dispatch 真正完成前保持 discard fence；MCP snapshot/refresh 在队列等待阶段即可取消，collaboration ticket/poll/propose 继承关闭 signal；`runCliProcess` 集成测试证明 fullscreen hint 经 transcript 且不直写 stdout；non-TTY live stream 现在把 first-frame/user-intent 接到同一 recovery lifecycle，取消 hint 时仍发布已发现的可读性诊断；Node/exe × regular/fullscreen seeded PTY 连续通过并匹配精确 current session。 | 真实跨平台/IME 仍归 QA-02；本行不把 Linux PTY 外推为平台矩阵完成。 |
| START-03（部分） | `bench:interactive` 现在分别记录 Node/exe × regular/fullscreen/line/pipe 的首字节、首帧/输入提示、TUI listener/layout/write 进程观察点、渲染字符键响应、批处理首答和命令退出；保存每次原始样本、样本数、p50/p95、机器与构建摘要。键测量关闭 PTY echo，等待 UTF-8 字符进入实际输出；缺必需观察点拒绝。 | runtime-ready、受控冷缓存、1000项列表键响应、复杂stream单次阻塞和分位数不确定性仍未闭合。line/pipe没有TUI listener标记，null不兑换ready；进程采样delay不证明最初同步加载或单操作阻塞上界。 |

## W10

| 任务 | 证据 |
|---|---|
| QA-01 | 本矩阵 + 各反转测试；`CTX-02`、`TOOL-02`、`PAN-05`、`PAN-08`、`QA-03` 已拆成独立行；但行存在不等于任务完成，仍按各行状态累积。 |
| QA-02 | Linux Node/exe × regular/fullscreen/line/pipe 八格合成CLI已通过；TUI覆盖会话fork/切换/确认删除、panel关闭、任务、发现/search/load/skill、审批、settings保存和profile受控重启；line/pipe覆盖任务/发现/显式allow-once以及settings只读字节对照。八格新增restore preview和文件/记录/blob精确字节对照；TUI另覆盖选择器取消、重新打开及显式提交draft。逐调用关联持久tool.result与成功输出，不以模型重复prompt替代结果。line/pipe完整profile切换/保存、跨平台/IME/系统复制仍未闭合；settings面板不由非TTY伪造。 |
| QA-03 | START-03 启动数据、RENDER/INPUT 回归与合成 PTY 可作质量前置；§6 预注册指标、真实模型任务集和安全回归的真实质量证据仍缺，mock 不替代。 |
| TOOL-02（部分） | `/tools` 报告 description/schema 的 UTF-8 字节数、逐工具成本列与文本摘要，明确 `tokens=not-measured`；同模型/任务/权限的总请求、发现额外成本、关键参数质量与 tokenizer/多语言误差仍待真实模型。 |
| QA-04 | 本地门禁与精确提交；CI 以 run 结果为准 |
