# C1 执行记录

任务：最小 PreToolUse 翻译适配器。只修改 Cheers；不修改 NormProof、普通 permission 语义、
Stop、旧 judge bundle、依赖、package scripts 或 CI。实现契约见 [translation.md](translation.md)，
能力变化见 [capabilities.md](capabilities.md)。工作树基点为
`48907cc206727a666fb06f10db7e044b74ad2223`；开始时干净。

当前状态：Done（C1 本地实现和八条验收完成）；未提交、未推送、未运行远端 CI。
此状态不是 Proof Kernel verdict，也不宣称完整任务或工作区已经 proven。

原始输出归档（仅将本机仓库路径替换为占位符）：
[首次聚焦失败](evidence/translation/focused.txt)、
[修正后聚焦](evidence/translation/focused-corrected.txt)、
[两条注册路径](evidence/translation/registration.txt)、
[首次 Node 20.3](evidence/translation/node-floor.txt)、
[收尾聚焦](evidence/translation/refined.txt)、
[首次完整 suite 中断](evidence/translation/acceptance.txt)、
[nested 反转](evidence/translation/reversal-nested-veto.txt)、
[mapping 反转](evidence/translation/reversal-canonical-name.txt)、
[policy 反转](evidence/translation/reversal-unknown-policy.txt)、
[全量夹具失败](evidence/translation/validation-failed.txt)、
[夹具修正验证](evidence/translation/baseline-corrected.txt)、
[artifact 与修改边界](evidence/translation/boundaries.txt)、
[最终静态门、构建和 Node floor](evidence/translation/final-gates.txt)、
[最终全量 suite](evidence/translation/final-suite.txt)、
[最终文档门](evidence/translation/final-docs.txt)、
[Node 发行物校验输出](evidence/translation/node-sha256.txt)。

## 前置依据

| 前置 | 当前证据 |
| --- | --- |
| C0 | Cheers 48907cc2，六个探针与能力矩阵已提交 |
| N3-4 | NormProof babd83a8：generator 的 `^(?:Write|Edit|MultiEdit|NotebookEdit)$`；测试逐个排除 prefix/suffix/lowercase |
| N3-5 | NormProof e25346bb：`--emit-result`；显式 no_violation、not_configured、could_not_decide、not_a_judged_write，默认 silent/nested 输出保留 |
| 独立 artifact | 固定 a6ff094ac14049843b6c471eabd2aaa4a55ac8fb 的 write-gate 闭包；esbuild 0.27.7；13,056 bytes；SHA-256 817aaa8838df536212907ca56ece9360385b9bda8f8ff87383d1c8fd6f46580d |

上述 upstream 当前源码、对应测试与 commit 记录都已只读核对。它们的测试历史不是 Cheers
验收；Cheers 下列测试实际执行这个 artifact。源码规则、matcher 生成器和 evaluator 没有复制
进 Cheers 业务模块，只有固定分发物包含 upstream 代码。

## 已执行命令与输出

命令从 Cheers 根目录执行，重型验证串行。VITEST_MAX_THREADS/VITEST_MIN_THREADS 均为 2。

```bash
rtk proxy node .normproof/write-gate/package.mjs <clean-pinned-source-checkout>
```

```json
{"commit":"a6ff094ac14049843b6c471eabd2aaa4a55ac8fb","nodeFloor":"20.3.0","sha256":"817aaa8838df536212907ca56ece9360385b9bda8f8ff87383d1c8fd6f46580d","bytes":13056}
```

```bash
rtk proxy sh -c 'VITEST_MAX_THREADS=2 VITEST_MIN_THREADS=2 npm run test:ts -- src/core/hooks/translation.test.ts src/core/hooks/translation.integration.test.ts'
```

```text
Test Files  2 passed (2)
     Tests  40 passed (40)
```

测试 `nested deny prevents the actual native write` 与 `flat deny prevents the actual native write`
均调用真实 native registry / executeToolBatch / createToolHooks；目标文件未出现：

```json
{"probe":"nested-deny-native-write","targetExists":false,"result":"Blocked by Hook: fixture rule"}
{"probe":"flat-deny-native-write","targetExists":false,"result":"Blocked by Hook: fixture rule"}
```

`explicit allow returns allow and calls askPermission exactly once first` 与对应 `native silent`
用真实 createToolHooks/askPermission 调用普通 escalation handler。测试在 PreToolUse dispatch
进入时和结束后都断言该 handler 恰好一次，并断言返回 allow；不是只观察工具继续。

