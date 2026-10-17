---
title: "Phase 20 未完成工作索引"
category: article
sources: [repo-audit-2026-10-17, phase-20-decisions.md, 32-defect-register-2026-10.md, 35-panel-inventory-full.md, 37-command-implementation-audit.md, phase-19-acceptance.md]
created: 2026-10-16
updated: 2026-10-17
tags: [features, backlog, phase-20, status]
summary: "研究23–37已复核修订，方向裁决统一进入Phase20；CFG-01本地验收完成、交付中。本索引按配置、请求、交互、后台、启动与验收列出后续工作，保留Phase19的实现及证据缺口，不再列已答复的方向问题或不可追溯完成率。"
confidence: high
---

# Phase 20 未完成工作索引

**研究修订与规划的主入口是[Phase 20决策](phase-20-decisions.md)，CFG-01 本地验收完成、交付中，其余任务待依次实施。** consumer 清单及合同见 [profile 身份与存储边界](profiles.md)，实际交付状态见[开发日志](../log.md)。全部23–37的研究修订见[32复核登记](32-defect-register-2026-10.md)。不以研究、接线、测试文件存在或代理报告替代运行验收。

## 1. 已裁决并纳入的范围

| 范围 | 后续交付 | 规划ID |
|---|---|---|
| 配置身份 | 完整profile隔离、显式导入/受控切换、有序overlay、路径作用域设置、按字段env及来源 | CFG-01…05 |
| 模型与账户 | 脱敏availability、同provider多relay精确选择、命名预设库/角色事务、受限账号池/refresh/ledger | PRV-01…05 |
| 上下文 | 完整请求计量、首请求和后续step预算、摘要预算/幂等/overflow、首次估算与分类报告 | CTX-01…04 |
| 工具发现 | 默认动态search/load、完整schema、真实可见性与generation、描述/tokenizer/任务质量评测 | TOOL-01/02 |
| TUI基础 | 每侧padding1、最多16正文行、surface实际矩形、容器/tabs/chips/焦点/二维命中、transcript源投影 | UI-01…04 |
| Slash与settings | 主命令/named候选保留、alias执行兼容、语法投影与4路径补全、typed编辑器、7组tab/搜索、source/trust/保存/预览 | CMD-01/02、SET-01…03 |
| 面板消费者 | 现有picker逐项适配，13个现入口补面板加jobs共14，增强plugin/extensions同面板 | PAN-01…08；入口清单见[35](35-panel-inventory-full.md) |
| 输入与渲染 | 五模式Vim、Markdown数学、多行cell、并排diff、精确hunk选集与一次性批准 | INPUT-01、RENDER-01…03、EDIT-01 |
| 后台 | 交互默认60秒同进程提升；普通新消息可提前提升，取消仍停止；默认UI通知、模型跟进显式开启 | JOB-01/02 |
| 启动 | 最小首帧与ready分离、reentry异步/索引、构建digest新鲜度；start用构建产物、保留源码dev | START-01…03 |
| 验收交付 | 契约/反转/竞态、合成CLI/PTy、平台与真实质量、结构门禁、独立复核与精确SHA证据 | QA-01…04 |

顺序、owner、依赖与具体反例以规划§4–6为准。不能以表中的任务包数量替代面板数量或逐动作验证。

## 2. 已答复与技术裁定，不再构成方向阻塞

