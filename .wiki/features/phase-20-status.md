# Phase 20 交付状态

本文只记录有本地证据的状态，不把实现等同于交付。提交、推送与 CI 分别列出；未运行的真实 provider、PTY、跨平台与发布验收不算通过。

## 返工复核（2026-10-18）

复核基线为 `12a7d4e0`。先前“只剩四项未闭合”的结论撤回：下方旧记录包含部分实现、未完成验收及重复任务，不能证明全部裁决兑现。保留历史提交证据，逐批按决策文档重新验收；不以本轮少量回归通过重判整个任务完成。

| 批次 | 当前复核结果 | 后续范围 |
|---|---|---|
| W1 CFG-01…05 | CFG-02/04 发现并修复导入相对路径规则改变目标的问题；default、named、legacy、preview 后源变化回归通过 | 继续核查全部身份 consumer、配置快照及失效合同 |
| W4 UI-01…04 | UI-02/03 修复固定八项上限、详情被候选数裁短、tab 点击区域覆盖、缺键盘切组及 modal 不显示分组；可用矩形和旧命中失效回归通过 | 其余公共原语、源选区及各消费者仍按合同复核 |
| W2/W3 | 既有实现尚未完成本次逐条复核 | PRV-01…05、CTX-01…04、TOOL-01 的请求、拒绝、并发和恢复证据 |
| W5 | SET-02 **已确认缺口**：选择分组后 `settingsPicker` 先过滤 definitions，后续文字过滤不能搜索其他组 | 跨 tab 搜索及原分组回跳；CMD-01/02、SET-01/03 全部验收 |
| W6 | modal 的项目范围切组现已可达；不能由此证明完整目录分页/搜索 | PAN-01…08 各动作、只读边界、分页和 revision |
| W7/W8/W9 | 尚未完成本次逐条复核 | INPUT-01、RENDER-01…03、EDIT-01、JOB-01/02、START-01/02 的完整裁决 |
| W10 | 本批 135 文件/1813 测试通过；修改前实现使 20 项回归失败；两路独立复核通过；Node/exe × regular/fullscreen 的 settings/resume 切组、关闭与退出 PTY 通过 | QA-01/02/04 随后续返工累积；本批不等于全阶段交付 |

本批静态检查、构建、提交和 CI 的精确状态见开发日志。本轮 PTY 鼠标只验证 fullscreen；regular 仍由终端负责鼠标滚动与选择。

用户已允许后续验证的环境/真实模型项：START-03 受控冷缓存及剩余响应测量、QA-02 跨平台/IME/系统复制、QA-03 真实质量、TOOL-02 成本与 tokenizer 校准。**这项保留不覆盖可在本地完成的缺失实现和合成端到端验收。**

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
| PAN-02（部分） | `6736f402`、本次 | 时间分组、`Ctrl+P` pin、tree 连接线、resume 分页到 10000 |
| PAN-03（部分） | 本次 | `/hub` 只读主从面板、1s journal 轮询、详情列 |
| PAN-05（部分） | 本次 | `/advisor` 只读 checkpoint/note 主从面板；`/plan-review` 增加结构化 `CommandReport`（版本/阶段/验收项/绑定状态），`/btw` 增加问题/是否送达/答案报告；两者仍只读或独立授权 |
| INPUT-01（部分） | 本次 | 五模式状态机、vimMode、Normal/Visual Enter 不提交、粘贴优先 |
| RENDER-03 | 本次 | 并排 diff（tool 卡片在 inner≥100 时也并排）、配对行号、双预算、窄屏 unified 回退、resize 锚点、左右源复制（command/error 与 framed tool 卡片） |
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
| PAN-05 | `2a4bafe5`、本次 | advisor 只读面板 + enable/review/apply 分别授权；plan-review 结构化报告与版本化 approve/reject/execute；btw 结构化报告、带外；面板查看不启模型，模型工作只走显式命令/普通 turn |
| PAN-03（部分） | `070f1405` | hub 本地作业输出页（脱敏/截断）、后续页指引 |
| PAN-08（部分） | `93302750` | MCP 逐项向导；临时定义 0600 且必删 |
| START-03（部分） | `a6ba2665` | Node/exe 与 regular/fullscreen/pipe 各 30 次首帧、命令→退出基准 |

