# Pinned NormProof adapter 1.0.0

Cheers 自有部署适配器，机器契约为
[contract.json](../../.normproof/adapter/contract.json)。blocking 提升与 fork 保留
**均为 open**：2026-11-07 复核撤回了此前文档中记为"操作者已决定"的两条记录，
并证实原定"最终只保留 G5"的缩减目标不成立（G2 退役会使 blocking 义务失败）。
本轮只记录前提，不执行 refresh；机器 contract 仍描述当前冻结的六 hunk artifact，
不会把尚未执行的目标当作已发布事实。
proof kernel、collector、evaluator、hook 判定、report 和 protocol server 均来自现有 pinned
artifact。适配器只校验身份、投影 manifest、调用 CLI、记录结果；没有另一套 proof 算法。

## 归口与固定身份

Cheers packaging/release maintainer（操作者角色）负责发行物、conformance 和部署刷新；
NormProof 的 owner 是源码责任归口，本任务没有向其发送消息、提交 issue 或获得承诺。
所有 hunk 的复查/返回日期为 **2026-11-20，或更早的下一次授权 refresh 之前**。
届时必须记录退役、上游修正或有理由的延期决定；日期到达/overflow 不自动允许刷新。

| 项 | 固定值 |
| --- | --- |
| adapter | `cheers.normproof.adapter@1.0.0`；模式 shadow |
| package/base | NormProof 0.1.0；`e712ec48acd4282fd7214ad46e9c24bd21909b35`（历史声明，原始 archive 不可用） |
| bundle metadata | SHA-256 `cbcc3d3814fba42232a96f187c509fb2e3225b6f5bbe6835d563d3914255cf2c` |
| tgz | SHA-256 `6c1a37e95434bcc149f29ce2568bbccb3a3aeec91df6547535675865f6aca985` |
| patch | SHA-256 `3cb6617066340386b1658b62c4a0fc8fbbbc21d403cc3d278f8886a077b6e833` |
| parser | TypeScript **5.9.3**，vendored `typescript.cjs` SHA-256 `3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675`；Apache-2.0 license/notices 逐字节校验 |
| independent write artifact | SHA-256 `817aaa8838df536212907ca56ece9360385b9bda8f8ff87383d1c8fd6f46580d`；provenance `a6ff094ac14049843b6c471eabd2aaa4a55ac8fb`，esbuild@0.27.7，inputs 见 artifact.json |
| Cheers Node floor | **>=20.3.0 固定**，不是待决策项；未改 package.json |
| bundle package engine | **>=24** 原样保留；直接 Node20.3 探针不经过 npm engine admission，不扩大 upstream 支持承诺 |

运行前校验 archive、metadata、patch、所有 adapted member 和 vendor hash、write artifact、
parser 版本、limits、6 个 hunk header/owner/fixture/refresh/date。缺失或漂移报告
`stale_artifact` / `invalid_contract`；Node <20.3 报告 `unsupported_runtime`。
这些失败没有 proof，shadow 记录 `not_reported`、canBlock=false、hostExitCode=0。

## CLI / tgz / JSON 边界

```bash
rtk proxy node .normproof/adapter/cli.mjs shadow
rtk proxy .omx/cache/node-floor/node-v20.3.0-linux-x64/bin/node .normproof/adapter/cli.mjs shadow
rtk proxy node --test scripts/normproof-conformance.test.mjs
```

fresh checkout 只需 Cheers 的安装依赖、Node >=20.3 和 tar；不导入 NormProof checkout。
Node20 executable 是本机缓存，可替换为操作者的 Node20.3 绝对路径。
运行时只在 Cheers `.tmp/` 解包；结果写入 `.normproof/out/adapter/run-*`，可选输出仅允许
`.tmp/` 或 `.normproof/out/` 下。每次使用新输出目录，旧 verdict 不能污染失败运行。

底层命令为 `node <unpacked>/package/dist/adapters/cli/normproof.js judge <judge-input> <output>
--evidence-manifest <projected-manifest>`。读取仓库 profile，manifest 保留同一工作区绝对根、
同一 entries/scope，只显式传入更严格或相同的 `maxFileBytes`。不改 profile/severity。
输出保留底层 stdout/stderr、verdict.json SHA、profile/input/manifest/source snapshot digest。
TS/TSX 字节快照前后不同成为 stale；摘要仅证明字节身份，不证明 dependency graph。

