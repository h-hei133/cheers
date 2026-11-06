# J2 执行记录

2026-11-06。R0b 完成本地验收后在稳定源码上重新采集：**168 格身份匹配，109 observed、
12 unsupported、47 unavailable，0 stale**。交付包含可复跑脚本、[矩阵](runtime-matrix.md)、
[逐格 JSON](evidence/capabilities/matrix.json)、原始命令结果及本记录；未提交、未推送。
J2 只修改证据脚本和文档，保留共享工作树的 R0b 产品与测试改动。没有修改 NormProof、
Node floor、pinned artifact/provenance、package scripts、构建行为或 CI workflow。

依据是只读 NormProof phase-1-decisions.md 的 P1-D17、P1-F39、P1-C24 与路线 J2。
Cheers 基点 `a5c600f78a800ca6517d6dc1a9ab3112125ef869`；只读 NormProof HEAD
`716cfea2d7c3d6857f45cb58242e6197c9d47a11`。HEAD 相同不表示工作树字节相同。

## 执行前明确的差异

写门有 Node20 可运行的独立 pinned artifact，artifact.json 声明 nodeFloor=20.3.0；
C1 的 46 项 Node20 allow/block 是历史前置证据。**Stop 没有独立 Node20 pinned artifact**：
它调用 vendored 包的 gate stop，该包声明 engines.node >=24。开始时 post-action 的
Node20 能力未验证；npm 默认 engines 是警告，不能据此推断 Node20 必败。
本次运行时配对实测解决了这个局部问题，没有提高 Cheers 的 >=20.3.0 floor。

## 身份与证据范围

每格展开 sourceSnapshot、profile、bundleDigest、artifactSha256；可读矩阵以 I 编号引用
完整身份目录。本轮 Cheers source SHA-256 是
`a33d3bd1a8d0ea31820154958211ad29a48e3f2c51b98a26d2e5d6db1d254eb0`。任何四维不匹配成为 stale，缺失成为 unknown，不能继续声称已验证。

| 身份 | 本次绑定 |
| --- | --- |
| Cheers source | commit 加 packages/scripts/workflows/manifests 与输入文件的实际字节 SHA-256；成员见 [source-members.json](evidence/capabilities/source-members.json) |
| profile | software-structure-v0，SHA-256 `2a69c9e14ed8e9b6b38c6a795920c4d574850662d16a9ac8a0ce17bdc0db81db` |
| pinned write | SHA-256 `817aaa8838df536212907ca56ece9360385b9bda8f8ff87383d1c8fd6f46580d`；原 provenance commit `a6ff094ac14049843b6c471eabd2aaa4a55ac8fb` |
| pinned bundle | archive SHA-256 `6c1a37e95434bcc149f29ce2568bbccb3a3aeec91df6547535675865f6aca985`；CLI/server 行另绑定实际 member 字节 |
| R0a/current MCP | 只读 dist、norm-packs、package.json 文件树摘要与 CLI/server 字节；见 [upstream-members.json](evidence/capabilities/upstream-members.json)；TypeScript 依赖字节另记 |
| configuration | resolved hostProfile、实际声明 configurationDigest 与 writeRulesDigest；shell hook 绑定 command 字节 |
| remote CI | 各自历史 commit、workflow、profile、archive 与 CLI member 字节；不能当作当前未提交源码的 CI |

R0a dist 原字节复制到 Cheers 自有 scratch，仅链接本仓 TypeScript 依赖；没有在 NormProof
安装、编译、写入或打包。这不是替换 pinned release，也没有验证 upstream source 到 dist
的可重现构建。unavailable 行的身份只标明选定目标，没有执行证明。

原 C0 六个合成探针与 C1/C2 历史证据保留。本次 normal 使用脚本模型 step 驱动实际产品
注册与 native write；prepared/security 使用真实共用 gate 和 write 工具；Git 使用真实
native git add 与索引读回。未运行真实 provider 或安全扫描器全链。

## 命令与实际输出

全部在 Cheers 根目录串行执行；随机路径归一化为 `<scratch>`，本仓路径为 `<cheers>`。
各命令 JSON 保留 argv、cwd、stdin、exitCode、signal、耗时、stdout、stderr。
180000 ms 是探针进程观察期限；3000/4321 ms 是 handler 预算，不能互相替代。

```bash
rtk proxy node scripts/hooks/capabilities/acceptance.mjs
rtk proxy node scripts/hooks/capabilities/run.mjs
rtk proxy node scripts/hooks/capabilities/ci.mjs
rtk proxy node scripts/hooks/capabilities/verify.mjs
rtk proxy node scripts/hooks/capabilities/report.mjs
```

