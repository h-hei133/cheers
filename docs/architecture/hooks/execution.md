# C0 执行记录

任务边界：建立 Cheers 能力矩阵与合成探针；不实施 C1/C2，不改变 hookDispatcher/session/tools、运行时依赖、package scripts、build 或 CI workflow。依据为只读 NormProof `/home/wang/projects/normproof/.wiki/features/phase-1-decisions.md` 的 C0、P1-C7/C8/C17/C18/C23/C24。

工作树基点：`0057eb604ecc8d154ce691794b494c354e89755b`。启动时 `rtk git status --short` 输出为空。宿主是 Linux x64、Node `v24.15.0`；最终探针时间 `2026-11-05T08:16:00.145Z`（UTC）。当前交付为本地未提交的文档/证据；未执行 commit、push 或远端 CI。

## 产物

| 产物 | 路径 |
| --- | --- |
| 每事件/工具的能力矩阵与不能宣传清单 | [capabilities.md](capabilities.md) |
| 六个探针各自的输入、观察点、真实输出投影及来源 | [probes.md](probes.md) |
| 完整机器记录（含 subprocess stdin、dispatch/consumer 返回、timeout diagnostics、源码 SHA-256） | [results.json](results.json) |
| 第一轮结果，保留撤销后 Git fixture 缺少 identity 方法的事实 | [initial-results.json](evidence/initial-results.json) |
| 原样静态门输出 | [gates.txt](evidence/gates.txt) |
| Node/bundle/workflow 读取输出 | [runtime-floor.txt](evidence/runtime-floor.txt) |
| 最终检查输出 | [audit.txt](evidence/audit.txt) |
| 可复现脚本的非执行文本快照及哈希 | [scripts.json](evidence/scripts.json)；[run.mjs.txt](evidence/run.mjs.txt)、[probes.mts.txt](evidence/probes.mts.txt)、[reply.mjs.txt](evidence/reply.mjs.txt) |

探针脚本**明确保留**在仓库 `.tmp/c0-hooks/run.mjs`、`.tmp/c0-hooks/probes.mts`、`.tmp/c0-hooks/reply.mjs`。这些路径被 Git 忽略，持久文档中的 `.txt` 快照是交付的一部分；没有把可发现的 `.test.ts` 副本放进证据目录。

## 实际执行

### 1. 静态门（串行，退出码 0）

```bash
rtk mkdir -p .tmp/c0-hooks
rtk proxy sh -c 'npm run verify:import-cycles && npm run check:declarations' > .tmp/c0-hooks/gates.log 2>&1
```

真实输出：

```text
npm notice run cheers@0.1.0 verify:import-cycles
npm notice run node scripts/check-import-cycles.mjs
scc-gate root=packages/ts-shell/src files=3085
scc-gate runtime_cycles=0 type_only_cycles=0
[pass] no-dependency-cycles - every module import resolves acyclically
npm notice run cheers@0.1.0 check:declarations
npm notice run node scripts/check-declarations.mjs
declaration-check hook_events=18 dispatched=18 tool_factories=13 registered=13 findings=0
[pass] declarations - every hook event dispatches and every tool factory is registered or recorded
```

这两项只证明相应静态门通过，不证明 18 种事件都做过动态端到端验证，也不证明 unresolved imports 或 NormProof judge 通过。

### 2. 六个指定探针（顺序执行，最终退出码 0）

```bash
rtk proxy node .tmp/c0-hooks/run.mjs > .tmp/c0-hooks/probes.log 2> .tmp/c0-hooks/probes.stderr.log
```

`probes.stderr.log` 为空。标准输出先逐个打印六个探针记录，末行含 `summary: "6/6 named probes observed"`、六个完整名称、`fetchCalls: 0` 和宿主版本；每个结果完整保存在 [results.json](results.json)，便于阅读的投影见 [probes.md](probes.md)。

| 名称 | 真实结果 |
| --- | --- |
| pretooluse-nested-deny | nested deny 原样进入返回值，缺少 flat decision；真实 gate 后合成目标 effects=1 |
| pretooluse-flat-block | flat block/retry、invalid JSON、exit 1/2、300 ms override timeout 均 effects=0；allow/empty/allow+could-not-decide 为 effects=1；大写 matcher 未执行 command |
| stop-dispatch-result-discard | block/retry/exit-2/invalid/默认 timeout 都发 query.completed；每例 steps=1；timeout 实测 3,008 ms，总体 status=completed |
| unknown-event-registration | TaskCompleted 从 loader 丢弃；installedCommandHooks=0、dispatchCalls=0、commandExecuted=false；从未被 dispatch |
| config-timeout-retention | handler 只保留 command；group matcher 和 event map key 保留；timeout/timeoutMs/type/name/description/extra 丢弃 |
| registration-path-isolation | normal/native Git/prepared/security 都实际执行声明 hook 并消费 flat block；dispatcher 不同；单次批准零持久化；同一 home/profile 的持久批准跨路径共享；不同 store 文件隔离 |

第一轮 6 个命名项虽返回退出码 0，但人工复查发现附加的“撤销批准后 Git 可继续”对照缺少 `git.identity`，其 blocked 结果不能解释成 hook veto。保留初始结果，最终改用实际 prepared 消费者验证：撤销后选择 deny 令 hookCommands=0，而普通权限已允许的合成目标 effects=1。还加入真实 workspace 精确断言、单独 matcher capture、超时日志。**首次夹具不完整，不是产品失败或产品修复。**

