# Phase 18 Provider 行为审计

W7-27包含四端点逐字段请求表、流边界、跨模型/resume用量与逐路径超时取消四项。
当前只闭合下列已验证切片；字段已逐项对照，缓存刷新和最终流/调用路径/用量矩阵继续，W7-27未完成。
源码路径相对 `packages/ts-shell/src/`。

## 已完成切片

| 范围 | owner与证据 | 保证边界 |
|---|---|---|
| 单次JSON响应 | `provider/endpoints/simple.test.ts`；提交b805f63e | 原生消息关闭stream、签名单次选择converse；主回合保持流式 |
| 多行SSE | `provider/endpoints/sse.test.ts`；提交7509788d | data行保留换行、单个可选空格、LF/CRLF/CR和字节分块；保留坏帧跳过政策 |
| 服务端重试间隔 | `turn/retry.test.ts`；提交2f44a914 | 跨层提示、上限、无上限长等待分段、取消和无双重重试 |
| EOF完成证据 | 下表及 `provider/endpoints/termination.test.ts` | 缺结束信号不能变成成功；已显示文本保留、工具不准入 |
| Bedrock能力与二进制分流 | `provider/endpoints/bedrockConverse.test.ts`、`turn/step.test.ts`及第四批证据 | vision门槛、预算裁剪、真实binary MIME交端点reader |

## EOF与尾帧

先核对现有reader及step成功映射，再对照本地参考的同类读取器。参考要求显式完成原因，
OpenAI兼容侧允许声明不支持完成原因的兼容例外；Google侧无原因失败。
采纳“EOF本身不能证明生成完成”，本仓保留原有协议兼容信号，不新增全局成功推断或另一套parser。

| 协议 | 完成证据与明确差异 | EOF / 资源行为 | 自动验证 |
|---|---|---|---|
| OpenAI兼容 | `[DONE]`或有效finish_reason；保留既有sentinel兼容，比参考默认严格finish要求宽 | 无两者则失败；尾事件的结束标志保留；finish后仍给usage两秒宽限 | completion 31项，termination中的8项 |
| Anthropic消息 | stop_reason或message_stop；保留既有二选一，未改为参考的必须message_stop | 即使缺message_start也须证明完成；完整但无空行尾事件可读，尾部error不被吞；提前退出释放body | anthropicMessages 46项，termination中的8项及尾部error1项 |
| Google生成 | candidate.finishReason；与参考一致 | 无原因则失败；完整尾JSON可读；异步迭代释放提前退出的body | googleGenAI 32项，termination中的6项 |
| Bedrock Converse | messageStop；即使缺messageStart也必须存在 | 停止后仍读metadata；帧CRC与截断由既有binary reader负责 | bedrockConverse 30项，eventStream 14项 |

新增负例覆盖空流、正文后EOF、损坏尾帧。SSE逐字节输入拆开UTF-8，正例分别覆盖带/不带空行的
各兼容终止信号；三SSE协议的工具数据若无终止信号，step返回error和空toolCalls。
正文或思考已显示后EOF不触发外层重试。未改变非流式 `stopReasonOf` 兼容行为。

六个旧成功fixture缺少终止信号：一条OpenAI尾事件、一条原生思考及四条Google场景。
分类为本次契约收紧后的fixture framing不足，补齐终止帧，保留原文本、工具、签名和usage断言。

隔离HOME下运行 `npm run test -w packages/ts-shell -- --threads=false`
加completion、step、session、anthropicMessages、googleGenAI、bedrockConverse、termination、sse、eventStream九套件：
最终260项、exit0。四生产owner撤销后19失败/93通过，精确恢复后上述最终复跑通过。
build:cli、静态阻断门及43项脚本通过；NormProof exit0，整体advisory仍partial。
独立代码APPROVE、架构CLEAR；原始定向证据在 `.tmp/termination-b_lygpa2`。

