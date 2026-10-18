---
title: "压缩操作与步骤幂等"
category: article
created: 2026-10-17
updated: 2026-10-19
tags: [context, compaction, phase-20]
summary: "摘要的有界分段、永久重播证据与原生会话条件发布；不确定发送和未验证写入不能变成成功。"
---

# 压缩操作与步骤幂等

`session/compaction/` 拥有请求合同、调度、步骤状态、原生提交及发布证明；`session/compactionOperation.ts` 只保留兼容导出。手动、自动阈值和 overflow 使用同一份不可变原生历史生成摘要，分别重建调用方的 system、当前 turn opening 和保留尾部。

```text
operation = session + provider + model + policy + instructions + logical source + authority
step      = 精确消息 + previousSummary + instructions + history/prefix/merge stage
```

策略包含 window、reserve、keepRecent、enabled、segmentTokens 与有效摘要目标限制。明确 summary 角色还绑定 connection/model/effort、凭据代际和目录能力的非秘密摘要；fallback 也包含实际摘要限制。逻辑重播身份与提交时的精确新鲜度分开：同内容指令 touch、恢复 metadata、临时配置 publication 和分支往返不能授权重发 unknown，但会使原在途提交失效。

## 1. 持久步骤

会话目录的 `compaction-operations.json` 使用 V2，在原文件锁内重读、原子写入及精确读回核对。claim 使用不可变随机 id，只有原生取得的本次句柄可以 mutation；跟随者及复制、伪造句柄只读。

| 状态 | 含义 |
|---|---|
| `prepared` | 本次已取得步骤，尚未验证传输交接；仅原 owner 能证明未发送并释放 |
| `dispatched` | 实际 HTTP 前交接已持久化并读回；请求可能已发送 |
| `unknown` | 发送或结果不可验证，拒绝自动重播 |
| `completed` | 已验证摘要材料可复用；材料淘汰后身份仍保留，不能再次授权发送 |

七天、每操作 32 条、最多 16 个操作仅限制可复用摘要材料。所有 prepared/dispatched/unknown/completed 身份作为重播证据保留；总计 8192 个身份时拒绝新增步骤。不能删除记录给请求腾空间。V1 曾可能淘汰未知请求，整文件拒绝自动使用，不能从缺记录推定未发送。

原生路径始终绑定已捕获的 profile 和会话目录身份。删除、替换或换 profile 不能降级为无文件 claim 或重新创建同名会话。无目录行为只供明确合成调用，不能替代产品持久合同。

## 2. 有界生成与请求计量

- 合法单元保留 tool call/result 配对，重复 tool id 或不可分的大组拒绝。最多 64 个 source segment，每 segment 最多 512 条消息、默认估算 16000 tokens；source 与 merge 合计最多 128 次发送，过大的合并输入同样拒绝。
- history、prefix 和 merge 分别走原请求预算、attempt ledger、credential attribution 和 usage owner。每次完整返回的用量先记录，再验证摘要；拒绝、取消后的完整材料仍保留已知成本。
- 纯预算预检先于 claim。真实 dispatch 在已有 transport 的实际交接点持久化；明确未交接的本次 prepared 可释放，未知交接不能自动重试。
- 同 operation/step 只派发一次；完成材料直接复用，未知段使重启后整个原调度拒绝，不能跳过未知段继续生成。
- 原有 checkpoint 与各 segment 的确定性文件足迹合并保留，不依赖摘要模型重新列出路径。
- would-not-shrink、无合法切点、hook 拒绝和取消均不覆盖原历史；overflow 仍沿原有界救援路径。

## 3. 原生条件发布

生成前捕获 profile/store、metadata 与 transcript 的 inode/字节、分支路径和导航 revision、模型、上下文及指令/config authority。普通 transcript 和 metadata writer 复用原 session state lock；metadata 仅能委托给当前同步持锁 owner，其他 state transaction 不提供一般重入。

提交在该锁内重新准入并捕获完整 source，最后一次准入后再次捕获，再紧邻 append 检查取消。新 turn、分支 A→B→A、模型/上下文、指令或配置发布变化使迟到摘要拒绝。摘要材料及已知成本可以保留，但拒绝不是历史写入成功。

先写 `compaction-prepared` wire record，fsync 并核对完整字节，随后才写绑定唯一 id、完整摘要 digest 和顺序的 `compaction-commit` proof，再 fsync/readback。没有唯一且在后的精确证明时 prepared 材料不进入模型上下文；旧 reader 拒绝新 wire 类型，不能将未验证材料当作旧成功摘要。

即时报 unverified 的调用不发布 PostCompact、checkpoint 或成功 context update。自动阈值与 overflow 抛出固定安全错误并停止 turn，不产生普通 query.completed。若摘要已先获得精确验证且后续完整 marker 在重载时可验证，重载可恢复更强发布证据；不能把该恢复可能性改写为即时成功。初次摘要写入本身不确定时保持 inert。

新 receipt 仅适用于捕获的分支路径及其后代，rewind/sibling 保留原对话。fork 只重映射已经验证的 root/path/proof，不把无效材料复制成有效摘要。legacy receipt 保留明确历史解释。

## 4. 运行边界与验收

- 8192 份永久证据是安全容量限制。长会话可能拒绝后续摘要；当前没有自动清证据或 V1 修复命令，应保留原会话并另建会话，不能手工清文件来获得发送授权。
- 完整 source 校验、fsync/readback 及 operation 文件重写在原锁内执行同步 I/O，大历史会延迟其他 writer。真实性优先；后续优化需真实规模测量且不能弱化精确身份或重播证据。
- 文件锁不提供网络/多文件崩溃原子性，也不提供无限可用性；未知发送、存储和 lock cleanup 始终独立报告。
- 本地合成测试、独立代码/架构反例、加载时反转、独立进程 HTTP/restart 与 Linux Node/exe × regular/fullscreen PTY 证据见开发日志。架构为 WATCH，代码通道为 APPROVE，按规则合成 COMMENT；两项运行取舍已明确记录。
- 未运行真实摘要质量、Windows/macOS 实机；该批不等于整个 W3 或 Phase 20 完成。提交、推送和精确 SHA CI 以开发日志为准。