底层 exit **0** 表示无 blocking 问题，仍可能 `partial` 和 advisory failed；**2** 表示
judged-and-not-proven/failed；其他 exit/signal/timeout/missing verdict 为 unknown。
外层 shadow exit **0** 始终表示观察完成，`proofVerdict` 不因此升格。
`blocking` 命令当前明确拒绝、exit **1**。未来 blocking 只能在独立授权变更中传播底层
非零并对 unavailable/unknown 作明确拒绝策略；当前没有暗含的 blocking 开关，该拒绝行为
**不是已批准的产品决定**（见 open 清单）。既有 `.github/workflows/ci.yml:82` 的直接 judge
调用传播退出码，不是本适配器 shadow 入口；第 33–34 行相反注释已过时，本轮不改 workflow。

| 边界 | 当前能力与证据限制 |
| --- | --- |
| graph | static/re-export/import-equals/import-type/literal dynamic/escapes/TSX；explicit `.js` 只到 TS/TSX，explicit `.ts`/`.tsx` 只到自身，extensionless 可到 index；self-edge 保留；syntax 失败丢弃整份图 |
| graph 范围 | 声明 TS/TSX 图；**未打补丁的 upstream 会把字面 `require("x")` 记为 `<runtime-require>` unresolved**，而当前 pinned bundle（含 G2）静默遗漏；两种行为都不能声称 runtime dependency 完整 |
| write | 单独 artifact JSON allow/block + reasonCode；exit0 不等于 allow；不执行文件写入 |
| Stop | 旧 tgz 空 stdout/legacy block，无 R0a 版本信封，**unsupported**。当前 Cheers parser 用 J2 captured R0a 输出回放验证；不是新 pinned Stop release |
| R0a envelope | name `normproof.completion-gate.stop`、version `0.1.0`；runId（有报告时）、reasonCode、evidenceIdentity、proofVerdict 保留；not_configured/already_blocked_once 为 completed_unproven/not_reported；错版本/缺 proof/矛盾不能变 proven |
| MCP | 旧 server 自称 revision 2026-07-28，但 `initialize` 对 known/unknown version 都返回 JSON-RPC -32601；**unsupported**，不增加 shim 假握手 |
| report | raw `Obligations` 列出 advisory failed；`Missing Or Failed Obligations` 只含 blocking。必须同时看 verdict/ledger/full report；不能用该 section 或 exit0 代替“所有规则满足” |

## 资源上限

| 资源 | 固定上限 | 实测与范围 |
| --- | --- | --- |
| collected/evaluated graph edges | 16384 | 精确边界被两者接受；下一 edge 无 partial graph，oversized |
| matched source paths | 4096 | exact accepted；4097 oversized，无 listing |
| 单源文件 | 1048576 bytes | shadow manifest 明确传入；1048577 native verdict not_proven、底层exit2、外层exit0 |
| graph traversal | 20000 steps | 校验实际 engine 常量；本次没有独立安全包络/最大 RSS 证明 |
| 子进程观察期限 / output | 180000 ms / 4194304 bytes | 超限归 unknown；不是 Stop handler budget，不证明最坏资源安全 |

旧 `.normproof/evidence-manifest.json` 未设置 maxFileBytes；collector 默认 Infinity。因此
bundle.json 的 1MiB 在旧直接 judge 路径不是有效限制。1.0.0 shadow 路径通过公开 manifest
配置应用上限；没有修改历史 gate/CI。旧包仍有部分 `narrow the pattern` 文案，不能当作
允许缩小完整工作区 scope 的指示。G1/E1 不靠增大常量消除 oversized。

## 六个 hunk 的处置