| 旧问题 | 当前决定与去向 |
|---|---|
| P-06是否新建容器 | 扩展现panel.ts，保留modal；UI-02 |
| 四类配置扩展、路径规则是否纳入 | 全部纳入；CFG/PRV，路径匹配不扩大trust/权限 |
| 动态发现默认策略 | 默认开启；TOOL，完整模式用于诊断和同条件比较 |
| 五项交互扩展范围 | 全部纳入；源投影先行、diff显示与选集授权独立 |
| H-05 extensions/plugin关系 | 增强plugin，extensions为同一入口别名；PAN-07 |
| report/theme/omfg | report保留现zip语义，通用report呈现复用CommandReport；theme入settings；不做omfg |
| J-01 tab位置、J-02 fuzzy、J-04分区、J-05组数 | 焦点/tab状态归overlay model，renderer只投影；7组起步、有序分区，复用既有搜索能力并验证排序；UI-03/SET-02 |
| H-04测试专用参考、H-07实施顺序 | 测试组件只作形状证据，不当真实用户消费者；先公共原语与事实端口，再面板族，不拿70行参考作为工期依据 |
| B-01…04后台等待和完成 | 60秒、新消息提前、取消停止、默认通知与显式模型跟进全部已决；deadline与等待独立 |
| 启动入口 | 校验源/lock/配置/编译器/mode digest，缺失/过期明确拒绝并提示build；不默默用旧产物 |

旧文档约60/67行待定表有重号和重复话题，不是同等数量的未答方向问题。已全部在规划§7按文档/分节/ID归并；阈值、列表预算、缓存key、幂等和失效控制是实施技术责任，不能再次作为“等用户裁决”的停工理由。

## 3. 不能继续使用的实现前提

- 普通model行没有disabled，“51/51全禁用”撤销。必须修availability与connection identity，不能只改标签。
- theme/skill/tools已有动态补全；真实补continue目录与usage/git/wt动作四路径。CommandSyntax派生不保证handler永不漂移。
- JSONC、项目保存、模型稀疏patch、session命名预设、长粘贴和UI后台通知已有；新能力应扩owner。
- panel的8项上限不是所有picker上限；最终预算来自surface。32个设置路径与36个顶层字段不构成同粒度覆盖率。
- 880ms启动收益与约5k对1.5k上下文差异都缺同条件归因；先固定fixture和最终wire再测。
- 102声明入口可定位、23宿主callback有接线，不证明全部功能完成。旧69/25/4及92%撤销；plugin/marketplace已有真实runtime，不能照legacy注释重做。

## 4. Phase 19留存与本阶段证据条件

以下保持[Phase 19验收§27](phase-19-acceptance.md#27-阶段收尾与未完成项)的原边界，不自动恢复Phase19，也不作为新任务免验依据。

| 留存项 | 精确边界 |
|---|---|
| A01非Linux对象绑定 | 存在实现缺口，不只是缺Windows/macOS实机跑测试 |
| A03真实环境与质量 | IME/完整前端、跨平台PDF、真实端点/研究质量、账户/协作/设备/Live等尚缺对应证据；新能力触及时取得自己的证据 |
| A13账户与远端结算 | 真实账户及可信远端结算未闭环，本地估算不代替服务端事实 |
| A12远端CI | 上次记录为账单/spending-limit阻止启动、steps为空；这是历史状态，后续须读回精确SHA的新job |
| A25整树一致性与成本 | 未观察树、OS原子性及未知拒绝边界仍保留，不承诺跨文件崩溃原子性 |

研究编制轮次没有新增真实provider、PTY、跨平台或性能运行证据；后续实施的新增证据按任务记录。参考pi的原启动实验没有成功构建，不用推断补测值。真实质量缺环境时保持未验，不能用mock的成功率宣布通过。

## 5. 开工与完成证据

从规划W1配置身份与W4 TUI公共基础开始；W2/W3落实请求身份和预算，面板等consumer在其端口与原语齐备后集成。后台与启动可先定义契约和基线，最终测量必须包含新增profile/overlay成本。

每项交付保留成功、拒绝/取消、失效/竞态和必要反转证据。沿用source/trust、CAS、单一执行面、prepared capability和统一ledger；preview、approved、applied、verified、partial/unknown保持分离。不可用reviewer不是批准。

研究编制与后续实施分开记账；实现、提交、推送、CI及发布分别取实际证据。已有.gitignore及文档重排保持用户原工作状态。验证与交付结果见[开发日志](../log.md)，不以旧“门禁全绿”冒充新提交的验证。
