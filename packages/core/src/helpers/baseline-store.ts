import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { z } from 'zod'

const BaselineEntrySchema = z.object({
  status: z.enum(['accepted', 'ignored']),
  acceptedAt: z.string().default(() => new Date().toISOString()),
  acceptedBy: z.string().optional(),
  note: z.string().optional(),
})
const BaselineFileSchema = z.object({
  schemaVersion: z.literal('1.0').default('1.0'),
  items: z.record(z.string(), BaselineEntrySchema).default({}),
})
type BaselineEntry = z.infer<typeof BaselineEntrySchema>
export type BaselineStore = Map<string, BaselineEntry>

function baselinePath(projectRoot: string): string {
  return join(projectRoot, '.vibegraph', 'drift-baseline.json')
}

export async function loadBaseline(projectRoot: string): Promise<BaselineStore> {
  const filePath = baselinePath(projectRoot)
  if (!existsSync(filePath)) return new Map()
  try {
    const raw = await readFile(filePath, 'utf-8')
    const parsed = BaselineFileSchema.parse(JSON.parse(raw))
    return new Map(Object.entries(parsed.items))
  } catch {
    return new Map()
  }
}

export interface WriteEntryInput {
  findingId: string
  status: 'accepted' | 'ignored'
  acceptedBy?: string
  note?: string
}

let writeChain: Promise<void> = Promise.resolve()

export async function writeBaselineEntry(
  projectRoot: string,
  input: WriteEntryInput,
): Promise<void> {
  BaselineEntrySchema.parse({
    status: input.status,
    acceptedBy: input.acceptedBy,
    note: input.note,
    acceptedAt: new Date().toISOString(),
  })
  writeChain = writeChain.then(async () => {
    const filePath = baselinePath(projectRoot)
    await mkdir(dirname(filePath), { recursive: true })
    const existing = await loadBaseline(projectRoot)
    existing.set(input.findingId, {
      status: input.status,
      acceptedAt: new Date().toISOString(),
      ...(input.acceptedBy !== undefined ? { acceptedBy: input.acceptedBy } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    })
    const file = { schemaVersion: '1.0' as const, items: Object.fromEntries(existing) }
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`
    await writeFile(tmpPath, JSON.stringify(file, null, 2), 'utf-8')
    await rename(tmpPath, filePath)
  })
  return writeChain
}