实际输出依次见 [验收复核](evidence/capabilities/acceptance-check.txt)、
[采集](evidence/capabilities/collector.txt)、[远端](evidence/capabilities/remote.txt)、
[逐格校验](evidence/capabilities/identity-check.txt)、[可读投影](evidence/capabilities/report.txt)。

```text
local: rows=165, observed=106, unsupported=12, unavailable=47
remote: remoteRows=3, nonzeroAuthority=unavailable
verify: rows=168, identity=matched, unavailable=47
report: rows=168, identities=11
```

| 实际命令边界 | Node v20.3.0 | Node v24.15.0 | 原始证据文件（同目录 node20/node24 前缀） |
| --- | --- | --- | --- |
| pinned write，合规 | exit0 / allow / no_violation | 同左 | write-allow.json |
| pinned write，违规 | exit0 / block / violation | 同左 | write-block.json |
| pinned judge，合规夹具 | exit0 / proven | 同左 | judge-compliant.json |
| pinned judge，unresolved import | exit2 / failed | 同左 | judge-violating.json |
| pinned judge，实际 Cheers | exit0 / partial | 同左 | judge-repository.json |
| pinned Stop，合规 | exit0 / 空 stdout | 同左 | stop-pinned-compliant.json |
| R0a Stop，合规 | exit0 / allow / proven | 同左 | stop-r0a-compliant.json |
| R0a Stop，违规 | exit0 / block / actionable_gap / failed | 同左 | stop-r0a-violating.json |

本地直接 node 调用没有 npm engine 检查，以上输入没有 crash 或 typed runtime error。
真实 [CI judge 日志](evidence/capabilities/ci-success-judge.txt) 则先输出 npm WARN EBADENGINE：
required >=24 / current v20.3.0，随后 judge partial、step/job success。结果仅证明该 bundle
在这些 Linux 输入上可运行，不承诺任意 Node20 输入的兼容性。

### 宿主消费与配置

normal/prepared/security：违规 target 文件不存在，合规文件实际存在。
native Git：拒绝时 index 为空，允许时 index=`git-target.txt\n`；Git 拒绝来自实际 flat
command hook。写适配器无法解析 bash 最终副作用，不能从 Git 拒绝提升它的 shell 写门能力。
七条配置加载路径 project、.cheers、.cheer、.private-agents、.coding-agents、named-profile、
project-only 均加载一条声明，并实际 dispatch block。named-profile 的 HOME/USERPROFILE
与 ProfileContext 同步；最早的 process_failed 是夹具不匹配，已修复并重测。

真实 stdout 经当前 runStopCommand 与 parser 消费，见
[Node20 宿主记录](evidence/capabilities/node20-host-details.json) 与
[Node24 宿主记录](evidence/capabilities/node24-host-details.json)：

| 输入/轨迹 | 两种 Node 的当前结果 |
| --- | --- |
| 旧 pinned 合规/未配置/重入的空输出 | unknown / empty_output |
| 旧 pinned 违规输出 | unknown / invalid_output；旧 CLI 可执行不能证明当前 Stop 协议兼容 |
| R0a 合规与违规 | allow/proven 与 block/actionable_gap/failed |
| R0a not_configured / already_blocked_once | allow disposition=completed_unproven；proof=not_reported |
| 显式不兼容版本直接传入 parser | unknown / incompatible_contract；local-synthetic-parser-input，不算平台轨迹 |
| normal proven | completed=1，completed_unproven=0，failed=0 |
| normal actionable gap → reentry yield | 同一 attempt、count 0→1、active false→true；中性完成1，无普通完成/失败；原 missing import 仍存在 |
| normal 真实 write 修复后 reentry yield | 三个脚本 step，实际源码修复；中性完成1；yield 没有重新证明 |
| normal not_configured | 中性完成1，无普通完成/失败 |
| 同一 flat block 重复 | 两次检查，failed1，repeated_block，无两种完成 |

prepared/security/Git 的单独 operation 没有 dispatch Stop，实测记 unsupported。
normal 的 Stop 能力不能迁移到这些独立路径。

### MCP 协商与调用方式

两种 Node 的 current server 都接受 2025-11-25、2026-07-28，并返回请求版本。
未知版本实际输出：

```json
{"jsonrpc":"2.0","id":1,"error":{"code":-32602,"message":"Unsupported protocol version; supported: 2026-07-28, 2025-11-25","data":{"supportedProtocolVersions":["2026-07-28","2025-11-25"]}}}
```

旧 pinned server 对三种 initialize 都返回 -32601 Method not found: initialize，记
unsupported。新版协商绑定当前只读 dist，不覆盖旧 release。两个 server 的 tools/call
都实测文本 decision allow/deny；仅是脚本强制协议调用，canBlock=false，未消费外部副作用。
模型自愿调用与 Cheers host-forced judgement 分别 unavailable。

