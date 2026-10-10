# 固定评测迭代

`/improve` 冻结一份评测清单，在保留的独立目录中迭代候选，并在最终复评后单独批准文件合入。普通主模型可以使用同源 `improve_patch`、`improve_check` 和 `improve_status` 工具完成多轮修改与评估；已有 goal/loop 的请求账目与限制继续生效。评分不会自行完成 goal，也不会触发下一次模型请求。

```text
/improve start evaluation.json
/improve status
/improve patch candidate.patch
/improve check
/improve publish
/improve stop
```

启动依次批准隔离目录初始化和基线执行。每次评分需要原生命令批准；候选补丁需要文件批准；`publish` 先重新运行全部固定样本，再展示完整文件变更、批准写入。批准评分不包含合入授权。`stop` 或 Escape 撤销当前权限，停止精确进程并保留候选与历史；运行中停止须等原生清理结束后再次 `stop`。重启可以检查、显式保留旧记录，但不能接管或重放已分派的评估。

清单示例：

```json
{
  "version": 1,
  "runtime": "node",
  "entry": "grade.mjs",
  "candidateEntry": "run.mjs",
  "evaluator": ["grade.mjs"],
  "editable": ["prompt.txt"],
  "context": ["run.mjs"],
  "target": { "name": "quality", "direction": "higher", "threshold": 0.1 },
  "guardrails": [{ "name": "errors", "direction": "lower", "threshold": 0 }],
  "samples": [
    { "id": "train1", "split": "train", "input": "a", "expected": "A" },
    { "id": "train2", "split": "train", "input": "b", "expected": "B" },
    { "id": "hold1", "split": "holdout", "input": "c", "expected": "C" },
    { "id": "hold2", "split": "holdout", "input": "d", "expected": "D" }
  ],
  "repetitions": 1,
  "maxRounds": 8,
  "timeoutMs": 3000
}
```

所有路径相对于会话项目根，必须是现存 UTF-8 普通文件，且无链接、重叠或额外路径。清单、样本、原文件、评分器、上下文与解释器身份在批准前冻结。初始文件复制分别形成 baseline、candidate、evaluator；候选只能更新 `editable` 中的现存文件。源文件或固定资产变化需要建立新基线。

候选进程从标准输入接收一行 `{ "id": "...", "input": ... }`，通过 `EVAL_CANDIDATE_ROOT` 找到其只读文件，并向标准输出返回任务结果。评分器在独立进程接收 `{ "id": "...", "input": ..., "expected": ..., "actual": "候选输出文本" }`；标准输出必须是且只能是 `{ "metrics": { ... } }`，包含全部声明指标的有限数值。评分器负责独立判断任务结果，不应把候选自报的分数视作质量证据。

两个进程分别只读绑定各自文件树与解释器文件，使用独立 PID、网络和临时目录命名空间，移除继承的 provider 环境。候选不接收预期答案，也看不到评分器与会话记录。源项目与会话目录必须避开隔离器暴露的系统目录（含真实路径别名），也不能包含解释器文件，启动和每轮执行前均检查。模型状态工具只提供训练输入和指标汇总；不发布保留集输入、答案、逐项原始输出或失败正文。

每个样本及每次重复均需实际成功的候选执行和评分收据，失败、缺项、取消或清理未知没有可比较 verdict。逐样本配对差异在训练集、保留集分别取均值，两者均达到 target 阈值且每个 guardrail 均未超出退化阈值才记为 `improved`。这是固定样本和声明指标的证据；有限保留集与有界重复评分不能证明普遍质量或绝对杜绝过拟合。主模型仍有普通项目读取权限，用户编写的原清单和评分器不构成对整个代理保密的保留集；汇总反馈也允许适应性过拟合。

最终写入复用现有精确补丁规划、操作快照、收据与受保护补偿。写入前再次检查源身份、原始内容、模式、候选摘要、最新复评及会话批准。每个实际文件写入及最终状态发布均检查当前会话权限、取消与候选摘要；中途撤销停止后续写入，补偿受同一权限约束。失败会报告 unchanged/restored/partial/unknown 等实际操作结果；状态或收据发布不确定时保留候选和来源证据，阻止继续执行。

边界：当前执行支持 Linux 且要求可用 `bwrap` 和显式安装的 Node 或 Bun 解释器，隔离不可用时拒绝发送；Node 20.3 是已验证的解释器，Bun 与其他平台不从该证据推断通过。输入清单上限 64 KiB、每文件 1 MiB、文件总量 8 MiB、最多 32 样本、每样本 1–3 次重复、3–16 轮（含基线及最终复评），每进程最多 10 秒、每轮 60 秒。会话保留最多 8 次工作流，状态上限 16 MiB。原始输出总量有界且不持久展示；无默认网络、安装、上传或自动清理候选。

实现 owner：[eval/workflow](../../packages/ts-shell/src/eval/workflow/)、[CLI composition](../../packages/ts-shell/src/cli/evaluation/)。评分和修改复用统一执行与编辑接口，没有第二套模型循环、调度器或写入系统。
