import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { type SubsystemDoc, SubsystemDocSchema } from '../schema/subsystem-doc.js'

export type LoaderErrorCode = 'PARSE_ERROR' | 'SCHEMA_INVALID' | 'ID_MISMATCH' | 'DUPLICATE_ID'

export class LoaderError extends Error {
  constructor(
    public readonly code: LoaderErrorCode,
    message: string,
    public readonly details: { file?: string; zodIssues?: unknown; ids?: string[] },
  ) {
    super(message)
    this.name = 'LoaderError'
  }
}

export interface LoadedSubsystems {
  docs: SubsystemDoc[]
  dirPath: string | undefined
  filesByDoc: Map<SubsystemDoc, string>
}

export async function loadSubsystemDocs(projectRoot: string): Promise<LoadedSubsystems> {
  const dirPath = join(projectRoot, '.vibegraph', 'subsystems')
  if (!existsSync(dirPath)) {
    return { docs: [], dirPath: undefined, filesByDoc: new Map() }
  }
  const entries = await readdir(dirPath)
  const ymlFiles = entries.filter((e) => e.endsWith('.yml') || e.endsWith('.yaml'))
  const docs: SubsystemDoc[] = []
  const seenIds = new Map<string, string>()
  const filesByDoc = new Map<SubsystemDoc, string>()

  // First pass: parse and validate schema
  const parsed_items: Array<{
    filename: string
    filepath: string
    expectedId: string
    data: SubsystemDoc
  }> = []
  for (const filename of ymlFiles) {
    const filepath = join(dirPath, filename)
    const expectedId = basename(filename, '.yml').replace(/\.yaml$/, '')

    let raw: unknown
    try {
      const text = await readFile(filepath, 'utf-8')
      raw = parseYaml(text)
    } catch (err) {
      throw new LoaderError(
        'PARSE_ERROR',
        `[PARSE_ERROR] Cannot parse ${filename}: ${(err as Error).message}`,
        { file: filepath },
      )
    }

    const parsed = SubsystemDocSchema.safeParse(raw ?? {})
    if (!parsed.success) {
      throw new LoaderError(
        'SCHEMA_INVALID',
        `[SCHEMA_INVALID] Schema validation failed for ${filename}`,
        {
          file: filepath,
          zodIssues: parsed.error.issues,
        },
      )
    }

    parsed_items.push({ filename, filepath, expectedId, data: parsed.data })
  }

  // Second pass: check for duplicates
  for (const item of parsed_items) {
    const earlier = seenIds.get(item.data.id)
    if (earlier !== undefined) {
      throw new LoaderError(
        'DUPLICATE_ID',
        `[DUPLICATE_ID] Duplicate id "${item.data.id}" in ${item.filename}`,
        {
          ids: [item.data.id],
          file: item.filepath,
        },
      )
    }
    seenIds.set(item.data.id, item.filepath)
  }

  // Third pass: check ID mismatches
  for (const item of parsed_items) {
    if (item.data.id !== item.expectedId) {
      throw new LoaderError(
        'ID_MISMATCH',
        `[ID_MISMATCH] Filename ${item.filename} expects id="${item.expectedId}" but doc declares id="${item.data.id}"`,
        { file: item.filepath },
      )
    }
  }

  // Fourth pass: collect docs
  for (const item of parsed_items) {
    docs.push(item.data)
    filesByDoc.set(item.data, item.filepath)
  }

  docs.sort((a, b) => a.id.localeCompare(b.id))
  return { docs, dirPath, filesByDoc }
}
