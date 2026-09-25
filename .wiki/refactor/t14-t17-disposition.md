# T14 + T17 裁决建议（2026-09-20）

## 结论

- **T14 建议选择性收口，不做四组“一刀切”合并。** 实测四组不是 wiki 记录的 4/7/4/2，而是 **7/7/4/3**（`normalizeBaseUrl` / `normalizePathForCompare` / `toRelativeTime` / `stableId`）。
- **优先收口 `stableId(prefix, parts)` 的两个逐字节副本**：`runtime/resources/inventory.ts` 与 `tools/policy/interception.ts` 的函数体哈希相同，属于真实跨 feature 共享值行为；候选 owner 是已有 `core/values/`，例如 `core/values/stableId.ts`。`planning/action/graph.ts` 的同名函数是另一套可观察语义，不能并入。
- **`normalizeBaseUrl` 应先按 provider/config 语义拆分再收口**：其中 6 份是同一行为族，但 `core/shell/providerReadiness.ts` 的版本不 trim、且参数不可选，输入带空格或空串时输出不同。候选 owner 优先是已有 `config/`（可放入现有 `config/runtimeConfig.ts` 的导出面或同目录 normalization 模块），不是凭空新建 `core/` 语义。
- **`normalizePathForCompare` 不建议本轮直接合并**：6 份是同一绝对路径比较族，1 份 `cliArgs.ts` 额外接收 `cwd`，语义不同；而通用实现依赖 `node:path`，不满足本仓要求的 `core/` “Direction = 零 import”准入，且现有 `core/paths/legacyRootRebase.ts` 是带文件系统/路径重绑定责任的较重 owner，不宜塞入一个纯比较 helper。
- **`toRelativeTime` 当前无用户可见输出差异**：4 份均为 invalid → `unknown`、未来时间 clamp 为 `0s ago`、`<60s` 秒、`<60m` 分钟、`<24h` 小时、否则整天数；建议可做**谨慎的 `core/shell/` 显示层收口**，并保留显示层测试锁定阈值，不要把它升级为跨所有 UI 的全局 text 工具。
- **T17 建议只文档化当前入口，不加根配置，也不为迁就“错误 cwd”而修两条测试。** CI 和官方 npm 入口都使用 `npm run test:ts`（cwd 为 `packages/ts-shell`）；根目录 `npx vitest run` 是额外的、当前未承诺的入口。实测根跑只剩 **2 个文件 / 3 个失败项**，全部是测试自行把 `process.cwd()` 当成 package 根；当前运行没有重现旧记录中的 9 个 5s 超时。

## 实测证据

### 1. 重跑并修正 hash probe

先执行：

```bash
cp /tmp/t14_hash_probe.py /tmp/t14_hash_probe2.py
```

原脚本的参数正则为：

```python
r'\([^)]*\)'
```

它无法跨越多行签名。修正版 `/tmp/t14_hash_probe2.py` 改为从 `function <name>(` 起点逐字符平衡参数列表，再逐字符平衡函数体，并对字符串、行注释、块注释进行 lexical skip；因此能处理：

```ts
function stableId(
  prefix: string,
  parts: readonly string[],
): string {
```

执行命令：

```bash
python /tmp/t14_hash_probe2.py
```

结果（脚本把函数名归一化后计算 `sha256(...).hexdigest()[:16]`）：

