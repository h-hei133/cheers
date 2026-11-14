---
title: "运行时升级复核与修复证据（2026-11-14）"
category: reference
created: 2026-11-14
updated: 2026-11-14
tags: [runtime, review, tools, extensions, providers, verification]
summary: "核对最近运行时升级的生产消费者、修复实际断链，并区分本地行为证据、尚未接通的能力和未测量的收益。"
confidence: high
---

# 运行时升级复核与修复证据

最近提交包含有效改进，也包含只有声明或自测、没有生产消费者的部分，不能把提交标题当作能力完成证明。此次修复已经打通扩展 UI、SDK、传输、图片限制、导出计量和追踪的多处断链；没有取得真实模型任务质量、账单降低、跨平台或全路线图完成的证据。

审计输入为 2026-11-13 的三份研究文档和 `3366a43c..acb617cb` 的实际源码。文档描述的是当时版本，其缺失清单不能直接当作当前状态。对照工作先看目标实现，再只读比较参考实现的相关消费者和生命周期决策。以下路径均相对 `packages/ts-shell/src/`；测试结果为本地证据，不等同于远端 CI。

本文保留第一轮工作区审计的证据快照。后续规划执行和分批提交以[当前任务清单](../../refactor/upgrade/MASTER.md)为准：工具链、调色板应用、RPC转换后UI重绑定、终端录制过滤等已取得新的本地证据；下文“未提交”和缺口描述只表示首轮审计时点，不能替代当前逐项状态。提交不等于推送、CI或整条规划完成。

## 已确认的缺陷与修复

