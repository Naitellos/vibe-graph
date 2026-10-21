import type { PrepareTaskInput, PrepareTaskOutput } from '@codearch/core'
import type React from 'react'
import { Section } from './Section.js'

export interface PreparedTaskViewProps {
  input: PrepareTaskInput
  output: PrepareTaskOutput
}

const severityColor: Record<string, string> = {
  high: '#c0392b',
  medium: '#e67e22',
  low: '#27ae60',
}

export function PreparedTaskView({ input, output }: PreparedTaskViewProps): React.JSX.Element {
  const { target, summary, risks, rules, doNotDo, requiredContext, recommendations, tests } = output

  const recsAndTests = [...recommendations, ...tests]

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Target */}
      <Section title="Target">
        <div style={{ marginBottom: 6 }}>
          <span
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
              background: 'var(--color-chip, #2a2a2a)',
              marginBottom: 6,
            }}
          >
            {input.mode}
          </span>
        </div>
        {target.subsystems.length > 0 && (
          <ul style={{ margin: '0 0 6px', paddingLeft: 18, fontSize: 13 }}>
            {target.subsystems.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        )}
        <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>{summary}</p>
      </Section>

      {/* Active Risks */}
      <Section
        title="Active Risks"
        empty={risks.length === 0}
        emptyMessage="No active risks scoped to target."
      >
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
          {risks.map((r) => (
            <li key={r.title} style={{ marginBottom: 4 }}>
              <span
                style={{
                  fontWeight: 600,
                  color: severityColor[r.severity] ?? 'inherit',
                  marginRight: 6,
                }}
              >
                [{r.severity}]
              </span>
              {r.title}
            </li>
          ))}
        </ul>
      </Section>

      {/* Applicable Rules */}
      <Section
        title="Applicable Rules"
        empty={rules.length === 0}
        emptyMessage="No applicable rules for current paths."
      >
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
          {rules.map((r) => (
            <li key={r.id} style={{ marginBottom: 4 }}>
              <span
                style={{
                  fontWeight: 600,
                  color: severityColor[r.severity] ?? 'inherit',
                  marginRight: 6,
                }}
              >
                [{r.severity}]
              </span>
              {r.title}
              <span style={{ opacity: 0.6, marginLeft: 6, fontSize: 12 }}>({r.mode})</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* Do Not Do */}
      <Section
        title="Do Not Do"
        empty={doNotDo.length === 0}
        emptyMessage="No forbidding rules apply."
      >
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
          {doNotDo.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </Section>

      {/* Required Context */}
      <Section
        title="Required Context"
        empty={requiredContext.files.length === 0}
        emptyMessage="No additional context files surfaced."
      >
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
          {requiredContext.files.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </Section>

      {/* Recommendations / Tests */}
      <Section
        title="Recommendations / Tests"
        empty={recsAndTests.length === 0}
        emptyMessage="No recommendations or test hints."
      >
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
          {recsAndTests.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
