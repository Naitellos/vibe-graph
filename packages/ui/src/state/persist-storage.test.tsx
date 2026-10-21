import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDebouncedStorage } from './persist-storage.js'

describe('createDebouncedStorage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  it('getItem returns null when key is absent', () => {
    const storage = createDebouncedStorage()
    expect(storage.getItem('missing')).toBeNull()
  })

  it('getItem returns parsed value after a synchronous localStorage seed', () => {
    const storage = createDebouncedStorage()
    const value = { state: { x: 1 }, version: 0 }
    localStorage.setItem('key', JSON.stringify(value))
    expect(storage.getItem('key')).toEqual(value)
  })

  it('getItem returns null on malformed JSON', () => {
    const storage = createDebouncedStorage()
    localStorage.setItem('bad', 'not-json{{{')
    expect(storage.getItem('bad')).toBeNull()
  })

  it('setItem writes to localStorage after 300ms', () => {
    const storage = createDebouncedStorage({ delay: 300 })
    const value = { state: { leftWidth: 400 }, version: 0 }
    storage.setItem('vibegraph.layout', value)

    // Not yet written
    expect(localStorage.getItem('vibegraph.layout')).toBeNull()

    vi.advanceTimersByTime(300)

    const raw = localStorage.getItem('vibegraph.layout')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw ?? '')).toEqual(value)
  })

  it('setItem does NOT write before 300ms', () => {
    const storage = createDebouncedStorage({ delay: 300 })
    storage.setItem('key', { state: {}, version: 0 })
    vi.advanceTimersByTime(299)
    expect(localStorage.getItem('key')).toBeNull()
  })

  it('two rapid setItem calls on the same key result in exactly one localStorage write', () => {
    const storage = createDebouncedStorage({ delay: 300 })
    const spy = vi.spyOn(Storage.prototype, 'setItem')

    storage.setItem('key', { state: { v: 1 }, version: 0 })
    storage.setItem('key', { state: { v: 2 }, version: 0 })

    vi.advanceTimersByTime(300)

    // Only one actual write
    expect(spy).toHaveBeenCalledTimes(1)
    const raw = localStorage.getItem('key')
    expect(JSON.parse(raw ?? '').state.v).toBe(2)
    spy.mockRestore()
  })

  it('removeItem cancels pending timer and removes synchronously', () => {
    const storage = createDebouncedStorage({ delay: 300 })
    storage.setItem('key', { state: { v: 1 }, version: 0 })

    // Seed something in localStorage so we can verify removal
    localStorage.setItem('key', JSON.stringify({ state: { v: 0 }, version: 0 }))

    storage.removeItem('key')

    // The pending write should be cancelled
    vi.advanceTimersByTime(300)
    expect(localStorage.getItem('key')).toBeNull()
  })

  it('removeItem removes an existing key synchronously', () => {
    const storage = createDebouncedStorage()
    localStorage.setItem('key', 'value')
    storage.removeItem('key')
    expect(localStorage.getItem('key')).toBeNull()
  })

  it('uses delay=300 as default', () => {
    const storage = createDebouncedStorage()
    storage.setItem('key', { state: {}, version: 0 })
    vi.advanceTimersByTime(299)
    expect(localStorage.getItem('key')).toBeNull()
    vi.advanceTimersByTime(1)
    expect(localStorage.getItem('key')).not.toBeNull()
  })
})
