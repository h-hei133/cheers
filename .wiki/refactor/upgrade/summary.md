# 规划执行暂停总结（2026-11-15）

已按用户要求完成当前SDK资源绑定／释放子批并本地提交，随后暂停后续任务。**没有全部修复，也没有完成整份规划。** 本轮包含既有代码修复、规划能力实现和实际消费者验收；不能把任一子批通过当作整体完成。

依据用户指定的三份研究文档及[逐项清单](tasks.md)，当前62项中**20项完成所述本地验收，42项未完成**：14项部分完成、12项已有实现待验收、14项确认缺口、2项待核实。原定暂缓的原生插件／独立桌面产品两项不在62项中，继续暂缓；T6三项保留原计划按需条件。本文统计勾选任务，不统计提交数或重叠测试数。

## 当前子批及提交状态

当前完成的是T3.1中的loader／dispose子批，代码与必要护栏提交为`c8d1477585e6f8a9d7855bcdbf008d1426aa9865`（`fix(sdk): retire consumed resources and join disposal`）。资源代际在初始化前捕获、绑定前复验；失败绑定保留原caller资源和deny rules；dispose释放消费代际、保留后继reload，全部调用等待同一清理并收到原首错，清理失败仍继续terminate。

最终六门、6套件34项、0monoliths及build `1787d90736d1`通过；两反转是实际断言失败，生产源码逐字节恢复后联合测试通过。Linux当前编译SDK验证inline／TS文件扩展撤权及后继资源保留，使用synthetic provider。最终限定只读复核CLEAR仅覆盖本子批。

**T3.1整体仍未完成**：compact尚未纳入idle／取消等待且可覆盖controller；当前安装包的严格类型、真实模型调用、取消复用与dispose联合验收尚未进行。用户要求收尾后暂停，因此未进入这些后续修改。证据在[lifecycle-closing-delivery.json](../../../.omx/artifacts/upgrade-sdk-2026-11-15/lifecycle-closing-delivery.json)、[联合测试](../../../.omx/artifacts/upgrade-sdk-2026-11-15/lifecycle-closing-tests.log)、[当前编译SDK回执](../../../.omx/artifacts/upgrade-sdk-2026-11-15/lifecycle-native.json)。

所有代码批次均本地提交；未推送、未取得本轮远端CI。暂停总结单独以文档批次提交。当前子批的临时驱动和运行状态已清理，复现文本、失败记录和成功回执保留在证据目录。

## 已完成的20项

| 清单编号 | 项数 | 完成范围 |
| --- | ---: | --- |
| T1.1–T1.5 | 5 | 工程基础：依赖归属核实、测试版本和Node下限、Biome门禁、共享构建、15个公开入口及安装类型契约。运行时TypeScript有实际消费者，原研究的直接移除建议被反证，保留依赖。 |
| A.1–A.4 | 4 | edit平面Schema与有界匹配、单次准备序列化、read／工具结果统一行字节预算及完整输出归档、patch写前效果和批准身份绑定。 |
| B.1–B.3 | 3 | Unicode显示宽度、1MiB writer与背压、图片准入／占行／裁剪／绘制／placement清退及缓存预算。 |
| B2.1–B2.3 | 3 | 终端状态与首次协商、用户／助手边界导航、真实tmux超链接、完整调色板、可组合浮层与录制输入过滤。 |
| C.3 | 1 | AgentMessage与provider Message分离；custom持久化／显示，转换贯通普通请求、摘要、自动／手动压缩、rewind／重开及取消后复用。 |
| D.2、D.3、D.5 | 3 | RPC队列清空和模式更新、UI请求／响应及配置／会话换代重绑定、导出持久token／费用并保留未知覆盖。 |
| E.2 | 1 | codemode分支持久化、原始前缀／CAS保护、进程重启与多级fork独立状态。 |

这些是各任务记录的Linux本地验收。其余子批已有有效修复，但仍未满足整项验收。例如C.1循环准备已提交`2141b70b`，C.6历史声明持久化／协议投影／压缩保留也已提交；两项都继续保持未勾选。

## 实际运行过的测试

以下核对的是本轮保存的实际命令日志与回执，历史批次没有在暂停收尾重新运行。单测、原生进程、真实模型调用分别陈述；表中重叠测试或请求不相加成唯一总数。

