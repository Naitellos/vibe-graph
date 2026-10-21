import type React from 'react'

export interface SectionProps {
  title: string
  empty?: boolean
  emptyMessage?: string
  children?: React.ReactNode
}

export function Section({ title, empty, emptyMessage, children }: SectionProps): React.JSX.Element {
  return (
    <section
      data-testid={`change-section-${title.toLowerCase().replace(/\s+/g, '-')}`}
      style={{
        padding: 12,
        border: '1px solid var(--border, #2c2a44)',
        borderRadius: 6,
        marginBottom: 12,
        background: 'var(--surface, #17152a)',
      }}
    >
      <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>{title}</h3>
      {empty === true ? (
        <p style={{ margin: 0, opacity: 0.6, fontSize: 13 }}>{emptyMessage ?? 'No data'}</p>
      ) : (
        children
      )}
    </section>
  )
}
