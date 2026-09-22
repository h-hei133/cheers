# 重复实现组裁决（§9.5 item 2，2026-09-20）

## 结论

- **首要结论：重复普查的更可靠下界是 96 组 / 344 份副本**，不是既有记录的 56 / 177。标题数字来自 TS lexical scanner：能处理多行参数列表、模板字符串、注释/字符串屏蔽、函数体括号平衡，并把函数名归一化后再哈希。
- **诚实边界：这仍只是下界。** 只扫描生产 `function` 声明式，且仅保留跨文件、函数体至少三行的组；箭头函数、方法简写、短函数体全部排除，真实重复更高。
- **不要把“同名”当作“同职责”。** `sanitizeId` 实测有 24 个定义，分布在多个域和多个行为族；`truncate` 有 13 个定义，字符、宽度、trim、ellipsis 规则并不统一。它们是命名/语义风险，不是“一刀切”合并目标。
- **本轮建议只推进 5 组：**
  1. `isPrivateNetworkHost`：安全边界，四份同职责实现，优先收口到已有 `browser/networkAllowlist.ts` owner。
  2. 浏览器 `redactSensitiveText` 家族：三份浏览器实现同职责；不要吞并 `policy/workspaceFileContract.ts` 的不同 redactor。优先复用已有 `browser/evidenceSafety.ts` owner，但先做返回契约适配。
  3. `isRecord`：11 份 exact + 2 份同职责变体；中性值守卫，适合已有 `core/values/`。
  4. `compactText` / `compactContinuityText`：5 份 session continuity 实现；已有 `session/sessionContinuityModule.ts` 导出可直接作为 owner。
  5. `normalizeOptionalString`：3 份 session 实现；已有 `session/sessionContinuityModule.ts` 导出可直接作为 owner。
- **下一候选但不进前五：** plain `truncate` 的 5 份 exact 副本（32 个直接调用点），因为 sidebar/result projection 还有不同语义，且没有现成、隔离的 canonical 文件。
- **所有其余组都保持为“已记录、未裁决”**，不是 dismiss。附录给出 96 组的副本数与初步分类；只有上面五组完成了足够的责任/owner/迁移分析。

## 实测证据

### 1. 重跑 duplicate census

探针文件：`/tmp/duplicate-census.ts`

执行命令：

```bash
node /tmp/duplicate-census.ts
```

输出：

```text
{
  "production_files": 938,
  "function_declarations": 3413,
  "duplicate_group_count": 96,
  "duplicate_copy_count": 344
}
```

探针做法：

- 通过 TypeScript lexical scanner 找 `function <name>(...)`，所以多行参数列表不会被 `[^)]*` 误截断。
- 对函数体做 `{}` 平衡；scanner 同时正确跨过模板字符串、字符串、注释中的括号与花括号。
- 对函数体 token 重建规范化文本，函数名归一化为 `<fn>`，再计算 `sha256(...).hexdigest()[:16]`。
- 只保留跨文件且函数体至少三行的 hash 组。
- 较早的字符串屏蔽探针得到 **93 组 / 317 份**；它会在模板字符串和词法边界处漏组。它不是本报告的 headline，TS lexical 版本是统一口径。

**下界声明：** `function` 声明式 בלבד；箭头函数、方法简写、三行以下函数体均不计。故真实组数和副本数只能高于或等于 96 / 344，不能据此声称完整 census。

### 2. 关键命名定义计数

执行命令：

```bash
for n in sanitizeId truncate compactText redactSensitiveText sanitizeWithTracking isPrivateNetworkHost clampInteger normalizeOptionalString; do
  printf "%s=" "$n"
  grep -rn --include='*.ts' --exclude='*.test.ts' "function $n" packages/ts-shell/src | wc -l
done
```

实测输出：

```text
sanitizeId=24
truncate=13
compactText=4
redactSensitiveText=4
sanitizeWithTracking=4
isPrivateNetworkHost=4
clampInteger=3
normalizeOptionalString=3
```

补充定义计数：

```bash
grep -rn --include='*.ts' --exclude='*.test.ts' "function normalizeBaseUrl" packages/ts-shell/src | wc -l
grep -rn --include='*.ts' --exclude='*.test.ts' "function normalizePathForCompare" packages/ts-shell/src | wc -l
grep -rn --include='*.ts' --exclude='*.test.ts' "function toRelativeTime" packages/ts-shell/src | wc -l
grep -rn --include='*.ts' --exclude='*.test.ts' "function stableId" packages/ts-shell/src | wc -l
grep -rn --include='*.ts' --exclude='*.test.ts' "function isRecord" packages/ts-shell/src | wc -l
```

实测输出：

```text
7
7
4
3
13
```

### 3. 迁移候选调用点计数

执行命令：

```bash
python3 /tmp/count_calls.py
```

关键输出：

```text
isRecord matches 44 call_sites_ex_defs 31
truncate matches 37 call_sites_ex_defs 32
normalizeBaseUrl matches 9 call_sites_ex_defs 5
normalizePathForCompare matches 19 call_sites_ex_defs 14
toRelativeTime matches 8 call_sites_ex_defs 5
isPrivateNetworkHost matches 6 call_sites_ex_defs 3
sanitizeWithTracking matches 31 call_sites_ex_defs 28
compactText matches 20 call_sites_ex_defs 16
normalizeOptionalString matches 62 call_sites_ex_defs 59
clampInteger matches 11 call_sites_ex_defs 8
stableId matches 6 call_sites_ex_defs 4
```

`isPrivateNetworkHost` 的上述窄脚本漏掉了 `browser/networkAllowlist.ts`；完整生产匹配为 4 个定义、5 个调用点，见下方 grep 证据。浏览器 redaction 的浏览器子集为 3 个定义、4 个调用点；`workspaceFileContract.ts` 的同名函数另计且不合并。

