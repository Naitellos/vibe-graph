import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ConfigSchema, LoaderError, SnapshotSchema, loadSubsystemDocs } from '@codearch/core'
import { parse as parseYaml } from 'yaml'
import type { Check, CheckResult } from './types.js'

export const configYmlCheck: Check = {
  id: 'project/config',
  description: '.vibegraph/config.yml exists and parses',
  async run(ctx): Promise<CheckResult> {
    const path = join(ctx.projectRoot, '.vibegraph', 'config.yml')
    if (!existsSync(path)) {
      return {
        id: configYmlCheck.id,
        status: 'warn',
        message: 'No .vibegraph/config.yml — using defaults',
        suggestion: 'Run `vibe-graph init` to scaffold a config',
      }
    }
    try {
      const raw = await readFile(path, 'utf-8')
      const data: unknown = parseYaml(raw)
      ConfigSchema.parse(data ?? {})
      return {
        id: configYmlCheck.id,
        status: 'ok',
        message: '.vibegraph/config.yml is valid',
      }
    } catch (err) {
      return {
        id: configYmlCheck.id,
        status: 'error',
        message: `.vibegraph/config.yml failed to parse: ${err instanceof Error ? err.message : String(err)}`,
        suggestion: 'Open .vibegraph/config.yml and fix the reported issue',
      }
    }
  },
}

export const ignoreFileCheck: Check = {
  id: 'project/ignore',
  description: '.vibegraphignore exists and covers .env',
  async run(ctx): Promise<CheckResult> {
    const path = join(ctx.projectRoot, '.vibegraphignore')
    if (!existsSync(path)) {
      return {
        id: ignoreFileCheck.id,
        status: 'warn',
        message: 'No .vibegraphignore — secrets in .env files may be indexed',
        suggestion: 'Run `vibe-graph init` to generate a .vibegraphignore with defaults',
      }
    }
    try {
      const raw = await readFile(path, 'utf-8')
      const lines = raw
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'))
      const hasEnv = lines.some((l) => l === '.env' || l === '.env.*' || l.startsWith('.env'))
      if (!hasEnv) {
        return {
          id: ignoreFileCheck.id,
          status: 'warn',
          message: '.vibegraphignore does not include .env entries',
          suggestion: 'Add `.env` and `.env.*` to .vibegraphignore to avoid indexing secrets',
        }
      }
      return {
        id: ignoreFileCheck.id,
        status: 'ok',
        message: '.vibegraphignore present and covers .env',
      }
    } catch (err) {
      return {
        id: ignoreFileCheck.id,
        status: 'error',
        message: `.vibegraphignore read failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  },
}

const CURRENT_SCHEMA_VERSION = '0.1.0'

export const cacheCheck: Check = {
  id: 'project/cache',
  description: '.vibegraph/cache/graph.json parses with current schema version',
  async run(ctx): Promise<CheckResult> {
    const path = join(ctx.projectRoot, '.vibegraph', 'cache', 'graph.json')
    if (!existsSync(path)) {
      return {
        id: cacheCheck.id,
        status: 'info',
        message: 'No graph.json — run `vibe-graph scan` to build the cache',
      }
    }
    try {
      const raw = await readFile(path, 'utf-8')
      const snap = SnapshotSchema.parse(JSON.parse(raw))
      if (snap.meta.schemaVersion !== CURRENT_SCHEMA_VERSION) {
        return {
          id: cacheCheck.id,
          status: 'warn',
          message: `graph.json schemaVersion ${snap.meta.schemaVersion} differs from current ${CURRENT_SCHEMA_VERSION}`,
          suggestion: 'Run `vibe-graph scan` to rebuild with the current schema',
        }
      }
      return {
        id: cacheCheck.id,
        status: 'ok',
        message: `graph.json valid (scanId ${snap.meta.scanId.slice(0, 8)}…, built ${snap.meta.builtAt})`,
      }
    } catch (err) {
      return {
        id: cacheCheck.id,
        status: 'error',
        message: `graph.json failed to parse: ${err instanceof Error ? err.message : String(err)}`,
        suggestion: 'Delete .vibegraph/cache/graph.json and run `vibe-graph scan`',
      }
    }
  },
}

export const subsystemsCheck: Check = {
  id: 'project/subsystems',
  description: '.vibegraph/subsystems/ directory with valid YAML docs',
  async run(ctx): Promise<CheckResult> {
    try {
      const result = await loadSubsystemDocs(ctx.projectRoot)
      if (result.docs.length === 0) {
        return {
          id: subsystemsCheck.id,
          status: 'info',
          message: 'no subsystems/ dir (run `vibe-graph onboard` to create one)',
        }
      }
      return {
        id: subsystemsCheck.id,
        status: 'ok',
        message: `subsystems/ dir present (${result.docs.length} docs)`,
      }
    } catch (err) {
      if (err instanceof LoaderError) {
        return {
          id: subsystemsCheck.id,
          status: 'error',
          message: `${err.code}: ${err.message}`,
          suggestion: 'Fix the subsystems YAML files and try again',
        }
      }
      return {
        id: subsystemsCheck.id,
        status: 'error',
        message: `subsystems check failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  },
}

export const PROJECT_CHECKS: readonly Check[] = [
  configYmlCheck,
  ignoreFileCheck,
  cacheCheck,
  subsystemsCheck,
]
