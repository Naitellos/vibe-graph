import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pino } from 'pino'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config/config-yml.js'
import { coreTsImportsAnalyzer, reportProgramCoverage } from './core-ts-imports.js'
import { createIgnoreMatcher } from './ignore-matcher.js'
import { createProgramManager } from './program-manager.js'

function mkTmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'vg-core-ts-imports-')))
}

function write(root: string, relPath: string, body: string) {
  const abs = join(root, relPath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
}

describe('coreTsImportsAnalyzer', () => {
  it('has correct id and description', () => {
    expect(coreTsImportsAnalyzer.id).toBe('core/ts-imports')
    expect(typeof coreTsImportsAnalyzer.description).toBe('string')
    expect(coreTsImportsAnalyzer.description.length).toBeGreaterThan(0)
  })

  it('emits 1 edge + 1 evidence for a simple internal import', async () => {
    const root = mkTmp()

    write(
      root,
      'tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
        },
        include: ['src/**/*'],
      }),
    )
    write(root, 'src/a.ts', "import { foo } from './b.js'\nconst x = foo\nexport {}\n")
    write(root, 'src/b.ts', 'export const foo = 1\n')

    const aAbs = join(root, 'src/a.ts')
    const bAbs = join(root, 'src/b.ts')

    const programs = await createProgramManager({ projectRoot: root, files: [aAbs, bAbs] })
    const ignore = createIgnoreMatcher({ patterns: [], includeDefaults: true })
    const log = pino({ level: 'silent' })

    const result = await coreTsImportsAnalyzer.run({
      projectRoot: root,
      programs,
      files: [aAbs, bAbs],
      ignore,
      log,
      config: DEFAULT_CONFIG,
    })

    // Nodes: this analyzer emits none
    expect(result.nodes).toEqual([])

    // Edges: exactly 1 (a → b)
    expect(result.edges).toHaveLength(1)
    const edge = result.edges.at(0)
    expect(edge).toBeDefined()
    expect(edge?.from).toBe('file:src/a.ts')
    expect(edge?.to).toBe('file:src/b.ts')
    expect(edge?.kind).toBe('imports')
    expect(edge?.source).toBe('ast')
    expect(edge?.confidence).toBe('high')
    expect(edge?.evidenceIds).toHaveLength(1)

    // Evidence: exactly 1
    expect(result.evidence).toHaveLength(1)
    const ev = result.evidence.at(0)
    expect(ev).toBeDefined()
    expect(ev?.sourceKind).toBe('ast')
    expect(ev?.file).toBe('src/a.ts')
    expect(ev?.line).toBe(1)
    expect(ev?.column).toBe(1)
    expect(ev?.symbol).toBe('./b.js')
    expect(ev?.coupling).toBe('runtime')

    // Evidence ID must match the one in edge.evidenceIds
    expect(edge?.evidenceIds.at(0)).toBe(ev?.id)
  })

  it('emits edge to external:<specifier> for unresolved (node_modules) import', async () => {
    const root = mkTmp()

    write(
      root,
      'tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
        },
        include: ['src/**/*'],
      }),
    )
    write(root, 'src/c.ts', "import { z } from 'zod'\n")

    const cAbs = join(root, 'src/c.ts')

    const programs = await createProgramManager({ projectRoot: root, files: [cAbs] })
    const ignore = createIgnoreMatcher({ patterns: [], includeDefaults: true })
    const log = pino({ level: 'silent' })

    const result = await coreTsImportsAnalyzer.run({
      projectRoot: root,
      programs,
      files: [cAbs],
      ignore,
      log,
      config: DEFAULT_CONFIG,
    })

    expect(result.nodes).toEqual([])
    expect(result.edges).toHaveLength(1)
    const edge = result.edges.at(0)
    expect(edge).toBeDefined()
    expect(edge?.to).toBe('external:zod')
    expect(edge?.from).toBe('file:src/c.ts')
    expect(edge?.kind).toBe('imports')
  })

  it('emits edge for re-export (export ... from "x") but skips bare export {x}', async () => {
    const root = mkTmp()

    write(
      root,
      'tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
        },
        include: ['src/**/*'],
      }),
    )
    write(root, 'src/index.ts', "export { foo } from './foo.js'\nexport const bar = 2\n")
    write(root, 'src/foo.ts', 'export const foo = 1\n')

    const indexAbs = join(root, 'src/index.ts')
    const fooAbs = join(root, 'src/foo.ts')

    const programs = await createProgramManager({
      projectRoot: root,
      files: [indexAbs, fooAbs],
    })
    const ignore = createIgnoreMatcher({ patterns: [], includeDefaults: true })
    const log = pino({ level: 'silent' })

    const result = await coreTsImportsAnalyzer.run({
      projectRoot: root,
      programs,
      files: [indexAbs, fooAbs],
      ignore,
      log,
      config: DEFAULT_CONFIG,
    })

    // 1 edge: index → foo (re-export with from)
    // 0 edges for `export const bar` (no from clause)
    expect(result.edges).toHaveLength(1)
    const edge = result.edges.at(0)
    expect(edge).toBeDefined()
    expect(edge?.from).toBe('file:src/index.ts')
    expect(edge?.to).toBe('file:src/foo.ts')
    expect(edge?.kind).toBe('imports')
  })

  it('classifies runtime import with runtimeWeight=1', async () => {
    const root = mkTmp()

    write(
      root,
      'tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
        },
        include: ['src/**/*'],
      }),
    )
    write(root, 'src/target.ts', 'export const x = 1\nexport type X = number\n')
    write(root, 'src/runtime.ts', "import { x } from './target.js'\nconst _use = x\nexport {}\n")

    const targetAbs = join(root, 'src/target.ts')
    const runtimeAbs = join(root, 'src/runtime.ts')

    const programs = await createProgramManager({
      projectRoot: root,
      files: [runtimeAbs, targetAbs],
    })
    const ignore = createIgnoreMatcher({ patterns: [], includeDefaults: true })
    const log = pino({ level: 'silent' })

    const result = await coreTsImportsAnalyzer.run({
      projectRoot: root,
      programs,
      files: [runtimeAbs, targetAbs],
      ignore,
      log,
      config: DEFAULT_CONFIG,
    })

    const edge = result.edges.find((e) => e.from === 'file:src/runtime.ts')
    expect(edge).toBeDefined()
    expect(edge?.runtimeWeight).toBe(1)
    expect(edge?.typeOnlyWeight).toBe(0)
    expect(edge?.dynamicWeight).toBe(0)

    const ev = result.evidence.find((e) => e.file === 'src/runtime.ts')
    expect(ev).toBeDefined()
    expect(ev?.coupling).toBe('runtime')
  })

  it('classifies import type { X } as type-only with typeOnlyWeight=1', async () => {
    const root = mkTmp()

    write(
      root,
      'tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
        },
        include: ['src/**/*'],
      }),
    )
    write(root, 'src/target.ts', 'export const x = 1\nexport type X = number\n')
    write(root, 'src/type-only.ts', "import type { X } from './target.js'\nexport type { X }\n")

    const targetAbs = join(root, 'src/target.ts')
    const typeOnlyAbs = join(root, 'src/type-only.ts')

    const programs = await createProgramManager({
      projectRoot: root,
      files: [typeOnlyAbs, targetAbs],
    })
    const ignore = createIgnoreMatcher({ patterns: [], includeDefaults: true })
    const log = pino({ level: 'silent' })

    const result = await coreTsImportsAnalyzer.run({
      projectRoot: root,
      programs,
      files: [typeOnlyAbs, targetAbs],
      ignore,
      log,
      config: DEFAULT_CONFIG,
    })

    const edge = result.edges.find((e) => e.from === 'file:src/type-only.ts')
    expect(edge).toBeDefined()
    expect(edge?.typeOnlyWeight).toBe(1)
    expect(edge?.runtimeWeight).toBe(0)
    expect(edge?.dynamicWeight).toBe(0)

    const ev = result.evidence.find((e) => e.file === 'src/type-only.ts')
    expect(ev).toBeDefined()
    expect(ev?.coupling).toBe('type-only')
  })

  it('classifies import { type X } (inline type modifier, no value bindings) as type-only', async () => {
    const root = mkTmp()

    write(
      root,
      'tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
        },
        include: ['src/**/*'],
      }),
    )
    write(root, 'src/target.ts', 'export const x = 1\nexport type X = number\n')
    write(root, 'src/inline-type.ts', "import { type X } from './target.js'\nexport type { X }\n")

    const targetAbs = join(root, 'src/target.ts')
    const inlineTypeAbs = join(root, 'src/inline-type.ts')

    const programs = await createProgramManager({
      projectRoot: root,
      files: [inlineTypeAbs, targetAbs],
    })
    const ignore = createIgnoreMatcher({ patterns: [], includeDefaults: true })
    const log = pino({ level: 'silent' })

    const result = await coreTsImportsAnalyzer.run({
      projectRoot: root,
      programs,
      files: [inlineTypeAbs, targetAbs],
      ignore,
      log,
      config: DEFAULT_CONFIG,
    })

    const edge = result.edges.find((e) => e.from === 'file:src/inline-type.ts')
    expect(edge).toBeDefined()
    expect(edge?.typeOnlyWeight).toBe(1)
    expect(edge?.runtimeWeight).toBe(0)
    expect(edge?.dynamicWeight).toBe(0)

    const ev = result.evidence.find((e) => e.file === 'src/inline-type.ts')
    expect(ev).toBeDefined()
    expect(ev?.coupling).toBe('type-only')
  })

  it('classifies import { x, type Y } (mixed) as runtime since a value binding exists', async () => {
    const root = mkTmp()

    write(
      root,
      'tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
        },
        include: ['src/**/*'],
      }),
    )
    write(root, 'src/target.ts', 'export const x = 1\nexport type Y = number\n')
    write(
      root,
      'src/mixed.ts',
      "import { x, type Y } from './target.js'\nconst _use = x\nexport type { Y }\nexport {}\n",
    )

    const targetAbs = join(root, 'src/target.ts')
    const mixedAbs = join(root, 'src/mixed.ts')

    const programs = await createProgramManager({
      projectRoot: root,
      files: [mixedAbs, targetAbs],
    })
    const ignore = createIgnoreMatcher({ patterns: [], includeDefaults: true })
    const log = pino({ level: 'silent' })

    const result = await coreTsImportsAnalyzer.run({
      projectRoot: root,
      programs,
      files: [mixedAbs, targetAbs],
      ignore,
      log,
      config: DEFAULT_CONFIG,
    })

    const edge = result.edges.find((e) => e.from === 'file:src/mixed.ts')
    expect(edge).toBeDefined()
    expect(edge?.runtimeWeight).toBe(1)
    expect(edge?.typeOnlyWeight).toBe(0)

    const ev = result.evidence.find((e) => e.file === 'src/mixed.ts')
    expect(ev).toBeDefined()
    expect(ev?.coupling).toBe('runtime')
  })

  it('classifies dynamic import() with dynamicWeight=1', async () => {
    const root = mkTmp()

    write(
      root,
      'tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
        },
        include: ['src/**/*'],
      }),
    )
    write(root, 'src/target.ts', 'export const x = 1\nexport type X = number\n')
    write(root, 'src/dynamic.ts', "export async function load() { return import('./target.js') }\n")

    const targetAbs = join(root, 'src/target.ts')
    const dynamicAbs = join(root, 'src/dynamic.ts')

    const programs = await createProgramManager({
      projectRoot: root,
      files: [dynamicAbs, targetAbs],
    })
    const ignore = createIgnoreMatcher({ patterns: [], includeDefaults: true })
    const log = pino({ level: 'silent' })

    const result = await coreTsImportsAnalyzer.run({
      projectRoot: root,
      programs,
      files: [dynamicAbs, targetAbs],
      ignore,
      log,
      config: DEFAULT_CONFIG,
    })

    const edge = result.edges.find((e) => e.from === 'file:src/dynamic.ts')
    expect(edge).toBeDefined()
    expect(edge?.dynamicWeight).toBe(1)
    expect(edge?.runtimeWeight).toBe(0)
    expect(edge?.typeOnlyWeight).toBe(0)

    const ev = result.evidence.find((e) => e.file === 'src/dynamic.ts')
    expect(ev).toBeDefined()
    expect(ev?.coupling).toBe('dynamic')
  })

  it('classifies require() call as runtime with runtimeWeight=1', async () => {
    const root = mkTmp()

    write(
      root,
      'tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
        },
        include: ['src/**/*'],
      }),
    )
    write(root, 'src/target.ts', 'export const x = 1\nexport type X = number\n')
    // Use declare to let tsc parse require without error in module context
    write(
      root,
      'src/require-user.ts',
      "declare function require(id: string): unknown\nconst m = require('./target.js')\nexport {}\n",
    )

    const targetAbs = join(root, 'src/target.ts')
    const requireAbs = join(root, 'src/require-user.ts')

    const programs = await createProgramManager({
      projectRoot: root,
      files: [requireAbs, targetAbs],
    })
    const ignore = createIgnoreMatcher({ patterns: [], includeDefaults: true })
    const log = pino({ level: 'silent' })

    const result = await coreTsImportsAnalyzer.run({
      projectRoot: root,
      programs,
      files: [requireAbs, targetAbs],
      ignore,
      log,
      config: DEFAULT_CONFIG,
    })

    const edge = result.edges.find((e) => e.from === 'file:src/require-user.ts')
    expect(edge).toBeDefined()
    expect(edge?.runtimeWeight).toBe(1)
    expect(edge?.dynamicWeight).toBe(0)
    expect(edge?.typeOnlyWeight).toBe(0)

    const ev = result.evidence.find((e) => e.file === 'src/require-user.ts')
    expect(ev).toBeDefined()
    expect(ev?.coupling).toBe('runtime')
  })

  it('barrel re-export fixture: emits 3 edges (consumer→barrel, barrel→target×2)', async () => {
    const root = mkTmp()

    write(
      root,
      'tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
        },
        include: ['**/*'],
      }),
    )
    // barrel.ts: two export-from forms — namespace re-export AND named re-export
    write(
      root,
      'barrel.ts',
      "export * from './target.js'\nexport { specific } from './target.js'\n",
    )
    // target.ts: the actual source of truth
    write(root, 'target.ts', 'export const specific = 1\nexport const wild = 2\n')
    // consumer.ts: imports from the barrel
    write(
      root,
      'consumer.ts',
      "import { specific, wild } from './barrel.js'\nconsole.log(specific, wild)\n",
    )

    const barrelAbs = join(root, 'barrel.ts')
    const targetAbs = join(root, 'target.ts')
    const consumerAbs = join(root, 'consumer.ts')

    const programs = await createProgramManager({
      projectRoot: root,
      files: [barrelAbs, targetAbs, consumerAbs],
    })
    const ignore = createIgnoreMatcher({ patterns: [], includeDefaults: true })
    const log = pino({ level: 'silent' })

    const result = await coreTsImportsAnalyzer.run({
      projectRoot: root,
      programs,
      files: [barrelAbs, targetAbs, consumerAbs],
      ignore,
      log,
      config: DEFAULT_CONFIG,
    })

    // 3 raw edges: consumer→barrel (1), barrel→target (2: one per export declaration)
    expect(result.edges).toHaveLength(3)

    const fromConsumer = result.edges.filter((e) => e.from === 'file:consumer.ts')
    expect(fromConsumer).toHaveLength(1)
    expect(fromConsumer[0]?.to).toBe('file:barrel.ts')

    const fromBarrel = result.edges.filter((e) => e.from === 'file:barrel.ts')
    expect(fromBarrel).toHaveLength(2)
    expect(fromBarrel.every((e) => e.to === 'file:target.ts')).toBe(true)

    // Verify evidence count and file attribution
    expect(result.evidence).toHaveLength(3)
    const consumerEv = result.evidence.filter((ev) => ev.file === 'consumer.ts')
    expect(consumerEv).toHaveLength(1)
    const barrelEv = result.evidence.filter((ev) => ev.file === 'barrel.ts')
    expect(barrelEv).toHaveLength(2)
  })

  it('classifies export type { X } from as type-only with typeOnlyWeight=1', async () => {
    const root = mkTmp()

    write(
      root,
      'tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
        },
        include: ['src/**/*'],
      }),
    )
    write(root, 'src/target.ts', 'export const x = 1\nexport type X = number\n')
    write(root, 'src/reexport-type.ts', "export type { X } from './target.js'\n")

    const targetAbs = join(root, 'src/target.ts')
    const reexportTypeAbs = join(root, 'src/reexport-type.ts')

    const programs = await createProgramManager({
      projectRoot: root,
      files: [reexportTypeAbs, targetAbs],
    })
    const ignore = createIgnoreMatcher({ patterns: [], includeDefaults: true })
    const log = pino({ level: 'silent' })

    const result = await coreTsImportsAnalyzer.run({
      projectRoot: root,
      programs,
      files: [reexportTypeAbs, targetAbs],
      ignore,
      log,
      config: DEFAULT_CONFIG,
    })

    const edge = result.edges.find((e) => e.from === 'file:src/reexport-type.ts')
    expect(edge).toBeDefined()
    expect(edge?.typeOnlyWeight).toBe(1)
    expect(edge?.runtimeWeight).toBe(0)
    expect(edge?.dynamicWeight).toBe(0)

    const ev = result.evidence.find((e) => e.file === 'src/reexport-type.ts')
    expect(ev).toBeDefined()
    expect(ev?.coupling).toBe('type-only')
  })
})