脚本只使用已有 tsx 和 Node 内建模块，直接加载当前 TypeScript 源码；无需 build，不安装依赖。唯一的目标 effect 是内存计数器；fixture hook 写入的 JSON stdin 日志、模拟配置和批准记录均在临时目录。normal 的模型 step 与 readiness 通过已有依赖注入提供，真实 provider transport 未使用。注册路径使用默认 dispatcher 和真实 gitGateFor；没有人为跳过信任门，也没有写真实用户 home 的批准。

launcher 创建全新的环境，仅携带 PATH/LANG 与隔离后的 HOME/USERPROFILE/TMPDIR/CHEERS_TEST_ROOT/GIT_CEILING_DIRECTORIES/C0_RUNTIME；不继承 provider 认证变量。子进程禁用日志落盘，并将 fetch 替换为计数后抛错的护栏。每轮 runtime 目录在子进程结束后删除。

### 3. Runtime floor

实际读取命令：

```bash
rtk proxy node --version
rtk proxy node -e 'const p=require("./package.json"); console.log("cheers engines.node="+p.engines.node)'
rtk proxy sh -c 'tar -xOf .normproof/normproof-0.1.0.tgz package/package.json | node -e '\''let s=""; process.stdin.on("data",c=>s+=c).on("end",()=>{const p=JSON.parse(s); console.log("bundled "+p.name+" "+p.version+" engines.node="+p.engines.node)})'\'''
rtk rg -n 'node-version:|normproof judge|exit 0' .github/workflows/ci.yml .github/workflows/normproof-watch.yml
```

真实输出（原执行使用同一串行 shell 收集）：

```text
v24.15.0
cheers engines.node=>=20.3.0
bundled normproof 0.1.0 engines.node=>=24
.github/workflows/normproof-watch.yml:25:          node-version: 24
.github/workflows/normproof-watch.yml:35:          normproof judge --format sarif
.github/workflows/normproof-watch.yml:37:          exit 0   # Observation mode: record, never gate.
.github/workflows/ci.yml:26:          node-version: 20.3.0
.github/workflows/ci.yml:82:          npx --package .normproof/normproof-*.tgz normproof judge
```

该证据证明声明的 floor 不同，不证明 Node 20.3 的某个具体运行错误。本轮不运行不兼容版本，不改变 floor，不把本机通过标成兼容。CI step 的非零传播由 YAML 证明；实际最新 CI、branch protection 是 unknown。

### 4. 收尾检查与验收对应

```bash
rtk proxy sh -c 'npm run verify:docs-drift:strict && git diff --check'
```

另做文档链接/行号、六探针名称、matrix 行来源、源码和脚本哈希核对，并确认 packages/scripts/workflows/package 清单没有修改，runtime 临时目录已移除。实际完整命令为：

```bash
rtk proxy sh -c 'npm run verify:docs-drift:strict && git diff --check && node .tmp/c0-hooks/audit.mjs' > docs/architecture/hooks/evidence/audit.txt 2>&1
```

真实输出收录 [audit.txt](evidence/audit.txt)。strict drift 门通过，但报告 119 个既有 unprefixed docs-source advisory，不能写成零文档漂移；本次新增文档另由聚焦检查核对全部链接。首轮 artifact audit 的目录检查误把 `runtime-floor.log` 文件计入 runtime 目录，输出保留在 [audit-initial.txt](evidence/audit-initial.txt)，修正为只检查目录后重跑。没有运行 build、Vitest、全仓测试、NormProof judge、真实 provider 或远端 CI；它们不属于本次 C0 文档/探针验收。

| 验收要求 | 直接证据 |
| --- | --- |
| 矩阵存在，每行有来源，列完整 | capabilities.md；audit 中行数/列数/引用检查 |
| 六个命名探针各自实际执行并给输出 | probes.md + results.json；每项 status=observed，最终子进程退出 0 |
| hooks.json 键的保留/丢弃明确 | config-timeout-retention 的 loaded/installed/retained/discarded |
| 两条注册路径是否执行、批准是否共享 | registration-path-isolation 的 4 个实际消费者、审批计数、command 日志及持久文件对照 |
| import-cycles 与 declarations 仍通过 | gates.txt，真实退出码 0 |
| unknown 不改写为 allow | 矩阵 unknown/unsupported 和不能宣传清单；hostReturn 与 verdict 分开记录 |
| 产品、依赖、CI 行为不改；仅目标仓库可写 | audit 的源码哈希与 scope check；只读 NormProof 依据未改 |
| 临时脚本清理或明确保留 | 上述三个 .tmp 探针脚本及 .tmp/c0-hooks 内生成/audit 脚本、日志明确保留；运行态清理，探针快照在 docs |

## 交付说明（commit message 版本）

以下是可用的提交说明文本，**并不表示已执行提交**：

```text
docs(hooks): record C0 host capabilities and synthetic probe evidence

Document all declared events and scoped tool/CI boundaries with source citations.
Execute six named probes against the current dispatcher and real consumers.
Record nested-deny continuation, native flat blocking, discarded Stop results,
unknown-event filtering and hooks.json timeout loss.

Correct approval isolation: dispatcher instances differ, while durable grants
share the selected home/profile store. Preserve one-shot and withdrawn cases.
Keep runtime code, dependencies and CI unchanged; retain reproducible scripts
under .tmp with non-executable evidence snapshots and isolated state cleanup.

Validation: import-cycles, declarations, six synthetic probes, docs drift,
diff and artifact audit. No provider, build, full suite, Node 20 or remote CI claim.
```

停止条件处理：无证据的端到端能力明确标 unknown 并列出；C0 的记录任务可验收，不把这些未验证能力提升为产品承诺。C1/C2 实施、Node floor 选择、真实外部副作用和 CI 验证不在本交付范围。