编译CLI（dist/cli.js，经Node运行）的普通/全屏PTY与本地HTTP覆盖三SSE协议各缺/有结束帧，共12场景、exit0：
缺帧保留部分文本、query.failed、单次请求、无success；有帧query.completed，终态sourceEntryId非空且匹配助手消息。
产物 `.tmp/termination-pty-0qef8_83`；首次驱动误选google兼容provider导致readiness失败，修正为注册名google-ai后全组通过。
这不是单文件可执行产物、真实provider、TLS/HTTP2或云签名验收，也不是完整SSE规范验证；W7-33仍单独执行。

上批2f44a914的CI37147699694及Architecture Watch37147699715均成功。


## 摘要与旁路调用的签名（第三批）

核对实际调用方后发现：主回合已用签名transport，而/btw、手动和自动压缩、回退摘要只接有超时的裸transport，
且API key/account门槛会拒绝由端点signer自行取凭据的请求。参考的直接调用和摘要复用同一端点认证准备；
采纳此边界，复用现有providerFetchForEndpoint，不增加认证算法或另一个摘要实现。
Signer存在只允许尝试，失败仍由调用方返回错误；缺少baseUrl/model的压缩保持拒绝。

| 路径 | 当前transport / 取消 | 本批证据或剩余范围 |
|---|---|---|
| 主回合 | cliRuntimeInvocation的providerFetchForEndpoint；调用者signal与读完释放 | 原接线保留 |
| /btw | providerFetchForEndpoint；15秒命令计时器 | 真实loopback证明最后URL/body已交signer；缺key仍可签名，signer失败无HTTP/成功答案 |
| 手动/自动历史压缩及回合前缀摘要 | 同一buildCompactionWiring内共享签名transport；转交signal | 四回调均覆盖，无key与有key两个场景 |
| 回退后的摘要 | 每次请求创建签名transport | 缺key可签名；仍无外部取消参数，受transport时限约束 |
| 缓存刷新 | 原有bounded transport及runner signal | 本批保留原key/account准入；签名与body上限处理尚待单独核验 |
| 公共模型目录刷新 | modelCommandRuntime直接fetch；8秒AbortSignal | 公共目录元数据，不是模型生成；只做源码分类 |

签名端点放行会间接使共用target向cache warmer提供价格/TTL。独立架构审查指出这一扩大；
已在warmingTarget保留旧key/account门槛，避免本批开启新的未签名后台请求。允许联网、显式TTL和价格的回归覆盖该边界。

编译HTTP/PTY首次失败定位为真实签名缺陷：adapter使用hostname，线上Host包含非默认端口；
独立HMAC重算证明仅移除Host端口就匹配旧签名。对照官方SDK的Host/authority构造后改传url.host，
region仍从url.hostname提取。参考固定版本：
https://github.com/aws/aws-sdk-js-v3/blob/v3.758.0/packages/middleware-host-header/src/index.ts
（本地证据 `.tmp/admission-validation/aws-host-header.ts`）。标准默认端口由URL归一化保持不变。

最终 `npm run test -w packages/ts-shell -- --threads=false` 加compaction wiring、btw、fetch、completion、
summarize、sentRequest、cacheWarm、signature、bedrockConverse九套件：136项、exit0；build:cli通过。
两caller owner撤销10失败/3通过；端口修复单独撤销1失败/30通过；均精确恢复后最终复跑。
独立APPROVE/CLEAR；静态阻断门与43项脚本通过；NormProof exit0、整体advisory仍partial。
定向证据 `.tmp/signing-c8qyinug`。

普通/全屏编译CLI各执行/btw和/compact，本地服务用合成凭据独立重算四个实际请求的HMAC，
所有签名含随机端口的Host、最终converse路径和JSON正文；答案可见，压缩checkpoint持久化，进程exit0。
产物 `.tmp/signing-pty-2h0j75nm`；没有真实provider、云凭据或云服务请求。
这证明本地实际HTTP签名与摘要路径，不证明云端可用性、全部认证来源或Vertex真实签名链。

