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
| CTX-01/02 | `context/request/budget.ts`、telemetry | budget（6）、telemetry（22） | `P+O+H>W` 仍发送时失败 |
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
| PAN-02 | `picker/session.ts`、`tree.ts` | session（20）、tree（2） | 分组行可选中、连接线缺失或跨项目动作被放行时失败 |
| PAN-03 | `picker/hub.ts` | pickers（39） | `/hub` 在无 composition 时仍打开或 apply 取消任务时失败 |
| PAN-04 | `cli/usage/service.ts` | usage（31） | 无限分母输出百分比时失败 |
| PAN-06（部分） | `picker/copy.ts`、`transcript/container.ts` | copy（3）；100 项分页、continuation、source revision 和 stale selection | 第 40 个 block 不可复制、revision 变化后仍复制或下一页丢失时失败 |
| PAN-07 | `registry.ts` | slashCommandRegistry（11） | `/extensions` 不解析到 plugin 时失败 |

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
| START-01（部分） | build manifest 已绑定 lockfile、构建配置、编译器/标准库、全部 emit 字节、五个运行资产和受控 entry；`start.test` 覆盖 journal 恢复、活动/stale build lock fail-closed、恢复期间竞争者拒绝、越界/未登记入口、篡改产物与 launcher/package-main 回滚。`--version`/`--help` 现在由轻量入口在加载 runtime 图前处理；组合参数 `--profile default --help`、`--help --print` 和坏配置正常准入均有覆盖。 | 仍需最终 fresh build 的 packaged gate、CI 与精确 SHA；stale lock 需人工确认后清理，本轮本地通过不等于任务或 CI 完成。 |
| START-02（部分） | 10k catalog 首屏测试、持久 reentry 摘要索引，以及真实 `createCliBootstrapRuntimeContext` 在 0/100/1k/10k 目录下不调用 `listSessions` 的探针已加入；startup surface 后才 `setImmediate` 加载 recovery hint。 | 仍需通过完整 CLI 首帧渲染路径记录实际帧和用户选择后的 late-result fencing；当前单元探针不能替代端到端启动证据。 |
| START-03（部分） | 历史 `bench:start`、`bench:interactive` 已记录 Node/exe 版本启动及 regular/fullscreen/pipe 首帧/退出数据。 | benchmark 未消费 ready/layout/write 观察点，未同步实际 prompt，交互矩阵仍为 Node-only，且缺少 raw sample、构建摘要和受控冷缓存；受控冷缓存及真实 ready 测量仍未闭合。 |

## W10

| 任务 | 证据 |
|---|---|
| QA-01 | 本矩阵 + 各反转测试；2026-10-20 复核确认矩阵仍缺 `TOOL-02`、`PAN-05`、`PAN-08` 的独立行，`CTX-02`/`QA-03` 仍为合并行，不能作为 47 项全覆盖证明。 |
| QA-02/03 | 已有 Linux 合成 PTY；本次增加 Node/exe × regular/fullscreen 的 settings/resume 切组和关闭；line/pipe、profile/task/discovery/approval/save 合成链路、跨平台及真实质量仍未闭合。 |
| QA-04 | 本地门禁与精确提交；CI 以 run 结果为准 |