## 逐项分析

### A. 最高优先：`isPrivateNetworkHost`

**实测定义：**

```bash
grep -rn --include='*.ts' --exclude='*.test.ts' "function isPrivateNetworkHost" packages/ts-shell/src
```

得到四份：

- `browser/networkAllowlist.ts:208`
- `browser/publicReadOnlyWebManifest.ts:375`
- `browser/publicReadOnlyWebPolicy.ts:168`
- `core/harness/browserPublicReadOnlyWebSmokeConfig.ts:151`

完整调用面：

- `networkAllowlist.ts:164,181`（2）
- `publicReadOnlyWebManifest.ts:283`（1）
- `publicReadOnlyWebPolicy.ts:75`（1）
- `browserPublicReadOnlyWebSmokeConfig.ts:84`（1）

**分类：同一职责。** 四份均覆盖 `localhost`、`.localhost`、`.local`、`::1`、`127.*`、`10.*`、`192.168.*`、RFC1918 `172.16/12`。周围策略不同：allowlist 有 test-only allow 分支，public-read-only 有 block 分支；谓词本身是同一 SSRF/private-origin 分类责任。

**core admission：**

- Direction：纯谓词本身可零 import。
- Audience：失败。当前受众都属于 browser/network policy 与 browser harness，尚未形成两个以上真正 feature domain 的中性值消费面。
- Survival：通过，四处均是真生产路径。
- **裁决：不进 `core/`。** 既有 owner 是 `browser/networkAllowlist.ts`；把它导出为 browser-level predicate，再由三个其他模块导入，保持安全策略仍在 browser 域。

**迁移：** owner `packages/ts-shell/src/browser/networkAllowlist.ts`；重写另外 3 个定义，保留 5 个生产调用点。等价性检查：对上述八类 private/local host 与负例（公网 IPv4、普通域名、边界 `172.15.*` / `172.32.*`）逐项比较旧/新返回值；再跑 public-read-only manifest/policy 与 smoke-config 的聚焦测试。

### B. 第二优先：浏览器 `redactSensitiveText` 家族

**实测定义：**

```bash
grep -rn --include='*.ts' --exclude='*.test.ts' "function redactSensitiveText" packages/ts-shell/src
```

得到四份同名定义，其中浏览器三份为同一责任族：

- `browser/domSnapshot.ts:167`
- `browser/playwrightEvidenceMapper.ts:120`
- `browser/readOnlyContentNormalizer.ts:98`

`policy/workspaceFileContract.ts:193` 另有同名函数，但它处理 provider home、assignment-style credential、Bearer，并只返回字符串；这是**同名不同职责**，不得合并。

**分类：浏览器三份同一职责；workspace 版本同形不同义。** 浏览器三份返回 `{ text, warnings, redactions }`，处理 token/key/password/hidden reasoning 等浏览器敏感内容。现有 `core/security/reportText.ts` 也不是 drop-in：它的报告契约和 redaction labels 不同。

**core admission：**

- Direction：失败。浏览器 evidence safety 依赖 browser-specific `sanitizeBrowserText` / byte budget 语义，不是零依赖的中性 core 值函数。
- Audience：浏览器三个 feature lane 之间共享，但不构成 core audience。
- Survival：通过，四个浏览器调用点均为真实 evidence/content 路径。
- **裁决：不放 `core/security/`；优先使用已有 `browser/evidenceSafety.ts` 作为 browser owner。** 需要先把返回契约适配到该 owner，不能直接把 `reportText.ts` 当实现替换。

**迁移：** owner `packages/ts-shell/src/browser/evidenceSafety.ts`；改写浏览器 3 个定义、4 个调用点；保留 workspace 版本。等价性检查：旧/新对 secret token、API key/password assignment、hidden reasoning、普通文本、空文本、多个 redaction labels 逐项比较，要求 `text`、`warnings`、`redactions` 完全一致；额外确认 `readOnlyContentNormalizer` 的 `sanitizeBrowserText` 与 byte-budget 行为不变。

### C. 第三优先：`isRecord`

**实测定义：**

```bash
grep -rn --include='*.ts' --exclude='*.test.ts' "function isRecord" packages/ts-shell/src
```

得到 13 个定义。TS lexical census 中：

- G03：11 份 exact，`typeof value === "object" && value !== null && !Array.isArray(value)`。
- G89：2 份变体，使用 `!!value && typeof value === "object" && !Array.isArray(value)`。
- `turn/projection.ts` 还使用 `Readonly<Record<...>>` 类型谓词，但运行时责任相同。

**分类：同一职责。** 差异是空值写法和类型 readonly 表述，不是运行时 policy 差异；但类型谓词的 readonly narrowing 必须在迁移时编译检查。

**core admission：**

- Direction：通过；候选实现可零 import。
- Audience：通过；browser manifest/protocol/runner 与 `turn/projection.ts` 两个以上 feature domain 消费。
- Survival：通过；31 个直接调用点是生产解码/验证路径。
- **裁决：通过，目标为已有 `core/values/` owner 区域。** 不要放 browser 模块，也不要新建 catch-all utils；未来实现可在已有目录下建立明确的 `record` owner。

**迁移：** owner 区域 `packages/ts-shell/src/core/values/`；重写 13 个定义、31 个直接调用点。等价性检查：`undefined`、`null`、数字、字符串、函数、数组、普通对象、带 prototype 对象、冻结对象逐项比较；同时跑 `tsc`/聚焦类型检查，确认 `Readonly<Record>` 消费者没有丢失只读 narrowing。

### D. 第四优先：`compactText` / `compactContinuityText`

