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
| PAN-05（部分） | 本次 | `/advisor` 只读 checkpoint/note 主从面板 |
| INPUT-01（部分） | 本次 | 五模式状态机、vimMode、Normal/Visual Enter 不提交、粘贴优先 |
| RENDER-03（部分） | 本次 | 并排 diff、配对行号、双预算、窄屏 unified 回退 |
| RENDER-02（部分） | 本次 | 多行 cell、escaped/code pipe、`<br>`、窄屏源码回退与预算 |
| RENDER-01（部分） | 本次 | 内联数学投影、金额/代码保护、未知命令与超预算保原文 |
| PAN-04（部分） | `6736f402`、本次 | `/usage account` quota 进度投影、`/thinking` effort 选择器 |
| PAN-06（部分） | `6736f402` | copy 移除 recent-30 窗口 |
| PAN-07（部分） | 本次 | `/extensions` 为 `/plugin` 别名 |
| START-01 | `0afab79a` | build manifest、五种拒绝状态、`start`/`start:dev` |
| START-02（部分） | 本次 | 10k 会话首帧不扫描目录、渐进/取消沿用 iterator |

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

## 未开始

PAN-08、INPUT-01、EDIT-01、JOB-01/02、START-02/03、QA-01…04、TOOL-02；PAN-03 输出分页/脱敏、RENDER-03 resize 锚点与左右源复制仍缺。

## CI

- `9c8104a6`（copy 测试改为 clipboard sink）：CI success，12m28s。
- 其后的 docs/advisor/resume 提交在写本文时仍在队列中；以 GitHub run 结果为准，不能把本地通过当成 CI 通过。
- 更早的失败提交均已被后续修复覆盖：handoff 的 `todo` pin、director feature tools、settings 标签、firstFrame padding、MCP 启动超时、copy 的环境依赖。

## 本地全量

- 最新 `test:ts`：8459/8459 通过（fresh dist，含 INPUT-01 与 receipt 去重修复）。
- `test:scripts` 59 项、`verify:import-cycles`、`check:config-consumers`、`check:declarations`、`check:node-floor` 通过；`verify:docs-drift:strict` 只有既有 advisory。
- 全量套件曾暴露的真实缺陷均已修复：`todo`/feature tool 未进首请求、settings 标签、firstFrame padding、MCP 启动超时、copy 环境依赖、并发 receipt 重复。

## 当前门禁

`verify:import-cycles`、`check:declarations`、`check:config-consumers`、`check:node-floor` 通过；`verify:docs-drift:strict` 只有既有 advisory。全量 `test:ts` 结果以运行日志为准。
