import { z } from 'zod'

export const NodeKindSchema = z.enum([
  'project',
  'subsystem',
  'file',
  'package',
  // reserved for future cycles:
  'service',
  'route',
  'middleware',
  'table',
  'test',
  'adr',
  'config',
  'external',
])
export type NodeKind = z.infer<typeof NodeKindSchema>

export const EdgeKindSchema = z.enum([
  'imports',
  'depends_on',
  'contains',
  // reserved:
  'calls',
  'reads_table',
  'writes_table',
  'exposes_route',
  'guarded_by',
  'validates_with',
  'rate_limited_by',
  'tests',
  'references',
  'owns',
])
export type EdgeKind = z.infer<typeof EdgeKindSchema>

export const EdgeCategorySchema = z.enum(['structural', 'domain', 'infra', 'external'])
export type EdgeCategory = z.infer<typeof EdgeCategorySchema>

export const EdgeSourceSchema = z.enum(['ast', 'config', 'yaml', 'manual', 'derived'])
export type EdgeSource = z.infer<typeof EdgeSourceSchema>

export const ConfidenceSchema = z.enum(['high', 'medium', 'low'])
export type Confidence = z.infer<typeof ConfidenceSchema>

export const SeveritySchema = z.enum(['low', 'medium', 'high'])
export type Severity = z.infer<typeof SeveritySchema>

export const LayerSchema = z.enum([
  'domain',
  'horizontal',
  'infra',
  'external',
  'shared',
  'unknown',
])
export type Layer = z.infer<typeof LayerSchema>

export const StatusSchema = z.enum([
  'shipped',
  'in-progress',
  'direction',
  'pointer-only',
  'unknown',
])
export type Status = z.infer<typeof StatusSchema>

export const EvidenceSourceKindSchema = z.enum(['ast', 'config', 'yaml', 'manual'])
export type EvidenceSourceKind = z.infer<typeof EvidenceSourceKindSchema>

export const EvidenceCouplingSchema = z.enum(['runtime', 'type-only', 'dynamic', 'reexport'])
export type EvidenceCoupling = z.infer<typeof EvidenceCouplingSchema>

export const FindingDomainSchema = z.enum([
  'architecture',
  'security',
  'docs',
  'tests',
  'drift',
  'rule',
])
export type FindingDomain = z.infer<typeof FindingDomainSchema>

export const FindingStatusSchema = z.enum(['open', 'accepted', 'ignored', 'resolved'])
export type FindingStatus = z.infer<typeof FindingStatusSchema>
