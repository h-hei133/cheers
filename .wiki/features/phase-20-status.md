# Phase 20 交付状态

本文只记录有本地证据的状态，不把实现等同于交付。提交、推送与 CI 分别列出；未运行的真实 provider、PTY、跨平台与发布验收不算通过。

## 已完成（本地验证 + 提交 + 推送）

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
| PAN-02（部分） | `6736f402`、本次 | 时间分组、`Ctrl+P` pin、tree 连接线、resume 分页到 10000 |
| PAN-03（部分） | 本次 | `/hub` 只读主从面板、1s journal 轮询、详情列 |
| PAN-05（部分） | 本次 | `/advisor` 只读 checkpoint/note 主从面板；`/plan-review` 增加结构化 `CommandReport`（版本/阶段/验收项/绑定状态），`/btw` 增加问题/是否送达/答案报告；两者仍只读或独立授权 |
| INPUT-01（部分） | 本次 | 五模式状态机、vimMode、Normal/Visual Enter 不提交、粘贴优先 |
| RENDER-03（部分） | 本次 | 并排 diff、配对行号、双预算、窄屏 unified 回退 |
| RENDER-02（部分） | 本次 | 多行 cell、escaped/code pipe、`<br>`、窄屏源码回退与预算 |
| RENDER-01（部分） | 本次 | 内联数学投影、金额/代码保护、未知命令与超预算保原文 |
| PAN-04（部分） | `6736f402`、本次 | `/usage account` quota 进度投影、`/thinking` effort 选择器 |
| PAN-06（部分） | `6736f402` | copy 移除 recent-30 窗口 |
| PAN-07（部分） | 本次 | `/extensions` 为 `/plugin` 别名 |
| START-01 | `0afab79a` | build manifest、五种拒绝状态、`start`/`start:dev` |
| JOB-01 | `dd43bcce` | 单次 spawn、detach/kill、adopt/promote、60s/新消息晋升、撤权 kill、重启 unknown 不重播 |
| JOB-02 | `7da6e6d4`、`8c7f949f` | 本地 notice、opt-in follow-up（去重/预算/截断）、取消不转后台 |
| EDIT-01 | `57e1ffb3`、`8c7f949f` | 稳定 group id、依赖分组、选集绑定、无选集拒绝、重规划基线校验、CLI 多选 |
| START-02 | `3de906fe` | 10k 首帧不扫描；持久摘要索引（mtime/size、损坏即 miss） |
| PAN-05（部分） | `2a4bafe5` | plan-review/btw 结构化报告；advisor 面板 |
| PAN-03（部分） | `070f1405` | hub 本地作业输出页（脱敏/截断）、后续页指引 |
| PAN-08（部分） | `93302750` | MCP 逐项向导；临时定义 0600 且必删 |
| START-03（部分） | `a6ba2665` | Node/exe 与 regular/fullscreen 各 30 次首帧/退出基准 |

## 部分完成（有实现，验收未闭合）

| 任务 | 已做 | 缺 |
|---|---|---|
| PAN-01 | model 两栏与详情、同名 relay 区分、预设行 | 连接/role 的绑定 revision 搜索验收 |
| PAN-02 | 分组、pin、树形、分页、跨项目搜索 | 预览/置顶持久验收 |
| PAN-04 | quota 进度、thinking picker | effort/model 联合约束与 unknown 非 0 的更多模型验收 |
| PAN-06 | copy 全量、pin | history 完整树、copy 分页/源 revision 到头、back/undo/restore 审计 |
| PAN-03 | hub 主从视图 | 输出分页/脱敏面板、agents 专用操作与未知状态验收 |
| PAN-07 | alias、逐项确认 | login/logout 设备码安全显示的端到端验收 |
| SET-03 | status/theme 预览 | 外部更新撤销的端到端验收 |

## 未闭合

- START-03：pipe 模式、受控冷缓存、逐键延迟。
- PAN-05：流式面板。
- RENDER-03：并排 diff 的左右源复制。
- QA-02/03：PTY/双构建/平台矩阵与真实质量（缺环境/模型）。
- TOOL-02：描述/tokenizer/质量评估（需真实模型）。

## CI

- `9c8104a6`（copy 测试改为 clipboard sink）：CI success，12m28s。
- 其后的 docs/advisor/resume 提交在写本文时仍在队列中；以 GitHub run 结果为准，不能把本地通过当成 CI 通过。
- 更早的失败提交均已被后续修复覆盖：handoff 的 `todo` pin、director feature tools、settings 标签、firstFrame padding、MCP 启动超时、copy 的环境依赖。
- `57e1ffb3`、`7da6e6d4`、`f0f2f2d2` 的 CI 均因同一对取消测试超时失败（`director/runtime.test.ts`、`jobs/agent/command.test.ts`）：bash 工具改走 `startCommand` 后，测试仍 mock `executeLocally`。`0b8dcdb4` 改为 mock `startStreamed` 并让 `startCommand` 同样报告 settlement；本地全量 8473 通过，CI success（run 39061415399）。`c5da8107`（启动基准脚本与 `bench:start`）CI success（run 39062680340）。`070f1405` CI success（run 39066438514）。
- `8c7f949f`、`3de906fe`、`2a4bafe5`、`b913c50e` CI success；`dd43bcce` 的 CI 仅 `cli-baseline.test.ts` 的 pipe-spawn smoke 失败（期望 `- ID:`），本地单跑 40/40 通过，且其后的 SHA 同代码 CI success，归为负载下的 spawn 抖动。

## 启动基准（2026-10-18，WSL2，Node 20）

`npm run bench:start`：每个样本一个新进程，测 spawn 到退出的墙钟时间；首样本单列，因为无特权无法清页缓存，不能称为受控冷启动。

| target | runs | first | p50 | p95 | min | max |
|---|---|---|---|---|---|---|
| node `dist/cli.js --version` | 30 | 1991.5ms | 1030.4ms | 1074.6ms | 995.8ms | 1991.5ms |
| exe `dist/bin/cheers --version` | 30 | 492.7ms | 497.5ms | 526.1ms | 469.7ms | 528.2ms |

交互（`npm run bench:interactive`，`script` 提供 PTY，每模式 30 次，`/exit` 在 1200ms 注入）：

| mode | first frame first | first frame p50 | first frame p95 | exit after `/exit` p50 | p95 |
|---|---|---|---|---|---|
| regular | 1044.4ms | 1052.3ms | 1081.4ms | 1362.9ms | 1383.5ms |
| fullscreen | 1074.1ms | 1065.7ms | 1099.3ms | 1362.8ms | 1394.8ms |

未测：pipe 模式、受控冷缓存、逐键延迟（当前只测到 `/exit` 命令处理完成）。

## 本地全量

- `0b8dcdb4`：850 文件、8473 通过、1 跳过（`npm run test:ts`，410s）。

- 最新 `test:ts`：8459/8459 通过（fresh dist，含 INPUT-01 与 receipt 去重修复）。
- `test:scripts` 59 项、`verify:import-cycles`、`check:config-consumers`、`check:declarations`、`check:node-floor` 通过；`verify:docs-drift:strict` 只有既有 advisory。
- 全量套件曾暴露的真实缺陷均已修复：`todo`/feature tool 未进首请求、settings 标签、firstFrame padding、MCP 启动超时、copy 环境依赖、并发 receipt 重复。

## 当前门禁

`verify:import-cycles`、`check:declarations`、`check:config-consumers`、`check:node-floor` 通过；`verify:docs-drift:strict` 只有既有 advisory。全量 `test:ts` 结果以运行日志为准。