4e6290c8的CI37148884120及Architecture Watch37148884066均成功。
W7-27的逐字段表、用量与其余transport/取消边界继续，缓存刷新尚未闭合。


## 逐字段请求对照（基线73d896bd，第四批修正B两项）

输入集合取自provider/endpoints/kinds.ts的TurnRequest和SimpleRequest；下表覆盖全部18个TurnRequest字段。
“无wire字段”表示协议不消费该选项或调用者已处理，不意味着字段丢失。
端点简称：O=OpenAI兼容，A=Anthropic Messages，G=Google生成，B=Bedrock Converse。

| 输入字段 | O | A | G | B | 参考决策 / 本仓判定 |
|---|---|---|---|---|---|
| model | body.model | body.model | URL模型段；消息转换也使用模型代际 | URL模型段 | 参考同样区分body与SDK/path模型；本仓不复制SDK封装 |
| provider | 仅requestHeaders路由元数据 | 仅requestHeaders路由元数据 | 无wire字段 | 无wire字段 | 身份由调用者解析，协议决定wire；保留 |
| systemPrompt | messages首条，允许空字符串 | 非空system文本块及ephemeral缓存 | 非空systemInstruction.parts | 非空system文本块 | 参考同样按协议区别system与消息；不导入参考的产品身份或专用beta |
| messages | 角色保留，转换content图片 | system移出，tool_use/tool_result，合并同角色 | assistant→model，functionCall/functionResponse，成组结果 | toolUse/toolResult、合并同角色 | 参考同样执行协议转换；本仓结果/权限来源仍归现有turn层 |
| tools | tools.function及tool_choice:auto | input_schema，最后工具加缓存标记 | functionDeclarations及AUTO | toolSpec.inputSchema.json及auto | 参考工具选择更丰富；本仓契约仅布尔允许，不增加未承诺选择模式 |
| allowTools | false或无工具时省略schemas | false或无工具时省略schemas | false时省略工具和配置 | 历史已有工具但本轮不允许时保留仅供历史校验、说明要求勿调用的placeholder | 参考也处理历史工具要求；本仓沿用已有placeholder策略 |
| vision | false转文字描述；true转image_url | false转描述；true原生图片块 | false转描述；true支持的inlineData | 仅true保留支持MIME图片，否则共享文字fallback | B缺口已在第四批修复并验证；simple同样按false处理 |
| temperature | supportsTemperature允许且无thinkingLevelName时发送 | 同O，且输入存在时发送 | supportsTemperature允许且输入存在时发送 | supportsTemperature允许且无thinkingLevelName时发送 | 能力约束与协议约束应共同成立；已有正反测试 |
| supportsTemperature | false省略temperature | false省略temperature | false省略temperature | false省略temperature | 与参考按模型能力控制一致 |
| topP | top_p | top_p | generationConfig.topP | inferenceConfig.topP | 参考所读主builder未全部暴露topP；本仓已有选项保留，不因此删除 |
| maxOutputTokens | 按maxTokensField写入，未设省略 | max_tokens，默认4096 | generationConfig.maxOutputTokens，未设省略 | inferenceConfig.maxTokens，默认4096 | 参考取模型默认或显式上限；本仓主调用先解析模型上限，simple默认保留 |
| thinkingLevelName | reasoningEffort允许时写reasoning_effort；也抑制温度 | 开启预算式thinking；不直接发level字符串 | 无wire字段 | 仅抑制温度 | 参考也按模型映射；本仓未承诺完整adaptive/level协议，保留预算式能力范围 |
| thinkingBudgetTokens | 无wire字段 | 最多max_tokens减1024，小于1024则不启用 | thinkingConfig.thinkingBudget与includeThoughts | additionalModelRequestFields.thinking.budget_tokens，最多输出上限减1024，低于1024省略 | B第四批修复；保留caller上限，与本仓A一致 |
| allowEmptySignature | 无wire字段 | 决定空签名reasoning是否作为thinking回传 | 无wire字段 | 无wire字段 | 参考有同名兼容决策；不跨协议套用 |
| systemRole | 首条system/developer | 无wire字段 | 无wire字段 | 无wire字段 | 参考同样仅在相应协议映射；其他协议system位置固定 |
| reasoningEffort | 允许发送level | level由调用者筛选后传入 | 无wire字段 | level由调用者筛选后传入 | turn/step在解析能力后选择level；保留原分层 |
| maxTokensField | 选择max_tokens/max_completion_tokens | 无wire字段 | 无wire字段 | 无wire字段 | 参考也使用兼容字段；不能用于改写其他协议的嵌套上限 |
| assistantAfterToolResult | 调用者bridgeToolResults已消费 | 同左 | 同左 | 同左 | 不在四协议重复插入历史桥接 |

