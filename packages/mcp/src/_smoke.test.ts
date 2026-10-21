import * as core from '@codearch/core'
import { describe, expect, it } from 'vitest'

describe('@codearch/core public surface', () => {
  it('exports the scan pipeline', () => {
    expect(core.scan).toBeInstanceOf(Function)
  })

  it('exports helpers', () => {
    expect(core.computeBlastRadius).toBeInstanceOf(Function)
    expect(core.resolveTarget).toBeInstanceOf(Function)
    expect(core.buildContextPack).toBeInstanceOf(Function)
    expect(core.redactSecrets).toBeInstanceOf(Function)
    expect(core.estimateTokens).toBeInstanceOf(Function)
    expect(core.pickCriticalFiles).toBeInstanceOf(Function)
  })

  it('exports snapshot machinery', () => {
    expect(core.createSnapshotReader).toBeInstanceOf(Function)
    expect(core.writeSnapshotAtomic).toBeInstanceOf(Function)
    expect(core.buildLoadedSnapshot).toBeInstanceOf(Function)
    expect(core.SnapshotReaderError).toBeDefined()
  })

  it('exports error types', () => {
    expect(core.ScanError).toBeDefined()
    expect(core.SnapshotReaderError).toBeDefined()
  })

  it('exports analyzers and detectors', () => {
    expect(core.coreFilesAnalyzer.id).toBe('core/files')
    expect(core.corePackagesAnalyzer.id).toBe('core/packages')
    expect(core.coreTsImportsAnalyzer.id).toBe('core/ts-imports')
    expect(core.coreSubsystemsAnalyzer.id).toBe('core/subsystems')
    expect(core.coreCyclesDetector.id).toBe('core/cycles')
    expect(core.coreFanOutDetector.id).toBe('core/fan-out')
    expect(core.coreFanInDetector.id).toBe('core/fan-in')
    expect(core.coreOrphansDetector.id).toBe('core/orphans')
  })

  it('preserves existing schema and graph exports', () => {
    expect(core.NodeSchema).toBeDefined()
    expect(core.EdgeSchema).toBeDefined()
    expect(core.SnapshotSchema).toBeDefined()
    expect(core.DEPENDENCY_EDGE_KINDS).toBeDefined()
    expect(core.isDependencyEdge).toBeInstanceOf(Function)
  })

  it('exports CORE_PACKAGE_NAME constant', () => {
    expect(core.CORE_PACKAGE_NAME).toBe('@codearch/core')
  })
})
