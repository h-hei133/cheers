---
title: "压缩操作与步骤幂等"
category: article
created: 2026-10-17
updated: 2026-10-17
tags: [context, compaction, phase-20]
summary: "压缩按 session/摘要器/策略/指令与精确历史摘要标识步骤；完成可复用，已派发或未知不重播，并发重复不重复计费。"
---

# 压缩操作与步骤幂等

`session/compactionOperation.ts` 把摘要请求当作有身份的逻辑操作：

```text
operation = session + provider + model + policy + instructions
step      = 被摘要的精确消息、previousSummary 与指令的摘要
```

策略包含 window、reserve、keepRecent、enabled 与指令；任一变化就是另一个操作。历史、切点或已有摘要变化就是另一个步骤，因此合法的分段摘要各自计量，旧步骤的完成结果不会被套用到新历史上。

## 1. 持久状态

记录位于会话目录的 `compaction-operations.json`：

| 状态 | 含义 |
|---|---|
| `dispatched` | 请求可能已经发出 |
| `unknown` | 结果不可验证；不得自动重播 |
| `completed` | 已保存摘要，可直接复用 |

所有写入在 `.lock` 内重读、原子写入并读回核对。最多保留 16 个操作、每个 32 个步骤，超过 7 天的记录清理。没有真实会话目录时不写任何文件；投影出的 session id 不会污染 profile。

## 2. 行为

- 同一操作/步骤重复调用：已完成则复用摘要，不再请求 provider；`dispatched`/`unknown` 则返回 `step-unknown` 拒绝，不重播可能已计费的请求。
- 并发重复：第一个取得步骤，第二个立即得到 `step-unknown`；provider 只被调用一次。
- 摘要返回空或抛错：标记 `unknown`，保留失败事实；取消同样不把步骤当作已完成。
- 前缀摘要只在调用方实际提供 prefix summarizer 时声明步骤；没有 summarizer 时不留下永远 `dispatched` 的占位。
- 手动 `/compact`、自动阈值与 overflow 救援共用同一 store；`would-not-shrink`、取消与无合法切点仍在摘要之后按原规则拒绝，不覆盖历史。

## 3. 边界

- 摘要结果的应用仍由现有调用方的快照更新完成；本机制保证不重复请求与不复用旧步骤，不承诺跨文件崩溃原子性。
- 未实现跨进程 lease；同一 profile 的两个进程写同一会话目录时由文件锁串行化，但步骤状态不是分布式事务。
- 已验证：完成复用、未知拒绝、并发重复、操作身份分离、损坏文件、前缀占位；未运行真实 provider。
