import { describe, expect, it } from 'vitest'
import { formatTimeAgo } from './format-time-ago.js'

describe('formatTimeAgo', () => {
  describe('just now (diff < 30s)', () => {
    it('returns just now for 10 seconds ago', () => {
      expect(formatTimeAgo('2026-05-25T12:00:00Z', new Date('2026-05-25T12:00:10Z'))).toBe(
        'just now',
      )
    })

    it('returns just now for 0 seconds ago', () => {
      expect(formatTimeAgo('2026-05-25T12:00:00Z', new Date('2026-05-25T12:00:00Z'))).toBe(
        'just now',
      )
    })

    it('returns just now for 29 seconds ago', () => {
      expect(formatTimeAgo('2026-05-25T12:00:00Z', new Date('2026-05-25T12:00:29Z'))).toBe(
        'just now',
      )
    })
  })

  describe('seconds ago (30s <= diff < 60s)', () => {
    it('returns 42s ago for 42 seconds ago', () => {
      expect(formatTimeAgo('2026-05-25T12:00:00Z', new Date('2026-05-25T12:00:42Z'))).toBe(
        '42s ago',
      )
    })

    it('returns 30s ago at boundary 30 seconds', () => {
      expect(formatTimeAgo('2026-05-25T12:00:00Z', new Date('2026-05-25T12:00:30Z'))).toBe(
        '30s ago',
      )
    })

    it('returns 59s ago for 59 seconds ago', () => {
      expect(formatTimeAgo('2026-05-25T12:00:00Z', new Date('2026-05-25T12:00:59Z'))).toBe(
        '59s ago',
      )
    })
  })

  describe('minutes ago (60s <= diff < 60m)', () => {
    it('returns 2m ago for 2 minutes ago', () => {
      expect(formatTimeAgo('2026-05-25T12:00:00Z', new Date('2026-05-25T12:02:00Z'))).toBe('2m ago')
    })

    it('returns 1m ago at boundary exactly 60 seconds', () => {
      expect(formatTimeAgo('2026-05-25T12:00:00Z', new Date('2026-05-25T12:01:00Z'))).toBe('1m ago')
    })

    it('returns 59m ago for 59 minutes ago', () => {
      expect(formatTimeAgo('2026-05-25T12:00:00Z', new Date('2026-05-25T12:59:00Z'))).toBe(
        '59m ago',
      )
    })
  })

  describe('hours ago (60m <= diff < 24h)', () => {
    it('returns 3h ago for 3 hours ago', () => {
      expect(formatTimeAgo('2026-05-25T12:00:00Z', new Date('2026-05-25T15:00:00Z'))).toBe('3h ago')
    })

    it('returns 1h ago at boundary exactly 60 minutes', () => {
      expect(formatTimeAgo('2026-05-25T12:00:00Z', new Date('2026-05-25T13:00:00Z'))).toBe('1h ago')
    })

    it('returns 23h ago for 23 hours ago', () => {
      expect(formatTimeAgo('2026-05-25T12:00:00Z', new Date('2026-05-26T11:00:00Z'))).toBe(
        '23h ago',
      )
    })
  })

  describe('days ago (diff >= 24h)', () => {
    it('returns 4d ago for 4 days ago', () => {
      expect(formatTimeAgo('2026-05-25T12:00:00Z', new Date('2026-05-29T12:00:00Z'))).toBe('4d ago')
    })

    it('returns 1d ago at boundary exactly 24 hours', () => {
      expect(formatTimeAgo('2026-05-25T12:00:00Z', new Date('2026-05-26T12:00:00Z'))).toBe('1d ago')
    })
  })

  describe('edge cases', () => {
    it('returns unknown for invalid ISO string', () => {
      expect(formatTimeAgo('not-a-date', new Date('2026-05-25T12:00:00Z'))).toBe('unknown')
    })

    it('returns just now for future builtAt (clock skew, negative diff)', () => {
      expect(formatTimeAgo('2026-05-25T13:00:00Z', new Date('2026-05-25T12:00:00Z'))).toBe(
        'just now',
      )
    })
  })
})