**定义：** `session/continuation/stoppedSessionContinuity.ts:271`、`session/continuationEvidenceParity.ts:146`、`session/continuityFormatter.ts:376`、`session/recovery/resumeContextBuilder.ts:596`、`session/sessionContinuityModule.ts:425`。

**分类：同一职责。** 5 份均为 whitespace collapse → trim → `max` 截断 → `...`；`compactContinuityText` 只是已有导出名。所有消费者都在 session continuity/recovery 域，不应把它升级成全仓 text utility。

**core admission：**

- Direction：不适用/不通过；该行为携带 session continuity 语义。
- Audience：不通过；受众主要是同一 session 域。
- Survival：通过；16 个直接调用点均为真实 continuity/recovery 输出。
- **裁决：不进 `core/`；复用已有 `session/sessionContinuityModule.ts:425` owner。**

**迁移：** owner `session/sessionContinuityModule.ts:425-433`；重写 4 个私有定义与 16 个直接调用点，保留现有默认 `220` 与调用方显式 max。等价性检查：空白、内部多空格、恰好 max、max+1、Unicode、默认 max=220、末尾 ellipsis 逐项比较。

### E. 第五优先：`normalizeOptionalString`

**定义：** `session/approval/memoryCodec.ts:288`、`session/permissionRequestMemoryCodec.ts:551`、已有导出 `session/sessionContinuityModule.ts:436`。

**分类：同一职责。** 三份都对 `unknown` 做非字符串拒绝、trim、空串转 `undefined`；59 个直接调用点来自 permission/approval/session memory codec。

**core admission：**

- Direction：实现虽可零 import，但职责与 persisted session/approval memory codec 绑定。
- Audience：不通过；同一 session 域内部受众。
- Survival：通过；不是 shim，且消费面真实存在。
- **裁决：不进 `core/values/`；直接复用已有 `session/sessionContinuityModule.ts:436`。**

**迁移：** owner `session/sessionContinuityModule.ts:436-442`；删除另外 2 个私有定义，迁移 59 个直接调用点。等价性检查：`undefined`、`null`、数字、空串、空白串、带前后空格字符串、内部空格字符串、非 ASCII 字符逐项比较。

### F. 已核验但不进前五的组

#### `normalizeBaseUrl`：7 份，6 份同一行为族 + 1 份不同语义

实测定义：

- `config/runtimeConfig.ts:432`
- `core/auth/providerAuthRuntime.ts:250`
- `core/commands/authCommandRuntime.ts:268`
- `core/commands/connect/preset.ts:151`
- `core/commands/modelCommandRuntime.ts:539`
- `core/shell/providerCredentials.ts:253`
- `core/shell/providerReadiness.ts:302`

前六份均 trim、空值转 `undefined`、去尾 slash；`providerReadiness.ts:302` 参数必填且不 trim，空串/空白输入可观察不同。**同形但不同语义，不能七份一刀切。** 候选 owner 是已有 `config/`（优先 `config/runtimeConfig.ts` 的 provider/config normalization），不是 `core/values/`；先确认 readiness 合约。

#### `normalizePathForCompare`：7 份，6 份绝对路径比较族 + 1 份 cwd-aware

`entrypoints/cliArgs.ts:418` 使用 `path.resolve(cwd, value)`；其余共享 `path.resolve(value).toLowerCase()` 家族。**同形不同 API/语义。** 该 helper 依赖 `node:path`，所以不满足 `core/` Direction=零 imports；不要硬塞进 `core/values/`。保留在既有 `core/shell/` / entrypoint owner，另行裁决路径基础设施。

#### `toRelativeTime`：4 份，输出等价但显示上下文不同

`core/shell/sessionStateSurface.ts:290`、`entrypoints/cliPermissionModule.ts:124`、`entrypoints/cliWorkspaceSurface.ts:91`、`entrypoints/sessionsPanel.ts:209`。无效日期均 `unknown`，未来时间 clamp 到 `0s ago`，阈值为 60s/60m/24h。**同一责任但显示层边界不同**；可以谨慎收口到已有 `core/shell/` 显示 owner，但不优先于前五。

#### `sanitizeId`：24 份定义，多个同名行为族

实测：

```bash
grep -rn --include='*.ts' --exclude='*.test.ts' "function sanitizeId" packages/ts-shell/src | wc -l
```

输出 `24`。TS census 里至少有这些 exact body groups：

- G28：`edit/sanitize.ts` + `turn/followUpQueue.ts` + `turn/steeringQueue.ts`，max 160 / report-safe redaction。
- G30：`context/rebuildInput.ts` + `repair/handoff/boundary.ts` + `verification/result/boundary.ts`，带 `redactions` tracking。
- G37：`tools/toolOutcomeBundle.ts` + `turn/deliveryPolicy.ts` + `turn/nextTurnBundle.ts`，max 180。
- G43/G60：browser runner/run-id 族，字符集与 fallback 不同。

另有 accessibility/dom/runtime manifest、context acquisition、evidence/session recovery 等不同实现。**结论：同名不同体，命名风险大于简单重复；保持为未裁决 finding，不做全局 sanitizeId owner。**

#### `truncate`：13 份定义，只有 5 份 plain exact

plain exact 五份：`core/shell/recovery.ts:683`、`core/shell/sessionStateSurface.ts:312`、`core/shell/startupSurfaceRenderer.ts:171`、`entrypoints/mcpControlCliSurface.ts:268`、`entrypoints/sessionsPanel.ts:229`。但 `presentation/sidebar/sidebarPanelRenderer.ts:171` 会先 compact whitespace、处理 `maxWidth <= 3`，`result/projection/runtimeOutcomeProjection.ts:183` 会先 trim 且默认 max=220；其余同名定义需继续逐项读审。**不要把 13 份视为同一职责；记录为 finding。**