```text
normalizeBaseUrl\t7
  2cbc6b48fa87ba12\tpackages/ts-shell/src/config/runtimeConfig.ts:432
  49c775f2fc4c023b\tpackages/ts-shell/src/core/auth/providerAuthRuntime.ts:250
  2cbc6b48fa87ba12\tpackages/ts-shell/src/core/commands/authCommandRuntime.ts:268
  a5881a0516964a0c\tpackages/ts-shell/src/core/commands/connect/preset.ts:151
  c1a94770be553562\tpackages/ts-shell/src/core/commands/modelCommandRuntime.ts:539
  2cbc6b48fa87ba12\tpackages/ts-shell/src/core/shell/providerCredentials.ts:253
  c179f9c972c2943f\tpackages/ts-shell/src/core/shell/providerReadiness.ts:302
normalizePathForCompare\t7
  a678353060f70fa1\tpackages/ts-shell/src/core/shell/bootstrap.ts:58
  2835791129006662\tpackages/ts-shell/src/core/shell/runtimeContext.ts:295
  a678353060f70fa1\tpackages/ts-shell/src/core/shell/startupSurfaceRenderer.ts:178
  7933bff105ca47ba\tpackages/ts-shell/src/entrypoints/cliArgs.ts:418
  a678353060f70fa1\tpackages/ts-shell/src/entrypoints/cliPermissionModule.ts:146
  a678353060f70fa1\tpackages/ts-shell/src/entrypoints/cliSessionModule.ts:347
  80a83010347c7405\tpackages/ts-shell/src/entrypoints/cliWorkspaceModule.ts:95
toRelativeTime\t4
  7d50d8ad129dc00e\tpackages/ts-shell/src/core/shell/sessionStateSurface.ts:290
  7d50d8ad129dc00e\tpackages/ts-shell/src/entrypoints/cliPermissionModule.ts:124
  7d50d8ad129dc00e\tpackages/ts-shell/src/entrypoints/cliWorkspaceSurface.ts:91
  3ec9e04bf19dc8d1\tpackages/ts-shell/src/entrypoints/sessionsPanel.ts:209
stableId\t3
  8a50f55fbe1c7ff5\tpackages/ts-shell/src/planning/action/graph.ts:427
  09be8121be5deb3e\tpackages/ts-shell/src/runtime/resources/inventory.ts:558
  09be8121be5deb3e\tpackages/ts-shell/src/tools/policy/interception.ts:398
```

### 2. T17 根目录复现

执行命令（仓库根目录）：

```bash
npx vitest run --reporter=json --outputFile=/tmp/root-vitest.json
```

该命令 exit 1，JSON 报告为：

```text
numTotalTestSuites = 1177
numFailedTestSuites = 0
numPassedTestSuites = 1177
numTotalTests = 2749
numFailedTests = 3
numPassedTests = 2746
```

当前实测失败面是 **2 个文件 / 3 个失败项**：

1. `packages/ts-shell/src/session/longSessionDurability.test.ts`：2 项失败。测试在 `runFixture()` 中使用 `path.resolve(process.cwd(), "../..")` 计算 repoRoot；从仓库根启动时得到 `/home/wang`，于是寻找 `/home/wang/node_modules/tsx/dist/cli.mjs`，该路径不存在。相同测试在 package cwd 下才会把 `../..` 解析到仓库根。
2. `packages/ts-shell/src/core/mcp/gateway.test.ts`：1 项失败。测试使用 `path.resolve(process.cwd(), "src/core/mcp/fixtures/mockMcpServer.mjs")`；从仓库根启动时得到 `/home/wang/projects/cheers/src/core/mcp/fixtures/mockMcpServer.mjs`，而实际 fixture 在 `packages/ts-shell/src/core/mcp/fixtures/mockMcpServer.mjs`。

验证上述路径假设的命令：

```bash
python - <<'PY'
from pathlib import Path
for p in [
    Path('packages/ts-shell/src/core/mcp/fixtures/mockMcpServer.mjs'),
]:
    print(p, p.exists())
PY
```

输出为：

```text
packages/ts-shell/src/core/mcp/fixtures/mockMcpServer.mjs True
```

### 3. Vitest 配置与官方入口

确认根配置：

```bash
python - <<'PY'
from pathlib import Path
print('root vitest.config.ts exists:', Path('vitest.config.ts').exists())
print('all root vitest config names:', [str(p) for p in Path('.').glob('vitest.config.*')])
PY
```

结果：

```text
root vitest.config.ts exists: False
all root vitest config names: []
```

`packages/ts-shell/vitest.config.ts` 实测内容设置：

```ts
test: {
  environment: 'node',
  globals: true,
  testTimeout: 30000,
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json'],
  },
}
```

命令：

```bash
builtin grep -nE "testTimeout|include|exclude" packages/ts-shell/vitest.config.ts || true
```

结果只有：

```text
10:    testTimeout: 30000,
```