SimpleRequest的6字段为model/messages/systemPrompt/maxOutputTokens/temperature/supportsTemperature。
model与system/messages位置同上；不携带工具、vision或thinking；O温度缺省不发，A缺省不发，G/B默认0但仍受能力门槛控制。
O单次输出上限使用max_tokens；A/B未设时4096，G未设省略。A显式stream:false；G/B选择单次URL，所有simple调用Accept:application/json。
主回合O/A声明stream:true，G用streamGenerateContent?alt=sse，B用converse-stream。

参考检查位置限定于四个对应请求builder、消息转换和单次/流式入口：
O buildParams的model/messages/stream/usage/maxTokens/temperature/tools；
A buildParams的system/messages/tools/max_tokens/thinking兼容；
G buildParams的contents/systemInstruction/generationConfig/toolConfig/thinking；
B commandInput与simple入口的inferenceConfig、toolConfig和预算裁剪。
表中两处B差异已修复并有反转验证；其他字段的源码对照仍不等同四协议全部行为验证。

## 用量与恢复证据定位

现有observability/usageTelemetry.test.ts覆盖跨模型累计、同model跨provider计价、cache tokens与特殊键；
observability/usage/persistence.test.ts覆盖顺序模拟多写入者的增量合并、写失败不确认、恢复不覆盖未flush值、损坏拒绝；
session/store/usage.test.ts经实际query/state owner及文件锁写盘、载入、激活与切换，验证300→310及原provider桶100→110，
恢复后不复用旧prompt gauge；session/compactionUsage.test.ts验证gauge只影响阈值、不改变历史切点。
本次只核对这些现有测试及owner位置，尚未作为W7-27最终用量验收重跑；不追加同义fixture。

## 剩余闭合清单

1. 缓存刷新：invocation到turn接线、签名、协议输出上限及用量记录。生命周期runner已在第五批验证，
   当前生产invocation缺少转交runner；须与其余协议修复一起接通。参考刷新复用模型transport、
   最大输出1、无自动重试、校验当前run后记账并重新调度；本仓保留已捕获请求前缀的选择，需逐条对齐其他约束。
2. 最终流/timeout/cancel矩阵及上述用量恢复套件验收，明确transport时限与认证准备时限的区别。

W7-27完成前按此有限清单推进；W7-29和W7-33仍在后续执行位。

73d896bd的CI37151663744及Architecture Watch37151663719均成功。当前逐字段表补充仅改文档，未重跑build/tests。


## Bedrock能力约束与二进制响应分流（第四批）

主回合step确实从catalog传入vision和thinking预算；原adapter忽略前者且未经约束发送后者。
修复后仅vision===true发送图片字节，否则复用formatNonVisionFallback，保留相邻文本及图片位置；
simple没有视觉能力参数，也走文字fallback。旧图片正例显式声明vision=true；旧预算正例把输出上限设为8192，原预算4096断言不变。
这些fixture过去隐含了不符合能力契约的输入，按合同修正输入而不删除场景。