#### `redactSensitiveText` / `sanitizeWithTracking` / `isSafeInteger` / `stringValue` / `clampInteger`

- `redactSensitiveText`：浏览器三份同责，workspace 一份不同责；前五只纳入浏览器三份。
- `sanitizeWithTracking`：3 份 exact，但它们依赖本地 `sanitizeText` 与 `redactions` 标签契约；可后续考虑 `core/security/redaction.ts` 参数化，但本轮不做。
- `isSafeInteger`：6 份 exact、13 个直接调用点，浏览器协议验证中同责；低风险，留档。
- `stringValue`：6 份 exact + 3 份近似变体、53 个直接调用点；协议字段语境多，留档。
- `clampInteger`：3 份 exact、8 个直接调用点；同责但仅 sidebar 域，后续可在已有 `presentation/sidebar/sidebarPanelModel.ts` owner 收口。

#### `unique` 系列

不要把全仓 `unique` 统一成一个函数。实测 body 家族同时存在：保留空字符串、过滤空字符串、trim 后 dedupe、排序、冻结、compaction-aware 等可观察差异。它是**同形不同义**的典型，应保持按 owner 命名/按域收口，而不是做全局 utils。

## Top 5 迁移计划

| 排名 | 组 | owner（已有路径/目录） | 需要重写的定义 / 直接调用点 | 等价性证明 |
|---|---|---|---:|---|
| 1 | `isPrivateNetworkHost` | `browser/networkAllowlist.ts` | 4 定义 → 1；5 调用点 | private/local host 全分类正例 + 公网/边界负例；public-read-only manifest/policy/smoke 聚焦测试 |
| 2 | 浏览器 `redactSensitiveText` | `browser/evidenceSafety.ts`（先适配返回契约） | 浏览器 3 定义 → 1；4 调用点；workspace 版本不动 | token/key/password/hidden-reasoning/普通文本/空文本的 text、warnings、redactions 完全比对 |
| 3 | `isRecord` | `core/values/`（已有 owner 区域） | 13 定义 → 1；31 直接调用点 | null/undefined/array/object/function/primitive/frozen object；类型 narrowing 编译检查 |
| 4 | `compactText` / `compactContinuityText` | `session/sessionContinuityModule.ts:425` | 5 定义 → 1；16 直接调用点 | whitespace、trim、max、max+1、默认 220、ellipsis、Unicode |
| 5 | `normalizeOptionalString` | `session/sessionContinuityModule.ts:436` | 3 定义 → 1；59 直接调用点 | unknown、空/空白、前后空格、内部空格、Unicode；memory codec 聚焦测试 |

**不推荐本轮直接施工的 near-miss：** plain `truncate` 5 exact / 32 direct calls；需要先定义 shell display owner 并排除 sidebar/result variants。

## 96 组附录：副本数、hash-level 分类与初步处置

说明：`SS` = 同一规范化函数体且同名；`SM` = 同一规范化函数体但组内多名称；`-H` = 该名称还出现在别的 hash 组，构成命名风险。`同形待核` 不是 dismiss，而是尚未完成责任读审；`留档未裁决` 是本轮明确不施工。

