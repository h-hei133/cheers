---
title: "压缩操作与步骤幂等"
category: article
created: 2026-10-17
updated: 2026-10-18
tags: [context, compaction, phase-20]
summary: "压缩步骤复用与未知拒绝的现有机制；摘要角色身份和发送前预算预检已接通，完整生命周期、保留及分段合同仍待返工。"
---

# 压缩操作与步骤幂等

`session/compactionOperation.ts` 把摘要请求当作有身份的逻辑操作：

```text
operation = session + provider + model + policy + instructions
step      = 被摘要的精确消息、previousSummary 与指令的摘要
```

策略包含 window、reserve、keepRecent、enabled 与指令；选择 `summary` 角色时还包含连接/模型/effort、凭据代际、模型能力与摘要请求限制的非秘密摘要。未选择角色时保持原键兼容，防止升级后重新发送已有 unknown 步骤。角色摘要和主模型压缩策略分开解析；已完成材料仅在相同键下复用。完整分段/合并调度仍待 CTX-03 返工，不能把存在步骤记录当作该调度已实现。

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
- 明确摘要角色的 history 与 prefix 请求先用发送端共用的完整消息构造执行纯预算预检，全部通过才开始 claim；窗口不足是零发送拒绝，重试不会变成 `step-unknown`。实际发送再次检查同一预算。
- 手动 `/compact`、自动阈值与 overflow 救援共用同一 store；`would-not-shrink`、取消与无合法切点仍在摘要之后按原规则拒绝，不覆盖历史。

## 3. 边界

- 摘要结果的应用仍由现有调用方更新；完整 history/branch/owner revision CAS、config publication 绑定和恢复合同尚待逐路径复核，不能宣称 CTX-03 已闭合。
- 当前保留上限和过期清理会移除记录，尚未独立保留 unresolved claim；其他发送前错误也可能留下 dispatched。上述局限意味着不能笼统保证跨任意时间/容量不重播；本批仅消除新增摘要窗口预检的已知零发送误报。
- 未实现跨进程 lease；同一 profile 的两个进程写同一会话目录时由文件锁串行化，但步骤状态不是分布式事务。
- 已验证：完成复用、未知拒绝、并发重复、操作身份分离、损坏文件、前缀占位；未运行真实 provider。
