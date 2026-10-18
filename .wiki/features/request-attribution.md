---
title: "请求归属与凭据退避"
category: article
created: 2026-10-17
updated: 2026-10-18
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

`provider/request/backoff.ts` 维护有界（512 条）的凭据退避表：

- 响应 429 时按 `retry-after-ms`、`retry-after`（秒或日期）记录；缺失时使用 60 秒。
- 退避键包含 credentialId 与 generation：A 账号迟到 429 只阻塞 A，B 账号与轮换后的新代际不受影响。
- 发送前若该代际仍在等待，请求在 reserve 之前拒绝，不产生 ledger 预留或网络副作用。
- 同一凭据的成功响应清除其退避。

退避只影响该凭据能否再次发送，不改变会话累计预算、cap 或已有 pending attempt；轮换账号不会清空 session 账本。失败分类与重试次数仍由现有 turn/provider retry owner 决定。

## 3. 历史用量与费用

主请求和缓存刷新在发送前捕获实际目的地与目录价格，随后完成的响应继续归原请求。累计桶区分 provider、model、目的地和价格版本；同名模型的不同 relay、同一 relay 后续改价均不合并重算。持久化只保存地址摘要和 origin，不保存 URL 中的用户名、密码、路径、查询或 fragment。

已捕获但缺失的价格保持 unknown，不能在读报表时借用官方目录、另一 relay 或后来的价格；免费、部分估算和完全未知分别投影。状态栏对已知小计标记 partial，只有实际使用了旧记录的固定 fallback 才标记 assumed rates。服务端账单和 quota 不由这些本地估算推导。

累计快照使用 schema v2；无版本的历史桶保留旧 provider/model 价格查找，并对保留命名空间内的旧模型 ID 作一次无碰撞转义。恢复与锁内 delta 合并保留价格快照，重复 flush 或失败后重试不重复累计。缓存连续性使用独立的带类型身份；改价保留同目的地的缓存计量状态，换目的地或 legacy/新身份边界不能推导新目标支持缓存。

本批验证覆盖主请求/cache、真实 state 写入与恢复、两进程并发增量、缺价及报表消费者。其他辅助请求的费用投影、PRV-03…05 的完整逐条验收仍开放；不能把本节当成所有请求路径已完成的证明。精确验证与交付证据见[开发日志](../log.md)。

## 4. 边界

- 服务端 quota、余额与真实计费仍由 usage/account owner 显示（PAN-04），本机制只处理发送前的凭据退避。
- 未知或已输出部分流不因轮换自动重播；仍按 ledger 的 unknown 规则保留。
- 已验证：退避作用域、Retry-After 解析、发送前拒绝、成功清除、有界淘汰、ledger 归属字段；未运行真实 provider 或多进程动态证据。