| 组 | 份数 | 代表名称 | 代表位置 | 分类 | 初步处置 |
|---|---:|---|---|---|---|
| G01 | 34 | `unique×33`,`dedupe×1` | `browser/actionCacheEntry.ts:181`; `browser/capabilityModel.ts:166` | SM-H，同形待核 | 留档未裁决 |
| G02 | 19 | `safe×19` | `browser/actionCacheEntry.ts:177`; `browser/controlledNetworkSurface.ts:27` | SS，同形待核 | 留档未裁决 |
| G03 | 11 | `isRecord×11` | `browser/controlledNetworkRunnerManifest.ts:266`; `browser/externalNetworkRunnerManifest.ts:344` | SS-H，同责已核 | Top 5 / core/values |
| G04 | 9 | `unique×7`,`dedupe×1`,`normalizeSecretValues×1` | `context/compact/continuity/routeContinuityHandoff.ts:293`; `context/compact/injection/compactInjectionMergePolicy.ts:95` | SM-H，同形待核 | 留档未裁决 |
| G05 | 7 | `hash×7` | `context/memory/model.ts:851`; `planning/runtime/support.ts:289` | SS，同形待核 | 留档未裁决 |
| G06 | 7 | `unique×7` | `edit/recovery/model.ts:841`; `edit/sanitize.ts:52` | SS-H，同形待核 | 留档未裁决 |
| G07 | 6 | `isSafeInteger×6` | `browser/controlledNetworkRunnerManifest.ts:274`; `browser/externalNetworkRunnerManifest.ts:371` | SS，同责已核 | 留档未裁决 |
| G08 | 6 | `unique×6` | `browser/observationModel.ts:80`; `browser/playwrightEvidence.ts:249` | SS-H，同形待核 | 留档未裁决 |
| G09 | 6 | `freeze×6` | `context/selection/model.ts:211`; `planning/execution/model.ts:187` | SS-H，同形待核 | 留档未裁决 |
| G10 | 6 | `stringValue×6` | `browser/localFixtureManifest.ts:276`; `browser/runtime/external/manifest.ts:364` | SS-H，同责已核 | 留档未裁决 |
| G11 | 5 | `isSensitive×4`,`isUnsafeAction×1` | `browser/controlledNetworkPolicy.ts:104`; `browser/externalNetworkHandoffPolicy.ts:102` | SM，同形待核 | 留档未裁决 |
| G12 | 5 | `unique×5` | `provider/request/attempt.ts:844`; `provider/request/boundary.ts:789` | SS-H，同形待核 | 留档未裁决 |
| G13 | 5 | `normalizeConnectionId×1`,`normalizeText×3`,`normalizeOptional×1` | `config/runtimeConfig.ts:441`; `core/auth/providerAuthRuntime.ts:245` | SM，同形待核 | 留档未裁决 |
| G14 | 5 | `truncate×5` | `core/shell/recovery.ts:683`; `core/shell/sessionStateSurface.ts:312` | SS，同责已核但边界未核 | 留档未裁决 |
| G15 | 5 | `unique×2`,`uniqueStrings×2`,`uniqueValues×1` | `core/query/runtime/batch.ts:141`; `core/query/runtime/harnessSupport.ts:24` | SM-H，同形待核 | 留档未裁决 |
| G16 | 5 | `compactText×4`,`compactContinuityText×1` | `session/continuation/stoppedSessionContinuity.ts:271`; `session/continuationEvidenceParity.ts:146` | SM，同责已核 | Top 5 / session owner |
| G17 | 5 | `normalizePathForCompare×5` | `core/shell/bootstrap.ts:58`; `core/shell/startupSurfaceRenderer.ts:178` | SS-H，同责族但 owner 受限 | 留档未裁决 |
| G18 | 5 | `unique×4`,`dedupe×1` | `planning/task/analysisBrief.ts:153`; `planning/task/taskExecutionPlan.ts:162` | SM-H，同形待核 | 留档未裁决 |
| G19 | 4 | `normalizeBaseUrl×4` | `config/runtimeConfig.ts:432`; `core/auth/providerAuthRuntime.ts:250` | SS，同责族但 provider 边界未核 | 留档未裁决 |
| G20 | 4 | `summarize×4` | `browser/replaySurface.ts:76`; `browser/selfHealingApplySurface.ts:55` | SS，同形待核 | 留档未裁决 |
| G21 | 4 | `unique×4` | `turn/deliveryPolicy.ts:122`; `turn/followUpQueue.ts:127` | SS-H，同形待核 | 留档未裁决 |
| G22 | 4 | `unique×3`,`uniqueSorted×1` | `evidence/host/proof.ts:45`; `result/host/verdict.ts:52` | SM-H，同形待核 | 留档未裁决 |
| G23 | 4 | `unique×4` | `browser/evidenceSafety.ts:146`; `browser/runtime/core/decision.ts:209` | SS-H，同形待核 | 留档未裁决 |
| G24 | 4 | `toStringArray×1`,`stringArray×3` | `browser/runtime/core/protocol.ts:258`; `browser/skill/runner/binding.ts:300` | SM，同形待核 | 留档未裁决 |
| G25 | 4 | `compact×1`,`sanitize×2`,`sanitizeIntent×1` | `core/query/runtime/facts.ts:288`; `repair/loop/model.ts:242` | SM-H，同形待核 | 留档未裁决 |
| G26 | 3 | `stringValue×3` | `browser/controlledNetworkRunnerManifest.ts:270`; `browser/externalNetworkRunnerManifest.ts:348` | SS-H，同责族但变体未核 | 留档未裁决 |
| G27 | 3 | `sanitizeText×3` | `context/rebuildInput.ts:172`; `repair/handoff/boundary.ts:706` | SS-H，同形待核 | 留档未裁决 |
| G28 | 3 | `sanitizeId×3` | `edit/sanitize.ts:45`; `turn/followUpQueue.ts:131` | SS-H，同责族 | 留档未裁决 |
| G29 | 3 | `isSource×3` | `browser/externalNetworkRunnerManifest.ts:336`; `browser/publicReadOnlyWebManifest.ts:359` | SS，同形待核 | 留档未裁决 |
| G30 | 3 | `sanitizeId×3` | `context/rebuildInput.ts:165`; `repair/handoff/boundary.ts:699` | SS-H，同责族 | 留档未裁决 |
| G31 | 3 | `unique×3` | `edit/result/journal/failure/state.ts:93`; `edit/result/journal/model.ts:165` | SS-H，同形待核 | 留档未裁决 |
| G32 | 3 | `decodeBasicEntities×2`,`decodeEntities×1` | `browser/domSnapshot.ts:202`; `browser/readOnlyContentNormalizer.ts:88` | SM，同形待核 | 留档未裁决 |
| G33 | 3 | `clampInteger×3` | `presentation/sidebar/sidebarLivePanelRuntime.ts:231`; `presentation/sidebar/sidebarPanelModel.ts:173` | SS，同责已核 | 留档未裁决 |
| G34 | 3 | `isPrivateNetworkHost×3` | `browser/publicReadOnlyWebManifest.ts:375`; `browser/publicReadOnlyWebPolicy.ts:168` | SS，同责已核 | Top 5 / browser owner |
| G35 | 3 | `resolveWorkspaceRootMode×3` | `core/shell/bootstrap.ts:87`; `entrypoints/cliSessionModule.ts:351` | SS，同形待核 | 留档未裁决 |
| G36 | 3 | `sanitizeWithTracking×3` | `policy/resourceTrustPolicy.ts:122`; `runtime/resources/inventory.ts:519` | SS，同责族但 redaction contract 未核 | 留档未裁决 |
| G37 | 3 | `sanitizeId×3` | `tools/toolOutcomeBundle.ts:266`; `turn/deliveryPolicy.ts:126` | SS-H，同责族 | 留档未裁决 |
| G38 | 3 | `sanitizeText×3` | `provider/response/boundary.ts:123`; `tools/toolCallBatch.ts:370` | SS-H，同形待核 | 留档未裁决 |
| G39 | 3 | `normalizeOptionalString×3` | `session/approval/memoryCodec.ts:288`; `session/permissionRequestMemoryCodec.ts:551` | SS，同责已核 | Top 5 / session owner |
| G40 | 3 | `actionForRunner×1`,`browserExternalRunnerActionForRequest×1`,`browserSkillExecutionActionForRequest×1` | `browser/runtime/external/executor.ts:191`; `browser/runtime/external/protocol.ts:79` | SM，同形待核 | 留档未裁决 |
| G41 | 3 | `unique×3` | `context/rebuildInput.ts:161`; `repair/handoff/boundary.ts:695` | SS-H，同形待核 | 留档未裁决 |
| G42 | 3 | `uniqueStrings×1`,`unique×1`,`uniquePaths×1` | `core/query/runtime/proof.ts:140`; `planning/execution/model.ts:191` | SM-H，同形待核 | 留档未裁决 |
| G43 | 3 | `sanitizeRunnerId×1`,`sanitizeId×2` | `browser/runtime/external/manifest.ts:360`; `browser/skill/runner/binding.ts:292` | SM-H，同责族但 browser contract 未核 | 留档未裁决 |
| G44 | 3 | `unique×3` | `evidence/projection/repair/verdict.ts:128`; `repair/handoff/readiness.ts:234` | SS-H，同形待核 | 留档未裁决 |
| G45 | 3 | `isOpenAICompatibleStyleProvider×3` | `core/commands/connect/preset.ts:97`; `core/commands/modelCommandRuntime.ts:563` | SS，同形待核 | 留档未裁决 |
| G46 | 3 | `redactSensitiveText×2`,`redactPwText×1` | `browser/domSnapshot.ts:167`; `browser/playwrightEvidence.ts:209` | SM，同责已核（浏览器子集） | Top 5 / browser owner |
| G47 | 3 | `normalizePathLike×3` | `evidence/projection/action/result.ts:92`; `policy/workspaceFileContract.ts:189` | SS，同形待核 | 留档未裁决 |
| G48 | 3 | `isFailedResume×2`,`isFailedResumeResult×1` | `core/shell/bootstrap.ts:52`; `core/shell/continueShellActionRuntime.ts:25` | SM，同形待核 | 留档未裁决 |
| G49 | 2 | `hasForbiddenContent×2` | `browser/controlledNetworkRunnerManifest.ts:292`; `browser/publicReadOnlyWebManifest.ts:388` | SS-H，同形待核 | 留档未裁决 |
| G50 | 2 | `stableId×2` | `runtime/resources/inventory.ts:558`; `tools/policy/interception.ts:398` | SS，同责已核 | 已有 T14 裁决；可收口 `core/values/` |
| G51 | 2 | `compact×2` | `context/acquisition/code/source.ts:53`; `repair/flow/hypothesis.ts:92` | SS-H，同形待核 | 留档未裁决 |
| G52 | 2 | `externalNetworkTarget×1`,`targetUrlFromRequest×1` | `browser/externalNetworkExecutionMode.ts:76`; `browser/publicReadOnlyWebPolicy.ts:155` | SM，同形待核 | 留档未裁决 |
| G53 | 2 | `isSafeAction×2` | `browser/runtime/external/manifest.ts:344`; `browser/skill/runner/binding.ts:271` | SS，同形待核 | 留档未裁决 |
| G54 | 2 | `pathStaysInsideWorkspace×2` | `edit/recovery/restorePreview.ts:214`; `edit/recovery/restorePrimitive.ts:162` | SS，同形待核 | 留档未裁决 |
| G55 | 2 | `check×2` | `context/compact/continuity/compactContinuityQuality.ts:141`; `memory/projectMemoryInjectionQuality.ts:124` | SS，同形待核 | 留档未裁决 |
| G56 | 2 | `dedupeLines×2` | `context/compact/injection/compactInjectedContextBudget.ts:93`; `memory/projectMemoryInjectedContextBudget.ts:89` | SS，同形待核 | 留档未裁决 |
| G57 | 2 | `optionalSafeText×2` | `browser/runtime/external/protocol.ts:264`; `browser/skill/execution/protocol.ts:290` | SS，同形待核 | 留档未裁决 |
| G58 | 2 | `freeze×2` | `evidence/task/proof.ts:261`; `result/task/verdict.ts:50` | SS-H，同形待核 | 留档未裁决 |
| G59 | 2 | `safeSnippet×2` | `memory/projectMemoryDeleteSurface.ts:73`; `memory/projectMemoryFutureTurnAdapter.ts:151` | SS，同形待核 | 留档未裁决 |
| G60 | 2 | `sanitizeRunId×1`,`sanitizeId×1` | `browser/controlledNetworkOrigin.ts:112`; `browser/controlledNetworkRunnerManifest.ts:278` | SM-H，同形待核 | 留档未裁决 |
| G61 | 2 | `isRunnerAction×1`,`isSkillAction×1` | `browser/runtime/external/protocol.ts:294`; `browser/skill/execution/protocol.ts:320` | SM，同形待核 | 留档未裁决 |
| G62 | 2 | `parseRunnerStdout×2` | `browser/runtime/external/runner.ts:155`; `browser/skill/execution/executor.ts:330` | SS，同形待核 | 留档未裁决 |
| G63 | 2 | `safeStringArray×2` | `browser/runtime/external/protocol.ts:271`; `browser/skill/execution/protocol.ts:297` | SS，同形待核 | 留档未裁决 |
| G64 | 2 | `sanitizeText×2` | `policy/resourceTrustPolicy.ts:137`; `runtime/resources/inventory.ts:534` | SS-H，同形待核 | 留档未裁决 |
| G65 | 2 | `isRunnerCommand×2` | `browser/runtime/external/manifest.ts:334`; `browser/skill/runner/binding.ts:261` | SS，同形待核 | 留档未裁决 |
| G66 | 2 | `renderProjectedLines×1`,`renderApprovalLines×1` | `cli/output/projectedLineRenderer.ts:5`; `entrypoints/approvalPromptBridge.ts:164` | SM，同形待核 | 留档未裁决 |
| G67 | 2 | `hasForbiddenContent×2` | `browser/skill/runner/manifest.ts:186`; `browser/skill/runner/metadata.ts:225` | SS-H，同形待核 | 留档未裁决 |
| G68 | 2 | `escapeHtml×2` | `browser/playwrightEvidence.ts:241`; `browser/playwrightEvidenceMapper.ts:147` | SS，同形待核 | 留档未裁决 |
| G69 | 2 | `mergeCliEvidence×1`,`mergeScenarioEvidence×1` | `core/harness/agentCliScenarioModel.ts:167`; `core/harness/agentScenarioModel.ts:176` | SM，同形待核 | 留档未裁决 |
| G70 | 2 | `sidebarPanelTextHasForbiddenContent×1`,`sidebarTextHasForbiddenContent×1` | `presentation/sidebar/sidebarPanelModel.ts:156`; `presentation/sidebar/sidebarStateModel.ts:202` | SM，同形待核 | 留档未裁决 |
| G71 | 2 | `numberValue×2` | `browser/runtime/external/protocol.ts:317`; `browser/skill/execution/protocol.ts:344` | SS，同形待核 | 留档未裁决 |
| G72 | 2 | `inspectCurrentContent×2` | `edit/recovery/restorePreview.ts:194`; `edit/recovery/restorePrimitive.ts:124` | SS，同形待核 | 留档未裁决 |
| G73 | 2 | `normalizePathForCompare×1`,`normalizePath×1` | `core/shell/runtimeContext.ts:295`; `daemon/protocol.ts:208` | SM-H，同形不同名义 | 留档未裁决 |
| G74 | 2 | `evidenceValue×2` | `browser/runtime/external/surface.ts:31`; `browser/skill/execution/surface.ts:47` | SS-H，同形待核 | 留档未裁决 |
| G75 | 2 | `hasForbiddenContent×1`,`containsForbiddenContent×1` | `browser/selfHealingManifestPatchPolicy.ts:76`; `browser/selfHealingPatch.ts:77` | SM-H，同形待核 | 留档未裁决 |
| G76 | 2 | `uniqueSorted×2` | `runtime/extensions/lifecycle.ts:372`; `runtime/resources/descriptor.ts:220` | SS-H，同形待核 | 留档未裁决 |
| G77 | 2 | `containsHiddenReasoning×2` | `memory/memoryValidation.ts:59`; `memory/projectMemoryCandidateQuality.ts:146` | SS，同形待核 | 留档未裁决 |
| G78 | 2 | `tail×1`,`trim×1` | `core/commands/loopCommandRuntime.ts:140`; `core/workflow/runner.ts:127` | SM，同形待核 | 留档未裁决 |
| G79 | 2 | `redactionLines×2` | `memory/projectMemoryCandidateSurface.ts:92`; `memory/projectMemoryReviewSurface.ts:91` | SS，同形待核 | 留档未裁决 |
| G80 | 2 | `agentCliAssertionFailures×1`,`assertionFailures×1` | `core/harness/agentCliScenarioAssertions.ts:74`; `core/harness/agentScenarioAssertions.ts:44` | SM，同形待核 | 留档未裁决 |
| G81 | 2 | `highestSeverity×2` | `presentation/sidebar/sidebarPanelLayout.ts:272`; `presentation/sidebar/sidebarPanelModel.ts:164` | SS，同形待核 | 留档未裁决 |
| G82 | 2 | `normalizeOriginForManifest×2` | `browser/externalNetworkRunnerManifest.ts:328`; `browser/publicReadOnlyWebManifest.ts:355` | SS，同形待核 | 留档未裁决 |
| G83 | 2 | `normalizeConnections×2` | `core/auth/providerAuthRuntime.ts:225`; `core/commands/modelCommandRuntime.ts:515` | SS，同形待核 | 留档未裁决 |
| G84 | 2 | `safeLine×2` | `memory/projectMemoryInjectedContextFormatter.ts:66`; `memory/projectMemoryInjectionSurface.ts:64` | SS，同形待核 | 留档未裁决 |
| G85 | 2 | `unique×2` | `browser/externalNetworkExecutionReceipt.ts:90`; `browser/selfHealingManifestPatchWriter.ts:295` | SS-H，同形待核 | 留档未裁决 |
| G86 | 2 | `evidenceValue×2` | `browser/evidenceBundle.ts:125`; `browser/executionReceipt.ts:198` | SS-H，同形待核 | 留档未裁决 |
| G87 | 2 | `runnerCommandIsSafe×2` | `browser/runtime/external/manifest.ts:308`; `browser/skill/runner/binding.ts:221` | SS，同形待核 | 留档未裁决 |
| G88 | 2 | `hasRawContentOrSecrets×2` | `core/harness/agentCliScenarioAssertions.ts:112`; `core/harness/browserExecutionReceiptAssertions.ts:111` | SS，同形待核 | 留档未裁决 |
| G89 | 2 | `isRecord×2` | `browser/receipt/manifest.ts:171`; `browser/runtime/core/protocol.ts:254` | SS-H，同责已核 | Top 5 / 与 G03 合并审查 |
| G90 | 2 | `isReadOnlyTask×1`,`isReadOnlyPlanningTask×1` | `planning/handoff/mutation.ts:613`; `planning/runtime/support.ts:143` | SM，同形待核 | 留档未裁决 |
| G91 | 2 | `splitExactHunkLines×1`,`splitPatchLines×1` | `edit/patch/plan/hunkSet.ts:134`; `edit/proposal/fencedEditPlanner.ts:286` | SM，同形待核 | 留档未裁决 |
| G92 | 2 | `isRunnerMode×2` | `browser/runtime/external/manifest.ts:352`; `browser/runtime/external/protocol.ts:298` | SS，同形待核 | 留档未裁决 |
| G93 | 2 | `createProviderReadinessTerminalEvent×1`,`createProviderReadinessCliTerminalEvent×1` | `core/shell/providerReadiness.ts:337`; `entrypoints/providerReadinessCliSurface.ts:11` | SM，同形待核 | 留档未裁决 |
| G94 | 2 | `statusFor×2` | `turn/followUpQueue.ts:104`; `turn/steeringQueue.ts:104` | SS，同形待核 | 留档未裁决 |
| G95 | 2 | `sanitizeString×1`,`sanitizeSummary×1` | `core/query/runtime/taskState.ts:425`; `repair/iteration/projection.ts:242` | SM，同形待核 | 留档未裁决 |
| G96 | 2 | `firstDuplicate×2` | `edit/patch/apply/conflict.ts:211`; `provider/proposal/providerAnchorConflict.ts:197` | SS，同形待核 | 留档未裁决 |

