import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { type GraphBaseline, GraphBaselineSchema } from '../schema/graph-baseline.js'

/** Absolute path to the baseline file inside the given project root. */
function baselinePath(projectRoot: string): string {
  return join(projectRoot, '.vibegraph', 'cache', 'baseline.json')
}

/**
 * Read the graph baseline. Returns null if file absent, malformed, or fails Zod parse.
 * Never throws — callers should treat null as "no baseline yet".
 */
export async function loadGraphBaseline(projectRoot: string): Promise<GraphBaseline | null> {
  const filePath = baselinePath(projectRoot)
  if (!existsSync(filePath)) return null
  try {
    const raw = await readFile(filePath, 'utf-8')
    const parsed = GraphBaselineSchema.parse(JSON.parse(raw))
    return parsed
  } catch {
    return null
  }
}

/**
 * Write the graph baseline atomically. Validates via Zod before writing.
 * Uses temp-file + rename pattern: write to `<path>.tmp`, then rename over real path.
 */
export async function writeGraphBaseline(
  projectRoot: string,
  baseline: GraphBaseline,
): Promise<void> {
  const validated = GraphBaselineSchema.parse(baseline)
  const finalPath = baselinePath(projectRoot)
  const tmpPath = `${finalPath}.tmp`
  await mkdir(dirname(finalPath), { recursive: true })
  const payload = `${JSON.stringify(validated, null, 2)}\n`
  await writeFile(tmpPath, payload, 'utf-8')
  await rename(tmpPath, finalPath)
}