malformed、timeout、version、empty、nonzero 各断言 block、unknown 原因码和 reason/诊断没有
payload 或堆栈，真实输出示例：

```json
{"decision":"block","reason":"The write hook could not be evaluated (invalid_output).","hookVerdict":{"status":"unknown","source":"adapter","reasonCode":"invalid_output"}}
{"decision":"block","reason":"The write hook could not be evaluated (timeout).","hookVerdict":{"status":"unknown","source":"adapter","reasonCode":"timeout"}}
{"decision":"block","reason":"The write hook could not be evaluated (version_mismatch).","hookVerdict":{"status":"unknown","source":"adapter","reasonCode":"version_mismatch"}}
```

`keeps could_not_decide unknown until the explicit Cheers block policy` 断言翻译对象先为 unknown；
真实子进程测试 `applies Cheers policy to a real could_not_decide response` 断言最终 block 的
hookVerdict 仍为 unknown/source:hook/policy:block。flat block/retry 原样保留有直接回归断言。

unsupported 的实际 dispatcher 输出包含以下原因：

| 输入 | reasonCode | reason |
| --- | --- | --- |
| apply_patch | patch_targets | A patch may contain multiple targets, while content rules apply per file; patch normalization is not implemented. |
| bash | shell_effects | Shell commands do not describe their final per-file content. |
| MCP | tool_semantics | This tool (including MCP tools) has no declared single-file content semantics. |
| browser / desktop | external_effects | Browser and desktop actions are not single-file content operations. |
| MultiEdit | multiple_edits | Multiple edits have no verified single-file replacement projection. |
| NotebookEdit | notebook_cells | Notebook cell operations are not full file replacement content. |

MultiEdit/NotebookEdit 的单项及多项都测试 unsupported。write/edit 的完整 content 正例、
空字符串、局部编辑和混合内容反例也有测试。

```bash
rtk proxy sh -c 'VITEST_MAX_THREADS=2 VITEST_MIN_THREADS=2 npm run test:ts -- src/entrypoints/writeHook.test.ts src/entrypoints/hookApproval.test.ts'
```

```text
Test Files  2 passed (2)
     Tests  38 passed (38)
```

四个测试名为 `{normal turn|native prepared|native security|native Git} uses the shared declared
translation with real artifact output`。前三者实际调用 upstream artifact，结果包含
`decision:block, reasonCode:violation`，每例 hookApprovalCalls=1、effects=0。Git 的 bash 没有
完整文件语义，adapter 只报告 unsupported；随后独立 native flat hook 返回 block，effects=0。
这里的 prepared/security effect 为受控计数器，不宣称真实 Git mutation 或 security scan。

```bash
rtk proxy npm run build
rtk proxy sh -c 'VITEST_MAX_THREADS=2 VITEST_MIN_THREADS=2 .tmp/hook-translation/node-v20.3.0-linux-x64/bin/node node_modules/vitest/vitest.mjs run --root packages/ts-shell src/core/hooks/translation.test.ts src/core/hooks/translation.integration.test.ts src/entrypoints/writeHook.test.ts'
```

```text
Wrote build manifest d3f5a8cc7d39 for @cheers/ts-shell@0.1.0
Test Files  3 passed (3)
     Tests  44 passed (44)
```

Node 20.3.0 Linux x64 发行包 SHA-256 与 nodejs.org 同版本 SHASUMS256.txt 一致：
`2dd1f5c0e01732024ba1f5de4517fa3976eb0976fa7976ff687ec09b62dd73fa`。实际子进程沿用
Node 20.3.0 的 process.execPath，结果为：

```json
{"probe":"pinned-artifact","node":"v20.3.0","allowed":{"decision":"allow","hookVerdict":{"status":"allow","source":"hook","reasonCode":"no_violation"}},"blocked":{"decision":"block","reasonCode":"violation","reason":"NormProof write gate: this write violates a declared rule.\n\nPath: target.ts\n\n- no-import: imports private/x.ts\n  Keep private imports out.\n\nAdjust the write to satisfy the rule. If the rule is wrong, say so and stop rather than working around the gate."}}
```

## 失败与调查

首次 artifact provenance 收集把 esbuild 内存入口当成真实文件而 ENOENT；改为 upstream
直接入口及显式工作目录后成功，避免重复 main 调用。没有改 upstream 源码。