## 与既有记录的差异

| 项 | 既有记录 | 本次实测 | 差异原因 |
|---|---:|---:|---|
| 全仓重复组 | 56 | **96** | TS lexical scanner 正确处理模板字符串、词法边界和多行函数签名；旧 extractor 漏掉了 40 组 |
| 重复副本 | 177 | **344** | 同上；本次保留更多跨文件、>=3 行函数体组 |
| `normalizeBaseUrl` 定义 | 4 | **7** | `connect/preset.ts`、`modelCommandRuntime.ts`、`providerReadiness.ts` 被旧记录漏掉；readiness 版本还不同语义 |
| `normalizePathForCompare` 定义 | 7 | **7** | 数量对齐；本次明确 6 个绝对路径比较族 + 1 个 cwd-aware 变体，且 `node:path` 违反 core Direction |
| `toRelativeTime` 定义 | 3 | **4** | `entrypoints/sessionsPanel.ts:209` 是第四份；输出与阈值等价，但显示上下文不同 |
| `stableId` 定义 | 2 | **3** | 多行参数签名修正后发现 `inventory.ts` 与 `interception.ts` 两份 exact，另有 `planning/action/graph.ts` 不同实现 |
| `sanitizeId` 定义 | 10（4+3+3） | **24** | 旧表按少量关注路径统计；全仓 grep 显示跨 browser/context/edit/session/tools/turn 等 24 份 |
| `truncate` 定义 | 4 | **13** | 旧表只列关注副本；完整 grep 显示 plain、sidebar width、result projection 等多族 |
| `compactText` | 5（含 sibling 误计） | **4 个同名 `compactText` + 1 个同体 `compactContinuityText`** | lexical group 按规范化函数体而非名字统计，故 G16 为 5-copy same-body group |
| `isPrivateNetworkHost` | 3 | **4** | `browser/networkAllowlist.ts:208` 漏计；四份谓词同责 |
| `redactSensitiveText` | 4 | **浏览器 3 份同责 + workspace 1 份不同责** | 同名不代表同 contract；workspace 版本只返回 string 且处理路径/credential |