| Hunk / header | 归口 owner | Conformance | 目标处置与退役前提（全部 2026-11-20 复审） |
| --- | --- | --- | --- |
| G1 `@@ -1,23 +1,15 @@` | Cheers packaging + NormProof collector | artifact、ast、capacity | 拆分。AST/vendor 部分退役前须验证 d18beb4 之后行为在 pinned parser 5.9.3 下的正反等价、dependency/offline parser 与 license 闭包；capacity 与 E1 列为待解，bounded design 决定前不删、不移植常量 |
| G2 `@@ -127,63 +119,56 @@` | NormProof source-parser；Cheers 跟踪返回 | ast | **不可直接退役（2026-11-07 实测更正）。** upstream 对任何名为 `require` 的调用记录 `<runtime-require>`；Cheers 自身有 4 处字面 `require()`（`presentation/themes/assets.ts` 5 次、`context/request/tokenizer.ts` 2 次为生产代码，另两处为测试），退役 G2 会使 blocking 义务 `source_graph_has_no_unresolved_specifiers` 从 satisfied 变 failed。退役前必须先改这 4 处调用，或由 upstream 区分字面 `require` 与动态 require；原"验证等价后退役"的前提不成立 |
| G3 `@@ -235,8 +220,7 @@` | NormProof collector docs；Cheers 跟踪返回 | ast/comment | 目标退役 compiled patch。先另获写授权向 NormProof 源码提交 literal-dynamic 注释修正 patch，并验证 source comment 与实际行为一致、candidate 包已包含；本轮不提交、不写上游 |
| G4 `@@ -246,7 +230,13 @@` | NormProof collector/source-parser；Cheers 跟踪返回 | ast | 目标退役。先用 parser 5.9.3 验证 d18beb4 之后有效 TS/TSX 正例和 malformed-source 反例；失败必须丢弃整份图，保持 typed invalid/unsupported 和证据身份，不依赖旧错误文案 |
| G5 `@@ -262,20 +252,19 @@` | NormProof collector + Cheers packaging | paths、capacity | 保留 explicit-path 限制 + honest overflow wording 窄修正；TSX/self-edge 已上游部分在现有正反 fixtures 等价后退役。窄修正彻底退役须上游接受、候选仍满足 explicit .js 仅 TS/TSX、explicit .ts/.tsx 仅自身、extensionless/index/self-edge 正例及越界容量 incomplete 反例 |
| E1 `@@ -24,7 +24,7 @@` | NormProof bounded reader + collector；Cheers 跟踪返回 | capacity | 不永久保留，不单独或成对 upstream 常量。先作 bounded capacity design 决定，统一 collector/reader admission、安全上限和完整 workspace 范围，再验证 exact/overflow 判定后于授权 refresh 退役；此前保持 oversized/not_proven |

**fork — open（2026-11-07 撤回此前的"已决定"记录）。** 原缩减目标"最终只保留 G5 窄修正"
不成立：G2 不能退役，否则 blocking 义务失败（见上表 G2 行）。
操作者需要在三条路径中选择：A. 先改 Cheers 的 4 处字面 `require()`；B. 保留 G2 作为
长期 hunk 并写入 owner/返回日期；C. 由 upstream 区分字面 `require` 与动态 require。
G5 窄修正仍防止显式 import 错配，G3 是注释修正，G1/E1 capacity 未决——这些判断不变。
重新评估：2026-11-20 或更早的授权 refresh；各项前提完成时复核对应退役。
本轮原 patch/tgz/bundle/archiveSha256/contract 不变。

fork 的维护理由仍是 explicit-path candidate 限制和 collection-incomplete overflow 语义，
加上 G2 的 `<runtime-require>` 差异。G5 上游接受后，新 pinned release 经容量/协议/Node20/
conformance 验证，可退役 G5 相关部分。**当前停止点：G5 上游接受与 G2 的 upstream 修复
都无法仅在 Cheers 内满足。** 本轮不执行该动作；无法满足时需操作者重新裁决，
不能无替代删除 fork。
blocking 的复审触发条件与两个 open 项见 [发布表及决定清单](adapter-release.md)。

## 刷新程序

1. 操作者先选择候选 release/clean commit；确认所有 hunks、归口 owner、到期处理。
2. 取得 metadata 声明的 original archive（SHA `d79b5d94d4e80cb1df99315920494a440859f9cad1a638c9b27f3e6a05a5923e`），
   或记录新的获批 baseline。当前 `.normproof/normproof-0.1.0.tgz` 是 **after**，不能当作 original。
3. 对 candidate 重做 N4 六项分类，先在上游解决 G5 和 comment；capacity 按 bounded design
   或诚实 refusal 处理。不能删除 patch 而不给出可运行替代。
4. 本仓 packaging owner 执行 `node .normproof/package.mjs <original> <output>`：before hash →
   patch fuzz0 → after hash → pinned vendor/license → deterministic tar → archive hash。
   当前脚本能验证旧产物，但没有 base archive 时不能声称独立重建。write artifact 另用
   write-gate/package.mjs 从 clean pinned commit 按 node20.3 target 构建并核验 inputs。
5. 对候选同时运行 graph/path/syntax/capacity/full verdict/report、write/Stop/R0a/MCP initialize
   conformance、Node20.3 平台探针；candidate 缺必要协议则 release 保持 open。
6. R0b/M0/J2/J3 身份与 evidence 各自重新核对。按上表逐 hunk 前提记录退役范围；下次取得
   实际 refresh 授权后才更新 archive/patch/metadata/contract，退役已验证 hunk。blocking 提升
   与 fork 范围两项仍 open，需操作者先裁决；baseline adoption 另决。

本次不运行该 refresh，不在 NormProof 安装/编译/写入，不修改 CI 权威性声明。
