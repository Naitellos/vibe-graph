import { describe, expect, it } from 'vitest'
import { findMisplacedRootFlag, parseBareArgs, shouldRunBareOverview } from './bare-args.js'

describe('shouldRunBareOverview', () => {
  it('true for no args, boolean flags, and value flags (space or equals)', () => {
    expect(shouldRunBareOverview([])).toBe(true)
    expect(shouldRunBareOverview(['--json'])).toBe(true)
    expect(shouldRunBareOverview(['--root', '/tmp', '--json'])).toBe(true)
    expect(shouldRunBareOverview(['--root=/tmp'])).toBe(true)
    expect(shouldRunBareOverview(['--port', '55123', '--cockpit'])).toBe(true)
  })
  it('false for a real subcommand', () => {
    expect(shouldRunBareOverview(['scan'])).toBe(false)
    expect(shouldRunBareOverview(['scan', '--root', '/tmp'])).toBe(false)
    expect(shouldRunBareOverview(['cockpit', '--port', '55123'])).toBe(false)
    // regression: `stats` is a registered subcommand — it must not be
    // swallowed by the bare-overview flow (was missing from SUBCOMMAND_NAMES).
    expect(shouldRunBareOverview(['stats'])).toBe(false)
  })
  it('false for help/version (let citty handle)', () => {
    expect(shouldRunBareOverview(['--help'])).toBe(false)
    expect(shouldRunBareOverview(['-h'])).toBe(false)
    expect(shouldRunBareOverview(['--version'])).toBe(false)
  })
  it('treats a --root value equal to a subcommand name as a value, not a subcommand', () => {
    expect(shouldRunBareOverview(['--root', 'scan'])).toBe(true)
  })
})

describe('parseBareArgs', () => {
  it('parses --root and --port in space form', () => {
    expect(parseBareArgs(['--root', '/tmp/p', '--port', '55123'])).toMatchObject({
      root: '/tmp/p',
      port: 55123,
    })
  })
  it('parses --root and --port in equals form', () => {
    expect(parseBareArgs(['--root=/tmp/p', '--port=55123'])).toMatchObject({
      root: '/tmp/p',
      port: 55123,
    })
  })
  it('parses boolean flags', () => {
    expect(
      parseBareArgs(['--cockpit', '--json', '--quiet', '--no-open', '--rescan']),
    ).toMatchObject({
      cockpit: true,
      json: true,
      quiet: true,
      noOpen: true,
      rescan: true,
    })
  })
  it('defaults booleans to false and leaves root/port undefined when absent', () => {
    const r = parseBareArgs([])
    expect(r.cockpit).toBe(false)
    expect(r.json).toBe(false)
    expect(r.root).toBeUndefined()
    expect(r.port).toBeUndefined()
  })
  it('returns portError for an invalid --port', () => {
    expect(parseBareArgs(['--port', 'abc']).portError).toBe(true)
    expect(parseBareArgs(['--port', '70000']).portError).toBe(true)
  })
  it('flags --port with no following value as portError', () => {
    expect(parseBareArgs(['--port']).portError).toBe(true)
  })
})

describe('findMisplacedRootFlag', () => {
  it('flags --root=<v> given before a subcommand', () => {
    expect(findMisplacedRootFlag(['--root=/tmp/x', 'scan'])).toMatchObject({
      flag: '--root=/tmp/x',
      subcommand: 'scan',
    })
  })
  it('flags space-form --root given before a subcommand, keeping its value', () => {
    expect(findMisplacedRootFlag(['--root', '/tmp/x', 'validate-diff'])).toEqual({
      flag: '--root',
      value: '/tmp/x',
      subcommand: 'validate-diff',
    })
  })
  // The suggestion must be runnable as printed. `vibe-graph scan --root` with no
  // path is silently ignored — the exact class of bug this guard exists to stop.
  it('carries the value so the suggested command is not itself broken', () => {
    const m = findMisplacedRootFlag(['--root', '/tmp/x', 'scan'])
    expect(`${m.flag}${m.value ? ` ${m.value}` : ''}`).toBe('--root /tmp/x')
  })
  it('leaves value undefined for the equals form, which is self-contained', () => {
    expect(findMisplacedRootFlag(['--root=/tmp/x', 'scan']).value).toBeUndefined()
  })
  it('looks past other root-level flags', () => {
    expect(findMisplacedRootFlag(['--root=/tmp/x', '--json', 'check'])?.subcommand).toBe('check')
  })
  it('is silent for the correct placement (after the subcommand)', () => {
    expect(findMisplacedRootFlag(['scan', '--root=/tmp/x'])).toBeUndefined()
    expect(findMisplacedRootFlag(['baseline', '--root', '/tmp/x'])).toBeUndefined()
  })
  it('is silent for bare invocations, which parse --root themselves', () => {
    expect(findMisplacedRootFlag(['--root=/tmp/x'])).toBeUndefined()
    expect(findMisplacedRootFlag(['--root', '/tmp/x', '--cockpit'])).toBeUndefined()
    expect(findMisplacedRootFlag([])).toBeUndefined()
  })
  it('treats a --root value equal to a subcommand name as a value, not a subcommand', () => {
    expect(findMisplacedRootFlag(['--root', 'scan'])).toBeUndefined()
  })
  it('ignores unrelated root-level flags', () => {
    expect(findMisplacedRootFlag(['--json', 'scan'])).toBeUndefined()
  })
})
