import { spawn } from 'node:child_process'

// ---------------------------------------------------------------------------
// Git diff helpers — shared by MCP `validate_diff` tool and CLI
// `vibe-graph validate-diff` command. Previously duplicated in both packages
// (mcp/src/tools/validate-diff.ts and cli/src/helpers/git.ts). Extracted
// during DF3 dogfooding so both call sites stay in sync on git semantics.
// ---------------------------------------------------------------------------

/**
 * Run `git diff <ref> --name-status` inside `projectRoot` and return raw
 * stdout. Rejects with a descriptive error on non-zero exit or spawn failure.
 *
 * Use `parseGitNameStatus` on the result to get `{ changedFiles, deletedFiles }`.
 */
export function runGitDiff(projectRoot: string, ref: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn('git', ['-C', projectRoot, 'diff', ref, '--name-status'])
    let stdout = ''
    let stderr = ''
    p.stdout.on('data', (c) => {
      stdout += c.toString('utf-8')
    })
    p.stderr.on('data', (c) => {
      stderr += c.toString('utf-8')
    })
    p.on('error', reject)
    p.on('close', (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(`git exited ${code}: ${stderr}`)),
    )
  })
}

/**
 * Parse `git diff --name-status` output into `{ changedFiles, deletedFiles }`.
 * Renames (`R100 oldname newname`) are reported under `changedFiles` using
 * the NEW path (which is what needs re-indexing).
 */
export function parseGitNameStatus(stdout: string): {
  changedFiles: string[]
  deletedFiles: string[]
} {
  const changedFiles: string[] = []
  const deletedFiles: string[] = []
  for (const line of stdout.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const parts = t.split(/\s+/)
    const status = parts[0]
    const path = parts[parts.length - 1]
    if (path === undefined) continue
    if (status === 'D') deletedFiles.push(path)
    else changedFiles.push(path)
  }
  return { changedFiles, deletedFiles }
}