所以该 package 配置**没有显式 `include` 或 `exclude`**；但 package 脚本在 `packages/ts-shell/package.json:18` 是：

```json
"test": "vitest run"
```

CI 在 `.github/workflows/ci.yml:30` 执行：

```text
npm run test:ts
```

而 `npm run test:ts` 在根 `package.json:26` 委托给 `npm run test -w packages/ts-shell`，故 cwd 是 package workspace。三栈脚本也显式使用：

```text
scripts/test-all-stacks.mjs:55
runStack('TypeScript Tests (vitest)', nodeExe, [vitestModule, 'run', '--dir', 'packages/ts-shell/src'])
```

## 逐组分析

### `normalizeBaseUrl`：7 份，3 exact + 3 same-family + 1 genuinely different

#### byte-identical（3）

以下三份哈希均为 `2cbc6b48fa87ba12`：

- `config/runtimeConfig.ts:432`
- `core/commands/authCommandRuntime.ts:268`
- `core/shell/providerCredentials.ts:253`

```ts
function normalizeBaseUrl(baseUrl?: string): string | undefined {
  const trimmed = baseUrl?.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.replace(/\/+$/, "");
}
```

#### same-family（3）

1. `core/auth/providerAuthRuntime.ts:250`，哈希 `49c775f2fc4c023b`：只把 `return` 紧贴到前一行，行为相同。
2. `core/commands/connect/preset.ts:151`，哈希 `a5881a0516964a0c`：调用同文件的 `normalizeOptional()` 代替 `baseUrl?.trim()`；该 helper 的实际定义是 `value?.trim()` 后空串转 `undefined`，行为相同；另外该导出是 `export`，属于 API 可见性差异而非结果差异。
3. `core/commands/modelCommandRuntime.ts:539`，哈希 `c1a94770be553562`：调用同文件的 `normalizeText()`；该 helper 同样是 trim + 空串转 `undefined`，行为相同。

#### genuinely different（1）

`packages/ts-shell/src/core/shell/providerReadiness.ts:302`，哈希 `c179f9c972c2943f`：

| 常规族 | providerReadiness |
|---|---|
| `function normalizeBaseUrl(baseUrl?: string): string \| undefined` | `function normalizeBaseUrl(baseUrl: string): string` |
| `const trimmed = baseUrl?.trim()` | 直接使用 `baseUrl` |
| 空/空白输入 → `undefined` | 空串 → `""`；空白保留 |
| `trimmed.replace(/\\/+$/, "")` | `baseUrl.replace(/\\/+$/, "")` |

这是可观察差异：输入 `"  https://api.example/  "` 时常规族返回 `"https://api.example"`，readiness 版本返回 `"  https://api.example/  "`；输入 `""` 时常规族返回 `undefined`，readiness 返回 `""`。因此不能直接把 7 份替换成一个未经语义确认的函数。

**core/准入与 owner：**

- Direction：若仅看 helper 本身，可做零 import 的纯字符串函数；但该行为是 provider/config 语义，不是无 feature knowledge 的通用值原语。
- Audience：至少覆盖 `config/`、`core/auth/`、`core/commands/`、`core/shell/` 多个域。
- Survival：真实生产调用，不是 shim/fixture。
- **裁决：不把 `normalizeBaseUrl` 直接放入 `core/values/`。** 已有更合适的 `config/` owner；优先考虑 `config/runtimeConfig.ts` 现有 owner（或其同目录 normalization 模块）。先明确 readiness 是否也要 trim，再合并那 6 份同族实现；readiness 版本保留或单独命名，直到调用契约被确认。

### `normalizePathForCompare`：7 份，4 exact + 2 same-family + 1 genuinely different

#### byte-identical（4）

哈希 `a678353060f70fa1`，位置：

- `packages/ts-shell/src/core/shell/bootstrap.ts:58`
- `packages/ts-shell/src/core/shell/startupSurfaceRenderer.ts:178`
- `packages/ts-shell/src/entrypoints/cliPermissionModule.ts:146`
- `packages/ts-shell/src/entrypoints/cliSessionModule.ts:347`

