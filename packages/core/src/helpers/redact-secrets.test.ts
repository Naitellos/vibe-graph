import { describe, expect, it } from 'vitest'
import { redactSecrets } from './redact-secrets.js'

describe('redactSecrets', () => {
  // Test 1: OpenAI key
  it('redacts sk- OpenAI key', () => {
    const input = 'token: sk-abc1234567890ABC123456'
    const result = redactSecrets(input)
    expect(result.text).toBe('token: <REDACTED:openai-key>')
    expect(result.redactions.byKind['openai-key']).toBe(1)
    expect(result.redactions.totalCount).toBe(1)
  })

  // Test 2: Anthropic key (sk-ant-...) — same kind as openai-key per spec
  it('redacts sk-ant- Anthropic key under openai-key kind', () => {
    const input = 'ANTHROPIC_KEY=sk-ant-abc123-def456-ghi789-jkl012'
    const result = redactSecrets(input)
    expect(result.text).toContain('<REDACTED:openai-key>')
    expect(result.redactions.byKind['openai-key']).toBeGreaterThanOrEqual(1)
    expect(result.redactions.totalCount).toBeGreaterThanOrEqual(1)
  })

  // Test 3: JWT token
  it('redacts JWT tokens', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
    const input = `Authorization: Bearer ${jwt}`
    const result = redactSecrets(input)
    expect(result.text).toBe('Authorization: Bearer <REDACTED:jwt>')
    expect(result.redactions.byKind.jwt).toBe(1)
    expect(result.redactions.totalCount).toBe(1)
  })

  // Test 4: Private key block (multi-line)
  it('redacts PEM private key blocks', () => {
    const input = [
      '-----BEGIN PRIVATE KEY-----',
      'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...',
      '-----END PRIVATE KEY-----',
    ].join('\n')
    const result = redactSecrets(input)
    expect(result.text).toBe('<REDACTED:private-key>')
    expect(result.redactions.byKind['private-key']).toBe(1)
    expect(result.redactions.totalCount).toBe(1)
  })

  // Test 4b: RSA private key variant
  it('redacts RSA private key blocks', () => {
    const input = [
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIEowIBAAKCAQEA1234567890abcdefghijklmnop...',
      '-----END RSA PRIVATE KEY-----',
    ].join('\n')
    const result = redactSecrets(input)
    expect(result.text).toBe('<REDACTED:private-key>')
    expect(result.redactions.byKind['private-key']).toBe(1)
  })

  // Test 5: Env-style assignment (multiple forms)
  it('redacts API_KEY= assignment', () => {
    const input = 'API_KEY=abc12345678901234567'
    const result = redactSecrets(input)
    expect(result.text).toBe('<REDACTED:env-secret>')
    expect(result.redactions.byKind['env-secret']).toBe(1)
  })

  it('redacts apiKey="..." assignment (case-insensitive)', () => {
    const input = 'apiKey="secret-value-1234567890"'
    const result = redactSecrets(input)
    // The pattern consumes up to and including the value characters; the trailing
    // closing quote is not part of the matched value so it may remain.
    expect(result.text).toContain('<REDACTED:env-secret>')
    expect(result.text).not.toContain('secret-value-1234567890')
    expect(result.redactions.byKind['env-secret']).toBe(1)
  })

  it('redacts SECRET: assignment', () => {
    const input = 'SECRET: somelongsecretvalue123'
    const result = redactSecrets(input)
    expect(result.text).toBe('<REDACTED:env-secret>')
    expect(result.redactions.byKind['env-secret']).toBe(1)
  })

  // Test 6: Multiple secrets in one input
  it('handles multiple secrets in one input with correct totalCount', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
    const privateKey = [
      '-----BEGIN PRIVATE KEY-----',
      'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEA...',
      '-----END PRIVATE KEY-----',
    ].join('\n')
    const input = [
      'token: sk-abc1234567890ABC123456',
      `auth: Bearer ${jwt}`,
      'DB_PASSWORD=supersecretpassword1234',
      privateKey,
    ].join('\n')
    const result = redactSecrets(input)
    expect(result.redactions.totalCount).toBe(4)
    expect(result.redactions.byKind['openai-key']).toBe(1)
    expect(result.redactions.byKind.jwt).toBe(1)
    expect(result.redactions.byKind['env-secret']).toBe(1)
    expect(result.redactions.byKind['private-key']).toBe(1)
  })

  // Test 7: No secrets — text unchanged
  it('returns text unchanged when no secrets present', () => {
    const input = 'const x = 1\nconst y = "hello"\n'
    const result = redactSecrets(input)
    expect(result.text).toBe(input)
    expect(result.redactions.totalCount).toBe(0)
    expect(result.redactions.byKind['openai-key']).toBe(0)
    expect(result.redactions.byKind.jwt).toBe(0)
    expect(result.redactions.byKind['private-key']).toBe(0)
    expect(result.redactions.byKind['env-secret']).toBe(0)
    expect(result.redactions.byKind['high-entropy']).toBe(0)
  })

  // Test 8: Non-matching short strings unchanged
  it('does not redact sk-short (too short)', () => {
    const input = 'sk-short'
    const result = redactSecrets(input)
    expect(result.text).toBe('sk-short')
    expect(result.redactions.totalCount).toBe(0)
  })

  // Test 9: enableHighEntropy=false (default) — high-entropy strings NOT redacted
  it('does not redact high-entropy strings when enableHighEntropy is false (default)', () => {
    // A long base64-like string that might have high entropy
    const input = 'data: dGhpcyBpcyBhIHZlcnkgbG9uZyBiYXNlNjQgc3RyaW5nIHRoYXQgbWlnaHQgYmUgc2VjcmV0'
    const result = redactSecrets(input)
    // Should not redact since enableHighEntropy defaults to false
    expect(result.redactions.byKind['high-entropy']).toBe(0)
    // The text itself should be preserved (not contain <REDACTED:high-entropy>)
    expect(result.text).not.toContain('<REDACTED:high-entropy>')
  })

  // Test 10: byKind object always has all 5 keys initialized
  it('always initializes all 5 byKind keys even with no secrets', () => {
    const result = redactSecrets('nothing secret here')
    expect(result.redactions.byKind).toHaveProperty('openai-key', 0)
    expect(result.redactions.byKind).toHaveProperty('jwt', 0)
    expect(result.redactions.byKind).toHaveProperty('private-key', 0)
    expect(result.redactions.byKind).toHaveProperty('env-secret', 0)
    expect(result.redactions.byKind).toHaveProperty('high-entropy', 0)
  })
})
