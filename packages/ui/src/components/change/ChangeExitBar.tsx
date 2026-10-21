import type { PrepareTaskInput, PrepareTaskOutput } from '@codearch/core'
import type React from 'react'
import { useState } from 'react'

export function renderMarkdown(input: PrepareTaskInput, output: PrepareTaskOutput): string {
  const lines: string[] = []

  lines.push(`# Prepared task: ${input.intent}`)
  lines.push('')
  lines.push(`**Mode:** ${input.mode}`)
  lines.push('')
  lines.push(`**Task ID:** \`${output.taskId}\` (pass to validate_diff)`)
  lines.push('')

  lines.push('## Target')
  lines.push(`**Summary:** ${output.summary}`)
  lines.push('')
  lines.push(
    `**Subsystems:** ${output.target.subsystems.length > 0 ? output.target.subsystems.join(', ') : '_none_'}`,
  )
  lines.push(
    `**Files:** ${output.target.files.length > 0 ? output.target.files.join(', ') : '_none_'}`,
  )
  lines.push('')

  lines.push('## Active Risks')
  if (output.risks.length === 0) {
    lines.push('_none_')
  } else {
    for (const risk of output.risks) {
      lines.push(`- **[${risk.severity}]** ${risk.title}`)
    }
  }
  lines.push('')

  lines.push('## Applicable Rules')
  if (output.rules.length === 0) {
    lines.push('_none_')
  } else {
    for (const rule of output.rules) {
      lines.push(`- **[${rule.severity}/${rule.mode}]** ${rule.title} (\`${rule.id}\`)`)
    }
  }
  lines.push('')

  lines.push('## Do Not Do')
  if (output.doNotDo.length === 0) {
    lines.push('_none_')
  } else {
    for (const item of output.doNotDo) {
      lines.push(`- ${item}`)
    }
  }
  lines.push('')

  lines.push('## Required Context')
  lines.push(
    `**Files:** ${output.requiredContext.files.length > 0 ? output.requiredContext.files.join(', ') : '_none_'}`,
  )
  lines.push(
    `**Schema tables:** ${output.requiredContext.schemaTables.length > 0 ? output.requiredContext.schemaTables.join(', ') : '_none_'}`,
  )
  lines.push(
    `**Related ADRs:** ${output.requiredContext.relatedAdrs.length > 0 ? output.requiredContext.relatedAdrs.join(', ') : '_none_'}`,
  )
  lines.push('')

  lines.push('## Recommendations / Tests')
  if (output.recommendations.length === 0 && output.tests.length === 0) {
    lines.push('_none_')
  } else {
    for (const rec of output.recommendations) {
      lines.push(`- ${rec}`)
    }
    for (const test of output.tests) {
      lines.push(`- ${test}`)
    }
  }

  return lines.join('\n')
}

type MdLabel = 'Copy as Markdown' | '✓ Copied as Markdown' | '✗ Copy failed'
type JsonLabel = 'Copy JSON' | '✓ Copied JSON' | '✗ Copy JSON failed'

interface ChangeExitBarProps {
  input: PrepareTaskInput
  output: PrepareTaskOutput
}

export function ChangeExitBar({ input, output }: ChangeExitBarProps): React.JSX.Element {
  const [mdLabel, setMdLabel] = useState<MdLabel>('Copy as Markdown')
  const [jsonLabel, setJsonLabel] = useState<JsonLabel>('Copy JSON')

  function copyMd(): void {
    const md = renderMarkdown(input, output)
    navigator.clipboard
      .writeText(md)
      .then(() => {
        setMdLabel('✓ Copied as Markdown')
        setTimeout(() => {
          setMdLabel('Copy as Markdown')
        }, 2000)
      })
      .catch(() => {
        setMdLabel('✗ Copy failed')
        setTimeout(() => {
          setMdLabel('Copy as Markdown')
        }, 2000)
      })
  }

  function copyJson(): void {
    const json = JSON.stringify({ input, output }, null, 2)
    navigator.clipboard
      .writeText(json)
      .then(() => {
        setJsonLabel('✓ Copied JSON')
        setTimeout(() => {
          setJsonLabel('Copy JSON')
        }, 2000)
      })
      .catch(() => {
        setJsonLabel('✗ Copy JSON failed')
        setTimeout(() => {
          setJsonLabel('Copy JSON')
        }, 2000)
      })
  }

  return (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        display: 'flex',
        gap: '0.5rem',
        padding: '0.75rem 1rem',
        background: 'var(--color-surface, #1e1e2e)',
        borderTop: '1px solid var(--color-border, #313244)',
      }}
    >
      <button type="button" onClick={copyMd}>
        {mdLabel}
      </button>
      <button type="button" onClick={copyJson}>
        {jsonLabel}
      </button>
    </div>
  )
}