## 部分完成（有实现，验收未闭合）

| 任务 | 已做 | 缺 |
|---|---|---|
| PAN-01 | model 两栏与详情、同名 relay 区分、预设行 | 连接/role 的绑定 revision 搜索验收 |
| PAN-02 | 分组、pin、树形、分页、跨项目搜索 | 预览/置顶持久验收 |
| PAN-04 | quota 进度、thinking picker | effort/model 联合约束与 unknown 非 0 的更多模型验收 |
| PAN-06 | copy 全量、pin | history 完整树、copy 分页/源 revision 到头、back/undo/restore 审计 |
| PAN-03 | hub 主从视图、本地作业输出页（脱敏/截断、后续页指引） | agents 专用操作仍归 `/jobs`；未知状态验收未单列 |
| PAN-07 | alias、逐项确认 | login/logout 设备码安全显示的端到端验收 |
| SET-03 | status/theme 预览 | 外部更新撤销的端到端验收 |

## 未闭合

- START-03：受控冷缓存（需清页缓存权限）；逐键延迟目前以 `/exit` 命令处理为代理。

- QA-02/03：Linux PTY 矩阵已通过 Node/exe × regular/fullscreen（`npm run qa:pty`：`/tools` 后 Esc 关闭 reader、`/sessions current`、`/exit`）；Windows/macOS/IME/系统复制与真实质量仍缺环境/模型。
- TOOL-02：静态描述/schema 字节成本已进 `/tools` 报告（`size.unit=utf8-bytes`，`tokens=not-measured`）；同模型质量/缓存对比与 tokenizer 校准仍需真实模型。

## CI

- `9c8104a6`（copy 测试改为 clipboard sink）：CI success，12m28s。
- 其后的 docs/advisor/resume 提交在写本文时仍在队列中；以 GitHub run 结果为准，不能把本地通过当成 CI 通过。
- 更早的失败提交均已被后续修复覆盖：handoff 的 `todo` pin、director feature tools、settings 标签、firstFrame padding、MCP 启动超时、copy 的环境依赖。
- `57e1ffb3`、`7da6e6d4`、`f0f2f2d2` 的 CI 均因同一对取消测试超时失败（`director/runtime.test.ts`、`jobs/agent/command.test.ts`）：bash 工具改走 `startCommand` 后，测试仍 mock `executeLocally`。`0b8dcdb4` 改为 mock `startStreamed` 并让 `startCommand` 同样报告 settlement；本地全量 8473 通过，CI success（run 39061415399）。`c5da8107`（启动基准脚本与 `bench:start`）CI success（run 39062680340）。`070f1405` CI success（run 39066438514）；`93302750`、`a6ba2665`、`4631ea3a`、`8802e496` CI success。`2bdebf5a` 仅 `browser.test.ts` 的 “blocked without a manifest” 失败（本地 5/5 通过，且其后含同改动的 `4631ea3a` CI success），归为 CI 浏览器环境抖动。`ea0078ab`（索引清理）、`cd881d25`（双构建 PTY）、`df23d812`（并排源复制）、`0ea1c2fa`（预派发取消）、`a8b07008`（浏览器场景超时）、`e3217a14`（CLI 场景超时）CI success；`768903b0`（external 场景超时）CI success（run 39076664306）。`bde00a5e` 再次命中同一 baseline 管道抖动；已改为等待 `- ID:` 行，本地 40/40，后续 SHA 验证。
- `8c7f949f`、`3de906fe`、`2a4bafe5`、`b913c50e` CI success；`dd43bcce` 的 CI 仅 `cli-baseline.test.ts` 的 pipe-spawn smoke 失败（期望 `- ID:`），本地单跑 40/40 通过，且其后的 SHA 同代码 CI success，归为负载下的 spawn 抖动。

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
