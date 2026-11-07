# N4a 对部署包的核对

2026-11-06，J4 执行前核对。附件引用的本文件此前不存在；本次从只读 NormProof
`.wiki/features/fork-maintenance.md`（2026-11-05，比较点 `d18beb472adb62f178133e70addb4a529eb6d327`）
恢复任务所需分类摘要。该研究仅检查 patch/metadata 和上游源码，没有检查部署 tgz。
本记录补充实际 archive 成员核对，不替代原研究、不改变 NormProof。

**当前 tgz 仍承载全部六个 hunk，包括行为已上游化的 G2/G4。** `bundle.json` 的两个
`after` hash 都与实际 tgz 成员相等；patch 实际 hash 也与 metadata 相等。因此 N4a 的
“大部分 patch 已过时”没有使已部署字节退役。`before` hash 和 base commit 是历史来源声明，
本次没有原始 archive，不声称从 before 独立重建。

| 输入 | 实际 SHA-256 | 核对 |
| --- | --- | --- |
| archive | `6c1a37e95434bcc149f29ce2568bbccb3a3aeec91df6547535675865f6aca985` | 与 archiveSha256 相等 |
| patch | `3cb6617066340386b1658b62c4a0fc8fbbbc21d403cc3d278f8886a077b6e833` | 与 patchSha256 相等；6 个 @@ |
| module-graph.js | `d55723ea4aa21ae24264ad724e07d734b64326b01771a226a30524bce4e64faa` | 与 member.after 相等；含 G1–G5 |
| evaluate.js | `8c723a91502b9e164c1da7881639aebd1be046d2be7a509e31a776c2d3adb988` | 与 member.after 相等；含 E1 |

G1 混合 AST/vendor packaging 与 8192→16384；G2 AST 行为已上游；G3 是 literal dynamic
描述修正；G4 whole-collection syntax refusal 已上游；G5 混合已上游的 TSX/self-edge、
仍未上游的显式扩展名 candidate 限制、honest overflow 文案；E1 是 evaluator 8192→16384。
不能整块删除 G1/G5，也不能独立 upstream 两个容量常量。上游对 computed import/require
的处理更严格；旧 fork 的 omission 是缺口，不作为新的适配器语义推广。

实际命令：`rtk proxy node --test scripts/normproof-conformance.test.mjs`。
[Node24 输出](evidence/adapter/conformance-node24.txt) 开头包含 archive、patch、两个成员、
write provenance 和 hunks=6；`artifact`、`ast/comment`、`paths`、`capacity` 分别检查对应行为。
owner、日期和刷新路径见 [pinned 契约](pinned-adapter.md)。