第一次聚焦测试为 8 files passed / 1 failed，166 tests passed / 1 failed。新 artifact 测试
repo 路径多退一级而 ENOENT；同时核对 upstream closed rule schema，修正新夹具的 version
和字段。随后新增 40 tests 全过；没有删除、跳过或弱化原测试。

第一次完整 suite 中，`cli/print/cancellation.test.ts` 的 SIGINT、SIGTERM、SIGHUP 三项在
CLI 启动前失败，错误为 `Build inputs changed after the build (d3f5a8cc7d39)`。构建摘要包含
测试文件，新路径测试在此前构建之后添加，使构建失效。保留原始日志并对已确认的 Vitest
进程发送 SIGINT，退出 130；不是一次通过的 suite。完成所有源码/测试修改后重新 build，
再串行重跑完整验收，不改变 freshness 保护或测试断言。

收尾聚焦验证为 3 files / 46 tests passed。反转脚本逐项临时撤回 nested veto、canonical
工具映射、unknown policy，三个 test filter 均以测试断言失败退出 1；finally 恢复原源码。
执行命令为 `rtk proxy node .tmp/hook-translation/reversal.mjs`；
[脚本原文](evidence/translation/reversal-script.txt) 以非测试文本归档：

```json
{"mutation":"nested-veto","exit":1,"detected":true}
{"mutation":"canonical-name","exit":1,"detected":true}
{"mutation":"unknown-policy","exit":1,"detected":true}
```

第二次完整 suite 已结束，exit 1：1,092 files passed / 3 failed；14,274 tests passed /
7 failed / 2 skipped，耗时 1,091.72 秒。上述 cancellation 三项此次全过；剩余失败
对应任务开始前已有的夹具和文档，与翻译逻辑无关。按当前产品契约做以下最小修正：

| 失败 | 分类、原因与修正 | 保留的断言 |
| --- | --- | --- |
| settings/fields 五项 | harness/setup drift；choices 未覆盖已有 compactionEnabled/collapseThinking。补显式布尔值，两个字段各有 user/project scope，精确用例数由 75 更新为 79 | 全字段相等检查、真实按键取消/保存/重开/删除 |
| firstFrame 一项 | environment/setup drift；fixture 合并本机配置后由真实 resolver 选择模型。注入固定 resolveConfigTarget，避免依赖本机模型选择 | 首帧仍必须包含原先的 opus-5、branch 和 prompt arrow |
| keyGuide 一项 | stale documentation；表格仍用旧 alias 名称。更新为现有 runtime 的 app.agentMode.cycle / app.thinkingBlocks.toggle | 整张 action/gesture 表与 runtime 精确相等 |

```bash
rtk proxy sh -c 'VITEST_MAX_THREADS=2 VITEST_MIN_THREADS=2 node node_modules/vitest/vitest.mjs run --root packages/ts-shell src/cli/interactive/picker/settings/fields.test.ts src/cli/interactive/firstFrame.test.ts src/cli/interactive/keyGuide.test.ts'
```

```text
Test Files  3 passed (3)
     Tests  170 passed (170)
  Duration  14.46s
```

修正只涉及两份测试和快捷键文档，不修改相应产品运行逻辑。后续重新 build 再重跑
全量 suite；不使用聚焦结果替代用户要求的全量通过。

## 最终验证

最终链按以下顺序串行执行，退出 0。gate/build/floor 和全量日志已分别归档在上方链接；
命令中的临时 Node 20.3.0 二进制在验收后清理，可用同版本官方发行物复现：

```bash
rtk proxy sh -c 'npm run verify:import-cycles && npm run check:config-consumers && npm run check:declarations && npm run check:node-floor && npm run verify:docs-drift:strict && npm run test:scripts && npm run build && VITEST_MAX_THREADS=2 VITEST_MIN_THREADS=2 .tmp/hook-translation/node-v20.3.0-linux-x64/bin/node node_modules/vitest/vitest.mjs run --root packages/ts-shell src/core/hooks/translation.test.ts src/core/hooks/translation.integration.test.ts src/entrypoints/writeHook.test.ts && VITEST_MAX_THREADS=2 VITEST_MIN_THREADS=2 npm run test:ts'
```

