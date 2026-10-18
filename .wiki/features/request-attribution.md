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

## 3. 边界

- 服务端 quota、余额与真实计费仍由 usage/account owner 显示（PAN-04），本机制只处理发送前的凭据退避。
- 未知或已输出部分流不因轮换自动重播；仍按 ledger 的 unknown 规则保留。
- 已验证：退避作用域、Retry-After 解析、发送前拒绝、成功清除、有界淘汰、ledger 归属字段；未运行真实 provider 或多进程动态证据。