```ts
function normalizePathForCompare(value: string): string {
  return path.resolve(value).toLowerCase();
}
```

#### same-family（2）

- `packages/ts-shell/src/core/shell/runtimeContext.ts:295`，哈希 `2835791129006662`：同一实现，末尾缺分号；输出相同。
- `packages/ts-shell/src/entrypoints/cliWorkspaceModule.ts:95`，哈希 `80a83010347c7405`：同一实现但带 `export`；导出面不同，函数输出相同。

#### genuinely different（1）

`entrypoints/cliArgs.ts:418`，哈希 `7933bff105ca47ba`：

| 绝对比较族 | cliArgs 版本 |
|---|---|
| `normalizePathForCompare(value: string)` | `normalizePathForCompare(value: string, cwd: string)` |
| `path.resolve(value).toLowerCase()` | `path.resolve(cwd, value).toLowerCase()` |
| 依赖进程 cwd | 显式按 CLI 解析时的 cwd 解析相对参数 |

这是 observable difference：对 `"src"` 这类相对值，两个版本可能分别基于进程 cwd 与传入 cwd 得到不同绝对路径。不能合并成单参数 helper 后再靠调用方猜 cwd。

**core/准入与 owner：**

- Direction：候选 helper 必须使用 `node:path`，因此不满足本仓对 `core/` 候选的“零 import”要求。
- Audience：有 `core/shell/` 与 `entrypoints/` 两个以上消费域。
- Survival：绝对路径比较是真实生产行为。
- **裁决：本轮不收口。** 现有 `core/paths/legacyRootRebase.ts` 是路径重绑定/文件系统路径恢复 owner，并非纯 compare helper；把它变成杂项工具桶会扩大职责。若后续要收口，应先单独裁决“core 允许 node built-in import 的路径基础设施例外”以及相对路径 API，再命名一个明确的 path identity owner；当前不要把 `cliArgs` 的显式 cwd 语义抹平。

### `toRelativeTime`：4 份，3 exact + 1 same-family；无输出差异

#### byte-identical（3）

哈希 `7d50d8ad129dc00e`，位置：

- `packages/ts-shell/src/core/shell/sessionStateSurface.ts:290`
- `packages/ts-shell/src/entrypoints/cliPermissionModule.ts:124`
- `packages/ts-shell/src/entrypoints/cliWorkspaceSurface.ts:91`

```ts
function toRelativeTime(iso: string): string {
  const updatedAt = new Date(iso).getTime();
  if (!Number.isFinite(updatedAt)) {
    return "unknown";
  }

  const deltaSeconds = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
  if (deltaSeconds < 60) {
    return `${deltaSeconds}s ago`;
  }
  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }
  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays}d ago`;
}
```

#### same-family（1）

`packages/ts-shell/src/entrypoints/sessionsPanel.ts:209`，哈希 `3ec9e04bf19dc8d1`：变量名改为 `timestamp` / `seconds`，但实际判断和返回字符串相同：

```ts
function toRelativeTime(iso: string): string {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) {
    return "unknown";
  }
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.floor(hours / 24)}d ago`;
}
```

#### 输出/阈值验证

四个副本都满足：

| 输入时间 | 输出规则 |
|---|---|
| invalid date | `unknown` |
| 未来时间 | `0s ago`（`Math.max(0, ...)`） |
| 0–59 秒 | `Ns ago` |
| 60–3599 秒 | `Nm ago`，分钟向下取整 |
| 3600–86399 秒 | `Nh ago`，小时向下取整 |
| ≥86400 秒 | `Nd ago`，天数向下取整 |

因此当前没有用户可见输出差异；wiki 对“显示上下文可能独立”的担忧在当前代码上尚未被观测到，但它是未来漂移风险而非当前行为差异。

**core/准入与 owner：**

- Direction：可以放入无 import 的显示 helper。
- Audience：`core/shell/` 与多个 `entrypoints/` 显示域，超过两个真实消费者。
- Survival：真实用户可见 shell/CLI 输出，不是测试便利函数。
- **裁决：可谨慎收口到已有 `core/shell/` owner（例如 shell display time helper），不新建 `core/text/`。** 合并时必须保留四个调用面的边界测试，尤其是 `unknown`、未来时间和 60/3600/86400 三个边界；不要借此把其他已存在但阈值不同的 `age()`/picker 时间格式也并入。

