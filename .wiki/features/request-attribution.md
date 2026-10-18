---
title: "请求归属与凭据退避"
category: article
created: 2026-10-17
updated: 2026-10-19
summary: "每次真实发送记录非秘密 credential 身份；429 按凭据代际退避，另一账号不受影响，轮换不重置会话预算。"
---

# 请求归属与凭据退避

## 1. 归属

`PreparedRequest` 在原有 requestId、provider、model、endpoint、purpose、bound 之外增加可选的 `credentialId` 与 `credentialGeneration`。二者由解析后的凭据派生：

- `credentialId = <provider>:<connectionId | config>`；
- `credentialGeneration` 是凭据材料的 SHA-256 前缀，轮换后变化，不含 key/token 原文。

覆盖的发送路径：主 turn、子代理、compaction/摘要、btw 侧问、jobs 代理、cache refresh。调用方在构造 provider 目标时携带同一身份，`prepareRequestAttempt` 把它写入 ledger 的 pending attempt。恢复后 `decodeRequestLedger` 保留这两个字段，并拒绝非 16 位十六进制的 generation。

返工修复了生产者直接展开 `{credentialId, generation}`、消费者却读取 `credentialGeneration` 的不匹配。主请求/普通委派和 btw 现在显式映射；摘要生产者已在上一批修复。真实本机 HTTP 回归覆盖各路径的 A 迟到 429、B 不受影响、A 新代次继续请求，核对实际发送次数与原账本的未决 A 身份、累计 12 input/3 output。

## 2. 退避

`core/auth/account/backoff.ts` 是唯一凭据等待表的 owner；`provider/request/backoff.ts` 解析响应 header 并保留薄导出。池选择与实际发送读同一等待事实：

- 响应 429 时按 `retry-after-ms`、`retry-after`（秒或日期）记录；缺失时使用 60 秒。
- 退避键包含 credentialId 与 generation：A 账号迟到 429 只阻塞 A，B 账号与轮换后的新代际不受影响。
- 初次准备、异步请求证明完成后 reserve 前、实际 transport handoff 前都重新检查该代际。reserve 前拒绝不留预留；已预留但证实未交接时确认 unsent，未知或已持久派发的结果不释放。
- 只淘汰已过期等待，保留所有仍有效期限；迟到成功和较短兄弟 429 不缩短较长 deadline。超过一天的等待不截短；正数秒到毫秒的溢出饱和到有限上限，不能变成零等待。
- 凭据键在准备时复制并冻结，调用方随后修改对象不能把等待或 response 归属改到另一代次。

退避只影响该凭据能否再次发送，不改变会话累计预算、cap 或已有 pending attempt；轮换账号不会清空 session 账本。失败分类与重试次数仍由现有 turn/provider retry owner 决定。

## 3. 历史用量与费用

主请求、缓存刷新、侧问、手动/自动/前缀/分支摘要及普通委派/顾问在发送前捕获实际目的地与目录价格，随后完成的响应继续归原请求。累计桶区分 provider、model、目的地和价格版本；同名模型的不同 relay、同一 relay 后续改价均不合并重算。持久化只保存地址摘要和 origin，不保存 URL 中的用户名、密码、路径、查询或 fragment。

已捕获但缺失的价格保持 unknown，不能在读报表时借用官方目录、另一 relay 或后来的价格；免费、部分估算和完全未知分别投影。状态栏对已知小计标记 partial，只有实际使用了旧记录的固定 fallback 才标记 assumed rates。服务端账单和 quota 不由这些本地估算推导。

累计快照使用 schema v2；无版本的历史桶保留旧 provider/model 价格查找，并对保留命名空间内的旧模型 ID 作一次无碰撞转义。恢复与锁内 delta 合并保留价格快照，重复 flush 或失败后重试不重复累计。缓存连续性使用独立的带类型身份；改价保留同目的地的缓存计量状态，换目的地或 legacy/新身份边界不能推导新目标支持缓存。

辅助请求复用会话锁及用量增量合并，不更新主会话的 context 测量、最后模型桶或 prompt/cache 历史。委派请求也不借用主会话的 provider 测量做预算。实际响应带有用量时，先记录费用再结算共享预算和判定答案；拒绝、空摘要及预算超限不能抹去这些证据。缓存刷新只有合格答案才更新保活状态，费用记录不受这一交付判断影响。未完成的流没有完整用量证据，不能按局部输出推定费用。

辅助记录器在异步准备前绑定原 profile/home、会话 ID 和目录身份，旧 A 响应在 B scope 中仍只回 A。有效原目录的锁/落盘失败保留未确认增量，后续保存不重复累计；原目录被删除或替换时只报告未能持久化，不重建目录，也不把旧费用放入同 ID 新会话。已绑定用量的普通读取、恢复和保存会淘汰失效 owner，避免失败落盘留下的旧增量在稍后被新会话消费。

本批验证覆盖各辅助路径的实际本机 HTTP、真实 state 写入与恢复、两独立进程并发增量、同 ID home/profile 隔离、失败落盘后替换目录再保存、缺价及报表消费者。Linux Node/exe × regular/fullscreen 四格每格九次实际发送与持久累计完全对应；不把这些合成证据当成真实模型账单。PRV-03…05 的完整逐条验收仍开放，精确验证与交付证据见[开发日志](../log.md)。

## 4. 边界

- 服务端 quota、余额与真实计费仍由 usage/account owner 显示（PAN-04），本机制只处理发送前的凭据退避。
- 未知或已输出部分流不因轮换自动重播；仍按 ledger 的 unknown 规则保留。
- 本轮已验证迟到成功/乱序 429、超长/溢出 header、超过 512 个 active waits、准备与交接间竞争及 immutable credential key。实际本机 HTTP 与新进程读回确认共享 cap、unknown/partial 证据；这些低层 purpose 探针不代替全部辅助消费者验收。完整 PRV-03/05 和真实 provider 验证仍按当前任务范围推进。
