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
| PAN-02（部分） | `6736f402` | 时间分组、`Ctrl+P` pin、tree 连接线 |
| PAN-03（部分） | 本次 | `/hub` 只读主从面板、1s journal 轮询、详情列 |
| PAN-04（部分） | `6736f402` | `/usage account` quota 进度投影 |
| PAN-06（部分） | `6736f402` | copy 移除 recent-30 窗口 |
| PAN-07（部分） | 本次 | `/extensions` 为 `/plugin` 别名 |
| START-01 | `0afab79a` | build manifest、五种拒绝状态、`start`/`start:dev` |

## 部分完成（有实现，验收未闭合）

| 任务 | 已做 | 缺 |
|---|---|---|
| PAN-01 | model 两栏与详情、同名 relay 区分 | 连接/role/预设的绑定 revision 与搜索验收 |
| PAN-02 | 分组、pin、树形 | 跨目录授权搜索、10000 会话分页目标、预览/置顶持久验收 |
| PAN-04 | quota 进度 | thinking picker、effort/model 联合约束、unknown 非 0 |
| PAN-06 | copy 全量、pin | history 完整树、copy 分页/源 revision 到头、back/undo/restore 审计 |
| PAN-03 | hub 主从视图 | 输出分页/脱敏面板、agents 专用操作与未知状态验收 |
| PAN-07 | alias | login/logout 设备码安全显示、逐项确认验收 |
| SET-03 | status/theme 预览 | 外部更新撤销的端到端验收 |

## 未开始

PAN-03、PAN-05、PAN-08、INPUT-01、RENDER-01…03、EDIT-01、JOB-01/02、START-02/03、QA-01…04、TOOL-02。

## 当前门禁

`verify:import-cycles`、`check:declarations`、`check:config-consumers`、`check:node-floor` 通过；`verify:docs-drift:strict` 只有既有 advisory。全量 `test:ts` 结果以运行日志为准。
