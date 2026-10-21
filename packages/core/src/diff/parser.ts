export interface DiffParseResult {
  added: string[]
  modified: string[]
  deleted: string[]
  renamed: Array<{ from: string; to: string }>
  /** Returns the union of added + modified + deleted + (renamed.to). */
  allChangedFiles(): string[]
}

/**
 * Parse a unified-diff text (output of `git diff`) into categorised file paths.
 * Handles: modified, added (new file), deleted, renamed.
 *
 * NOT a full diff parser — extracts only file-level operations, not hunks.
 * Sufficient for validate_diff's needs (re-index changed files; remove gone files).
 */
export function parseDiffText(diff: string): DiffParseResult {
  const added: string[] = []
  const modified: string[] = []
  const deleted: string[] = []
  const renamed: Array<{ from: string; to: string }> = []

  // Split into per-file sections starting with `diff --git ...`
  const sections = diff.split(/^diff --git /m).filter((s) => s.trim().length > 0)

  for (const section of sections) {
    const firstLine = section.split('\n', 1)[0] ?? ''
    const match = firstLine.match(/^a\/(.+?) b\/(.+)$/)
    if (!match || !match[1] || !match[2]) continue
    const fromPath = match[1]
    const toPath = match[2]

    if (/^new file mode/m.test(section)) {
      added.push(toPath)
    } else if (/^deleted file mode/m.test(section)) {
      deleted.push(fromPath)
    } else if (/^rename from /m.test(section) && /^rename to /m.test(section)) {
      renamed.push({ from: fromPath, to: toPath })
    } else {
      modified.push(fromPath)
    }
  }

  return {
    added,
    modified,
    deleted,
    renamed,
    allChangedFiles() {
      return [...modified, ...added, ...deleted, ...renamed.map((r) => r.to)]
    },
  }
}