### CI authority

ci.mjs 用 gh run view、gh api job logs、git show 和 archive member readback 绑定远端结果：

| 真实 run | 观察 |
| --- | --- |
| 42042720323 | Node20.3 的 engine warning 后 judge partial，step/job success |
| 41998866447 | test step failure，judge skipped，job failure；不是 judge 非零传播证据 |
| 42185837427 | watch 明文 set +e、保存 exitcode、exit0；observation |
| main protection API | HTTP404 / Branch not protected；没有 required-check authority 证据 |

原始命令与输出是 ci-success.json、ci-failure.json、ci-watch.json、ci-protection.json；
judge 日志是对应 *-judge.txt。历史源绑定在矩阵各 CI 行。
权威 CI judge 非零传播与 J0 O5 **unavailable**。没有创建远端失败运行、修改 workflow，
也没有用本地违规 exit2 替代这个格。

## 验收与历史失效记录

指定完整链实际已由 R0b 完成：

```bash
rtk proxy sh -c 'npm run verify:import-cycles && npm run check:declarations && npm run check:node-floor && CHEERS_R0A_CLI=/home/wang/projects/normproof/dist/adapters/cli/normproof.js VITEST_MAX_THREADS=2 VITEST_MIN_THREADS=2 npm run test:ts'
```

原始三门 pass 与全套终端输出见 [acceptance.txt](evidence/capabilities/acceptance.txt)：
1098 文件 / 14358 tests passed / 2 skipped，1110.60s，exit0。
J2 没有重启全量进程；acceptance.mjs 核对 R0b 归档的 **3119 个实际文件摘要、产品文件
清单、manifest、HEAD、完整链输出与 fresh build 46d83ccb6c75**，漂移0 后复用。
[acceptance.json](evidence/capabilities/acceptance.json) 给出来源、原日志摘要、产品摘要与
当前 J2 source binding。产品/manifest 完整验收与新增 J2 脚本的独立校验明确分开。

J2 的身份维度反转测试实际通过；最终静态门与 diff check 输出见
[identity-test.txt](evidence/capabilities/identity-test.txt)、[docs-check.txt](evidence/capabilities/docs-check.txt)。
新增脚本经过 node --check、实际完整采集和 verifier；全部执行串行。

第一次 J2 全量验收中，外部产品修改造成 inspection.ts transform 失败，自有验证以
SIGTERM/exit143 停止；保留 [acceptance-invalidated.txt](evidence/capabilities/acceptance-invalidated.txt)。
另一次 source 在采集中漂移的摘要见 [collection-invalidated.json](evidence/capabilities/collection-invalidated.json)，
真实身份拒绝见 [stale-check.txt](evidence/capabilities/stale-check.txt)。这些不是当前验收。
首次 runtime 夹具复用 EEXIST、MCP .txt 不支持和旧 allow/block 断言失配分别归档为
initial-host-fixture-failure.json、initial-mcp-text-source.json、
initial-mcp-decision-expectation.txt；修复夹具或断言后重采，不改产品以迎合脚本。

## unavailable 与发布限制

47 个逐格原因见矩阵末尾：24 个未动态覆盖事件格、12 个未调用工具族格，以及 11 个
平台/宿主/调用/CI 格。后者包括 macOS/Windows × Node20/24、Claude Code/Codex/pi 真实宿主、
安全扫描器全链、MCP 自愿与产品强制、remote judge 非零 authority/O5。
unavailable 不算 pass/fail；unsupported 不投影为 allow/proven。
停止这些面的发布声明，不从本地脚本、C0 合成探针、watch 绿色或 Node floor 静态门推导支持。

| J2 验收 | 当前证据 |
| --- | --- |
| 每个宿主面实测或 unavailable | 168 格，全部能力字段与 evidence 路径可见 |
| Node20/24 写门、judge、Stop | 配对实际 stdout、exit 与当前 parser/lifecycle |
| MCP 协商正反例 | 两版接受；未知 -32602 与 supported set；旧包 -32601 单列 |
| CI authority | 历史真实 run；judge 非零传播 unavailable；watch observation |
| 四维身份 | verifier matched；每维 mismatch/missing 反转检查 |
| 指定完整链 | 同产品字节的已完成运行 exit0，经可复跑脚本复核 |

## Commit message 版本（草稿，未提交）

```text
docs(hooks): bind host runtime and CI capabilities to measured evidence

Pair Node 20.3 and Node 24 against the unchanged write artifact and judge bundle.
Measure current Stop lifecycle, configuration loading and native tool effects.
Bind each cell to source, profile, bundle and artifact bytes; distinguish MCP
script calls and CI observations from unavailable platform and authority claims.
```