## 风险与反证

- `isPrivateNetworkHost` 若未来加入 IPv6、IPv4-mapped IPv6、解析后地址或测试白名单语义，browser owner 仍需保留清晰的 policy seam；迁移不能只靠 body hash。
- 浏览器 redaction 的三份返回对象目前相似，但 warnings/redactions label 是可观察 contract；不能直接替换成 `core/security/reportText.ts` 或 `core/security/redaction.ts`。
- `isRecord` 的运行时行为相同不等于类型 API 可无缝替换；`Readonly<Record>` narrowing 必须编译验证。
- `compactText` / `normalizeOptionalString` 位于 session persistence/continuity 路径；默认值、ellipsis 和 empty-string 处理变更会影响落盘与恢复语义。
- `normalizeBaseUrl` 的 provider readiness 变体明确不 trim；统一会改变空白输入和空字符串输出。
- `normalizePathForCompare` 的 cwd-aware 版本不能替换成依赖进程 cwd 的版本；而且所有实现依赖 `node:path`，不满足 core zero-import Direction。
- `toRelativeTime` 当前输出等价，但未来 shell session、permission explain、workspace summary、sessions panel 可能需要不同文案或时钟注入方式。
- `unique`、`sanitizeId`、`truncate` 的同名/同形组中，排序、冻结、过滤空值、max、fallback、redaction tracking 都可能是隐含 contract；exact body 不是足够的合并授权。
- §2.1 的删除授权仍适用：可达性或“同名 helper”不能授权删除；只有活轨已经承担该责任、并通过 §2.2 六项检查后才可施工。

## 未验证事项

- 本报告没有修改生产代码、测试代码、`plan.md` 或既有 wiki；只新建本报告文件。
- 96 组的附录分类是 hash-level triage；除 Top 5 与重点 named families 外，未对每个组逐一完成 §2.2 六项检查，故其 disposition 仍是“留档未裁决”。
- 未运行全量 Vitest；未运行 `npm run build`；未进行 PTY 实机验证，因为本轮没有施工。
- 未做动态 `import()` / `spawn` / `pathToFileURL` tracing，也未验证仓库外 consumer 或未入仓 plugin。
- `isRecord`、browser redaction、`isPrivateNetworkHost` 的迁移等价性测试矩阵尚未执行；这里只给出证明方案。
- `normalizeBaseUrl` 六份同族实现是否应统一，仍需 provider/config 维护者确认 readiness 合约。
- plain `truncate` 的另外 8 个定义（除 5 exact plain copies 外）尚未逐一完成语义归档。
- `sanitizeId` 的 24 个定义已确认是多行为族，但尚未完成每个定义的所有生产调用点与外部 API 检查。