| 测试类别 | 实际场景与结果 | 证据及限制 |
| --- | --- | --- |
| 已配置模型的真实请求 | 消息联合验收两组各7次、共14次实际请求，覆盖转换／system、自动与手动压缩、工具Schema／思考档位跨轮、rewind／重开、取消零派发和复用；通过。 | [联合证据](../../../.omx/artifacts/upgrade-messages-2026-11-14/context-joint-native-evidence.json)绑定build `c7857153d401`。目标为已配置模型`gpt-6.1-terra`；该目标`nativeHistoryProtocol=false`，不能证明Anthropic原生历史control。 |
| 已配置模型的循环准备 | 当前编译loop经SDK adapter完成2次实际请求，hook顺序与准备取消零派发通过。 | [回执](../../../.omx/artifacts/upgrade-loop-2026-11-15/preparation-native.json)绑定build `3bed083698af`；没有完成跨provider虚拟路由验收。 |
| 包安装与执行入口 | 隔离npm安装15入口严格类型检查（不跳过库检查）、TS扩展、SDK prompt、codemode worker；Node20.3和Linux单文件exe实际prompt通过。 | [T1回执](../../../.omx/artifacts/upgrade-toolchain-2026-11-14/validation.json)；使用synthetic provider，属于当时构建，未替代当前T3.1安装包联合验收。 |
| Linux原生进程与存储 | 8MiB bash输出的完整artifact大小／SHA256和实际read通过；codemode独立进程重启／fork状态通过。 | [输出回执](../../../.omx/artifacts/upgrade-output-2026-11-14/validation.json)、清单E.2；没有整进程长时RSS／吞吐或真实模型任务质量对照。 |
| 管道背压／终止 | 真实OS管道延迟读取4MB文本，全文摘要一致、write块≤1MiB；约5.7MB PTY输出通过。断管exit1、SIGTERM exit143均清理且不冒充写完。 | [管道回执](../../../.omx/artifacts/upgrade-writer-2026-11-14/writer-receipt.json)、[生命周期](../../../.omx/artifacts/upgrade-writer-2026-11-14/writer-lifecycle.json)；该批通过tsx加载暂存源码，未冒称公开编译入口。 |
| Linux CLI PTY与真实tmux | regular／fullscreen Unicode光标／编辑／点击，图片PNG及实际read JPEG、晚到cell-size 10→20行重排、裁剪／双图／清退、浮层、首次协商／palette／粘贴／导航／退出通过。真实tmux两种client能力×两种宿主共4格超链接输出／回退通过。 | [宽度](../../../.omx/artifacts/upgrade-width-2026-11-15/native.json)、[图片](../../../.omx/artifacts/upgrade-images-2026-11-15/admission-native.json)、[tmux](../../../.omx/artifacts/upgrade-protocols-2026-11-15/tmux-native.json)；是实际PTY与协议字节测试，部分场景注入终端回复或临时输入hook；不证明物理像素／字体。 |
| 编译CLI JSONL／RPC | 选择、配置换代／新session后UI重新绑定、未答editor在EOF取消，exit0、无无效JSONL行通过。 | [回执](../../../.omx/artifacts/upgrade-rpc-2026-11-14/native.json)；synthetic provider。 |
| Linux离线Chromium | 真实session state进入编译HTML导出，100in／30out、partial未知output显示保留；0网络请求、0页面错误通过。 | [回执](../../../.omx/artifacts/upgrade-export-2026-11-14/validation.json)；D.4完整Markdown验收和真实服务账单比对未完成。 |
| 本地网络与追踪进程 | 真实loopback HTTP／TLS／CONNECT、SSE owner取消、独立Linux进程记录器拒绝不崩溃及实际rotating sink通过。 | [连接](../../../.omx/artifacts/upgrade-connections-2026-11-14/validation.json)、[追踪](../../../.omx/artifacts/upgrade-tracing-2026-11-14/validation.json)；本地服务／fixture，不是真实Azure／Mistral／OAuth服务。 |
| 暂停前当前SDK子批 | 6套件34项、六静态门、0monoliths、build通过；当前编译SDK的inline／TS文件撤权、普通abort可复用、后继reload保留及两反转通过。 | [交付回执](../../../.omx/artifacts/upgrade-sdk-2026-11-15/lifecycle-closing-delivery.json)；synthetic provider，未新增真实模型请求。 |

原生测试全部在Linux侧。未做Windows／物理终端显示、真实Azure／Mistral兼容、Anthropic原生历史control、OAuth真人同意／续期、供应商账单对照或性能收益基准。六静态门通过仍保留119条既有非阻断文档source提示；没有宣称全仓类型问题已消失。

## 文档中尚未完成的42项

“已有待验收”表示消费者存在但缺本轮完整证据；“部分”表示整项仍有明确行为或验收缺口。以下为暂停时清单状态，不能把全部未勾选项描述成完全没有代码。

