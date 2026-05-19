import path from 'node:path'

function withRoute135CaseFields(capabilityCase) {
  return {
    ...capabilityCase,
    title: capabilityCase.title ?? titleFromId(capabilityCase.id),
    capabilityArea: capabilityCase.capabilityArea ?? capabilityAreaForCase(capabilityCase),
    command: capabilityCase.command ?? capabilityCase.execution ?? capabilityCase.manualFlag ?? 'descriptor-only',
    expectedOutcome: capabilityCase.expectedOutcome ??
      capabilityCase.currentSupportedCapability ??
      capabilityCase.expectedCapability,
    requiredEnvironment: capabilityCase.requiredEnvironment ?? requiredEnvironmentForCase(capabilityCase),
    lifecycleTags: capabilityCase.lifecycleTags ?? lifecycleTagsForCase(capabilityCase),
    skipUnavailableBehavior: capabilityCase.skipUnavailableBehavior ?? capabilityCase.reasonForTier,
  }
}

function titleFromId(id) {
  return String(id ?? 'unnamed-case')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function capabilityAreaForCase(capabilityCase) {
  const haystack = [
    capabilityCase.id,
    capabilityCase.execution,
    capabilityCase.expectedCapability,
    capabilityCase.currentSupportedCapability,
    capabilityCase.reasonForTier,
  ].join(' ').toLowerCase()
  if (haystack.includes('browser')) return 'browser'
  if (haystack.includes('continue') || haystack.includes('compact') || haystack.includes('session')) {
    return 'session/continue'
  }
  if (haystack.includes('provider') || capabilityCase.provider === 'real') return 'provider/model'
  if (haystack.includes('permission') || haystack.includes('protected') || haystack.includes('locked')) {
    return 'permission/policy'
  }
  if (haystack.includes('terminal') || haystack.includes('result surface')) return 'result surface'
  if (haystack.includes('cli')) return 'CLI/UX'
  if (haystack.includes('patch') || haystack.includes('workspace') || haystack.includes('write')) {
    return 'edit/patch'
  }
  return 'harness'
}

function requiredEnvironmentForCase(capabilityCase) {
  if (capabilityCase.executable === false) return 'descriptor-only'
  if (capabilityCase.requiresRealProvider || capabilityCase.provider === 'real') return 'real-provider-opt-in'
  return 'isolated-synthetic-test-root'
}

function lifecycleTagsForCase(capabilityCase) {
  const tags = new Set(['availability', 'result'])
  if (capabilityCase.executable !== false) tags.add('execution')
  if (capabilityCase.requiresRealProvider || capabilityCase.provider === 'real') tags.add('redaction')
  const haystack = [
    capabilityCase.id,
    capabilityCase.execution,
    capabilityCase.expectedCapability,
    capabilityCase.currentSupportedCapability,
    capabilityCase.reasonForTier,
  ].join(' ').toLowerCase()
  if (haystack.includes('planning') || haystack.includes('no-write')) tags.add('planning')
  if (haystack.includes('permission') || haystack.includes('protected') || haystack.includes('workspace')) {
    tags.add('policy')
  }
  if (haystack.includes('verification') || haystack.includes('evidence')) tags.add('evidence')
  if (haystack.includes('cleanup') || haystack.includes('residue')) tags.add('cleanup')
  return [...tags]
}

export function createVerifierCaseDefinitions({
  testRoot,
  runId,
  realSingleFileUpdateCaseId,
  realSingleFileCreateCaseId,
  realTwoFileUpdateCaseId,
} = {}) {
  const futureGateCandidates = [
    {
      id: 'real-small-project-smoke',
      status: 'candidate-not-run',
      provider: 'real',
      projectShape: {
        requiredFiles: ['src/utils.js', 'src/app.js', 'README.md', 'project.json', 'LOCKED.md'],
        roles: {
          code: ['src/utils.js', 'src/app.js'],
          docs: ['README.md'],
          configLike: ['project.json'],
          protected: ['project.json', 'LOCKED.md'],
        },
      },
      contract: [
        'turn1 multi-file sync: greet -> welcome across src/utils.js, src/app.js, README.md',
        'turn1 protected unchanged: project.json and LOCKED.md',
        'turn1 low-risk contains/unchanged verification passed',
        'turn2 README-only correction changes README.md only',
        'turn2 protected unchanged: src/utils.js, src/app.js, project.json, LOCKED.md',
        'turn2 README contains welcome() and welcome("Ada")',
        'turn2 low-risk contains/unchanged verification passed',
      ],
      requiredReportFields: [
        'capability',
        'projectDir',
        'sessionId',
        'changedFiles',
        'protectedFiles',
        'verification',
        'failureCategory',
        'failureReason',
        'reportPath',
      ],
      promotionCriteria: [
        'real-provider path remains stable for repeated manual runs',
        'failure categories stay actionable without parsing output tails',
        'runtime remains low enough for explicit real release gate',
        'no new verification type or provider/auth behavior is required',
      ],
      releaseRealDecision: 'deferred: keep out of verify:release:real until the candidate has repeated stability evidence',
    },
    {
      id: 'real-completed-continue-followup-verify',
      status: 'candidate-not-run',
      provider: 'real',
      projectShape: {
        requiredFiles: ['math.js', 'README.md', 'LOCKED.md'],
        roles: {
          code: ['math.js'],
          docs: ['README.md'],
          protected: ['README.md', 'LOCKED.md'],
        },
      },
      contract: [
        'turn1 completed session: exact math.js replacement and verification passed',
        'turn2 bare /continue <follow-up> stays on the same session id',
        'turn2 changed files remain limited to math.js',
        'turn2 transcript/output exposes changed files and verification evidence',
        'protected unchanged: README.md and LOCKED.md',
      ],
      requiredReportFields: [
        'capability',
        'projectDir',
        'sessionId',
        'turns[].sessionId',
        'turns[].mode',
        'turns[].changedFiles',
        'turns[].transcriptEvidence',
        'verification',
        'failureCategory',
        'failureReason',
      ],
      promotionCriteria: [
        'same-session /continue behavior passes repeatedly under real provider',
        'provider/network failures remain distinguishable from product failures',
        'transcript evidence stays stable without parsing long output tails',
      ],
      releaseRealDecision: 'deferred: keep out of default verify-real-user-capabilities until repeated real-provider stability is observed',
    },
  ]

  const scenarios = [
    {
      id: 'synthetic-selected-workspace-single-file-update',
      tier: 'mvp',
      provider: 'synthetic',
      execution: 'apply-patch-workspace-write-cli',
      expectedCapability: 'existing-file single-file selected-workspace update only',
      currentSupportedCapability: 'explicit apply_patch workspace write entrypoint for exactly one update operation',
      reasonForTier: 'MVP dogfood mutation boundary: update one existing file in the selected workspace with explicit approval and post-write verification.',
      drivesApplyPatchExpansion: false,
      requiresRealProvider: false,
      expectedToPassCurrentMvp: true,
      projectDir: path.join(testRoot, `pca-capability-gate-mvp-workspace-update-${runId}`),
      files: {
        'src/app.ts': 'old\n',
        'LOCKED.md': 'locked\n',
      },
      protectedFiles: ['LOCKED.md'],
      patchText: [
        '*** Begin Patch',
        '*** Update File: src/app.ts',
        '@@',
        '-old',
        '+new',
        '*** End Patch',
      ].join('\n'),
      expectChanged: ['src/app.ts'],
      expectContains: {
        'src/app.ts': ['new'],
      },
    },
    {
      id: 'synthetic-selected-workspace-single-file-create',
      tier: 'candidate',
      provider: 'synthetic',
      execution: 'apply-patch-workspace-write-cli',
      expectedCapability: 'selected-workspace single-file Add File create under explicit runtime/write approval',
      currentSupportedCapability: 'narrow synthetic candidate route for exactly one Add File with exclusive create and post-write readback verification',
      reasonForTier: 'Candidate because it creates one new file only through the explicit selected-workspace write route; it must not run in the default MVP update-only gate.',
      drivesApplyPatchExpansion: false,
      requiresRealProvider: false,
      expectedToPassCurrentMvp: false,
      projectDir: path.join(testRoot, `pca-capability-gate-candidate-create-${runId}`),
      files: {
        'src/.keep': 'parent exists\n',
        'LOCKED.md': 'locked\n',
      },
      protectedFiles: ['LOCKED.md'],
      patchText: [
        '*** Begin Patch',
        '*** Add File: src/new-note.txt',
        '+hello capability gate',
        '+created by synthetic smoke',
        '*** End Patch',
      ].join('\n'),
      expectChanged: ['src/new-note.txt'],
      expectContains: {
        'src/new-note.txt': ['hello capability gate', 'created by synthetic smoke'],
      },
      expectExactContent: {
        'src/new-note.txt': 'hello capability gate\ncreated by synthetic smoke',
      },
      expectOutputContains: [
        'apply_patch workspace create succeeded',
        'Changed: src/new-note.txt',
        'Verified: post-write content matched approved Add File patch',
      ],
    },
    {
      id: 'synthetic-selected-workspace-multi-file-update-planning',
      tier: 'candidate',
      provider: 'synthetic',
      execution: 'apply-patch-multi-file-update-planning-dry-run',
      expectedCapability: 'selected-workspace exactly two-file Update File planning/preflight no-write smoke',
      currentSupportedCapability: 'candidate write route exists separately; this executable smoke remains no-write planning/preflight only',
      reasonForTier: 'Candidate because exactly two existing-file Update File patches can be planned and preflighted without writer reachability, changedFiles, or writeIntents in this smoke.',
      drivesApplyPatchExpansion: false,
      requiresRealProvider: false,
      expectedToPassCurrentMvp: false,
      projectDir: path.join(testRoot, `pca-capability-gate-candidate-multifile-planning-${runId}`),
      files: {
        'src/a.ts': 'a\n',
        'src/b.ts': 'b\n',
        'LOCKED.md': 'locked\n',
      },
      protectedFiles: ['LOCKED.md'],
      patchText: [
        '*** Begin Patch',
        '*** Update File: src/a.ts',
        '@@',
        '-a',
        '+aa',
        '*** Update File: src/b.ts',
        '@@',
        '-b',
        '+bb',
        '*** End Patch',
      ].join('\n'),
      expectChanged: [],
      expectWouldChange: ['src/a.ts', 'src/b.ts'],
      expectOutputContains: [
        'multi-file-update-candidate-no-write',
        'multi-file write not enabled',
        'changedFiles=',
        'writeIntents=',
        'wouldChangeFiles=src/a.ts,src/b.ts',
      ],
    },
    {
      id: 'synthetic-selected-workspace-two-file-update',
      tier: 'candidate',
      provider: 'synthetic',
      execution: 'apply-patch-workspace-write-cli',
      expectedCapability: 'selected-workspace exactly two-file Update File write through explicit workspace-write route',
      currentSupportedCapability: 'candidate write route for exactly two existing-file Update File operations with sequential writes and per-file readback verification',
      reasonForTier: 'Candidate because it writes two existing selected-workspace files only through explicit approval; it is not part of the default MVP single-file update gate.',
      drivesApplyPatchExpansion: false,
      requiresRealProvider: false,
      expectedToPassCurrentMvp: false,
      projectDir: path.join(testRoot, `pca-capability-gate-candidate-two-file-update-${runId}`),
      files: {
        'src/a.ts': 'a\n',
        'src/b.ts': 'b\n',
        'LOCKED.md': 'locked\n',
      },
      protectedFiles: ['LOCKED.md'],
      patchText: [
        '*** Begin Patch',
        '*** Update File: src/a.ts',
        '@@',
        '-a',
        '+aa',
        '*** Update File: src/b.ts',
        '@@',
        '-b',
        '+bb',
        '*** End Patch',
      ].join('\n'),
      expectChanged: ['src/a.ts', 'src/b.ts'],
      expectContains: {
        'src/a.ts': ['aa'],
        'src/b.ts': ['bb'],
      },
      expectExactContent: {
        'src/a.ts': 'aa\n',
        'src/b.ts': 'bb\n',
      },
      expectOutputContains: [
        'apply_patch multi-file workspace write succeeded',
        'Changed: src/a.ts, src/b.ts',
        'Verified: each written file matched the approved Update File content',
        'Rollback: not attempted',
      ],
      expectOutputNotContains: [
        'atomic rollback',
        'rollback succeeded',
        'apply_patch multi-file workspace write stopped before success',
        'Failed: src/',
      ],
    },
    {
      id: 'synthetic-selected-workspace-two-file-update-partial-failure',
      tier: 'candidate',
      provider: 'synthetic',
      execution: 'apply-patch-workspace-write-cli',
      expectedCapability: 'selected-workspace exactly two-file Update File partial failure surface',
      currentSupportedCapability: 'candidate write route stops truthfully when the second sequential write fails after the first file is verified',
      reasonForTier: 'Candidate because it intentionally exercises partial failure in the exactly-two-file write route; it is not a mutation success case and must not enter the default MVP gate.',
      drivesApplyPatchExpansion: false,
      requiresRealProvider: false,
      expectedToPassCurrentMvp: false,
      projectDir: path.join(testRoot, `pca-capability-gate-candidate-two-file-partial-${runId}`),
      files: {
        'src/a.ts': 'a\n',
        'src/b.ts': 'b\n',
        'LOCKED.md': 'locked\n',
      },
      protectedFiles: ['LOCKED.md'],
      readOnlyBeforeRun: ['src/b.ts'],
      patchText: [
        '*** Begin Patch',
        '*** Update File: src/a.ts',
        '@@',
        '-a',
        '+aa',
        '*** Update File: src/b.ts',
        '@@',
        '-b',
        '+bb',
        '*** End Patch',
      ].join('\n'),
      expectTerminal: 'stopped',
      expectWriteEffect: 'unknown',
      expectChanged: ['src/a.ts'],
      expectFailedFiles: ['src/b.ts'],
      expectUnchanged: ['src/b.ts'],
      expectContains: {
        'src/a.ts': ['aa'],
        'src/b.ts': ['b'],
      },
      expectExactContent: {
        'src/a.ts': 'aa\n',
        'src/b.ts': 'b\n',
      },
      expectOutputContains: [
        'Outcome: stopped',
        'BlockerKind: partial-mutation-failed',
        'Changed files: src/a.ts',
        'Failed files: src/b.ts',
        'Inspect/re-read both attempted files before retrying',
        'no rollback was attempted',
      ],
      expectOutputNotContains: [
        'Outcome: success',
        'apply_patch multi-file workspace write succeeded',
        'atomic rollback',
        'rollback succeeded',
        'Changed files: src/a.ts, src/b.ts',
      ],
    },
    {
      id: 'synthetic-mutation-continuity-after-compact',
      tier: 'candidate',
      provider: 'synthetic',
      execution: 'mutation-continuity-compact-test',
      expectedCapability: 'candidate mutation session persistence and compact-equivalent follow-up continuity',
      currentSupportedCapability: 'synthetic compact-equivalent continuity evidence for candidate mutation success and partial failure state',
      reasonForTier: 'Candidate because it proves closed mutation routes keep changedFiles, failedFiles, stopped reason, and partial failure state through session persistence and compact-equivalent reload without changing the default MVP gate.',
      drivesApplyPatchExpansion: false,
      requiresRealProvider: false,
      expectedToPassCurrentMvp: false,
      projectDir: path.join(testRoot, `pca-capability-gate-mutation-continuity-${runId}`),
      expectChanged: [],
    },
    {
      id: 'synthetic-two-file-partial-failure-recovery-followup',
      tier: 'candidate',
      provider: 'synthetic',
      execution: 'mutation-recovery-followup-test',
      expectedCapability: 'candidate two-file partial failure recovery follow-up surface',
      currentSupportedCapability: 'synthetic follow-up evidence that stopped partial mutation state stays visible with no rollback claim',
      reasonForTier: 'Candidate because it proves exactly-two-file partial failure recovery guidance exposes changedFiles, failedFiles, writer-started write effect, and inspect/re-read next action without changing the default MVP gate.',
      drivesApplyPatchExpansion: false,
      requiresRealProvider: false,
      expectedToPassCurrentMvp: false,
      projectDir: path.join(testRoot, `pca-capability-gate-partial-recovery-followup-${runId}`),
      expectChanged: [],
    },
    {
      id: 'synthetic-single-file-protected-verify',
      tier: 'backlog',
      provider: 'synthetic',
      expectedCapability: 'create/add file plus protected-file composite verification',
      currentSupportedCapability: 'not supported by the current MVP selected-workspace update-only route',
      reasonForTier: 'Requires create/add semantics and a composite protected-file expectation, so it must not block MVP update-only dogfood.',
      drivesApplyPatchExpansion: false,
      requiresRealProvider: false,
      expectedToPassCurrentMvp: false,
      projectDir: path.join(testRoot, `pca-capability-gate-synthetic-${runId}`),
      files: {
        'LOCKED.md': 'Do not modify this file.\n',
      },
      protectedFiles: ['LOCKED.md'],
      turns: [
        {
          prompt: 'Create file note.txt with content: hello capability gate. Do NOT modify LOCKED.md. Verify note.txt contains hello capability gate and LOCKED.md is unchanged.',
          expectChanged: ['note.txt'],
          expectContains: {
            'note.txt': ['hello capability gate'],
          },
        },
      ],
    },
    {
      id: 'real-small-bugfix-followup-verify',
      tier: 'candidate',
      provider: 'real',
      expectedCapability: 'real-provider existing-file single-file bugfix plus follow-up and protected-file consistency',
      currentSupportedCapability: 'MVP supports an explicit selected-workspace single-file update; this richer natural-language follow-up path remains candidate evidence.',
      reasonForTier: 'Useful dogfood signal, but it mixes real-provider behavior, completed follow-up, and richer verification beyond the default MVP gate.',
      drivesApplyPatchExpansion: false,
      requiresRealProvider: true,
      expectedToPassCurrentMvp: false,
      projectDir: path.join(testRoot, `pca-capability-gate-real-bugfix-${runId}`),
      files: {
        'math.js': 'export function double(n) {\n  return n + 2;\n}\n',
        'README.md': 'double(3) should return 6.\n',
        'LOCKED.md': 'Do not modify this file.\n',
      },
      protectedFiles: ['README.md', 'LOCKED.md'],
      turns: [
        {
          prompt: 'There is a bug in math.js: double(3) should return 6, but the implementation is wrong. Fix the bug in math.js. Do NOT modify README.md. Do NOT modify LOCKED.md. Verify math.js contains n * 2 and README.md is unchanged and LOCKED.md is unchanged.',
          expectChanged: ['math.js'],
          expectContains: {
            'math.js': ['n * 2'],
          },
        },
        {
          prompt: 'Correction: add a short comment above double explaining that it doubles a number. Only modify math.js. Verify math.js contains doubles a number and math.js contains n * 2 and README.md is unchanged and LOCKED.md is unchanged.',
          expectChanged: ['math.js'],
          expectContains: {
            'math.js': ['doubles a number', 'n * 2'],
          },
        },
      ],
    },
    {
      id: 'real-multifile-consistency-verify',
      tier: 'candidate',
      provider: 'real',
      expectedCapability: 'real-provider cross-file consistency check while mutating one selected file',
      currentSupportedCapability: 'single-file selected-workspace updates are supported; broader cross-file consistency remains candidate evidence.',
      reasonForTier: 'Valuable protected/consistency signal, but cross-file consistency expectations should not block the MVP update-only gate.',
      drivesApplyPatchExpansion: false,
      requiresRealProvider: true,
      expectedToPassCurrentMvp: false,
      projectDir: path.join(testRoot, `pca-capability-gate-real-multifile-${runId}`),
      files: {
        'todo.txt': 'ship minimal CLI smoke\ndocument one follow-up\nverify multi-file follow-up\n',
        'plan.txt': '- ship minimal CLI smoke\n- document one follow-up\n',
        'LOCKED.md': 'Do not modify this file.\n',
      },
      protectedFiles: ['todo.txt', 'LOCKED.md'],
      turns: [
        {
          prompt: 'Replace plan.txt with exactly this content:\n```text\n- ship minimal CLI smoke\n- document one follow-up\n- verify multi-file follow-up\n```\nDo NOT modify todo.txt. Do NOT modify LOCKED.md. Verify todo.txt and plan.txt stay consistent and LOCKED.md is unchanged.',
          expectChanged: ['plan.txt'],
          expectContains: {
            'plan.txt': ['ship minimal CLI smoke', 'document one follow-up', 'verify multi-file follow-up'],
          },
        },
      ],
    },
  ]

  const candidateScenarios = [
    {
      id: 'real-small-project-smoke',
      tier: 'candidate',
      provider: 'real',
      expectedCapability: 'real-provider small project protected-file consistency with multi-file natural-language edit',
      currentSupportedCapability: 'not a current MVP blocker; broader natural-language multi-file coordination remains candidate evidence.',
      reasonForTier: 'Candidate only because it exercises protected-file consistency and multi-file coordination beyond update-only MVP.',
      drivesApplyPatchExpansion: false,
      requiresRealProvider: true,
      expectedToPassCurrentMvp: false,
      projectDir: path.join(testRoot, `pca-candidate-real-small-project-${runId}`),
      files: {
        'src/utils.js': 'export function greet(name = "world") {\n  return "Hello, " + name;\n}\n',
        'src/app.js': 'import { greet } from "./utils.js";\n\nexport const message = greet("Ada");\n',
        'README.md': 'Use greet("Ada") to say hello.\n',
        'project.json': '{"name":"candidate-smoke","private":true}\n',
        'LOCKED.md': 'Do not modify this file.\n',
      },
      protectedFiles: ['src/utils.js', 'src/app.js', 'project.json', 'LOCKED.md'],
      turns: [
        {
          prompt: 'Rename exported function greet to welcome. Update src/utils.js, src/app.js, and README.md so they consistently use welcome. Do NOT modify project.json. Do NOT modify LOCKED.md. Verify src/utils.js contains export function welcome and src/app.js contains welcome and README.md contains welcome("Ada") and project.json is unchanged and LOCKED.md is unchanged.',
          protectedFiles: ['project.json', 'LOCKED.md'],
          expectChanged: ['README.md', 'src/app.js', 'src/utils.js'],
          expectContains: {
            'src/utils.js': ['export function welcome'],
            'src/app.js': ['welcome'],
            'README.md': ['welcome("Ada")'],
          },
        },
        {
          prompt: 'Correction: README.md should show welcome() as the primary example, but keep welcome("Ada") as a second example. Only modify README.md. Verify README.md contains welcome() and README.md contains welcome("Ada") and src/utils.js is unchanged and src/app.js is unchanged and project.json is unchanged and LOCKED.md is unchanged.',
          protectedFiles: ['src/utils.js', 'src/app.js', 'project.json', 'LOCKED.md'],
          expectChanged: ['README.md'],
          expectContains: {
            'README.md': ['welcome()', 'welcome("Ada")'],
          },
        },
      ],
    },
    {
      id: 'real-completed-continue-followup-verify',
      tier: 'candidate',
      provider: 'real',
      expectedCapability: 'real-provider completed-session follow-up over one existing file',
      currentSupportedCapability: 'single-file update is MVP; completed-session real follow-up stability is candidate evidence.',
      reasonForTier: 'Candidate only because it adds same-session /continue behavior and transcript evidence beyond the MVP mutation proof.',
      drivesApplyPatchExpansion: false,
      requiresRealProvider: true,
      expectedToPassCurrentMvp: false,
      projectDir: path.join(testRoot, `pca-candidate-real-continue-${runId}`),
      files: {
        'math.js': 'export function double(n) {\n  return n + 2;\n}\n',
        'README.md': 'double(3) should return 6.\n',
        'LOCKED.md': 'Do not modify this file.\n',
      },
      protectedFiles: ['README.md', 'LOCKED.md'],
      turns: [
        {
          prompt: 'There is a bug in math.js: double(3) should return 6, but the implementation is wrong. Fix the bug in math.js. Do NOT modify README.md. Do NOT modify LOCKED.md. Verify math.js contains n * 2 and README.md is unchanged and LOCKED.md is unchanged.',
          expectChanged: ['math.js'],
          expectContains: {
            'math.js': ['n * 2'],
          },
        },
        {
          prompt: 'Correction: add a short comment above double explaining that it doubles a number. Only modify math.js. Verify math.js contains doubles a number and math.js contains n * 2 and README.md is unchanged and LOCKED.md is unchanged.',
          continueCompletedSession: true,
          expectSameSession: true,
          expectChanged: ['math.js'],
          expectContains: {
            'math.js': ['doubles a number', 'n * 2'],
          },
          expectTranscriptContains: ['math.js', 'Verification: passed'],
        },
      ],
    },
  ]

  const tierDescriptorCases = [
    {
      id: realSingleFileUpdateCaseId,
      tier: 'candidate',
      provider: 'real',
      executable: false,
      manualFlag: `--case=${realSingleFileUpdateCaseId}`,
      expectedCapability: 'real provider selected-workspace existing-file single-file update',
      currentSupportedCapability: 'selected-workspace existing-file single-file update only',
      reasonForTier: 'Candidate opt-in because it uses a real provider to dogfood the existing MVP mutation boundary without changing the default synthetic gate.',
      drivesApplyPatchExpansion: false,
      requiresRealProvider: true,
      expectedToPassCurrentMvp: false,
      expectedToPassInCurrentMVP: false,
    },
    {
      id: realSingleFileCreateCaseId,
      tier: 'candidate',
      provider: 'real',
      executable: false,
      manualFlag: `--case=${realSingleFileCreateCaseId}`,
      expectedCapability: 'real provider selected-workspace single-file Add File create',
      currentSupportedCapability: 'selected-workspace single-file Add File create only',
      reasonForTier: 'Candidate opt-in because it asks a real provider to emit exactly one Add File patch and routes it through the narrow selected-workspace create route without changing the default MVP gate.',
      drivesApplyPatchExpansion: false,
      requiresRealProvider: true,
      expectedToPassCurrentMvp: false,
      expectedToPassInCurrentMVP: false,
    },
    {
      id: realTwoFileUpdateCaseId,
      tier: 'candidate',
      provider: 'real',
      executable: false,
      manualFlag: `--case=${realTwoFileUpdateCaseId}`,
      expectedCapability: 'real provider selected-workspace exactly-2 Update File write',
      currentSupportedCapability: 'selected-workspace exactly-2 existing-file Update File only',
      reasonForTier: 'Candidate opt-in because it asks a real provider to emit exactly two Update File operations and routes them through the narrow selected-workspace two-file update route without changing the default MVP gate.',
      drivesApplyPatchExpansion: false,
      requiresRealProvider: true,
      expectedToPassCurrentMvp: false,
      expectedToPassInCurrentMVP: false,
    },
    {
      id: 'real-apply-patch-workspace-write-smoke',
      tier: 'candidate',
      provider: 'real',
      executable: false,
      manualFlag: '--real-apply-patch-workspace-write-smoke',
      expectedCapability: 'real-provider selected-workspace single-file apply_patch smoke with richer verification',
      currentSupportedCapability: 'available only as an explicit opt-in smoke flag against an isolated test workspace',
      reasonForTier: 'Candidate because it requires a real provider and exercises richer model-output and route projection behavior than MVP.',
      drivesApplyPatchExpansion: false,
      requiresRealProvider: true,
      expectedToPassCurrentMvp: false,
    },
    {
      id: 'release-cli-entry-followup-stability',
      tier: 'release',
      provider: 'synthetic',
      executable: false,
      expectedCapability: 'CLI entry and follow-up stability suitable for release evidence',
      currentSupportedCapability: 'covered by focused CLI entry and baseline gates, not by the default MVP capability tier',
      reasonForTier: 'Release-only gate; it should not block MVP mutation dogfood.',
      drivesApplyPatchExpansion: false,
      requiresRealProvider: false,
      expectedToPassCurrentMvp: false,
    },
    {
      id: 'release-permission-memory-hard-gate',
      tier: 'release',
      provider: 'synthetic',
      executable: false,
      expectedCapability: 'hard permission-memory gate',
      currentSupportedCapability: 'external release gate via verify:permission-memory, not a real-user MVP capability case',
      reasonForTier: 'Release-only safety evidence; it should not block MVP selected-workspace update proof.',
      drivesApplyPatchExpansion: false,
      requiresRealProvider: false,
      expectedToPassCurrentMvp: false,
    },
    {
      id: 'release-core-capability-gate',
      tier: 'release',
      provider: 'synthetic',
      executable: false,
      expectedCapability: 'release-core deterministic capability gate',
      currentSupportedCapability: 'external release gate via verify:release:core',
      reasonForTier: 'Release-only breadth gate; not a default MVP capability blocker.',
      drivesApplyPatchExpansion: false,
      requiresRealProvider: false,
      expectedToPassCurrentMvp: false,
    },
    {
      id: 'release-long-session-compact-continuity',
      tier: 'release',
      provider: 'synthetic',
      executable: false,
      expectedCapability: 'long-session and compact continuity release evidence',
      currentSupportedCapability: 'handled by focused session/continuity gates rather than this MVP mutation gate',
      reasonForTier: 'Release-only durability evidence, explicitly outside the MVP mutation boundary.',
      drivesApplyPatchExpansion: false,
      requiresRealProvider: false,
      expectedToPassCurrentMvp: false,
    },
    {
      id: 'backlog-create-add-file-no-write-classification',
      tier: 'backlog',
      provider: 'synthetic',
      executable: false,
      expectedCapability: 'selected-workspace single-file add/create no-write classification',
      currentSupportedCapability: 'Add File patches can be classified as no-write backlog evidence outside the explicit candidate create route.',
      reasonForTier: 'Backlog because default/MVP and broad apply_patch paths still must not create files; this records the no-write classification surface for non-candidate paths.',
      drivesApplyPatchExpansion: false,
      requiresRealProvider: false,
      expectedToPassCurrentMvp: false,
    },
    {
      id: 'backlog-delete-move-support',
      tier: 'backlog',
      provider: 'synthetic',
      executable: false,
      expectedCapability: 'delete, move, rename, or chmod support',
      currentSupportedCapability: 'unsupported by the selected-workspace update-only MVP route',
      reasonForTier: 'Backlog because it requires new mutation semantics beyond existing-file update.',
      drivesApplyPatchExpansion: false,
      requiresRealProvider: false,
      expectedToPassCurrentMvp: false,
    },
    {
      id: 'backlog-rollback-fuzzy-ast-broad-apply-patch',
      tier: 'backlog',
      provider: 'synthetic',
      executable: false,
      expectedCapability: 'rollback, fuzzy matching, AST edit, and broad apply_patch support',
      currentSupportedCapability: 'unsupported; current route is one explicit update operation only',
      reasonForTier: 'Backlog because these are full edit-system expansions and must not be opened by this gate split.',
      drivesApplyPatchExpansion: false,
      requiresRealProvider: false,
      expectedToPassCurrentMvp: false,
    },
    {
      id: 'backlog-arbitrary-project-mutation',
      tier: 'backlog',
      provider: 'synthetic',
      executable: false,
      expectedCapability: 'arbitrary project mutation outside the selected workspace update lane',
      currentSupportedCapability: 'unsupported as an MVP blocker',
      reasonForTier: 'Backlog because arbitrary mutation needs a broader user-workspace safety policy.',
      drivesApplyPatchExpansion: false,
      requiresRealProvider: false,
      expectedToPassCurrentMvp: false,
    },
  ]

  const candidateMutationSuiteSyntheticCaseIds = [
    'synthetic-selected-workspace-single-file-create',
    'synthetic-selected-workspace-multi-file-update-planning',
    'synthetic-selected-workspace-two-file-update',
    'synthetic-selected-workspace-two-file-update-partial-failure',
    'synthetic-mutation-continuity-after-compact',
    'synthetic-two-file-partial-failure-recovery-followup',
  ]

  const candidateMutationSuiteRealCaseIds = [
    realSingleFileUpdateCaseId,
    realSingleFileCreateCaseId,
    realTwoFileUpdateCaseId,
  ]

  return {
    futureGateCandidates,
    scenarios: scenarios.map(withRoute135CaseFields),
    candidateScenarios: candidateScenarios.map(withRoute135CaseFields),
    tierDescriptorCases: tierDescriptorCases.map(withRoute135CaseFields),
    candidateMutationSuiteSyntheticCaseIds,
    candidateMutationSuiteRealCaseIds,
  }
}

export function createCaseRegistry({
  scenarios,
  candidateScenarios,
  tierDescriptorCases,
  selectedCaseId,
  includeCandidates,
  includeContinueSmoke,
  candidateMutationSuiteId,
  suiteValues,
  candidateMutationSuiteSyntheticCaseIds,
  candidateMutationSuiteRealCaseIds,
  onInvalid = (message) => {
    throw new Error(message)
  },
} = {}) {
  const allCapabilityCases = () => [...scenarios, ...candidateScenarios, ...tierDescriptorCases]
  const caseMatchesTier = (capabilityCase, tier) => tier === 'all' || capabilityCase.tier === tier
  const findCapabilityCaseById = (caseId) =>
    allCapabilityCases().find((capabilityCase) => capabilityCase.id === caseId)
  const caseMetadata = (capabilityCase) => {
    const expectedToPassCurrentMvp = Boolean(capabilityCase.expectedToPassCurrentMvp)
    return {
      id: capabilityCase.id,
      tier: capabilityCase.tier,
      provider: capabilityCase.provider,
      expectedCapability: capabilityCase.expectedCapability,
      currentSupportedCapability: capabilityCase.currentSupportedCapability,
      reasonForTier: capabilityCase.reasonForTier,
      drivesApplyPatchExpansion: Boolean(capabilityCase.drivesApplyPatchExpansion),
      requiresRealProvider: Boolean(capabilityCase.requiresRealProvider),
      expectedToPassCurrentMvp,
      expectedToPassInCurrentMVP: expectedToPassCurrentMvp,
      executable: capabilityCase.executable !== false,
      ...(capabilityCase.manualFlag ? { manualFlag: capabilityCase.manualFlag } : {}),
    }
  }
  const candidateMutationSuiteSelectedIds = ({ includeReal = false } = {}) => [
    ...candidateMutationSuiteSyntheticCaseIds,
    ...(includeReal ? candidateMutationSuiteRealCaseIds : []),
  ]

  return {
    allCapabilityCases,
    caseMatchesTier,
    findCapabilityCaseById,
    caseMetadata,
    withCaseMetadata(capabilityCase, result) {
      return {
        ...result,
        tier: capabilityCase.tier,
        expectedCapability: capabilityCase.expectedCapability,
        currentSupportedCapability: capabilityCase.currentSupportedCapability,
        reasonForTier: capabilityCase.reasonForTier,
        drivesApplyPatchExpansion: Boolean(capabilityCase.drivesApplyPatchExpansion),
        requiresRealProvider: Boolean(capabilityCase.requiresRealProvider),
        expectedToPassCurrentMvp: Boolean(capabilityCase.expectedToPassCurrentMvp),
        expectedToPassInCurrentMVP: Boolean(capabilityCase.expectedToPassCurrentMvp),
        caseMetadata: caseMetadata(capabilityCase),
      }
    },
    skippedCasesForTier(tier) {
      if (selectedCaseId) {
        return allCapabilityCases()
          .filter((capabilityCase) => capabilityCase.id !== selectedCaseId)
          .map((capabilityCase) => ({
            ...caseMetadata(capabilityCase),
            skipReason: `selected case=${selectedCaseId}; case id=${capabilityCase.id}; ${capabilityCase.reasonForTier}`,
          }))
      }
      return allCapabilityCases()
        .filter((capabilityCase) => !caseMatchesTier(capabilityCase, tier))
        .map((capabilityCase) => ({
          ...caseMetadata(capabilityCase),
          skipReason: `selected tier=${tier}; case tier=${capabilityCase.tier}; ${capabilityCase.reasonForTier}`,
        }))
    },
    candidateMutationSuiteSelectedIds,
    selectedCasesForSuite(suiteId, { includeReal = false } = {}) {
      if (suiteId !== candidateMutationSuiteId) {
        onInvalid(`Invalid --suite value: ${suiteId}. Use ${suiteValues.join('|')}.`)
      }
      return candidateMutationSuiteSelectedIds({ includeReal }).map((caseId) => {
        const capabilityCase = findCapabilityCaseById(caseId)
        if (!capabilityCase) {
          onInvalid(`Suite ${suiteId} references unknown case id: ${caseId}`)
        }
        return capabilityCase
      })
    },
    skippedCasesForSuite(suiteId, { includeReal = false } = {}) {
      if (suiteId !== candidateMutationSuiteId) {
        onInvalid(`Invalid --suite value: ${suiteId}. Use ${suiteValues.join('|')}.`)
      }
      const selectedIds = new Set(candidateMutationSuiteSelectedIds({ includeReal }))
      return allCapabilityCases()
        .filter((capabilityCase) => !selectedIds.has(capabilityCase.id))
        .map((capabilityCase) => {
          const skipReason = candidateMutationSuiteRealCaseIds.includes(capabilityCase.id)
            ? `suite=${suiteId}; real-provider mutation smoke is optional and requires --include-real; ${capabilityCase.reasonForTier}`
            : `suite=${suiteId}; case is outside the candidate mutation dogfood suite; ${capabilityCase.reasonForTier}`
          return {
            ...caseMetadata(capabilityCase),
            skipReason,
          }
        })
    },
    selectedCasesForTier(tier) {
      if (selectedCaseId) {
        const capabilityCase = findCapabilityCaseById(selectedCaseId)
        if (!capabilityCase) {
          onInvalid(`Invalid --case value: ${selectedCaseId}. Use --list to inspect available case ids.`)
        }
        return [capabilityCase]
      }
      if (includeContinueSmoke) {
        return candidateScenarios.filter(
          (scenario) => scenario.id === 'real-completed-continue-followup-verify',
        )
      }
      const normalizedTier = includeCandidates ? 'candidate' : tier
      return allCapabilityCases().filter((capabilityCase) => caseMatchesTier(capabilityCase, normalizedTier))
    },
    selectedExecutableScenariosForTier(tier) {
      return this.selectedCasesForTier(tier).filter((scenario) => scenario.executable !== false)
    },
  }
}