| 近期提交／能力 | 原来存在的问题 | 当前实现及可观察行为 |
| --- | --- | --- |
| `5d310f21`、`b259f64d` 工具输出 | 批次返回时才限长，事件、状态和后续模型上下文收到不同内容；长输出的 artifact 提示可被第二次裁切丢弃 | `core/agent/tools.ts` 在创建消息时统一应用 50 KiB／2,000 行预算；工具明确保留 `outputNotice`，成功与失败 bash 结果都可定位实际保存的完整输出 |
| `b259f64d` 前台输出落盘 | 结束后才截断和保存，完整 stdout／stderr 已先积累在内存；未使用的 callback 不能限制进程捕获 | `core/tools/shell/foreground.ts` 在 spawn 前绑定共享输出 sink，关闭 native 完整捕获；每个流最多保留 100 KiB 尾部，原有执行结果分类读取有界快照；`ArtifactManager` 以固定 64 KiB 块写入、校验并发布完整文本 |
| 进程退出与后台移交 | Node 的退出 flush 会恢复已暂停管道；直接拒绝下一块导致成功命令被误判输出失败；kill 派发不等于管道结算 | `runtime/execution/stream.ts` 每个管道最多接纳一块迟到数据并串行排空；同一 capture 随原 PID 提升／拒绝交给 job owner，取消和封口失败保留不完整／unknown |
| `b259f64d` 搜索与行宽 | 相邻匹配可能继续显示为 context；字符截断可误算 Unicode | `core/tools/grep.ts` 原位把已输出的 context 行提升为匹配；统一字节和显示宽度边界；真实 native/fallback 路径有对照测试 |
| `de8ecd7b` 循环续轮 | `finishTurn` 的纯上下文续轮可一直占据内层循环，饿死已排队 follow-up | `core/agent/loop.ts` 保持 steering 优先，消费 follow-up，再允许人工续轮；有限终止夹具可反转验证 |
| `6cfb6ce3`、`c637f78b` 异步扩展 | 异步 factory 未完成就发布；旧闭包可指向替换后的宿主，迟到 reload 可覆盖新资源 | `extensions/runtime/initialization.ts` 与 `sdk/resourceLoader.ts` 等待并隔离初始化代际；撤销后拒绝迟到注册，真实资源加载器共享会话宿主 |
| `6cfb6ce3` 扩展交互 | `ui.*` 声明没有实际可用界面；regular 模式接收按键却看不见对话框；短终端裁掉选择和光标 | `cli/interactive/extensions/` 复用浮层与编辑器，绑定真实输入就绪时刻，使用实际行预算，保护 composer，状态与 widget 接入现有 chrome |
| 扩展交互生命周期 | 会话／配置替换后仍可接受旧答案；进程外替换 profile 存储时没有 abort 事件，定制宿主仍返回确认成功；等待 drainage 时未答对话框不结算；累计输入和 widget 无总量上限 | 宿主捕获会话／工作区／配置身份，打开和接收答案时均检查同一 owner，不重新获取后继界面；拒绝后撤销并返回取消值。显式切换后重绑定，停止前先撤销 UI；数量、UTF-8 字节和累计编辑输入设限 |
| `b669b1c9` RPC UI | EOF 等待仍被对话框阻塞的命令；dispose 后仍可能发出请求 | `cli/runtime/inputStream.ts` 在退出和 EOF drainage 前撤销绑定；`cli/rpc/uiBridge.ts` 永久关闭后取消排队请求，忽略迟到答案 |
| `c637f78b` SDK | 无 UI 绑定入口，普通取消可能永久关闭宿主，dispose 可等待未答 hook 对话框 | `sdk/agentSession.ts` 通过同一宿主绑定 UI；abort 取消当前对话框但允许后续调用，dispose 先撤销宿主再等待运行结束 |
| `830e6d5d` 超链接能力 | 检测结果没有进入 Markdown，显式关闭后仍输出 OSC 8；缓存未区分能力 | `interactiveMode.ts` 捕获一次能力，传入 transcript、source、测量和 reader；两处布局缓存纳入该值；不支持时保留安全标签与 URL |
| `d48ff061` 连接与传输 | WebSocket 未完整复用生产代理、TLS 和超时策略；缓存没有独立调用方寿命，空闲清理依赖下次请求 | `provider/request/connection.ts`、`cli/provider/connections.ts` 和 `provider/endpoints/responses/` 捕获连接策略与资源 owner；取消、空闲到期、重置只关闭对应连接，接受响应后不静默回放请求 |
| `d48ff061` Azure／Mistral | Azure 官方 v1、显式 preview 与代理 URL 混合；Mistral 目录未选实际 endpoint、工具 ID 和继承选项不符合接口 | endpoint owner 处理 URL 分支；Mistral 使用稳定的九字符工具 ID、安全 affinity 和实际支持的参数 |
| `d48ff061` 设备登录 | helper 没有生产调用方，设备授权结果未进入原生 token exchange 与 renewal enrollment | 显式 `--account --device-code` 和登录 chooser 接入同一私有兑换／持久化 owner；浏览器仍为默认；全过程 deadline、每请求上限、取消和 pending connection 身份均保留 |
| `acb617cb` 图片限制 | 目录里的限额没有约束最终外发；普通请求和压缩请求不一致 | `provider/request/input.ts` 捕获限额，复用媒体执行 owner 做实际缩放，再按最终 UTF-8 body 和协议消息计数准入；前台、简单请求、压缩和刷新请求共用边界 |
| `acb617cb` 凭据转换 | 新平面 codec 没有消费者，与既有 canonical account normalizer 重复 | 删除未使用 codec；有效 extras、原型污染拒绝、深度限制和真实持久化解析覆盖迁至 `config/account.test.ts` |
| `b669b1c9` HTML 统计 | 假定 usage 在 transcript message 上，或拿 prompt 测量推导 output／费用，制造不存在的计量 | `session/export/accounting.ts` 只读身份匹配的持久 state；账单总量、请求账本覆盖率和价格来源分开；缺失保持 unavailable／partial，捕获 transcript 不借用实时账本 |
| `acb617cb` 追踪 | 类型和内存 store 不等于真实运行接入；记录器失败／挂起可取代或阻塞产品结果 | `observability/tracing/` 通过异步作用域连接实际 session、请求和工具；普通 rotating log owner 持久化有界记录；调用只执行一次，记录失败不改变其值／原始错误 |
| 流式参数预览 | 运行时计算无人消费的部分 JSON 快照，helper 的最终修复语义还与严格准入矛盾 | 完成流只保存原始参数字节；删除未导出且无消费者的预览／修复模块和 helper 自测；实际 SSE 拼装与整个畸形工具批次拒绝测试保留 |

## 复用与边界选择

