import { type ArgsDef, parseArgs } from 'citty'
import { describe, expect, it } from 'vitest'
import { checkCommand } from './check.js'
import { initCommand } from './init.js'
import { validateDiffCommand } from './validate-diff.js'

// citty is backed by mri, which does NOT kebab-map camelCase keys: a flag
// declared as `sinceBaseline` is only reachable as `--sinceBaseline` unless the
// arg explicitly declares `alias: 'since-baseline'`. This test drives the real
// parser to prove every multi-word flag accepts its conventional kebab form, and
// fails if a future multi-word flag is added without an alias.

const toKebab = (s: string): string => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)

const COMMANDS: Array<{ name: string; args: ArgsDef }> = [
  { name: 'check', args: checkCommand.args as ArgsDef },
  { name: 'init', args: initCommand.args as ArgsDef },
  { name: 'validate-diff', args: validateDiffCommand.args as ArgsDef },
]

describe('CLI multi-word flags accept a kebab-case form', () => {
  for (const { name, args } of COMMANDS) {
    for (const [key, def] of Object.entries(args)) {
      if (def.type === 'positional') continue
      if (!/[A-Z]/.test(key)) continue

      const kebab = toKebab(key)
      it(`${name}: --${kebab} maps to ${key}`, () => {
        const rawArgs = def.type === 'string' ? [`--${kebab}`, 'x'] : [`--${kebab}`]
        const parsed = parseArgs(rawArgs, args)
        expect(parsed[key]).toBe(def.type === 'string' ? 'x' : true)
      })
    }
  }
})
