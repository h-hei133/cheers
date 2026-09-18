# `strict` 开启路径评估（2026-09-18）

> 起因：`pi` 对照分析（`reference-pi-feasibility-2026-09-18.md` §2）发现
> **`pi` 设了 `"strict": true`，我们没有设**。这是本轮唯一"与我们的规则无关、
> 且 `pi` 明确做得更好"的项，故单独评估。
> **本文件是评估，零代码改动。**

---

## 1. 现状实测

### 1.1 我们的 tsconfig 链：**完全没有 `strict`**

```
tsconfig.json（包根）           → 无 strict / noImplicit* / noUnchecked*
tsconfig.build.json             → 无
仓库根                          → 无 tsconfig.json
```

实测 `grep -n "strict\|noImplicit\|noUnchecked\|exactOptional"` 对四个文件**全部无输出**。

**含义**：`strictNullChecks`、`noImplicitAny`、`strictFunctionTypes`、
`strictPropertyInitialization`、`alwaysStrict` 等**全部默认关闭**。

### 1.2 `pi` 的对照

```jsonc
// pi/tsconfig.base.json
"strict": true,
"erasableSyntaxOnly": true,
"forceConsistentCasingInFileNames": true,
```

**`pi` 开了 `strict`，且比我们多 `erasableSyntaxOnly` 与 `forceConsistentCasingInFileNames`。**

> **未验证项（如实标注）**：我**无法确认 `pi` 是否通过它自己的 strict 检查** ——
> `pi` 的 `node_modules` 不存在，`npx tsc -p tsconfig.json` 报
> `error TS2688: Cannot find type definition file for 'node'`。
> 因此"`pi` 开了 strict"是**事实**，"`pi` 在 strict 下干净"是**未验证的推断**。

### 1.3 我们开启后的错误量

| 配置 | 错误数 | 其中生产代码 | 测试文件 |
|---|---:|---:|---:|
| 现状（无 strict） | **251** | **0** | 251 |
| `--strict` | **401** | **136** | 265 |

**关键事实：生产代码在无 strict 下是 0 错误，在 strict 下是 136 个。**
这 136 个就是"strict 会为我们挡住的真实缺陷面"。

---

## 2. 136 个生产错误的分布（决定可行性）

### 2.1 按错误码

| 错误码 | 数 | 含义 |
|---|---:|---|
| **TS18048** | **63** | `'x' is possibly 'undefined'` |
| TS2345 | 41 | 实参类型不匹配 |
| TS2322 | 18 | 赋值类型不匹配 |
| TS2538 | 8 | 不能用作索引（`undefined`） |
| TS2366 | 2 | 函数缺少 return |
| TS7023/7022 | 2 | 隐式 `any` 返回 |
| TS2722/2488 | 2 | 可能是 undefined 的调用/解构 |

### 2.2 按文件 —— **高度集中**

| 文件 | 错误数 | 行数 |
|---|---:|---:|
| **`runtime/events/projection.ts`** | **73** | **3,651** |
| `verification/result/boundary.ts` | 10 | — |
| `provider/request/boundary.ts` | 8 | — |
| `core/tools/toolResultLifecycle.ts` | 8 | — |
| `core/query/runtime/observation.ts` | 6 | — |
| 其余 ~12 个文件 | 各 1–3 | — |

**单个文件占 54%（73/136）。去掉它，剩 63 个散落在 ~17 个文件。**

### 2.3 `projection.ts` 的 73 个 —— **重复模式，可机械化**

其中 **47 个 TS18048 + 26 个 TS2345**，而 TS18048 的标识符只有少数几个：

| 标识符 | 次数 |
|---|---:|
| `cycle.cycleBoundary` | 22 |
| `cycle.responseReentry` | 13 |
| 其余零散 | ~12 |

**成因**（已读源）：可选字段在循环内被无守卫访问——

```ts
// src/runtime/events/projection.ts:344 / 382（声明处，字段可选）
readonly responseReentry?: { ... }
readonly cycleBoundary?: { ... }

// :1241（使用处，无守卫）
for (const cycle of input.responseReentryCycles ?? []) {
  append("response-reentry-observed", {
    reentryId: cycle.responseReentry.reentryId,          // ← 可能 undefined
    sourceAttemptId: cycle.responseReentry.sourceAttemptId,
    ...
  })
}
```

