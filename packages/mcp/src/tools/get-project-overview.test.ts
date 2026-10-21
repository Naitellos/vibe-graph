// packages/mcp/src/tools/get-project-overview.test.ts

import { describe, expect, it } from 'vitest'
import { GetProjectOverviewTool } from './get-project-overview.js'

describe('GetProjectOverviewTool metadata', () => {
  it('has name + description + schemas', () => {
    expect(GetProjectOverviewTool.name).toBe('get_project_overview')
    expect(GetProjectOverviewTool.description).toBeTruthy()
    expect(GetProjectOverviewTool.inputSchema).toBeDefined()
    expect(GetProjectOverviewTool.outputSchema).toBeDefined()
  })
})