| 编号 | 状态 | 尚缺任务或证据 |
| --- | --- | --- |
| C.1 | 部分 | 完整虚拟路由目标／URL／认证／transport重绑定，实际目标scope复验、迟到状态撤权及分支归属；循环准备子批已完成。 |
| C.2 | 已有待验收 | 流式message_update、x-should-retry，部分响应不重放与内外retry一致性。 |
| C.4 | 已有待验收 | 历史工具正文保留、多轮前缀和压缩测量一致性。 |
| C.5 | 已有待验收 | Anthropic缓存marker与OpenAI／Responses affinity、TTL的最终wire和能力限制。 |
| C.6 | 部分 | 历史声明已实施且配置模型测试通过；Anthropic原生历史control没有真实服务证据。 |
| C.7 | 已有待验收 | 逐轮缓存未命中、真实usage缺失与成本归因。 |
| C.8 | 已有待验收 | 核心工具／动态prompt／BM25／词干／Schema索引及search→execute失效代际。 |
| C.9 | 部分 | 普通print的stdout保护；JSON／RPC已有接入。 |
| D.1 | 已有待验收 | 其余会话／模型／树命令的真实JSONL和错误分类。 |
| D.4 | 已有待验收 | HTML高亮、GFM／CJK、Thinking、Diff、灯箱及转义安全。 |
| E.1 | 已有待验收 | 沙箱组合、多工具嵌套权限／hook／过滤，不污染中间历史。 |
| E.3 | 已有待验收 | namespace／image／models及TS声明的真实脚本调用与输出预算。 |
| E.4 | 待核实 | 确定性重放的记录、恢复及副作用边界。 |
| E.5 | 部分 | 安装产物最终验收、SDK配置发布后的UI重绑定；异步／代际基础已修。 |
| E.6 | 部分 | 扩展每个生命周期事件的dispatch与结果消费者。 |
| E.7 | 缺口 | provider／virtual model／MCP／renderer和runtime setters的生产注册、撤销／失效。 |
| E.8 | 部分 | shortcuts／flags的CLI／SDK消费者、冲突和生命周期。 |
| E.9 | 部分 | npm／git／local安装adapter和顶层CLI入口、完整性／版本／批准边界。 |
| T2.1 | 部分 | CLI参数集合、单遍解析、早期判断及完整启动矩阵。 |
| T3.1 | 部分 | compact的idle／cancel／controller归属，以及当前安装包严格类型／真实模型／复用／dispose联合验收；loader／dispose已提交。 |
| F1.1 | 部分 | 增量工具JSON的实际预览UI／事件；不能补回孤立parser。 |
| F1.2 | 已有待验收 | Azure／Mistral／Responses WebSocket真实服务、复用／取消／代理／TLS兼容。 |
| F1.3 | 缺口 | 最终准入后由传输owner消费zstd，endpoint支持与未知派发不重放。 |
| F1.4 | 部分 | 其他OAuth提供方、设备登录真人同意／实际续期。 |
| F1.5 | 已有待验收 | MCP PKCE／loopback／renewal／懒加载的OAuth fixture、撤权和tools readiness。 |
| F2.1 | 部分 | 模型分类／媒体类别、各端点预算及真实Linux输入。 |
| F2.2 | 已有待验收 | 远程目录ETag、304、内容拒绝与配置换代。 |
| F2.3 | 缺口 | 替换runtime eval式Schema compile，dialect／ref／format与严格安全准入。 |
| F2.4 | 缺口 | 单次请求阶梯计价、完整费率选择及持久化。 |
| F2.5 | 部分 | dashboard的profile／session检索来源一致性；实际追踪接线／失败隔离已修。 |
| F2.6 | 缺口 | 有界直方图、跨进程传播和真实extract消费者。 |
| T4.1 | 缺口 | 包级契约和组合方向，消除领域反向依赖。 |
| T4.2 | 缺口 | browser／desktop／media独立包边界与可选域降级。 |
| T4.3 | 缺口 | workflow／research／planning／collaboration／advisor独立编译和公开接口。 |
| T4.4 | 待核实 | config／scripts按职责收敛，保留来源／信任／门禁。 |
| T5.1 | 缺口 | 单一追加事务日志、提交／unknown契约，替代当前分步写入。 |
| T5.2 | 缺口 | 旧存储格式迁移、单一读写权威与失败恢复／回退。 |
| T5.3 | 缺口 | ContextEdit／Label追加事件与UI／RPC、签名保护和分叉可见性。 |
| T5.4 | 部分 | DAG重启安全续调度，未知副作用不重放。 |
| T6.1 | 缺口，按需 | 增量reducer／持久outbox／快照reset、重复／丢确认／背压。 |
| T6.2 | 缺口，按需 | 协作流式传输、断线续接与后继owner保护。 |
| T6.3 | 缺口，按需 | 常驻远程多路连接与文件能力，保留唯一执行边界和未知派发保护。 |

恢复工作时先核对[MASTER](MASTER.md)与当前提交，再从T3.1 compact剩余反例推进。当前已暂停，尚未开始下一批。
