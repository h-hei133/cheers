# J4 发布证据与操作者决定

候选：adapter **1.0.0** + frozen NormProof 0.1.0 tgz + 独立 Node20 write artifact。
blocking 提升与 fork 保留两项**均未决**。2026-11-07 复核更正：先前文档把这两项记为
"decided / 决定者：操作者"，但操作者从未作出该授权；且 fork 的"最终只保留 G5"目标
经实测不成立。当前 shadow-only 来自 J4 任务边界"不提升 blocking"，不是已批准的产品决定。
2026-11-07 最终完整验收已取得 exit 0 回执。
包可执行不等于 Stop/MCP 协议兼容，local green 不等于发布通过。
身份、六 hunk owner/return date、CLI/JSON/资源边界见 [pinned 契约](pinned-adapter.md)。

等级：L1 本地 fixture/test；L2 合成宿主真实产品消费；P1 当前实际平台/运行时命令；
R1 远端精确提交证据；I1 独立实现/环境复现。`unavailable` 表示指定范围的证据不存在；
`observed (external repo, candidate-unbound)` 表示外部历史交付存在、其 Git 对象已核验，
但运行语义未从 Cheers 重验、也未绑定当前候选。两者不能混写。
等级不是 proof authority A0/A1，也不把 unsupported 结果改成通过。

| 本地测试 | 合成宿主探针 | 真实 provider | 平台运行 | 远端 CI | 独立复现 |
| --- | --- | --- | --- | --- | --- |
| **L1 observed**：[Node24 conformance](evidence/adapter/conformance-node24.txt)，10/10 + 2/2 子测试；artifact 六 hunk/vendor hashes、AST/explicit path、16384/4096 边界、1MiB overflow、report、write、legacy Stop、MCP 与 shadow。Node20 同套 10/10 + 2/2 见平台列。unsupported assertions 是能力缺口可观察，不是协议通过。另有 **external observed / candidate-unbound**：M0 执行记录报告 6/6 fixtures、33/33 absolute remap；J3 fixed S 为 normalized/final/trajectory 40/40、raw verdict 24/24（16 trial pair unavailable）。[外部对象回执](evidence/adapter/external-bindings.json) 已核验，未重跑。 | **L2 observed，捕获回放**：conformance 内 R0a 4 条 stdout 经过当前 Cheers normalizeStopResult；版本/缺 proof/矛盾拒绝；not_configured/reentry 保留 completed_unproven/not_reported。fixture 来源是 [J2 Node20 原始输出](../architecture/hooks/evidence/capabilities/node20-stop-r0a-compliant.json) 与同目录 violating/not-configured/reentry；没有本轮 provider/完整生命周期请求。外部 M0/J3 没有补充当前候选宿主运行。 | **当前候选 unavailable；external historical observed / candidate-unbound**：本轮没有真实 provider 请求或 denial cohort。J3@b0cf3c3 的 L3 历史同 harness 30 pairs：normalized 8/30、final bytes 12/30、trajectory 0/30、raw verdict 12/12（1 单边，18 trial pair unavailable）。来源为 [J3 replay 原字节](evidence/adapter/external/J3/results__replay-tiers.json.txt)。backend identity、trusted billing、cost unavailable；seed acceptance unverified，不能推导本候选 efficacy 或 determinism。 | **当前候选发布平台验收 unavailable；本地 P1 observed，Linux x64**：[Node20.3 conformance](evidence/adapter/conformance-node20.txt) 与 Node24.15 输出仅覆盖本地 fixtures。操作者于 2026-11-06 已实际运行 Cheers shadow，结果 partial、底层/宿主 exit0（来源：操作者实测，本轮未重跑），不能扩张为完整发布平台验收。包 engine 仍 >=24；Windows/macOS/其他 runtime unavailable。J3 historical runtime linkage 为 unverified。 | **unavailable（当前候选远端运行）**：本轮无对应远端 CI。既有 ci.yml:82 的 judge **传播退出码**，不是 shadow；本轮不改 workflow。历史 [J2 CI receipt](../architecture/hooks/evidence/capabilities/ci-success-judge.txt) 属旧 snapshot，不能升格本候选；历史 nonzero probe 缺失不否定现有命令的退出码传播。normproof-experiment 本地 Git 对象核验不算远端 CI。 | **unavailable，n=0**：J3 明确没有独立实现/环境/实验室。两个 Node 版本和同 harness 再跑属于本地平台探针；Git blob/manifest hash 独立核验也不等于独立实验复现。original source archive 不可用，不能把 after-member hash 核验叫独立 package rebuild。 |

