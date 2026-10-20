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
| PAN-06 | `picker/copy.ts` | copy（1） | 第 40 个 block 不可复制时失败 |
| PAN-07 | `registry.ts` | slashCommandRegistry（11） | `/extensions` 不解析到 plugin 时失败 |

## W7 输入与渲染

| 任务 | 所有者 | 证据 | 反转 |
|---|---|---|---|
| RENDER-01（部分） | `transcript/math.ts` | math（4） | 金额被当公式或未知命令丢失参数时失败 |
| RENDER-02（部分） | `transcript/markdown.ts` | markdown（32） | code pipe 被拆 cell 或窄屏截断长尾时失败 |
| RENDER-03（部分） | `transcript/diff.ts` | diff（10） | 零宽内容绕过字节预算时失败 |
| INPUT-01 | `editor/modal/state.ts`、`cli/interactive/keymap.ts` | 已有实现，计数/operator/文本对象、IME/粘贴及完整五模式合同待本次复核 | 不再以“未开始”描述已有代码，也不把少量模式测试当完整交付 |

## W8/W9

2026-10-20 复核撤回了本表此前的“完成”标签：实现存在不等于合同闭合，以下行均保留开放状态。

| 任务 | 证据 | 反转/未闭合 |
|---|---|---|
| JOB-01（部分） | `LocalExecutionHandle`、一次 spawn 的 `adopt/promote`、原 PID 晋升、容量拒绝与重启 unknown 路径已有实现；`src/core/tools/shell/promotion.test.ts` 覆盖了基本晋升。 | adopted task 的 settlement 初值是已解决 Promise，`stop` 在子进程真正退出前即可返回；拒绝路径还会立即宣称没有运行中的进程。需要以真实子进程断言“停止派发”与“结算”分离。 |
| JOB-02（部分） | 本地 notice、opt-in follow-up、去重/预算/截断和重启不重播已有实现与单测。 | follow-up 直接使用 `task.output`，未经过 UI notice 相同的脱敏；策略在构造时捕获 `backgroundFollowUp`，配置 reload 后不会重新读取。需要 secret 反例和 reload 反例。 |
| EDIT-01（部分） | 稳定 group id、依赖组、选集绑定、重规划 revision 检查和无选集拒绝已有实现。 | 当前 approval group 按文件操作划分，同一文件多个 hunk 仍是一个可批准组；尚未满足 hunk 级选集与依赖契约。需要同文件双 hunk 反例。 |
| START-01（未闭合） | build manifest、start/start:dev 和缺文件/过期源码的基本拒绝已有测试。 | manifest 未绑定 lockfile、构建配置、emit 字节和运行资产；`entry` 也未限制在 dist 内。需要 lockfile、dist 字节和越界 entry 的反例。 |
| START-02（部分） | 10k catalog 首屏测试和持久 reentry 摘要索引存在。 | 默认 bootstrap 仍可能在首帧前调用 `listSessions` 全量扫描；现有测试没有穿过真实 bootstrap 路径。需要 0/100/1k/10k 会话的首帧反转探针。 |
| START-03（部分） | 历史 `bench:start`、`bench:interactive` 已记录 Node/exe 版本启动及 regular/fullscreen/pipe 首帧/退出数据。 | benchmark 未消费 ready/layout/write 观察点，未同步实际 prompt，交互矩阵仍为 Node-only，且缺少 raw sample、构建摘要和受控冷缓存；受控冷缓存及真实 ready 测量仍未闭合。 |

## W10

| 任务 | 证据 |
|---|---|
| QA-01 | 本矩阵 + 各反转测试；2026-10-20 复核确认矩阵仍缺 `TOOL-02`、`PAN-05`、`PAN-08` 的独立行，`CTX-02`/`QA-03` 仍为合并行，不能作为 47 项全覆盖证明。 |
| QA-02/03 | 已有 Linux 合成 PTY；本次增加 Node/exe × regular/fullscreen 的 settings/resume 切组和关闭；line/pipe、profile/task/discovery/approval/save 合成链路、跨平台及真实质量仍未闭合。 |
| QA-04 | 本地门禁与精确提交；CI 以 run 结果为准 |
