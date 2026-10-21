import type { ProjectOverview } from '@codearch/core'

const sigil = (sev: string): string =>
  sev === 'high' ? '❌ high  ' : sev === 'medium' ? '⚠  med  ' : '·  low  '

export function renderOneLineSummary(o: ProjectOverview): string {
  return `vibe-graph: ${o.counts.subsystems} subsystems · ${o.counts.files} files · ${o.counts.findings} findings`
}

export function renderOverview(o: ProjectOverview): string {
  const lines: string[] = []
  lines.push(`🔭 Vibe Graph — ${o.project.name}`)
  lines.push(
    `   ${o.counts.subsystems} subsystems · ${o.counts.files} files · ${o.counts.edges} edges · ${o.counts.externalPackages} external packages`,
  )
  lines.push('')

  if (o.subsystemLayers.length > 0) {
    lines.push(
      `Layers   ${o.subsystemLayers.map((l) => `${l.layer} ${l.subsystemCount}`).join(' · ')}`,
    )
    lines.push('')
  }

  if (o.counts.findings === 0) {
    lines.push('✓ No architecture risks found.')
  } else {
    lines.push(`Top risks (${o.counts.findings} findings)`)
    for (const f of o.topFindings) {
      const loc = f.location
        ? ` · ${f.location.file}${f.location.line !== undefined ? `:${f.location.line}` : ''}`
        : ''
      lines.push(`   ${sigil(f.severity)} ${f.title}   (${f.type}${loc})`)
    }
  }
  lines.push('')

  const realHubs = o.topHubs.filter((h) => h.fanIn + h.fanOut > 0)
  if (realHubs.length > 0) {
    lines.push('Most-connected subsystems (blast radius)')
    for (const h of realHubs) lines.push(`   ${h.title}   ⬆ ${h.fanIn}  ⬇ ${h.fanOut}`)
    lines.push('')
  }

  if (o.autoDetected) {
    lines.push(
      `(${o.counts.subsystems} areas detected heuristically — refine with \`vibe-graph init\`)`,
    )
  }
  lines.push('Connect your AI agent:  vibe-graph init')
  return lines.join('\n')
}