describe('coreTsImportsAnalyzer under an umbrella root tsconfig', () => {
  // End-to-end guard for the collapse that made a 7001-file repo report 15 import
  // edges. The analyzer skips any file the Program lacks a SourceFile for, so an
  // umbrella root config that compiles almost nothing used to silence the whole
  // tree. See the matching invariant test in program-manager.test.ts.
  it('emits src -> src edges the root config never included', async () => {
    const root = mkTmp()

    write(
      root,
      'tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          allowJs: true,
          target: 'ES2022',
          module: 'esnext',
          moduleResolution: 'bundler',
        },
        include: ['*.config.*'],
      }),
    )
    write(root, 'eslint.config.js', 'export default []\n')
    write(root, 'src/a.ts', "import { foo } from './b'\nexport const x = foo\n")
    write(root, 'src/b.ts', 'export const foo = 1\n')

    const files = [join(root, 'src/a.ts'), join(root, 'src/b.ts')]
    const programs = await createProgramManager({ projectRoot: root, files })
    const ignore = createIgnoreMatcher({ patterns: [], includeDefaults: true })
    const log = pino({ level: 'silent' })

    const result = await coreTsImportsAnalyzer.run({
      projectRoot: root,
      programs,
      files,
      ignore,
      log,
      config: DEFAULT_CONFIG,
    })

    const edge = result.edges.find((e) => e.from === 'file:src/a.ts')
    expect(edge, 'src/a.ts emitted no import edge').toBeDefined()
    expect(edge?.to).toBe('file:src/b.ts')
  })
})

