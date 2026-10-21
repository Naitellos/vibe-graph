function parse(v: string): [number, number, number] {
  const m = v.replace(/^v/, '').split('-')[0]?.split('.') ?? []
  return [Number(m[0] ?? 0), Number(m[1] ?? 0), Number(m[2] ?? 0)]
}

/** Pure: is `current` Node >= `min`? Returns a message when not. */
export function assertNodeVersion(current: string, min: string): { ok: boolean; message?: string } {
  const [cMaj, cMin, cPatch] = parse(current)
  const [nMaj, nMin, nPatch] = parse(min)
  const ok = cMaj > nMaj || (cMaj === nMaj && (cMin > nMin || (cMin === nMin && cPatch >= nPatch)))
  if (ok) return { ok: true }
  return {
    ok: false,
    message: `vibe-graph requires Node >= ${min}, but you are on ${current}. Upgrade Node (e.g. via nvm) and retry.`,
  }
}
