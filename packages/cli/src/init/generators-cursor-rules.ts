import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export interface GenerateCursorRulesOptions {
  projectRoot: string
  overwrite?: boolean
}

export interface GenerateCursorRulesResult {
  path: string
  written: boolean
  skipped?: 'exists'
}

const RULES_TEMPLATE = `---
description: Architecture preflight via vibe-graph
globs: ["**/*.ts", "**/*.tsx"]
---

# Vibe Graph Architecture Awareness

Before modifying architecture-sensitive code:

1. Call \`vibe-graph.prepare_task\` with:
   - \`intent\`: brief description of what you're changing
   - \`paths\`: files you plan to edit
   - \`mode\`: "refactor" | "feature" | "bugfix"

   Returns: target subsystems, blast radius, applicable rules, doNotDo constraints,
   required context files, recommendations.

   If the request names a subsystem but not a file, call \`get_subsystem\` first and
   choose paths from that subsystem's returned files. Do not infer ownership from a
   filename alone. Include every production file you expect to edit in \`paths\`.

2. Respect the returned rules and doNotDo list while editing.

3. After editing, call \`vibe-graph.validate_diff\` with:
   - \`taskId\`: the exact value returned in step 1 (links the session)
   - \`workingFiles\` or \`diff\`: the complete set of files changed for this task

   Returns: new violations, removed violations, task-scoped graph delta, scope,
   recommendations. Repository-wide baseline drift is deliberately omitted here;
   use \`validate_drift\` to inspect it separately.

4. If validate_diff returns status \`violation\` or any new finding with severity high,
   either fix the violation or explicitly note why this is acceptable for human review.

Use vibe-graph tools when working on architecture-sensitive code, refactoring,
or anything touching subsystem boundaries.
`

export async function generateCursorRules(
  opts: GenerateCursorRulesOptions,
): Promise<GenerateCursorRulesResult> {
  const path = join(opts.projectRoot, '.cursor', 'rules', 'vibe-graph.mdc')
  if (existsSync(path) && opts.overwrite !== true) {
    return { path, written: false, skipped: 'exists' }
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, RULES_TEMPLATE, 'utf-8')
  return { path, written: true }
}