- 参考实现的设备登录也在展示说明之后轮询，再复用正常授权码兑换。这里遵循这个顺序，同时保留现有私有 proof 和捕获式持久化；没有新增一套 credential schema。
- 参考终端按能力发超链接并缓存终端探测结果。这里把能力穿过现有 transcript 与 reader owner，并在缓存键上区分它，没有新增全局渲染开关。
- 参考流式 JSON parser 有实际工具预览消费者。当前产品没有对应消费者，因此删除无用预览支线，严格最终准入保持不变；不把 parser 单测称作已提供预览。
- 生命周期修改保持原有命令、权限、执行、会话和日志 owner。RPC 与 SDK 复用同一扩展宿主，记录器只观察运行结果，不能取得执行或完成权。
- `OutputAccumulator` 的无人使用 `onOverflowSpill` 回调已删除。现有作业输出 sink 移到执行 owner，旧路径薄 re-export；manager 保留最多 16 个 staging／publication／cleanup owner，失败时两秒有界重试并阻止新的写入；显示仍复用原来的行／字节截断器。前台在 spawn 前消费原始管道，生产 artifact 复用原有 descriptor-anchored 发布事务，没有用作业 spill 路径伪造 `artifact://`。
- 参考命令在输出回调中积累、关闭后再报告完整路径。这里保留这个消费者顺序，同时保留本项目成功读取 stdout、失败读取 stderr 后接 stdout 的既有结果语义，增加原生管道背压与验证发布。参考实现的联合输出不能直接替换现有错误分类和 receipt。
- 输出归档保留完整解码文本，UTF-8 解码再编码不保证任意原始二进制字节保持不变，因此提示明确使用 `Full text output saved`。Linux 的 descriptor、内容和最终身份校验不推广到 portable 分支；后者不返回 `publication: 'verified'`。

## 验证证据

以下批次存在重叠，不相加成唯一测试数。首次失败及其分类保留，后续通过不改写首次结果。

| 验证 | 实际结果 | 能证明的范围 |
| --- | --- | --- |
| 工具、图片、导出、追踪和请求消费者 | 28 suites／585 tests 通过 | 对应本地工具／请求／存储边界；不证明真实模型收益 |
| 交互、扩展、RPC、SDK、超链接和追踪失败隔离 | 25 suites／705 tests 通过，含 409 项 InteractiveMode 和 10 项真实 JSONL 消费者测试 | 真实 owner 组合、输入取消、EOF／dispose、能力传递和安全降级 |
| 登录、连接和 endpoint 消费者 | 19 suites 首次 428 通过／3 失败；账户夹具修正后 19 项通过，追踪类型标注修正后 4 项通过 | 首次失败来自原型键被持久化解析器拒绝，及 Google fixture 缺作用域／quotaProject；没有放松生产准入 |
| CLI、扩展安装注册、codemode、各 endpoint、turn／compaction | 22 suites／640 tests 通过 | 相邻生产消费者；不等同全仓 suite |
| 删除预览模块、CLI 测试改名后 | 4 suites／125 tests 通过 | 实际完成流、CLI 参数、选择和 RPC 行为保持 |
| 删除未消费的溢出 callback 后 | 4 suites／69 tests 通过 | 已有工具输出、bash artifact 与 turn 消费者保持 |
| 前台流式捕获、artifact 与后台结算 | 修复前原生命令 2 项失败；首次整合 128 通过／4 失败，修复退出 flush、清理重试及第三参数 fixture 后 16 suites／138 tests 通过 | 真正原生 stdout／stderr 超限仍保留完整 artifact；capture 与 receipt 有界；存储失败、取消、权限错误分类、同 PID 提升和固定大小读写均有覆盖；随后清理 owner 与后台 unknown 加固后，16 suites／136 tests 通过（该批少一个 10 项 behavior suite，新增 8 项，不累加） |
| 外部 owner 撤销与最终 UI／输出回归 | 首次 fixture 错用 profile 配置、尚未打开对话框，记为设置失败；修正 fixture 后真实反例为 `true` 而非取消值 `false`。修复后 9 suites／58 tests 通过 | 同时覆盖 profile 未变的正常答复、四种对话框的撤销、仅获取一次原宿主，以及 SDK／RPC／真实 JSONL／终端 UI 消费者；五项静态门同次通过 |
| 反转续轮优先级和超链接能力分支 | 52 项中 6 失败／46 通过；恢复原始字节后 52 通过 | 这些测试能识别被修复的旧决策；没有超时或强杀充当失败 |
| 反转退出 flush 的有界排队 | 8 项中 5 失败／3 通过；逐字节恢复后 8 通过 | 包括两项真实超限进程；无超时或强杀充当反转证据 |
| 静态门 | import cycles、config consumers、declarations、Node floor、strict docs drift 全通过 | docs drift 仍有 119 项不阻断的原有 source 提示 |
| 脚本检查 | 201 通过 | 检测器与构建发布契约自身的回归 |
| 测试类型比较 | 最终 60 个变更测试；HEAD 1,473 项诊断，工作区 1,447 项；选中测试诊断 100 → 74，新引入为 0 | 完整测试程序仍有既有类型问题；不能宣称全仓 typecheck 通过 |
| 生产 build | `fd5bd5060f3e06d52b3fe55698c0c989a5e2bc7c70290ca261d0982e3c6c8bcc` 通过 | 最后 UI 准入和提示修复后的 TypeScript 生产编译与发布输入绑定；Node 24.15.0 |
| 仓库固定结构判定器 | cycles、unresolved-specifier satisfied；整体 partial | `interactiveMode.test.ts` 21 个命名声明超过 20；非阻断项不能当作 clean verdict |
| 构建产物 RPC／SDK | 同一 `fd5bd5060f3e` build 实际 CLI 子进程选择答复成功；未答 editor 在 EOF／exit 时取消，均 exit 0；SDK 普通取消后 prompt 和 UI 可复用，dispose 取消未答 input | 独立 Git 工作区、隔离 HOME、synthetic provider；不是单一 helper 测试 |
| Linux PTY | 同一 `fd5bd5060f3e` build 的 regular／fullscreen 真实 CLI 均完成选择、编辑取消和 exit 0 | 使用实际启动提示同步；不是物理终端或其他操作系统验证 |
| 编译产物大输出 | 同一 build 一次 native bash 输出 8,388,608 字节；服务结果保留 102,400 字节，消息 50,384 字节；完整 artifact SHA-256 一致，清理 complete | 1,841 ms 单次样本，进程 max RSS 203,912 KiB；上一 build 样本为 1,859 ms／199,360 KiB，两次不同 build 探针不构成重复基准，不能宣传性能／内存收益比例 |

