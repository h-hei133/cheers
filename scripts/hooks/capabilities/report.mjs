import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const directory = path.join(root, 'docs/architecture/hooks');
const matrix = JSON.parse(fs.readFileSync(path.join(directory, 'evidence/capabilities/matrix.json')));
const identities = new Map();

function cell(value) {
  return (value === null || value === undefined ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value)).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function identity(row) {
  const fields = Object.fromEntries(['sourceSnapshot', 'profile', 'bundleDigest', 'artifactSha256'].map(key => [key, row.identity[key]]));
  const key = JSON.stringify(fields);
  if (!identities.has(key)) identities.set(key, { id: `I${identities.size + 1}`, ...fields });
  return identities.get(key).id;
}

function result(row) {
  const output = row.output;
  if (row.verdict) return `exit ${row.exitCode} / ${row.verdict.status}`;
  if (output?.decision) return [output.decision, output.reasonCode, output.proofVerdict].filter(Boolean).join('/');
  if (output?.error) return output.error;
  if (output?.result?.protocolVersion) return `negotiated ${output.result.protocolVersion}`;
  if (Array.isArray(output)) return output.filter(frame => frame.id === 2 || frame.id === 3).map(frame => JSON.parse(frame.result.content[0].text).decision).join('/');
  if (output?.targetExists !== undefined) return `targetExists=${output.targetExists}`;
  if (output?.index !== undefined) return `index=${JSON.stringify(output.index)}; ${output.result?.status}`;
  if (output?.stopDispatches !== undefined) return `Stop dispatches=${output.stopDispatches}`;
  if (output?.completed !== undefined) return `completed=${output.completed}; completed_unproven=${output.completedUnproven}; failed=${output.failed}; checks=${output.checks.length}`;
  if (output?.jobs) return `job ${output.conclusion}`;
  if (row.exitCode !== undefined && output === null) return `exit ${row.exitCode} / empty stdout`;
  return row.reason ?? 'literal frames/payload/results in evidence';
}

const lines = [
  '# J2 宿主 / 运行时 / CI 能力矩阵\n',
  `实际采集：${matrix.recordedAt}。Cheers 0.1.0，Linux x64，Node 20.3.0 与 24.15.0。\n`,
  matrix.currentSourceStatus ? `**当前身份状态：${matrix.currentSourceStatus}。需要最终源码冻结后重采。**\n` : '',
  '[执行记录](runtime-execution.md) 给出命令、真实输出、前置差异和 commit message 草稿。',
  '[完整 JSON](evidence/capabilities/matrix.json) 每格展开四个身份及全部能力字段；本表是其投影。\n',
  '`observed` 是实际执行观察，不能读作 pass/proven。`unavailable` 不算 pass/fail；',
  '`unsupported` 是已测语义/协议缺口；`unknown` 是证据/准入不足。`stale` 仅适用于记录时字节，不能用于当前实现声明。\n',
  '写门有 nodeFloor=20.3.0 的独立 pinned artifact；Stop 没有独立 Node20 artifact，运行旧 engines>=24 包。',
  'Node20/24 实测旧 judge 合规 exit0、违规 exit2、实际仓库 partial/exit0。旧 Stop 合规 stdout 空→unknown；',
  'R0a 当前只读 dist 的显式信封另绑定身份，不能替代旧发布 bundle。\n',
  'normal 由脚本 step 驱动实际注册/native write；prepared/security 测现有共用 gate；Git 用真实 git add 和索引读回。',
  '安全扫描器、真实 provider、其他宿主及跨 OS 无相应证明。\n',
  '## 逐格能力\n',
  'timeout 数字单位为 ms；180000 是探针观察期限，3000/4321 是 handler 预算。',
  '原始 JSON 另记 timeoutScope、hostVersion、inputFidelity、failureDirection、denyShape、reentry、canBlock。\n',
  '| 格 ID | 观察状态 | Node / event / tool | timeout ms | input fidelity | failure direction / deny shape | re-entry | 实际结果 | 能真正 block | 身份 | 证据 |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
];
for (const row of matrix.rows) {
  const node = row.runtime?.node ?? row.node ?? 'unavailable';
  const evidence = row.evidenceDetail ?? row.evidence;
  lines.push('| ' + [row.id, row.status + (row.recordedStatus ? ` (${row.recordedStatus})` : ''), `${node} / ${row.event} / ${row.tool}`, row.timeoutMs,
    row.inputFidelity, `${row.failureDirection}; ${row.denyShape}`, row.reentry,
    result(row), row.canBlock, identity(row), `[record](evidence/capabilities/${evidence})`].map(cell).join(' | ') + ' |');
}
lines.push('\n## 身份目录\n', '每格 I 编号仅压缩重复显示；sourceSnapshot 包含 commit 与字节摘要，CI 固定历史 commit/workflow。',
  'profile、bundle、artifact 的完整 digest 如下；hostProfile/writeRulesDigest/configurationDigest 在 JSON 另记。',
  '任一身份不匹配→stale；缺身份→unknown。\n',
  '| 身份 | source snapshot | profile | bundle digest | artifact SHA-256 |', '| --- | --- | --- | --- | --- |');
for (const binding of identities.values()) lines.push('| ' + [binding.id, binding.sourceSnapshot, binding.profile, binding.bundleDigest, binding.artifactSha256].map(cell).join(' | ') + ' |');
lines.push('\n## unavailable 清单与原因\n', '| 格 | 原因 |', '| --- | --- |');
for (const row of matrix.rows.filter(row => row.status === 'unavailable' || row.availability === 'unavailable' || row.recordedStatus === 'unavailable')) lines.push(`| ${cell(row.id)} | ${cell(row.reason)} |`);
lines.push('\n这些格停止相应发布声明。watch 的绿色不补足 authority，本地脚本/合成探针不补足平台或模型自愿调用。\n');
fs.writeFileSync(path.join(directory, 'runtime-matrix.md'), lines.join('\n'));
console.log(JSON.stringify({ rows: matrix.rows.length, identities: identities.size, report: 'docs/architecture/hooks/runtime-matrix.md' }));
