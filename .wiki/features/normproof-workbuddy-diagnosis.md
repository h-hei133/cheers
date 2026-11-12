# WorkBuddy / DeepSeek 零写入诊断

2026-11-09。范围：解释 `global:deepseek-v4.1-flash` 在架构任务中持续读取、迟迟不修改的现象。复用已有真实调用记录，执行原生请求的离线重建和模拟传输；本轮新增模型生成请求为 **0**。用户限定的两次 prompt 实验已结束，没有第三次或替补实验。

**已确认 Cheers 到网关的推理历史回传配置缺失，也确认历史裁剪使源码丢失。但尚未证明任一机制对零写入具有因果贡献。写工具本身可用，最近四场没有写入提案，也没有 NormProof 阻断写入的记录。**

## 证据强度与解释

| 解释 | 已确认的事实 | 对零写入的解释力度 |
|---|---|---|
| 模型适配缺口 | 67 个客户端请求均无历史 reasoning 字段；接收后的 reasoning 保存在内部，精确模型未声明回传字段 | 优先排查；官方协议要求回传，但真实行为改善未验证 |
| 历史裁剪 | 早期完整源码后来缩为约 1,000 字符；中途提醒单独使首次裁剪提前一个请求 | 可增加重复读取；不能解释后期源码恢复后的全部停滞 |
| 网关默认思考档位 | 当前模型列表声明默认 high；本地源码会补模型默认 effort，缺失才兜底 high | 可能影响行为；未绑定实验时部署版本或真实上游请求 |
| 整文件写入与任务不确定性 | 无局部编辑工具；公开总结识别了合规方向，仍保留设计疑问 | 可能增加实施难度；没有输出大小不足或写入拒绝证据 |
| 累计预算 | 请求结算后达到 token 阈值，最后的 read/grep 被拒绝 | 解释终止时点，不能解释此前从未提出写入 |

置信度针对事实，不等于原因已被实验证实。不能从这些材料断定模型权重有故障，也不能判定 NormProof 有效或无效。

## 写入能力与工具可见性

- 同一模型此前三次真实原生 read → write 轨迹均写入成功。严格逐字节复制仅 1/3，通过与否不能混同：另两次多写一个 LF。
- 已完成的 36 场 WorkBuddy 真实任务中，成功文件写入 34 次，其中 27 次改变受测生产源码，18 场最终代码联合通过。
- 本次重建的四场仅提供 `read`、整文件 `write`、`grep` 和 `visible_functional_check`。没有 `bash`、`edit` 或 `patch`，故不能声称本组已测试 bash。
- 四场的请求 1–13 均携带 write schema；请求 14 是强制禁工具总结；复查恢复原工具池。原生 Build / allow-all 路径可执行 write，write 没有 prepare 阶段。
- 四场没有 write 提案、write refusal、写入 lifecycle 或源码变化。两次 prompt 场的末尾拒绝只涉及 read/grep，原因为累计 reported-token 阈值；不属于 NormProof 拒写或 provider 故障。

历史证据：[WorkBuddy 实验分析](/home/wang/projects/normproof-experiment/artifacts/j5b-workbuddy-cohort-v1/analysis.md)、[前置轨迹汇总](/home/wang/projects/normproof-experiment/artifacts/j5b-workbuddy-preflight-v1/summary.json)、[prompt 实验分析](/home/wang/projects/normproof-experiment/artifacts/j5b-prompt-v1/analysis.md)。

## 推理历史回传缺失

通过冻结的原生 `boundText` → `outgoingProjection` → `endpointTurnBody` 重建以下全部请求，复原原工具 schema、opening、history 和 seed。每个已发送工具内容哈希、加 seed 前的请求正文哈希、最终正文哈希均与原始记录一致。

| 历史场次 | 请求数 | 出站 reasoning 字段 | 出站 reasoning_effort |
|---|---:|---:|---:|
| scoped r1 | 17 | 0 | 0 |
| scoped r2 | 17 | 0 | 0 |
| 开场执行指令 | 16 | 0 | 0 |
| 条件式中途提醒 | 17 | 0 | 0 |
| 合计 | 67 | 0 | 0 |

这 67 次包含首次请求和四次禁工具收尾；不能把全部 67 次称作携带工具的后续请求。检查的出站字段为 `reasoning_content`、`reasoning`、`reasoning_text`；内部思考内容未复制进本报告或诊断证据，保留数量及长度即可。