**这是 `strictNullChecks` 的标准修复模式**：循环体开头加一次窄化
（`const { responseReentry, cycleBoundary } = cycle; if (!responseReentry || !cycleBoundary) continue;`），
**一处修改可消除 35 个错误**。

---

## 3. 分批评估

| 批 | 范围 | 错误数 | 修复形状 | 风险 |
|---|---|---:|---|---|
| **S1** | `runtime/events/projection.ts` | **73** | 2–3 处窄化（解构 + `continue`） | 低——纯类型窄化，无行为变更 |
| **S2** | `verification/result/boundary.ts` + `provider/request/boundary.ts` + `core/tools/toolResultLifecycle.ts` | **26** | 逐个守卫 | 低 |
| **S3** | `core/query/runtime/observation.ts` + 其余 ~12 文件 | **37** | 零散 | 低—中（需逐个看是否有隐含假设） |
| **S4** | 测试文件 265 个 | 265 | 改测试夹具类型 | 中（量大但机械） |
| **S5** | 开启 `strict` 并接入 `tsconfig.json` / `tsconfig.build.json` | — | — | — |

**S1+S2+S3 = 136 个生产错误，可分批清零；S4 独立。**
**`tsconfig.build.json` 可先只对生产代码开 `strict`**（它已 `exclude` 测试文件），
从而**不等 S4 即可让生产代码进入 strict**——这是关键的可分批点。

---

## 4. 收益与代价

### 收益

1. **类型系统才真正开始工作**：`strictNullChecks` 关着时，`undefined` 不会被追踪——
   这是本项目 126 处非空断言 `!.` 的根源（远多于 `pi` 的 63 处）。
2. **有真实先例**：`pi` 开了；且它**比我们少 63% 的非空断言**（63 vs 126）。
   > **因果未验证**：这可能来自 strict，也可能来自代码风格。**如实标注为推断。**
3. **与 NormProof 无关**：不依赖我们的规则，是 TS 工具链自带的严格性。
4. **可分批、可回退**：`tsconfig.build.json` 与 `tsconfig.json` 可分别开；
   S1–S3 每批独立可验证。

### 代价与风险

| 风险 | 说明 |
|---|---|
| 265 个测试文件的错误 | 与 S1–S3 独立，不阻塞生产代码进入 strict |
| "修类型而非修 bug"的诱惑 | **必须守住**：正确的修复是**补上真实缺失的守卫**，而不是加 `!` 或 `as`。若为消错加断言，等于把 63 处 `!.` 变成更多 |
| 行为变更风险 | 窄化后 `continue` 会**跳过**原本会产生错误数据的分支——需确认这是正确行为（大概率是，但要逐处确认，不可批量） |

---

## 5. 建议

**推荐执行 S1 → S2 → S3，`tsconfig.build.json` 先启用 `strict`；S4 独立排队。**

理由：
- 收益是**语言工具链层面的**，不依赖任何本仓自定规则；
- 错误**高度集中**（单文件 54%），S1 一处修改消除 35 个；
- `build` 与 `test` 配置可分离，**不必等 265 个测试错误清完**；
- 现有 251 个测试类型错误是**既有**的，开 strict 不会让门禁更难用——
  只要 `tsconfig.build.json` 先单独开。

**纪律要求（与 §2.4.1 一致）**：

1. **每批先测基线**：`tsc --strict` 错误数必须**严格下降**，且**不新增其他错误码**；
2. **禁止用 `!` / `as` 消错** —— 只做**窄化**（守卫、解构 + `continue`、可选链 + 默认值）；
   若某处确需断言，须单独记录理由；
3. **改行为的地方必须能解释** —— 窄化导致跳过的分支要在提交信息里说明"为什么跳过是对的"；
4. **每批跑相关测试 + 全量 `tsc -p tsconfig.build.json`**；
5. **最后一步才把 `strict` 写进 `tsconfig.json`**（含测试），此时 S4 已完成。

**本轮未执行任何修改。** S1 可直接开始（单文件、73 个错误、修复形状已定位）。
