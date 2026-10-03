# Phase 18 Provider 行为审计

W7-27包含四端点逐字段请求表、流边界、跨模型/resume用量与逐路径超时取消四项。
当前只闭合下列已验证切片；字段表、调用路径和用量矩阵继续，W7-27未完成。
源码路径相对 `packages/ts-shell/src/`。

## 已完成切片

| 范围 | owner与证据 | 保证边界 |
|---|---|---|
| 单次JSON响应 | `provider/endpoints/simple.test.ts`；提交b805f63e | 原生消息关闭stream、签名单次选择converse；主回合保持流式 |
| 多行SSE | `provider/endpoints/sse.test.ts`；提交7509788d | data行保留换行、单个可选空格、LF/CRLF/CR和字节分块；保留坏帧跳过政策 |
| 服务端重试间隔 | `turn/retry.test.ts`；提交2f44a914 | 跨层提示、上限、无上限长等待分段、取消和无双重重试 |
| EOF完成证据 | 下表及 `provider/endpoints/termination.test.ts` | 缺结束信号不能变成成功；已显示文本保留、工具不准入 |

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
