# PreToolUse 翻译契约

C1 在 Cheers `core/hooks` 中翻译调用与 hook 结果。C0 的原始探针保存在
[probes.md](probes.md)，本次执行记录见 [translation-execution.md](translation-execution.md)。
这条路径没有完成证明 authority，也不替代普通 tool permission。

C3b 在同一消费边界固定了 C3a 的结果分类：版本化结果使用闭合的 `reasonCode`，旧 flat
`allow`/`block`/`retry` 继续兼容；未知和输入不完整结果不会成为 clean allow。

## 启用与发行物

在已有用户 `hooks.json` 或项目 `.agents/hooks.json` 中加入 PreToolUse handler：

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "^(?:Write|Edit|MultiEdit|NotebookEdit)$",
      "hooks": [{
        "writeGate": {
          "version": 1,
          "path": ".normproof/write-gate/cli.mjs",
          "sha256": "817aaa8838df536212907ca56ece9360385b9bda8f8ff87383d1c8fd6f46580d",
          "nodeFloor": "20.3.0"
        },
        "timeoutMs": 15000
      }]
    }]
  }
}
```

相对 artifact path 按实际 workspace 解析；用户范围声明可使用已安装 artifact 的绝对路径。
写门产物上限为 8 MiB，以容纳包含源码解析器的独立 bundle。校验通过同一文件描述符分块读取，
最多读取上限加 1 byte；超限、读取期间大小或时间戳变化均保留 `artifact_invalid`，摘要不匹配
保留 `version_mismatch`。该检查不承诺校验后到进程启动之间的路径替换具有原子性。
`artifact.json` 中的 `provenance` 是构建证据，不是 `writeGate` 配置字段。配置闭合验证只接纳
上面四个字段；版本、floor 或哈希不匹配返回 block/unknown。handler 的 command 由固定
artifact 生成，执行 `node <artifact> gate write --emit-result`，不信任另一个自由填写的 command。
hook 执行仍需原有项目信任、声明批准、workspace identity 与撤销检查；批准指纹包含 artifact
配置及 timeout。它不授予工具写权限。

独立发行物为 [.normproof/write-gate/cli.mjs](../../../.normproof/write-gate/cli.mjs)，
来源提交与逐输入哈希在 [artifact.json](../../../.normproof/write-gate/artifact.json)。
它是未经语义修改的 upstream write-gate 依赖闭包，经 esbuild 固定目标 `node20.3` 打包。
旧的 `.normproof/normproof-0.1.0.tgz` 和 CI judge 不变。重建只读固定源码仓库：

```bash
rtk proxy node .normproof/write-gate/package.mjs <clean-pinned-source-checkout>
```

构建器不写源码仓库，不把 Cheers 映射加入 upstream。运行时检查只选择或拒绝 artifact；
不能用 upstream 完整 package 的 Node ≥24 声明把 Cheers 的写操作统称 unsupported。
已实测 Linux x64 / Node 20.3.0；其他平台未验证。

## 输入

翻译模块保留：`version:1`、`event`、`workspaceRoot`、`sessionId`、原 `toolName`、
`toolCallId`、完整 `args`、实际 `timeoutMs`、`timestamp`、可选 `agentId/agentType`。
`reentry:{supported:false,active:false}` 记录当前没有受控重入能力；不生成虚构 attempt。
同一 stdin 添加 upstream 读取的字段：

| Cheers | Canonical wire |
| --- | --- |
| eventName | hook_event_name |
| workspaceRoot | cwd |
| write / edit | tool_name: Write / Edit |
| multiedit / notebookedit | canonical 名称 MultiEdit / NotebookEdit；形状仍 unsupported |
| args.path / args.content | tool_input.file_path / tool_input.content |

canonical matcher 在 host 名称映射后匹配；没有修改 upstream generator。已启用的 adapter
先报告不可判形状，即使该工具不在 matcher 中，也不会将其计为 clean allow。
`write` 和 `edit` 的完整单文件替换可判，字符串可以为空。原生 `edit` 也支持
`oldText/newText` 和单文件 `edits`：编辑所有者在 preparation 中读取一次原始内容，沿用
既有匹配及 BOM／换行语义生成完整候选。普通 permission 和 hook 仍收到原始局部参数；
write adapter 只通过原参数对象的内部绑定取得完整候选，不自行读取或重建文件。
绑定限定当前 runtime、工具和 call，拒绝模型字段伪造、克隆参数、参数后续变更和重复使用。
执行消费同一候选，并通过 `expectedContent` 检查原始字节；准备新文件时用
`expectedAbsent` 拒绝期间出现的目标。写入前及异步快照之后仍重验文件与工作区，
这不承诺跨进程原子提交。未经过原生准备的局部参数、多目标字段，以及 content 与局部
参数混用仍 unsupported；无候选且缺失 content 保留 input_incomplete。
原生 writer 需要读取提交后的文件来核验结果，因此明确的 read deny 也会阻断向不存在路径
进行 write/edit；拒绝发生在 PreToolUse 和写入前。不能用实际出现了文件替代成功的写入回执。
MultiEdit 与 NotebookEdit 暂无已验证的无损单文件投影，所以单项和多项形状都 unsupported。
`apply_patch` 已有 parser 能取路径，但一个 patch 可含多个目标，内容规则按文件判断；
是否复用 parsePatch 做完整逐文件投影留待独立决定。

## 输出、信息来源及 policy

| 状态 | 唯一依据与投影 |
| --- | --- |
| block | stdout flat `decision:block`，或 nested `hookSpecificOutput.permissionDecision:deny`；后者投影为 `{decision:block,reason}` |
| retry | 原生 flat retry 原样保留；现有 consumer 阻断并提示重试，不自动重入 |
| allow | 版本化 `no_violation`，或 legacy flat `allow`；两者都只把 action 交回普通 permission。`not_configured` 保留为 allow 结果，但 `hookVerdict.status=unknown`、policy 为 `observe-only`，不表示规则已配置 |
| unsupported | host 工具/参数无法表示完整单文件内容，或 upstream `not_a_judged_write`；返回 `decision:unsupported` 与固定形状原因，policy 明确为 `observe-only` |
| unknown，adapter 来源 | 解析失败、空 stdout、timeout、artifact/version/runtime 错误、无法解析的非零退出；对 PreToolUse 投影 block，保留 `hookVerdict.status:unknown` 和原因码 |
| unknown，hook 来源 | upstream 明确 `could_not_decide`，即便 wire 的 decision 为 allow，翻译结果仍为 unknown；随后 Cheers `applyWriteHookPolicy` 选择 block，并标注 policy:block |

原因码包括 `invalid_input`、`input_incomplete`、`invalid_output`、`empty_output`、`timeout`、`process_failed`、
`version_mismatch`、`runtime_incompatible`、`artifact_invalid`、`artifact_unreadable`。
适配器错误 reason 与诊断仅含固定说明/原因码，不含 stdout、stderr、payload、堆栈。
非零退出中的明确 flat block/retry 或 nested deny 仍可保留否决；非零 allow 不可信。
工具结果中的 deny reason 是 hook 的原生规则说明，不是适配器错误正文。

未声明 `writeGate` 的普通 hook 保持 native flat block/retry、silent 成功及既有错误策略；
PreToolUse nested deny 也会归一化。普通 silent hook 的 host allow 不等于 adapter allow。
其他生命周期事件尤其 Stop 不使用本翻译协议。

## C3b policy 与合同边界

当前实验 seam 选择 `block-unknown-observe-unsupported`：规则实际触发的
`block/violation`、C3a 的 `could_not_decide`、timeout、空输出、版本或进程失败都会阻断；
`no_violation` 和 legacy flat `allow` 只表示本地 pre 观察，随后仍由普通 permission 决定；
`not_configured` 与 `not_a_judged_write` 保持可见的 observe-only/unsupported 状态，不能进入
已判合规分母。多个 write adapter 合并时优先级为 `unknown > unsupported > ordinary allow`，
后续 clean allow 或普通 feedback 不能抹掉前面的覆盖缺口。普通 permission 从未由 adapter 授予，
实验声明本身也是 opt-in。

针对当前 pinned artifact 的真实 contract cases 已覆盖新建 `-temp` 文件、既有 `-temp` 文件、
合法 alias、empty content、invalid content、wrong root 和缺失配置。新文件阻断，既有文件、alias
和 empty 为 `no_violation`，wrong root 为 `could_not_decide` 并按 policy 阻断，缺失配置为
`not_configured` observe-only；invalid content 当前仍观察到旧 artifact 的 `no_violation`，保留为
C5a refresh gap。

`packages/ts-shell/src/core/hooks/fixtures/write-gate-results.json` 同时固定 literal legacy
和 `--emit-result` 的正反输入。版本化输出只接受 `no_violation`、`violation`、
`could_not_decide`、`not_configured`、`not_a_judged_write` 及其对应 decision；未来 reason
或 decision/reason 冲突会成为 `unknown/version_mismatch`，不会落入 allow。旧 flat block、retry
和无 `reasonCode` 的 allow 不套用版本化闭集。

C3a 的 NormProof 合同源码是只读的 `11cd6ba0b429865a43fbfffa3cb994ae31cfb634`，而本仓当前
发行物仍是独立 pinned artifact `a6ff094ac14049843b6c471eabd2aaa4a55ac8fb`（见
`.normproof/write-gate/artifact.json`）。因此本适配器先在输入边界把缺失 replacement content
标成 `input_incomplete`，避免旧 artifact 将 partial edit 投影成 `no_violation`；旧 artifact
对非法内容的 collection 语义尚未刷新，C5a 必须把该 source/artifact 差异保留为待复核输入，
不能把本地 fixture 的 unknown 观察写成当前发行物已证明。

normal turn 和 native Git/prepared/security 都经 `registerDeclaredHooks` 与同一 dispatcher
实现。普通 permission 在 PreToolUse dispatch 前执行；allow/silent 测试同时断言普通
权限询问恰好一次。unsupported 只报告覆盖缺口，不制造写保护；其他独立 hook 仍可 veto。
未知判断选择 block 是 Cheers 的显式 hook policy，没有再次调用或改变普通 permission。

## 实际能力边界

本路径只判断所报告的拟写入内容。它不闭合 proof obligation，不证明文件已写入、最终
workspace 合规或任务完成。upstream 当前将未配置/无法加载规则投影为 not_configured，
Cheers 保留该可见原因，不能解释成有规则的通过。跨文件图、真实 MCP、shell、浏览器、
desktop、Stop 完成控制、远端 CI authority 都不由这条适配器提供。
