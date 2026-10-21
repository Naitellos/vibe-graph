export async function load() {
  const m = await import('./lazy.js')
  return m.lazy
}
