import { basename, relative } from 'node:path'
import type { Analyzer, AnalyzerContext, AnalyzerResult } from './types.js'

export const coreFilesAnalyzer: Analyzer = {
  id: 'core/files',
  description: 'emits one file Node per discovered source file',

  async run(ctx: AnalyzerContext): Promise<AnalyzerResult> {
    const nodes = ctx.files.map((absPath) => {
      const relPath = relative(ctx.projectRoot, absPath).replaceAll('\\', '/')
      return {
        id: `file:${relPath}`,
        kind: 'file' as const,
        title: basename(absPath),
        layer: 'unknown' as const,
        status: 'unknown' as const,
        tags: [] as string[],
        files: [] as string[],
        metadata: {} as Record<string, unknown>,
      }
    })

    return { nodes, edges: [], evidence: [] }
  },
}