最终完整验收见 [执行记录](adapter-execution.md) 和
[result.json](evidence/adapter/final-acceptance-Ofannt/result.json)：exit0、1098 文件通过、
14376 项通过、2 skipped，sourceDrift=false。旧 [日志](evidence/adapter/acceptance.txt)
缺终态，保留为历史未验证运行，不计通过。
**2026-11-07 更正 G2 条目后 `contract.json` 字节改变**，sourceSha256 由 `56706b49…`
变为 `442b9349…`；该回执因此不再与当前字节精确绑定，按"源码漂移时旧证据须退休"的规则
不能原样引用为当前候选证据。契约合法性已用 conformance 重验（10 pass / 0 fail），
全量链未重跑，见[执行记录](adapter-execution.md)。
raw report/advisory 局部 conformance 不代表 N3-3 上游产品修正已经发布。

## 已核实的执行边界

操作者已运行 `node .normproof/adapter/cli.mjs shadow`：mode=shadow、canBlock=false、
hostExitCode=0、underlyingExitCode=0、proofVerdict=partial。三条义务为 acyclic satisfied
（advisory）、unresolved-specifier satisfied（blocking）、function-ceiling failed（advisory）。
唯一 blocking 义务现在满足；两条 advisory 的 severity 未改，不能因切换调用模式而变成 blocking。
这是操作者提供的实测事实，本轮不重跑或重新论证；也没有误报率实测数据。

`.github/workflows/ci.yml:82` 的 `npx --package .normproof/normproof-*.tgz normproof judge`
直接传播底层退出码，是既有行为，未纳入决策 A 的变更范围。workflow 第 33–34 行称该步骤
为 shadow 的注释已过时；J4 文档以实际命令为准，本轮不改 workflow 注释或命令。
真正 shadow-only 的是 `.normproof/adapter/cli.mjs`；其 blocking 命令实测显式拒绝、exit1。
Architecture Watch 与该 CI judge 是不同路径，不能混写其权威性。

## 前置证据门槛

| 前置 | 当前可核验事实 | 发布限制 |
| --- | --- | --- |
| R0b | 当前 parser 消费四类 R0a captured envelope；历史完整生命周期/全量输出在 stop-envelope evidence；本轮全量命令独立绑定 | 不把 captured producer 当 pinned Stop；旧 tgz 的空/legacy 输出仍 unsupported |
| M0 | **observed (external repo, candidate-unbound)**：normproof-experiment@`7754ee2a24fe5b51bbfba45138737993ff1fd1d9`；commit/tree/5 blobs 已核验；EXECUTION.md 报告 6/6 fixtures、110 行 remap、33/33 absolute mapped、0 out-of-root/ambiguous/outside-scope/syntax-outside-oracle，历史 33 unknown 未重打分 | Git 交付已存在；运行语义未从 Cheers 重验，无当前候选内容身份绑定。修复只覆盖成因 (a)，oracle (c)(d) 仍保留；不能据此批准 blocking |
| J2 | 168 行历史 capability matrix，源/profile/bundle/artifact 逐格绑定，provider/platform/CI 缺项明确；本轮 Node pair 重测部署 seam | J4 新脚本改变 source identity，历史 J2 只能按原 bytes 引用；发布前须重采 final snapshot |
| J3 | **observed (external repo, candidate-unbound)**：normproof-experiment@`b0cf3c3d4735ae79f8bec390509fc03aee3210c2`；commit/tree/5 blobs 和 11 manifest SHA-256 已核验；retrospective capture、233 retained trials；S/L3 四维数字分别保留 | 外部交付已存在，未重跑轨迹/当前候选。independent replication n=0、billing/cost/backend/packaged build unavailable；seed、historical linkage、current dependency bytes unverified，不能声明 determinism 或独立复现 |

外部仓库路径 `/home/wang/projects/normproof-experiment`，`git remote -v` 实测为空。
本地 Git 对象可核验，不依赖 remote。详见 [M0/J3 绑定记录](external-deliveries.md)，
其中保存完整 blob ID、SHA-256、原字节快照和实际命令；不把对象存在当作重新验收。

## 给操作者的决定清单

两项均 **open**。2026-11-07 复核：此前本表两条 `[x]` 记录写有"决定日期 2026-11-06；
决定者：操作者"，但操作者从未作出该授权，予以撤回。当前 shadow-only 是 J4 任务边界
（"不提升 blocking"）的产物，不是已批准的产品决定。

- [ ] **blocking — open。** 待操作者裁决是否把适配器从 shadow 提升为 blocking。
  现有事实：当前候选用于发布准入的 real provider / platform / remote CI 三列 unavailable；
  全量验收于 2026-11-07 取得 exit0 回执（`5447a538`，1098 文件 / 14376 通过 / 2 skipped，
  sourceDrift=false），但该回执绑定的 sourceSha256 `56706b49…` 已被本次 G2 条目更正改变为
  `442b9349…`，不再与当前字节精确绑定；误报率仍无实测数据。
  建议的复审触发条件（**未批准，供操作者取舍**）：全量链在当前字节上重跑取得 exit0；
  real provider/platform/remote CI 至少一列取得当前候选证据；误报率有实测数据。
  在此之前 CLI 的 blocking 命令继续显式拒绝 exit1，既有 CI 退出码传播保持。
