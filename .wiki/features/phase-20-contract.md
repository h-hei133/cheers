# Phase 20 契约矩阵

每一行把任务绑定到所有者、当前测试与一个反转条件。测试通过只证明该行；没有真实 provider、PTY、跨平台或发布证据的行仍保持开放。

## W1 配置

| 任务 | 所有者 | 证据 | 反转 |
|---|---|---|---|
| CFG-01/02 | `config/runtimeConfig.ts`、`config/identity` | `runtimeConfig.test.ts`、`config/*` | 去掉显式输入次序后 `config` 断言失败 |
| CFG-03 | `config/layers.ts` | `layers.test.ts` | 显式输入不再遮盖文件值时失败 |
| CFG-04 | `config/scope/*` | `scope/*.test.ts`（20） | 目录身份/安全字段不再累积时失败 |
| CFG-05 | `config/fields.ts`、`layers.ts` | `environment.test.ts` | 空环境值不再忽略时失败 |

## W2 provider/认证

| 任务 | 所有者 | 证据 | 反转 |
|---|---|---|---|
| PRV-01 | `core/models/availability.ts` | `availability` 测试、`configuration.test.ts` | endpoint 带 userinfo 时失败 |
| PRV-02 | `core/commands/model/preset*` | `preset` 测试（30） | 会话预设不再整体遮盖 profile 时失败 |
| PRV-03 | `core/auth/account/{pool,presence}.ts` | `account-pool` 测试 | 池外发送回退到 env/profile 时失败 |
| PRV-04 | `core/auth/account/lease.ts` | `lease.test.ts`（7）、renewal（38） | dispatched/unknown 被提前清理时失败 |
| PRV-05 | `provider/request/backoff.ts` | backoff（5）、ledger | A 的 429 阻塞 B 时失败 |

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
| UI-02 | `chrome/panel.ts`、`overlay.ts` | `panel.test.ts`（5）、overlay（47） | 详情列点击聚焦或窄屏不退化时失败 |
| UI-03 | `chrome/{progress,chips}.ts` | progress（4）、chips（3） | unknown 输出百分比时失败 |
| UI-04 | `transcript/source.ts`、`surface/pane.ts` | `source.test.ts`（4） | 软换行插入 `\n` 或装饰行参与复制时失败 |

## W5 命令与设置

| 任务 | 所有者 | 证据 | 反转 |
|---|---|---|---|
| CMD-01 | `chrome/suggestions.ts`、`keymap.ts` | suggestions（13）、keymap（54） | `/m` 首选 `/mcp` 或完整命令接受旧候选时失败 |
| CMD-02 | `syntax/*`、`37` 审计 | syntax 套件、actions/commands | 未知参数被接受时失败 |
| SET-01 | `config/settings.ts`、`picker/settings.ts` | `settings.test.ts`（6）、picker（11） | 数值/列表落回 JSON 时失败 |
| SET-02 | `picker/settings.ts` | settings（31）、panel chips | 分组 tab 不重新加载或已存值无标记时失败 |
| SET-03 | `picker/preview.ts` | settings preview、theme selection（2） | 预览关闭后仍覆盖显示时失败 |

## W6 面板

| 任务 | 所有者 | 证据 | 反转 |
|---|---|---|---|
| PAN-01 | `picker/model.ts` | pickers（39） | 同名 model 无 relay 详情时失败 |
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
| INPUT-01、EDIT-01 | — | 未开始 | — |

## W8/W9

| 任务 | 证据 | 反转 |
|---|---|---|
| JOB-01 | 部分 | `LocalExecutionHandle`（`runtime/execution/types.ts`）提供 `pid/onOutput/detach/kill/result`；`startStreamed` 一次 spawn，`collectStreamed` 仅为兼容包装。`ExecutionService.startCommand` 返回 handle 与投影结果。`BackgroundRunner.adopt/promote` 与 `LocalJournal.promote(id,input,pid)` 把前台子进程原地晋升为持久 job，不二次 spawn；晋升前任务对 `list()` 不可见，容量拒绝时 kill 该子进程。bash 工具在默认超时（60s）且交互上下文下走 adopt，超时 `detach` 后晋升；显式 `timeout` 保持原路径。 |
| JOB-02 | 未开始 | — |
| START-01 | `scripts/start.test.mjs`（2） | stale 源码仍启动时失败 |
| START-02/03 | 未开始 | — |

## W10

| 任务 | 证据 |
|---|---|
| QA-01 | 本矩阵 + 各反转测试 |
| QA-02/03 | 未运行真实 PTY/provider/平台矩阵 |
| QA-04 | 本地门禁与精确提交；CI 以 run 结果为准 |
