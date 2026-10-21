import {
  TaskError,
  type ValidateDiffInput,
  ValidateDiffInputSchema,
  type ValidateDiffOutput,
  ValidateDiffOutputSchema,
  validateDiff,
} from '@codearch/core'

import { ToolError } from '../errors.js'
import type { VibegraphTool } from '../server.js'

export const ValidateDiffTool: VibegraphTool<ValidateDiffInput, ValidateDiffOutput> = {
  name: 'validate_diff',
  description:
    'Verify a code change against the project baseline. Returns new/removed findings, ' +
    'task-scoped graph deltas, blast-radius changes, and rule-engine violations (newViolations) keyed by ruleId. ' +
    'Unrelated baseline drift is summarized in scope.omittedGraphDelta. Call AFTER editing code; ' +
    'pass the exact taskId from prepare_task to link sessions.',
  inputSchema: ValidateDiffInputSchema,
  outputSchema: ValidateDiffOutputSchema,
  formatText: formatValidateDiffText,
  handler: async (input, ctx) => {
    const snapshot = await ctx.reader.get()
    try {
      return await validateDiff(input, { snapshot, projectRoot: snapshot.raw.meta.projectRoot })
    } catch (err) {
      if (err instanceof TaskError) throw new ToolError(err.code, err.message, err.hint)
      throw err
    }
  },
}

const TEXT_ITEM_LIMIT = 10

/**
 * Keep the protocol text fallback useful without duplicating a potentially
 * large structured result. Modern clients consume structuredContent; older
 * clients still receive the verdict, counts, and the most important titles.
 */
export function formatValidateDiffText(result: ValidateDiffOutput): string {
  const lines = [
    result.taskId ? `taskId: ${result.taskId}` : undefined,
    `status: ${result.status}`,
    result.summary,
    `scope: ${result.scope.changedFiles.length} changed, ${result.scope.deletedFiles.length} deleted, ${result.scope.outOfScopeFiles.length} outside prepared task`,
    `findings: ${result.newViolations.length} new violation(s), ${result.newFindings.length} new finding(s), ${result.removedViolations.length + result.removedFindings.length} resolved`,
    `graph: ${result.graphDelta.newEdges.length} new edge(s), ${result.graphDelta.removedEdges.length} removed edge(s), ${result.graphDelta.newNodes.length} new node(s), ${result.graphDelta.removedNodes.length} removed node(s)`,
  ].filter((line): line is string => line !== undefined)

  appendFindingTitles(lines, 'new violations', result.newViolations)
  appendFindingTitles(lines, 'new findings', result.newFindings)
  if (result.scope.outOfScopeFiles.length > 0) {
    lines.push(`outside task: ${formatLimited(result.scope.outOfScopeFiles)}`)
  }
  if (result.recommendations.length > 0) {
    lines.push(`recommendations: ${formatLimited(result.recommendations)}`)
  }
  return lines.join('\n')
}

function appendFindingTitles(
  lines: string[],
  label: string,
  findings: ValidateDiffOutput['newFindings'],
): void {
  if (findings.length === 0) return
  lines.push(`${label}: ${formatLimited(findings.map((finding) => finding.title))}`)
}

function formatLimited(items: string[]): string {
  const visible = items.slice(0, TEXT_ITEM_LIMIT).map((item) => item.slice(0, 160))
  const remainder = items.length - visible.length
  return `${visible.join('; ')}${remainder > 0 ? `; …and ${remainder} more` : ''}`
}
