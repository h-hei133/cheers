# M0 / J3 外部交付绑定

2026-11-06。依据操作者提供的 commit，**只读**核验
`/home/wang/projects/normproof-experiment` 的本地 Git 对象，写入 Cheers 发布记录。
J4 goal 保持 paused；没有重跑外部 harness、provider、fixtures 或全量验收。

状态均为 **observed (external repo, candidate-unbound)**。
已验证交付对象/归档内容身份；未验证这些历史运行能否在当前 J4 候选上复现。
外部原始结果存在，不能整项写成 unavailable；缺失层级仍各自 unavailable/unverified。

## 命令与实际输出

```bash
rtk proxy git -C /home/wang/projects/normproof-experiment cat-file -t 7754ee2a24fe5b51bbfba45138737993ff1fd1d9
rtk proxy git -C /home/wang/projects/normproof-experiment cat-file -t b0cf3c3d4735ae79f8bec390509fc03aee3210c2
rtk proxy git -C /home/wang/projects/normproof-experiment show -s --format='%H%n%T%n%ai%n%s' 7754ee2a24fe5b51bbfba45138737993ff1fd1d9 b0cf3c3d4735ae79f8bec390509fc03aee3210c2
rtk proxy git -C /home/wang/projects/normproof-experiment remote -v
```

```text
commit
commit
7754ee2a24fe5b51bbfba45138737993ff1fd1d9
43d5d204b2a69ad31ec7797f1629d08502e7bd42
2026-11-06 16:09:28 +0800
fix(M0): canonicalize proposal paths without rewriting J0 history
b0cf3c3d4735ae79f8bec390509fc03aee3210c2
dfbfe80ffd1af8eb0dfacae37aea0aad6568cf8f
2026-11-06 20:11:11 +0800
feat(J3): record cohort provenance and separate replay evidence tiers
remote -v: empty stdout
```

逐文件使用 `git ls-tree <commit> <paths...>` / `git rev-parse <commit>:<path>` 获取 blob，
`git cat-file blob <blob>` 读取原字节，重算 Git blob SHA-1（header + bytes）和 SHA-256。
用户粘贴中截断的 ID 已从对象恢复，下表均为实际完整值。回执为
[external-bindings.json](evidence/adapter/external-bindings.json)，每个文件含 blob/SHA-256/size/
归档路径，commit 原文另存。所有快照采用 `.txt`，不进入测试发现路径。

| 交付 | 文件 | 实际 blob ID |
| --- | --- | --- |
| M0 | EXECUTION.md | `6471effa3cf41eefdefc9f8c09d540407fb8df18` |
| M0 | harness/path-mapping.mjs | `0325173974f49798adcb37cdc5452880bfbfddac` |
| M0 | harness/check-path-mapping.mjs | `3b8924a6ee05c10357d3d3b5681a1b4d7cbc60ac` |
| M0 | harness/remap-proposals.mjs | `22513a09e9422ec2f889e62f22fc99685417bfa5` |
| M0 | DEVIATIONS.md | `7d7f47284c3bdfe2077ddb097cda746e4c6baf0f` |
| J3 | J3-EXECUTION.md | `eaadd6b1fb7f023fd903a791b35078acadb4e4d1` |
| J3 | REPLAY.md | `e515d2a72dc80a96b2801634c26b994d827a4264` |
| J3 | CLAIMS.md | `c1e60a82ac7233be81f6a2c440b98aaeafe993c1` |
| J3 | results/provenance/index.json | `f9926f9a5753485b8c78a9d0c28b9058d6765862` |
| J3 | results/replay-tiers.json | `09b101ffde088c689cc8d16ad905884019799d83` |

另外逐一从 J3 commit 读取 index 中 11 份 manifest，SHA-256 均与 index 相等。
实际核验输出：`verifiedBlobs=10, manifestHashChecks=11, cohortPasses=11,
retainedTrials=233, remoteConfigured=false`。此核验不重计算全部 raw trajectory，
不把 retrospective provenance 变成运行时 attestation。

## M0 的证据与边界

[提交内执行记录原字节](evidence/adapter/external/M0/EXECUTION.md.txt) 报告：
6/6 relative、absolute-inside/outside、symlink-inside/outside、duplicate-path fixtures；
110 formal rows 只读 remap，33/33 raw absolute paths 映射，全部四类 failure 计数为 0，
历史 33 行 `truth.known:false` 未重打分。独立构造的越界 fixture 保持 unknown。

这些是**外部提交所记录的运行结果**，本轮只核验其字节。M0 只修复 (a) 的可映射绝对路径
测量缺陷，(c) frozen-scope 与 (d) oracle syntax 限制仍明确保留。没有把 remap 的
known compliant 110 改写为历史得分，也没有修改外部 results。

## J3 的证据与边界

[提交内执行记录](evidence/adapter/external/J3/J3-EXECUTION.md.txt) 与
[replay JSON 原字节](evidence/adapter/external/J3/results__replay-tiers.json.txt) 保留四维分母：

| 层级 | normalized | final source bytes | raw verdict bytes | action trajectory |
| --- | --- | --- | --- | --- |
| S fixed scripted，40 pairs / 80 trials | 40/40 | 40/40 | 24/24；16 trial pair unavailable | 40/40 |
| L3 same-harness model，30 pairs / 60 trials | 8/30 | 12/30 | 12/12；1 单边；18 trial pair unavailable | 0/30 |
| independent replication，n=0 | unavailable | unavailable | unavailable | unavailable |

11 份 cohort/pass manifest 覆盖全部 233 个 retained trials，capture 为 **retrospective**。
每字段携带 value/status/source/scope。该数据存在不等于 deterministic，也不等于本候选的
真实 provider 验证。final bytes 限于保留的 UTF-8 src strings，不扩张到 mode、非 src 或
未保存的二进制内容；raw verdict 的 available-artifact 分母不能替换 trial-pair 分母。

明确 unavailable：independent replication、trusted billing、cost、provider backend identity、
Cheers packaged build。明确 unverified：seed acceptance、historical runtime linkage、
current dependency bytes。两产品 Vitest cache 的冻结后漂移记录原样保留，本轮不修复依赖。

## 发布决定

两项交付从“未找到”更正为“外部已交付、Git 对象核验、candidate-unbound”。
blocking/fork 决定仍 open；尚需当前候选的必要消费、运行与身份验收。
本次不恢复 J4 执行，不启动新测试、provider 或 remote CI。
