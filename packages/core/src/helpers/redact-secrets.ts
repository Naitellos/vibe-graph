/**
 * redact-secrets — scrubs common secret patterns from text before including it
 * in context packs or logs.
 *
 * Patterns (applied in order, precedence matters):
 *   1. private-key  — PEM PRIVATE KEY blocks (multiline first, no sub-matching)
 *   2. jwt          — JSON Web Tokens (eyJ…)
 *   3. openai-key   — sk-ant-… (Anthropic) and sk-… (OpenAI), specific before generic
 *   4. env-secret   — SECRET/TOKEN/PASSWORD/API_KEY/ACCESS_KEY assignments
 *
 * High-entropy detection (kind: 'high-entropy') is supported in the type but
 * intentionally NOT implemented for v0 — too noisy in practice. The counter
 * is always initialized to 0 and the option is silently ignored.
 * TODO(v1): implement Shannon-entropy scan for base64-like tokens ≥40 chars.
 */

export type SecretKind = 'openai-key' | 'jwt' | 'private-key' | 'env-secret' | 'high-entropy'

export interface RedactOptions {
  /** Enable high-entropy detection (default: false — too noisy). */
  enableHighEntropy?: boolean
}

export interface RedactResult {
  text: string
  redactions: {
    totalCount: number
    byKind: Record<SecretKind, number>
  }
}

/** Ordered list of patterns. Order is significant — private keys first, then
 *  narrower sk-ant before generic sk-, then JWT, then env-style (most generic). */
const PATTERNS: ReadonlyArray<{ kind: SecretKind; re: RegExp }> = [
  // 1. Private keys — multiline blocks first so content isn't sub-matched by other patterns
  {
    kind: 'private-key',
    re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g,
  },
  // 2. JWTs — three base64url segments separated by dots
  {
    kind: 'jwt',
    re: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
  },
  // 3a. Anthropic keys (sk-ant-…) — more specific, must run before generic sk-
  {
    kind: 'openai-key',
    re: /sk-ant-[a-zA-Z0-9-]{20,}/g,
  },
  // 3b. OpenAI keys (sk-…)
  {
    kind: 'openai-key',
    re: /sk-[a-zA-Z0-9]{20,}/g,
  },
  // 4. Env-style assignments — case-insensitive, most generic, runs last
  {
    kind: 'env-secret',
    re: /(?:SECRET|TOKEN|PASSWORD|API[_-]?KEY|ACCESS[_-]?KEY)["']?\s*[=:]\s*["']?[a-zA-Z0-9+/=_-]{16,}/gi,
  },
]

export function redactSecrets(input: string, options: RedactOptions = {}): RedactResult {
  const byKind: Record<SecretKind, number> = {
    'openai-key': 0,
    jwt: 0,
    'private-key': 0,
    'env-secret': 0,
    'high-entropy': 0,
  }

  let text = input

  for (const { kind, re } of PATTERNS) {
    // Reset lastIndex before each use — important for reusable /g regexes
    re.lastIndex = 0
    text = text.replace(re, () => {
      byKind[kind]++
      return `<REDACTED:${kind}>`
    })
  }

  // High-entropy detection — NOT implemented for v0 (default off, always 0).
  // The `options.enableHighEntropy` flag is accepted but ignored.
  // TODO(v1): scan remaining tokens for base64-like strings ≥40 chars with Shannon entropy >4.5.
  void options.enableHighEntropy

  const totalCount = (Object.values(byKind) as number[]).reduce((a, b) => a + b, 0)

  return { text, redactions: { totalCount, byKind } }
}