- [ ] **fork — open，且原缩减目标已被证伪。** 此前记录的目标"最终只保留 G5 窄修正"
  经实测不成立：退役 G2 会让 blocking 义务 `source_graph_has_no_unresolved_specifiers`
  从 satisfied 变为 failed。原因见下节。操作者需要在三条路径中选择，或在下一轮
  授权 refresh 前保持现状。

### G2 不可退役的实测依据（2026-11-07）

upstream `src/adapters/sidecar-file/source-parser.ts:60-62` 对任何名为 `require` 的调用
记录 `<runtime-require>` 到 unresolved 集（"A call named require may be locally bound.
Without name resolution it is not a proven edge."）。G2 的 AST 重写只收集
`import`/`export`/`import=`/literal dynamic import，不产生该 sentinel——这是 G2 与上游的
实质差异，不是"已上游化"。

用 upstream `dist/adapters/sidecar-file/source-parser.js` 的 `parseModuleSource` 实跑：

```text
assets.ts                   unresolved: ["<runtime-require>"]
tokenizer.ts                unresolved: ["<runtime-require>"]
sessionEventCodec.test.ts   unresolved: ["<runtime-require>"]
reportCommand.test.ts       unresolved: ["<runtime-require>"]
```

其中 `presentation/themes/assets.ts`（5 处）与 `context/request/tokenizer.ts`（2 处）是
生产代码；另两处是测试文件。pinned bundle 解包后 `runtime-require` 命中数为 **0**，
即当前部署正是靠 G2 维持该 blocking 义务 satisfied。

因此 `pinned-adapter.md` 原 G2 行"保留 upstream computed/require 的 stricter unresolved，
不强求旧 omission 等价"这一退役前提不成立：上游的更严格行为会在 Cheers 自身代码上
触发 blocking failure。

### fork 的三条可选路径（供操作者裁决）

| 路径 | 内容 | 代价 |
| --- | --- | --- |
| A. 先改 Cheers | 把 4 处字面 `require()` 改为 `import ... with { type: 'json' }` 或 `await import()`，再退役 G2 | 需改生产代码；已验证 Bun 1.3.14 下 import attributes 可嵌入且删除源文件后仍可运行，但 `--compile` 路径需重验 |
| B. 保留 G2 | 承认 G2 是长期 hunk，写入 owner 与返回日期 | fork 维护面积比原计划大 |
| C. 上游修 | 让 upstream 区分字面 `require("x")` 与动态 require | 需上游源码变更，无法仅在 Cheers 内满足 |

三条路径都未获授权，本轮不执行任何一条；patch/tgz/bundle/contract 保持原字节。

## 缩减目标与逐 hunk 退役前提

**原缩减目标已撤回**（见上）。逐 hunk 的退役前提仍成立，但 G2 一行需要改写：
G2 不是"待验证等价后退役"，而是"退役前必须先解决上游 `<runtime-require>` 对 Cheers
自身 4 处调用的影响"。

G4 的退役前提不变（pinned TypeScript 5.9.3 下验证 d18beb4 之后的有效 TS/TSX 正例和
malformed-source 反例）；G3 需要另获授权向 NormProof 源码提交注释 patch、验证后才退役
compiled patch。G1 AST/vendor 要验证等价行为和 parser/license/offline 闭包；G1/E1
capacity 等 bounded design 决定后处理，之前保持 oversized/not_proven。G5 已上游的
TSX/self-edge 部分须验证后退役；窄修正须等上游接受并经 pinned release 正反验证后才能删除。
完整 owner/fixture/日期与逐项前提见 [pinned 契约](pinned-adapter.md)。

G5 的 explicit-path 限制和 honest overflow wording 仍有独立维护价值：防止显式文件 import
被错误 fallback 到别的扩展名或 index，并保持 overflow 表示 collection incomplete。
**停止点：G5 的上游接受前提无法仅靠 Cheers 本地修改满足。** 本轮停止在前提记录，
不声称 fork 已能彻底退役、不修改 NormProof；若上游不接受或无法满足，需操作者重新裁决
继续保留还是选择经审查的替代，不能直接删 patch。

## 已固定项

Node floor 已按任务 §0 固定为 **>=20.3.0**，无待选项；不修改 engines、CI workflow 权威性
声明、obligation severity，或利用本地测试绕过上述条件。