### `stableId`：3 份，2 exact + 1 genuinely different

#### byte-identical（2）

哈希 `09be8121be5deb3e`：

- `packages/ts-shell/src/runtime/resources/inventory.ts:558`
- `packages/ts-shell/src/tools/policy/interception.ts:398`

```ts
function stableId(prefix: string, parts: readonly string[]): string {
  const suffix = parts
    .join(":")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
  return suffix ? `${prefix}:${suffix}` : prefix;
}
```

调用结果都是稳定的 artifact/policy identity，跨 `runtime/resources/` 与 `tools/policy/` 两个 feature 域。

#### genuinely different（1）

`packages/ts-shell/src/planning/action/graph.ts:427`，哈希 `8a50f55fbe1c7ff5`：

| `prefix, parts` 版本 | planning graph 版本 |
|---|---|
| 参数为 `(prefix, parts)` | 参数为单一 `value` |
| parts 用 `:` 拼接、小写、非 `[a-z0-9._:-]` 替换为 `-`、裁 160 | 任意 value 中非 `[a-zA-Z0-9._:-]` 替换为 `_`、裁 96 |
| 空 suffix → `prefix` | 空值 → `unknown` |
| 输出可为 `prefix:suffix` | 输出是单字符串 |

该差异直接可见于 graph node id / graph id：大小写、连接符、长度和空值都会不同。不能因为同名而合并。

**core/准入与 owner：**

- Direction：候选 `core/values/stableId.ts` 可保持零 import。
- Audience：两个真实 feature 域（`runtime/resources/`、`tools/policy/`）。
- Survival：真实生产 identity，非 shim/fixture。
- **裁决：通过三项准入，目标为已有 `core/values/`，只收口这两个 exact 副本。** `planning/action/graph.ts` 保留原地，或在未来改为语义更明确的 graph-specific name；不得用 shared helper 覆盖它。

## 与既有记录的差异

| 组 | 既有记录 | 本次修正 | 原因 |
|---|---:|---:|---|
| `normalizeBaseUrl` | 4 | **7** | 直接扫描找到 `core/commands/connect/preset.ts`、`core/commands/modelCommandRuntime.ts`、`core/shell/providerReadiness.ts` 三个遗漏副本；其中 provider readiness 还是不同语义。 |
| `normalizePathForCompare` | 7 | **7** | 数量一致；补充了 exact / same-family / cwd-aware genuine difference 分类。 |
| `toRelativeTime` | 4（目标说明）/ 3（block findings 表） | **4** | `entrypoints/sessionsPanel.ts` 是第四份；其变量名不同但输出/阈值相同。 |
| `stableId` | 2 | **3** | 修复多行参数提取后发现 `runtime/resources/inventory.ts` 与 `tools/policy/interception.ts` 的两份 exact 副本，另有 `planning/action/graph.ts` 的第三份不同实现。 |

另一个重要差异是 T17：既有 §9.12 记录的“11 文件 / 16 项（9 个 5s 超时 + 2 个 cwd 文件）”没有在本次同样命令下重现。当前同一 repo-root 命令的 JSON 结果是 **2 文件 / 3 项失败**；失败原因仍然是两个测试使用 package-root 相对 cwd。当前运行中 9 个场景测试没有因默认 5s 超时失败，因此不能把旧数量继续当作当前实测。

## T17 三选项对比

### 选项 A：增加根 `vitest.config.ts`

**收益：** 根目录执行可获得与 package 类似的环境/超时设置；若将 root 配置指向 package 的测试目录，可降低场景测试因默认超时而失败的风险。

**成本与风险：**