静态门、docs drift 已通过；docs drift 仍报告 119 个既有 advisory，不是零漂移。
`test:scripts` 191 passed / 0 failed。build 已通过，完整 build ID 为 `9c64b16f9aa7fccc6af7aacc66db0b79173d2513c9fd743d2cba4967b61b620d`；
Node 20.3.0 复测 3 files / 46 tests passed，write/edit 分别有真实 allow 和 block。
最终全量结果：

```text
Test Files  1095 passed (1095)
     Tests  14281 passed | 2 skipped (14283)
  Duration  1131.27s
```

上轮失败的 settings/fields 140 项、firstFrame 24 项、keyGuide 6 项和 cancellation 3 项
均在最终全量运行中通过。2 个既有 skip 分属 browser/network/public/smoke 与 security/service；
未新增 skip。日志保留既有 DEP0190 弃用警告，以及 interactiveMode 故障注入测试刻意触发的
清理失败告警，该测试文件 405 项通过；没有将告警删去或归为无日志运行。

全量结束后用 buildInputDigest 与当前 manifest 对比，3,646 个输入匹配；
`git diff --check` 通过。三份任务文档的本地链接均存在。`rtk proxy sh -c 'npm run verify:docs-drift:strict && git diff --check'` 最终通过，
文档门仍为 119 个既有 advisory。临时 Node 发行物、日志和探针脚本均在归档后清理；
未删除既有 `.tmp/c0-hooks`。

## 验收证据索引

| 验收项 | 执行命令与真实输出所在位置 |
| --- | --- |
| 1 nested deny 阻止 native write | 收尾聚焦与 Node floor 日志：nested-deny-native-write 的 targetExists=false，结果 Blocked by Hook |
| 2 flat block 回归 | 同日志 flat-deny-native-write；translation.test.ts 的 flat block/retry 原样保留断言 |
| 3 allow / silent 及普通权限 | translation.integration.test.ts 两个 returns allow and calls askPermission exactly once first 测试；在 dispatch 前和完成后断言一次权限回调 |
| 4 adapter 错误与 upstream unknown | malformed/timeout/version/empty/nonzero 探针输出 block + unknown 原因码；同测试断言 reason/诊断不含 payload/堆栈；could_not_decide 单元与子进程 policy 测试 |
| 5 unsupported 工具和形状 | unsupported dispatcher 探针；MultiEdit/NotebookEdit 单项、多项及局部 edit 的参数化测试；理由见输入/输出契约 |
| 6 两条注册路径 | writeHook.test.ts 四个 uses the shared declared translation with real artifact output 测试；normal/prepared/security 实际 artifact block，Git 为 unsupported 后独立 shell hook block |
| 7 Node floor | Node 20.3.0 下 46 项测试与 write/edit 各自 allow/block 的 pinned-artifact 输出；11 个源码哈希及分发物摘要核对 |
| 8 静态门及全量 suite | 最终验证链 exit 0；1,095 files passed，14,281 tests passed，2 个既有 skipped |

两次完整 suite 的早期失败和更正后结果分别保留；不覆盖失败日志。核对记录确认
NormProof 工作树干净，普通权限/Stop 入口、旧 judge bundle、依赖和 CI 均无差异。

## 保留边界与限制

只判断声明的拟写入内容，不授予普通写权限、不关闭 proof obligation、不证明写入发生或
任务完成。完整单文件 write/edit 以外的输入按能力矩阵报告 unsupported；特别是 patch、
shell、MCP、browser/desktop 没有由本适配器提供内容写保护。普通 hook 执行批准仍可能
被拒绝或因注册快照/工作区变化跳过，跳过不是检查通过。

只实测 Linux x64 / Node 20.3.0 和当前 Node；macOS/Windows、真实外部系统副作用以及
远端 CI 未验证。119 个既有 docs source advisory 保留。未执行提交或推送；交付的是
本地已验证工作树与下列 commit message 草稿。

## 交付说明（commit message 版本，尚未提交）

```text
feat(hooks): translate canonical write checks and preserve unknown outcomes

Preserve call identity, full arguments, timeout and reentry metadata while
mapping native single-file writes to the canonical wire contract. Normalize
nested deny and retain native flat block/retry. Keep ordinary permission intact.

Pin an independent Node 20 write-gate artifact with source provenance and digest.
Distinguish explicit allow, unsupported scope and unknown evaluation; apply the
Cheers block policy to could_not_decide and sanitize adapter failures.

Share declaration loading and dispatch across normal and native operations.
Document the supported shapes and the unprotected shell, patch and external
effect surfaces. Stop and CI judgement semantics remain unchanged.
```
