// test/e2e/cockpit-prepare-task-route.test.ts
//
// E2E: POST /api/prepare-task — happy path + validation errors.
//
// Fixture: fixtures/synthetic/rich-yaml
//   payments subsystem: match: src/payments/**
//   → src/payments/transactions.ts is a real file under that glob.
//
// The cockpit `default` command scans the fixture on boot, so a snapshot with
// subsystems is available before the first test runs.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type ServerHandle, startCliServerInFixture, stopCliServer } from './helpers/cli-server.js'

let server: ServerHandle
beforeAll(async () => {
  server = await startCliServerInFixture('fixtures/synthetic/rich-yaml')
}, 30_000)
afterAll(async () => {
  await stopCliServer(server)
})

describe('POST /api/prepare-task', () => {
  it('returns { ok:true, data } for valid input', async () => {
    const res = await fetch(`${server.baseUrl}/api/prepare-task`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        intent: 'refactor x',
        paths: ['src/payments/transactions.ts'],
        mode: 'refactor',
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.data).toMatchObject({
      taskId: expect.any(String),
      target: expect.any(Object),
      summary: expect.any(String),
      risks: expect.any(Array),
      rules: expect.any(Array),
      doNotDo: expect.any(Array),
      requiredContext: expect.any(Object),
      recommendations: expect.any(Array),
      tests: expect.any(Array),
    })
  })

  it('returns 400 for empty intent', async () => {
    const res = await fetch(`${server.baseUrl}/api/prepare-task`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ intent: '', paths: ['x'], mode: 'refactor' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 for empty paths', async () => {
    const res = await fetch(`${server.baseUrl}/api/prepare-task`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ intent: 'x', paths: [], mode: 'refactor' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 500 TARGET_NOT_FOUND for nonexistent paths', async () => {
    const res = await fetch(`${server.baseUrl}/api/prepare-task`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ intent: 'x', paths: ['nonexistent/path.ts'], mode: 'refactor' }),
    })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.code).toBe('TARGET_NOT_FOUND')
  })
})