- 需要决定 root `root`、`include`、coverage 和 workspace 边界；简单复制 package 配置可能让 Vitest 从根重新收集全部 workspace 测试。
- 可能与 `packages/ts-shell/vitest.config.ts` 形成双配置语义，导致官方 package 入口与 root 入口行为漂移。
- 若 root `include` 写宽，可能再次收集脚本式 `.test.mjs`、其他 workspace 或非 TypeScript 测试；若写窄，则“根跑”并不是真正的统一入口。
- 配置本身不能修复两个测试的 cwd 假设；加根配置后仍会保留 `/home/wang/node_modules/tsx` 与仓库根 fixture 路径错误。

**结论：** 不建议作为 T17 的默认修复；它是新增一条测试入口，不是当前失败的根因修复。

### 选项 B：修两个 cwd-dependent 测试

**收益：** 可以让根目录入口在当前环境下运行；修复的是明确的路径假设，且可用 `import.meta.url` / package-root 明确定位 fixture 与 `tsx`，而不是依赖工作目录。

**成本与风险：**

- 需要修改两个测试文件（本任务约束下只做研究，不实施）。
- 如果将 root 跑 vitest 视为正式承诺，未来还要继续审计其它 `process.cwd()` 假设。
- 可能改变测试子进程 cwd，进而改变 fixtures、HOME 或 package-relative 行为；修复必须保持 package 官方入口的现有语义。
- 不能单独解决历史上可能出现的默认超时问题；若未来再次出现超时，仍需明确配置入口。

**结论：** 只有在项目明确要把“仓库根 `npx vitest run`”升级为受支持入口时才值得做；当前 CI/npm 入口不需要它。

### 选项 C：仅文档化

**收益：** 零代码风险，和现有事实一致：CI、package script、三栈脚本都已经明确从 package 或 `--dir packages/ts-shell/src` 运行。可在 T17 记录中把 root run 定义为误用，不把它当成质量门禁。

**成本与风险：**

- 新贡献者从仓库根运行 `npx vitest run` 仍会看到 2 文件/3 项失败。
- 依赖文档纪律；如果未来有人把 root run 放入 CI，错误会重新成为隐性基建问题。
- 不会修复测试的 cwd 脆弱性，只是明确它当前不属于官方契约。

**结论：** 在当前 CI 使用 `npm run test:ts`、且用户未要求支持 root runner 的前提下，**选择 C**；文档中同时列出官方命令，避免把 root run 当作通过标准。若未来产品决策要求 root run 成为正式入口，再按 B 先修路径、按 A 设计单一根配置，并为 include/exclude 做专门验证。

## 风险与反证

- `normalizeBaseUrl` 的 readiness 版本可能是有意保留原始输入的边界；在未确认 provider readiness 契约前，合并它会把空串/空白处理改变成 `undefined`/trimmed，属于行为变更。
- `normalizePathForCompare` 的 `cliArgs(value, cwd)` 不是 cosmetic difference；将它替换成依赖进程 cwd 的版本会改变相对 CLI 参数解析。
- `toRelativeTime` 当前等价不代表永远应统一。shell session、permission explain、workspace summary、interactive sessions panel 是不同显示上下文；收口必须保留各域测试，以便未来某一上下文需要不同文案时能明确分叉。
- `stableId` 的两个 exact 副本虽然行为相同，但 shared owner 必须只承担“稳定 identity value”职责，不应带入 `runtime/resources` 或 `tools/policy` 类型依赖；这也是 `core/values/` 比 `core/commands/` 更合适的原因。
- T17 当前根跑输出与既有 11/16 基线不一致；本报告只把本次命令的 JSON 作为当前证据，不推断旧失败是否因环境、并发负载或此前配置状态变化而消失。

## 未验证事项

- 未修改任何生产代码、测试代码、`plan.md` 或既有 wiki；本文件是唯一新增报告。
- 未运行 `packages/ts-shell` 下的全量 Vitest；按任务约束只运行了仓库根 `npx vitest run` 以复现 T17。
- 未运行 `npm run build`。
- 未验证合并 `normalizeBaseUrl` 后所有 provider/config 调用点的完整类型与行为回归；本报告只完成了源码、哈希、调用面和直接输出语义核验。
- 未验证 root Vitest 是否在另一个依赖安装或并发负载环境下重新出现 5s 超时；当前一次完整 root run 没有产生超时失败，因此该历史类别保留为风险而非本次结果。