参考单次入口先调整预算和上限，再把预算裁到maxTokens-1024；采纳“给答案留1024”的决策，
但不提高本仓caller ceiling，沿既有Anthropic适配器的上限优先规则；裁剪后不足1024就省略thinking。
参考所读图片builder直接转换图片，本仓则有明确vision=false契约，因此采用本仓共享fallback。
消息转换移到provider/endpoints/bedrock/messages.ts，端点注册/调用接口不变；两owner函数名数为15/6，原21超限已消除。

首次普通PTY中，本地服务器收到正确字段并返回合法application/vnd.amazon.eventstream，
主回合却按JSON读取，导致网络错误和重试。这是真实分流缺陷，证据.tmp/bedrock-limits-pty-f421u_8p；
参考流入口由SDK直接迭代response.stream，本仓沿用现有endpoint.readStream，仅补识别binary MIME。
新增真实二进制帧step正反用例：messageStop完成成功；缺结束帧保留已显示文字、失败且单次请求。

隔离HOME定向6套170项通过：bedrockConverse、step、completion、requestShape、multimodal、simple。
字段owner反转12失败/91通过；binary增量修复前及反转均3失败/91通过。两次精确恢复，最终复跑170项通过。
构建CLI和43项脚本通过，独立代码APPROVE/架构CLEAR。
静态图1443模块无环；超函数上限advisory由7降6，其他reachability7/docs-source120未变；NormProof exit0、整体仍partial。
定向证据.tmp/bedrock-limits-ah2i0nk4。

普通/全屏Node运行dist/cli.js各覆盖vision=false/true且上限4096、vision=false且上限512，共6场景exit0。
本地服务核对实际图片字节/文字fallback、3072预算/小上限无thinking，再返回合法二进制结束帧。
每场单请求、query.completed、来源ID与助手消息一致；证据.tmp/bedrock-limits-pty-2ewkgtwt。
仅合成凭据和本地HTTP，不证明真实云模型、TLS/HTTP2、完整认证来源或单文件可执行产物。
a86e1936的CI37152898216与Architecture Watch37152898231均成功；W7-27按上方剩余清单继续。


## 缓存刷新生命周期（第五批，仅runner）

参考刷新在发送前后校验当前run，只有同一run能重新调度；并在预定触发时刻后保留半个到期余量作为调度期限。
本仓采用相同决策，保留捕获原请求前缀与现有经济性判断：clear递增generation，旧timer/await不能覆盖新计时器；
新前缀与转idle取消旧请求，stop及streaming模式settled永久停止当前runner，晚到通知不能重启。
这是每次新run创建新runner的现有调用方式；idle模式仍允许等待用户。刷新失败后可继续安排的既有策略保留。
调度期限只约束迟到timer是否可发送，不是网络完成期限，也不涵盖签名准备时限。

定向cacheWarm/cacheEconomics/compaction wiring/session四套61项通过；生产runner反转8失败/11通过，精确恢复后61项复跑通过。
build:cli、静态阻断门及43项脚本通过；独立代码APPROVE、架构CLEAR。定向证据.tmp/warming-lifecycle-1abln8m4。

普通PTY未能启动首次刷新，不能作为通过证据。原始证据.tmp/warming-lifecycle-pty-o81se_b2，
诊断.tmp/warming-lifecycle-pty-y62fxq2z显示runner拿到idle/价格/TTL，但从未收到noteRequest/noteSettled；
源码确认cliRuntimeInvocationBridge传入cacheWarming，而entrypoints/cliRuntimeInvocation.ts没有声明或转交runTurn。
诊断只在编译文件中加入报告mode/价格/TTL的临时日志，完成后按字节恢复；未使用真实配置或provider。
当前缓存生命周期正确性只在runner与定向套件中成立，不宣称CLI端到端刷新已闭合。

暂不单独接通漏掉的字段，以免在签名/协议正文/用量尚未修复时开启后台请求；这四项在剩余清单同一闭合批处理。
本批没有修改默认模式、联网策略、签名、正文转换或用量owner；W7-27继续。

52adc005的CI37154669450和Architecture Watch37154669449均成功。