## 仍然缺失或没有证明的部分

| 能力 | 当前边界 |
| --- | --- |
| 全进程峰值内存和吞吐量测量 | 普通前台输出 capture、发布和校验已改为有界缓冲；尚未取得整进程长时 RSS／吞吐基线，不能由局部缓冲界限推导所有观察者或任意注入 adapter 的总内存界限。后台 journal 保留原先有界前缀与 partial 语义 |
| 完整终端调色板应用 | OSC 10／11／4 查询／解析 API 和终端输入隔离存在，OSC 11 背景已进入 appearance；没有把全调色板应用到产品主题的消费者 |
| 工具参数逐片段预览 | 原始字节拼装和严格最终校验有效；没有参数预览 UI／事件消费者 |
| 真实服务兼容性 | 未进行真实 Azure／Mistral 请求、设备登录人工同意／续期、多平台图片处理；HTTP／TLS／WebSocket 本地实测不代替这些证据 |
| 性能、成本与任务质量收益 | 没有同任务基线、重复样本、真实账单或任务成功率对照；不能从源码减少或 tests 通过推导量化收益 |
| 多模态范围 | 当前输入是 text／image；原生缩放需要 Linux 上的 ffprobe／ffmpeg，HEIC／HEIF 缩放没有支持；不宣称音频／视频输入 |
| 工具链、拆包、存储格式、远端常驻服务及桌面形态 | 原路线图明确要求独立推进的事项，当前最近运行时修复没有完成它们；不能标记整条路线图完成 |
| 外部追踪生态 | 已有内部 Span／Event／Link、检索、上下文及持久化消费者；没有据此宣称完成第三方收集器、直方图或所有跨进程链路 |
| 提交、推送、CI | 本文记录工作区与本地验证，未提交、未推送、未获得这批修复的远端 CI 结果 |

## 独立复审结论

- 代码复审最初检查 10 个生产模块和必要调用方，提出一项 Medium：定制 UI 的迟到成功没有检查外部 owner 撤销。真实反例和修复后，复审检查 2 个生产文件及 2 个回归夹具，给出该修复范围内的 `APPROVE`；未发现该范围内剩余问题。
- 架构复审跟踪前台捕获、背压、发布／后台移交和清理，未发现 BLOCK；最初的提示措辞 WATCH 修正后，该范围为 `CLEAR`，保留 portable 发布校验较弱的限制。
- 两条复审均只读，没有运行验证；测试、构建和原生探针是主执行者的命令证据。未返回报告的其他委派不计为批准。这是有边界的独立复审，不是约 200 个变更文件的穷尽审查或全仓 merge-ready 声明。

此次审计记录了当时确认的断链修复及能力／证据缺口，未证明所有规划任务完成。后续分批复审又发现并修复了在途扩展重载、RPC配置转换与录制过滤问题；当前进展及提交边界见任务清单，保留本节原始验证与失败记录。