当前 WorkBuddy 精确模型目录项为 `reasoning: true`、`toolCalling: true`、`compat: null`，解析得到的 `reasoningReplayField` 为空。**能接收和显示 reasoning 不等于会回传 reasoning。** Cheers 已有原生回传能力，适配声明形式为：

```json
"compat": { "reasoningReplayField": "reasoning_content" }
```

该声明须绑定精确模型与地址；从第一次新响应开始，原生 step 才会保存对应的 provider/model/request 来源绑定。不得给旧历史人工补授权绑定，也不应对所有 compatible 模型全局开启。

模拟原生 step 的两组对照共四次合成请求通过：未声明时收到 reasoning 但不绑定、不发送；在首次响应前声明后，后续请求发送原值，工具参数及历史保留，内部 origin 不泄露。模拟禁止真实网络，**只证明机械路径，不证明真实模型完成率提升**。

代码：[出站字段投影](../../packages/ts-shell/src/provider/endpoints/openaiCompatible.ts#L129)、[精确模型配置解析](../../packages/ts-shell/src/core/models/requestShape.ts#L172)、[step 来源绑定](../../packages/ts-shell/src/turn/step.ts#L684)。证据：[重建结果](../../.omx/artifacts/normproof-diagnosis/replay.json)、[模拟传输结果](../../.omx/artifacts/normproof-diagnosis/endpoint.json)、[当前配置摘要](../../.omx/artifacts/normproof-diagnosis/configuration.json)。

## 官方协议与本地网关的界限

[DeepSeek 官方 thinking mode 文档](https://api-docs.deepseek.com/guides/thinking_mode)明确要求：携带 tools 的后续请求完整回传此前 reasoning_content，包括没有调用工具的 assistant 轮次；这是继续此前推理的协议要求。文档还称缺失时会返回 HTTP 400。

本地 WorkBuddy 实验实际均返回 HTTP 200。这说明不能直接把网关别名等同官方端点，也不能把缺失回传与零写入认作已确认的因果关系。

当前 `/healthz` 声明服务为 workbuddy2api；`/v1/models` 声明默认 effort 为 high，支持 low/high/max、only_reasoning=true、上下文 1M、最大输出 128K。这些是当前网关元数据，不是实测极限或实验时上游 payload。Cheers 的空 thinking 偏好也不能解释成关闭思考或 low。

只读检查本地 workbuddy2api 源码发现：处理器先去掉 global: 前缀；payload 会注入思考开关、补模型默认 effort、归一化档位；reasoning 回填只有在输入历史已有 reasoning 痕迹时才触发。客户端去掉所有痕迹后，这个回填无法恢复已丢失文本。源码的静态模型表与当前 live 元数据并不完全相同，不能据静态表断言 low 不可用。

本地源码 HEAD 为 `160c553fcd4386ad42f514b0fb596bcb71caffa0`，有既存未提交修改。health 没有部署 commit，本进程 /proc 命名空间没有可见监听进程；**本地源码没有被证明就是部署版本**。本轮未修改网关仓库。

证据：[网关摘要](../../.omx/artifacts/normproof-diagnosis/gateway.json)、[官方文档摘录和来源哈希](../../.omx/artifacts/normproof-diagnosis/upstream-guide.json)。源码：[payload](/home/wang/projects/workbuddy2api/internal/upstream/payload.go#L76)、[thinking](/home/wang/projects/workbuddy2api/internal/upstream/thinking.go#L64)。

## 裁剪确实丢源码，但不是充分解释

当前 Cheers 与冻结 host 的相关投影源码逐字节相同。`outgoingProjection` 每次固定调用 `microcompactMessages`，只保留最近三轮、旧工具输出约 1,000 字符，**不依据剩余上下文容量决定是否裁剪**；user/assistant 消息也计入边界。

两目标最初均完整送达：store 7,924 ASCII 字符/字节、233 个 split 行；artifact 6,341 ASCII 字符/字节、145 个 split 行。

- 开场指令场：请求 2–7 仍有两份完整初读；请求 8 首次把它们缩到各 1,072 字符；复查请求 15 两份都不完整。
- 中途提醒场：请求 2–6 完整；提醒使请求 7 提前裁剪。离线只删提醒，同一请求的两份完整初读恢复。这证明提示干预同时改变了出站上下文，不是独立的提示对照。
- 中途提醒场请求 15 再读七页，请求 16–17 全部代码行可用。分页边界仍缺 store 的三个 LF、artifact 的两个 LF，不能说原始全文字节完全保留。但之后仍无写入。
- scoped r2 请求 16–17 甚至同时具备两份逐字节完整的单结果源码，仍继续检查。早期请求 2–7 也都完整。故“因为源码始终不全所以不能写”与记录不符。

整文件合规 witness 约 8.4KB/8.5KB，联合 write JSON 的本地 tokenizer 估计约 4.3K tokens，低于实验输出上限 8,192。估计不是该模型真实 tokenizer；没有观察到这些四场因输出长度停止，无法认定全文替换不可能。

离线取消全部旧工具裁剪会显著增加累计发送字符：开场场 606,475 → 969,546；中途场 623,131 → 1,118,817。没有运行行为对照，不能直接建议全局关闭裁剪。

另外核对了 read 的 omitted-page notice：虽然原始 metadata 总有该 notice，`boundText` 只在输出超过 10,000 字符时追加；本次首次完整小文件读取没有将误导 notice 发给模型。原始工具记录完整，也不能代替实际出站正文完整。

代码：[固定裁剪](../../packages/ts-shell/src/turn/messages.ts#L8)、[输出绑定](../../packages/ts-shell/src/core/agent/tools.ts#L107)。逐请求细节见 [replay.json](../../.omx/artifacts/normproof-diagnosis/replay.json)。

## 预算、提示偏差与 NormProof 判断

两次 prompt 场共 383,528 输入、23,983 输出 tokens，输入占 94.1%。中途场请求 16 结算后为 188,851，下一次达到 206,478，仍提出 read/grep，没有 write。提高输出额度缺乏输出截断证据；提高相同累计预算的历史对照也未产生写入。

可见总结已识别 store → artifact 的合规实现方向，但仍讨论 root、containment、helper 归属；中途场还考虑了明确排除的 named-profile 清理与旧测试假设。这支持“识别方向后仍继续调查”，不证明模型已经形成完全确定且验证的方案。本报告不读取或引用历史内部思考正文。

两次 prompt 试验残留 `{WORKSPACE}`：promptOverride 绕过替换，原生 cwd 和工具隔离仍正确。停止信号也未阻止原 runner 启动第二场。这些脚本缺陷已在原分析中披露；原结果不覆盖、不替补。此前正确替换的 scoped 场同样无写入，占位符也不能解释全部停滞。

NormProof 评估仍缺自然的可判定违规机会与反馈后修复：没有写入提案就不存在写前阻断收益；原样源码合规也不代表功能完成。这次诊断没有增加 NormProof 净收益证据。

## 后续投入判断与本轮交付

下一步优先在隔离的新轨迹中补精确模型的回传声明，再验证真实多轮工具契约和任务实施行为；任务、prompt、预算、effort、工具池保持可比较，先排除既知占位符偏差。源码保留或局部编辑随后单独验证，不同时改动多个变量。回传 reasoning 也会增加输入成本，不能预先声称一定更省预算。

当前不扩大原实验规模，不再次提高同一配置预算。新的真实实验尚未执行，本轮也没有永久配置修改。用户限定的两次 prompt 尝试维持关闭。

本轮仅在 Cheers 保存诊断脚本、脱敏结果和文档。原始实验数据、七组冻结文件、相关生产源码及用户配置哈希均复核；原有 NormProof、实验仓库和网关状态保持。无提交、推送或远端 CI；没有以产品 build 或全仓测试代替本次协议证据。

归档位于 [诊断目录](../../.omx/artifacts/normproof-diagnosis/)，该目录被 Git 忽略，仅是本地证据。脚本仍依赖原实验冻结 host 和已有结果；没有把外部运行时复制进 Cheers。重现仅限离线：

```bash
rtk proxy node --import tsx .omx/artifacts/normproof-diagnosis/replay.mjs
rtk proxy node --import tsx .omx/artifacts/normproof-diagnosis/endpoint.mjs
rtk proxy node .omx/artifacts/normproof-diagnosis/verify.mjs
```

验证结果：[冻结文件核验](../../.omx/artifacts/normproof-diagnosis/frozen-verification.json)、[保留与交付核验](../../.omx/artifacts/normproof-diagnosis/verification.json)。

`git diff --check` 通过。`verify:docs-drift:strict` 实际执行但失败：binding rules 无失效引用，current-state 文档中的 28 个失效路径全部来自未修改的 `.normproof/dispositions.md`；另有 119 个 source 路径提示。该文件、检查器及 DOC_STATUS 均与本轮开始时 HEAD 的内容一致，本轮没有修复这些既有引用；新增报告的本地链接由上述独立核验检查。检查回执见 [文档门记录](../../.omx/artifacts/normproof-diagnosis/docs-gate.json)。