describe('reportProgramCoverage', () => {
  const capture = () => {
    const events: Array<{ level: string; msg: string }> = []
    const log = {
      warn: (_o: unknown, msg: string) => events.push({ level: 'warn', msg }),
      debug: (_o: unknown, msg: string) => events.push({ level: 'debug', msg }),
    } as unknown as Parameters<typeof reportProgramCoverage>[0]
    return { events, log }
  }

  it('says nothing when every file made it into the Program', () => {
    const { events, log } = capture()
    reportProgramCoverage(log, 100, 0)
    expect(events).toEqual([])
  })

  it('stays quiet at debug for a small, ordinary shortfall', () => {
    const { events, log } = capture()
    reportProgramCoverage(log, 100, 5)
    expect(events.map((e) => e.level)).toEqual(['debug'])
  })

  // Three separate bugs shipped undetected because a collapsed graph looks exactly
  // like a clean one: a full file count, a near-empty edge set, and a scan that
  // reports success. Below the threshold it has to announce itself.
  it('warns loudly once most files are missing', () => {
    const { events, log } = capture()
    reportProgramCoverage(log, 100, 50)
    expect(events).toHaveLength(1)
    expect(events[0]?.level).toBe('warn')
    expect(events[0]?.msg).toContain('only 50 of 100')
    expect(events[0]?.msg).toContain('unreliable')
  })

  it('does not divide by zero on an empty file set', () => {
    const { events, log } = capture()
    reportProgramCoverage(log, 0, 0)
    expect(events).toEqual([])
  })
})
