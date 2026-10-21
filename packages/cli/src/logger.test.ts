import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { createCliLogger } from './logger.js'

class MemoryStream extends Writable {
  chunks: string[] = []

  _write(chunk: Buffer | string, _encoding: string, callback: () => void): void {
    this.chunks.push(chunk.toString('utf-8'))
    callback()
  }

  get text(): string {
    return this.chunks.join('')
  }
}

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

describe('createCliLogger', () => {
  it('default mode: log.level is info', () => {
    const log = createCliLogger({ json: false, quiet: false })
    expect(log.level).toBe('info')
  })

  it('--quiet mode: log.level is warn', () => {
    const log = createCliLogger({ json: false, quiet: true })
    expect(log.level).toBe('warn')
  })

  it('--json --quiet: log.level is warn', () => {
    const log = createCliLogger({ json: true, quiet: true })
    expect(log.level).toBe('warn')
  })

  it('--json mode: writes valid JSON lines', async () => {
    const dest = new MemoryStream()
    const log = createCliLogger({ json: true, quiet: false, destination: dest })
    log.info({ event: 'scan:start' }, 'starting')
    await flush()
    const lines = dest.text.split('\n').filter((l) => l.length > 0)
    expect(lines.length).toBeGreaterThan(0)
    const parsed: unknown = JSON.parse(lines.at(0) ?? '')
    expect((parsed as Record<string, unknown>).msg).toBe('starting')
    expect((parsed as Record<string, unknown>).event).toBe('scan:start')
    expect(typeof (parsed as Record<string, unknown>).level).toBe('number')
  })

  it('--quiet suppresses info, allows warn (json mode)', async () => {
    const dest = new MemoryStream()
    const log = createCliLogger({ json: true, quiet: true, destination: dest })
    log.info('should be suppressed')
    log.warn('should appear')
    await flush()
    expect(dest.text).not.toContain('should be suppressed')
    expect(dest.text).toContain('should appear')
  })

  it('--json --quiet: warn-level JSON only', async () => {
    const dest = new MemoryStream()
    const log = createCliLogger({ json: true, quiet: true, destination: dest })
    log.warn('a warning')
    await flush()
    const lines = dest.text.split('\n').filter((l) => l.length > 0)
    expect(lines.length).toBe(1)
    const parsed: unknown = JSON.parse(lines.at(0) ?? '')
    expect((parsed as Record<string, unknown>).msg).toBe('a warning')
    // pino level 40 = warn
    expect((parsed as Record<string, unknown>).level).toBe(40)
  })

  it('pretty mode does NOT emit raw JSON when destination injected via pretty options', async () => {
    const dest = new MemoryStream()
    const log = createCliLogger({ json: false, quiet: false, destination: dest })
    log.info('plain message')
    await flush()
    expect(dest.text).toContain('plain message')
    // pretty output doesn't start with { (no raw JSON)
    expect(dest.text.trimStart().startsWith('{')).toBe(false)
  })
})
