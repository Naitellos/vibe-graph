import { randomUUID } from 'node:crypto'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

/**
 * Atomic write per spec §4.7: write to `<target>.tmp-<pid>-<uuid>`, then rename.
 * Guarantees readers never see a half-written file.
 */
export async function writeSnapshotAtomic(targetPath: string, payload: unknown): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true })
  const tmp = join(
    dirname(targetPath),
    `${basename(targetPath)}.tmp-${process.pid}-${randomUUID()}`,
  )
  const body = JSON.stringify(payload, null, 2)
  await writeFile(tmp, body, { encoding: 'utf-8' })
  await rename(tmp, targetPath)
}
