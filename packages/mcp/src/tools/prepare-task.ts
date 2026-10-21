import {
  type PrepareTaskInput,
  PrepareTaskInputSchema,
  type PrepareTaskOutput,
  PrepareTaskOutputSchema,
  TaskError,
  prepareTask,
  writeTaskSession,
} from '@codearch/core'
import { ToolError } from '../errors.js'
import type { VibegraphTool } from '../server.js'

export const PrepareTaskTool: VibegraphTool<PrepareTaskInput, PrepareTaskOutput> = {
  name: 'prepare_task',
  description:
    'Pre-flight context for an upcoming code change. Returns target subsystems, blast radius, ' +
    'active risks, applicable rules, doNotDo constraints, required context files, recommendations. ' +
    'Call BEFORE editing code. Persists a task session so subsequent validate_diff can compare.',
  inputSchema: PrepareTaskInputSchema,
  outputSchema: PrepareTaskOutputSchema,
  handler: async (input, ctx) => {
    const snapshot = await ctx.reader.get()
    let result: PrepareTaskOutput
    try {
      result = await prepareTask(input, { snapshot })
    } catch (err) {
      if (err instanceof TaskError) throw new ToolError(err.code, err.message, err.hint)
      throw err
    }
    try {
      await writeTaskSession(snapshot.raw.meta.projectRoot, {
        taskId: result.taskId,
        intent: input.intent,
        paths: input.paths,
        mode: input.mode,
        baselineSnapshotId: result.baselineSnapshotId,
        createdAt: result.createdAt,
      })
    } catch (err) {
      void err // best-effort — persistence failure does not degrade the tool response (Plan 1 deliberate deferral)
    }
    return result
  },
}
